// ABOUTME: Calendar — Month, Week and Agenda, with a detail sheet and the exec create/edit flow.
// ABOUTME: Agenda is the mobile default (DESIGN_BRIEF §5.2); markers are shapes so it survives monochrome.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import {
  CALENDAR_VIEWS,
  TYPE_MARKER,
  agendaDays,
  eventsByDay,
  isSameMonth,
  monthGrid,
  shiftMonth,
  weekDays,
} from '../../lib/calendar';
import type { CalendarEvent, CalendarView, EventType } from '../../lib/calendar';
import { useEvents } from '../../lib/phase3Data';
import { useIsExecLike } from '../../lib/session';
import { useServerNow } from '../../lib/serverTime';
import { formatDayLabel, formatTimeOnly, montrealDayKey } from '../../lib/time';
import EventDetail from './EventDetail';
import EventForm from './EventForm';

const VIEW_LABEL: Record<CalendarView, TranslationKey> = {
  month: 'calendar.month',
  week: 'calendar.week',
  agenda: 'calendar.agenda',
};

export const TYPE_TONE: Record<EventType, string> = {
  competition: 'text-primary',
  practice: 'text-success',
  deadline: 'text-danger',
  social: 'text-shelf',
  admin: 'text-muted',
};

export default function Calendar() {
  const t = useT();
  const { now } = useServerNow(60_000);
  const isExecLike = useIsExecLike();
  const { events, loading, reload } = useEvents();

  // Agenda first: this is a phone app, and a month grid on a 390px screen is a
  // wayfinding tool rather than a way to read what is happening.
  const [view, setView] = useState<CalendarView>('agenda');
  const [anchor, setAnchor] = useState(() => montrealDayKey(now));
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);

  const byDay = eventsByDay(events);
  const today = montrealDayKey(now);

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.calendar')}</h1>
        {isExecLike && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="min-h-11 rounded-sm border border-primary px-3 text-body font-semibold text-primary"
          >
            {t('calendar.new')}
          </button>
        )}
      </header>

      <div role="tablist" aria-label={t('nav.calendar')} className="flex gap-1.5">
        {CALENDAR_VIEWS.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={[
              'min-h-11 flex-1 rounded-sm px-3 text-body font-semibold',
              view === option ? 'bg-primary text-cream' : 'border border-muted/30 bg-white text-ink',
            ].join(' ')}
          >
            {t(VIEW_LABEL[option])}
          </button>
        ))}
      </div>

      <Legend />

      {loading && events.length === 0 && (
        <div role="status" aria-label={t('nav.calendar')} className="h-48 rounded-md bg-muted/15" />
      )}

      {view === 'agenda' && (
        <Agenda days={agendaDays(events, now)} onSelect={setSelected} />
      )}

      {view === 'month' && (
        <Month
          anchor={anchor}
          today={today}
          byDay={byDay}
          onShift={(delta) => setAnchor(shiftMonth(anchor, delta))}
          onSelect={setSelected}
        />
      )}

      {view === 'week' && (
        <Week anchor={anchor} today={today} byDay={byDay} onSelect={setSelected} />
      )}

      {selected && (
        <EventDetail
          event={selected}
          onClose={() => setSelected(null)}
          onEdit={isExecLike ? () => { setEditing(selected); setSelected(null); } : undefined}
          onChanged={reload}
        />
      )}

      {editing && (
        <EventForm
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

/** Shape plus colour, never colour alone — DESIGN_BRIEF §5.2. */
function Legend() {
  const t = useT();
  const labels: Record<EventType, TranslationKey> = {
    competition: 'calendar.typeCompetition',
    practice: 'calendar.typePractice',
    deadline: 'calendar.typeDeadline',
    social: 'calendar.typeSocial',
    admin: 'calendar.typeAdmin',
  };

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {(Object.keys(labels) as EventType[]).map((type) => (
        <li key={type} className="flex items-center gap-1 text-meta text-muted">
          <span aria-hidden="true" className={TYPE_TONE[type]}>{TYPE_MARKER[type]}</span>
          {t(labels[type])}
        </li>
      ))}
    </ul>
  );
}

function Agenda({
  days,
  onSelect,
}: {
  days: { key: string; events: CalendarEvent[] }[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const t = useT();
  const { locale } = useLocale();

  if (days.length === 0) return <p className="text-body text-muted">{t('calendar.none')}</p>;

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.key}>
          <h2 className="pb-1 text-meta font-bold uppercase tracking-widest text-primary">
            {formatDayLabel(day.key, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>
          <ul className="flex flex-col gap-2">
            {day.events.map((event) => (
              <li key={`${day.key}-${event.id}`}>
                <EventRow event={event} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventRow({ event, onSelect }: { event: CalendarEvent; onSelect: (event: CalendarEvent) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const title = (locale.startsWith('fr') && event.title_fr) || event.title_en;

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={[
        'flex w-full items-start gap-3 rounded-sm border bg-white px-3 py-2.5 text-left',
        // A deadline is a point, so it reads as a rule rather than a block.
        event.type === 'deadline' ? 'border-danger/40 border-l-4 border-l-danger' : 'border-muted/20',
      ].join(' ')}
    >
      <span aria-hidden="true" className={['mt-0.5 flex-none', TYPE_TONE[event.type]].join(' ')}>
        {TYPE_MARKER[event.type]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-meta text-muted">
          {event.all_day ? t('calendar.allDay') : formatTimeOnly(event.starts_at, locale)}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </span>
    </button>
  );
}

function Month({
  anchor,
  today,
  byDay,
  onShift,
  onSelect,
}: {
  anchor: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onShift: (delta: number) => void;
  onSelect: (event: CalendarEvent) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [openDay, setOpenDay] = useState<string | null>(null);

  const weekdayNames = weekDays(anchor).map((key) =>
    formatDayLabel(key, locale, { weekday: 'narrow', month: undefined, day: undefined }),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onShift(-1)} aria-label={t('calendar.previous')}
          className="min-h-11 min-w-11 rounded-sm border border-muted/30 text-body font-bold text-primary">‹</button>
        <span className="font-unbounded text-body font-bold text-primary">
          {formatDayLabel(anchor, locale, { weekday: undefined, month: 'long', year: 'numeric', day: undefined })}
        </span>
        <button type="button" onClick={() => onShift(1)} aria-label={t('calendar.next')}
          className="min-h-11 min-w-11 rounded-sm border border-muted/30 text-body font-bold text-primary">›</button>
      </div>

      <div aria-hidden="true" className="grid grid-cols-7 gap-1">
        {weekdayNames.map((name, i) => (
          <span key={i} className="text-center text-meta font-bold uppercase text-muted">{name}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthGrid(anchor).flat().map((key) => {
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = isSameMonth(key, anchor);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpenDay(dayEvents.length > 0 ? key : null)}
              aria-label={`${formatDayLabel(key, locale)}${dayEvents.length ? `, ${dayEvents.length}` : ''}`}
              className={[
                'flex min-h-11 flex-col items-center gap-0.5 rounded-xs border px-0.5 py-1',
                key === today ? 'border-primary bg-primary/5' : 'border-transparent',
                inMonth ? '' : 'opacity-40',
              ].join(' ')}
            >
              <span className="text-meta tabular-nums text-ink">{Number(key.slice(-2))}</span>
              <span className="flex flex-wrap justify-center gap-px leading-none">
                {dayEvents.slice(0, 3).map((event, i) => (
                  <span key={i} aria-hidden="true" className={['text-meta', TYPE_TONE[event.type]].join(' ')}>
                    {TYPE_MARKER[event.type]}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {openDay && (
        <section className="rounded-md border border-muted/20 bg-white p-3">
          <h3 className="pb-1 text-meta font-bold uppercase tracking-widest text-primary">
            {formatDayLabel(openDay, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          <ul className="flex flex-col gap-2">
            {(byDay.get(openDay) ?? []).map((event) => (
              <li key={event.id}><EventRow event={event} onSelect={onSelect} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Week({
  anchor,
  today,
  byDay,
  onSelect,
}: {
  anchor: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onSelect: (event: CalendarEvent) => void;
}) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <div className="flex flex-col gap-3">
      {weekDays(anchor).map((key) => (
        <section key={key}>
          <h2
            className={[
              'pb-1 text-meta font-bold uppercase tracking-widest',
              key === today ? 'text-primary' : 'text-muted',
            ].join(' ')}
          >
            {formatDayLabel(key, locale, { weekday: 'long', month: 'short', day: 'numeric' })}
          </h2>
          {(byDay.get(key) ?? []).length === 0 ? (
            <p className="text-meta text-muted">{t('calendar.dayEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(byDay.get(key) ?? []).map((event) => (
                <li key={event.id}><EventRow event={event} onSelect={onSelect} /></li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
