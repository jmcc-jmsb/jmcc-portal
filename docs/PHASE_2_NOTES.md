# Phase 2 — the vault

HANDOFF §9: "Cases schema and RLS, signed-URL endpoint, server time sync, all
five states, the exec upload-and-schedule form, submission with versioning and
live team state, submission monitor, dev state switcher. *Verify: a delegate
account cannot reach materials before release via a direct API call, not just
the UI.*"

---

## The acceptance criterion is met, and it is a test you can run

`npm run test:db` applies `00_shim.sql`, every migration, fixtures, and 36
assertions to a throwaway Postgres in Docker. No Supabase project needed.

The two that answer §9 directly, made as a delegate with no endpoint in the way:

```
ok  delegate reads zero case_materials before release
ok  delegate reads zero cases before release
```

**Tested in both directions.** A suite that only ever passes proves nothing, so
the embargo was broken deliberately — `release_at` moved into the past — and the
run fails as it should:

```
psql exit: 3
ERROR:  FAIL: delegate reads zero case_materials before release — got 2, expected 0
```

The rest of the 36 cover: audience scoping, executive bypass, coach visibility on
all three settings, force release, submission window enforcement, cross-team
isolation, submitting under another member's name, the audit log's write
restriction, and RLS being enabled on every table.

**This also closes the one Phase 1 checklist item that needed a database** —
HANDOFF §10, "an executive cannot insert into `user_roles`". It is now
`ok  an executive cannot grant themselves a role`.

### Why a shim rather than the Supabase CLI

`supabase/tests/00_shim.sql` recreates the pieces Supabase provides — `auth.uid()`,
`auth.users`, `storage.buckets`, and the `authenticated` role — on stock
Postgres. The CLI is not installed here and needs a login; Docker is not, and the
policies are the thing under test either way. `auth.uid()` is shimmed to read the
same `request.jwt.claims` setting PostgREST sets for a real JWT, so the tests
exercise the real policy expressions rather than a test-only shortcut.

The shim is **not** a migration and must never be applied to a real project. It
says so at the top of the file.

---

## Verified in a browser

Driven at the dev server with the vault state switcher, since there is still no
Supabase project:

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 34 unit tests pass |
| `npm run test:db` | 36 assertions pass |
| Sealed state | countdown, no title, no materials, no submit affordance |
| Open / submission / submitted / closed | all render from the switcher |
| Final-hour treatment | measured `#8a1119` background, `#fabb20` border — COMPONENT_MAP line 346 |
| Exec view | schedule form appears, submit panel absent, monitor present |
| Live work-window label | "Delegates get 5h 30m", and it catches a backwards window |
| French | zone renders HAE/HNE, times as "12 h 41" |
| Focus ring | `#680009`, 2px, 2px offset on cream |
| Console | one 503 from `/api/cases`, which is the not-configured path answering deliberately |

**Not verified: the endpoints against a live database.** Every route is written
and typechecked, and the policies they lean on are tested, but no request has
made a round trip to Supabase. That is the same gap Phase 1 left and it closes
the same way — see PHASE_1_NOTES "What is still needed".

---

## Two bugs found by driving it

1. **Two file controls in the accessibility tree.** The upload panel had an
   `sr-only` `<input type="file">` behind a styled button, which is a common
   pattern and puts both in the tree — a screen reader announced the same action
   twice. Now one native input inside the drop zone. Invisible on screen; obvious
   in the tree.
2. **`/api/cases` threw a 500 with a stack trace** on a checkout with no `.env`,
   because `createSessionClient` throws by design. `requireUser` now answers 503
   `not_configured`. A fresh clone is a normal state for this repo.

---

## Decisions worth challenging

**A sealed case hides its title, and hides it in SQL.** HANDOFF §6 refuses to
return filenames in a pre-release 403 because "a filename leaks the case topic".
A title leaks it harder, and DESIGN_BRIEF §5.7 state 1 lists what the sealed
panel shows — competition, discipline, duration, deliverable format — without
listing the title. So `cases` is invisible to a delegate until release, and the
sealed state reads through `my_cases()`, which nulls `title` and `description`
in the query. Doing the redaction in SQL means a later refactor of the
TypeScript cannot lose it.

**Draft is invisible, scheduled is sealed.** §5.7 step 6 says a scheduled case is
"invisible to delegates until its moment", which contradicts state 1 showing a
countdown. Resolved as: `draft` is the exec's working copy and is exec-only;
`scheduled` is what a delegate sees as sealed. If the intent was that delegates
should not know a case exists at all until it opens, that is a one-line change to
`my_cases()` — but it costs the countdown, which is the screen's whole idea.

**Five states, not five files.** COMPONENT_MAP names `VaultSealed`, `VaultOpen`,
`VaultSubmission`, `VaultSubmitted` and `VaultClosed`. They share chrome, the
timer, the materials list and the metadata block, and differ in one panel — so
they are one `CaseVault.tsx` with `deriveState()` deciding, plus components for
the parts that genuinely differ. The five states still exist as a tested union;
they are not five near-copies to keep in sync.

**The submission window is enforced twice.** The endpoint checks it against the
database clock, and the `submissions_insert` policy checks it again in `with
check`. The endpoint's version produces a decent error message; the policy's
version is the one that is true. The test suite exercises the policy directly.

**`submission_opens_at` is not asked for in the form.** The schema keeps it, and
the form sets it equal to `release_at`, because in every case JMCC runs uploads
open when the case drops. A third datetime field to express something nobody
wants is a field that gets set wrong.

**Times entered in the exec form are Montreal, not the device's zone.**
`datetime-local` yields a bare wall time and the browser's instinct is to read it
locally, so an exec scheduling from Vancouver would set the release three hours
off. `montrealLocalToIso()` resolves it twice to land on the right side of a DST
boundary; the tests cover the spring-forward day.

**French dates are `fr-CA`, not `fr`.** Bare `fr` renders the zone as "UTC−4",
which is correct and reads foreign on a Montreal schedule. `fr-CA` gives HAE/HNE.

**The dev fixture invents data, on purpose.** Phase 1 refused to render
plausible-looking placeholder rows. §5.7 explicitly asks for the opposite here —
"reviewers will not wait until Saturday at 8:00 AM to see state 2" — so the
switcher runs the vault on a fixture, gated on `PUBLIC_ENABLE_DEV_CONTROLS`, the
same flag as the role switcher. The live path still shows an honest empty state.

---

## Deferred, deliberately

- **The 600ms seal-break animation.** `--duration-seal` is reserved and the token
  is in `tokens.css`. A transition that fires on every re-render is worse than
  none, and it belongs with the motion pass rather than bolted to a state change.
- **Signed-URL caching and the offline rules** (HANDOFF §8, including "never
  cache a 403 from the materials endpoint"). Every API response already sends
  `cache-control: no-store`; the service worker that would otherwise cache one
  does not exist until Phase 6.
- **Notifying affected teams on an extension.** §5.7 pairs the action with a
  notification. The action, its forward-only guard and its audit entry are here;
  there is no notification channel until Phase 5.
- **Email/push on release.** Same reason.

---

## Files

| Path | What |
|---|---|
| `supabase/migrations/0003_cases.sql` | cases, materials, submissions, audit_log, helpers, RLS, buckets |
| `supabase/tests/*` | shim, fixtures, 36 assertions |
| `scripts/test-db.sh` | applies everything to a throwaway Postgres |
| `src/pages/api/time.ts` | the clock the countdown trusts |
| `src/pages/api/cases/index.ts` | list (redacted by the database), create |
| `src/pages/api/cases/[id]/materials.ts` | signed URLs, or a 403 that names nothing |
| `src/pages/api/cases/[id]/submit.ts` | window check, derived team, versioning, audit |
| `src/pages/api/cases/[id]/monitor.ts` | roster and submissions, scoped by policy |
| `src/pages/api/cases/[id]/schedule.ts` | force release, extend, close |
| `src/lib/limits.ts` | upload limits, shared by the server and the panel that states them |
| `src/app/lib/caseState.ts` | the five states, countdowns, Montreal time |
| `src/app/lib/serverTime.ts` | offset, resync, drift over 30s surfaced |
| `src/app/routes/Cases/*` | the vault, timer, materials, submit panel, monitor, schedule form |
| `src/app/components/dev/VaultStateSwitcher.tsx` | jump to any of the five states |

---

## Security checklist (HANDOFF §10) — status after Phase 2

- [x] RLS enabled on every table — asserted against `pg_tables` in the suite
- [x] A delegate JWT cannot select `case_materials` before `release_at` — tested
      with a direct query, and the test is proven to fail when the embargo is not
      in effect
- [x] An executive cannot insert into `user_roles` — carried over from Phase 1
- [x] Service role key absent from the client bundle — CI check, tested both ways
- [ ] A delegate cannot select internal `feedback_notes` — Phase 4
- [ ] DocuSeal webhook rejects a bad or missing secret — Phase 4
