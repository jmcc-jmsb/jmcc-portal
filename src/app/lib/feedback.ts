// ABOUTME: Feedback note shapes — the four rubric axes, and the document progress line.
// ABOUTME: Pure. What a delegate may see is decided by RLS, never by filtering here.
export const RUBRIC_AXES = ['content', 'delivery', 'qa', 'teamwork'] as const;
export type RubricAxis = (typeof RUBRIC_AXES)[number];

export type Rubric = Partial<Record<RubricAxis, number>>;

export type FeedbackNote = {
  id: string;
  author_id: string;
  subject_user_id: string | null;
  subject_team_id: string | null;
  competition_id: string | null;
  note_type: 'coach_note' | 'self_reflection';
  body: string;
  rubric: Rubric | null;
  visibility: 'shared' | 'internal' | 'private';
  created_at: string;
};

export const RUBRIC_MIN = 1;
export const RUBRIC_MAX = 5;

/**
 * Clamp a rubric score into range.
 *
 * The inputs are 1–5 selects, so this only matters for a hand-built request —
 * but a 47 stored in a jsonb column is a number that renders as a bar off the
 * side of the screen forever, and there is no constraint on jsonb contents.
 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return RUBRIC_MIN;
  return Math.min(RUBRIC_MAX, Math.max(RUBRIC_MIN, Math.round(value)));
}

export function normaliseRubric(input: Rubric | null | undefined): Rubric | null {
  if (!input) return null;
  const out: Rubric = {};
  for (const axis of RUBRIC_AXES) {
    const value = input[axis];
    if (typeof value === 'number') out[axis] = clampScore(value);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The average across whatever axes were actually scored. Null when none were. */
export function rubricAverage(rubric: Rubric | null): number | null {
  if (!rubric) return null;
  const scores = RUBRIC_AXES.map((axis) => rubric[axis]).filter(
    (value): value is number => typeof value === 'number',
  );
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 10) / 10;
}

/**
 * Notes newest first.
 *
 * The delegate view is a timeline and the most recent note is the one that
 * matters; anything older is context.
 */
export function newestFirst(notes: FeedbackNote[]): FeedbackNote[] {
  return [...notes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * "3 of 5 documents complete".
 *
 * Rounded down deliberately — 4 of 5 is 80%, and a progress ring that reads 100%
 * with one document outstanding is worse than no ring.
 */
export function documentProgress(total: number, signed: number): { label: string; percent: number } {
  const percent = total === 0 ? 0 : Math.floor((signed / total) * 100);
  return { label: `${signed}/${total}`, percent };
}

export type DocumentStatus = 'not_started' | 'in_progress' | 'signed';

export type DocumentAssignment = {
  id: string;
  template_id: string;
  user_id: string;
  status: DocumentStatus;
  due_at: string | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
  docuseal_slug: string | null;
};

/**
 * Outstanding first, then by due date.
 *
 * A delegate opening this screen is asking "what do I still owe", so a signed
 * document sorting above an unsigned one would bury the answer.
 */
export function documentOrder(assignments: DocumentAssignment[]): DocumentAssignment[] {
  const rank: Record<DocumentStatus, number> = { not_started: 0, in_progress: 1, signed: 2 };
  return [...assignments].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (!a.due_at) return b.due_at ? 1 : 0;
    if (!b.due_at) return -1;
    return Date.parse(a.due_at) - Date.parse(b.due_at);
  });
}
