// ABOUTME: The executive drop-and-schedule form — upload, timings, audience, coach visibility, save.
// ABOUTME: One uninterrupted form, not a wizard (DESIGN_BRIEF §5.7): this is how every case enters the system.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { formatDuration, montrealLocalToIso, workWindowMs } from '../../lib/caseState';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

type Competition = { id: string; name_en: string; name_fr: string };
type Team = { id: string; name: string; competition_id: string };

export default function ScheduleForm({ onCreated }: { onCreated: () => void }) {
  const t = useT();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [competitionId, setCompetitionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverableFormat, setDeliverableFormat] = useState('');
  const [releaseLocal, setReleaseLocal] = useState('');
  const [closesLocal, setClosesLocal] = useState('');
  const [audienceType, setAudienceType] = useState<'competition' | 'discipline' | 'teams'>('competition');
  const [audienceTeamIds, setAudienceTeamIds] = useState<string[]>([]);
  const [coachVisibility, setCoachVisibility] = useState<'same' | 'early' | 'after'>('same');
  const [coachLocal, setCoachLocal] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    // Read directly: competitions_read and teams_read already scope these, and
    // an endpoint here would add a hop without adding a decision.
    void supabase
      .from('competitions')
      .select('id, name_en, name_fr')
      .order('season_year', { ascending: false })
      .then(({ data }) => setCompetitions((data as Competition[] | null) ?? []));
    void supabase
      .from('teams')
      .select('id, name, competition_id')
      .then(({ data }) => setTeams((data as Team[] | null) ?? []));
  }, []);

  /* The live computed label DESIGN_BRIEF §5.7 step 3 asks for. A mis-set clock
     should be obvious while typing, not after saving — so this renders on every
     keystroke and says plainly when the window is backwards. */
  const windowMs = workWindowMs(montrealLocalToIso(releaseLocal), montrealLocalToIso(closesLocal));
  const windowLabel = Number.isNaN(windowMs)
    ? null
    : windowMs <= 0
      ? t('schedule.windowInvalid')
      : t('schedule.window', {
          duration: formatDuration(windowMs, {
            d: t('time.d'),
            h: t('time.h'),
            m: t('time.m'),
            s: t('time.s'),
          }),
        });

  async function save() {
    setBusy(true);
    setError(null);

    try {
      const created = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          competitionId,
          title,
          description: description || null,
          deliverableFormat: deliverableFormat || null,
          releaseAt: montrealLocalToIso(releaseLocal),
          // The schema requires opens >= release; the form does not ask twice,
          // because in every case JMCC runs, uploads open when the case drops.
          submissionOpensAt: montrealLocalToIso(releaseLocal),
          submissionClosesAt: montrealLocalToIso(closesLocal),
          coachVisibility,
          coachReleaseAt: coachVisibility === 'early' ? montrealLocalToIso(coachLocal) : null,
          audienceType,
          audienceTeamIds: audienceType === 'teams' ? audienceTeamIds : null,
          status: 'scheduled',
        }),
      });

      const body = (await created.json().catch(() => ({}))) as {
        case?: { id: string };
        error?: string;
      };
      if (!created.ok || !body.case) {
        setError(body.error ?? t('schedule.failed'));
        return;
      }

      if (files.length > 0) {
        const form = new FormData();
        for (const file of files) {
          form.append('files', file);
          form.append('kinds', guessKind(file.name));
        }
        const upload = await fetch(`/api/cases/${body.case.id}/materials`, {
          method: 'POST',
          body: form,
        });
        if (!upload.ok) {
          // The case exists and is scheduled; only the files failed. Saying so
          // beats a generic failure that makes an exec create it a second time.
          setError(t('schedule.uploadFailed'));
          return;
        }
      }

      onCreated();
    } catch {
      setError(t('schedule.failed'));
    } finally {
      setBusy(false);
    }
  }

  const ready = competitionId && title.trim() && releaseLocal && closesLocal && windowMs > 0;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-muted/20 bg-white p-4">
      <h2 className="font-unbounded text-lead font-bold text-primary">{t('schedule.title')}</h2>

      <Field label={t('schedule.competition')}>
        <select
          value={competitionId}
          onChange={(event) => setCompetitionId(event.target.value)}
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        >
          <option value="">{t('schedule.pick')}</option>
          {competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.name_en}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('schedule.caseTitle')}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        />
      </Field>

      <Field label={t('schedule.description')}>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="w-full rounded-sm border border-muted/30 px-3 py-2 text-body"
        />
      </Field>

      <Field label={t('schedule.format')}>
        <input
          value={deliverableFormat}
          onChange={(event) => setDeliverableFormat(event.target.value)}
          placeholder={t('schedule.formatHint')}
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        />
      </Field>

      <Field label={t('schedule.materials')}>
        <input
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          className="w-full text-body"
        />
      </Field>

      {/* Both inputs are Montreal wall time regardless of where the exec is
          sitting, which is why the label says so out loud. */}
      <Field label={t('schedule.releaseAt')}>
        <input
          type="datetime-local"
          value={releaseLocal}
          onChange={(event) => setReleaseLocal(event.target.value)}
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        />
      </Field>

      <Field label={t('schedule.closesAt')}>
        <input
          type="datetime-local"
          value={closesLocal}
          onChange={(event) => setClosesLocal(event.target.value)}
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        />
      </Field>

      {windowLabel && (
        <p
          role="status"
          className={[
            'rounded-sm px-3 py-2 text-body font-semibold',
            windowMs > 0 ? 'bg-primary/5 text-primary' : 'bg-danger/10 text-danger',
          ].join(' ')}
        >
          {windowLabel}
        </p>
      )}

      <Field label={t('schedule.audience')}>
        <select
          value={audienceType}
          onChange={(event) =>
            setAudienceType(event.target.value as 'competition' | 'discipline' | 'teams')
          }
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        >
          <option value="competition">{t('schedule.audienceCompetition')}</option>
          <option value="discipline">{t('schedule.audienceDiscipline')}</option>
          <option value="teams">{t('schedule.audienceTeams')}</option>
        </select>
      </Field>

      {audienceType === 'teams' && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-meta font-bold uppercase tracking-widest text-muted">
            {t('schedule.audienceTeams')}
          </legend>
          {teams
            .filter((team) => !competitionId || team.competition_id === competitionId)
            .map((team) => (
              <label key={team.id} className="flex min-h-11 items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={audienceTeamIds.includes(team.id)}
                  onChange={(event) =>
                    setAudienceTeamIds((held) =>
                      event.target.checked
                        ? [...held, team.id]
                        : held.filter((id) => id !== team.id),
                    )
                  }
                />
                {team.name}
              </label>
            ))}
        </fieldset>
      )}

      {/* DESIGN_BRIEF §5.7 step 5: this is what makes the embargo question a
          per-case setting rather than a policy JMCC has to settle once. */}
      <Field label={t('schedule.coachVisibility')}>
        <select
          value={coachVisibility}
          onChange={(event) =>
            setCoachVisibility(event.target.value as 'same' | 'early' | 'after')
          }
          className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
        >
          <option value="same">{t('schedule.coachSame')}</option>
          <option value="early">{t('schedule.coachEarly')}</option>
          <option value="after">{t('schedule.coachAfter')}</option>
        </select>
      </Field>

      {coachVisibility === 'early' && (
        <Field label={t('schedule.coachReleaseAt')}>
          <input
            type="datetime-local"
            value={coachLocal}
            onChange={(event) => setCoachLocal(event.target.value)}
            className="min-h-11 w-full rounded-sm border border-muted/30 px-3 text-body"
          />
        </Field>
      )}

      {error && (
        <p role="alert" className="field-error text-body text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !ready}
        onClick={save}
        className="min-h-11 rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50"
      >
        {busy ? t('schedule.saving') : t('schedule.save')}
      </button>
    </section>
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

/** A filename is a decent guess and the exec can be wrong; nothing depends on it but sorting. */
function guessKind(filename: string): string {
  const name = filename.toLowerCase();
  if (name.includes('rubric')) return 'rubric';
  if (/\.(xlsx?|csv)$/.test(name)) return 'data';
  if (name.includes('case')) return 'case';
  return 'exhibit';
}
