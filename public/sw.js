const CACHE_NAME = 'orlando-crociate-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  )
  self.clients.claim()
})

// Rete prima di tutto (il gioco e' comunque online-first: server sempre necessario
// per la modalita' online). In caso di rete assente, prova la cache come fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {})
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
