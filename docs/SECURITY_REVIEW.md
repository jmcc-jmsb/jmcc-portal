# Security review — before making this repository public

Run when the repo was about to be flipped from private to public so a Vercel
project could be created against it.

---

## What was checked

| Check | Method | Result |
|---|---|---|
| A `.env` ever committed | `git log --all --diff-filter=A` over every path ever added | Only `.env.example`, which holds names and no values |
| Secrets anywhere in history | `git grep` for `eyJ…`, `sb_secret_`, `sbp_`, `sk_live/test`, `ghp_`, `github_pat_`, `AKIA…`, PEM headers, across **every commit** | Two hits, both false positives: the CI job's own literal `'sb_secret_'`, and an npm integrity hash containing `eyJ` |
| Build output tracked | `git ls-files` for `dist/`, `.vercel/`, `node_modules/` | None tracked |
| Real email addresses | `git grep` over tracked files | None. Fixtures use `@jmcc.test`; the placeholder is `you@live.concordia.ca` |
| Phone numbers | pattern scan over tracked files | None. Hits were SVG path coordinates in gitignored build output |
| Credentials in docs | keyword scan of `docs/**.md` | None |
| Hostnames disclosed | URL extraction over tracked files | `portal.jmccjmsb.ca`, `sign.jmccjmsb.ca` — both already public DNS |

86 tracked files. Nothing found that needs history rewriting.

---

## One finding, fixed

**A teammate could read another delegate's allergies, emergency contact phone,
and accessibility needs.**

`profiles_read` (migration 0002) let teammates read each other's row so a roster
could render names. RLS is row-level, so the clause also handed over every other
column — including `allergies`, `dietary_restrictions`, `accessibility_needs`,
`emergency_contact_name` and `emergency_contact_phone`. Health-adjacent and
emergency data, readable by every other delegate on the team.

Confirmed by querying it as a teammate rather than by reading the policy:

```
--- What Dana (a teammate, NOT a coach or exec) can read about Drew: ---
 full_name  |    allergies    | emergency_contact_phone |  accessibility_needs
 Drew Alpha | peanuts, severe | 514-555-0199            | needs step-free access
```

Cross-team isolation held throughout — a delegate on another team read zero rows.

**Fixed in `0004_profile_privacy.sql`**, the same shape as `my_cases()` in 0003:
the row stops being readable and a `SECURITY DEFINER` function returns the
columns that were actually wanted. `visible_profile_names(ids)` returns names
only, and returns nothing for an id the caller has no relationship to, so it
cannot be used to enumerate the organisation one uuid at a time.

Five assertions now cover it, and the central one is proven to fail against the
pre-fix schema:

```
psql exit: 3
ERROR:  FAIL: a teammate cannot read another delegate's profile row — got 1, expected 0
```

**Impact today: none.** There is no Supabase project and no delegate data yet.
This had to be fixed before the first roster import, not before the repo went
public — the two are unrelated, and it was found because the review looked at
what the schema stores.

### Deliberately kept

A **coach retains full access to their own delegates'** dietary and accessibility
needs. A coach books meals and travels with the team, so that data is theirs to
act on. It is a decision rather than an oversight, and it is a one-line change in
0004 if JMCC would rather that sit with the executive only.

---

## What going public does and does not expose

**Does not expose anything that protects the system.** The security model is
row-level security evaluated against a verified JWT. Publishing the policies does
not weaken them — an attacker who reads `0003_cases.sql` learns that a delegate
gets zero rows before `release_at`, which is exactly what they would learn by
trying it. The anon key is designed to ship in a client bundle and is useless
without a session.

**Genuinely public after the flip:**

- Every RLS policy and the reasoning behind each one
- The phase notes, including which checklist items are still open
- `portal.jmccjmsb.ca` and `sign.jmccjmsb.ca`
- The design brief and the prototype export under `docs/prototype/`

None of that is a credential. The phase notes do describe known gaps, which is
worth being deliberate about — but they are gaps in *unbuilt* phases, and the
alternative is a team that cannot see its own risk register.

---

## Before real delegate data exists

- [ ] `PUBLIC_ENABLE_DEV_CONTROLS=false` in the Vercel production environment.
      Left true, it ships the role and vault-state switchers to delegates. They
      grant nothing — RLS answers to the JWT, not the switcher — but they are not
      for delegates to see.
- [ ] Apply `0004` along with the rest. Do **not** apply anything from
      `supabase/tests/`; the shim fakes `auth.uid()`.
- [ ] Confirm `case-materials` and `case-submissions` are private buckets. The
      migration creates them that way; do not create them by hand.
- [ ] If a service role key was ever pasted into a chat, a terminal that logs, or
      a shared doc, rotate it in Supabase → Settings → API before launch. Nothing
      in this repo has ever held one.
