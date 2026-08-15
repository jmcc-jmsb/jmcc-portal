// ABOUTME: Unit tests for Phase 3 logic — task buckets, calendar grids, cabinet fill states.
// ABOUTME: The day-boundary cases are the point: "today" is a Montreal day, not a device day.
import { describe, expect, it } from 'vitest';
import { groupOf, groupTasks, outstandingCount, canDelete } from './tasks';
import type { Task } from './tasks';
import { agendaDays, eventsByDay, isSameMonth, monthGrid, shiftMonth, toIcs, weekDays } from './calendar';
import type { CalendarEvent } from './calendar';
import { byCategory, fillState, nextPiece, progress, resumeLine } from './cabinet';
import type { CabinetPiece } from './cabinet';
import { montrealDayKey, daysBetweenKeys, weekdayIndex } from './time';

// 2027-01-16 is a Saturday. 13:00Z is 08:00 in Montreal (EST).
const NOW = Date.parse('2027-01-16T13:00:00.000Z');

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    owner_id: 'u1',
    title: 'A task',
    description: null,
    due_at: null,
    source: 'self',
    linked_type: null,
    linked_id: null,
    is_system: false,
    completed_at: null,
    ...overrides,
  };
}

describe('task grouping', () => {
  it('is today for anything due on today\'s Montreal date, even hours in the past', () => {
    // Due 9am Montreal, it is now 8am. Also true at 11pm: a task due earlier
    // today has not slipped to Overdue until the date turns over.
    expect(groupOf(task({ due_at: '2027-01-16T14:00:00Z' }), NOW)).toBe('today');
    expect(groupOf(task({ due_at: '2027-01-16T05:00:00Z' }), NOW)).toBe('today');
  });

  it('uses the Montreal date, not the device date', () => {
    // 2027-01-17T02:00Z is still 9pm on the 16th in Montreal — today, not tomorrow.
    expect(groupOf(task({ due_at: '2027-01-17T02:00:00Z' }), NOW)).toBe('today');
    // 2027-01-17T06:00Z is 1am on the 17th in Montreal — tomorrow.
    expect(groupOf(task({ due_at: '2027-01-17T06:00:00Z' }), NOW)).toBe('week');
  });

  it('is overdue only once the date has turned over', () => {
    expect(groupOf(task({ due_at: '2027-01-15T23:00:00Z' }), NOW)).toBe('overdue');
  });

  it('puts an undated task in Later, never in Today', () => {
    // A Today list that fills with undated intentions stops being trusted.
    expect(groupOf(task({ due_at: null }), NOW)).toBe('later');
  });

  it('sends anything completed to Done regardless of its due date', () => {
    const overdueButDone = task({ due_at: '2020-01-01T00:00:00Z', completed_at: '2027-01-15T00:00:00Z' });
    expect(groupOf(overdueButDone, NOW)).toBe('done');
  });

  it('splits this week from later at seven days', () => {
    expect(groupOf(task({ due_at: '2027-01-23T14:00:00Z' }), NOW)).toBe('week');
    expect(groupOf(task({ due_at: '2027-01-24T14:00:00Z' }), NOW)).toBe('later');
  });

  it('sorts each group by due date, with undated tasks last', () => {
    const grouped = groupTasks(
      [
        task({ id: 'none', due_at: null }),
        task({ id: 'late', due_at: '2027-03-01T00:00:00Z' }),
        task({ id: 'soon', due_at: '2027-02-01T00:00:00Z' }),
      ],
      NOW,
    );
    expect(grouped.later.map((t) => t.id)).toEqual(['soon', 'late', 'none']);
  });

  it('sorts Done by most recently finished', () => {
    const grouped = groupTasks(
      [
        task({ id: 'old', completed_at: '2027-01-01T00:00:00Z' }),
        task({ id: 'new', completed_at: '2027-01-15T00:00:00Z' }),
      ],
      NOW,
    );
    expect(grouped.done.map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('counts only what is outstanding', () => {
    expect(outstandingCount([task(), task({ completed_at: '2027-01-01T00:00:00Z' })])).toBe(1);
  });

  it('refuses to offer delete on a system task', () => {
    // The policy in 0005 enforces it; this stops the UI offering a button that
    // would come back refused.
    expect(canDelete(task({ is_system: true }))).toBe(false);
    expect(canDelete(task({ is_system: false }))).toBe(true);
  });
});

describe('month grid', () => {
  it('is always six rows of seven, so the grid does not reflow between months', () => {
    for (const month of ['2027-01-01', '2027-02-01', '2026-02-01']) {
      const grid = monthGrid(month);
      expect(grid).toHaveLength(6);
      for (const week of grid) expect(week).toHaveLength(7);
    }
  });

  it('starts on the Monday on or before the first of the month', () => {
    // 2027-01-01 is a Friday, so the grid opens on Monday 2026-12-28.
    expect(monthGrid('2027-01-01')[0][0]).toBe('2026-12-28');
    expect(weekdayIndex('2026-12-28')).toBe(0);
  });

  it('contains every day of the month exactly once', () => {
    const days = monthGrid('2027-02-01').flat().filter((k) => isSameMonth(k, '2027-02-01'));
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
  });

  it('shifts across a year boundary in both directions', () => {
    expect(shiftMonth('2027-01-01', -1)).toBe('2026-12-01');
    expect(shiftMonth('2027-12-01', 1)).toBe('2028-01-01');
    expect(shiftMonth('2027-01-01', 13)).toBe('2028-02-01');
  });

  it('gives a Monday-first week strip', () => {
    const week = weekDays('2027-01-16'); // a Saturday
    expect(week[0]).toBe('2027-01-11');
    expect(week).toHaveLength(7);
    expect(week[6]).toBe('2027-01-17');
  });
});

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    title_en: 'Practice',
    title_fr: null,
    description: null,
    type: 'practice',
    starts_at: '2027-01-16T18:00:00Z',
    ends_at: null,
    all_day: false,
    location: null,
    location_url: null,
    competition_id: null,
    ...overrides,
  };
}

describe('events by day', () => {
  it('indexes a multi-day event on every day it spans', () => {
    // A three-day competition must appear on all three, not only on day one.
    const map = eventsByDay([
      event({ id: 'comp', type: 'competition', starts_at: '2027-01-16T13:00:00Z', ends_at: '2027-01-18T22:00:00Z' }),
    ]);
    expect([...map.keys()].sort()).toEqual(['2027-01-16', '2027-01-17', '2027-01-18']);
  });

  it('files an event on the Montreal day it starts, not the UTC one', () => {
    // 01:00Z on the 17th is 8pm on the 16th in Montreal.
    const map = eventsByDay([event({ starts_at: '2027-01-17T01:00:00Z' })]);
    expect([...map.keys()]).toEqual(['2027-01-16']);
  });

  it('puts all-day events at the top of their day', () => {
    const map = eventsByDay([
      event({ id: 'timed', starts_at: '2027-01-16T14:00:00Z' }),
      event({ id: 'allday', starts_at: '2027-01-16T05:00:00Z', all_day: true }),
    ]);
    expect(map.get('2027-01-16')!.map((e) => e.id)).toEqual(['allday', 'timed']);
  });

  it('omits empty days from the agenda', () => {
    const days = agendaDays([event({ starts_at: '2027-01-20T18:00:00Z' })], NOW);
    expect(days.map((d) => d.key)).toEqual(['2027-01-20']);
  });

  it('drops anything before today or past the horizon', () => {
    const days = agendaDays(
      [
        event({ id: 'past', starts_at: '2027-01-01T18:00:00Z' }),
        event({ id: 'soon', starts_at: '2027-01-20T18:00:00Z' }),
        event({ id: 'far', starts_at: '2027-06-01T18:00:00Z' }),
      ],
      NOW,
    );
    expect(days.map((d) => d.key)).toEqual(['2027-01-20']);
  });
});

describe('ics export', () => {
  it('escapes the characters that would otherwise break the file', () => {
    const ics = toIcs(
      event({ location: 'Room 3, Building B; rear', description: 'Bring a laptop\nand a pen' }),
      'Practice, with the team',
    );
    expect(ics).toContain('SUMMARY:Practice\\, with the team');
    expect(ics).toContain('LOCATION:Room 3\\, Building B\\; rear');
    expect(ics).toContain('DESCRIPTION:Bring a laptop\\nand a pen');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('gives an event with no end a one-hour default rather than an invalid file', () => {
    expect(toIcs(event({ starts_at: '2027-01-16T18:00:00.000Z', ends_at: null }), 'x'))
      .toContain('DTEND:20270116T190000Z');
  });
});

function piece(overrides: Partial<CabinetPiece> = {}): CabinetPiece {
  return {
    piece_id: 'p1',
    code: 'ms_first_submission',
    name_en: 'First case submitted',
    name_fr: 'Premier cas soumis',
    category: 'milestone',
    unlock_hint_en: 'Submit your first case',
    unlock_hint_fr: 'Soumettre votre premier cas',
    is_secret: false,
    is_repeatable: false,
    tone: 'sand',
    shape: 'diamond',
    sort_order: 1,
    earned_count: 0,
    first_awarded_at: null,
    last_awarded_at: null,
    ...overrides,
  };
}

describe('cabinet', () => {
  it('reports the three fill states', () => {
    expect(fillState([piece(), piece()])).toBe('empty');
    expect(fillState([piece({ earned_count: 1 }), piece()])).toBe('partial');
    expect(fillState([piece({ earned_count: 1 }), piece({ earned_count: 2 })])).toBe('full');
  });

  it('counts a repeatable piece once toward the headline, however many times it is held', () => {
    // This is the whole point of is_repeatable: two firsts at two competitions
    // are one filled plinth, so the denominator never grows with the calendar.
    const { earned, total } = progress([piece({ earned_count: 3, is_repeatable: true }), piece()]);
    expect(earned).toBe(1);
    expect(total).toBe(2);
  });

  it('groups by category and drops shelves with nothing on them', () => {
    const shelves = byCategory([piece({ category: 'milestone' }), piece({ category: 'season' })]);
    expect(shelves.map((s) => s.category)).toEqual(['season', 'milestone']);
  });

  it('suggests the lowest unearned milestone for the empty state', () => {
    const suggestion = nextPiece(
      [
        piece({ code: 'ms_late', sort_order: 9 }),
        piece({ code: 'ms_early', sort_order: 1 }),
        piece({ code: 'earned', sort_order: 0, earned_count: 1 }),
      ],
      'en',
    );
    expect(suggestion?.code).toBe('ms_early');
  });

  it('never suggests an unlabelled silhouette — it would be no use as a hint', () => {
    const suggestion = nextPiece(
      [piece({ code: 'secret', is_secret: true, unlock_hint_en: null, category: 'commendation' })],
      'en',
    );
    expect(suggestion).toBeNull();
  });

  it('writes a résumé line a delegate can paste into a document', () => {
    expect(
      resumeLine(piece({ name_en: 'First place' }), 'en', {
        competition: 'JDCC 2027',
        awardedAt: '2027-01-20T13:00:00Z',
      }),
    ).toBe('First place — JDCC 2027 (January 2027)');
  });

  it('degrades to just the name when there is no competition or date', () => {
    expect(resumeLine(piece({ name_en: 'Wolf pin' }), 'en', {})).toBe('Wolf pin');
  });
});

describe('montreal day keys', () => {
  it('rolls over at Montreal midnight, not UTC midnight', () => {
    expect(montrealDayKey('2027-01-17T04:59:00Z')).toBe('2027-01-16');
    expect(montrealDayKey('2027-01-17T05:01:00Z')).toBe('2027-01-17');
  });

  it('counts calendar days across a DST boundary', () => {
    // 2027-03-14 is spring forward: that week is 167 hours, still 7 days.
    expect(daysBetweenKeys('2027-03-11', '2027-03-18')).toBe(7);
  });
});
