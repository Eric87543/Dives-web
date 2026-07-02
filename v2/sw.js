/* sw.js (v2) — App 殼層離線快取 */
const CACHE = 'dives2-v1';
const SHELL = [
  './', './index.html', './css/style.css',
  './js/util.js', './js/store.js', './js/calc.js', './js/api.js',
  './js/charts.js', './js/ui.js', './js/auth.js', './js/sync.js', './js/views.js', './js/app.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c2 => c2.put(req, cp)).catch(() => {}); return res; }).catch(() => caches.match('./index.html'))));
  }
});
