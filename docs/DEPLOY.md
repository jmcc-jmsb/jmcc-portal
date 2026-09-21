# Deploy checklist

Everything between a green `main` and real delegates using the portal. Nothing
here is structural — phases 0–7 are built and the `HANDOFF.md` §10 security
checklist is closed with its evidence.

Work top to bottom. Step 3 is the one that surprises people.

---

## 1. Ahead of time

- [ ] **DNS.** `portal` CNAME → the *project-specific* value Vercel shows in
      Settings → Domains (e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`), **not** the
      generic `cname.vercel-dns.com` in older guides. The record name is `portal`,
      not the full domain. Copy it exactly, trailing period included.
      `HANDOFF.md` §13 flags the lead time — file this first, not at deploy time.
- [ ] Supabase project created.

## 2. Database

- [ ] Apply migrations `0001` → `0009`, in order. Forward-only; never edit a
      committed one.
- [ ] Run `seed.sql` — disciplines, competitions, **and teams**.
      The team builder edits teams but does not create them (competition setup is
      still deferred), so this is what gives it something to work on.
- [ ] Run `seed_cabinet.sql` — the 22 pieces the awarding screen grants from.

## 3. The first user — read this before trying to sign in

**On an empty project nobody can sign in, including you.**

`SignInForm.tsx` passes `shouldCreateUser: false` on purpose — "a delegate exists
because an exec put them on a roster; an unknown address gets nothing rather than
a new user row." The only thing in the app that creates accounts is
`POST /api/admin/import`, and that requires an authenticated executive. So the
first auth user has to be created from outside the app, with the secret key.

- [ ] **Create it.** Supabase → Authentication → Users → Add user → Create new
      user. Tick **Auto Confirm User** — without a confirmed identity no magic
      link is issued. The password field is required by the form and unused by
      magic links.

      Or the admin API:

      ```bash
      curl -X POST "$PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SECRET_KEY" \
        -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
        -H "Content-Type: application/json" \
        -d '{"email":"you@example.com","email_confirm":true,
             "user_metadata":{"full_name":"Your Name"}}'
      ```

      `handle_new_user()` fires on the insert and creates the profile. Pass
      `full_name` in `user_metadata` or the profile is named after the email's
      local part.

- [ ] **Allowlist the callback.** Supabase → Authentication → URL Configuration →
      Redirect URLs needs `https://portal.jmccjmsb.ca/auth/callback`, and
      `http://localhost:4321/auth/callback` if you also want to sign in locally.

- [ ] **Sign in through the app.** You will land with **no permissions**. That is
      correct — roles are never self-service.

- [ ] **Grant yourself superuser**, as the service role:

      ```sql
      insert into user_roles (user_id, role)
      select id, 'superuser' from profiles where email = 'you@example.com';
      ```

- [ ] Reload `/app`. Admin appears under More: Members, Teams, Awards, Import,
      Audit. Everyone else arrives through the CSV import, which creates accounts
      properly.

## 4. Environment variables

**`.env.example` and the `env` schema in `astro.config.mjs` are authoritative** —
they are what the build reads, and they agree on all eleven variables.
`HANDOFF.md` §12 carries a convenience copy. Deliberately not repeated here: a
fourth list is a fourth thing to drift, which §12 already did once.

The two that bite:

- [ ] `SUPABASE_SECRET_KEY`, not the older `SUPABASE_SERVICE_ROLE_KEY`. The CI
      bundle scan greps for the `sb_secret_` prefix and the publishable key starts
      `sb_publishable_`, which is what makes that check precise.
- [ ] `PUBLIC_APP_URL=https://portal.jmccjmsb.ca` — the magic-link redirect is
      built from it.

## 5. DocuSeal

- [ ] Fill `DOCUSEAL_API_TOKEN` and `DOCUSEAL_WEBHOOK_SECRET`. `secretMatches()`
      refuses when nothing is configured, so an unfilled deploy is closed rather
      than open — the webhook will 401 quietly until you set them.
- [ ] Point the DocuSeal webhook at
      `https://portal.jmccjmsb.ca/api/webhooks/docuseal`.

## 6. Production hygiene

- [ ] **`PUBLIC_ENABLE_DEV_CONTROLS`.** It already defaults to `false` in
      `astro.config.mjs`, so the failure mode is not forgetting to set it — it is
      setting it to `true` on the host by pasting a local `.env`. Check the
      deployed environment, then confirm no role, vault or cabinet switcher
      renders.

## 7. Verification — the two that actually decide it

- [ ] **A delegate account on a phone cannot reach case materials via a direct
      API call one minute before release, and can one minute after.** `HANDOFF.md`
      calls this Phase 2's real acceptance criterion, not "the vault looks right".
- [ ] **The DocuSeal embed on a real iPhone, against `portal.jmccjmsb.ca`** —
      never a `*.vercel.app` preview. `portal.` and `sign.` are cross-origin but
      same-site under `jmccjmsb.ca`, which is what keeps Safari's tracking
      prevention from breaking the iframe. A preview passes and production fails.
- [ ] Lighthouse PWA audit against the deployed HTTPS URL.

---

## Open decisions — not blockers

| | |
|---|---|
| **CI exact-value secret scan** | `SUPABASE_SECRET_KEY` is not a repository secret, so that branch logs "scan skipped" on every run. The `sb_secret_` prefix grep is the check that earns its keep; enabling the other means storing the production secret in one more place. Recorded in `HANDOFF.md` §10. |
| **Health-data retention** | `allergies`, `dietary_restrictions`, `accessibility_needs` are RLS-fenced but kept indefinitely. Nothing promised otherwise, so the §10 item closes honestly — the question does not. Worth settling before a second season accumulates. |
| **A `0010` for coach eligibility** | `/api/admin/team` refuses a coach who holds no coaching role, which covers the UI. A constraint tying `team_coaches.coach_id` to a role row would close the direct-SQL path too. |

## Still to build — none of it blocks delegates

Promo composer UI · bulk "send reminder" from the documents matrix ·
competition setup UI (which is also what would let the portal create teams).
