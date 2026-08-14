// ABOUTME: Browser Supabase client for the SPA — anon key only, so every read is RLS-checked.
// ABOUTME: Cookie-based so the session it holds is the same one the Astro server sees.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';

/* This client is the only one client code may ever hold. It carries the anon key,
   so the database answers it exactly as far as RLS allows and no further — a
   delegate querying case_materials before release gets zero rows here, not a
   filtered UI. The service role client lives in src/lib/server/ and cannot be
   imported from here; astro:env makes that a build error. */

/* Annotated rather than inferred. Without a generated Database type,
   createBrowserClient's inferred return leaves every query result implicitly
   `any`, which silently switches off type checking at exactly the layer where
   RLS mistakes surface. Replace with SupabaseClient<Database> once
   `supabase gen types` has a project to run against. */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  // Optional in the env schema so a fresh checkout builds. Failing here is
  // deliberate and loud: a silent no-op client would look like an auth bug.
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set ' +
        'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  client = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  return client;
}

/** True when the app has credentials to talk to. Lets the shell render a clear
 *  "not configured" state instead of throwing on first paint. */
export const isSupabaseConfigured = Boolean(PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY);
