// Until's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on Until opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION (tools/check.mjs keeps it equal
// to holm.json), so the browser installs the new set next time it looks; it takes over on
// the next launch.
//
// Nothing under /api/, /auth/ or /_ (Holm's own pages) is ever answered from here: a
// member's trackers stay with the node. An address that ends like a file (/icon-512.png) is
// that file, even typed into the address bar; every other address is a page and gets the shell.

const VERSION = '0.3.1'
const CACHE = 'until-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/manrope-latin.woff2', '/fonts/manrope-latin-ext.woff2', '/src/styles.css',
  '/src/app.js', '/src/dates.js', '/src/icons.js', '/src/mcp.js', '/src/palette.js', '/src/ui.js',
  '/src/feedback.js', '/vendor/feedback/embed.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|cdn-cgi|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(FILES.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  // Also drops the shell kept by versions before 0.3.0 (until-shell-v2).
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('until-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin) return
  if (PASS.test(url.pathname)) return
  event.respondWith(answer(request, url))
})

async function answer(request, url) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate' && !FILE.test(url.pathname)) {
    const shell = await cache.match('/')
    if (shell) return shell
    return fetch(request)
  }
  const hit = await cache.match(url.pathname)
  if (hit) return hit
  // Anything else of ours (an icon, the social image) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
