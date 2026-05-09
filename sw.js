const CACHE = 'racecalendar-v2';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './scripts/series.js',
  './scripts/utils.js',
  './scripts/render.js',
  './scripts/calendar.js',
  './scripts/home.js',
  './scripts/tracks.js',
  './scripts/trivia.js',
  './pages/f1.html',
  './pages/moto_gp.html',
  './pages/wrc.html',
  './pages/wec.html',
  './pages/dakar.html',
  './pages/americas_cup.html',
  './pages/gp_offshore.html',
  './pages/tracks.html',
  './pages/trivia.html',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve cached immediately, update in background
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(response => {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        }).catch(() => null);
        return cached || network;
      })
    )
  );
});
