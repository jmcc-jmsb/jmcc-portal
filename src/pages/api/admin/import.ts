// ABOUTME: Roster CSV import — creates accounts, profiles and role grants in one pass.
// ABOUTME: Executive-gated, and every row it could not use comes back with its line number.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { createAdminClient } from '../../../lib/server/supabase';
import { readRoster } from '../../../lib/csv';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  /* Checked explicitly: this endpoint creates auth users on the secret key, and
     there is no RLS policy standing between it and an inbox full of magic-link
     invitations. */
  const { data: roles } = await caller.supabase.rpc('my_roles');
  const held = ((roles as string[] | null) ?? []) as string[];
  if (!held.some((role) => role === 'executive' || role === 'superuser')) {
    return json({ error: 'forbidden' }, 403);
  }

  const text = await ctx.request.text();
  if (!text.trim()) return json({ error: 'empty file' }, 400);

  const { rows, problems } = readRoster(text);
  if (rows.length === 0) return json({ imported: 0, problems }, 400);

  const admin = createAdminClient();

  // Teams are matched by name, resolved once rather than per row.
  const { data: teamRows } = await admin.from('teams').select('id, name');
  const teams = new Map(
    ((teamRows as { id: string; name: string }[] | null) ?? []).map((t) => [t.name.toLowerCase(), t.id]),
  );

  const created: string[] = [];
  const failures = [...problems];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;

    /* createUser is idempotent enough for our purposes: an address that already
       exists comes back as an error we can recognise and look past, which is
       what makes re-importing a corrected spreadsheet safe.

       No password and no invitation email — this app signs people in with magic
       links, so an account is just a row until they ask for one. */
    const { data: made, error: createError } = await admin.auth.admin.createUser({
      email: row.email,
      email_confirm: true,
      user_metadata: { full_name: row.fullName },
    });

    let userId = made?.user?.id ?? null;

    if (!userId) {
      const alreadyExists = /already|registered|exists/i.test(createError?.message ?? '');
      if (!alreadyExists) {
        failures.push({ line, reason: createError?.message ?? 'could not create account' });
        continue;
      }
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('email', row.email)
        .maybeSingle();
      userId = (existing as { id: string } | null)?.id ?? null;
      if (!userId) {
        failures.push({ line, reason: 'account exists but has no profile' });
        continue;
      }
    }

    // handle_new_user() fills the profile; this adds what the CSV knows and the
    // trigger could not.
    await admin
      .from('profiles')
      .update({ full_name: row.fullName, preferred_name: row.preferredName })
      .eq('id', userId);

    await admin
      .from('user_roles')
      .upsert({ user_id: userId, role: row.role, granted_by: caller.user.id }, { onConflict: 'user_id,role' });

    if (row.team) {
      const teamId = teams.get(row.team.toLowerCase());
      if (teamId) {
        await admin
          .from(row.role === 'coach' ? 'team_coaches' : 'team_members')
          .upsert(
            row.role === 'coach' ? { team_id: teamId, coach_id: userId } : { team_id: teamId, user_id: userId },
          );
      } else {
        // Imported, but say what was skipped. Silently dropping the team is how
        // someone discovers in January that half a roster has no team.
        failures.push({ line, reason: `no team named "${row.team}" — the person was imported without one` });
      }
    }

    created.push(userId);
  }

  await audit({
    actorId: caller.user.id,
    action: 'roster.import',
    entityType: 'roster',
    metadata: { imported: created.length, problems: failures.length },
  });

  return json({ imported: created.length, problems: failures });
};
