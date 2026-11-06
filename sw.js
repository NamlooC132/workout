// Service worker: caches the whole app so it opens and works with no internet (e.g. in the gym basement).
// Bump VERSION whenever you upload changed files so phones pick up the new version.
const VERSION = 'workoutlog-v1.30.4';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/vdom.js',
  './js/i18n.js',
  './js/i18n/he.js',
  './js/i18n/he-exercises.js',
  './js/db.js',
  './js/store.js',
  './js/timer.js',
  './js/workoutService.js',
  './js/logic/util.js',
  './js/logic/units.js',
  './js/logic/muscles.js',
  './js/logic/model.js',
  './js/logic/history.js',
  './js/logic/progression.js',
  './js/logic/warmup.js',
  './js/logic/yoga.js',
  './js/logic/readiness.js',
  './js/logic/records.js',
  './js/logic/volume.js',
  './js/logic/blocks.js',
  './js/logic/analytics.js',
  './js/logic/backup.js',
  './js/logic/samples.js',
  './js/logic/catalog.js',
  './js/logic/howto.js',
  './js/logic/howto/part1.js',
  './js/logic/howto/part2.js',
  './js/logic/howto/part3.js',
  './js/logic/howto/part4.js',
  './js/logic/howto/part5.js',
  './js/logic/howto/he-part1.js',
  './js/logic/howto/he-part2.js',
  './js/logic/howto/he-part3.js',
  './js/logic/howto/he-part4.js',
  './js/logic/howto/he-part5.js',
  './js/logic/howto/part6.js',
  './js/logic/howto/he-part6.js',
  './js/logic/restTimer.js',
  './js/logic/health.js',
  './js/ui/icons.js',
  './js/ui/musclemap.js',
  './js/ui/muscleview.js',
  './js/ui/howto.js',
  './js/ui/datainfo.js',
  './js/ui/health.js',
  './js/ui/components.js',
  './js/ui/exercises.js',
  './js/ui/routines.js',
  './js/ui/workout.js',
  './js/ui/history.js',
  './js/ui/progress.js',
  './js/ui/plan.js',
  './js/ui/settings.js',
  './js/ui/yoga.js',
  './js/ui/readiness.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' = always fetch fresh copies, never the browser's short-term HTTP cache
  // (GitHub Pages keeps files there for 10 minutes, which mixed old and new files after quick updates).
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'photos-v1').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first (instant, offline), falling back to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'images.pexels.com' || url.hostname === 'images.unsplash.com' || (url.origin === self.location.origin && url.pathname.includes('/images/exercises/'))) {
    // Example photos: show the saved copy (works offline), fetch it once otherwise.
    event.respondWith(caches.open('photos-v1').then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
