// pastebin's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them: no request waits on the network.
// A new deploy changes VERSION, so the browser installs the new set next time it looks; it
// takes over on the next launch, and the old set goes.
//
// Only these static files are kept. Pastes never are: their text, files and states come from
// /api/ and /raw/, which pass straight through, as do /auth/, Holm's own pages under /_ and
// the pb command at /cli/pb. Every page address (/, /p/<slug>, /mine, /keys) opens the same
// shell, which asks the server for the paste each time, so a one-time paste is opened by the
// server or not at all. An address that ends like a file (/icon-512.png) is that file, even
// typed into the address bar.

const VERSION = '0.5.0'
const CACHE = 'pastebin-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/favicon-v1.svg', '/assets/favicon-v1.ico', '/assets/apple-touch-icon-v1.png',
  '/assets/fonts/bricolage-grotesque-opsz.woff2', '/assets/fonts/fragment-mono.woff2', '/assets/fonts/fragment-mono-italic.woff2',
  '/src/styles.css', '/src/app.js', '/src/lib.js', '/src/code.js', '/src/markdown.js', '/src/mcp.js', '/src/palette.js',
  '/src/views/compose.js', '/src/views/view.js', '/src/views/mine.js', '/src/views/keys.js',
  '/vendor/highlight/highlight.min.js', '/vendor/highlight/extra-languages.min.js',
  '/vendor/marked/marked.esm.js', '/vendor/dompurify/purify.min.js', '/vendor/feedback/embed.js'
]
// Kept the first time something asks for them, not installed with the app.
const LAZY = ['/icon-512.png', '/icon-maskable-512.png', '/social_preview.png', '/assets/icon-192-v1.png', '/assets/icon-512-v1.png', '/assets/og-v1.png']
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|raw|auth|cli|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pastebin-') && key !== CACHE).map((key) => caches.delete(key))))
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
