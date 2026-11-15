// Service worker okane: cache-first untuk app shell, network-only untuk Google API.
importScripts('./version.js');
const CACHE = `okane-${self.APP_VERSION}`;
const FONT_CACHE = 'okane-fonts-v1';

const SHELL = [
  './', './index.html', './version.js', './config.js', './manifest.webmanifest', './css/app.css',
  './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './js/app.js', './js/auth.js', './js/category-keywords.js', './js/dates.js', './js/db.js', './js/drive.js', './js/format.js',
  './js/icons.js', './js/model.js', './js/schema.js', './js/sheets.js', './js/store.js', './js/sync.js', './js/theme.js', './js/ui.js',
  './js/screens/atur-rekening.js', './js/screens/beranda.js', './js/screens/catat.js', './js/screens/laporan.js',
  './js/screens/onboarding.js', './js/screens/pengaturan.js', './js/screens/rekening.js', './js/screens/riwayat.js',
];

// Jangan pernah di-cache
const NETWORK_ONLY = ['accounts.google.com', 'oauth2.googleapis.com', 'www.googleapis.com', 'sheets.googleapis.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NETWORK_ONLY.includes(url.hostname)) return; // network-only (default browser)

  if (FONT_HOSTS.includes(url.hostname)) {
    // stale-while-revalidate untuk font
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(hit => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
