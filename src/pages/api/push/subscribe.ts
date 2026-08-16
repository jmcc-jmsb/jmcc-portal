// ABOUTME: Register or remove this device's push subscription.
// ABOUTME: Written as the caller, so push_write_own decides — a subscription is always yours.
import type { APIRoute } from 'astro';
import { isResponse, json, requireUser } from '../../../lib/server/api';

export const prerender = false;

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return json({ error: 'endpoint and keys are required' }, 400);
  }

  /* Inserted on the caller's own client so push_write_own applies: a
     subscription row is a capability to notify a device, and one written under
     somebody else's user_id would deliver our notifications to their phone.

     onConflict on endpoint rather than a plain insert — a browser that
     re-subscribes after a permission reset returns the same endpoint, and a
     second row would mean every notification arriving twice. */
  const { error } = await caller.supabase.from('push_subscriptions').upsert(
    {
      user_id: caller.user.id,
      endpoint: body.endpoint,
      keys: body.keys,
      user_agent: ctx.request.headers.get('user-agent'),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) return json({ error: error.message }, 403);
  return json({ ok: true }, 201);
};

export const DELETE: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.endpoint) return json({ error: 'endpoint is required' }, 400);

  // push_delete_own means this only ever removes the caller's own row, so an
  // endpoint someone else guessed cannot be unsubscribed out from under them.
  const { error } = await caller.supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint);

  if (error) return json({ error: error.message }, 403);
  return json({ ok: true });
};
