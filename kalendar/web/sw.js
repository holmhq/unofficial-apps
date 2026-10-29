// Kalendar's app shell. Installing a version keeps every page file of that
// version, all or nothing, and from then on the app opens straight from them,
// like an app on a phone: no request waits on the network. A new deploy
// changes VERSION, so the browser installs the new set next time it looks;
// it takes over on the next launch, and the old set goes. The page loads all
// of its code at start (main.js), so it never mixes two versions.
//
// Nothing under /api/, /auth/, /feed/, /_holm/ or /.well-known/, and no
// calendar file, is ever cached: bookings stay on the server, and Holm's own
// sign-in and connector pages stay Holm's. Addresses of pages (/@avery,
// /hours, /b/…) all open the same shell, which draws the page itself.

const VERSION = '0.3.1'
const CACHE = 'kalendar-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/shell.js', '/src/ui.js', '/src/icons.js', '/src/api.js', '/src/store.js', '/src/theme.js',
  '/src/sound.js', '/src/time.js', '/src/zones.js', '/src/countries.js', '/src/timeline.js', '/src/track.js', '/src/qr.js',
  '/src/views/book.js', '/src/views/profile.js', '/src/views/manage.js', '/src/views/dash.js', '/src/views/landing.js',
  '/src/views/onboard.js', '/src/views/common.js', '/src/views/missing.js', '/src/views/zone-picker.js',
  '/src/views/event-sheet.js', '/src/views/profile-sheet.js', '/src/views/insights.js', '/src/views/link-sheet.js',
  '/vendor/qrcode/qrcode.mjs'
]
const PASS = /^\/(api|auth|feed|_holm|\.well-known)(\/|$)|^\/b\/[^/]+\/(calendar|invite\.ics)$|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('kalendar-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || PASS.test(url.pathname)) return
  event.respondWith(answer(request, url))
})

async function answer(request, url) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate') {
    const shell = await cache.match('/')
    if (shell) return shell
    return fetch(request)
  }
  const kept = await cache.match(url.pathname)
  if (kept) return kept
  // Anything else of ours (a picture, a vendored file) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
