// ABOUTME: Save a team's roster — members and coaches replaced as a set, audited like the CSV import.
// ABOUTME: Coach eligibility is enforced here, because team_coaches membership grants health-data access.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../lib/server/api';
import { canCoach, isUnchanged, rosterDiff } from '../../../lib/roster';

export const prerender = false;

type Body = {
  teamId?: string;
  memberIds?: string[];
  coachIds?: string[];
};

/** Distinct, and nothing that is not a string. A duplicate id would hit the composite PK. */
function clean(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  if (ids.some((id) => typeof id !== 'string' || id === '')) return null;
  return [...new Set(ids as string[])];
}

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const body = (await ctx.request.json().catch(() => null)) as Body | null;
  if (!body?.teamId) return json({ error: 'teamId is required' }, 400);

  const memberIds = clean(body.memberIds ?? []);
  const coachIds = clean(body.coachIds ?? []);
  if (!memberIds || !coachIds) return json({ error: 'memberIds and coachIds must be id arrays' }, 400);

  /* Every write below runs on the caller's own client, so `team_members_write`
     and `team_coaches_write` — both exec-only — decide whether this person may
     touch the roster at all. There is no is_exec() check here because a second
     copy of that rule is a second place for it to drift. */
  const supabase = caller.supabase;

  /* The one rule this endpoint owns rather than borrows.
     `team_coaches` membership feeds my_coached_user_ids(), which profiles_read
     uses to release allergies and emergency contacts. A delegate dropped into
     the coach list would therefore be handed their teammates' health data, so
     the role is checked server-side and not merely filtered out of a dropdown. */
  if (coachIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', coachIds);
    if (roleError) return json({ error: roleError.message }, 403);

    const held = new Map<string, string[]>();
    for (const row of ((roleRows as { user_id: string; role: string }[] | null) ?? [])) {
      held.set(row.user_id, [...(held.get(row.user_id) ?? []), row.role]);
    }

    const ineligible = coachIds.filter((id) => !canCoach(held.get(id)));
    if (ineligible.length > 0) {
      return json({ error: 'not_coach_eligible', userIds: ineligible }, 422);
    }
  }

  const [currentMembers, currentCoaches] = await Promise.all([
    supabase.from('team_members').select('user_id').eq('team_id', body.teamId),
    supabase.from('team_coaches').select('coach_id').eq('team_id', body.teamId),
  ]);
  if (currentMembers.error) return json({ error: currentMembers.error.message }, 403);
  if (currentCoaches.error) return json({ error: currentCoaches.error.message }, 403);

  const members = rosterDiff(
    ((currentMembers.data as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
    memberIds,
  );
  const coaches = rosterDiff(
    ((currentCoaches.data as { coach_id: string }[] | null) ?? []).map((r) => r.coach_id),
    coachIds,
  );

  // A save that changes nothing writes nothing — and, more to the point, logs
  // nothing. An audit trail full of no-op saves is an audit trail nobody reads.
  if (isUnchanged(members) && isUnchanged(coaches)) {
    return json({ changed: false });
  }

  /* Removals first. Adding before removing can trip the composite primary key
     when someone moves from one row shape to another in the same save. */
  if (members.removed.length > 0) {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', body.teamId)
      .in('user_id', members.removed);
    if (error) return json({ error: error.message }, 403);
  }
  if (coaches.removed.length > 0) {
    const { error } = await supabase
      .from('team_coaches')
      .delete()
      .eq('team_id', body.teamId)
      .in('coach_id', coaches.removed);
    if (error) return json({ error: error.message }, 403);
  }

  if (members.added.length > 0) {
    const { error } = await supabase
      .from('team_members')
      .insert(members.added.map((userId) => ({ team_id: body.teamId, user_id: userId })));
    if (error) return json({ error: error.message }, 403);
  }
  if (coaches.added.length > 0) {
    const { error } = await supabase
      .from('team_coaches')
      .insert(coaches.added.map((coachId) => ({ team_id: body.teamId, coach_id: coachId })));
    if (error) return json({ error: error.message }, 403);
  }

  /* Same shape as roster.import, because this is the other way a roster changes
     and the two want to read alike when someone is working out what happened. */
  await audit({
    actorId: caller.user.id,
    action: 'team.roster',
    entityType: 'team',
    entityId: body.teamId,
    metadata: {
      membersAdded: members.added.length,
      membersRemoved: members.removed.length,
      coachesAdded: coaches.added.length,
      coachesRemoved: coaches.removed.length,
    },
  });

  return json({
    changed: true,
    members: { added: members.added.length, removed: members.removed.length },
    coaches: { added: coaches.added.length, removed: coaches.removed.length },
  });
};
