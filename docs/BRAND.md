# Brand

The portal shares one brand with `jmcc-website` and the news dashboard. Nothing
here was designed for the portal — it is all imported, and it changes here only
when it changes there, in the same breath.

Upstream inventory: `jmcc-website/ASSETS.md`.

## What the token layer already guarantees

| Layer | Where | Status |
|---|---|---|
| Seven brand colors | `src/styles/tokens.css` `@theme` | identical values to the site |
| Font families | `--font-unbounded`, `--font-montserrat` | identical token names, self-hosted via `@fontsource` |
| Durations, easings, stagger | `--duration-*`, `--ease-*`, `--stagger` | copied verbatim |
| Motion patterns | `src/styles/brand.css` | copied verbatim, comments included |

The portal adds tokens the site has no need for — the maroon scale, the type
scale, safe areas, `--duration-seal` — but it changes none of the shared ones.
See `docs/COMPONENT_MAP.md` §4 for where each derived token came from.

## Marks imported

Copied from `jmcc-website/src/assets/brand/` into `src/assets/brand/`.

| File | Use |
|---|---|
| `jmcc-wolf-running.svg` | 2.5 KB, `fill="currentColor"`. The structural wolf — app icon, loading state, empty states, cabinet crest. This is the SVG `HANDOFF.md` §3 asks for in place of the export's 100 KB PNG. |
| `jmcc-claw.svg` | 5.5 KB. Three gash paths behind the stroke-draw divider and the card hover flick. |
| `jmcc-shield-color.png` | 101 KB. Top bar and sidebar logo. |

`src/lib/claw.ts` came across with them — it inlines the claw at build time via
`?raw` and strips duplicate `id` attributes.

**The export's logo is this exact file.** `docs/prototype/uploads/JMCC LOGO.png`
and `jmcc-shield-color.png` have the same SHA-256
(`689864ee…766a8c23`), so the designer worked from the site's own shield. There
is no reconciliation to do.

## PWA icons

Generated from `jmcc-wolf-running.svg` into `public/icons/` — a gold wolf on a
`primary` field, which is the signature pairing the brief says should feel
earned. The app icon is where it earns it.

| File | Purpose |
|---|---|
| `icon.svg`, `icon-192.png`, `icon-512.png` | `purpose: any` — never cropped, so the mark runs 400/512 wide |
| `icon-maskable.svg`, `icon-maskable-192.png`, `icon-maskable-512.png` | `purpose: maskable` |
| `apple-touch-icon.png` | 180px. iOS ignores `maskable` and applies its own squircle, so it gets the padded source |

**On the safe zone.** Android masks a maskable icon to a circle of 80% of the
canvas, so the mark has to fit inside that *circle* — not inside the 80% square,
which is the usual way this gets clipped. The wolf is 1586×882, and the largest
rectangle of that aspect inscribed in the safe circle is 358px wide at 512.
The mark is set to 340. That was computed, and the generator asserted it.

Still missing: a `favicon.ico`. `sharp` cannot write ICO, and modern browsers
take `icon.svg`. Add one if a stakeholder's browser needs it.

## Deliberately not imported

**Assets** — every one of these is one `Copy-Item` away if a screen turns out to
need it:

| Not copied | Why |
|---|---|
| `jmcc-shield-textured-gold.png` (3.7 MB), `jmcc-scratch-texture.png` (1.0 MB) | Precache weight. The app shell is cache-first and must open instantly on hotel wifi; 4.7 MB of decoration is the wrong trade in a PWA. |
| CASA logos (6 files, ~590 KB) | Co-branding is a public-site concern. The portal is internal and has no footer in the prototype. |
| Flag / scarf / lanyard mockups (16 MB) | Product mockups. `ASSETS.md` says do not use on the website either. |
| Delegate and event photos | The portal shows the delegate's own content, not marketing photography. |

**Patterns** — three blocks of `global.css` did not come over, because they are
page-rhythm mechanics that an app shell has no analogue for:

- `[data-reveal]` scroll reveal and its stagger cap. The site is long scrolling
  marketing pages; the portal is a tab bar over short screens. Reveals here
  would gate content behind an observer for no gain.
- `.band-blend`. It exists to soften the seam where the site's
  cream → ink → cream → primary band sequence changes color. The portal has no
  bands.
- The `::view-transition-*` retiming. That tunes Astro's `ClientRouter`; the
  portal navigates with `react-router` inside one island.

## Known gap, shared with the site

`ASSETS.md` flags three shield variants as missing and needed before launch. One
of them bites the portal harder than it bites the site:

> `jmcc-shield-white.png` — Nav logo on `primary` background (maroon)

`jmcc-shield-color.png` is the color shield on an opaque white background. The
site works around it with `mix-blend-multiply` on a cream circle in `Nav.astro`.
The prototype hit the same wall and used the same trick — a cream rounded chip
behind the shield in both the top bar and the desktop sidebar (export lines
48–50 and 86–88).

The portal's chrome is maroon on **every** screen, so this is not one component's
workaround here — it is the permanent state of the logo until a transparent
re-export exists. Worth pulling from the vector source in the same pass as the
exec cabinet sign-off.

Unrelated but adjacent: `jmcc-website/public/favicon.svg` is still Astro's
default logo, not a JMCC mark. Not this repo's to fix, but it is the same brand.
