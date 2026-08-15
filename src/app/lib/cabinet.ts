// ABOUTME: Cabinet logic — fill state, the "N of M" line, and the résumé credential.
// ABOUTME: Pure. The shelves are grouped by category, never by year (DESIGN_BRIEF §5.8).
export const CABINET_CATEGORIES = ['placement', 'season', 'milestone', 'commendation'] as const;
export type CabinetCategory = (typeof CABINET_CATEGORIES)[number];

/** One row of cabinet_for(): a piece type, plus how many times this delegate holds it. */
export type CabinetPiece = {
  piece_id: string;
  code: string;
  name_en: string;
  name_fr: string;
  category: CabinetCategory;
  unlock_hint_en: string | null;
  unlock_hint_fr: string | null;
  is_secret: boolean;
  is_repeatable: boolean;
  tone: 'gold' | 'sand';
  shape: 'disc' | 'diamond' | 'bar';
  sort_order: number | null;
  earned_count: number;
  first_awarded_at: string | null;
  last_awarded_at: string | null;
};

export type FillState = 'empty' | 'partial' | 'full';

/**
 * The three states the display case has to hold.
 *
 * `empty` is the one that matters. DESIGN_BRIEF §5.8 calls a first-year's empty
 * cabinet "the highest-stakes moment on this screen" — it must read as a case
 * waiting to be filled, never as a shrug.
 */
export function fillState(pieces: CabinetPiece[]): FillState {
  const earned = pieces.filter((p) => p.earned_count > 0).length;
  if (earned === 0) return 'empty';
  return earned === pieces.length ? 'full' : 'partial';
}

/** "9 of 22 pieces earned". M counts piece types, so it does not grow with the calendar. */
export function progress(pieces: CabinetPiece[]): { earned: number; total: number } {
  return {
    earned: pieces.filter((p) => p.earned_count > 0).length,
    total: pieces.length,
  };
}

export function byCategory(pieces: CabinetPiece[]): { category: CabinetCategory; pieces: CabinetPiece[] }[] {
  return CABINET_CATEGORIES.map((category) => ({
    category,
    pieces: pieces.filter((p) => p.category === category),
  })).filter((shelf) => shelf.pieces.length > 0);
}

export function pieceName(piece: CabinetPiece, locale: string): string {
  return locale.startsWith('fr') ? piece.name_fr : piece.name_en;
}

export function pieceHint(piece: CabinetPiece, locale: string): string | null {
  return locale.startsWith('fr') ? piece.unlock_hint_fr : piece.unlock_hint_en;
}

/**
 * The nearest achievable piece, for the empty state's "Your first piece:" line.
 *
 * Picks the lowest-sort milestone that is unearned and labelled — milestones are
 * the entry-level shelf, and an unlabelled silhouette is no use as a suggestion.
 * Falls back to any labelled unearned piece so the line is never blank.
 */
export function nextPiece(pieces: CabinetPiece[], locale: string): CabinetPiece | null {
  const unearned = pieces.filter((p) => p.earned_count === 0 && pieceHint(p, locale));
  const milestone = unearned
    .filter((p) => p.category === 'milestone')
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
  return milestone[0] ?? unearned[0] ?? null;
}

/**
 * "1st place — JDCC 2027, Concordia JMCC (January 2027)".
 *
 * DESIGN_BRIEF §5.8: "this is where the cabinet quietly becomes a résumé". Plain
 * text on purpose — it is going into a Word document, not into this app.
 */
export function resumeLine(
  piece: CabinetPiece,
  locale: string,
  context: { competition?: string | null; awardedAt?: string | null },
): string {
  const name = pieceName(piece, locale);
  const parts = [name];
  if (context.competition) parts.push(context.competition);

  const when = context.awardedAt
    ? new Intl.DateTimeFormat(locale.startsWith('fr') ? 'fr-CA' : 'en-CA', {
        timeZone: 'America/Montreal',
        month: 'long',
        year: 'numeric',
      }).format(new Date(context.awardedAt))
    : null;

  const head = parts.join(' — ');
  return when ? `${head} (${when})` : head;
}
