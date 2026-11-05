// Roll's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch.
//
// Thumbnails (/t/<id>) are kept too, in their own cache, so the grid draws at once and works
// offline; signing out empties it. Previews and originals come from the network (the
// browser's own cache keeps them), and nothing under /api/, /auth/ or /_ (Holm's own pages)
// is ever answered from here. An address that ends like a file (/icon-512.png) is that
// file, even typed into the address bar; every other address is a page and gets the shell.

const VERSION = '0.3.1'
const CACHE = 'roll-' + VERSION
const PHOTOS = 'roll-photos'
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/ui.js', '/src/icons.js', '/src/theme.js', '/src/api.js', '/src/time.js', '/src/store.js',
  '/src/grid.js', '/src/viewer.js', '/src/upload.js', '/src/exif.js', '/src/places.js', '/src/memories.js', '/src/zip.js', '/src/shell.js',
  '/src/views/app.js', '/src/views/photos.js', '/src/views/shared.js', '/src/views/landing.js',
  '/vendor/thumbhash/thumbhash.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known|o|p)(\/|$)|^\/sw\.js$/
const THUMB = /^\/t\/[A-Za-z0-9_-]+$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('roll-') && key !== CACHE && key !== PHOTOS).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin || PASS.test(url.pathname)) return
  if (THUMB.test(url.pathname)) { if (!url.search) event.respondWith(thumb(request)); return }
  event.respondWith(answer(request, url))
})

async function thumb(request) {
  const cache = await caches.open(PHOTOS)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') cache.put(request, response.clone())
  return response
}

async function answer(request, url) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate' && !FILE.test(url.pathname)) {
    if (/^\/s\//.test(url.pathname)) return fetch(request).catch(() => cache.match('/'))
    const shell = await cache.match('/')
    if (shell) return shell
    return fetch(request)
  }
  const kept = await cache.match(url.pathname)
  if (kept) return kept
  // Anything else of ours (a sample photo, the place names) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
