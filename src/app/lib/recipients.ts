// ABOUTME: Who a picker may offer and which of them are chosen — the logic, with no React in it.
// ABOUTME: Lives here rather than in the component so it is testable the way every other lib is.

/**
 * The shape every recipient list shares.
 *
 * Deliberately the three columns `profiles_read` already hands an exec or a
 * coach. A picker that needed more than a name would be a picker that leaks
 * more than a name.
 */
export type Recipient = {
  id: string;
  full_name: string;
  preferred_name: string | null;
};

/** Preferred name wins. Someone who goes by Alex is not helped by a list of Alexandres. */
export function displayName(person: Recipient): string {
  return person.preferred_name?.trim() || person.full_name;
}

/**
 * Fold case and accents before comparing.
 *
 * Half this roster has an accent in it, and nobody types É on a phone to find
 * Émilie. Matching NFD-stripped means "emilie" finds her and so does "Émilie".
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Every term has to match somewhere, in any order — so "alpha drew" and
 * "drew alpha" both find Drew Alpha. A single substring match over the whole
 * query would find neither.
 */
export function matchesQuery(person: Recipient, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = fold(`${person.full_name} ${person.preferred_name ?? ''}`);
  return terms.every((term) => haystack.includes(term));
}

/**
 * The visible list: matches first, but never the people already chosen.
 *
 * Selected rows stay put while the query narrows — a checkbox that vanishes
 * because you typed is a checkbox you cannot untick, and the chips are not a
 * substitute for seeing the state you are editing.
 */
export function filterRecipients(
  people: Recipient[],
  query: string,
  selected: readonly string[] = [],
): Recipient[] {
  const chosen = new Set(selected);
  return people.filter((person) => chosen.has(person.id) || matchesQuery(person, query));
}

/**
 * Tick or untick, in whichever mode the picker is running.
 *
 * Single mode replaces rather than appends, and re-picking the same person
 * clears the field — the same thing a radio group cannot do, which is the one
 * reason this is not a radio group.
 */
export function toggleRecipient(
  selected: readonly string[],
  id: string,
  mode: 'single' | 'multi' = 'multi',
): string[] {
  const held = selected.includes(id);
  if (mode === 'single') return held ? [] : [id];
  return held ? selected.filter((each) => each !== id) : [...selected, id];
}

/** Chips render in roster order, not in the order someone happened to tick them. */
export function selectedRecipients(people: Recipient[], selected: readonly string[]): Recipient[] {
  const chosen = new Set(selected);
  return people.filter((person) => chosen.has(person.id));
}
