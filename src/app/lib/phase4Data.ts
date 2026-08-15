// ABOUTME: Data hooks for documents and feedback — reads through RLS, writes through it too.
// ABOUTME: The one thing that needs a server route is assignment, because it talks to DocuSeal.
import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { DocumentAssignment, FeedbackNote, Rubric } from './feedback';
import { normaliseRubric } from './feedback';

export type DocumentTemplate = {
  id: string;
  name_en: string;
  name_fr: string;
  description: string | null;
  sort_order: number | null;
};

function useRows<T>(
  run: (supabase: ReturnType<typeof getSupabase>) => PromiseLike<{ data: unknown; error: unknown }>,
  deps: unknown[] = [],
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void Promise.resolve(run(getSupabase()))
      .then(({ data }) => !cancelled && setRows((data as T[] | null) ?? []))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { rows, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export function useTemplates() {
  const { rows, loading } = useRows<DocumentTemplate>((s) =>
    s.from('document_templates').select('id, name_en, name_fr, description, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false }),
  );
  return { templates: rows, loading };
}

/** Every assignment the caller may see: their own, or everyone's if they are exec. */
export function useAssignments() {
  const { rows, loading, reload } = useRows<DocumentAssignment & { template_id: string; user_id: string }>((s) =>
    s.from('document_assignments')
      .select('id, template_id, user_id, status, due_at, signed_at, signed_pdf_path, docuseal_slug'),
  );
  return { assignments: rows, loading, reload };
}

export function useNotes(subjectUserId?: string | null) {
  const { rows, loading, reload } = useRows<FeedbackNote>(
    (s) => {
      const query = s
        .from('feedback_notes')
        .select('id, author_id, subject_user_id, subject_team_id, competition_id, note_type, body, rubric, visibility, created_at')
        .order('created_at', { ascending: false });
      return subjectUserId ? query.eq('subject_user_id', subjectUserId) : query;
    },
    [subjectUserId],
  );
  return { notes: rows, loading, reload };
}

export function useCoverage() {
  const { rows, loading } = useRows<{ user_id: string; display_name: string; note_count: number; last_note_at: string | null }>(
    (s) => s.rpc('feedback_coverage'),
  );
  return { coverage: rows, loading };
}

/** The delegates a coach may write about. Exec sees everyone the profiles policy allows. */
export function useCoachedDelegates() {
  const { rows, loading } = useRows<{ id: string; full_name: string; preferred_name: string | null }>((s) =>
    s.from('profiles').select('id, full_name, preferred_name').order('full_name'),
  );
  return { delegates: rows, loading };
}

export async function addNote(input: {
  authorId: string;
  subjectUserId: string;
  noteType: 'coach_note' | 'self_reflection';
  body: string;
  rubric: Rubric | null;
  visibility: 'shared' | 'internal' | 'private';
}): Promise<string | null> {
  const { error } = await getSupabase().from('feedback_notes').insert({
    author_id: input.authorId,
    subject_user_id: input.subjectUserId,
    note_type: input.noteType,
    body: input.body,
    // Normalised before it goes in: jsonb accepts anything, so the clamp has to
    // happen on the way rather than on the way out.
    rubric: normaliseRubric(input.rubric),
    visibility: input.visibility,
  });
  return error?.message ?? null;
}

export async function deleteNote(id: string): Promise<string | null> {
  const { error } = await getSupabase().from('feedback_notes').delete().eq('id', id);
  return error?.message ?? null;
}

/** A short-lived link to the executed PDF. The path never reaches the client. */
export async function signedPdfUrl(assignmentId: string): Promise<string | null> {
  const res = await fetch(`/api/documents/${assignmentId}/pdf`, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string };
  return body.url ?? null;
}

export async function assignDocuments(templateId: string, userIds: string[], dueAt: string | null) {
  const res = await fetch('/api/documents/assign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ templateId, userIds, dueAt }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; assigned?: number };
  return res.ok ? { assigned: body.assigned ?? 0, error: null } : { assigned: 0, error: body.error ?? 'failed' };
}
