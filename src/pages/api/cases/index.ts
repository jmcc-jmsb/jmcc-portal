// ABOUTME: GET the caller's cases (redacted by the database), POST a new scheduled case (exec only).
// ABOUTME: The POST is the drop-and-schedule form's first half; materials upload is its own endpoint.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { listCases } from '../../../lib/server/cases';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const cases = await listCases(caller.supabase);
  return json({ serverNow: new Date().toISOString(), cases });
};

type CreateBody = {
  competitionId?: string;
  disciplineId?: string | null;
  title?: string;
  description?: string | null;
  deliverableFormat?: string | null;
  releaseAt?: string;
  submissionOpensAt?: string;
  submissionClosesAt?: string;
  coachVisibility?: 'same' | 'early' | 'after';
  coachReleaseAt?: string | null;
  audienceType?: 'competition' | 'discipline' | 'teams';
  audienceTeamIds?: string[] | null;
  status?: 'draft' | 'scheduled';
};

/* Validated here as well as in the database. The check constraints in 0003 are
   the ones that cannot be bypassed, but a constraint violation reaches the exec
   as "new row violates check constraint valid_window", and someone scheduling a
   case at 11pm deserves a sentence instead. */
function validate(body: CreateBody): string | null {
  if (!body.competitionId) return 'competitionId is required';
  if (!body.title?.trim()) return 'title is required';

  const release = Date.parse(body.releaseAt ?? '');
  const opens = Date.parse(body.submissionOpensAt ?? '');
  const closes = Date.parse(body.submissionClosesAt ?? '');
  if (Number.isNaN(release)) return 'releaseAt must be a datetime';
  if (Number.isNaN(opens)) return 'submissionOpensAt must be a datetime';
  if (Number.isNaN(closes)) return 'submissionClosesAt must be a datetime';
  if (opens < release) return 'submissions cannot open before the case is released';
  if (closes <= opens) return 'the submission window must end after it opens';

  if (body.coachVisibility === 'early') {
    const coach = Date.parse(body.coachReleaseAt ?? '');
    if (Number.isNaN(coach)) return 'early coach access needs its own datetime';
    if (coach > release) return 'early coach access must be before the delegate release';
  }
  if (body.audienceType === 'teams' && !(body.audienceTeamIds ?? []).length) {
    return 'pick at least one team';
  }
  return null;
}

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as CreateBody | null;
  if (!body) return json({ error: 'invalid JSON' }, 400);

  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  // No is_exec() check here: cases_write is exec-only, so a delegate's insert
  // comes back as an RLS violation. Checking twice would mean two answers to
  // maintain for one question.
  const { data, error } = await caller.supabase
    .from('cases')
    .insert({
      competition_id: body.competitionId,
      discipline_id: body.disciplineId ?? null,
      title: body.title!.trim(),
      description: body.description ?? null,
      deliverable_format: body.deliverableFormat ?? null,
      release_at: body.releaseAt,
      submission_opens_at: body.submissionOpensAt,
      submission_closes_at: body.submissionClosesAt,
      coach_visibility: body.coachVisibility ?? 'same',
      coach_release_at: body.coachVisibility === 'early' ? body.coachReleaseAt : null,
      audience_type: body.audienceType ?? 'competition',
      audience_team_ids: body.audienceType === 'teams' ? body.audienceTeamIds : null,
      status: body.status ?? 'scheduled',
      created_by: caller.user.id,
    })
    .select('id, status')
    .single();

  if (error) return json({ error: error.message }, 403);

  await audit({
    actorId: caller.user.id,
    action: 'case.create',
    entityType: 'case',
    entityId: (data as { id: string }).id,
    metadata: { status: (data as { status: string }).status, releaseAt: body.releaseAt },
  });

  return json({ case: data }, 201);
};
