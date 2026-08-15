// ABOUTME: Data hooks for tasks, events and the cabinet — straight through RLS, no endpoints.
// ABOUTME: Nothing here needs the secret key, a server clock, or a signed URL, so nothing here needs a server route.
import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Task } from './tasks';
import type { CalendarEvent } from './calendar';
import type { CabinetPiece, FillState } from './cabinet';

/* Phase 2 routed the vault through /api because it needed things a browser must
   not have: the secret key to sign a URL, a server clock the device cannot move,
   and an audit trail the actor cannot forge. None of that applies here. Tasks,
   events and awards are ordinary rows whose visibility RLS already decides, so
   an endpoint would be a second place for the same rules to be written down and
   a second place for them to be got wrong. */

function useQuery<T>(
  run: (supabase: ReturnType<typeof getSupabase>) => PromiseLike<{ data: unknown; error: unknown }>,
  deps: unknown[],
): { rows: T[]; loading: boolean; error: string | null; reload: () => void } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void Promise.resolve(run(getSupabase()))
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setError((queryError as { message?: string }).message ?? 'failed');
        else setRows((data as T[] | null) ?? []);
      })
      .catch(() => !cancelled && setError('offline'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { rows, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function useTasks() {
  const { rows, loading, error, reload } = useQuery<Task>(
    (supabase) =>
      supabase
        .from('tasks')
        .select('id, owner_id, title, description, due_at, source, linked_type, linked_id, is_system, completed_at')
        .order('due_at', { ascending: true, nullsFirst: false }),
    [],
  );
  return { tasks: rows, loading, error, reload };
}

export function useEvents() {
  const { rows, loading, error, reload } = useQuery<CalendarEvent>(
    (supabase) =>
      supabase
        .from('events')
        .select('id, title_en, title_fr, description, type, starts_at, ends_at, all_day, location, location_url, competition_id')
        .order('starts_at', { ascending: true }),
    [],
  );
  return { events: rows, loading, error, reload };
}

export function useCabinet(target?: string | null) {
  const { rows, loading, error, reload } = useQuery<CabinetPiece>(
    (supabase) => supabase.rpc('cabinet_for', target ? { target } : {}),
    [target],
  );
  return { pieces: rows, loading, error, reload };
}

/* ── Writes ─────────────────────────────────────────────────────────────────
   Thin wrappers rather than inline calls, so the one place that knows a task is
   completed by stamping completed_at is this file. */

export async function setTaskDone(id: string, done: boolean): Promise<string | null> {
  const { error } = await getSupabase()
    .from('tasks')
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq('id', id);
  return error?.message ?? null;
}

export async function addTask(ownerId: string, title: string, dueAt: string | null): Promise<string | null> {
  const { error } = await getSupabase()
    .from('tasks')
    .insert({ owner_id: ownerId, title, due_at: dueAt, source: 'self', created_by: ownerId });
  return error?.message ?? null;
}

export async function deleteTask(id: string): Promise<string | null> {
  // tasks_delete excludes is_system, so this comes back as zero rows affected
  // rather than an error for a system task. The UI does not offer the button.
  const { error } = await getSupabase().from('tasks').delete().eq('id', id);
  return error?.message ?? null;
}

export async function saveEvent(event: Partial<CalendarEvent> & { id?: string }): Promise<string | null> {
  const supabase = getSupabase();
  const { id, ...fields } = event;
  const { error } = id
    ? await supabase.from('events').update(fields).eq('id', id)
    : await supabase.from('events').insert(fields);
  return error?.message ?? null;
}

export async function deleteEvent(id: string): Promise<string | null> {
  const { error } = await getSupabase().from('events').delete().eq('id', id);
  return error?.message ?? null;
}

export async function setRsvp(eventId: string, userId: string, status: 'going' | 'maybe' | 'declined') {
  const { error } = await getSupabase()
    .from('event_rsvps')
    .upsert({ event_id: eventId, user_id: userId, status, responded_at: new Date().toISOString() });
  return error?.message ?? null;
}

/* ── Dev fixture ────────────────────────────────────────────────────────────
   The prototype ships a "Cabinet fill" control (export line 968) for the same
   reason it ships the vault-state switcher: the empty cabinet is the highest
   stakes screen in the app and nobody will earn nine pieces to review it. */

const FIXTURE_PIECES: { code: string; name_en: string; name_fr: string; category: CabinetPiece['category']; hint: string; tone: 'gold' | 'sand'; shape: CabinetPiece['shape'] }[] = [
  { code: 'place_1st', name_en: 'First place', name_fr: 'Première place', category: 'placement', hint: 'Win a discipline', tone: 'gold', shape: 'disc' },
  { code: 'place_2nd', name_en: 'Second place', name_fr: 'Deuxième place', category: 'placement', hint: 'Place second', tone: 'sand', shape: 'disc' },
  { code: 'place_finalist', name_en: 'Finalist', name_fr: 'Finaliste', category: 'placement', hint: 'Reach a final', tone: 'sand', shape: 'diamond' },
  { code: 'season_complete', name_en: 'Season completed', name_fr: 'Saison complétée', category: 'season', hint: 'Complete a season', tone: 'sand', shape: 'bar' },
  { code: 'ms_first_submission', name_en: 'First case submitted', name_fr: 'Premier cas soumis', category: 'milestone', hint: 'Submit your first case', tone: 'sand', shape: 'diamond' },
  { code: 'ms_first_competition', name_en: 'First competition', name_fr: 'Première compétition', category: 'milestone', hint: 'Compete once', tone: 'sand', shape: 'diamond' },
  { code: 'ms_three_disciplines', name_en: 'Three disciplines', name_fr: 'Trois disciplines', category: 'milestone', hint: 'Compete in a third discipline', tone: 'sand', shape: 'diamond' },
  { code: 'ms_delivered_live', name_en: 'Delivered live', name_fr: 'Présentation devant jury', category: 'milestone', hint: 'Present to a live jury', tone: 'sand', shape: 'diamond' },
  { code: 'ms_travelled', name_en: 'Travelled with the delegation', name_fr: 'Voyage avec la délégation', category: 'milestone', hint: 'Travel to a competition', tone: 'sand', shape: 'bar' },
  { code: 'ms_case_captain', name_en: 'Case captain', name_fr: 'Capitaine de cas', category: 'milestone', hint: 'Lead a case team', tone: 'gold', shape: 'diamond' },
  { code: 'com_coaches_pick', name_en: "Coach's pick", name_fr: 'Choix du coach', category: 'commendation', hint: 'Nominated by your coach', tone: 'gold', shape: 'disc' },
  { code: 'com_team_captain', name_en: 'Team captain', name_fr: "Capitaine d'équipe", category: 'commendation', hint: 'Named captain', tone: 'gold', shape: 'diamond' },
];

export function cabinetFixture(state: FillState, now: number): CabinetPiece[] {
  const earnedUpTo = state === 'empty' ? 0 : state === 'full' ? FIXTURE_PIECES.length : 5;

  return FIXTURE_PIECES.map((p, i) => ({
    piece_id: `fixture-${p.code}`,
    code: p.code,
    name_en: p.name_en,
    name_fr: p.name_fr,
    category: p.category,
    unlock_hint_en: p.hint,
    unlock_hint_fr: p.hint,
    is_secret: false,
    is_repeatable: p.category === 'placement' || p.category === 'season',
    tone: p.tone,
    shape: p.shape,
    sort_order: i,
    earned_count: i < earnedUpTo ? (p.code === 'place_1st' ? 2 : 1) : 0,
    first_awarded_at: i < earnedUpTo ? new Date(now - (i + 1) * 86_400_000 * 30).toISOString() : null,
    last_awarded_at: i < earnedUpTo ? new Date(now - i * 86_400_000 * 20).toISOString() : null,
  }));
}
