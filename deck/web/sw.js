// Deck's app shell. Installing a version keeps every file of the app, all or nothing, and
// from then on Deck opens straight from them, like an app on a phone: no request waits on
// the network. A new deploy changes VERSION, so the browser installs the new set next time
// it looks; it takes over on the next launch, and the old set goes. The pages ask for files
// with ?v=<version>; the cache keeps them by path, and a new version brings a new cache.
//
// Nothing under /api/, /auth/ or /.well-known/, no address starting with /_ (Holm's own
// pages: /_holm/, /_ws and the analytics pages it puts under a prefix of its choosing) and
// nothing asked for with cache: 'no-store' is ever answered from here. Shared and embedded
// decks (/s/…, /e/…), presenting (/p/…), the sample (/sample) and upload links (/upload/…)
// are pages the server writes, with each deck's own title and picture, so they always go to
// the network, and a workspace's pictures (/media/…) stay in the browser's own cache only.
// Every other page address (/, /w/…, /d/…, /join/…, /new) opens the same shell, which draws
// the page itself. An address that ends like a file (/icon-512.png) is that file, even
// typed into the address bar.

const VERSION = '0.4.0'
const CACHE = 'deck-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/inter-latin-opsz-normal.woff2', '/fonts/inter-latin-ext-opsz-normal.woff2',
  '/deck/deck.css', '/deck/render.js',
  '/src/theme.js', '/src/app.css', '/src/app.js', '/src/lib.js', '/src/live.js', '/src/schema.js', '/src/studio.js',
  '/src/view.css', '/src/view.js', '/img/sample-shot.webp'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known|s|e|p|upload|media)(\/|$)|^\/sample$|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('deck-') && key !== CACHE).map((key) => caches.delete(key))))
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
  // Anything else of Deck's (the feedback script, the 404 page) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
