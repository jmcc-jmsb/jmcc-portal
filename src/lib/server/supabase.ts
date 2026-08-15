// ABOUTME: Server-side Supabase clients — a session-bound one (publishable key, RLS applies) and the admin one.
// ABOUTME: Never imported by client code; astro:env/server makes that a build error.
//
// Naming note: Supabase's current API keys are "publishable" and "secret"; the
// older names were "anon" and "service_role". They are the same two roles — a
// key safe to ship to a browser, and a key that bypasses RLS entirely — and
// these variables track what the dashboard calls them today.
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from 'astro:env/client';
import { SUPABASE_SECRET_KEY } from 'astro:env/server';
import type { AstroCookies } from 'astro';

/** Lets an endpoint answer "not configured" instead of throwing a stack trace at a fresh checkout. */
export const isSupabaseConfigured = Boolean(PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_PUBLISHABLE_KEY);

function requirePublicConfig() {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return { url: PUBLIC_SUPABASE_URL, publishable: PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

/**
 * The caller's own client, bound to their session cookies.
 *
 * This is what API routes should use for anything the caller is allowed to do,
 * because RLS still applies — it is the caller acting as themselves, on the
 * server. Reach for the admin client only when the operation genuinely exceeds
 * the caller's own rights (issuing a signed URL, writing audit_log, accepting a
 * webhook), and evaluate permission yourself first.
 */
export function createSessionClient(cookies: AstroCookies, headers: Headers): SupabaseClient {
  const { url, publishable } = requirePublicConfig();

  return createServerClient(url, publishable, {
    cookies: {
      // AstroCookies has no getAll(), and its get() only sees cookies Astro has
      // been asked about — so the request header is the reliable source for the
      // full set that @supabase/ssr needs to reassemble a chunked session.
      getAll() {
        return parseCookieHeader(headers.get('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          cookies.set(name, value, {
            ...options,
            path: options?.path ?? '/',
            httpOnly: true,
            sameSite: 'lax',
            // Secure everywhere except plain-HTTP localhost, where the browser
            // would otherwise drop the cookie and the session never sticks.
            secure: (PUBLIC_SUPABASE_URL ?? '').startsWith('https'),
          });
        }
      },
    },
  });
}

/**
 * The secret key. Bypasses RLS entirely.
 *
 * HANDOFF §3: only src/lib/server/ and src/pages/api/ may hold this. It is not a
 * convenience for "the query was awkward" — every use is a deliberate decision
 * that the server has already checked what the database no longer will.
 */
export function createAdminClient(): SupabaseClient {
  const { url } = requirePublicConfig();
  if (!SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is not set; refusing to fall back to the publishable key.');
  }

  return createClient(url, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
