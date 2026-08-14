# JMCC Delegate Portal

Astro 5 + React 19 islands + Tailwind 4 + Supabase, on Vercel at portal.jmccjmsb.ca.
Authenticated SPA at `/app`. Signing via self-hosted DocuSeal at sign.jmccjmsb.ca.

Read `docs/HANDOFF.md` for architecture and build order, `docs/DESIGN_BRIEF.md`
for features and copy, `docs/COMPONENT_MAP.md` for what each prototype screen
becomes. When they conflict, HANDOFF wins on anything touching data or security.

## Rules

- Never put a hex color in a component. Use Tailwind tokens.
- Tokens live in `src/styles/tokens.css` under `@theme`. Tailwind 4 is CSS-first —
  there is no `tailwind.config.mjs`, and adding one forks the design system.
- The seven brand tokens are shared with `jmcc-website`. Changing a value here
  means changing it there in the same breath.
- Brand assets and motion patterns are **imported, never reimplemented**.
  `src/assets/brand/` and `src/styles/brand.css` are verbatim copies of the main
  site's. A "close enough" rewrite is how two products stop feeling like one.
  See `docs/BRAND.md` for what came over and what deliberately did not.
- The wolf is structural, not decorative — app icon, loading state, empty states,
  cabinet crest. Not an ornament on every card.
- `gold` (#fabb20) and `sand` (#d8af74) on dark backgrounds only. Never on cream or white.
- Five type sizes: `meta` `body` `lead` `title` `display`. Nothing smaller than
  `meta`. Every form input is `lead` (16px) or iOS Safari zooms on focus.
- Service role key only in `src/lib/server/` and `src/pages/api/`. Never client-side.
- Every table has RLS. New table = new policy in the same migration.
- Never use `Date.now()` for anything time-sensitive. Use `lib/serverTime.ts`.
- Case release and submission windows are enforced server-side. Client checks are
  display only.
- Every user-facing string goes through i18n. EN and FR keys added together.
- Every interactive element has a visible `focus-visible` state. The ring uses
  `--focus-ring`; dark panels rebind it with `data-surface="dark"`.
- The shell uses `pt-safe-t` / `pb-safe-b`. A screen that ignores safe areas
  collides with the home indicator on a real iPhone.
- Migrations are forward-only and numbered. Never edit a committed migration.
- Dev-only controls (role, vault state, cabinet fill, offline) sit behind an env
  flag and never render in a production build.

## Verify before declaring a phase done

- `npm run build` and `npm run typecheck` pass
- The relevant boxes in `docs/HANDOFF.md` §10 are checked
