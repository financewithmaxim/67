const SW_VERSION = 'leitfaden-v1';
const SHELL = [
  './', 'index.html', 'study.html', 'glossary.html', 'capstone.html',
  'css/style.css', 'js/app.js', 'js/course.js', 'js/state.js', 'js/migrate.js', 'js/merge.js',
  'js/store.js', 'js/srs.js', 'js/normalize.js', 'js/queue.js', 'js/grading.js', 'js/study.js',
  'js/calibration.js', 'js/irb.js', 'js/gistsync.js', 'js/gist-client.js',
  'js/widgets/irb-calc.js', 'js/widgets/asrf.js', 'manifest.webmanifest', 'icon.svg',
];

self.addEventListener('install', e => { e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SW_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // card data: network-first (fresh content), fall back to cache offline
  if (url.pathname.includes('/data/cards/')) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // MathJax / fonts (cross-origin): runtime cache, cache-first
  if (url.origin !== location.origin) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => hit)));
    return;
  }
  // same-origin app shell: cache-first, fall back to network
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
