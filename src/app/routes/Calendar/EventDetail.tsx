// ABOUTME: Event detail sheet — time, location, description, RSVP, and the .ics download.
// ABOUTME: A sheet rather than a route, so Back always means "leave the calendar".
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import { toIcs } from '../../lib/calendar';
import type { CalendarEvent } from '../../lib/calendar';
import { deleteEvent, setRsvp } from '../../lib/phase3Data';
import { useIsExecLike, useSession } from '../../lib/session';
import { formatDateTime, formatTimeOnly } from '../../lib/time';

const RSVP_OPTIONS = ['going', 'maybe', 'declined'] as const;

export default function EventDetail({
  event,
  onClose,
  onEdit,
  onChanged,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit?: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { session } = useSession();
  const isExecLike = useIsExecLike();

  const [rsvp, setLocalRsvp] = useState<(typeof RSVP_OPTIONS)[number] | null>(null);
  const [busy, setBusy] = useState(false);

  const title = (locale.startsWith('fr') && event.title_fr) || event.title_en;

  async function choose(status: (typeof RSVP_OPTIONS)[number]) {
    if (!session) return;
    setBusy(true);
    setLocalRsvp(status);
    await setRsvp(event.id, session.user.id, status);
    setBusy(false);
  }

  /* The .ics is built and handed over as a blob rather than fetched from an
     endpoint: the file is a dozen lines derived from data already on screen, and
     a round trip to generate it would fail exactly when a delegate is offline
     and most wants their schedule. */
  function download() {
    const blob = new Blob([toIcs(event, title)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'event'}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    setBusy(true);
    await deleteEvent(event.id);
    setBusy(false);
    onChanged();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 pb-safe-b"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-cream p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-unbounded text-lead font-bold text-primary">{title}</h2>

        <dl className="mt-3 flex flex-col gap-1.5 text-body">
          <div className="flex gap-2">
            <dt className="text-muted">{t('calendar.when')}</dt>
            <dd className="font-semibold text-ink">
              {event.all_day
                ? t('calendar.allDay')
                : `${formatDateTime(event.starts_at, locale)}${
                    event.ends_at ? ` – ${formatTimeOnly(event.ends_at, locale)}` : ''
                  }`}
            </dd>
          </div>

          {event.location && (
            <div className="flex gap-2">
              <dt className="text-muted">{t('calendar.where')}</dt>
              <dd className="font-semibold text-ink">
                {event.location_url ? (
                  <a href={event.location_url} target="_blank" rel="noopener" className="link-sweep underline">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </dd>
            </div>
          )}
        </dl>

        {event.description && (
          <p className="mt-3 text-body leading-relaxed text-ink">{event.description}</p>
        )}

        <fieldset className="mt-4">
          <legend className="text-meta font-bold uppercase tracking-widest text-muted">
            {t('calendar.rsvp')}
          </legend>
          <div className="mt-1 flex gap-1.5">
            {RSVP_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={busy}
                aria-pressed={rsvp === option}
                onClick={() => choose(option)}
                className={[
                  'min-h-11 flex-1 rounded-sm px-2 text-body font-semibold',
                  rsvp === option ? 'bg-primary text-cream' : 'border border-muted/30 bg-white text-ink',
                ].join(' ')}
              >
                {t(`calendar.rsvp.${option}` as const)}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={download}
          className="mt-4 min-h-11 w-full rounded-sm bg-primary px-4 text-body font-semibold text-cream"
        >
          {t('calendar.addToCalendar')}
        </button>

        {isExecLike && (
          <div className="mt-2 flex gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 flex-1 rounded-sm border border-primary px-3 text-body font-semibold text-primary"
              >
                {t('common.edit')}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="min-h-11 flex-1 rounded-sm border border-danger px-3 text-body font-semibold text-danger"
            >
              {t('common.delete')}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full rounded-sm border border-muted/30 px-4 text-body font-semibold text-ink"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
