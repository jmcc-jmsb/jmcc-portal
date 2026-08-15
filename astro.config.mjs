// ABOUTME: Astro config — SSR on Vercel, React islands, Tailwind 4 via the Vite plugin.
// ABOUTME: Public pages opt into prerendering individually; everything under /app and /api is server-rendered.
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// The canonical host. Every absolute URL derives from it — never hardcode a
// hostname in a component or page. HANDOFF §13: `portal` needs a CNAME to the
// project-specific value Vercel shows in Settings → Domains, not the generic one.
export default defineConfig({
  site: 'https://portal.jmccjmsb.ca',

  // Server output, deliberately. HANDOFF §2: the portal is a PWA whose shell must
  // open instantly and navigate offline, so /app is one React root with
  // client-side routing rather than a static page per screen. Astro still owns
  // the build, the public pages and the API routes.
  output: 'server',
  adapter: vercel(),

  integrations: [react()],

  /* The hard rule from HANDOFF §3 — "only src/lib/server/ and src/pages/api/ may
     use the service role key" — enforced by the platform rather than by memory.
     `context: 'server', access: 'secret'` means importing one of these from
     client code is a build error, not a code-review catch. The CI grep in
     .github/workflows/ci.yml is the second line of defence.

     Client fields are optional so `npm run build` works on a checkout with no
     Supabase project yet; lib/supabase.ts fails loudly at runtime instead. */
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_APP_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_ENABLE_DEV_CONTROLS: envField.boolean({ context: 'client', access: 'public', default: false }),

      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      DOCUSEAL_BASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      DOCUSEAL_API_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      DOCUSEAL_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      VAPID_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
