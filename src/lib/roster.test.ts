// ABOUTME: Coach eligibility and the membership diff — the two things a bad save gets wrong.
// ABOUTME: Eligibility is a security rule, not a filter, so it is tested as one.
import { describe, expect, it } from 'vitest';
import { canCoach, coachEligible, isUnchanged, rosterDiff } from './roster';

describe('canCoach', () => {
  it('accepts a coach', () => {
    expect(canCoach(['coach'])).toBe(true);
  });

  it('accepts an executive and a superuser, who outrank the question', () => {
    expect(canCoach(['executive'])).toBe(true);
    expect(canCoach(['superuser'])).toBe(true);
  });

  it('refuses a delegate — this is the health-data rule, not a preference', () => {
    expect(canCoach(['delegate'])).toBe(false);
  });

  it('refuses someone with no roles at all', () => {
    expect(canCoach([])).toBe(false);
    expect(canCoach(undefined)).toBe(false);
  });

  it('accepts someone who is a delegate and also a coach', () => {
    expect(canCoach(['delegate', 'coach'])).toBe(true);
  });
});

describe('coachEligible', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const roles = new Map<string, string[]>([
    ['a', ['coach']],
    ['b', ['delegate']],
  ]);

  it('offers only those who may coach', () => {
    expect(coachEligible(people, roles).map((p) => p.id)).toEqual(['a']);
  });

  it('leaves out someone with no role row rather than defaulting them in', () => {
    expect(coachEligible(people, roles).map((p) => p.id)).not.toContain('c');
  });
});

describe('rosterDiff', () => {
  it('reports what was added and what was removed', () => {
    expect(rosterDiff(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('is empty when nothing moved', () => {
    expect(rosterDiff(['a', 'b'], ['b', 'a'])).toEqual({ added: [], removed: [] });
  });

  it('handles an empty roster being filled', () => {
    expect(rosterDiff([], ['a'])).toEqual({ added: ['a'], removed: [] });
  });

  it('handles a roster being emptied', () => {
    expect(rosterDiff(['a'], [])).toEqual({ added: [], removed: ['a'] });
  });
});

describe('isUnchanged', () => {
  it('is true for an empty diff', () => {
    expect(isUnchanged(rosterDiff(['a'], ['a']))).toBe(true);
  });

  it('is false when one person moved', () => {
    expect(isUnchanged(rosterDiff(['a'], ['b']))).toBe(false);
  });
});
