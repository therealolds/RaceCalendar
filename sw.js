const CACHE = 'racecalendar-v27';

// Static app shell. Calendars, logos and backgrounds are added dynamically
// from series.json, so adding a series never requires touching this file.
const SHELL = [
  './',
  './index.html',
  './calendars.html',
  './series.html',
  './tracks.html',
  './trivia.html',
  './games.html',
  './lightsout.html',
  './pitstop.html',
  './millemiglia.html',
  './more.html',
  './preferences.html',
  './style.css',
  './fonts/fraunces-latin.woff2',
  './fonts/fraunces-latin-italic.woff2',
  './manifest.json',
  './series.json',
  './track-index.json',
  './trivia.json',
  './scripts/data.js',
  './scripts/ui.js',
  './scripts/page-home.js',
  './scripts/page-calendars.js',
  './scripts/page-series.js',
  './scripts/page-tracks.js',
  './scripts/page-trivia.js',
  './scripts/page-lightsout.js',
  './scripts/page-pitstop.js',
  './scripts/page-millemiglia.js',
  './scripts/page-preferences.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const series = await (await fetch('./series.json')).json();
      const extra = series
        .flatMap(s => [s.calendar, s.logo, s.background])
        .filter(Boolean)
        .map(p => './' + p);
      await Promise.allSettled(extra.map(url => cache.add(url)));
      // every track file the calendars reference, so the tracks page and
      // per-track timezone fallbacks work offline too
      const ids = new Set();
      await Promise.all(series.map(async s => {
        try {
          const res = await cache.match('./' + s.calendar) || await fetch('./' + s.calendar);
          ((await res.json()).races || []).forEach(r => {
            if (r.idtrack && String(r.idtrack).trim() !== '') ids.add(r.idtrack);
          });
        } catch { /* one bad calendar shouldn't stop the rest */ }
      }));
      await Promise.allSettled([...ids].map(id => cache.add(`./tracks/${id}.json`)));
    } catch {
      // offline install of extras is best-effort
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve cached immediately, refresh in background.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let cached = await cache.match(e.request);
    if (!cached && e.request.mode === 'navigate') {
      // series.html?id=x → fall back to the cached template
      cached = await cache.match(e.request, { ignoreSearch: true });
    }
    const network = fetch(e.request)
      .then(response => {
        if (response.ok) cache.put(e.request, response.clone());
        return response;
      })
      .catch(() => cached || new Response('Offline', { status: 503 }));
    return cached || network;
  })());
});
