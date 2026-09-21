// ABOUTME: Roster arithmetic — who may coach, and what changed between two membership lists.
// ABOUTME: No env imports, so the admin screen and the endpoint that saves it share one copy.

/**
 * Who may be a team's coach.
 *
 * Not cosmetic. `team_coaches` membership feeds `my_coached_user_ids()`, which
 * `profiles_read` (0004) uses to hand over allergies, dietary restrictions and
 * emergency contacts. Putting a delegate in the coach box would therefore give
 * them their teammates' health data — so eligibility is a role question, and
 * the CSV importer already answers it the same way by granting the role and the
 * team row together.
 */
export const COACH_ELIGIBLE_ROLES = ['coach', 'executive', 'superuser'] as const;

export function canCoach(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((role) =>
    (COACH_ELIGIBLE_ROLES as readonly string[]).includes(role),
  );
}

/** The people a coach picker may offer, given who holds what. */
export function coachEligible<T extends { id: string }>(
  people: readonly T[],
  rolesByUser: ReadonlyMap<string, readonly string[]>,
): T[] {
  return people.filter((person) => canCoach(rolesByUser.get(person.id)));
}

export type RosterDiff = { added: string[]; removed: string[] };

/**
 * What a save has to actually do.
 *
 * Deleting everything and re-inserting would be shorter, but it churns rows
 * that did not change and reports "12 added" for a save that moved one person —
 * which is the number that lands in `audit_log` and gets read back in January.
 */
export function rosterDiff(before: readonly string[], after: readonly string[]): RosterDiff {
  const had = new Set(before);
  const wants = new Set(after);
  return {
    added: after.filter((id) => !had.has(id)),
    removed: before.filter((id) => !wants.has(id)),
  };
}

/** Nothing to write. Worth asking before a save round-trips for no reason. */
export function isUnchanged(diff: RosterDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0;
}
