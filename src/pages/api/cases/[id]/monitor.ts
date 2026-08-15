// ABOUTME: Who has submitted and who has not — the exec's live monitor, and a team's own version history.
// ABOUTME: One endpoint for both, because RLS already decides how much of it each caller can see.
import type { APIRoute } from 'astro';
import { isResponse, json, requireUser } from '../../../../lib/server/api';
import { loadCase } from '../../../../lib/server/cases';

export const prerender = false;

type SubmissionRow = {
  team_id: string;
  version: number;
  submitted_by: string;
  submitted_at: string;
  files: { name: string; size: number }[];
};

export const GET: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing case id' }, 400);

  const row = await loadCase(caller.supabase, id);
  if (!row) return json({ error: 'not found' }, 404);

  /* Both queries are scoped by policy, not by a filter written here. An exec
     gets every team, a coach gets theirs, a delegate gets their own — the same
     call, three different answers, and no branch in this file to get wrong. */
  const [rosterResult, submissionsResult] = await Promise.all([
    caller.supabase.rpc('case_roster', { cid: id }),
    caller.supabase
      .from('case_submissions')
      .select('team_id, version, submitted_by, submitted_at, files')
      .eq('case_id', id)
      .order('version', { ascending: false }),
  ]);

  if (rosterResult.error) return json({ error: rosterResult.error.message }, 500);
  if (submissionsResult.error) return json({ error: submissionsResult.error.message }, 500);

  const submissions = (submissionsResult.data as SubmissionRow[] | null) ?? [];

  /* Names come from visible_profile_names() rather than from `profiles`
     directly. A teammate is entitled to know who submitted; they are not
     entitled to that person's allergies or emergency contact, which is what
     selecting the whole row used to hand over. See migration 0004. */
  const submitterIds = [...new Set(submissions.map((s) => s.submitted_by))];
  const names = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data } = await caller.supabase.rpc('visible_profile_names', { ids: submitterIds });
    for (const p of (data as { id: string; display_name: string }[] | null) ?? []) {
      names.set(p.id, p.display_name);
    }
  }

  return json({
    serverNow: new Date().toISOString(),
    roster: (rosterResult.data as { team_id: string; team_name: string }[] | null) ?? [],
    submissions: submissions.map((s) => ({
      teamId: s.team_id,
      version: s.version,
      submittedAt: s.submitted_at,
      // Falls back to an empty string rather than the raw uuid: a delegate who
      // cannot read a submitter's profile should not be handed their user id.
      submittedByName: names.get(s.submitted_by) ?? '',
      files: s.files,
    })),
  });
};
