// feedback's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them: no request waits on the network.
// A new deploy changes VERSION, so the browser installs the new set next time it looks; it
// takes over on the next launch, and the old set goes.
//
// Nothing anyone sends is kept here: projects, items, comments, photos and stats come from
// /api/, which passes straight through, as do /auth/ and Holm's own pages under /_. Every
// page address (/, /projects/…, /b/…, a project's own /<name>) opens the same shell. An
// address that ends like a file (/icon-512.png, /widget.html, /embed.js) is that file, even
// typed into the address bar.
//
// The form other sites embed (/embed.js, /widget) runs there in its own partitioned
// storage, which this worker never sees; only this app's own pages use these copies.
//
// Holm answers /widget.html and /preview.html with a redirect to /widget and /preview, and a
// page can't be answered with a redirected response, so those two are kept, and opened, at
// their short addresses; a .html address goes to the network to be redirected.

const VERSION = '0.19.3'
const CACHE = 'feedback-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/fonts/bricolage-grotesque-opsz.woff2', '/assets/fonts/fragment-mono.woff2',
  '/src/styles.css', '/src/compose.css', '/src/widget.css',
  '/src/app.js', '/src/account.js', '/src/lib.js', '/src/icons.js', '/src/project.js', '/src/board.js', '/src/compose.js',
  '/src/keys.js', '/src/stats.js', '/src/changelog.js', '/src/link.js', '/src/mine.js', '/src/follow.js', '/src/mcp.js',
  '/src/palette.js', '/src/qr.js', '/src/widget.js', '/src/preview.js',
  '/vendor/lucide/icons.js', '/vendor/qrcode/qrcode.mjs',
  '/embed.js', '/changelog.json'
]
// Pages of their own that aren't the app: the form and the stand-in site behind previews.
const DOCS = ['/widget', '/preview']
// Kept the first time something asks for them, not installed with the app.
const LAZY = ['/icon-512.png', '/icon-maskable-512.png', '/social_preview.png', '/assets/og.png']
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known)(\/|$)|^\/sw\.js$|^\/llms\.txt$|\.html$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll([...FILES, ...DOCS].map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('feedback-') && key !== CACHE).map((key) => caches.delete(key))))
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
  if (request.mode === 'navigate' && !FILE.test(url.pathname) && !DOCS.includes(url.pathname)) {
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
