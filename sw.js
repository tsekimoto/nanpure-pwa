const CACHE_NAME = 'nanpure-pwa-v1.0.13';
const FETCH_TIMEOUT_MS = 4000;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './css/style.css',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!/^https?:$/.test(new URL(event.request.url).protocol)) return;

  // ネットワーク優先: 常に最新を取得し、オフライン時のみキャッシュを使う
  event.respondWith(
    fetchWithTimeout(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
