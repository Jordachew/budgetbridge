/* Roadbook service worker: makes the app open and work with no signal.
   The BUILD block is rewritten by scripts/build.mjs every time you deploy. */
/*BUILD*/
const VERSION = 'dev';
const FILES = [];
/*END*/
const CORE = `roadbook-core-${VERSION}`;
const RUNTIME = 'roadbook-runtime-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(FILES)));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('roadbook-core-') && k !== CORE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // never touch Supabase or other sites
  if (url.pathname.endsWith('/config.js')) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; }   // settings must always be fresh when online
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && url.pathname.includes('/vendor/tesseract/')) (await caches.open(RUNTIME)).put(req, res.clone());   // receipt reader: cached on first use
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const shell = await caches.match('index.html') || await caches.match('./'); if (shell) return shell; }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all[0];
    if (c) return c.focus();
    return self.clients.openWindow('./');
  })());
});
