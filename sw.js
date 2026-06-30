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
  // CDN assets only (MathJax/fonts): runtime cache-first. NEVER cache api.github.com (authenticated; must stay live,
  // or a stale gist pull would overwrite the remote with a stale merge → cross-device data loss).
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => hit)));
    return;
  }
  if (url.origin !== location.origin) return; // any other cross-origin (incl. api.github.com): straight to network, never cached
  // same-origin: stale-while-revalidate — serve cache fast, refresh in the background so updates land next load.
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => { const cp = r.clone(); caches.open(SW_VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => hit);
    return hit || net;
  }));
});
