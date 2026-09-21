// ABOUTME: The exec and coach assign flow — pick people, or a whole team, discipline or competition.
// ABOUTME: Groups expand into named people before anything is sent, so the sender sees who will get it.
import { useEffect, useMemo, useState } from 'react';
import RecipientPicker from '../../components/ui/RecipientPicker';
import { useLocale, useT } from '../../i18n';
import type { Recipient } from '../../lib/recipients';
import { assignmentProblem, groupMemberIds, mergeSelection } from '../../../lib/taskAssign';
import type { GroupKind, MemberRow, TeamRow } from '../../../lib/taskAssign';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { montrealLocalToIso } from '../../lib/time';

type Named = { id: string; name_en: string; name_fr: string };
type TeamNamed = TeamRow & { name: string };
type LinkOption = { value: string; label: string };

export default function Assign({ onAssigned }: { onAssigned: () => void }) {
  const t = useT();
  const { locale } = useLocale();

  const [people, setPeople] = useState<Recipient[]>([]);
  const [teams, setTeams] = useState<TeamNamed[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [disciplines, setDisciplines] = useState<Named[]>([]);
  const [competitions, setCompetitions] = useState<Named[]>([]);
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [owners, setOwners] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [link, setLink] = useState('');

  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      const supabase = getSupabase();
      /* Every read is the caller's own. An exec gets the whole organisation and
         a coach gets their teams, without either query having to say so. */
      const [roster, teamRows, memberRows, disciplineRows, competitionRows, eventRows, caseRows] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, preferred_name').order('full_name'),
          supabase.from('teams').select('id, name, competition_id, discipline_id').order('name'),
          supabase.from('team_members').select('team_id, user_id'),
          supabase
            .from('disciplines')
            .select('id, name_en, name_fr')
            .order('sort_order', { ascending: true, nullsFirst: false }),
          supabase.from('competitions').select('id, name_en, name_fr'),
          supabase.from('events').select('id, title_en, title_fr'),
          supabase.rpc('my_cases'),
        ]);
      if (cancelled) return;

      setPeople((roster.data as Recipient[] | null) ?? []);
      setTeams((teamRows.data as TeamNamed[] | null) ?? []);
      setMembers((memberRows.data as MemberRow[] | null) ?? []);
      setDisciplines((disciplineRows.data as Named[] | null) ?? []);
      setCompetitions((competitionRows.data as Named[] | null) ?? []);

      const eventRowsTyped =
        (eventRows.data as { id: string; title_en: string; title_fr: string | null }[] | null) ?? [];
      const events = eventRowsTyped.map((row) => ({
        value: 'event:' + row.id,
        label: (locale === 'fr' ? row.title_fr : row.title_en) || row.title_en,
      }));

      /* A sealed case comes back with a null title, because my_cases() redacts it
         in SQL. Linking to something you cannot name is not a link, it is a
         guess, so those are left out rather than listed as "Untitled". */
      const caseRowsTyped = (caseRows.data as { id: string; title: string | null }[] | null) ?? [];
      const cases = caseRowsTyped
        .filter((row) => row.title)
        .map((row) => ({ value: 'case:' + row.id, label: row.title as string }));

      setLinks([...cases, ...events]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const groupOptions = useMemo(
    () => ({
      team: teams.map((team) => ({ id: team.id, label: team.name })),
      discipline: disciplines.map((row) => ({
        id: row.id,
        label: locale === 'fr' ? row.name_fr : row.name_en,
      })),
      competition: competitions.map((row) => ({
        id: row.id,
        label: locale === 'fr' ? row.name_fr : row.name_en,
      })),
    }),
    [teams, disciplines, competitions, locale],
  );

  function addGroup(value: string) {
    if (!value) return;
    const [kind, id] = value.split(':') as [GroupKind, string];
    setOwners((current) => mergeSelection(current, groupMemberIds(kind, id, teams, members)));
  }

  async function assign() {
    setBusy(true);
    setError(null);
    setResult(null);
    setBatchId(null);

    const [linkedType, linkedId] = link ? link.split(':') : [null, null];

    const res = await fetch('/api/tasks/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        // Montreal local, like every other date this app writes.
        dueAt: due ? montrealLocalToIso(due) : null,
        ownerIds: owners,
        linkedType,
        linkedId,
      }),
    });

    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === 'no_recipients' ? t('assign.needRecipients') : (body.error ?? t('assign.failed')),
      );
      return;
    }

    const body = (await res.json()) as { batchId: string; assigned: number };
    setBatchId(body.batchId);
    setResult(t('assign.assigned', { n: body.assigned }));
    setTitle('');
    setDescription('');
    setDue('');
    setLink('');
    setOwners([]);
    onAssigned();
  }

  /* Undo rather than a batch history screen. The mistake worth catching is the
     one you just made, and it is caught by deleting the batch still on screen —
     outstanding rows only, so nobody loses a task they have already done. */
  async function undo() {
    if (!batchId) return;
    setBusy(true);
    const res = await fetch('/api/tasks/assign?batch=' + encodeURIComponent(batchId), {
      method: 'DELETE',
    });
    setBusy(false);
    if (!res.ok) {
      setError(t('assign.undoFailed'));
      return;
    }
    const body = (await res.json()) as { removed: number };
    setBatchId(null);
    setResult(t('assign.undone', { n: body.removed }));
    onAssigned();
  }

  const problem = assignmentProblem(title, owners);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-muted/20 bg-white p-3">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('assign.heading')}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted">{t('assign.title')}</span>
        <input
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          className="min-h-11 rounded-sm border border-muted/30 px-3 text-lead text-ink disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted">{t('assign.description')}</span>
        <textarea
          value={description}
          rows={2}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded-sm border border-muted/30 px-3 py-2 text-lead text-ink disabled:opacity-50"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-meta text-muted">{t('assign.due')}</span>
          <input
            type="date"
            value={due}
            disabled={busy}
            onChange={(event) => setDue(event.target.value)}
            className="min-h-11 rounded-sm border border-muted/30 px-3 text-lead text-ink disabled:opacity-50"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-meta text-muted">{t('assign.link')}</span>
          <select
            value={link}
            disabled={busy}
            onChange={(event) => setLink(event.target.value)}
            className="min-h-11 rounded-sm border border-muted/30 bg-white px-3 text-lead text-ink disabled:opacity-50"
          >
            <option value="">{t('assign.noLink')}</option>
            {links.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* One control for all three group kinds. Picking one adds its people to
          the list below rather than becoming a recipient itself — see
          groupMemberIds() for why a task always belongs to a person. */}
      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted">{t('assign.addGroup')}</span>
        <select
          value=""
          disabled={busy}
          onChange={(event) => addGroup(event.target.value)}
          className="min-h-11 rounded-sm border border-muted/30 bg-white px-3 text-lead text-ink disabled:opacity-50"
        >
          <option value="">{t('assign.chooseGroup')}</option>
          {/* A group with nothing in it is not rendered at all. An empty
              <optgroup> is a heading a screen reader reads out before silence. */}
          {groupOptions.team.length > 0 && (
            <optgroup label={t('assign.groupTeams')}>
              {groupOptions.team.map((option) => (
                <option key={option.id} value={'team:' + option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )}
          {groupOptions.discipline.length > 0 && (
            <optgroup label={t('assign.groupDisciplines')}>
              {groupOptions.discipline.map((option) => (
                <option key={option.id} value={'discipline:' + option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )}
          {groupOptions.competition.length > 0 && (
            <optgroup label={t('assign.groupCompetitions')}>
              {groupOptions.competition.map((option) => (
                <option key={option.id} value={'competition:' + option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <RecipientPicker
        people={people}
        value={owners}
        onChange={setOwners}
        label={t('assign.recipients')}
        loading={loading}
        disabled={busy}
      />

      <button
        type="button"
        disabled={busy || problem !== null}
        onClick={assign}
        className="min-h-11 self-start rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
      >
        {busy ? t('assign.assigning') : t('assign.assign', { n: owners.length })}
      </button>

      {result && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-body text-primary">
          {result}
          {batchId && (
            <button
              type="button"
              disabled={busy}
              onClick={undo}
              className="min-h-11 rounded-sm border border-muted/30 px-3 text-body font-semibold text-ink disabled:opacity-50"
            >
              {t('assign.undo')}
            </button>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body text-muted">
          {error}
        </p>
      )}
    </section>
  );
}
