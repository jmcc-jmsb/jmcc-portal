// ABOUTME: Turning "everyone on Finance A" into a list of owner ids, and checking an assignment is sendable.
// ABOUTME: No env imports — the assign screen and the endpoint that saves it share one copy.

export type TeamRow = {
  id: string;
  competition_id: string;
  discipline_id: string | null;
};

export type MemberRow = { team_id: string; user_id: string };

/**
 * The brief's four recipient kinds are individual, team, discipline and
 * competition (§5.4). Only the first is a person — the other three are
 * shorthand that expands into people here, before anything is sent.
 *
 * Expanding client-side rather than storing "assigned to Finance A" is the
 * schema's decision, not ours: `tasks` has `owner_id` and `batch_id` and no
 * team column, so a task always belongs to somebody. It also means the exec
 * sees exactly who will receive it while there is still time to change it.
 */
export type GroupKind = 'team' | 'discipline' | 'competition';

export function groupMemberIds(
  kind: GroupKind,
  id: string,
  teams: readonly TeamRow[],
  members: readonly MemberRow[],
): string[] {
  const teamIds = new Set(
    teams
      .filter((team) => {
        if (kind === 'team') return team.id === id;
        if (kind === 'discipline') return team.discipline_id === id;
        return team.competition_id === id;
      })
      .map((team) => team.id),
  );

  const owners = new Set<string>();
  for (const row of members) {
    if (teamIds.has(row.team_id)) owners.add(row.user_id);
  }
  return [...owners];
}

/**
 * Add a group to what is already picked.
 *
 * A union rather than a replacement: "everyone on Finance A, plus Jordan" is
 * the normal request, and someone on two teams must not appear twice — the
 * composite insert would be fine with it, but the count shown to the exec
 * would lie.
 */
export function mergeSelection(current: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(current);
  return [...current, ...incoming.filter((id) => !seen.has(id))];
}

export type AssignmentProblem = 'no_title' | 'no_recipients' | null;

/** What stops this being sendable, if anything. The button and the endpoint agree because they ask this. */
export function assignmentProblem(title: string, ownerIds: readonly string[]): AssignmentProblem {
  if (!title.trim()) return 'no_title';
  if (ownerIds.length === 0) return 'no_recipients';
  return null;
}
