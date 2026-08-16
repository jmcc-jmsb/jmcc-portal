// ABOUTME: Executive-only push send. The one place notifications go out from.
// ABOUTME: Audited, because a notification to 120 phones is not an action anyone should take anonymously.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { isPushConfigured, sendToUsers } from '../../../lib/server/push';

export const prerender = false;

type Body = {
  userIds?: string[];
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  if (!isPushConfigured) return json({ error: 'push_not_configured' }, 503);

  /* Checked here rather than left to RLS: sending is not a table write, so
     there is no policy standing between this endpoint and 120 phones. The
     secret key does the sending, and the secret key answers to nobody. */
  const { data: roles } = await caller.supabase.rpc('my_roles');
  const isExec = ((roles as string[] | null) ?? []).some(
    (role) => role === 'executive' || role === 'superuser',
  );
  if (!isExec) return json({ error: 'forbidden' }, 403);

  const payload = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!payload?.title || !payload.body || !payload.userIds?.length) {
    return json({ error: 'userIds, title and body are required' }, 400);
  }

  let result;
  try {
    result = await sendToUsers(payload.userIds, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
    });
  } catch (cause) {
    return json({ error: (cause as Error).message }, 502);
  }

  await audit({
    actorId: caller.user.id,
    action: 'push.send',
    entityType: 'push',
    metadata: {
      recipients: payload.userIds.length,
      delivered: result.sent,
      pruned: result.pruned,
      title: payload.title,
    },
  });

  return json(result);
};
