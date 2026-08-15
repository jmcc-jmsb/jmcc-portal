# Phase 1 — foundation

HANDOFF §9: "Astro + Tailwind + React scaffold, tokens extracted. Supabase
project, identity/competitions/teams migrations, RLS helpers, seed data.
Magic-link auth. The `/app` shell: nav, top bar, safe areas, back stack, role
switcher, EN/FR toggle, focus styles."

---

## Verified

The acceptance test is *"log in, see the shell, switch roles, switch language,
tab through with visible focus."* Everything below was driven in a real browser
at 390×844 and 1280×800, not reasoned about:

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| Shell renders, mobile and desktop | tab bar below `md`, sidebar above |
| Role switcher | cycles all four; Administration appears for exec/superuser only (9 items → 10) |
| Language toggle | `<html lang>` flips, nav + home + form all translate |
| French length | widest tab label "Calendrier" 59px in a 78px cell; no overflow, no horizontal scroll |
| Focus ring | visible on every control; `#680009` on cream, `#fabb20` on maroon chrome |
| Back affordance | absent on tab roots, present on deep screens, returns correctly |
| Console | 0 errors |
| CI secret scan | passes on a real build **and** fails when a secret is planted — tested both directions |

**Not verified: sign-in.** There is no Supabase project yet, so the magic-link
round trip is code-complete but unexercised. See "What is still needed" below.

---

## Deviations

**Astro 7, not Astro 5.** HANDOFF §2 says Astro 5, but its stated reason is
"matches the main site" — and `jmcc-website` is on `astro@7.1.0`. Parity is the
point, so the portal matches the site. Tailwind is pinned to the site's exact
`4.3.3`.

**react-router 8, not 7.** Handoff says v7; 8 is the current major and the API
used here (`BrowserRouter`, `Routes`, `Link`, `useNavigate`) is unchanged.

**No `supabase/config.toml`.** The Supabase CLI is not installed here, so
shipping a hand-written config that was never validated against a running stack
would be worse than shipping none. `supabase init` generates it correctly.
Migrations, `seed.sql` and the bootstrap steps are all in place.

**No explicit back stack.** The prototype keeps a `stack` array (export lines
1062–1064) because it has no router. With react-router the browser history *is*
that stack, so the only thing left to decide is whether to show the control —
`isTabRoot()` in `lib/nav.ts`. Same behaviour, one less thing to keep in sync.

**`astro:env` in addition to the CI grep.** HANDOFF §3 asks for a CI step that
greps the client bundle for the service role key. That is in
`.github/workflows/ci.yml`. But Astro's own env schema does it better and
earlier: `context: 'server', access: 'secret'` makes importing a secret from
client code a *build* error. Both are in place — the grep still catches a key
pasted in as a literal, which no type system sees.

---

## Two bugs found by driving it

Worth recording because neither is visible in code review:

1. **`aria-current` never landed on the tab bar.** `NavLink` only applies it when
   react-router itself considers the link active, and a deep screen like
   `/cabinet` lights the *More* tab without matching its path. The tab read as
   current visually while exposing nothing to a screen reader. Now a plain
   `Link`, with one value driving both.
2. **Both `<nav>` elements had the same accessible name.** The sidebar and the
   tab bar were each labelled "Delegate Portal". Now "All sections" and "Main
   sections".

---

## What is still needed before sign-in works

1. **Create the Supabase project.** Then `PUBLIC_SUPABASE_URL`,
   `PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` into `.env`
   (see `.env.example`).
2. **Apply `supabase/migrations/` and `supabase/seed.sql`.**
3. **Allow the callback URL** — `{PUBLIC_APP_URL}/auth/callback` — in the
   Supabase dashboard under Authentication → URL Configuration. Magic links fail
   silently if it is not listed.
4. **Bootstrap the first superuser.** `handle_new_user()` grants no role on
   purpose, so the first sign-in has no permissions. The one SQL statement is at
   the bottom of `seed.sql`.
5. **File the DNS request.** HANDOFF §13 flags the lead time: `portal` CNAME to
   the project-specific value in Vercel → Settings → Domains, not the generic
   `cname.vercel-dns.com`.

`shouldCreateUser: false` on the sign-in call is deliberate — an address that is
not already on a roster gets nothing, rather than a new user row.

---

## Security checklist (HANDOFF §10) — status after Phase 1

- [x] RLS enabled on every table created so far (`profiles`, `user_roles`,
      `disciplines`, `competitions`, `teams`, `team_members`, `team_coaches`)
- [x] Service role key absent from the client bundle — CI check, tested both ways
- [ ] An executive cannot insert into `user_roles` — policy written
      (`roles_write`, superuser-only), **not yet exercised against a live JWT**
- [ ] Everything else is Phase 2+ (case materials, feedback notes, signed URLs,
      DocuSeal webhook, submission timestamps)

The role-write policy is the one Phase 1 item the checklist can actually close,
and it needs a database to test against. Do it as step 6 of the setup above.
