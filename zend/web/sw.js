// Zend's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them, like an app on a phone: no
// page waits on the network. A new release changes VERSION, so the browser installs the
// new set the next time it looks; the new set takes over on the next launch.
//
// Nothing under /api/, /auth/ or /hooks/, and no address starting with /_ (Holm's own
// pages, its MCP server among them), is ever answered from here: conversations stay on the
// server. Page addresses (/, /t/…, /new, /templates, /developers, /phone) all open the same
// shell; an address that ends like a file (/icon-512.png) is that file, even typed into the
// address bar.

const VERSION = '0.4.0'
const CACHE = 'zend-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/ui.js', '/src/icons.js', '/src/api.js', '/src/store.js', '/src/sound.js', '/src/theme.js',
  '/src/sms.js', '/src/composer.js', '/src/mcp.js', '/src/palette.js',
  '/src/views/list.js', '/src/views/thread.js', '/src/views/compose.js', '/src/views/templates.js',
  '/src/views/developers.js', '/src/views/phone.js', '/src/views/welcome.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|hooks|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('zend-') && key !== CACHE).map((key) => caches.delete(key))))
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
  return fetch(request)
}
