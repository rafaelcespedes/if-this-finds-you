// The library's offline copy (All letters: src/archive/offline.ts registers it, in the build only). Once the library
// has been opened with a connection, it opens again without one, with the letters, cards and letter pages it has seen.
// Its scope is the library's address (/letters, /letters.html), so the writing tool (/) never passes through here.
// - the page: asked for fresh every time (the newest library when online), the last good copy kept for offline
// - the build's files (/assets/, named by their content, so a kept copy is never stale): kept as they're fetched,
//   the oldest let go past KEEP (the letter-sized card images live in their own cache: src/archive/cards.ts)
// - the icons and the manifest: fresh when online, kept for offline
const CACHE = 'letters-offline-v1';
const KEEP = 160;
const scope = new URL(self.registration.scope); // …/letters
const base = new URL('./', scope); // where the site lives (Vite's base)
const PAGE = scope.href; // the one key for the page, whichever address it came by
const ASSETS = `${base.pathname}assets/`;
const KEPT_TOO = /\/(brand\/|favicon|manifest\.webmanifest)/;

/** A redirected response can't answer a page load (/letters.html → /letters on the host); keep its body only. */
const plain = (res) => (res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res);
const keepable = (res) => res && res.ok && res.type === 'basic';
/** The files this worker keeps: the build's, the icons, the manifest (same site only). */
function ours(href) {
  const url = new URL(href, base);
  return url.origin === base.origin && (url.pathname.startsWith(ASSETS) || KEPT_TOO.test(url.pathname));
}

const open = () => caches.open(CACHE);
// a module script asks with an Origin header, the copy kept ahead of time without one; the files are named by their
// content, so that difference (Vary) never matters here
const match = async (key) => (await open()).match(key, { ignoreVary: true });

async function put(key, res) {
  const c = await open();
  await c.put(key, res);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) if (k.url !== PAGE) await c.delete(k);
}

// each answers at once; the copy is written after (e.waitUntil keeps the worker awake for it)
async function page(e) {
  try {
    const res = await fetch(e.request);
    if (keepable(res)) e.waitUntil(put(PAGE, plain(res.clone())));
    return res;
  } catch {
    return (await match(PAGE)) ?? Response.error();
  }
}

async function kept(e) {
  const req = e.request;
  const hit = await match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (keepable(res)) e.waitUntil(put(req, res.clone()));
  return res;
}

async function fresh(e) {
  try {
    const res = await fetch(e.request);
    if (keepable(res)) e.waitUntil(put(e.request, res.clone()));
    return res;
  } catch {
    return (await match(e.request)) ?? Response.error();
  }
}

/** One file kept ahead of need (if it isn't already). */
async function keep(url) {
  try {
    if (await match(url)) return;
    const res = await fetch(url);
    if (keepable(res)) await put(url, res);
  } catch {}
}

/** The page and what it loads first, so the library opens offline even if nothing else was kept. */
async function prime() {
  const res = plain(await fetch(new URL('letters.html', base)));
  if (!keepable(res)) return;
  const html = await res.clone().text();
  await put(PAGE, res);
  const files = new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], base).href).filter(ours));
  await Promise.all([...files].map(keep));
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(prime().catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('letters-offline-') && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// what the page had already loaded before this worker was looking (its first visit): keep those too
self.addEventListener('message', (e) => {
  const urls = Array.isArray(e.data?.keep) ? e.data.keep : [];
  e.waitUntil(Promise.all(urls.filter((u) => typeof u === 'string' && ours(u)).map(keep)));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== base.origin) return;
  if (req.mode === 'navigate') e.respondWith(page(e));
  else if (url.pathname.startsWith(ASSETS)) e.respondWith(kept(e));
  else if (KEPT_TOO.test(url.pathname)) e.respondWith(fresh(e));
});
