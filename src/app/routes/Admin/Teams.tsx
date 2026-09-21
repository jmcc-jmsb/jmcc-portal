// ABOUTME: The team builder — choose a team, then its members and its coaches, and save the difference.
// ABOUTME: Pickers rather than drag: the same roster has to be buildable on a phone and with a keyboard.
import { useEffect, useMemo, useState } from 'react';
import RecipientPicker from '../../components/ui/RecipientPicker';
import { useT } from '../../i18n';
import type { Recipient } from '../../lib/recipients';
import { coachEligible } from '../../../lib/roster';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

type Team = { id: string; name: string };

export default function Teams() {
  const t = useT();

  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Recipient[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [teamId, setTeamId] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [coaches, setCoaches] = useState<string[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [busy, setBusy] = useState(false);
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
      const [teamRows, roster, roleRows] = await Promise.all([
        supabase.from('teams').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name, preferred_name').order('full_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (cancelled) return;

      setTeams((teamRows.data as Team[] | null) ?? []);
      setPeople((roster.data as Recipient[] | null) ?? []);

      const map = new Map<string, string[]>();
      for (const row of ((roleRows.data as { user_id: string; role: string }[] | null) ?? [])) {
        map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.role]);
      }
      setRolesByUser(map);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read on every team change rather than caching. Two execs building rosters
  // in the same hour is the normal case in January, not the exotic one.
  useEffect(() => {
    if (!teamId || !isSupabaseConfigured) {
      setMembers([]);
      setCoaches([]);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    setResult(null);
    setError(null);

    void (async () => {
      const supabase = getSupabase();
      const [memberRows, coachRows] = await Promise.all([
        supabase.from('team_members').select('user_id').eq('team_id', teamId),
        supabase.from('team_coaches').select('coach_id').eq('team_id', teamId),
      ]);
      if (cancelled) return;

      setMembers(((memberRows.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id));
      setCoaches(((coachRows.data as { coach_id: string }[] | null) ?? []).map((r) => r.coach_id));
      setRosterLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  /* Only people who hold a coaching role are offered, because team_coaches
     membership releases a delegate's allergies and emergency contact to whoever
     is in it. The endpoint refuses an ineligible id as well — this list is the
     courtesy, that check is the rule. */
  const coachCandidates = useMemo(
    () => coachEligible(people, rolesByUser),
    [people, rolesByUser],
  );

  async function save() {
    setBusy(true);
    setError(null);
    setResult(null);

    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamId, memberIds: members, coachIds: coaches }),
    });

    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === 'not_coach_eligible' ? t('teams.notCoach') : (body.error ?? t('teams.failed')));
      return;
    }

    const body = (await res.json()) as {
      changed: boolean;
      members?: { added: number; removed: number };
      coaches?: { added: number; removed: number };
    };

    setResult(
      body.changed
        ? t('teams.saved', {
            added: (body.members?.added ?? 0) + (body.coaches?.added ?? 0),
            removed: (body.members?.removed ?? 0) + (body.coaches?.removed ?? 0),
          })
        : t('teams.unchanged'),
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-primary">
          {t('teams.team')}
        </span>
        <select
          value={teamId}
          disabled={busy}
          onChange={(event) => setTeamId(event.target.value)}
          className="min-h-11 rounded-sm border border-muted/30 bg-white px-3 text-lead text-ink disabled:opacity-50"
        >
          <option value="">{t('teams.chooseTeam')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      {!loading && teams.length === 0 && <p className="text-body text-muted">{t('teams.noTeams')}</p>}

      {teamId && (
        <>
          <RecipientPicker
            people={people}
            value={members}
            onChange={setMembers}
            label={t('teams.members')}
            loading={rosterLoading}
            disabled={busy}
          />

          <RecipientPicker
            people={coachCandidates}
            value={coaches}
            onChange={setCoaches}
            label={t('teams.coaches')}
            loading={rosterLoading}
            disabled={busy}
          />

          <p className="text-meta text-muted">{t('teams.coachHelp')}</p>

          <button
            type="button"
            disabled={busy || rosterLoading}
            onClick={save}
            className="min-h-11 self-start rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
          >
            {busy ? t('teams.saving') : t('teams.save')}
          </button>
        </>
      )}

      {result && (
        <p role="status" className="text-body text-primary">
          {result}
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
