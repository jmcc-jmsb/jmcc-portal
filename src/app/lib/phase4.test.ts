// ABOUTME: Unit tests for Phase 4 — the constant-time secret check, rubrics, and document ordering.
// ABOUTME: The webhook comparison is tested here because a check only a live DocuSeal can exercise is a check nobody runs.
import { describe, expect, it } from 'vitest';
import { constantTimeEquals } from '../../lib/constantTime';
import {
  RUBRIC_AXES,
  clampScore,
  documentOrder,
  documentProgress,
  newestFirst,
  normaliseRubric,
  rubricAverage,
} from './feedback';
import type { DocumentAssignment, FeedbackNote } from './feedback';

describe('constantTimeEquals', () => {
  it('accepts an exact match', () => {
    expect(constantTimeEquals('s3cr3t-value', 's3cr3t-value')).toBe(true);
  });

  it('rejects a wrong value of the same length', () => {
    expect(constantTimeEquals('s3cr3t-valuf', 's3cr3t-value')).toBe(false);
  });

  it('rejects a matching prefix — the case a naive compare leaks', () => {
    expect(constantTimeEquals('s3cr3t', 's3cr3t-value')).toBe(false);
    expect(constantTimeEquals('s3cr3t-value-and-more', 's3cr3t-value')).toBe(false);
  });

  it('refuses when nothing is configured, rather than failing open', () => {
    // An unconfigured deploy accepting every webhook is the worst outcome here:
    // it looks like it works, and anyone can mark a document signed.
    expect(constantTimeEquals('anything', undefined)).toBe(false);
    expect(constantTimeEquals('anything', '')).toBe(false);
    expect(constantTimeEquals('anything', null)).toBe(false);
  });

  it('refuses a missing secret on the request', () => {
    expect(constantTimeEquals(undefined, 'expected')).toBe(false);
    expect(constantTimeEquals('', 'expected')).toBe(false);
    expect(constantTimeEquals(null, 'expected')).toBe(false);
  });

  it('refuses when both are empty — two blanks are not a match', () => {
    expect(constantTimeEquals('', '')).toBe(false);
  });

  it('handles non-ascii without throwing', () => {
    expect(constantTimeEquals('sécret-é', 'sécret-é')).toBe(true);
    expect(constantTimeEquals('sécret-e', 'sécret-é')).toBe(false);
  });
});

describe('rubric', () => {
  it('has the four axes the brief names', () => {
    expect([...RUBRIC_AXES]).toEqual(['content', 'delivery', 'qa', 'teamwork']);
  });

  it('clamps anything outside 1–5', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(47)).toBe(5);
    expect(clampScore(3.4)).toBe(3);
    expect(clampScore(Number.NaN)).toBe(1);
  });

  it('drops axes that were not scored rather than storing zeroes', () => {
    expect(normaliseRubric({ content: 4, delivery: 2 })).toEqual({ content: 4, delivery: 2 });
    expect(normaliseRubric({})).toBeNull();
    expect(normaliseRubric(null)).toBeNull();
  });

  it('averages only the axes that were scored', () => {
    expect(rubricAverage({ content: 4, delivery: 3 })).toBe(3.5);
    expect(rubricAverage({ content: 5 })).toBe(5);
    expect(rubricAverage({})).toBeNull();
    expect(rubricAverage(null)).toBeNull();
  });
});

function note(overrides: Partial<FeedbackNote> = {}): FeedbackNote {
  return {
    id: 'n1',
    author_id: 'coach',
    subject_user_id: 'delegate',
    subject_team_id: null,
    competition_id: null,
    note_type: 'coach_note',
    body: 'Strong open, thin Q&A.',
    rubric: null,
    visibility: 'shared',
    created_at: '2027-01-10T00:00:00Z',
    ...overrides,
  };
}

describe('note ordering', () => {
  it('puts the newest note first', () => {
    const sorted = newestFirst([
      note({ id: 'old', created_at: '2027-01-01T00:00:00Z' }),
      note({ id: 'new', created_at: '2027-02-01T00:00:00Z' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('does not mutate the array it was given', () => {
    const input = [note({ id: 'a', created_at: '2027-01-01T00:00:00Z' }), note({ id: 'b' })];
    newestFirst(input);
    expect(input.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('document progress', () => {
  it('reads as a fraction, not a percentage that rounds up to done', () => {
    // 4 of 5 is 80%. A ring that reads 100% with a waiver outstanding is worse
    // than no ring at all.
    expect(documentProgress(5, 4)).toEqual({ label: '4/5', percent: 80 });
    expect(documentProgress(3, 3)).toEqual({ label: '3/3', percent: 100 });
  });

  it('survives having nothing assigned', () => {
    expect(documentProgress(0, 0)).toEqual({ label: '0/0', percent: 0 });
  });
});

function assignment(overrides: Partial<DocumentAssignment> = {}): DocumentAssignment {
  return {
    id: 'a1',
    template_id: 't1',
    user_id: 'u1',
    status: 'not_started',
    due_at: null,
    signed_at: null,
    signed_pdf_path: null,
    docuseal_slug: null,
    ...overrides,
  };
}

describe('document ordering', () => {
  it('puts what you still owe above what you have done', () => {
    const sorted = documentOrder([
      assignment({ id: 'signed', status: 'signed' }),
      assignment({ id: 'started', status: 'in_progress' }),
      assignment({ id: 'untouched', status: 'not_started' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['untouched', 'started', 'signed']);
  });

  it('sorts by due date inside a status, undated last', () => {
    const sorted = documentOrder([
      assignment({ id: 'none' }),
      assignment({ id: 'later', due_at: '2027-03-01T00:00:00Z' }),
      assignment({ id: 'sooner', due_at: '2027-02-01T00:00:00Z' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['sooner', 'later', 'none']);
  });
});
