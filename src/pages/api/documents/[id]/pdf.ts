// ABOUTME: Signed URL for an executed PDF — the subject or an executive, nobody else.
// ABOUTME: Same shape as case materials: RLS decides who may know, the secret key only signs.
import type { APIRoute } from 'astro';
import { isResponse, json, requireUser } from '../../../../lib/server/api';
import { createAdminClient } from '../../../../lib/server/supabase';

export const prerender = false;

const SIGNED_BUCKET = 'signed-documents';
const TTL_SECONDS = 15 * 60;

export const GET: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing id' }, 400);

  // The caller's own client: assignments_read is subject-or-exec, so someone
  // else's document simply is not there to be found.
  const { data, error } = await caller.supabase
    .from('document_assignments')
    .select('id, signed_pdf_path, status')
    .eq('id', id)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'not found' }, 404);

  const row = data as { signed_pdf_path: string | null; status: string };
  if (!row.signed_pdf_path) return json({ error: 'not_signed_yet', status: row.status }, 409);

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(SIGNED_BUCKET)
    .createSignedUrl(row.signed_pdf_path, TTL_SECONDS);

  if (signError || !signed) return json({ error: 'could not sign url' }, 502);

  return json({ url: signed.signedUrl, expiresIn: TTL_SECONDS });
};
