// ABOUTME: The embargo endpoint — signed URLs for a released case, a bare 403 before that.
// ABOUTME: HANDOFF §6 step 3 is the rule that matters here: a pre-release denial names no files.
import type { APIRoute } from 'astro';
import { audit, isResponse, json, requireUser } from '../../../../lib/server/api';
import { createAdminClient } from '../../../../lib/server/supabase';
import {
  MATERIALS_BUCKET,
  loadCase,
  materialPath,
  signMaterials,
} from '../../../../lib/server/cases';

export const prerender = false;

const MATERIAL_KINDS = ['case', 'exhibit', 'data', 'rubric'];

export const GET: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing case id' }, 400);

  const row = await loadCase(caller.supabase, id);

  /* 404, not 403, when the case is not in the caller's audience. A 403 would
     confirm that a case with this id exists, which is a different fact from the
     one we are willing to disclose. */
  if (!row) return json({ error: 'not found' }, 404);

  const serverNow = new Date().toISOString();

  if (!row.released) {
    // Everything in this response is already safe to know: the title and
    // description are nulled by my_cases() in SQL, and no material is named.
    // The countdown needs releaseAt, so releaseAt is what it gets.
    return json(
      {
        error: 'sealed',
        serverNow,
        releaseAt: row.release_at,
        submissionOpensAt: row.submission_opens_at,
        submissionClosesAt: row.submission_closes_at,
      },
      403,
    );
  }

  const materials = await signMaterials(caller.supabase, id);

  return json({
    serverNow,
    releaseAt: row.release_at,
    submissionOpensAt: row.submission_opens_at,
    submissionClosesAt: row.submission_closes_at,
    materials,
  });
};

/**
 * Exec upload, step 1 of the drop-and-schedule form.
 *
 * Multipart rather than a signed upload URL: handing a client a direct write
 * token to the materials bucket means the server never sees what landed there,
 * and this endpoint is also where sort_order and kind get decided.
 */
export const POST: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing case id' }, 400);

  const form = await ctx.request.formData().catch(() => null);
  if (!form) return json({ error: 'expected multipart form data' }, 400);

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return json({ error: 'no files' }, 400);

  const kinds = form.getAll('kinds').map(String);
  const admin = createAdminClient();
  const uploaded: { filename: string; kind: string }[] = [];

  for (const [index, file] of files.entries()) {
    const kind = MATERIAL_KINDS.includes(kinds[index]) ? kinds[index] : 'exhibit';
    const path = materialPath(id, file.name, `${index}`);

    const { error: uploadError } = await admin.storage
      .from(MATERIALS_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (uploadError) return json({ error: `upload failed: ${uploadError.message}` }, 502);

    // The row goes in on the caller's client, so materials_write decides whether
    // this person may attach anything to this case at all. An upload that gets
    // this far but fails the policy leaves an orphan object in the bucket, which
    // is inert — it has no row, so nothing can ever sign it.
    const { error: rowError } = await caller.supabase.from('case_materials').insert({
      case_id: id,
      filename: file.name,
      storage_path: path,
      kind,
      size_bytes: file.size,
      sort_order: index,
    });
    if (rowError) return json({ error: rowError.message }, 403);

    uploaded.push({ filename: file.name, kind });
  }

  await audit({
    actorId: caller.user.id,
    action: 'case.materials.upload',
    entityType: 'case',
    entityId: id,
    metadata: { count: uploaded.length, files: uploaded },
  });

  return json({ uploaded }, 201);
};
