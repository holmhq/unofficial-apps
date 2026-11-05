// overlap's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them: no request waits on the network.
// A new deploy changes VERSION, so the browser installs the new set next time it looks; it
// takes over on the next launch, and the old set goes.
//
// Plans are never kept here: they come from /api/ and arrive live over /_ws, which pass
// straight through, as do /auth/ and Holm's own pages under /_. Every page address (/, /new,
// /p/<slug>) opens the same shell. An address that ends like a file (/icon-512.png) is that
// file, even typed into the address bar.

const VERSION = '0.3.0'
const CACHE = 'overlap-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/instrument-serif.woff2', '/fonts/instrument-serif-italic.woff2', '/css/app.css',
  '/js/app.js', '/js/ui.js', '/js/time.js', '/js/sound.js', '/js/home.js', '/js/create.js', '/js/plan.js',
  '/js/grid.js', '/js/live.js', '/js/mcp.js', '/js/palette.js'
]
// Kept the first time something asks for them, not installed with the app.
const LAZY = ['/icon-512.png', '/icon-maskable-512.png', '/social_preview.png']
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('overlap-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin || PASS.test(url.pathname)) return
  event.respondWith(answer(request, url))
})

async function answer(request, url) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate' && !FILE.test(url.pathname)) {
    const shell = await cache.match('/')
    if (shell) return shell
    return fetch(request)
  }
  const kept = await cache.match(url.pathname)
  if (kept) return kept
  const response = await fetch(request)
  if (LAZY.includes(url.pathname) && response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
