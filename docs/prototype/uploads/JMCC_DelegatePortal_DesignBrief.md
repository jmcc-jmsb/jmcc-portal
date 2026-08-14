# JMCC Delegate Portal — Prototype Design Brief

**For:** Claude Design (v1 clickable prototype)
**Owner:** Christopher Chadirdjian, VP Technology & Innovation, JMCC 2026–2027
**Status:** Prototype only — mock data, no backend
**Target:** Phase 1 MVP visual + interaction prototype, ready for exec review before the September soft-launch

---

## 1. What this is

A single web app that a JMCC delegate lives inside for their entire competition season: what's happening, what they owe, what they've signed, what their case is, and who they need to talk to. It replaces a scattered mess of group chats, Google Drive folders, email blasts, and paper waivers.

It is the third surface in a three-part system that shares one identity:

| Surface | Purpose | Relationship to the portal |
|---|---|---|
| **jmccjmsb.ca** (Astro/Tailwind) | Public marketing site | Same design system; portal is linked from it |
| **News & Resources Dashboard** | Discipline-filtered news feed | Embeds into the portal as a tab in a later phase |
| **Delegate Portal** *(this project)* | Authenticated member workspace | The hub |

They must look like one product. Do not invent a new visual language — the token system in §3 is locked.

**Design the mobile view first.** Delegates use this standing in a hotel lobby at 7:40 AM with 12% battery. Desktop is the secondary view (and the primary one for coaches and executives).

---

## 2. Roles

Four roles. The prototype should include a **role switcher** in the top bar (dev-only affordance, visibly marked) so reviewers can jump between views without separate logins.

| Role | Who | Mental model |
|---|---|---|
| **Superuser** | VP Technology (one person) | Sees everything, configures everything, only role that can change roles and permissions |
| **Executive** | JMCC exec team (~28 members) | Runs the operation: posts events, manages the calendar, releases cases, assigns documents, monitors submissions |
| **Coach** | Alumni / faculty / senior delegates attached to specific teams | Sees only their assigned teams. Their job is feedback. |
| **Delegate** | Competing students | Sees only what's theirs: their schedule, their tasks, their case, their team |

### Permission matrix

| Feature | Superuser | Executive | Coach | Delegate |
|---|---|---|---|---|
| Calendar — view | All events | All events | Their teams' events | Their events only |
| Calendar — create/edit | ✅ | ✅ | ❌ | ❌ |
| Documents — assign & track | ✅ | ✅ | View own only | Sign own only |
| To-do — assign to others | ✅ | ✅ | To their delegates | ❌ |
| To-do — own list | ✅ | ✅ | ✅ | ✅ |
| Channels — create | ✅ | ✅ | ❌ | ❌ |
| Channels — post | All | All | Their team channels | Their team + open channels |
| Feedback notes — write | ✅ | ✅ | ✅ (primary author) | Self-reflection notes only |
| Feedback notes — read | All | All (aggregate) | Their delegates | Notes written *about* them |
| Cases — release / set timers | ✅ | ✅ | ❌ | ❌ |
| Cases — access materials | Always | Always | At release time (see §5.7) | Only during open window |
| Cases — submit | ❌ | ❌ | ❌ | ✅ (any team member) |
| Promo / event ads — publish | ✅ | ✅ | ❌ | ❌ |
| Cabinet — view own | ✅ | ✅ | ✅ | ✅ |
| Cabinet — view others' | ✅ | ✅ | Their delegates | ❌ |
| Cabinet — award / revoke | ✅ | ✅ | Nominate only | ❌ |
| Admin console | ✅ | Partial | ❌ | ❌ |

**Design principle:** roles differ by *density*, not by *layout*. A delegate sees three cards where an executive sees a table of forty rows — same shell, same navigation, same components. Don't build four different apps.

---

## 3. Design system — locked

Inherit exactly from the website rebuild and news dashboard.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| `primary` | `#680009` | Deep maroon. Brand surfaces, headers, primary buttons, dark panels |
| `cream` | `#f7f3ec` | Default page background, light cards |
| `gold` | `#fabb20` | Accent — **dark backgrounds only** |
| `sand` | `#d8af74` | Secondary accent — **dark backgrounds only** |
| `muted` | `#5e5c5a` | Body text on cream, borders, secondary labels |

**Hard rule:** `gold` and `sand` never sit on `cream` or white — they fail WCAG AA. On light surfaces, use `primary` for emphasis and `muted` for de-emphasis. Gold on maroon is the signature contrast pairing and should feel earned, not sprayed everywhere.

Derive semantic states from these rather than importing a stock palette: success reads as a deep forest that sits beside maroon without clashing, warning uses `gold` on a dark chip, danger is a brighter red clearly distinguishable from `primary`. Keep them muted — this is not a dashboard that needs to look like a trading terminal.

### Typography

- **Display:** Unbounded Bold — page titles, section headers, numerals in countdowns, trophy names. Used with restraint; it's a wide face and gets loud fast.
- **Body/UI:** Montserrat — everything else. 400 for body, 600 for labels and buttons.
- Type scale should be tight and deliberate. Avoid more than five sizes across the whole app.

### Iconography & motif

Wolf iconography is JMCC's mark. Use it sparingly and structurally — the loading state, the empty states, the app icon, the trophy cabinet crest. Not as decoration on every card.

### Signature element

**The case vault.** A sealed, dark-maroon panel with a gold countdown that physically unseals when release time hits. This is the one place to spend visual boldness — everything else stays quiet and disciplined around it. See §5.7.

---

## 4. Navigation & shell

**Mobile:** bottom tab bar with five items (Home, Calendar, Cases, Messages, More). Everything else lives under More.
**Desktop:** left sidebar, persistent, collapsible to icons.

Nav items, in order:

1. **Home** — role-aware dashboard
2. **Calendar**
3. **Cases**
4. **Tasks** (to-do)
5. **Messages**
6. **Documents** (signing)
7. **Feedback**
8. **My Cabinet** — personal trophy cabinet
9. **Admin** *(Superuser + Executive only)*

Top bar: JMCC wordmark, language toggle (**EN / FR**), notification bell, avatar menu, and the prototype role switcher.

**Bilingual:** the app ships EN/FR. For the prototype, build the EN version fully and demonstrate the FR toggle on the nav, home screen, and one form so the layout is proven against longer French strings. French labels run roughly 20–30% longer than English — nothing in the nav or button set may rely on a tight English word count. ("Tasks" → "Tâches", but "My Cabinet" → "Mon palmarès", "Documents" → "Documents", "Feedback" → "Rétroaction").

---

## 5. Screens

### 5.1 Home (role-aware)

The single most important screen. It answers "what do I need to do right now."

**Delegate view** — a vertical priority stack:

```
┌──────────────────────────────────────────┐
│  Good morning, Sofia                      │
│  Jeux du Commerce · Marketing · Team 3    │
├──────────────────────────────────────────┤
│  ▸ NEXT UP                                │
│  Case release  ·  in 2d 14h 06m           │  ← live countdown
├──────────────────────────────────────────┤
│  ▸ NEEDS YOU  (2)                         │
│  ☐ Sign: Media release form      [Sign]   │
│  ☐ Submit dietary restrictions   [Open]   │
├──────────────────────────────────────────┤
│  ▸ TODAY                                  │
│  09:00  Practice case — MB 3.210          │
│  18:30  Delegate social — Reggie's        │
├──────────────────────────────────────────┤
│  ▸ [ EVENT PROMO SLOT ]                   │  ← see §5.9
├──────────────────────────────────────────┤
│  ▸ RECENT                                 │
│  #team-3-marketing  · 4 new               │
│  Coach note from D. Lavoie · unread       │
└──────────────────────────────────────────┘
```

**Executive view:** same stack, different content — pending signature count with a completion bar, submission monitor for any live case, unresolved feedback, upcoming events they own, and a quick-action row (Post announcement · Create event · Release case).

**Coach view:** their teams as cards, each showing team name, discipline, next milestone, and an unread-feedback-thread indicator.

**Superuser view:** the executive view plus a system strip (active users, DocuSeal sync status, storage, error count).

### 5.2 Calendar

- Three views: **Month**, **Week**, **Agenda**. Agenda is the mobile default.
- Event types are color-coded and legible in monochrome too (use a small shape/icon marker, not color alone): Competition · Practice · Deadline · Social · Admin.
- Deadlines render as a distinct marker — a rule across the day rather than a block — because they're points, not durations.
- Tapping an event opens a detail sheet: time, location (with map link), description, who's attending, attachments, and an "Add to my calendar" (.ics) action.
- Filter chips: My events / All events / By competition / By team.
- Executives get a create/edit flow: title, type, date/time, location, audience selector (everyone / competition / team / role), and an optional "create linked task" checkbox that generates to-do items for the selected audience.

### 5.3 Documents & signing

Wraps the existing self-hosted DocuSeal instance (`sign.jmccjmsb.ca`). The portal is the tracker; DocuSeal is the signing engine.

**Delegate:** a checklist of assigned documents, each showing status (`Not started` / `In progress` / `Signed ✓`), due date, and a **Sign** button that opens DocuSeal in an embedded panel. On return, the row flips to Signed with the timestamp and a link to download the executed PDF. Progress indicator at top: "3 of 5 documents complete."

**Executive:** a matrix — delegates down the rows, document templates across the columns, cells showing status. Filter by competition, sort by outstanding count, bulk **Send reminder** action, export CSV. This screen must survive 120 delegates × 5 documents without becoming unreadable; consider a condensed cell state with a hover/tap detail.

Design the embedded DocuSeal panel with a visible frame and a "Signing powered by DocuSeal — secure" caption, so the visual shift into a third-party surface reads as intentional rather than broken.

### 5.4 Tasks (to-do)

Personal, but assignable downward.

- Grouped by **Overdue / Today / This week / Later / Done**.
- Each task: title, source badge (Auto · From exec · From coach · Self), due date, optional linked destination (a document, a case, an event).
- Tasks generated by the system are marked as such and can't be deleted, only completed — this keeps waivers from vanishing.
- Delegates can add their own personal tasks freely.
- Executives/coaches get an assign flow: pick recipients (individual, team, discipline, or everyone in a competition), title, due date, optional link.
- Completion should feel good — a single crisp micro-interaction, gold check on maroon. One moment, not a confetti storm.

### 5.5 Messages / channels

Slack-lite, deliberately limited.

- **Channel list** grouped by: Announcements (read-only, exec-posted), Competition-wide, Team, Group chats, Direct messages.
- **Who can message whom:** delegate ↔ delegate, delegate ↔ coach, and user-created group chats across those lines. Delegates cannot DM executives outside a channel — route that through announcements or a team channel so it stays visible and doesn't turn one exec into an unlogged help desk.
- **Group chats** are user-created, named, with an add/remove members flow. Practically these become study groups and travel-logistics threads, so keep creation cheap: name, pick members, done.
- **Channel view:** message list, composer with attachment and mention support, pinned messages at top.
- Announcement channels look visually distinct — maroon header band, no composer for delegates, optional "acknowledge" button so execs can confirm a message landed.
- Unread state is a count badge on the nav plus a bold channel name. No red dots everywhere.
- Coaches see only their team channels and DMs.
- Prototype scope: static conversations, working composer that appends locally, no realtime.

### 5.6 Feedback notes

The coaching layer, and the thing that makes the portal worth keeping year over year.

- **Note object:** author, subject (a delegate or a team), competition, date, body, optional rubric scores, visibility flag (`Shared with delegate` / `Internal only`).
- **Coach view:** their delegates listed; open one to see a timeline of notes and a **New note** composer with an optional structured rubric (Content · Delivery · Q&A · Teamwork, scored 1–5).
- **Delegate view:** notes shared with them, newest first, plus their own private self-reflection entries after each practice or competition. Delegates never see internal-only notes and should not be able to infer their existence.
- **Executive view:** aggregate — which delegates have received feedback, which haven't, coverage gaps before a competition.
- Empty state is an invitation, not an apology: "No notes yet. After your first practice case, your coach's feedback lands here."

### 5.7 Cases — the vault

The signature screen. Case materials are embargoed and the interface should make the embargo *felt*.

**Five states:**

1. **Sealed** — dark maroon panel, wolf crest, gold countdown in Unbounded numerals. Metadata visible (competition, discipline, duration, deliverable format, team roster) but no materials. Copy: "Case opens Saturday, 8:00 AM."
2. **Open** — the seal breaks (one deliberate animation, ~600ms, respects `prefers-reduced-motion`). Materials appear: case PDF, exhibits, data files, rubric. A persistent timer bar pins to the top of the screen showing time remaining in the work window.
3. **Submission window** — timer bar shifts to a warning treatment in the final interval. Upload panel activates: drag-drop or file picker, accepted formats listed, file size cap stated, version history. **Any team member can submit.** Because submission is shared, the panel must show live team-wide state — "Marc uploaded final_deck.pptx · 2 min ago" — so two people don't race each other at minute 58. Show who submitted each version.
4. **Submitted** — confirmation with timestamp, submitted file list, submitting member, and a stated late/resubmit policy. Resubmission allowed until the window closes; each version is logged with its author and the latest version is clearly marked as the one that counts.
5. **Closed / Archived** — materials become read-only reference. Rolls into a "Past cases" library that becomes a genuine institutional asset over years.

**Executive control panel — the drop-and-schedule flow.** This is how every case enters the system, so it should be one uninterrupted form, not a wizard:

1. Upload materials (case PDF, exhibits, data files, rubric) — drag-drop, multiple files, reorderable.
2. Set **release datetime** — when delegates can see it.
3. Set **submission deadline** — when uploads close. Show the derived work window ("Delegates get 5h 30m") as a live computed label so a mis-set clock is obvious before saving.
4. Choose **audience** — competition, discipline, specific teams, or everyone.
5. Set **coach visibility** — a small toggle: *Same time as delegates* (default) / *Early access* with its own datetime / *After submission closes*. This makes the embargo question a per-case configuration rather than a policy JMCC has to settle once and live with.
6. Save as **Scheduled**. The case sits in a scheduled queue, visible to execs, invisible to delegates until its moment.

Also provide: **Force release** override, **Extend deadline** (logged, and it notifies affected teams), and a live submission monitor during the window showing teams submitted / outstanding with timestamps.

**Prototype requirement:** ship a hidden dev control to jump between the five states. Reviewers will not wait until Saturday at 8:00 AM to see state 2.

**Timezone note:** everything displays in America/Montreal with the zone shown explicitly. Case timing is the one place where an ambiguous clock is a real failure.

### 5.8 My Cabinet — personal trophy cabinet

**This is a retention mechanic, not a scoreboard.** Each delegate has their own cabinet that accumulates across seasons. The job of the screen is to make a second-year delegate want a third year. JMCC's association-wide record belongs on the public website and is out of scope here.

**The design idea: the empty shelves are the product.** A cabinet with three trophies and nine visible empty plinths says something a list of three achievements cannot. Render the cabinet as a physical case — depth, shelf edges, plinths, light falling across maroon — where earned pieces sit in gold and sand, and unearned slots sit as recessed, labeled outlines. Filled and empty must read as the *same* cabinet, not as a progress bar with icons.

**What fills it:**

| Category | Examples | Awarded by |
|---|---|---|
| **Placements** | 1st / 2nd / 3rd at a named competition | Exec, after results |
| **Seasons** | One marker per completed season — the spine of the cabinet, and the clearest reason to come back | Automatic |
| **Milestones** | First case submitted · First competition · Three disciplines competed · Ten practice cases | Automatic |
| **Commendations** | Coach's pick, most improved, team captain | Coach nominates → exec awards |

**Screen structure:**

- **Header:** the delegate's name, seasons active, and a single quiet line of progress — "9 of 26 pieces earned." Unbounded numerals, gold on maroon.
- **The case itself:** shelves grouped by category, not by year. Year grouping fragments a two-season delegate into two thin rows; category grouping shows one cabinet slowly filling.
- **Empty plinths are labeled** with what earns them: "Compete in a third discipline." Roughly 80% labeled, and a small handful left as unlabeled silhouettes — enough mystery to be interesting, not so much that the cabinet feels arbitrary.
- **Piece detail:** tap any earned piece for the date, the competition, the team, the coach, and a link to that case in the archive. This is where the cabinet quietly becomes a résumé — add a **Copy as résumé line** action that produces a clean text credential.
- **First-year empty state:** an entirely empty cabinet is the highest-stakes moment on this screen. It should read as a case waiting to be filled, with the nearest achievable piece highlighted — "Your first piece: submit a case." Never a shrug, never "Nothing here yet."

**Restraint:** no streaks, no daily engagement loops, no points, no delegate-vs-delegate leaderboard. Comparison between delegates is a demotivator in a group where some people compete five times and some compete once. Coaches and executives can view a delegate's cabinet; delegates see only their own.

**Exec awarding flow:** after a competition, select delegates and grant a placement or commendation in one pass. Rare action, keep it in Admin.

### 5.9 Event promotion (JMCC ads)

Internal promotion, not third-party advertising. This is JMCC marketing its own events to its own members.

**Two placements only:**

1. **Home feed card** — one slot, positioned mid-stack. Image, event name, date, one-line hook, CTA ("RSVP" / "Learn more" / "Buy ticket"). Dark maroon or image-backed, gold CTA — this is where the dark-only tokens earn their keep.
2. **Events page** — a browsable list of upcoming JMCC events with the same card at larger scale.

Rules: never more than one promo card visible per screen; it's dismissible; it never interrupts a case timer or a signing flow. An exec-facing composer creates a promo (image, title, date, hook, CTA text, CTA destination, audience, start/end display dates) with a live preview.

### 5.10 Profile & settings

Name, photo, program, year, pronouns, phone, dietary restrictions, accessibility needs, emergency contact, discipline, team assignment, T-shirt size. Notification preferences per channel type. Language preference. Sign out.

### 5.11 Admin console (Superuser / Executive)

- Member directory with role assignment (role changes are Superuser-only and should be visibly gated for executives, not hidden).
- Competition setup: name, dates, location, disciplines, delegate roster.
- Team builder: drag delegates into teams, designate team lead and coach.
- Bulk import from CSV.
- Audit log.

---

## 6. Sample data for the prototype

Populate with realistic JMCC content — placeholder lorem will make the review useless. Swap in real competition names before it goes to the exec team.

- **Competitions:** Jeux du Commerce Central (January), Happening Marketing (November), MTBI (February), ICBC (March), John Molson Undergraduate Case Competition (March)
- **Disciplines:** Finance, Marketing, Strategy, Accounting, MIS, Human Resources, Entrepreneurship, International Business, Operations & Supply Chain, Business Analytics, Sustainability
- **Delegates:** ~24 with Montreal-plausible, linguistically mixed names
- **Documents:** Liability waiver, Media & photo release, Participation agreement, Code of conduct, Travel authorization
- **Cabinets:** three contrasting states — a first-year delegate with one piece, a second-year with nine of twenty-six, and a graduating fourth-year with a nearly full case. The prototype needs all three to prove the empty-plinth treatment works at both ends.

---

## 7. Platform — installable PWA

The portal ships as a **Progressive Web App**. No App Store, no Play Store, no native builds, no review cycles, no developer program fees, and one codebase. Delegates install it from the browser and it sits on their home screen behaving like an app.

This is a design constraint, not just a build note — several of the following change what the screens look like.

### Install experience

- **Android / desktop Chrome:** use the `beforeinstallprompt` event to trigger a custom install invitation. Don't fire it on first load. Trigger it after a delegate completes something meaningful — signs their first document, or opens their first case — so the ask arrives after value, not before.
- **iOS Safari:** there is no install prompt API. Safari users must use Share → Add to Home Screen manually, so design a small illustrated instruction sheet showing the exact Safari steps. Detect iOS Safari and show it in place of the automatic prompt. This is the single most likely point of failure in delegate onboarding, so it should also appear as a step in the September orientation flow rather than living only in a dismissible banner.
- **Manifest:** `display: standalone`, `theme_color: #680009`, `background_color: #f7f3ec`, portrait-primary orientation, EN/FR names. Provide the wolf mark as a **maskable** icon at 192px and 512px — Android will crop a non-maskable icon into a circle and clip the wolf badly. Design the icon inside the safe zone.
- **Splash screen:** maroon field, wolf mark, no text. iOS generates these from the manifest; supply the icon set that produces a clean result.

### Standalone mode changes the layout

- **No browser chrome means no back button on iOS.** Every screen deeper than a nav destination needs its own back affordance. This is the most common way a PWA feels broken — a delegate opens a case detail, then has no way out.
- **Safe area insets:** the bottom tab bar must use `env(safe-area-inset-bottom)` or it collides with the iPhone home indicator. Same for the top bar against the notch/Dynamic Island. Build this into the shell from the first screen.
- **Pull-to-refresh** must be handled deliberately — either implemented properly or suppressed. The default overscroll behaviour in standalone mode looks like a bug.
- Tap targets at 44×44px minimum. This is a phone app now, not a desktop site on a phone.

### Offline behaviour

Competition venues have unreliable wifi and delegates burn through data. Offline is a real requirement, not a nicety.

| Content | Offline behaviour |
|---|---|
| App shell, nav, styles | Always cached — the app opens instantly with no network |
| Calendar & schedule | Cached; the day of a competition must work in a basement conference room |
| Case materials | Cached aggressively once opened, so a dropped connection mid-case is survivable |
| Signed documents | Read-only cached copies available |
| Messages | Last 50 per channel cached; composer queues and sends on reconnect |
| Signing (DocuSeal) | Online only — show a clear offline state rather than a broken iframe |
| Case submission | Online only — this one must be unambiguous |

- **Offline indicator:** a persistent, quiet bar — not a modal. It states what still works: "Offline. Your case materials are available; submission needs a connection."
- **Queued actions** show as pending with a visible state, and confirm when they actually send. Never silently drop a queued message.

### Timers, offline, and trust

The case countdown is the one thing that must not depend on the device clock or the network. Treat **server time as authoritative**, sync on load and on reconnect, and run the visible countdown from that offset locally so it keeps ticking offline. On reconnect, reconcile silently unless the drift is large enough to matter, in which case say so. A delegate whose phone clock is wrong must not see a different deadline than their teammates.

Related: iOS evicts cached storage after roughly seven days of non-use, so don't treat the cache as durable storage for anything that matters. Cached case materials are a convenience layer over server truth.

### Notifications

- **Android / desktop:** Web Push works normally.
- **iOS:** Web Push requires iOS 16.4+ **and** the PWA installed to the home screen. A delegate using the site in Safari gets nothing. Design for this — permission requests only after install, and email remains the guaranteed delivery channel for anything critical (case release, deadline changes).
- Ask for notification permission in context, after a delegate opts into a specific alert type, never on first load.

### Updates

Service worker updates should surface as a small, dismissible "New version available — reload" prompt rather than a silent swap. Force the update during a live case window, since a stale service worker holding an old deadline is a genuine hazard.

### Prototype scope for PWA

The Claude Design prototype should demonstrate the **visual and layout consequences**: standalone-mode shell with safe-area padding, in-app back affordances, the iOS install instruction sheet, the offline indicator bar, and an offline empty state on one screen. A working service worker and real caching belong in the build phase, not the prototype.

---

## 8. Quality floor

- Responsive from 360px up; nothing horizontally scrolls except deliberately (the exec signing matrix).
- Visible keyboard focus on every interactive element; full tab order.
- `prefers-reduced-motion` respected — the vault seal becomes a fade.
- All text meets WCAG AA. Enforce the gold/sand dark-only rule mechanically.
- Every empty state gives direction and a next action.
- Every error says what happened and how to fix it, in the interface's voice.
- Loading states use the wolf mark; skeletons, not spinners, for content areas.
- Copy is sentence case, active voice, and an action keeps its name end to end — a button that says **Sign** produces a state that says **Signed**.

---

## 9. Out of scope for v1 prototype

Real authentication · Supabase wiring · live DocuSeal API · realtime messaging · working service worker and caching · push/SMS notifications · news dashboard integration · alumni directory · file repository beyond case materials · full FR translation (nav + one form is enough to prove layout).

---

## 10. Decisions — resolved

1. **Case scheduling** — cases are uploaded whole and scheduled: execs set release datetime and submission deadline at upload. Coach visibility is a per-case toggle, defaulting to the same moment as delegates.
2. **Submission ownership** — any team member can submit. Shared submission requires live team-visible upload state to avoid last-minute collisions.
3. **Internal-only feedback notes** — confirmed. Delegates see only notes marked shared, with no indication that internal notes exist.
4. **Messaging** — delegate ↔ delegate, delegate ↔ coach, and user-created group chats. Delegates route exec contact through channels rather than DMs.
5. **Trophy cabinet** — personal and per-delegate, built to reward returning. The association-wide record lives on the public website, out of scope here.

### Still worth deciding before production (not blocking the prototype)

- **What the full piece list is.** The cabinet's credibility depends on it. Twenty-six pieces that map to real JMCC milestones will land; a generic badge set will read as filler. Worth one working session with the exec team.
- **Whether commendations are visible to other coaches.** A "coach's pick" that every coach can see behaves differently from a private one.
- **Message retention and moderation.** Group chats between students on an association-run platform eventually produce a moderation question. Decide who can see what, and for how long, before it comes up rather than after.

---

## 11. Prompt to paste into Claude Design

> Build a clickable prototype of the JMCC Delegate Portal, a members-only web app for a Concordia business case competition association. It ships as an installable PWA, so design it as a phone app in standalone mode — no browser chrome, safe-area padding top and bottom, in-app back buttons on every deep screen, 44px minimum tap targets. Desktop is the secondary layout.
>
> Follow the attached brief exactly for the design tokens — this must visually match an existing website and news dashboard. Palette: `primary` #680009 (deep maroon), `cream` #f7f3ec, `gold` #fabb20, `sand` #d8af74, `muted` #5e5c5a, where gold and sand appear on dark backgrounds only. Typography: Unbounded Bold for display, Montserrat for body and UI. Wolf iconography used structurally, not decoratively.
>
> Start with three screens: (1) the delegate Home dashboard, (2) the Case Vault in all five states with a dev control to switch between them, and (3) My Cabinet, the personal trophy cabinet. The Case Vault is the signature screen — a sealed maroon panel with a gold countdown that unseals on release. Spend the boldness there and keep everything else quiet.
>
> My Cabinet is a personal, per-delegate cabinet that fills up across seasons — render it as a physical display case where earned pieces sit in gold and sand and unearned slots are recessed, labeled empty plinths. The empty plinths are the point: they're what brings a delegate back for another season. Show it in three states — one piece, nine of twenty-six, and nearly full. No leaderboards, no streaks, no points.
>
> Include a role switcher in the top bar so I can preview Delegate, Coach, Executive, and Superuser views. Use the sample data in §6. Also include the PWA-specific screens from §7: the iOS "Add to Home Screen" instruction sheet and the offline indicator bar. Then continue with the remaining screens in §5 in this order: Calendar, Documents & signing, Tasks, Messages, Feedback.
