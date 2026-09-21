// ABOUTME: Group expansion and assignment validation — the parts that decide who gets a task.
// ABOUTME: A wrong expansion sends forty people the wrong to-do, so each kind is tested separately.
import { describe, expect, it } from 'vitest';
import { assignmentProblem, groupMemberIds, mergeSelection } from './taskAssign';
import type { MemberRow, TeamRow } from './taskAssign';

const teams: TeamRow[] = [
  { id: 't1', competition_id: 'c1', discipline_id: 'd1' },
  { id: 't2', competition_id: 'c1', discipline_id: 'd1' },
  { id: 't3', competition_id: 'c1', discipline_id: 'd2' },
  { id: 't4', competition_id: 'c2', discipline_id: 'd1' },
];

const members: MemberRow[] = [
  { team_id: 't1', user_id: 'u1' },
  { team_id: 't1', user_id: 'u2' },
  { team_id: 't2', user_id: 'u3' },
  { team_id: 't3', user_id: 'u4' },
  { team_id: 't4', user_id: 'u5' },
  // On two teams in the same discipline. The reason expansion dedupes.
  { team_id: 't2', user_id: 'u1' },
];

describe('groupMemberIds', () => {
  it('expands one team', () => {
    expect(groupMemberIds('team', 't1', teams, members).sort()).toEqual(['u1', 'u2']);
  });

  it('expands a discipline across its teams', () => {
    expect(groupMemberIds('discipline', 'd1', teams, members).sort()).toEqual([
      'u1',
      'u2',
      'u3',
      'u5',
    ]);
  });

  it('expands a competition across its disciplines', () => {
    expect(groupMemberIds('competition', 'c1', teams, members).sort()).toEqual([
      'u1',
      'u2',
      'u3',
      'u4',
    ]);
  });

  it('counts someone on two teams once', () => {
    const ids = groupMemberIds('discipline', 'd1', teams, members);
    expect(ids.filter((id) => id === 'u1')).toHaveLength(1);
  });

  it('returns nothing for a group with no teams', () => {
    expect(groupMemberIds('team', 'nope', teams, members)).toEqual([]);
  });

  it('does not reach into another competition', () => {
    expect(groupMemberIds('competition', 'c1', teams, members)).not.toContain('u5');
  });
});

describe('mergeSelection', () => {
  it('adds the new ones', () => {
    expect(mergeSelection(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('does not duplicate someone already picked', () => {
    expect(mergeSelection(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps the existing order', () => {
    expect(mergeSelection(['b', 'a'], ['a'])).toEqual(['b', 'a']);
  });

  it('does not mutate its input', () => {
    const before = ['a'];
    mergeSelection(before, ['b']);
    expect(before).toEqual(['a']);
  });
});

describe('assignmentProblem', () => {
  it('refuses a blank title', () => {
    expect(assignmentProblem('   ', ['u1'])).toBe('no_title');
  });

  it('refuses an empty recipient list', () => {
    expect(assignmentProblem('Submit your waiver', [])).toBe('no_recipients');
  });

  it('passes a complete assignment', () => {
    expect(assignmentProblem('Submit your waiver', ['u1'])).toBeNull();
  });

  it('reports the title first, because it is the field nearest the top', () => {
    expect(assignmentProblem('', [])).toBe('no_title');
  });
});
