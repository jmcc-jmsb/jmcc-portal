# Phase 7 — promos, admin, polish

HANDOFF §9: "Promo composer and placements, admin console, CSV import, audit log
viewer, ARIA pass, full French coverage."

---

## A real bug, found by the app refusing to render

Mid-phase every screen went blank with `Invalid hook call` and
`Cannot read properties of null (reading 'useState')` — two copies of React in
one tree. My first read was a stale Vite dep cache, which it had been once
before. Clearing it changed nothing.

**It was the Phase 6 service worker.** Its shell rule was:

```js
if (url.pathname.startsWith('/_astro/') || /\.(js|css)$/.test(url.pathname))
  cacheFirst(...)
```

`/_astro/` output is content-hashed — the filename changes when the contents do,
so caching it forever is safe. **Everything else ending in `.js` is not.** After
a dependency install re-optimised Vite's modules, the worker kept serving the
*old* React from cache while the rest of the app loaded the new build. Half the
tree on new code, half on an old React.

Fixed: cache-first is now `/_astro/` only. Other JS and CSS are network-first —
still available offline, never frozen. `SW_VERSION` bumped to `v2` so every
deployed client drops the poisoned caches on activate.

This would have shipped as "the app breaks after a deploy, until you clear site
data" — the kind of bug that is nearly impossible to diagnose from a bug report,
and it only surfaced because the phase after it touched enough files to trigger
a re-optimisation.

---

## Verified

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 127 unit tests pass |
| `npm run test:db` | 138 assertions pass |
| **ARIA pass, all 10 app routes** | **0 findings** |
| French coverage | 308 / 308 keys, none missing, none stray |
| Admin role gate | executive sees the controls disabled *with the reason* |
| Service worker after the fix | activates, controls the page, retires `v1` caches |

### The ARIA pass

Walked every route under `/app` and checked, inside `<main>`:

- every `<button>` has an accessible name (label, text, or title)
- every `<img>` has an `alt` attribute
- every input, select and textarea is labelled
- heading levels start at `h1` and never skip
- the two `<nav>` landmarks have distinct names ("All sections" / "Main sections")

**Zero findings.** That is partly because the two that would have failed were
caught earlier — the duplicate `<nav>` name in Phase 1 and the doubled file input
in Phase 2 — both found the same way, by reading the tree rather than the screen.

### French coverage

308 keys in each file, no missing and no stray — enforced by the type system
since Phase 1, since `fr.json` is typed against `en.json`. Twenty values are
byte-identical between the two, and all twenty are legitimately so: `JMCC`,
`Documents`, `Messages`, `Type`, `Description`, `Agenda`, the `h`/`s` unit
abbreviations, and `Coach`, which is the word Quebec case competitions use.

---

## Decisions worth challenging

**Role changes are gated visibly, not hidden.** §5.11 asks for exactly this, and
it is the right call: an executive who cannot find the control assumes it is
missing and files a bug; one who sees it greyed out with "ask a superuser" knows
what to do. The disabled reason is on each control's `title` as well as in the
banner, so a screen reader reaches it without hunting.

**The admin console reads real roles, not the effective one.** The dev role
switcher changes what the UI offers; it must not change what this screen claims
a person may do, because that answer is a permission rather than a layout.

**One promo slot, enforced in SQL.** `active_promo()` returns at most one row, so
"never more than one promo card visible per screen" (§5.9) is impossible to
violate rather than merely documented. Dismissal is a row, not local state, so
dismissing on a phone holds on a laptop.

**The promo never mounts near a case timer or a signing flow.** §5.9 says it must
not interrupt either. That is honoured by not rendering the component on those
screens rather than by a runtime check someone can forget.

**`promo-images` is the one public bucket.** Everything else here is private with
signed URLs. A promo image is marketing for an event JMCC wants attended, and a
signature that expires mid-scroll would be a broken image for no benefit.

**The CSV is parsed with the same code on both sides.** The preview uses the
importer's own reader, so it cannot disagree with what the import will do. A
preview produced by a different parser is worse than no preview.

**Superuser is not importable.** A CSV that can mint a superuser is a CSV that
only has to be edited once by the wrong person. Roles come from the console.

**Every bad row is reported with its line number, and the good rows still
import.** An import of 120 people that stops at line 6 wastes an afternoon. A
team name that does not exist imports the person and says so — silently dropping
the team is how half a roster turns out unassigned in January.

---

## Deferred, and why

- **The drag-and-drop team builder** (§5.11). Teams can be created and people
  assigned by CSV; the drag interaction is a genuine piece of work and wants a
  pointer-and-keyboard story, not a mouse-only one bolted on at the end of a
  phase.
- **Competition setup UI.** The tables and policies exist and `seed.sql` covers
  the current season; a form for it is a Phase 8 nicety.
- **Task assignment and the exec awarding UI.** `/api/admin/award` is built,
  audited and tested, and the task-assignment policies have been tested since
  Phase 3 — but both want a recipient picker, which is the same component as the
  team builder above. Worth building once, properly.
- **The promo composer UI.** Promos can be created through the API and the card
  renders from the database; the exec-facing composer with live preview is the
  remaining piece.
- **Bulk "send reminder"** from the documents matrix — now unblocked by push, but
  it belongs with the composer above.

---

## Where the project stands

Phases 0–7 are built. Every item on the HANDOFF §10 security checklist is closed
and tested. What remains before real delegates is operational rather than
structural:

1. Apply migrations `0001`–`0009`, `seed.sql`, and `seed_cabinet.sql`.
2. Allowlist the callback URL, and bootstrap the first superuser.
3. Fill the two DocuSeal secrets.
4. `PUBLIC_ENABLE_DEV_CONTROLS=false` in production.
5. Run Lighthouse against the deployed HTTPS URL, and exercise the DocuSeal embed
   on a real iPhone against `portal.jmccjmsb.ca` — **not** a `*.vercel.app`
   preview, where the cookie conditions differ and it will pass anyway.
