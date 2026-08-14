# Component map — prototype → production

Phase 0 deliverable 1 (HANDOFF §1). Maps every screen, sheet and control in the
Claude Design export onto the production component that replaces it.

**Source:** `docs/prototype/JMCC Delegate Portal.dc.html` — 1,284 lines, one
`class Component extends DCLogic`, one `state` object, zero `class=` attributes.
All line numbers below refer to that file, unmodified.

Nothing in the export is portable. It is a `.dc.html` with a custom template
language (`<sc-if>`, `<sc-for>`, `{{ }}`) that needs the bundled 68 KB
`support.js` to render at all. Read it as a visual specification with working
interaction logic, never as source.

---

## 1. Shell

| Prototype | Lines | Production | Notes |
|---|---|---|---|
| Mockup canvas + device frame | 34–43 | — **drop** | A 410px frame with a 52px radius on a radial-gradient backdrop. It is the presentation of the prototype, not the app. See §3 on the three cream shades it introduced. |
| Fake iOS status bar (`7:40`, 12% battery) | 71–82 | — **drop** | Mockup chrome. Real standalone mode gets this from the OS. |
| Desktop sidebar, 236px, 9 items | 45–67 | `shell/Sidebar.tsx` | Collapsible-to-icons is specified in brief §4 and absent from the export; build it. |
| Top bar — logo, bell, role switcher | 84–101 | `shell/TopBar.tsx` | **Add the EN/FR toggle** (brief §4, missing entirely). Needs `pt-safe-t`. |
| Role switcher (`cycleRole`) | 96–99 | `dev/RoleSwitcher.tsx` | Dev-only, visibly dashed. Gate behind an env flag; it must not ship to production as a client-side role change. |
| Offline bar | 103–108 | `shell/OfflineBar.tsx` | Copy is good ("submission and signing need a connection") — keep it. Pulsing dot uses `--duration-pulse`. |
| Scroll container | 110 | `shell/AppShell.tsx` | Already has `overscroll-behavior:contain`, but only here — the document still bounces. Moved to `body` in `tokens.css`. |
| Bottom tab bar, 5 items | 796–808 | `shell/TabBar.tsx` | Needs `pb-safe-b`. Tab labels are 9.5px in the export → `text-meta` (11px). |
| Fake home indicator | 809–811 | — **drop** | Replaced by real `env(safe-area-inset-bottom)`. |
| Nav model — `go` / `tabGo` / `back` / `stack` | 1062–1064 | `app/router.ts` | Port directly onto `react-router` v7. `go` pushes, `tabGo` clears the stack, `back` pops. This is the standalone-mode back affordance and it is correct as written. |
| Sticky dev control panel | 937–982 | `dev/ControlPanel.tsx` | Device / Role / Vault state / Cabinet fill / offline toggle / install sheet. Keep all of it behind the same env flag. |

---

## 2. Screens

| Prototype screen | Lines | Production route | Notes |
|---|---|---|---|
| **Home — delegate** | 115–200 | `routes/Home/DelegateHome.tsx` | Priority stack: next-up countdown, needs-you, today, promo, recent. Matches brief §5.1. |
| Promo card | ~166–176 | `feature/PromoCard.tsx` | Renders and dismisses. The exec-side composer does not exist → Phase 7. |
| **Home — coach** | 201–223 | `routes/Home/CoachHome.tsx` | Team cards. |
| **Home — exec** | 224–272 | `routes/Home/ExecHome.tsx` | Signature counts, submission monitor, quick actions. Encloses the superuser strip. |
| **Home — superuser strip** | 231–238 | `routes/Home/SystemStrip.tsx` | Exec view plus active users / DocuSeal sync / storage / errors. |
| **Cases — sealed** | 280–312 | `routes/Cases/VaultSealed.tsx` | Countdown is `Date.now()` driven (1054, 1058–1060) → replace with `lib/serverTime.ts`. |
| **Cases — open** | 313–343 | `routes/Cases/VaultOpen.tsx` | `sealBreak` animation, 600ms → `--duration-seal`. |
| **Cases — submission window** | 344–378 | `routes/Cases/VaultSubmission.tsx` | Sticky final-hour bar in `danger` with a gold border (346). Live team-wide upload state. |
| **Cases — submitted** | 379–405 | `routes/Cases/VaultSubmitted.tsx` | Versions show submitter and time; latest flagged. Matches the resolved "any team member can submit". |
| **Cases — closed / archived** | 406–450 | `routes/Cases/VaultClosed.tsx` | Read-only reference + past-cases library. |
| **Exec case scheduling form** | — **absent** | `routes/Cases/CaseComposer.tsx` | The largest functional gap. Export has a summary card with two no-op buttons. Design from brief §5.7 in Phase 2. |
| **My Cabinet** | 451–501 | `routes/Cabinet/index.tsx` | Shelves by category, labeled empty plinths, `nudge` block at 462. Shelf lip gradient uses `--color-shelf` (480). |
| **Calendar** | 502–537 | `routes/Calendar/index.tsx` | Agenda default; month/week to build. Deadlines render as a rule, not a block — keep. |
| **Documents — delegate** | 543–565 | `routes/Documents/DelegateChecklist.tsx` | Signed state at 555 uses `success`. |
| **Documents — exec matrix** | 566–602 | `routes/Documents/ExecMatrix.tsx` | 8 rows in the export. Seed 120 × 5 and test on a phone (Phase 4). The one surface allowed to scroll horizontally. |
| **Tasks** | 603–637 | `routes/Tasks/index.tsx` | `locked: true` (1045) → `is_system`. Overdue label uses `danger` (1163). |
| **Messages — channel list** | 638–664 | `routes/Messages/ChannelList.tsx` | |
| **Channel** | 665–706 | `routes/Messages/Channel.tsx` | Pinned messages modeled → add `pinned_message_id` to `channels`. |
| **Feedback — delegate** | 712–734 | `routes/Feedback/DelegateNotes.tsx` | Shared notes + self-reflection. |
| **Feedback — coach** | 735–751 | `routes/Feedback/CoachNotes.tsx` | Rubric: Content · Delivery · Q&A · Teamwork, 1–5. Visibility control is **not** modeled — build from brief §5.6. |
| **Feedback — exec** | 752–777 | `routes/Feedback/Coverage.tsx` | Aggregate coverage gaps. |
| **More** | 778–791 | `routes/More/index.tsx` | Menu + "Add to home screen" + build stamp. |
| **Profile / Admin** | — stubs (`onGo: () => {}`) | Phase 7 | |

---

## 3. Sheets

All five are bottom sheets, `animation: sheetUp 240ms ease-out` → `--duration-base`.
One `<BottomSheet>` primitive with a drag handle, backdrop `ink-800/55`, and
`rounded-t-lg` covers all of them.

| Sheet | Lines | Surface | Production |
|---|---|---|---|
| Cabinet piece detail | 817–837 | `primary-800`, gold title | `feature/PieceSheet.tsx` — includes the "Copy as résumé line" action |
| Event detail | 838–853 | `cream` | `feature/EventSheet.tsx` |
| DocuSeal signing | 854–876 | dark | `feature/SigningSheet.tsx` — keep the "powered by DocuSeal — secure" caption |
| Dietary form | 877–901 | dark | `feature/DietarySheet.tsx` — see §6 on the deletion promise |
| iOS install instructions | 902–931 | `cream` | `feature/InstallSheet.tsx` — wire to real iOS-Safari + not-standalone detection |

---

## 4. Color extraction

27 distinct hex values in the export. The palette rule holds — `gold` and `sand`
never appear as text on a light surface; every usage was checked.

**Brand, unchanged** (also in `jmcc-website/src/styles/global.css`):
`primary` 116 uses · `cream` 72 · `muted` 68 · `gold` 33 · `sand` 18.
`ink` (#000000) and `border` (#95323f) carry over for parity; the export uses neither.

**Derived tokens and what each absorbed:**

| Token | Value | Absorbed from export | Uses |
|---|---|---|---|
| `ink-800` | `#241a18` | `#241a18`, `#2b1416` | 36 |
| `primary-700` | `#58000a` | `#56000a`, `#5a0008` | 2 |
| `primary-800` | `#4c0007` | `#4a0006`, `#4d0007` | 6 |
| `primary-900` | `#3a0004` | `#3d0005`, `#3a0004`, `#380004`, `#2e0004` | 8 |
| `primary-hover` | `#8a0710` | `#8a0710` (17–18, `a:hover`) | 1 |
| `danger` | `#8a1119` | `#8a1119` (346, 1163) | 2 |
| `success` | `#1f4433` | `#1f4433` (555) | 1 |
| `gold-light` / `gold-dark` | `#ffd86b` / `#b57f0d` | trophy gradient (1066) | 1 each |
| `sand-light` / `sand-dark` | `#ecd0a8` / `#9d7642` | trophy gradient (1066) | 1 each |
| `shelf` | `#7d3b1d` | shelf lip gradient (480) | 1 |

**Not tokenised — deliberately:**

- `#f3ede3`, `#e5ded2`, `#eae4da`. HANDOFF §1 lists these as a "page background
  gradient" needing `cream-100/200/300`. They are not. They are the radial
  gradient on the mockup canvas *behind* the fake phone (line 34). The app's page
  background is `cream` (`#f7f3ec`, lines 43 and 110). Three tokens deleted.
- `#141010` — the device bezel (line 42). Same reason.
- No `warning` token. Brief §3 specifies gold on a dark chip: `bg-primary-900 text-gold`.

**Translucency is an opacity modifier, not a token.** The export drifted across
six alpha values for what is one hairline (`muted` at .14/.16/.18/.2/.3/.4, with
.18 alone used 29 times). Conventions, enforced in review:

- Hairline borders on light surfaces: `border-muted/20`. One value.
- Translucent cream on maroon: **floor at `/60`.** `text-cream/55` measures
  4.25:1 on `primary` and fails AA — and the export uses it at 10.5px, its
  smallest text (line 65, desktop sidebar footer). `/60` is 4.84:1.

---

## 5. Type scale

The export uses **22 distinct font sizes** from 8px to 30px, including
fractional ones (9.5px × 31, 12.5px × 54, 8.5px × 8). Brief §3 allows five.

| Token | px | Absorbs | Export uses | Role |
|---|---|---|---|---|
| `text-meta` | 11 | 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5 | 122 | eyebrows, badges, tab labels, timestamps |
| `text-body` | 13 | 12, 12.5, 13, 13.5 | 99 | default UI text, list rows, dense tables |
| `text-lead` | 16 | 14, 15, 16 | 18 | reading copy and **all form inputs** |
| `text-title` | 20 | 17, 18, 19, 20, 21, 22 | 24 | screen and section titles (Unbounded) |
| `text-display` | 30 | 30 | 4 | the vault countdown, and little else |

Two decisions worth stating:

1. **Nothing below 11px.** The 8–10.5px tier is 49 uses including the bottom-tab
   labels. It is below the iOS minimum legible size and only looked acceptable
   because the prototype renders inside a scaled device mockup. Raising it will
   change the tab-bar layout — that is the correct outcome, and French labels
   ("Rétroaction", "Mon palmarès") need the room anyway.
2. **`text-lead` is 16px, not 15.** iOS Safari zooms the viewport when a focused
   input has a font-size under 16px. Every form field in the portal uses this step.

Weights: 700 (88 uses), 600 (86), 500 (7). Keep 400/500/600/700; drop nothing.
Families are unchanged — Unbounded display, Montserrat body. The export loads
them from the Google Fonts CDN (line 13); production self-hosts via `@fontsource`
like the main site.

**Radii:** 13 values between 1px and 22px collapse to four — `xs` 3 / `sm` 9 /
`md` 12 / `lg` 20 — plus `rounded-full` for cabinet discs.

---

## 6. Carried over, and consciously not

**Keep:**

- The 26-piece cabinet catalog (992–1022) — real, JMCC-specific, worth exec
  sign-off. See PHASE_0_NOTES §2 on why it cannot be seeded verbatim.
- Reduced-motion block (27–30) covering all five keyframes.
- The `stack` navigation model (1062–1064).
- 44px minimum tap targets, applied consistently throughout.
- The `t` object — all UI strings already centralised. Lift into `i18n/en.json`
  and write `fr.json` alongside it from day one.
- Sample data (1025–1052, and the message thread at 1036–1039). Montreal-plausible
  names, a real case, specific copy. Goes into `supabase/seed.sql`.
- `overscroll-behavior: contain` (110) — widened to `body`.

**Do not carry over:**

- `::-webkit-scrollbar { width:0; height:0 }` (21). Fine in a mockup; an
  accessibility defect on the desktop exec views, and the signing matrix is the
  one surface that is *supposed* to scroll.
- Google Fonts `<link>` (13). Self-host.
- `Date.now()` countdown (988–990, 1054, 1058–1060). → `lib/serverTime.ts`.
- The device frame, fake status bar, and fake home indicator.

**Missing, and where it lands:**

| Gap | Phase |
|---|---|
| Safe-area insets — zero `env()` in the file | 1, into the shell |
| EN/FR toggle — zero FR strings | 1 |
| Focus styles — zero `:focus` rules in 1,284 lines | 1 (done in `tokens.css`) |
| ARIA — 2 attributes total, both on the bell (92) | ongoing, audit in 7 |
| Exec case upload-and-schedule form | 2 |
| Feedback visibility control (shared/internal/private) | 4 |
| Exec signing matrix at real volume | 4 |
| Promo composer, Profile, Admin | 7 |

**Contrast, measured.** Every token pairing the export actually uses passes WCAG
AA at 4.5:1 — body text 15.36, muted 6.02, gold on primary 7.66, sand on primary
6.47, danger on cream 8.73, success on cream 9.82, gold on danger 5.61. The one
failure is `cream/55` on `primary` at 4.25 (§4).

**Dietary copy.** The sheet (877–901) promises the data is "shared with the JDCC
caterer only, then deleted after the competition." If that copy ships, the
scheduled deletion after `competitions.ends_on` ships with it.
