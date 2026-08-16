// ABOUTME: Grant and revoke roles. Superuser only, and audited.
// ABOUTME: RLS already refuses everyone else; this endpoint exists to write the audit entry.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';

export const prerender = false;

const ROLES = ['superuser', 'executive', 'coach', 'delegate'] as const;
type Role = (typeof ROLES)[number];

type Body = {
  userId?: string;
  role?: Role;
  action?: 'grant' | 'revoke';
};

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.userId || !body.role || !ROLES.includes(body.role)) {
    return json({ error: 'userId and a valid role are required' }, 400);
  }

  /* Written on the caller's own client, so `roles_write` decides — superuser
     only, with `with check` as well as `using`, which is what stops an executive
     inserting a row they would then be unable to see. The endpoint adds the
     audit entry; it is not the thing standing in the way.

     HANDOFF §10 item 3 is tested against this policy directly, and the test
     confirms an executive cannot promote themselves. */
  const table = caller.supabase.from('user_roles');

  const { error } =
    body.action === 'revoke'
      ? await table.delete().eq('user_id', body.userId).eq('role', body.role)
      : await table.insert({
          user_id: body.userId,
          role: body.role,
          granted_by: caller.user.id,
        });

  if (error) return json({ error: error.message }, 403);

  await audit({
    actorId: caller.user.id,
    action: `role.${body.action === 'revoke' ? 'revoke' : 'grant'}`,
    entityType: 'user',
    entityId: body.userId,
    metadata: { role: body.role },
  });

  return json({ ok: true });
};
