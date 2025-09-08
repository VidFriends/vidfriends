// src/service-worker.js
const CACHE_NAME = 'shortshare-shell-v1'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

// Install: cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  )
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key)
      }))
    ).then(() => self.clients.claim())
  )
})

// Fetch: network-first for API, cache-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Network-first for API endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/workers/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          // optional: update cache
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // For navigation and static, use cache-first then network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(networkRes => {
        // Optionally cache fetched static assets (skip opaque)
        if (event.request.destination && event.request.destination !== 'document') {
          caches.open(CACHE_NAME).then(cache => {
            try { cache.put(event.request, networkRes.clone()) } catch(e) {}
          })
        }
        return networkRes
      }).catch(() => {
        // If request is navigation, return the app shell
        if (event.request.mode === 'navigate') return caches.match('/index.html')
      })
    })
  )
})
