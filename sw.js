// Japan Lottery Pro — Service Worker v2
const CACHE_NAME = 'jlp-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instala e faz cache dos arquivos principais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Remove caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: Network first, fallback para cache
self.addEventListener('fetch', event => {
  // Não faz cache de chamadas para APIs externas
  if (event.request.url.includes('anthropic.com') ||
      event.request.url.includes('open-meteo.com') ||
      event.request.url.includes('wttr.in') ||
      event.request.url.includes('stripe.com') ||
      event.request.url.includes('googletagmanager')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Salva no cache se for bem sucedido
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Fallback para cache quando offline
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/index.html');
        });
      })
  );
});
