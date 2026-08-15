# Phase 3 — cabinet, tasks, calendar

HANDOFF §9: "Seed the 26 pieces. Display-case rendering with labeled empty
plinths at all three fill states. Tasks with `is_system` locking. Calendar with
three views and event CRUD."

---

## Verified

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 65 unit tests pass |
| `npm run test:db` | 71 assertions pass |
| Cabinet, all three fill states | 0/12, 5/12, 12/12 — **12 plinths in every state** |
| Empty-state prompt | "YOUR FIRST PIECE" appears only when the cabinet is empty |
| Month grid | 42 cells, and still 42 after paging back a month |
| Week / Agenda | 7 day headings; agenda shows its empty state |
| Legend | shape + label per type, legible without colour |
| EN / FR | both screens translate; `<html lang>` follows |
| Console | 0 errors |

The browser pass ran against a dev server started with the Supabase variables
blanked in-process, because `/app` is gated now that the project is configured
and the migrations are not yet applied. Nothing in `.env` was touched.

---

## The 26 pieces are seeded as 22

`supabase/seed_cabinet.sql`, resolving PHASE_0_NOTES §2 as approved.

Eight of the export's 26 entries were not pieces but *awards* — a piece bound to
a competition or a year. `1st · JDCC` and `1st · JMUCC` are one piece earned
twice; `Season 2024–25` through `Season 2027–28` are one piece earned four
times. Keeping them as catalog rows meant adding rows every time JMCC added a
competition or a September, and the "N of 26" headline would climb with them —
so a returning delegate's cabinet would read *emptier* the longer they stayed.

The catalog is 5 placements + 1 season + 10 milestones + 6 commendations. Ten
are `is_repeatable`.

**One refinement on the Phase 0 sketch.** That note proposed rendering "one
plinth per competition-or-season the delegate is eligible for". That
reintroduces the problem it was solving: a delegate in five competitions would
see five `First place` plinths and the denominator would grow with their own
participation. Instead a repeatable piece is **one plinth that reads ×3**, and
`cabinet_for()` returns `earned_count`. The denominator is the number of piece
types, stable across a whole career. A test asserts it directly:

```
ok  a repeatable piece is one plinth that counts twice, not two plinths
ok  one season piece, not one per year — the denominator must not grow with time
```

---

## No new API endpoints, deliberately

Phase 2 routed the vault through `/api` because it needed things a browser must
not have: the secret key to sign a URL, a server clock the device cannot move,
and an audit trail the actor cannot forge.

None of that applies to tasks, events or awards. They are ordinary rows whose
visibility RLS already decides, so these screens read and write through the
browser client — the same path `session.tsx` has used since Phase 1. An endpoint
would be a second place for the same rules to be written down, and a second
place to get them wrong.

The one Phase 3 action that *would* need a server route is granting an award,
because HANDOFF §4 wants it in `audit_log` and only the secret key may write
there. Awarding is an admin flow (DESIGN_BRIEF §5.8: "Rare action, keep it in
Admin") and lands in Phase 7; the policy and its tests are already here.

---

## Decisions worth challenging

**A cabinet is private, and the policy is what makes it so.** DESIGN_BRIEF §5.8
calls delegate-vs-delegate comparison a demotivator. `awards_read` allows self,
exec, and a coach's own delegates — so a leaderboard is not a feature someone
declined to build, it is data the database will not return. `cabinet_for()`
re-checks the same relationships because a `SECURITY DEFINER` function bypasses
RLS; without that, passing any uuid would read that person's cabinet. Tested.

**Overdue turns over at midnight in Montreal, not after 24 hours.** A task due at
9am is not overdue at 10am the same day — it is still today's problem. Anything
else means a delegate's list reshuffles while they are looking at it.

**An undated task is Later, never Today.** A Today list that fills with undated
intentions stops being trusted, and Today is the only group that has to be true.

**Secret pieces are hidden by the policy, not the client.** `pieces_read`
excludes an unearned secret piece, so a delegate reading the API sees the same
silhouettes the UI draws — no list of what is hidden.

**The month grid is always six rows.** A real month spans four to six; a grid
that reflows as you page is unusable on a phone. Verified by paging back and
counting 42 cells both times.

**A deadline may not carry an end time**, enforced by a check constraint, because
DESIGN_BRIEF §5.2 renders deadlines as a rule across the day rather than a
block. The form stops offering the field rather than letting the save fail.

**The .ics is built client-side.** The file is a dozen lines derived from data
already on screen, and a round trip to generate it would fail exactly when a
delegate is offline and most wants their schedule. The escaping rules are the
only part that needed care, and they are tested.

---

## Deferred, deliberately

- **Assigning tasks downward** (exec/coach picking recipients). The policies are
  in 0005 and tested — a coach can assign to their own delegates and no further —
  but the recipient-picker UI belongs with the admin console in Phase 7.
- **The exec awarding flow**, for the audit-log reason above.
- **Linked-task generation from an event** (§5.2's "create linked task"
  checkbox). `tasks.linked_type` / `linked_id` and `batch_id` exist for it.
- **Attachments and attendee lists on the event sheet.** RSVPs write; reading the
  aggregate back is a Phase 5 concern alongside messaging.
- **Automatic milestone awards** ("First case submitted" on first submission).
  These want a trigger or a scheduled job, and getting one wrong grants a piece
  that cannot be quietly taken back.

---

## Security checklist (HANDOFF §10) — status after Phase 3

- [x] RLS enabled on every table — asserted against `pg_tables`, now 16 tables
- [x] A delegate cannot read `case_materials` before release
- [x] An executive cannot insert into `user_roles`
- [x] Secret key absent from the client bundle — CI, tested both ways
- [x] A delegate cannot read another delegate's cabinet, or award themselves
- [x] A system task cannot be deleted by anyone holding a JWT
- [ ] A delegate cannot select internal `feedback_notes` — Phase 4
- [ ] DocuSeal webhook rejects a bad or missing secret — Phase 4
