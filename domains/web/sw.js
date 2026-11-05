// Domains' app shell. Installing a version keeps every file of that version, all or
// nothing, and from then on the app opens straight from them: no page waits on the network.
// A new release changes VERSION, and any change to this file makes the browser install
// the set again the next time it looks; the new set takes over on the next launch.
//
// Nothing under /api/ or /auth/, no address starting with /_ (Holm's own pages, including
// the analytics and settings pages it puts under a prefix of its choosing), and nothing
// asked for with cache: 'no-store' is answered from the cache. Page addresses (/, /saved, /lists/…, /s/…, /about, /?q=…) all open the same
// shell; an address that ends like a file (/icon-512.png) is that file, even typed into the
// address bar.

const VERSION = '0.4.2'
const CACHE = 'domains-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/inter-latin.woff2', '/data/tlds.json', '/src/styles.css?v=0.4.2', '/src/main.js?v=0.4.2',
  '/src/main.js', '/src/dom.js', '/src/icons.js', '/src/api.js', '/src/theme.js', '/src/shell.js', '/src/settings.js', '/src/palette.js',
  '/src/catalog.js', '/src/gen.js', '/src/search.js', '/src/saved.js', '/src/lists.js',
  '/src/providers/index.js', '/src/providers/namecheap.js', '/src/providers/rdap.js',
  '/src/views/search.js', '/src/views/filters.js', '/src/views/cards.js', '/src/views/collections.js', '/src/views/shared.js', '/src/views/about.js',
  '/src/feedback.js', '/vendor/feedback/embed.js'
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
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('domains-') && key !== CACHE).map((key) => caches.delete(key))))
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
  const kept = await cache.match(url.pathname + url.search) || await cache.match(url.pathname)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname + url.search, response.clone())
  return response
}
