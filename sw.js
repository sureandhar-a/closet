// App-shell cache, stale-while-revalidate: answer from cache at once, refresh it in the background (edits show on the next open).
// Weather is cached in IndexedDB.
const CACHE = 'closet-v24';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.png', ...['app', 'ui', 'wear', 'db', 'sync', 'picker', 'weather', 'image', 'home', 'closet', 'add', 'history', 'settings', 'drive', 'recognize'].map((m) => `js/${m}.js`)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))) /* fresh from the server, not the HTTP cache */).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/sw.js')) return; // sw.js: always the server's (version check)
  // no-cache: revalidate with the server, never reuse the browser's stale HTTP copy.
  const net = fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.match(e.request).then((hit) => hit || net));
});
