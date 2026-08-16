// ABOUTME: Grant a cabinet piece to one or more delegates. Executive only, audited.
// ABOUTME: Deferred from Phase 3 for this reason — HANDOFF §4 wants award grants in audit_log.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';

export const prerender = false;

type Body = {
  pieceId?: string;
  userIds?: string[];
  competitionId?: string | null;
  note?: string | null;
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.pieceId || !body.userIds?.length) {
    return json({ error: 'pieceId and userIds are required' }, 400);
  }

  /* On the caller's own client: awards_write is exec-only, so a delegate's
     request comes back an RLS violation rather than a granted piece. DESIGN_BRIEF
     §5.8 makes this a rare, deliberate action — "select delegates and grant a
     placement or commendation in one pass" — which is why it takes a list. */
  const rows = body.userIds.map((userId) => ({
    user_id: userId,
    piece_id: body.pieceId,
    competition_id: body.competitionId ?? null,
    awarded_by: caller.user.id,
    note: body.note ?? null,
  }));

  const { data, error } = await caller.supabase
    .from('cabinet_awards')
    // A piece already held for the same competition is not an error worth
    // failing the batch over — the exec meant "these people have it", and
    // re-granting is how a correction is made.
    .upsert(rows, { onConflict: 'user_id,piece_id,competition_id', ignoreDuplicates: true })
    .select('id');

  if (error) return json({ error: error.message }, 403);

  await audit({
    actorId: caller.user.id,
    action: 'cabinet.award',
    entityType: 'cabinet_piece',
    entityId: body.pieceId,
    metadata: { recipients: body.userIds.length, granted: (data as unknown[] | null)?.length ?? 0 },
  });

  return json({ granted: (data as unknown[] | null)?.length ?? 0 }, 201);
};
