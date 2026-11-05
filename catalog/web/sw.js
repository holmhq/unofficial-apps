// The store's app shell. Installing a version keeps every file of that version, all or
// nothing, and from then on the store opens straight from them: no page waits on the
// network. A new release changes VERSION, so the browser installs the new set the next
// time it looks; it takes over on the next launch.
//
// Every page address (/, /apps/<app>, /start, /admin) gets the kept front page, which
// carries the index the server put in it; the page draws from that at once, then asks
// the API whether anything changed. Each launch also fetches a fresh front page for the
// next one. A page asked for with ?ref= (a branch preview) always comes from the server.
// Nothing under /api/ or /auth/, and no address starting with /_ (Holm's own pages), is
// answered from here. An address that ends like a file (/icon-512.png, /llms.txt) is
// that file, even typed into the address bar.

const VERSION = '0.16.0'
const CACHE = 'catalog-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/favicon.svg', '/assets/icon.svg',
  '/assets/fonts/bricolage-grotesque-opsz.woff2', '/assets/fonts/fragment-mono.woff2',
  '/src/styles.css', '/src/app.js', '/src/lib.js', '/src/account.js', '/src/install.js', '/src/reviews.js',
  '/src/mcp.js', '/src/admin.js', '/src/start.js', '/src/belt.js',
  '/vendor/feedback/embed.js', '/vendor/hairline/kernel.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('catalog-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin || PASS.test(url.pathname)) return
  if (request.mode === 'navigate' && !FILE.test(url.pathname)) {
    if (url.searchParams.has('ref')) return
    event.respondWith(page(event))
    return
  }
  event.respondWith(file(request, url))
})

async function page(event) {
  const cache = await caches.open(CACHE)
  const kept = await cache.match('/')
  const fresh = fetch('/', { cache: 'no-store', credentials: 'same-origin' }).then((response) => {
    if (response.ok && !response.redirected) return cache.put('/', response.clone()).then(() => response)
    return response
  })
  if (kept) {
    event.waitUntil(fresh.catch(() => {}))
    return kept
  }
  return fetch(event.request)
}

async function file(request, url) {
  const cache = await caches.open(CACHE)
  const kept = await cache.match(url.pathname)
  return kept || fetch(request)
}
