# Phase 4 — documents and feedback

HANDOFF §9: "DocuSeal assignment, embed, webhook, PDF storage. Seed 120
delegates × 5 documents and test the exec matrix on a phone. Feedback notes with
all three visibility levels."

---

## The two checklist items this phase closes

HANDOFF §10 had two open items that needed Phase 4 to exist. Both are now
exercised rather than asserted.

### A delegate cannot select internal `feedback_notes`

The requirement is stronger than "cannot read the body": the brief says a
delegate must not be able to *infer that one exists*. So the row is absent, not
filtered — there is no count and no gap to notice:

```
ok  a delegate reads the note shared with them
ok  a delegate cannot read an internal note
ok  and the total they can count is their shared note plus their own reflection — no gap to infer from
```

The empty state is deliberately the same sentence whether or not internal notes
exist about that delegate, so it cannot become a tell either.

### The DocuSeal webhook rejects a bad or missing secret

Driven against a running endpoint with a known secret injected in-process:

| Request | Result |
|---|---|
| No secret header | **401** |
| Wrong secret | **401** |
| Same length, one byte off | **401** |
| A prefix of the real secret | **401** |
| The exact secret | **200** |

The last row also returns `{"ok":true,"ignored":"unknown submission"}` rather
than a 404 — an unknown id must not make DocuSeal retry forever over a
submission that was never ours (§7 step 2).

The comparison itself is constant-time and lives in `src/lib/constantTime.ts`,
which has no env imports so it has its own unit tests. `a === b` on a secret
exits at the first differing byte, and an attacker who can time the response can
walk the secret out one character at a time. Seven tests cover it, including the
two that matter most: a matching prefix is refused, and an **unconfigured secret
refuses everything** rather than failing open.

---

## Verified

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 82 unit tests pass |
| `npm run test:db` | 95 assertions pass |
| Webhook secret | rejects missing / wrong / one-byte-off / prefix; accepts exact |
| Documents screen | renders, EN and FR |
| Feedback screen | delegate empty state is the invitation, not an apology |
| Console | 0 errors |

**Not verified: anything that needs data.** The migrations are still not applied
to the Supabase project, and `DOCUSEAL_API_TOKEN` / `DOCUSEAL_WEBHOOK_SECRET`
are empty in `.env`, so:

- No DocuSeal submission has been created against the real instance.
- The signing embed has never been rendered with a live slug. HANDOFF §7 warns
  specifically that this **must not be tested against a `*.vercel.app` URL** —
  `portal.` and `sign.` are same-site under `jmccjmsb.ca`, and that is what keeps
  Safari's tracking prevention from breaking the iframe. It will pass on a
  preview URL and fail on an iPhone.
- The composer's rubric and visibility controls render only once a delegate is
  selected, and the delegate list is empty without a database — so that markup
  is unverified. The rubric maths is unit-tested; the controls are not.
- **The 120 × 5 matrix has not been driven at scale.** It is built for it —
  one scroll container, a sticky name column, condensed cells with a tap detail,
  sorted by outstanding count — but "survives 120 delegates on a phone" is a
  claim I cannot make until there are 120 delegates.

---

## Decisions worth challenging

**A coach cannot see their delegates' documents.** `assignments_read` is
subject-or-exec. A waiver or a medical form is an administrative matter between
the delegate and the executive; a coach knowing who has not signed their medical
form is not coaching information. Reversible in one clause if JMCC disagrees,
but it should be a decision rather than a default.

**An executive cannot rewrite a coach's note.** `notes_update` is author-only.
The exec view (§5.6) is about coverage — who has been missed — not content, and
a note that an exec can edit is no longer a record of what was said. Tested.

**An executive cannot read a private self-reflection.** `is_exec` deliberately
does not reach `visibility = 'private'`. A delegate journalling for themselves
stops the first time anyone discovers management can read it, which would make
the feature worse than absent.

**A self-reflection is private by constraint, not by convention.** Without
`self_reflection_is_private`, "self_reflection" would be a label a coach could
apply to a note about someone else, and the private level would stop meaning
anything. Tested with a direct insert.

**Emails come from the database, never the request.** `/api/documents/assign`
takes user ids and looks the addresses up. A recipient list supplied by a client
is a way to send a JMCC-branded signing request to anywhere.

**Exec status is checked in the endpoint as well as by RLS.** Assignment calls
out to DocuSeal *before* it writes anything. Left to RLS alone, a delegate could
make us create real submissions on a real signing server and only fail at the
last step — the rows refused, the submissions real.

**The embed URL is resolved server-side.** `/api/documents/[id]/embed` re-checks
that the assignment belongs to the caller, because an embed URL *is* a signing
session. Keeping the DocuSeal host out of the client is also what makes framing
the admin surface impossible rather than merely avoided.

**The webhook records the completion even if the PDF download fails.** The
signature is real whether or not we managed to file our copy. Losing the PDF is
recoverable; refusing the completion because a download failed is not.

**Never downgrade a signed row.** Webhooks are at-least-once, so a late "opened"
retry must not un-sign a finished document, and a repeated completion must not
re-download the PDF or re-write the audit entry.

---

## Deferred, deliberately

- **Seeding 120 delegates × 5 documents.** It needs a live database, and inventing
  120 fake people in `seed.sql` would put them in production. This belongs with
  the CSV import in Phase 7, against real roster data.
- **Bulk "send reminder"** from the matrix (§5.3). It needs a notification
  channel, which is Phase 5.
- **Team-subject feedback notes.** The schema and policies support
  `subject_team_id`; the composer only writes about individuals so far.
- **Coach nomination for commendations** (§5.8's "Coach nominates → exec awards").
  Nomination has no table yet; it belongs with the awarding flow in Phase 7.

---

## Security checklist (HANDOFF §10) — complete

- [x] RLS enabled on every table — asserted against `pg_tables`, now 19 tables
- [x] A delegate JWT cannot select `case_materials` before `release_at`
- [x] A delegate cannot select internal `feedback_notes`, and the UI leaks no
      count or gap
- [x] An executive cannot insert into `user_roles`
- [x] Secret key absent from the client bundle — CI, tested both ways
- [x] DocuSeal webhook rejects a bad or missing secret

Every item on the pre-launch checklist is now closed. What remains before real
delegate data is operational, not structural: apply the migrations, fill the two
DocuSeal secrets, and exercise the embed on an actual iPhone against
`portal.jmccjmsb.ca` rather than a preview URL.
