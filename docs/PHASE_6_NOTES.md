# Phase 6 — PWA hardening

HANDOFF §9: "Service worker, manifest, icons, offline states, install flows,
push, update prompt. Lighthouse PWA audit."

---

## The one deviation that matters

**HANDOFF §8 names `@vite-pwa/astro`. It does not support Astro 7.**

Its peer range is Astro 1–5; this app runs Astro 7, which was a deliberate Phase 1
choice for parity with the main site (`jmcc-website` is on `astro@7.1.0`). The
underlying `vite-plugin-pwa` *does* support our Vite 8, so that was the obvious
fallback — but its main value is a build-time precache manifest, and this is an
SSR app whose HTML is generated per request. There is no static shell to
precache.

What is actually needed is the runtime caching table in §8, and every row of it
is a judgement rather than a default:

| §8 rule | How |
|---|---|
| App shell, cache-first | Hashed `/_astro/` assets — immutable by filename, so cache-first needs no revalidation |
| Fonts, cache-first 1 year | Matched by path and extension |
| Supabase `GET`, network-first with 5-minute fallback | Timestamp stamped on the cached response; older than five minutes and a stale answer loses to an honest failure |
| Calendar, tasks, profile — stale-while-revalidate | Matched on the REST path per table |
| Case materials — cache-first once fetched | Signed storage URLs; the object is immutable for the life of the signature |
| Submissions and signing — **never cached** | Passed straight through, not intercepted at all |
| Images — cache-first, 30-day expiry, 60-entry cap | Timestamped, oldest-first eviction |

So `public/sw.js` is hand-written. It is shorter than the config that would
generate it, and legible to whoever has to change a rule.

---

## Verified in a browser

| Check | Result |
|---|---|
| `npm run build` | passes |
| `npm run typecheck` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 110 unit tests pass |
| `npm run test:db` | 129 assertions pass |
| Service worker | registers, activates, **controls the page** |
| Caches created | `shell-v1`, `fonts-v1`, `images-v1` populated on first load |
| Manifest | parses; `start_url /app`, `scope /app`, `display standalone`, 5 icons |
| EN/FR manifest | the `<link>` swaps to `manifest.fr.webmanifest` and back with the locale |

### The two rules worth proving

**A failed response is never cached.** §8: "Never cache a 403 from the materials
endpoint — a cached pre-release denial keeps the vault sealed after it opens."
Generalised to every non-OK response. Tested in both directions, which is the
only version of this test that means anything:

```
/api/cases        → 503, data cache after: []          ← the failure is not stored
/api/cases/x/submit → probed, data cache after: []     ← never intercepted at all
/api/time         → 200, data cache after: [/api/time] ← the cache does work
```

Without that third line the first two would prove only that the cache was broken.

---

## Not verified

- **Lighthouse has not been run.** It belongs against the deployed HTTPS URL, not
  a dev server — half of what it scores (HTTPS, real manifest fetch, offline
  start_url) is meaningless on `localhost` with Vite's dev middleware in the way.
  The installability criteria it checks were verified individually above.
- **Offline navigation.** The fallback path and the offline HTML are written but
  never exercised: the test harness cannot toggle the network.
- **Push end to end.** The VAPID keys are in `.env`, the endpoints and the
  subscribe flow are written, and the `push_subscriptions` policies are tested —
  but no notification has been sent to a real device. Push needs HTTPS, so this
  is a post-deploy check.
- **The offline queue.** IndexedDB does not exist in the unit-test environment,
  so `outbox.ts` is typechecked but untested. Its rules — sequential sends,
  stop on first failure, drop after five attempts — are the kind that want a
  browser test harness, which this repo does not have yet.

---

## Decisions worth challenging

**Updates are offered, never applied.** `registerType: 'prompt'` in §8 means a
delegate mid-submission does not get the page reloaded under them because a
deploy landed. The new worker sits in `waiting` until they tap Update.

**The install prompt is not on Home.** §8 says to trigger it "only after a
meaningful completion, never on first load". It lives on the More screen:
someone who has gone looking through the drawer is oriented enough to be offered
an install, and a banner on arrival is the fastest way to teach people to dismiss
everything this app shows.

**iOS Safari specifically, not any browser on iOS.** Chrome and Firefox on iOS
are Safari underneath and cannot install to the home screen at all, so the
Share → Add to Home Screen instructions would describe a button they do not have.
Tested with real user-agent strings for both.

**Push may not even be asked for on iOS until the app is installed.** iOS needs
16.4+ *and* home-screen installation; asking in a Safari tab throws rather than
prompting. That gate is the difference between an opt-in and a console error.

**Permission is requested on a click, after choosing an alert type.** §8:
"Request permission only after the user opts into a specific alert type." A
prompt on load gets denied by reflex, and a denial is close to permanent.

**Messages queue offline; submissions and signing never do.** §8 is explicit and
right: a message four minutes late is a message, a submission four minutes late
is a missed deadline reported as a success. Nothing in `outbox.ts` is wired to
`/submit`.

**A push subscription is not readable by an executive.** It is a capability to
notify a device. Sending runs on the secret key and does not consult the policy,
so there is no reason for anyone to enumerate which devices a delegate carries.

**The VAPID public key is served from `/api/push/key`** rather than becoming a
`PUBLIC_` variable. It is not a secret, but this keeps one `VAPID_*` naming
convention in the deployment and avoids renaming a variable that is already set.

---

## Deferred

- **The unread badge on the tab bar.** `totalUnread()` has been written and tested
  since Phase 5; putting it in the shell means polling the channel list, and the
  sensible version of that is a Realtime subscription on the shell rather than a
  timer.
- **Background sync.** The outbox flushes on `online` and on `visibilitychange`,
  which covers a phone that regained signal while the screen was off. A real
  Background Sync registration would also flush with the app closed, and is
  Chrome-only — worth adding when there is evidence it is needed.
- **Cache durability warnings.** §8 notes iOS evicts storage after ~7 days of
  non-use. Cached materials are already a convenience layer over server truth, so
  nothing breaks; telling the user about it would be noise.
