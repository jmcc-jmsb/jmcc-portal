# Phase 5 — messaging

HANDOFF §9: "Channels, membership, Supabase Realtime, pinned messages,
announcement acknowledgements, group chat creation."

---

## A real bug the tests caught

`channels_write` was written as `for all using (is_exec(auth.uid()))`, matching
the pattern every earlier migration uses for exec-managed tables.

**A `FOR ALL` policy's `using` clause also applies to SELECT, and policies are
OR'd.** So that one line would have granted every executive read access to every
group chat and every direct message in the system, straight past the read policy
directly above it.

Caught by the assertion that an executive does not see team channels they are not
in — which failed with `got 1, expected 0` before anything was written on top of
it. The fix splits the policy per command.

I checked the earlier migrations for the same shape. Nine other tables use
`for all` for their write policy, and in every one of those the read policy
already grants the same people the same rows, so the widening is a no-op. This
was the only table where read and write were meant to differ — and it is exactly
the table where the difference matters most.

---

## Verified

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 98 unit tests pass |
| `npm run test:db` | 125 assertions pass |
| Channel list, group composer | render; Create stays disabled until the group is named |
| Console | 0 errors |

**Not verified: Realtime, and anything with a message in it.** The migrations are
still not applied to the Supabase project, so no subscription has ever been
opened against a live socket. The subscription code is written and typechecked;
whether messages actually arrive is untested.

---

## Decisions worth challenging

**A delegate cannot open a DM with an executive.** §5.5: "route that through
announcements or a team channel so it stays visible and doesn't turn one exec
into an unlogged help desk." `may_dm()` refuses it in the database rather than
hiding a button, because a hidden button stops working the moment someone reads
the API. Coaches are on the staff side and may DM either way.

**Group chats are exempt from that rule.** A group is visible to everyone in it,
which is the property that made the DM ban necessary in the first place. A
delegate may create a group that includes an executive.

**An executive does not see team channels, group chats or DMs they were not
added to.** They administer announcement and competition channels without being
a member, because that is a job. An exec who reads every study group by default
is a different product.

**Nobody edits somebody else's message, exec included.** A channel where a
message can change after it was read is not a record of what was said. Deleting
one is allowed for exec — moderation is a real need — but rewriting is not.

**Unread is derived, never stored.** `my_channels()` counts messages newer than
the caller's `last_read_at`, excluding their own. A stored counter drifts the
first time a write fails halfway.

**Sections keep a fixed order rather than sorting by recency.** Announcements
carry the deadlines; a bus time sinking below three chatty study groups is how
someone misses the bus. Unread floats to the top *within* a section.

**A channel is marked read on open, not on scroll position.** Tracking the
viewport to decide would make the badge argue with the user about what they read.

**Realtime is subscribed per channel, not globally.** A delegate in twelve
channels does not need twelve sockets to read one, and the channel list carries
its own counts. The migration also adds `messages` to the `supabase_realtime`
publication — without that a subscription reports SUBSCRIBED and then delivers
nothing forever, which is the quietest possible failure. It is guarded with an
existence check so the stock-Postgres test harness still runs.

**Author names come from `visible_profile_names()`**, not a `profiles` select.
A channel member is entitled to the name of whoever is talking, not to their
allergies — see migration 0004.

---

## Deferred, deliberately

- **The offline send queue.** HANDOFF §8 wants message sends queued in IndexedDB
  and flushed on reconnect, with a visible pending state. That is service-worker
  work and belongs with Phase 6; until then a failed send says so rather than
  pretending it went. Submissions and signing still never queue.
- **Attachments.** `messages.attachment_path` exists and the bucket pattern is
  established by case materials, but the composer has no picker yet.
- **Mentions.** §5.5 lists them; they need a notification channel to be worth
  anything, which is Phase 6 push.
- **Auto-provisioning team and competition channels.** A team gets a channel when
  someone creates one; wiring that to team creation belongs with the admin
  console in Phase 7.
- **The unread badge on the nav.** `totalUnread()` is written and tested; putting
  it on the tab bar means the shell polling the channel list, and that wants the
  service worker's caching rules to exist first.

---

## Security checklist (HANDOFF §10)

Still complete, and now with messaging covered:

- [x] RLS on every table — 23 tables
- [x] Case materials embargoed; internal feedback notes invisible
- [x] An executive cannot insert into `user_roles`
- [x] Secret key absent from the client bundle
- [x] DocuSeal webhook rejects a bad or missing secret
- [x] Messages are membership-scoped; announcement channels refuse delegate posts
- [x] A delegate cannot open a direct message with an executive
