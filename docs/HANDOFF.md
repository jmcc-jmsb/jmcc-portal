# JMCC Delegate Portal — Engineering Handoff

**Repo:** `jmcc-portal`
**For:** Claude Code
**Inputs:** this document, `JMCC_DelegatePortal_DesignBrief.md`, and the Claude Design export (`JMCC Delegate Portal.dc.html` + `support.js` + `uploads/`)
**Owner:** Christopher Chadirdjian, VP Technology & Innovation, JMCC 2026–2027

---

## 0. How to use the three inputs

| Input | Authority |
|---|---|
| **Design brief** | Features, roles, permissions, copy, UX intent |
| **Design export** | *Visual appearance only* — spacing, type scale, component look, motion |
| **This document** | Architecture, data model, security, build order |

**When they conflict, this document wins on anything touching data or security.** The prototype hides things by not rendering them; production must make those things genuinely unreachable.

---

## 1. What the export actually is — read before planning

I inspected it. Several things will surprise you if you assume it's ordinary HTML.

### It is not portable HTML

The file is `.dc.html` — Claude Design's own format. It has an `<x-dc>` root, a custom template language (`<sc-if>`, `<sc-for>`, `{{ }}` bindings), and all logic in a trailing `<script type="text/x-dc">` block defining `class Component extends DCLogic` with a `renderVals()` method. It requires the bundled 68 KB `support.js` runtime to render at all.

**Nothing in it can be copied into an Astro project and run.** Treat it as a high-fidelity visual specification with working interaction logic you can read, not as source. The `renderVals()` block is genuinely useful — read it closely, since it documents every screen state and transition the designer intended.

Open it in a browser (double-click; `support.js` sits beside it) before writing code.

### Scale and structure

- 1,387 lines, single file, one component, one big `state` object
- Screens delivered: Home, Calendar, Cases (all 5 vault states), Messages, Channel, More, Tasks, Documents (delegate + exec matrix), Feedback, My Cabinet
- Bottom sheets: cabinet piece detail, event detail, DocuSeal signing, dietary form, iOS install instructions
- Dev controls all present: role switcher (4 roles), vault state switcher (5 states), cabinet state switcher (3 states), device switcher (mobile/desktop), offline toggle

### Styling: 100% inline, zero classes

There is not one `class=` attribute in the file. Every style is an inline `style=""` string. Your Phase 0 job is extracting these into Tailwind tokens and components.

**The palette is respected** — `#680009` (116 uses), `#f7f3ec` (72), `#5e5c5a` (68), `#fabb20` (33), `#d8af74` (18). The gold-and-sand-on-dark-only rule holds throughout; I checked every usage.

**But there are ~12 derived colors the brief never defined.** These are real design decisions and must become named tokens, not one-off hex values:

| Hex | Role | Suggested token |
|---|---|---|
| `#241a18` | Near-black for body text on cream and dark chrome (33 uses) | `ink` |
| `#8a1119` | Danger red, distinct from primary | `danger` |
| `#8a0710` | Link hover | `primary-hover` |
| `#3d0005` `#4d0007` `#4a0006` `#5a0008` `#56000a` `#3a0004` `#380004` | Maroon shades for nested dark panels | `primary-900`…`primary-600` |
| `#2b1416` | Warm dark panel | `ink-800` |
| `#ffd86b` → `#fabb20` → `#b57f0d` | Gold gradient stops (trophy pieces) | `gold-light` / `gold` / `gold-dark` |
| `#ecd0a8` → `#d8af74` → `#9d7642` | Sand gradient stops | `sand-light` / `sand` / `sand-dark` |
| `#eae4da` `#e5ded2` `#f3ede3` | Page background gradient | `cream-100/200/300` |

Resolve the maroon shades into a proper scale rather than transcribing all seven. If two are within a few percent of each other, collapse them.

### What the prototype got right — keep these

1. **The 26-piece cabinet catalog is real and good.** My earlier handoff called 26 a placeholder; it isn't anymore. The export defines all 26 with categories, unlock hints, tone (gold/sand), shape (disc/diamond/bar), and metadata — plus two `secret: true` pieces rendering as `?`. Named pieces like "Travelled with the delegation," "Cross-discipline sub," and "Twenty-five practice hours" are JMCC-specific in the way the brief asked for. **Seed this list verbatim into `cabinet_pieces`.** It still needs exec sign-off, but it's a real starting list, not filler.
2. **Reduced-motion handling.** Five keyframe animations (`sealBreak`, `riseIn`, `sweep`, `glowPulse`, `sheetUp`) with a proper `@media (prefers-reduced-motion: reduce)` block that neutralises them. Carry this over.
3. **The navigation stack.** `go` / `tabGo` / `back` with a `stack` array, and visible back buttons on deep screens. This is the standalone-mode requirement, correctly implemented. Port the model directly to your router.
4. **44px minimum tap targets**, applied consistently.
5. **Resolved decisions honored** — submission versions show *who* submitted (`Marc Ouellette · 2 min ago`, latest flagged), matching "any team member can submit."
6. **The `t` object.** All UI strings are centralized in one translation-shaped object. It's English-only, but it's the seam you need — lift it straight into `i18n/en.json`.
7. **Sample data quality.** Montreal-plausible mixed names, a real case ("Boréal Coffee Roasters"), specific copy ("Unsigned forms mean no bus seat"). Keep it for the seed file.

### What is missing or wrong — do not carry over

| Gap | Detail | Where it lands |
|---|---|---|
| **No safe-area handling** | Zero `env(safe-area-inset-*)` in the file. Standalone mode is *simulated* with a fake 410px phone frame with a 52px radius. On a real iPhone the tab bar will collide with the home indicator. | Phase 1 — build into the shell from the first screen |
| **No French at all** | Zero FR strings, no language toggle in the top bar. The brief asked for the toggle demoed on nav, home, and one form. | Phase 1 — add the toggle; FR keys alongside EN from day one |
| **No focus styles** | Zero `:focus` or `outline` rules. Everything is a real `<button>`, so tab order works, but focus is invisible. | Phase 1 — token-based `focus-visible` ring |
| **Almost no ARIA** | 2 attributes across 1,387 lines. No labels on icon-only controls, no live region on the countdown. | Phase 7, but add as you build |
| **Scrollbars globally hidden** | `::-webkit-scrollbar { width:0; height:0 }` — fine in a device mockup, an accessibility problem on desktop. | Do not port |
| **Countdown uses `Date.now()`** | `setInterval` on the device clock. | Phase 2 — replace with `serverTime.ts` (§6) |
| **No exec case upload/scheduling form** | The biggest functional gap. "Exec controls" is a summary card with two no-op buttons (Force release, Extend deadline). The drop-and-schedule flow from brief §5.7 — upload, release datetime, submission deadline, computed work-window label, coach-visibility toggle — does not exist. | Phase 2 — design and build from the brief |
| **Exec signing matrix is 8 rows** | Brief called for proving 120 delegates × 5 documents. 8×5 doesn't test the hard case. | Phase 4 — seed real volume, test on a phone |
| **Profile & Admin are stubs** | `onGo: () => {}`. | Phase 7 |
| **No promo composer** | The home promo card renders and dismisses; the exec-side creation flow doesn't exist. | Phase 7 |
| **Feedback visibility not demonstrated** | Notes render, but shared/internal/private isn't modeled. Correct for the delegate view — but it means the coach-side visibility control is unspecified visually. | Phase 4 — follow the brief |

### Phase 0 deliverable

Before any application code:

1. `docs/COMPONENT_MAP.md` — every prototype screen and sheet, the production component replacing it, and the source lines it derives from.
2. `tailwind.config.mjs` — full token set including the derived colors above.
3. The type scale, extracted. Font sizes in the export run to fractional values (`12.5px`, `9.5px`, `8.5px`). Round these into a disciplined scale; the brief asked for no more than five sizes, and the export uses far more.
4. A short written list of anything you disagree with in this section.

**Stop and report after Phase 0.**

---

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Astro 5** | Matches the main site and news dashboard |
| UI | **React 19 islands** | Same as the news dashboard |
| Styling | **Tailwind CSS 4** | Same tokens as the main site |
| Auth + DB + Storage | **Supabase** | Postgres RLS fits a four-role matrix; realtime and storage included |
| Signing | **DocuSeal** (existing Railway instance, `sign.jmccjmsb.ca`) | Already deployed |
| Hosting | **Vercel** at `portal.jmccjmsb.ca` | Same as the news dashboard; cPanel can't run SSR |
| PWA | **`@vite-pwa/astro`** (Workbox) | Manifest, service worker, caching strategies |

### Routing decision — read before scaffolding

The main site is a static multi-page Astro build. **The portal must not be.**

A PWA in standalone mode needs the shell to open instantly and navigate offline. With server-rendered transitions, every tab tap is a network round trip and offline navigation breaks unless every route is separately cached.

```
/                    → Astro static, public landing + login
/auth/*              → Astro SSR, auth callbacks
/app/*               → single React SPA island, client-side routing
/api/*               → Astro SSR endpoints (server-only secrets live here)
```

Everything under `/app` is one React root with `react-router` v7. The shell caches once; tab switches are instant and offline-capable. Astro still handles the build, public pages, and API routes. Set `output: 'server'` with `@astrojs/vercel` and prerender public pages explicitly.

The prototype's `screen` + `stack` state model maps directly onto this.

---

## 3. Repository layout

```
jmcc-portal/
├── CLAUDE.md
├── docs/
│   ├── HANDOFF.md
│   ├── DESIGN_BRIEF.md
│   ├── COMPONENT_MAP.md          # Phase 0 output
│   └── prototype/                # the export, unmodified, reference only
├── supabase/
│   ├── migrations/               # numbered, forward-only
│   ├── seed.sql                  # from the export's sample data
│   └── config.toml
├── src/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── auth/
│   │   ├── app/[...path].astro   # mounts the SPA
│   │   └── api/
│   │       ├── cases/[id]/materials.ts
│   │       ├── cases/[id]/submit.ts
│   │       ├── documents/assign.ts
│   │       ├── webhooks/docuseal.ts
│   │       ├── push/subscribe.ts
│   │       └── time.ts
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes/               # one per brief §5 screen
│   │   ├── components/{ui,shell,feature}/
│   │   ├── hooks/
│   │   ├── lib/{supabase,serverTime,permissions,offline}.ts
│   │   └── i18n/{en,fr}.json
│   ├── lib/server/               # never imported by client code
│   │   ├── supabaseAdmin.ts
│   │   ├── docuseal.ts
│   │   └── push.ts
│   └── styles/tokens.css
├── public/
│   ├── manifest.webmanifest
│   └── icons/                    # maskable wolf mark, 192 + 512
└── .github/workflows/ci.yml
```

**Hard rule:** only `src/lib/server/` and `src/pages/api/` may use the Supabase service role key. Add a CI step that greps the client bundle for the key prefix and fails on a hit.

**Logo:** the export ships a 100 KB PNG. Get an SVG for in-app use, and produce maskable PWA icons at 192/512 with the wolf inside the safe zone — Android crops to a circle and will clip it otherwise.

---

## 4. Data model

Postgres via Supabase. Migrations forward-only and numbered.

### Identity and roles

```sql
create type app_role as enum ('superuser','executive','coach','delegate');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  program text,
  grad_year int,
  pronouns text,
  dietary_restrictions text,
  allergies text,
  accessibility_needs text,
  emergency_contact_name text,
  emergency_contact_phone text,
  tshirt_size text,
  locale text not null default 'en' check (locale in ('en','fr')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Roles live in their own table, never as a column on profiles.
create table user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role app_role not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
```

This split is the most important schema decision here. `role` on `profiles` plus "users can edit their own profile" is a privilege-escalation path.

Note the export's dietary sheet collects restrictions *and* allergies separately, with the copy "Shared with the JDCC caterer only, then deleted after the competition." If that promise ships, implement the deletion — a scheduled job clearing the fields after `competitions.ends_on`.

### Competitions, teams, disciplines

```sql
create table disciplines (
  id uuid primary key default gen_random_uuid(),
  name_en text not null, name_fr text not null, sort_order int
);

create table competitions (
  id uuid primary key default gen_random_uuid(),
  name_en text not null, name_fr text not null,
  season_year int not null,
  starts_on date, ends_on date,
  location text,
  status text not null default 'planned'
    check (status in ('planned','active','completed','archived'))
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions on delete cascade,
  discipline_id uuid references disciplines,
  name text not null
);

create table team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (team_id, user_id)
);

create table team_coaches (
  team_id uuid references teams on delete cascade,
  coach_id uuid references profiles on delete cascade,
  primary key (team_id, coach_id)
);
```

No `is_team_lead` — the brief resolved submission to any team member.

### Cases — the security-critical tables

```sql
create table cases (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions on delete cascade,
  discipline_id uuid references disciplines,
  title text not null,
  description text,
  deliverable_format text,

  release_at            timestamptz not null,
  submission_opens_at   timestamptz not null,
  submission_closes_at  timestamptz not null,

  coach_visibility text not null default 'same'
    check (coach_visibility in ('same','early','after')),
  coach_release_at timestamptz,

  audience_type text not null default 'competition'
    check (audience_type in ('competition','discipline','teams')),
  audience_team_ids uuid[],

  status text not null default 'draft'
    check (status in ('draft','scheduled','closed')),
  force_released_at timestamptz,
  created_by uuid references profiles,
  created_at timestamptz not null default now(),

  constraint valid_window check (submission_closes_at > submission_opens_at
                                 and submission_opens_at >= release_at),
  constraint coach_early_needs_time check (
    coach_visibility <> 'early' or coach_release_at is not null)
);

create table case_materials (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  filename text not null,
  storage_path text not null,          -- private bucket
  kind text not null check (kind in ('case','exhibit','data','rubric')),
  size_bytes bigint,
  sort_order int
);

create table case_submissions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases on delete cascade,
  team_id uuid not null references teams on delete cascade,
  submitted_by uuid not null references profiles,
  version int not null,
  files jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (case_id, team_id, version)
);
```

Derived release state, never computed on the client:

```sql
create or replace function case_is_released(c cases, viewer uuid)
returns boolean language sql stable as $$
  select case
    when c.force_released_at is not null then true
    when is_exec(viewer) then true
    when is_coach_of_case(viewer, c.id) then
      case c.coach_visibility
        when 'early' then now() >= c.coach_release_at
        when 'after' then now() >= c.submission_closes_at
        else now() >= c.release_at
      end
    else now() >= c.release_at
  end;
$$;
```

### Remaining tables

- **`events`** — `competition_id?`, `title_en/fr`, `description`, `type` (competition/practice/deadline/social/admin), `starts_at`, `ends_at`, `all_day`, `location`, `location_url`, `audience_type`, `audience_ref`, `created_by`. Plus **`event_rsvps`**. The export renders deadlines with a distinct marker and a tinted row — keep that.
- **`tasks`** — `owner_id`, `title`, `description`, `due_at`, `source` (auto/exec/coach/self), `created_by`, `batch_id`, `linked_type`, `linked_id`, `is_system`, `completed_at`. Group assignment inserts N rows sharing `batch_id`. The export's `locked: true` flag on the auto-generated signing task is `is_system`.
- **`document_templates`** — `name_en/fr`, `docuseal_template_id`, `description`.
- **`document_assignments`** — `template_id`, `user_id`, `docuseal_submission_id`, `docuseal_slug`, `status` (not_started/in_progress/signed), `due_at`, `signed_at`, `signed_pdf_path`.
- **`channels`** — `type` (announcement/competition/team/group/dm), `name`, `competition_id?`, `team_id?`, `created_by`, `is_readonly`. Plus **`channel_members`** (with `last_read_at`), **`messages`**, **`message_acks`**. The export models pinned messages per channel — add `pinned_message_id` to `channels`.
- **`feedback_notes`** — `author_id`, `subject_user_id?`, `subject_team_id?`, `competition_id?`, `note_type` (coach_note/self_reflection), `body`, `rubric jsonb`, `visibility` (shared/internal/private). The export's rubric is four axes scored 1–5: Content, Delivery, Q&A, Teamwork.
- **`cabinet_pieces`** — `code`, `name_en/fr`, `category`, `description_en/fr`, `unlock_hint_en/fr`, `is_secret`, `tone` (gold/sand), `shape` (disc/diamond/bar), `sort_order`. Seed all 26 from the export.
- **`cabinet_awards`** — `user_id`, `piece_id`, `competition_id?`, `team_id?`, `awarded_at`, `awarded_by`, `note`.
- **`promos`** — `title`, `hook`, `image_path`, `cta_label`, `cta_url`, `event_id?`, `audience_type`, `display_from`, `display_until`. Plus **`promo_dismissals`**.
- **`audit_log`** — `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`. Write from server endpoints for role changes, case release and force-release, deadline extensions, submissions, document assignment, award grants.
- **`push_subscriptions`** — `user_id`, `endpoint`, `keys jsonb`, `user_agent`, `created_at`.

---

## 5. Row-level security

RLS on **every** table, including lookups.

### Helpers first

Policies that subquery other tables get slow and can recurse. Use `SECURITY DEFINER STABLE` helpers:

```sql
create or replace function has_role(uid uuid, r app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = uid and role = r);
$$;

create or replace function is_exec(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(uid,'executive') or has_role(uid,'superuser');
$$;

create or replace function my_team_ids(uid uuid) returns setof uuid ...
create or replace function my_coached_team_ids(uid uuid) returns setof uuid ...
```

### The four policies that carry real risk

**1. `user_roles` — writes restricted to superuser.**
```sql
create policy roles_read on user_roles for select
  using (user_id = auth.uid() or is_exec(auth.uid()));
create policy roles_write on user_roles for all
  using (has_role(auth.uid(),'superuser'))
  with check (has_role(auth.uid(),'superuser'));
```

**2. `case_materials` — time-gated, not client-hidden.**
```sql
create policy materials_read on case_materials for select
  using (exists (
    select 1 from cases c
    where c.id = case_materials.case_id
      and case_is_released(c, auth.uid())
      and case_in_audience(c, auth.uid())
  ));
```
A delegate querying directly before release must get zero rows.

**3. `feedback_notes` — internal notes invisible to the subject.**
```sql
create policy notes_read on feedback_notes for select
  using (
    author_id = auth.uid()
    or is_exec(auth.uid())
    or (subject_user_id = auth.uid() and visibility = 'shared')
    or (visibility = 'internal' and subject_team_id in (select my_coached_team_ids(auth.uid())))
  );
```
The brief requires delegates be unable to *infer* internal notes exist — so no counts, no numbering gaps, no "hidden" affordance.

**4. `messages` — membership-scoped.** Read requires a `channel_members` row; insert additionally requires `is_readonly = false` or exec.

### Storage buckets

| Bucket | Public | Access |
|---|---|---|
| `avatars` | yes | Anyone reads; owner writes |
| `case-materials` | **no** | Server-issued signed URLs only (§6) |
| `case-submissions` | **no** | Team members + exec, via signed URL |
| `signed-documents` | **no** | Subject + exec |
| `promo-images` | yes | Exec writes |

---

## 6. Case materials — signed-URL flow

Storage RLS alone isn't enough; a signed URL outlives the policy check. Route access through a server endpoint:

```
GET /api/cases/:id/materials
  1. Resolve caller from the Supabase session cookie
  2. Load case; evaluate case_is_released() and audience server-side
  3. Not released → 403 with { releaseAt } and NO filenames or sizes
     (a filename leaks the case topic)
  4. Released → signed URLs, TTL 15 minutes
  5. Return { serverNow, releaseAt, submissionOpensAt, submissionClosesAt, materials[] }
```

**Submission** (`POST /api/cases/:id/submit`) validates server-side that the window is open using `now()`, that the caller is on the team, and file type and size. Never trust a client timestamp. Increment `version`; highest version counts. Write to `audit_log`.

### Server time authority

The countdown must not depend on the device clock. The prototype uses `Date.now()` — replace it.

- Every case response includes `serverNow`.
- `lib/serverTime.ts` stores `offset = serverNow - Date.now()` and exposes `now()`. Every countdown and state check uses it.
- Resync on mount, on reconnect, and on `visibilitychange` → visible.
- If a resync shifts the offset >30s during an active window, surface it rather than jumping the timer silently.
- Display in `America/Montreal` with the zone shown. The export already labels times EDT — keep that, but derive the abbreviation rather than hardcoding it, or January competitions will display EDT during EST.
- The client countdown is display only. A client that thinks the window is open still gets a 403.

---

## 7. DocuSeal integration

Existing self-hosted instance at `sign.jmccjmsb.ca` (Railway).

**Assignment** — `POST /api/documents/assign` (exec only): create a DocuSeal submission from a template per recipient, store `docuseal_submission_id` and submitter slug, create the `document_assignments` row and a linked system task.

**Signing** — embedded panel pointing at the submitter slug. Use DocuSeal's embed script if the version supports it; otherwise a framed view with the visible "Signing powered by DocuSeal — secure" caption. Never render the admin surface.

**Completion** — webhook → `POST /api/webhooks/docuseal`:
1. Verify the shared secret in constant time; reject unsigned requests.
2. Match `docuseal_submission_id`; ignore unknown IDs.
3. Update status and `signed_at`; complete the linked task.
4. Fetch the executed PDF server-side into `signed-documents`.
5. Write to `audit_log`.

Webhooks are **at-least-once** — make the handler idempotent.

The API token lives only in `src/lib/server/docuseal.ts`, from env, never in a client bundle.

**Cookie note:** `portal.` and `sign.` are cross-origin but same-site under `jmccjmsb.ca`, which is what keeps Safari's tracking prevention from breaking the embedded iframe. Do not test the embed against a `*.vercel.app` URL — the cookie conditions differ from production and it will pass there and fail on an iPhone.

---

## 8. PWA implementation

`@vite-pwa/astro` with `registerType: 'prompt'`.

**Manifest:** `display: standalone`, `theme_color #680009`, `background_color #f7f3ec`, `orientation: portrait-primary`, `start_url: /app`, `scope: /app`, EN and FR names, maskable icons at 192/512.

**Caching:**

| Resource | Strategy |
|---|---|
| App shell (HTML/JS/CSS) | Precache, cache-first |
| Fonts (Unbounded, Montserrat) | Cache-first, 1 year |
| Supabase `GET` | Network-first, 5-minute fallback |
| Calendar, tasks, profile | Stale-while-revalidate |
| Case materials (signed URLs) | Cache-first once fetched |
| Submission and signing endpoints | **Network-only, never cached** |
| Images | Cache-first, 30-day expiry, 60-entry cap |

**Never cache a 403 from the materials endpoint** — a cached pre-release denial keeps the vault sealed after it opens.

**Offline write queue:** message sends queue in IndexedDB and flush on reconnect, with a visible pending state and confirmation on send. Submissions and signing never queue — they fail loudly.

**Shell requirements the prototype did not implement:**
- `viewport-fit=cover` plus `env(safe-area-inset-*)` on the top bar and bottom tab bar. The export fakes standalone mode with a device frame; none of this exists yet.
- In-app back affordance on every deep screen. The export's `stack` model is correct — port it.
- `overscroll-behavior-y: contain` unless pull-to-refresh is deliberately implemented.
- 44×44px tap targets (the export already honors this).

**iOS install sheet:** the export includes the illustrated Share → Add to Home Screen sheet. Wire it to real detection: iOS Safari, not already standalone. Trigger `beforeinstallprompt` on Android/desktop only after a meaningful completion, never on first load.

**Push:** VAPID keys in env, subscriptions in `push_subscriptions`, sending from a server endpoint. iOS needs 16.4+ **and** home-screen installation, so email stays the guaranteed channel for case releases and deadline changes. Request permission only after the user opts into a specific alert type.

**Cache durability:** iOS evicts storage after ~7 days of non-use. Cached materials are a convenience layer over server truth.

---

## 9. Build phases

**Phase 0 — Read and map.** Deliverables in §1. **Stop and report.**

**Phase 1 — Foundation.** Astro + Tailwind + React scaffold, tokens extracted. Supabase project, identity/competitions/teams migrations, RLS helpers, seed data. Magic-link auth. The `/app` shell: nav, top bar, **safe areas**, back stack, role switcher, **EN/FR toggle**, **focus styles**. *Verify: log in, see the shell, switch roles, switch language, tab through with visible focus.*

**Phase 2 — The vault.** Cases schema and RLS, signed-URL endpoint, server time sync, all five states, **the exec upload-and-schedule form** (does not exist in the prototype — build from brief §5.7 with the live computed work-window label and the coach-visibility toggle), submission with versioning and live team state, submission monitor, dev state switcher. *Verify: a delegate account cannot reach materials before release via a direct API call, not just the UI.*

**Phase 3 — Cabinet, tasks, calendar.** Seed the 26 pieces. Display-case rendering with labeled empty plinths at all three fill states. Tasks with `is_system` locking. Calendar with three views and event CRUD.

**Phase 4 — Documents and feedback.** DocuSeal assignment, embed, webhook, PDF storage. **Seed 120 delegates × 5 documents and test the exec matrix on a phone.** Feedback notes with all three visibility levels.

**Phase 5 — Messaging.** Channels, membership, Supabase Realtime, pinned messages, announcement acknowledgements, group chat creation.

**Phase 6 — PWA hardening.** Service worker, manifest, icons, offline states, install flows, push, update prompt. Lighthouse PWA audit.

**Phase 7 — Promos, admin, polish.** Promo composer and placements, admin console, CSV import, audit log viewer, ARIA pass, full French coverage.

---

## 10. Security checklist — before any real delegate data

- [ ] RLS enabled on every table, confirmed via `pg_tables`
- [ ] A delegate JWT cannot select `case_materials` before `release_at` — tested with a raw API call
- [ ] A delegate cannot select internal `feedback_notes`, and the UI leaks no count or gap
- [ ] An executive cannot insert into `user_roles`
- [ ] Service role key absent from the client bundle (CI check)
- [ ] DocuSeal webhook rejects a bad or missing secret
- [ ] Submission endpoint rejects a client-supplied timestamp
- [ ] Signed URLs expire in ≤15 minutes
- [ ] A user cannot read another user's `cabinet_awards` unless exec or their coach
- [ ] Materials, submissions, and signed-document buckets are private
- [ ] Dietary/allergy data deletion after competition end is implemented if the copy promises it

---

## 11. `CLAUDE.md` — commit at repo root

```markdown
# JMCC Delegate Portal

Astro 5 + React 19 islands + Tailwind 4 + Supabase, on Vercel at portal.jmccjmsb.ca.
Authenticated SPA at /app. Signing via self-hosted DocuSeal at sign.jmccjmsb.ca.

## Rules
- Never put a hex color in a component. Use Tailwind tokens.
- gold (#fabb20) and sand (#d8af74) on dark backgrounds only. Never on cream or white.
- Service role key only in src/lib/server/ and src/pages/api/. Never client-side.
- Every table has RLS. New table = new policy in the same migration.
- Never use Date.now() for anything time-sensitive. Use lib/serverTime.ts.
- Case release and submission windows are enforced server-side. Client checks are display only.
- Every user-facing string goes through i18n. EN and FR keys added together.
- Every interactive element has a visible focus-visible state.
- Migrations are forward-only and numbered. Never edit a committed migration.

## Verify before declaring a phase done
- npm run build and npm run typecheck pass
- The relevant boxes in docs/HANDOFF.md §10 are checked
```

---

## 12. Environment variables

```
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
DOCUSEAL_BASE_URL=https://sign.jmccjmsb.ca
DOCUSEAL_API_TOKEN=               # server only
DOCUSEAL_WEBHOOK_SECRET=          # server only
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=                # server only
PUBLIC_APP_URL=https://portal.jmccjmsb.ca
```

---

## 13. Flags

**DNS lead time — file this now.** `portal.jmccjmsb.ca` needs a CNAME to the project-specific value Vercel shows in Settings → Domains (each project gets its own, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`, not the generic `cname.vercel-dns.com` in older guides). Copy it exactly including the trailing period. The record name is `portal`, not the full domain. Given how the DocuSeal TXT record went with CASA, request it before Phase 1 rather than at deploy time.

**The cabinet list needs exec sign-off, not invention.** The prototype's 26 pieces are credible enough to seed. Bring that list to the exec team as a proposal.

**The exec case-scheduling form is the largest missing piece.** Everything else in Phase 2 has a visual reference; this one has to be designed as it's built.

**Phase 2's acceptance criterion is not "the vault looks right."** It's a delegate account on a phone, unable to reach materials via direct API call one minute before release, and able one minute after.
