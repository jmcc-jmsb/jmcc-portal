// ABOUTME: Calendar maths — month grids, week strips, and agenda grouping, all in Montreal days.
// ABOUTME: Pure and date-key based, so a device in another timezone draws the same grid.
import { addDaysToKey, daysBetweenKeys, montrealDayKey, weekdayIndex } from './time';

export const EVENT_TYPES = ['competition', 'practice', 'deadline', 'social', 'admin'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type CalendarEvent = {
  id: string;
  title_en: string;
  title_fr: string | null;
  description: string | null;
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  location_url: string | null;
  competition_id: string | null;
};

export const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/**
 * Six weeks of day keys, Monday first.
 *
 * Always six rows rather than the four-to-six a month actually spans, so the
 * grid does not change height as you page through the year — a calendar that
 * reflows on every tap is unusable on a phone.
 */
export function monthGrid(anchorKey: string): string[][] {
  const first = `${anchorKey.slice(0, 7)}-01`;
  const start = addDaysToKey(first, -weekdayIndex(first));

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDaysToKey(start, w * 7 + d)));
  }
  return weeks;
}

/** The seven day keys of the week containing `anchorKey`, Monday first. */
export function weekDays(anchorKey: string): string[] {
  const start = addDaysToKey(anchorKey, -weekdayIndex(anchorKey));
  return Array.from({ length: 7 }, (_, d) => addDaysToKey(start, d));
}

export function isSameMonth(key: string, anchorKey: string): boolean {
  return key.slice(0, 7) === anchorKey.slice(0, 7);
}

export function shiftMonth(anchorKey: string, delta: number): string {
  const [y, m] = anchorKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * Events keyed by the Montreal day they start on.
 *
 * Multi-day events are indexed on every day they span, so a three-day
 * competition appears on all three rather than only on the day it opened.
 */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const startKey = montrealDayKey(event.starts_at);
    const endKey = event.ends_at ? montrealDayKey(event.ends_at) : startKey;
    const span = Math.max(0, daysBetweenKeys(startKey, endKey));

    for (let d = 0; d <= span; d++) {
      const key = addDaysToKey(startKey, d);
      const held = map.get(key);
      if (held) held.push(event);
      else map.set(key, [event]);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      // All-day events lead the day; a deadline is a point and sorts by its time
      // like anything else.
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      return Date.parse(a.starts_at) - Date.parse(b.starts_at);
    });
  }
  return map;
}

/**
 * The agenda: upcoming days that actually have something on them.
 *
 * Empty days are omitted rather than rendered as blanks — the agenda is the
 * mobile default (DESIGN_BRIEF §5.2) and scrolling past six empty Tuesdays to
 * reach the next event is how a calendar stops being opened.
 */
export function agendaDays(
  events: CalendarEvent[],
  now: number,
  horizonDays = 60,
): { key: string; events: CalendarEvent[] }[] {
  const byDay = eventsByDay(events);
  const today = montrealDayKey(now);

  return [...byDay.entries()]
    .filter(([key]) => {
      const offset = daysBetweenKeys(today, key);
      return offset >= 0 && offset <= horizonDays;
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => ({ key, events: list }));
}

/**
 * A shape per event type, so the calendar is legible in monochrome.
 *
 * DESIGN_BRIEF §5.2 is explicit that colour alone is not enough. These are the
 * marker glyphs; the colour token is applied alongside them.
 */
export const TYPE_MARKER: Record<EventType, string> = {
  competition: '◆',
  practice: '●',
  deadline: '▬',
  social: '▲',
  admin: '■',
};

/** Deadlines render as a rule across the day rather than a block — they are points, not durations. */
export function isPoint(event: CalendarEvent): boolean {
  return event.type === 'deadline' || !event.ends_at;
}

/**
 * A single event as an .ics file body.
 *
 * DESIGN_BRIEF §5.2 asks for "Add to my calendar". Hand-built rather than
 * pulling a library: the spec surface being used here is six lines, and the
 * escaping rules are the only part that needs care.
 */
export function toIcs(event: CalendarEvent, title: string): string {
  const stamp = (iso: string) => `${iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
  const end = event.ends_at ?? new Date(Date.parse(event.starts_at) + 3600_000).toISOString();

  const escape = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JMCC//Delegate Portal//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@portal.jmccjmsb.ca`,
    `DTSTAMP:${stamp(new Date(Date.parse(event.starts_at)).toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(title)}`,
    event.location ? `LOCATION:${escape(event.location)}` : null,
    event.description ? `DESCRIPTION:${escape(event.description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
