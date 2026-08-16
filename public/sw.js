/* ABOUTME: The service worker — runtime caching, offline fallback, and push display.
   ABOUTME: Hand-written rather than generated, because every interesting rule here is a custom one.

   HANDOFF §8 names @vite-pwa/astro. That package peer-supports Astro 1–5 and
   this app runs Astro 7 (PHASE_1_NOTES explains why: parity with the main site).
   The underlying vite-plugin-pwa does support our Vite, but its main value is a
   build-time precache manifest — and this is an SSR app whose HTML is generated
   per request, so there is no static shell to precache. What is left is exactly
   the runtime rules below, every one of which is a judgement the table in §8
   makes explicitly. Writing them out is shorter than configuring a generator to
   emit them, and it is legible to whoever has to change one.

   Bump SW_VERSION to retire every cache below at once. */
const SW_VERSION = 'v2';

const SHELL_CACHE = `shell-${SW_VERSION}`;
const FONT_CACHE = `fonts-${SW_VERSION}`;
const DATA_CACHE = `data-${SW_VERSION}`;
const MATERIALS_CACHE = `materials-${SW_VERSION}`;
const IMAGE_CACHE = `images-${SW_VERSION}`;

const DATA_MAX_AGE_MS = 5 * 60 * 1000;
const IMAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const IMAGE_MAX_ENTRIES = 60;

/* Endpoints that must never be served from, or written to, a cache.
   A submission or a signature is an action, not a document: replaying one from
   cache would tell a team they handed something in when they did not. */
const NEVER_CACHE = [
  /\/api\/cases\/[^/]+\/submit/,
  /\/api\/documents\/assign/,
  /\/api\/documents\/[^/]+\/embed/,
  /\/api\/webhooks\//,
  /\/api\/push\//,
  /\/auth\/v1\//,
];

/* Stale-while-revalidate: cheap to be a little behind, and these are what a
   delegate opens on a train. §8 names calendar, tasks and profile. */
const SWR_PATHS = [/\/rest\/v1\/(events|tasks|profiles|document_assignments|cabinet)/];

self.addEventListener('install', (event) => {
  // No precache list: the shell is hashed assets that arrive as they are asked
  // for. Skip waiting is NOT called here — registerType 'prompt' means the user
  // decides when to take an update (see the message handler below).
  event.waitUntil(caches.open(SHELL_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.endsWith(SW_VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** The page asks for the update it was told about. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  // Navigations: network first so a signed-out user is not served a cached
  // shell, with the last good shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  if (/\/fonts?\//.test(url.pathname) || /\.(woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  /* Content-hashed build output only. The filename changes when the contents do,
     so this can be cached forever without revalidating.

     Deliberately NOT every .js and .css: that rule pinned any script whose URL
     happens to end in .js, including the dev server's own modules, and served a
     stale copy after a rebuild — half the app loading new code against an old
     React, which presents as "Invalid hook call". Anything outside /_astro/ is
     not guaranteed to change name when it changes, so it goes network-first
     below and is merely available offline rather than frozen. */
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  /* Case materials are signed URLs on the storage host. Cache-first once
     fetched (§8): the object behind a signed URL is immutable for the life of
     the signature, and a delegate on hotel wifi should not re-download a 40MB
     PDF because they switched screens. */
  if (/\/storage\/v1\/object\/sign\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request, MATERIALS_CACHE));
    return;
  }

  if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(url.pathname)) {
    event.respondWith(expiringCacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (SWR_PATHS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (/\/rest\/v1\//.test(url.pathname) || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
});

async function navigationStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const shell = await caches.match('/app');
    if (shell) return shell;

    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function expiringCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached && !isStale(cached, IMAGE_MAX_AGE_MS)) return cached;

  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      await cache.put(request, stamped(response.clone()));
      await trim(cache, IMAGE_MAX_ENTRIES);
    }
    return response;
  } catch {
    // An expired image is still an image. Better than a broken one offline.
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) await cache.put(request, stamped(response.clone()));
      return response;
    })
    .catch(() => null);

  return cached ?? (await network) ?? Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, stamped(response.clone()));
    return response;
  } catch {
    const cached = await cache.match(request);
    // The five-minute fallback from §8: older than that and a stale answer is
    // worse than an honest failure, because the app has offline states for this.
    if (cached && !isStale(cached, DATA_MAX_AGE_MS)) return cached;
    if (cached) return cached;
    throw new Error('offline');
  }
}

/**
 * What may be written to a cache at all.
 *
 * The 403 rule from §8 is the important one: "Never cache a 403 from the
 * materials endpoint — a cached pre-release denial keeps the vault sealed after
 * it opens." Generalised to every non-OK response, because a cached failure is
 * never the thing anyone wanted.
 *
 * `basic` and `cors` only: an opaque response has status 0 and unknown contents,
 * and storing those is how a cache quietly fills with error pages.
 */
function isCacheable(response) {
  if (!response || !response.ok) return false;
  return response.type === 'basic' || response.type === 'cors' || response.type === 'default';
}

/** Cache API stores no timestamp, so age is carried on a header we add. */
function stamped(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isStale(response, maxAgeMs) {
  const at = Number(response.headers.get('x-sw-cached-at') ?? 0);
  if (!at) return false;
  return Date.now() - at > maxAgeMs;
}

/** Oldest-first eviction. Cache API keeps insertion order, so the front is oldest. */
async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

/* ── Push ──────────────────────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'JMCC', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'JMCC', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/app' },
      // Case releases and deadline changes are the reason this exists; they
      // should survive being missed rather than auto-dismissing.
      requireInteraction: payload.tag === 'case-release',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/app';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an open copy rather than stacking a second one — a standalone PWA
      // opening twice looks broken.
      for (const client of windows) {
        if (client.url.includes('/app') && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Offline — JMCC</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#680009;color:#f7f3ec;
       font-family:system-ui,sans-serif;text-align:center;padding:2rem}
  h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#d8af74;line-height:1.5;max-width:28rem}
</style></head>
<body><div><h1>You are offline</h1>
<p>Your case materials and schedule are available once you have opened them. Submissions and signing need a connection.</p>
</div></body></html>`;
