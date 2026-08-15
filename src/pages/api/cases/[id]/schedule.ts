// ABOUTME: Exec overrides on a live case — force release and extend the deadline, both audited.
// ABOUTME: Two actions on one endpoint because they are the same decision: changing a case's clock after it is set.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../../lib/server/api';

export const prerender = false;

type Body =
  | { action: 'force_release' }
  | { action: 'extend'; submissionClosesAt: string }
  | { action: 'close' };

export const PATCH: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing case id' }, 400);

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.action) return json({ error: 'missing action' }, 400);

  // cases_write is exec-only, so an update from anyone else matches no row and
  // comes back empty. That is the check; there is no second one here.
  let patch: Record<string, unknown>;

  switch (body.action) {
    case 'force_release':
      patch = { force_released_at: new Date().toISOString() };
      break;

    case 'extend': {
      const closes = Date.parse(body.submissionClosesAt ?? '');
      if (Number.isNaN(closes)) return json({ error: 'submissionClosesAt must be a datetime' }, 400);
      // Only forwards. "Extend" that can also shorten is how a team loses an
      // hour it had already planned around, and DESIGN_BRIEF §5.7 pairs this
      // action with notifying the affected teams — which only makes sense one
      // way. Shortening a window means closing it deliberately, below.
      const { data: current } = await caller.supabase
        .from('cases')
        .select('submission_closes_at')
        .eq('id', id)
        .single();
      const previous = (current as { submission_closes_at: string } | null)?.submission_closes_at;
      if (previous && closes <= Date.parse(previous)) {
        return json({ error: 'an extension must move the deadline later' }, 400);
      }
      patch = { submission_closes_at: body.submissionClosesAt };
      break;
    }

    case 'close':
      patch = { status: 'closed' };
      break;

    default:
      return json({ error: 'unknown action' }, 400);
  }

  const { data, error } = await caller.supabase
    .from('cases')
    .update(patch)
    .eq('id', id)
    .select('id, status, force_released_at, submission_closes_at')
    .maybeSingle();

  if (error) return json({ error: error.message }, 403);
  if (!data) return json({ error: 'not found or not permitted' }, 403);

  await audit({
    actorId: caller.user.id,
    action: `case.${body.action}`,
    entityType: 'case',
    entityId: id,
    metadata: patch,
  });

  return json({ case: data });
};
