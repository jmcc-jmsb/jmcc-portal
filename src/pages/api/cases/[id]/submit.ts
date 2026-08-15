// ABOUTME: Team submission — server-validated window, derived team, versioned and audited.
// ABOUTME: Never trusts a client timestamp, a client team id, or a client filename.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../../lib/server/api';
import { createAdminClient } from '../../../../lib/server/supabase';
import {
  ALLOWED_SUBMISSION_EXTENSIONS,
  MAX_SUBMISSION_FILES,
  MAX_SUBMISSION_FILE_BYTES,
  SUBMISSIONS_BUCKET,
  loadCase,
  rejectSubmissionFile,
  submissionPath,
} from '../../../../lib/server/cases';

export const prerender = false;

/** Postgres unique_violation. Two teammates hitting submit in the same second. */
const UNIQUE_VIOLATION = '23505';

export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing case id' }, 400);

  const row = await loadCase(caller.supabase, id);
  if (!row) return json({ error: 'not found' }, 404);

  /* The window is judged against the database clock that my_cases() returned,
     not against this process's clock and certainly not against the browser's.
     HANDOFF §6: "A client that thinks the window is open still gets a 403." */
  const now = Date.parse(row.server_now);
  if (now < Date.parse(row.submission_opens_at)) {
    return json({ error: 'not_open', opensAt: row.submission_opens_at }, 403);
  }
  if (now >= Date.parse(row.submission_closes_at)) {
    return json({ error: 'closed', closedAt: row.submission_closes_at }, 403);
  }

  const { data: teamId, error: teamError } = await caller.supabase.rpc('my_team_for_case', {
    cid: id,
  });
  if (teamError) return json({ error: teamError.message }, 500);
  // Executives and coaches land here: they can see the case but are on no team
  // in it, and DESIGN_BRIEF §2 gives neither of them a submit action.
  if (!teamId) return json({ error: 'not_on_a_team' }, 403);

  const form = await ctx.request.formData().catch(() => null);
  if (!form) return json({ error: 'expected multipart form data' }, 400);

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return json({ error: 'no_files' }, 400);
  if (files.length > MAX_SUBMISSION_FILES) {
    return json({ error: 'too_many_files', max: MAX_SUBMISSION_FILES }, 400);
  }

  for (const file of files) {
    const reason = rejectSubmissionFile(file);
    if (reason) {
      return json(
        {
          error: `file_${reason}`,
          filename: file.name,
          maxBytes: MAX_SUBMISSION_FILE_BYTES,
          allowed: ALLOWED_SUBMISSION_EXTENSIONS,
        },
        400,
      );
    }
  }

  const admin = createAdminClient();
  const submissionId = crypto.randomUUID();

  // Upload before the row exists. The reverse order would let a failed upload
  // leave a submission row pointing at files that are not there — a team told it
  // handed something in when it did not. Orphaned objects are inert instead.
  const stored: { name: string; path: string; size: number }[] = [];
  for (const [index, file] of files.entries()) {
    const path = submissionPath(id, teamId as string, submissionId, index, file.name);
    const { error } = await admin.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) return json({ error: `upload failed: ${error.message}` }, 502);
    stored.push({ name: file.name, path, size: file.size });
  }

  const inserted = await insertWithNextVersion(caller.supabase, id, teamId as string, {
    submitted_by: caller.user.id,
    files: stored,
  });
  if ('error' in inserted) return json({ error: inserted.error }, inserted.status);

  await audit({
    actorId: caller.user.id,
    action: 'case.submit',
    entityType: 'case',
    entityId: id,
    metadata: { teamId, version: inserted.version, files: stored.map((f) => f.name) },
  });

  return json({ version: inserted.version, submittedAt: inserted.submittedAt, files: stored }, 201);
};

/**
 * Take the next version number for this team, retrying once if a teammate takes
 * it first.
 *
 * The unique constraint on (case_id, team_id, version) is what actually settles
 * the race — read-then-write cannot, at any isolation level Supabase gives a
 * REST client. One retry is enough: a third simultaneous submitter on the same
 * team in the same millisecond is not a case this needs to survive gracefully,
 * and they get a plain error rather than a wrong version.
 */
async function insertWithNextVersion(
  supabase: Parameters<typeof loadCase>[0],
  caseId: string,
  teamId: string,
  fields: { submitted_by: string; files: unknown },
): Promise<{ version: number; submittedAt: string } | { error: string; status: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest } = await supabase
      .from('case_submissions')
      .select('version')
      .eq('case_id', caseId)
      .eq('team_id', teamId)
      .order('version', { ascending: false })
      .limit(1);

    const version = ((latest as { version: number }[] | null)?.[0]?.version ?? 0) + 1;

    const { data, error } = await supabase
      .from('case_submissions')
      .insert({ case_id: caseId, team_id: teamId, version, ...fields })
      .select('version, submitted_at')
      .single();

    if (!error) {
      const inserted = data as { version: number; submitted_at: string };
      return { version: inserted.version, submittedAt: inserted.submitted_at };
    }
    if (error.code !== UNIQUE_VIOLATION) return { error: error.message, status: 403 };
  }
  return { error: 'version_conflict', status: 409 };
}
