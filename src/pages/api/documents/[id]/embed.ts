// ABOUTME: The signing URL for one assignment, resolved server-side.
// ABOUTME: The host comes from server env, so the client cannot be pointed at somebody else's signing server.
import type { APIRoute } from 'astro';
import { isResponse, json, requireUser } from '../../../../lib/server/api';
import { embedUrl, isDocusealConfigured } from '../../../../lib/server/docuseal';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const caller = await requireUser(ctx);
  if (isResponse(caller)) return caller;

  if (!isDocusealConfigured) return json({ error: 'docuseal_not_configured' }, 503);

  const id = ctx.params.id;
  if (!id) return json({ error: 'missing id' }, 400);

  /* assignments_read is subject-or-exec, so this returns nothing for a document
     that is not the caller's. That is the check — an embed URL is a signing
     session, and handing one to the wrong person is handing over the signature. */
  const { data, error } = await caller.supabase
    .from('document_assignments')
    .select('docuseal_slug')
    .eq('id', id)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);

  const slug = (data as { docuseal_slug: string | null } | null)?.docuseal_slug;
  if (!slug) return json({ error: 'not found' }, 404);

  return json({ url: embedUrl(slug) });
};
