// App-shell cache. Network-first for our own files (so edits show up), cache when offline. Weather is cached in IndexedDB.
const CACHE = 'closet-v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.png', ...['app', 'ui', 'wear', 'avatar', 'db', 'sync', 'picker', 'weather', 'image', 'home', 'closet', 'add', 'history', 'settings', 'drive'].map((m) => `js/${m}.js`)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
