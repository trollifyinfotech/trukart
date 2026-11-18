/* sw.js - Veloura service worker: offline APP SHELL + public image cache.
   It NEVER caches Supabase REST/auth/function responses (those may be private). Catalogue data is cached by the
   app itself in IndexedDB (assets/js/cache.js). Bump VERSION when you change this file's behaviour. */
const VERSION = 'v15';
const SHELL = 'veloura-shell-' + VERSION, IMG = 'veloura-img-' + VERSION;
const SHELL_FILES = ['./', 'index.html', 'assets/css/styles.css', 'assets/js/icons.js', 'assets/js/core.js', 'assets/js/cache.js', 'assets/js/app.js', 'assets/js/storefront.js', 'assets/js/storefront_admin.js', 'assets/js/music_admin.js', 'assets/vendor/jszip.min.js', 'assets/js/xlsx-lite.js', 'assets/js/bulk.js', 'assets/js/music.js', 'assets/css/storefront.css', 'assets/js/shop.js', 'assets/js/payments.js', 'assets/js/shoppage.js', 'assets/js/account.js', 'assets/js/seller.js', 'assets/js/admin.js', 'supabase/supabase.js', 'assets/img/favicon.svg', 'assets/img/placeholder.svg'];
const CDN_LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.46.1/dist/umd/supabase.min.js'];
const MAX_IMAGES = 400, NET_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* a missing optional file must not block install */ })));
    for (const u of CDN_LIBS) { try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (err) { /* cached on first online use instead */ } }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('veloura-') && k !== SHELL && k !== IMG) await caches.delete(k);   // obsolete versions
    await self.clients.claim();
  })());
});

const withTimeout = (req, ms) => { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms); return fetch(req, { signal: ctl.signal }).finally(() => clearTimeout(t)); };
const cacheable = (url) => !/\/database\//.test(url.pathname) && /(\/|\.html|\.js|\.css|\.svg|\.png|\.ico|\.webp|\.json)$/.test(url.pathname);

async function networkFirst(req) {
  const cache = await caches.open(SHELL), url = new URL(req.url);
  try {
    const res = await withTimeout(req, NET_TIMEOUT);
    if (res.ok && res.type === 'basic' && cacheable(url)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit;
    if (req.mode === 'navigate') { const shell = (await cache.match('index.html')) || (await cache.match('./')); if (shell) return shell; }
    return new Response('You are offline and this file is not saved on this device.', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
async function cacheFirst(req, name) {
  const cache = await caches.open(name), hit = await cache.match(req); if (hit) return hit;
  const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
}
async function trim(cache) { const keys = await cache.keys(); for (let i = 0; i < keys.length - MAX_IMAGES; i++) await cache.delete(keys[i]); }
async function imageSWR(req) {
  const cache = await caches.open(IMG), hit = await cache.match(req);
  const update = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()).then(() => trim(cache)); } return res; }).catch(() => null);
  if (hit) { update.catch(() => {}); return hit; }          // saved copy shown instantly; no second download for the same URL
  const net = await update; return net || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { if (url.pathname.endsWith('/sw.js')) return; e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'cdn.jsdelivr.net' && /supabase-js/.test(url.pathname)) { e.respondWith(cacheFirst(req, SHELL)); return; }
  if (/\.supabase\.(co|in)$/.test(url.hostname) && url.pathname.startsWith('/storage/v1/object/public/')) { e.respondWith(imageSWR(req)); return; }
  /* everything else (Supabase REST, auth, functions, other sites) is left alone: never cached here */
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
