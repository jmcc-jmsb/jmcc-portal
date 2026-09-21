// ABOUTME: Assign one task to many people as a batch, and unassign the whole batch again.
// ABOUTME: RLS decides who may own a task; this route exists for the shared batch_id and the audit entry.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { assignmentProblem } from '../../../lib/taskAssign';

export const prerender = false;

/** 'document' is missing on purpose — that link points at one person's assignment row, so it cannot be shared by a batch. */
const LINKED_TYPES = ['case', 'event'];

type Body = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  ownerIds?: string[];
  linkedType?: string | null;
  linkedId?: string | null;
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body) return json({ error: 'invalid JSON' }, 400);

  const ownerIds = Array.isArray(body.ownerIds)
    ? [...new Set(body.ownerIds.filter((id): id is string => typeof id === 'string' && id !== ''))]
    : [];
  const title = (body.title ?? '').trim();

  // The same question the button asked, asked again where it counts.
  const problem = assignmentProblem(title, ownerIds);
  if (problem) return json({ error: problem }, 400);

  if (body.linkedType && !LINKED_TYPES.includes(body.linkedType)) {
    return json({ error: 'unsupported link type' }, 400);
  }

  /* The badge a delegate sees on the task — "From exec" or "From coach". Read
     from the role rows rather than taken from the request, because a client that
     picks its own source badge is a client that can forge one. `is_system` is
     never set here: tasks_insert refuses it to anyone holding a JWT, and the
     auto-generated ones come from the document flow on the secret key. */
  const { data: roleRows } = await caller.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', caller.user.id);
  const roles = ((roleRows as { role: string }[] | null) ?? []).map((row) => row.role);
  const source = roles.includes('executive') || roles.includes('superuser') ? 'exec' : 'coach';

  /* One id shared by every row, so unassigning is one delete rather than forty.
     0005 anticipated this — the batch_id column exists for exactly this flow. */
  const batchId = crypto.randomUUID();

  /* A single insert, so RLS judges the whole batch at once. A coach who slips a
     delegate they do not coach into the list gets the entire assignment refused
     rather than a roster that half-arrived. */
  const { error } = await caller.supabase.from('tasks').insert(
    ownerIds.map((ownerId) => ({
      owner_id: ownerId,
      title,
      description: body.description?.trim() || null,
      due_at: body.dueAt || null,
      source,
      created_by: caller.user.id,
      batch_id: batchId,
      linked_type: body.linkedType || null,
      linked_id: body.linkedId || null,
    })),
  );
  if (error) return json({ error: error.message }, 403);

  await audit({
    actorId: caller.user.id,
    action: 'task.assign',
    entityType: 'task_batch',
    entityId: batchId,
    metadata: { recipients: ownerIds.length, title, source },
  });

  return json({ batchId, assigned: ownerIds.length }, 201);
};

/**
 * Unassign the batch.
 *
 * Deletes only what is still outstanding. Someone who already ticked it off has
 * done the thing, and removing their row would make a completed task disappear
 * from their list along with the evidence they completed it.
 */
export const DELETE: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const batchId = new URL(ctx.request.url).searchParams.get('batch');
  if (!batchId) return json({ error: 'batch is required' }, 400);

  const { data, error } = await caller.supabase
    .from('tasks')
    .delete()
    .eq('batch_id', batchId)
    .is('completed_at', null)
    .select('id');
  if (error) return json({ error: error.message }, 403);

  const removed = (data as unknown[] | null)?.length ?? 0;

  await audit({
    actorId: caller.user.id,
    action: 'task.unassign',
    entityType: 'task_batch',
    entityId: batchId,
    metadata: { removed },
  });

  return json({ removed });
};
