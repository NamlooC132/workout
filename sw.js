// Service worker: caches the whole app so it opens and works with no internet (e.g. in the gym basement).
// Bump VERSION whenever you upload changed files so phones pick up the new version.
const VERSION = 'workoutlog-v1.4.0';
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
  './js/logic/records.js',
  './js/logic/volume.js',
  './js/logic/blocks.js',
  './js/logic/analytics.js',
  './js/logic/backup.js',
  './js/logic/samples.js',
  './js/logic/catalog.js',
  './js/logic/restTimer.js',
  './js/ui/icons.js',
  './js/ui/musclemap.js',
  './js/ui/components.js',
  './js/ui/exercises.js',
  './js/ui/routines.js',
  './js/ui/workout.js',
  './js/ui/history.js',
  './js/ui/progress.js',
  './js/ui/plan.js',
  './js/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first (instant, offline), falling back to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
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
