// ABOUTME: The only module that holds the DocuSeal API token — submissions, PDF fetch, webhook verification.
// ABOUTME: HANDOFF §7: the token comes from env and never reaches a client bundle.
import { DOCUSEAL_API_TOKEN, DOCUSEAL_BASE_URL, DOCUSEAL_WEBHOOK_SECRET } from 'astro:env/server';
import { constantTimeEquals } from '../constantTime';

export const isDocusealConfigured = Boolean(DOCUSEAL_BASE_URL && DOCUSEAL_API_TOKEN);

function baseUrl(): string {
  if (!DOCUSEAL_BASE_URL) throw new Error('DOCUSEAL_BASE_URL is not set.');
  return DOCUSEAL_BASE_URL.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  if (!DOCUSEAL_API_TOKEN) throw new Error('DOCUSEAL_API_TOKEN is not set.');
  return { 'X-Auth-Token': DOCUSEAL_API_TOKEN, 'content-type': 'application/json' };
}

export type CreatedSubmission = {
  submissionId: string;
  slug: string;
  email: string;
};

/**
 * Create one submission per recipient from a template.
 *
 * `send_email: false` on purpose — the portal is the tracker and the delegate
 * signs in the embedded panel. A second channel telling them to click a
 * different link is how a signature ends up outside the system that has to
 * report on it.
 */
export async function createSubmissions(
  templateId: string,
  recipients: { email: string; name?: string }[],
): Promise<CreatedSubmission[]> {
  const res = await fetch(`${baseUrl()}/api/submissions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      template_id: Number(templateId) || templateId,
      send_email: false,
      submitters: recipients.map((r) => ({ email: r.email, name: r.name })),
    }),
  });

  if (!res.ok) {
    throw new Error(`DocuSeal submission failed: ${res.status} ${await res.text()}`);
  }

  /* DocuSeal returns the submitters it created, each with its own slug — the
     slug is what the embed points at, and it is per person, not per submission.
     Shapes differ a little across versions, so both are tolerated rather than
     assuming one. */
  const body = (await res.json()) as unknown;
  const rows = Array.isArray(body)
    ? body
    : ((body as { submitters?: unknown[] }).submitters ?? []);

  return (rows as Record<string, unknown>[]).map((row) => ({
    submissionId: String(row.submission_id ?? row.id ?? ''),
    slug: String(row.slug ?? ''),
    email: String(row.email ?? ''),
  }));
}

/** The executed PDF, fetched server-side so the file lands in our storage, not a link to theirs. */
export async function fetchSignedPdf(submissionId: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`${baseUrl()}/api/submissions/${submissionId}`, { headers: headers() });
  if (!res.ok) return null;

  const body = (await res.json()) as { documents?: { url?: string }[]; combined_document_url?: string };
  const url = body.combined_document_url ?? body.documents?.[0]?.url;
  if (!url) return null;

  const file = await fetch(url);
  return file.ok ? await file.arrayBuffer() : null;
}

/**
 * Constant-time comparison of the webhook's shared secret. HANDOFF §7 step 1.
 *
 * The comparison itself lives in src/lib/constantTime.ts, which has no env
 * imports and therefore has its own unit tests. This function is only the part
 * that knows which secret to compare against.
 */
export function secretMatches(provided: string | null | undefined): boolean {
  return constantTimeEquals(provided, DOCUSEAL_WEBHOOK_SECRET);
}

/** Where the embed points. Never the admin surface — that would hand over every submission. */
export function embedUrl(slug: string): string {
  return `${baseUrl()}/s/${slug}`;
}
