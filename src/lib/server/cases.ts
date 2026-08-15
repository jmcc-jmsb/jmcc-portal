// ABOUTME: Case rules the server owns — upload limits, signed URLs, and the caller's view of a case.
// ABOUTME: Server-only. The client mirrors the limits for its copy, but these are the ones that decide.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase';

/** HANDOFF §6: 15 minutes. Long enough to open a 40MB PDF on hotel wifi, short enough to matter. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

export const MATERIALS_BUCKET = 'case-materials';
export const SUBMISSIONS_BUCKET = 'case-submissions';

// The limits live in src/lib/limits.ts, which has no env imports and is therefore
// safe for the upload panel to import too. Re-exported here so endpoints have one
// obvious place to reach for everything about a case.
export {
  ALLOWED_SUBMISSION_EXTENSIONS,
  MAX_SUBMISSION_FILES,
  MAX_SUBMISSION_FILE_BYTES,
  extensionOf,
  rejectSubmissionFile,
} from '../limits';

export type CaseRow = {
  id: string;
  competition_id: string;
  discipline_id: string | null;
  /** Null until the case is released to this caller — my_cases() redacts it in SQL. */
  title: string | null;
  description: string | null;
  deliverable_format: string | null;
  release_at: string;
  submission_opens_at: string;
  submission_closes_at: string;
  coach_visibility: 'same' | 'early' | 'after';
  coach_release_at: string | null;
  audience_type: 'competition' | 'discipline' | 'teams';
  status: 'draft' | 'scheduled' | 'closed';
  force_released_at: string | null;
  released: boolean;
  server_now: string;
};

/**
 * Every case this caller may know about, already redacted and audience-filtered
 * by the database. See `my_cases()` in migration 0003 for why the projection
 * lives in SQL and not here.
 */
export async function listCases(supabase: SupabaseClient): Promise<CaseRow[]> {
  const { data, error } = await supabase.rpc('my_cases');
  if (error) throw new Error(`my_cases failed: ${error.message}`);
  return (data as CaseRow[] | null) ?? [];
}

export async function loadCase(supabase: SupabaseClient, id: string): Promise<CaseRow | null> {
  const rows = await listCases(supabase);
  return rows.find((row) => row.id === id) ?? null;
}

export type SignedMaterial = {
  id: string;
  filename: string;
  kind: string;
  sizeBytes: number | null;
  url: string;
};

/**
 * Sign what the caller has already been allowed to read.
 *
 * The `select` runs on the caller's own client, so RLS decides which rows exist
 * — pass an admin client here and the embargo quietly stops applying. Only the
 * signing step is privileged, because a private bucket has no policies to lean
 * on (0003 explains why it has none).
 */
export async function signMaterials(
  supabase: SupabaseClient,
  caseId: string,
): Promise<SignedMaterial[]> {
  const { data, error } = await supabase
    .from('case_materials')
    .select('id, filename, storage_path, kind, size_bytes, sort_order')
    .eq('case_id', caseId)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`case_materials failed: ${error.message}`);
  const rows = (data as
    | { id: string; filename: string; storage_path: string; kind: string; size_bytes: number | null }[]
    | null) ?? [];
  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from(MATERIALS_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);

  if (signError) throw new Error(`signing failed: ${signError.message}`);

  // createSignedUrls preserves input order and reports per-path errors rather
  // than throwing, so a single missing object degrades to one absent file
  // instead of an empty vault.
  return rows.flatMap((row, i) => {
    const url = signed?.[i]?.signedUrl;
    if (!url) {
      console.error('[cases] no signed URL for', row.storage_path, signed?.[i]?.error);
      return [];
    }
    return [{ id: row.id, filename: row.filename, kind: row.kind, sizeBytes: row.size_bytes, url }];
  });
}

/**
 * Storage keys are derived, never taken from the client.
 *
 * A filename arriving over the wire can contain `../`, a null byte, or 300
 * characters of unicode; joining that onto a bucket path is how one team
 * overwrites another's submission. The original name is kept in the database
 * row, which is the right place for it.
 */
export function submissionPath(caseId: string, teamId: string, submissionId: string, index: number, filename: string): string {
  // Keyed by submission id rather than version number so that losing a version
  // race is a cheap re-insert instead of a re-upload of everything.
  return `${caseId}/${teamId}/${submissionId}/${index}-${safeName(filename)}`;
}

export function materialPath(caseId: string, filename: string, unique: string): string {
  return `${caseId}/${unique}-${safeName(filename)}`;
}

function safeName(filename: string): string {
  const cleaned = filename
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '');
  return cleaned.slice(0, 120) || 'file';
}
