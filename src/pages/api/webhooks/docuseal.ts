// ABOUTME: DocuSeal completion webhook — verifies the shared secret, files the PDF, closes the task.
// ABOUTME: Unauthenticated by nature and at-least-once by contract, so it verifies hard and repeats safely.
import type { APIRoute } from 'astro';
import { audit, json } from '../../../lib/server/api';
import { createAdminClient } from '../../../lib/server/supabase';
import { fetchSignedPdf, secretMatches } from '../../../lib/server/docuseal';

export const prerender = false;

const SIGNED_BUCKET = 'signed-documents';

/** DocuSeal sends the configured secret as a header; the name varies by version. */
function providedSecret(headers: Headers): string | null {
  return (
    headers.get('x-docuseal-signature') ??
    headers.get('x-docuseal-secret') ??
    headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  );
}

type Payload = {
  event_type?: string;
  data?: {
    id?: number | string;
    submission_id?: number | string;
    status?: string;
    completed_at?: string;
    submission?: { id?: number | string; status?: string };
  };
};

export const POST: APIRoute = async (ctx) => {
  /* Step 1 of HANDOFF §7, before anything else touches the body. An endpoint
     that parses first and authenticates second is doing attacker-controlled work
     for free. secretMatches() also refuses when no secret is configured, so an
     unconfigured deploy is closed rather than open. */
  if (!secretMatches(providedSecret(ctx.request.headers))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const payload = (await ctx.request.json().catch(() => null)) as Payload | null;
  if (!payload) return json({ error: 'invalid JSON' }, 400);

  const submissionId = String(
    payload.data?.submission_id ?? payload.data?.submission?.id ?? payload.data?.id ?? '',
  );
  if (!submissionId) return json({ error: 'no submission id' }, 400);

  const admin = createAdminClient();

  const { data: assignment } = await admin
    .from('document_assignments')
    .select('id, user_id, status, signed_pdf_path')
    .eq('docuseal_submission_id', submissionId)
    .maybeSingle();

  /* "Ignore unknown IDs" (§7 step 2), and answer 200 while doing it. A 404 here
     would make DocuSeal retry forever over a submission that was never ours. */
  if (!assignment) return json({ ok: true, ignored: 'unknown submission' });

  const row = assignment as { id: string; user_id: string; status: string; signed_pdf_path: string | null };

  const completed =
    payload.event_type === 'submission.completed' ||
    payload.data?.status === 'completed' ||
    payload.data?.submission?.status === 'completed';

  if (!completed) {
    // Anything that is not completion is progress. Never downgrade a signed row:
    // a late-arriving "opened" retry must not un-sign a finished document.
    if (row.status !== 'signed') {
      await admin.from('document_assignments').update({ status: 'in_progress' }).eq('id', row.id);
    }
    return json({ ok: true, status: 'in_progress' });
  }

  /* Idempotent from here down. Webhooks are at-least-once (§7), so a repeat of a
     completion we already filed must not re-download the PDF or re-write the
     audit trail — it just agrees that the thing is done. */
  if (row.status === 'signed' && row.signed_pdf_path) {
    return json({ ok: true, status: 'signed', repeated: true });
  }

  let storagePath: string | null = row.signed_pdf_path;
  try {
    const pdf = await fetchSignedPdf(submissionId);
    if (pdf) {
      const path = `${row.user_id}/${row.id}.pdf`;
      const { error } = await admin.storage
        .from(SIGNED_BUCKET)
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (!error) storagePath = path;
    }
  } catch (cause) {
    // The signature is real whether or not we managed to file our copy. Recording
    // the completion and losing the PDF is recoverable; refusing the completion
    // because a download failed is not.
    console.error('[docuseal] pdf fetch failed', submissionId, cause);
  }

  await admin
    .from('document_assignments')
    .update({
      status: 'signed',
      signed_at: payload.data?.completed_at ?? new Date().toISOString(),
      signed_pdf_path: storagePath,
    })
    .eq('id', row.id);

  // Close the locked task this document created (§7 step 3).
  await admin
    .from('tasks')
    .update({ completed_at: new Date().toISOString() })
    .eq('linked_type', 'document')
    .eq('linked_id', row.id)
    .is('completed_at', null);

  await audit({
    actorId: row.user_id,
    action: 'document.signed',
    entityType: 'document_assignment',
    entityId: row.id,
    metadata: { submissionId, storedPdf: Boolean(storagePath) },
  });

  return json({ ok: true, status: 'signed' });
};
