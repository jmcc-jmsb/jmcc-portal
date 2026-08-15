// ABOUTME: Executive event create/edit — title, type, timing, location, audience.
// ABOUTME: Times are entered as Montreal wall time regardless of where the exec is sitting.
import { useState } from 'react';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { EVENT_TYPES } from '../../lib/calendar';
import type { CalendarEvent, EventType } from '../../lib/calendar';
import { saveEvent } from '../../lib/phase3Data';
import { isoToMontrealLocal, montrealLocalToIso } from '../../lib/time';

/* An explicit map rather than a built key. A template literal over a runtime
   string is not a TranslationKey, so the type system cannot tell whether the
   key exists — which is exactly the check that keeps fr.json in step. */
const TYPE_LABEL: Record<EventType, TranslationKey> = {
  competition: 'calendar.typeCompetition',
  practice: 'calendar.typePractice',
  deadline: 'calendar.typeDeadline',
  social: 'calendar.typeSocial',
  admin: 'calendar.typeAdmin',
};

export default function EventForm({
  event,
  onClose,
  onSaved,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();

  const [titleEn, setTitleEn] = useState(event?.title_en ?? '');
  const [titleFr, setTitleFr] = useState(event?.title_fr ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? 'practice');
  const [starts, setStarts] = useState(event ? isoToMontrealLocal(event.starts_at) : '');
  const [ends, setEnds] = useState(event?.ends_at ? isoToMontrealLocal(event.ends_at) : '');
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [locationUrl, setLocationUrl] = useState(event?.location_url ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [audience, setAudience] = useState<'everyone' | 'competition' | 'team' | 'role'>('everyone');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A deadline is a point, not a duration — the schema refuses an end on one, so
  // the form stops offering the field rather than letting the save fail.
  const takesEnd = type !== 'deadline';

  async function save() {
    if (!titleEn.trim() || !starts) return;
    setBusy(true);
    setError(null);

    const message = await saveEvent({
      id: event?.id,
      title_en: titleEn.trim(),
      title_fr: titleFr.trim() || null,
      description: description.trim() || null,
      type,
      starts_at: montrealLocalToIso(starts),
      ends_at: takesEnd && ends ? montrealLocalToIso(ends) : null,
      all_day: allDay,
      location: location.trim() || null,
      location_url: locationUrl.trim() || null,
      audience_type: audience,
    } as Partial<CalendarEvent>);

    setBusy(false);
    if (message) setError(message);
    else onSaved();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={event ? t('calendar.edit') : t('calendar.new')}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 pb-safe-b"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-cream p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-unbounded text-lead font-bold text-primary">
          {event ? t('calendar.edit') : t('calendar.new')}
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          <Field label={t('calendar.titleEn')}>
            <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
          </Field>

          {/* Both languages on the same form. CLAUDE.md requires EN and FR
              together, and an event created in one language only is how the
              French calendar quietly becomes half English. */}
          <Field label={t('calendar.titleFr')}>
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
          </Field>

          <Field label={t('calendar.type')}>
            <select value={type} onChange={(e) => setType(e.target.value as EventType)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body">
              {EVENT_TYPES.map((option) => (
                <option key={option} value={option}>{t(TYPE_LABEL[option])}</option>
              ))}
            </select>
          </Field>

          <Field label={t('calendar.starts')}>
            <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
          </Field>

          {takesEnd && (
            <Field label={t('calendar.ends')}>
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)}
                className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
            </Field>
          )}

          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            {t('calendar.allDay')}
          </label>

          <Field label={t('calendar.where')}>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
          </Field>

          <Field label={t('calendar.mapLink')}>
            <input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} inputMode="url"
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body" />
          </Field>

          <Field label={t('calendar.description')}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full rounded-sm border border-muted/30 px-3 py-2 text-body" />
          </Field>

          <Field label={t('calendar.audience')}>
            <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}
              className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body">
              <option value="everyone">{t('calendar.audienceEveryone')}</option>
              <option value="competition">{t('calendar.audienceCompetition')}</option>
              <option value="team">{t('calendar.audienceTeam')}</option>
              <option value="role">{t('calendar.audienceRole')}</option>
            </select>
          </Field>

          {error && <p role="alert" className="field-error text-body text-danger">{error}</p>}

          <button type="button" disabled={busy || !titleEn.trim() || !starts} onClick={save}
            className="min-h-11 rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50">
            {busy ? t('calendar.saving') : t('common.save')}
          </button>
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-sm border border-muted/30 px-4 text-body font-semibold text-ink">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-meta font-bold uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}
