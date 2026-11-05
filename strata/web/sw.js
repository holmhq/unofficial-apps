// Strata's app shell. Installing a version keeps every page file of that
// version, all or nothing, and from then on the game opens straight from
// them, like an app on a phone: no request waits on the network, and it
// plays offline. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch, and the old
// set goes. The page loads all of its code at start, so it never mixes two
// versions.
//
// Nothing under /api/, /auth/ or /.well-known/, and no address starting with
// /_ (Holm's own pages), is ever cached or answered from here. An address
// that ends like a file (/icon-512.png) is that file, even typed into the
// address bar; every other address is a page and gets the shell.

const VERSION = '0.1.3'
const CACHE = 'strata-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/src/app.js', '/src/audio.js', '/src/controls.js', '/src/game.js', '/src/icons.js', '/src/render.js', '/src/rules.js', '/src/state.js', '/src/styles.css', '/src/theme.js', '/src/ui.js',
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
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('strata-') && key !== CACHE).map((key) => caches.delete(key))))
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
  // Anything else of ours (the larger icons) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
