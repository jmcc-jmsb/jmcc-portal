# Phase 0 — disagreements and decisions

HANDOFF §1 deliverable 4: "a short written list of anything you disagree with in
this section." Everything here is a deviation from HANDOFF §1 or §3, with the
reason. Nothing else in the handoff is contested.

---

## 1. `tailwind.config.mjs` does not exist in this stack

**Handoff asks for:** `tailwind.config.mjs` with the full token set.
**Delivered instead:** `src/styles/tokens.css` with an `@theme` block.

The stack is Tailwind 4, which is CSS-first. `jmcc-website` has no
`tailwind.config.*` anywhere — its tokens live in
`src/styles/global.css` under `@theme`, loaded through `@tailwindcss/vite`. A JS
config file here would either sit inert or fork the design system into two
formats. The handoff's own repo layout (§3) already lists `src/styles/tokens.css`;
this just makes that the single source.

---

## 2. The 26 cabinet pieces cannot be seeded verbatim

This is the one that changes the schema, so it needs a decision before Phase 3.

**Handoff says:** "Seed this list verbatim into `cabinet_pieces`."

Eight of the 26 are not pieces. They are *awards* — a piece bound to a specific
competition or year:

- Placements 1–5: `1st · JDCC`, `2nd · JDCC`, `3rd · MTBI`, `Finalist · ICBC`, `1st · JMUCC`
- Seasons 7–10: `Season 2024–25` through `Season 2027–28`

Each also carries a `meta` array of date / competition / coach, which HANDOFF §4
correctly puts on `cabinet_awards`, not `cabinet_pieces`.

Seeding them as written has two consequences:

1. **The catalog multiplies.** `1st · JDCC` implies `1st · MTBI`, `1st · ICBC`,
   `1st · Happening`, `1st · JMUCC` — five competitions × three placements is
   15 rows where there are three real pieces. Add a competition next season and
   you add rows to a catalog.
2. **The denominator stops being 26, and grows.** The cabinet header reads
   "9 of 26 pieces earned" and the empty plinths are the whole design idea. If
   seasons are one row per academic year, the total climbs every September — so
   a delegate's cabinet gets *emptier-looking* the longer they stay. That inverts
   the retention mechanic the screen exists for.

**Proposed fix, one column:** add `is_repeatable boolean not null default false`
to `cabinet_pieces`. The catalog becomes ~22 piece types (5 placement, 1 season,
10 milestone, 6 commendation). Repeatable pieces render one plinth per
competition-or-season the delegate is eligible for; `cabinet_awards` already
carries `competition_id` to bind them. The "N of M" line is computed per
delegate rather than hardcoded.

The catalog was going to exec for sign-off anyway (handoff §13). Settle the
shape in the same session — it is a five-minute question once it is asked, and
an expensive migration once 26 rows have awards hanging off them.

---

## 3. Three of the "derived colors" are not app colors

Handoff §1 lists `#eae4da` / `#e5ded2` / `#f3ede3` as a "page background
gradient" needing `cream-100/200/300`.

They are the radial gradient painted on the mockup canvas *behind* the fake
phone (export line 34). The app's page background is `cream` `#f7f3ec` — set on
the device viewport at line 43 and the scroll container at line 110. `#141010`
(also listed) is the device bezel at line 42.

Four tokens dropped. Nothing in production renders any of them.

---

## 4. `#241a18` cannot be called `ink`

Handoff §1 proposes `#241a18` → `ink`. `jmcc-website` already defines
`--color-ink: #000000`, and the two repos are supposed to share one token set.
Same name, different value, across two products in the same design system is how
a system quietly stops being one.

Delivered as `ink-800`. `ink` stays `#000000` for parity even though the export
never uses it. `#2b1416` (the handoff's proposed `ink-800`) collapses into it —
the two differ by 7/6/2 in RGB and are not distinguishable in use.

---

## 5. Seven maroon shades collapse to three, not four

Handoff §1 lists seven and says to resolve them into a scale. Grouped by red
channel they fall into three clusters, not seven or four:

`#2e0004 #380004 #3a0004 #3d0005` → `primary-900`
`#4a0006 #4d0007` → `primary-800`
`#56000a #5a0008` → `primary-700`

`#3d0005` is the only one used as text (on gold badges, export lines 61 and 804);
at `primary-900` that pairing measures 10.32:1, so the collapse is safe.

---

## 6. The danger red does not meet the brief's own requirement

Brief §3: "danger is a brighter red clearly distinguishable from `primary`."
The export's danger is `#8a1119` against `primary` `#680009`. Contrast against
cream is fine (8.73:1, AA), but the two reds are not tellable apart out of
context — which is exactly the failure mode the brief's monochrome-legibility
rule in §5.2 is written against.

In the export it happens not to matter: both uses are structural (a filled
sticky bar with a gold border at line 346, a small-caps `OVERDUE` group label at
line 1163). Keeping the value, with a rule: **danger is never signalled by hue
alone** — it always carries a label, an icon, or a fill. If a future screen needs
danger as bare text next to maroon, the token gets brightened then, not now.

---

## 7. Two small corrections to §1

- **`overscroll-behavior` is present**, not missing — line 110, on the inner
  scroll container. It is scoped wrong rather than absent: the document itself
  still bounces. Moved to `body`.
- The file is **1,284 lines**, not 1,387. Nothing depends on this; noted only so
  the line references in `COMPONENT_MAP.md` are not read as off-by-100.

---

## 8. Constraints added to the type scale

Not disagreements — the brief's "no more than five sizes" is met exactly — but
two floors that the export's numbers do not survive:

- **Nothing below 11px.** The export's 8–10.5px tier is 49 uses, including the
  bottom-tab labels at 9.5px. It reads acceptably only because the prototype
  renders inside a device mockup. This will change the tab bar's layout; French
  labels need the room regardless.
- **`text-lead` is 16px.** iOS Safari zooms the viewport when a focused input is
  under 16px. All form fields use this step.

---

## 9. The role switcher must not survive the build

Both documents treat the dev role switcher as a prototype affordance, and the
export renders it in the top bar on every screen (lines 96–99). Flagging it
because it is the kind of thing that ships: with RLS in place a client-side role
change gets rejected server-side anyway, so it is not a privilege-escalation
path — but it is a confusing dead control in a delegate's hands. It goes behind
an env flag in Phase 1, along with the vault-state and cabinet-fill switchers.

---

## Phase 0 status

Deliverables complete:

1. `docs/COMPONENT_MAP.md`
2. `src/styles/tokens.css` (in place of `tailwind.config.mjs`, §1 above)
3. Type scale — `COMPONENT_MAP.md` §5
4. This document

**Stopping here per HANDOFF §9.** Phase 1 does not start until §2 has an answer.
