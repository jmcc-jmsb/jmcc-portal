// ABOUTME: Shared plumbing for /api routes — JSON responses, caller resolution, audit writes.
// ABOUTME: Server-only; it reaches for the service role, so nothing here may be imported by the SPA.
import type { APIContext } from 'astro';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createAdminClient, createSessionClient, isSupabaseConfigured } from './supabase';

/**
 * No-store on every API response.
 *
 * HANDOFF §8 is blunt about the failure this prevents: a cached 403 from the
 * materials endpoint keeps the vault sealed after it opens. The service worker
 * has its own rule for that, but a response that says not to cache it cannot be
 * cached by a layer nobody remembered to configure.
 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export type Caller = { user: User; supabase: SupabaseClient };

/**
 * The signed-in caller, or a 401.
 *
 * Returns `getUser()` rather than `getSession()` deliberately — getSession reads
 * the cookie and believes it, getUser verifies the token with the auth server.
 * On an endpoint that hands out signed URLs, the difference is the whole point.
 */
export async function requireUser(ctx: APIContext): Promise<Caller | Response> {
  // A checkout with no .env is a normal state for this repo, and every /api
  // route would otherwise answer it with a 500 and a stack trace naming the
  // config it wants. 503 says the same thing without the theatre.
  if (!isSupabaseConfigured) return json({ error: 'not_configured' }, 503);

  const supabase = createSessionClient(ctx.cookies, ctx.request.headers);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthenticated' }, 401);
  return { user: data.user, supabase };
}

/** Narrowing helper, so callers can write `if (isResponse(caller)) return caller`. */
export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

/**
 * Append to audit_log on the service role.
 *
 * Deliberately fire-and-forget in the failure direction: a broken audit write
 * must not fail a submission a delegate just made against a deadline. It is
 * logged loudly instead, because a silently missing trail is worse than a noisy
 * one. RLS on audit_log has no insert policy, so this is the only way in.
 */
export async function audit(entry: {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    });
    if (error) console.error('[audit] insert failed', entry.action, error.message);
  } catch (cause) {
    console.error('[audit] insert threw', entry.action, cause);
  }
}
