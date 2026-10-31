// Kalendar's app shell. Installing a version keeps every page file of that
// version, all or nothing, and from then on the app opens straight from them,
// like an app on a phone: no request waits on the network. A new deploy
// changes VERSION, so the browser installs the new set next time it looks;
// it takes over on the next launch, and the old set goes. The page loads all
// of its code at start (main.js), so it never mixes two versions.
//
// Nothing under /api/, /auth/, /feed/, /confirm-email or /.well-known/, no address starting
// with /_ (Holm's own pages: /_holm/, and the analytics and settings pages it
// puts under a prefix of its choosing), no calendar file and nothing asked
// for with cache: 'no-store' is ever cached or answered from the cache:
// bookings stay on the server, and Holm's own pages stay Holm's. Addresses
// of pages (/@avery, /hours, /b/…) all open the same shell, which draws the
// page itself.

const VERSION = '0.8.0'
const CACHE = 'kalendar-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/icons/amber.svg', '/icons/teal.svg', '/icons/blue.svg', '/icons/violet.svg', '/icons/graphite.svg',
  '/icons/amber.png', '/icons/teal.png', '/icons/blue.png', '/icons/violet.png', '/icons/graphite.png',
  '/assets/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/shell.js', '/src/ui.js', '/src/icons.js', '/src/api.js', '/src/store.js', '/src/theme.js',
  '/src/sound.js', '/src/time.js', '/src/cover.js', '/src/zones.js', '/src/countries.js', '/src/timeline.js', '/src/track.js', '/src/qr.js', '/src/chips.js',
  '/src/views/book.js', '/src/views/profile.js', '/src/views/manage.js', '/src/views/dash.js', '/src/views/landing.js',
  '/src/views/onboard.js', '/src/views/common.js', '/src/views/missing.js', '/src/views/zone-picker.js',
  '/src/views/event-sheet.js', '/src/views/profile-tab.js', '/src/views/insights.js', '/src/views/link-sheet.js',
  '/vendor/qrcode/qrcode.mjs'
]
const PASS = /^\/(_[^/]*|api|auth|feed|\.well-known|confirm-email)(\/|$)|^\/b\/[^/]+\/(calendar|invite\.ics)$|^\/sw\.js$/

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
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin || PASS.test(url.pathname)) return
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
