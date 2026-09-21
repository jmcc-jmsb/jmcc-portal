// ABOUTME: The recipient picker's logic — accent folding, multi-term search, and the two select modes.
// ABOUTME: The component around this is rendering; everything that can be got wrong is in here.
import { describe, expect, it } from 'vitest';
import {
  displayName,
  filterRecipients,
  matchesQuery,
  selectedRecipients,
  toggleRecipient,
} from './recipients';
import type { Recipient } from './recipients';

const emilie: Recipient = { id: 'a', full_name: 'Émilie Tremblay', preferred_name: null };
const drew: Recipient = { id: 'b', full_name: 'Drew Alpha', preferred_name: null };
const alexandre: Recipient = { id: 'c', full_name: 'Alexandre Roy', preferred_name: 'Alex' };
const roster = [emilie, drew, alexandre];

describe('displayName', () => {
  it('prefers the preferred name', () => {
    expect(displayName(alexandre)).toBe('Alex');
  });

  it('falls back to the full name when the preferred one is blank', () => {
    expect(displayName({ ...alexandre, preferred_name: '   ' })).toBe('Alexandre Roy');
  });
});

describe('matchesQuery', () => {
  it('finds an accented name typed without the accent', () => {
    expect(matchesQuery(emilie, 'emilie')).toBe(true);
  });

  it('finds it typed with the accent too', () => {
    expect(matchesQuery(emilie, 'Émilie')).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesQuery(drew, 'DREW')).toBe(true);
  });

  it('matches terms in any order', () => {
    expect(matchesQuery(drew, 'alpha drew')).toBe(true);
  });

  it('requires every term to match', () => {
    expect(matchesQuery(drew, 'drew tremblay')).toBe(false);
  });

  it('searches the preferred name as well as the full one', () => {
    expect(matchesQuery(alexandre, 'alex')).toBe(true);
  });

  it('treats an empty query as matching everyone', () => {
    expect(matchesQuery(drew, '   ')).toBe(true);
  });
});

describe('filterRecipients', () => {
  it('narrows to the matches', () => {
    expect(filterRecipients(roster, 'roy').map((p) => p.id)).toEqual(['c']);
  });

  it('keeps a selected person visible even when they do not match', () => {
    // The reason this function exists: tick Drew, then type "roy", and Drew has
    // to stay on screen or there is no way to untick him.
    expect(filterRecipients(roster, 'roy', ['b']).map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('returns everyone when nothing is typed', () => {
    expect(filterRecipients(roster, '')).toHaveLength(3);
  });
});

describe('toggleRecipient', () => {
  it('adds in multi mode', () => {
    expect(toggleRecipient(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes in multi mode', () => {
    expect(toggleRecipient(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('replaces in single mode', () => {
    expect(toggleRecipient(['a'], 'b', 'single')).toEqual(['b']);
  });

  it('clears when the held one is picked again in single mode', () => {
    expect(toggleRecipient(['a'], 'a', 'single')).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    const before = ['a'];
    toggleRecipient(before, 'b');
    expect(before).toEqual(['a']);
  });
});

describe('selectedRecipients', () => {
  it('returns them in roster order, not tick order', () => {
    expect(selectedRecipients(roster, ['c', 'a']).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('ignores an id that is no longer on the roster', () => {
    expect(selectedRecipients(roster, ['gone'])).toEqual([]);
  });
});
