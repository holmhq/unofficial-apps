// Kalendar's offline shell. Every page file comes from the network first, so
// a new deploy shows on the next visit; the cached copy answers only when
// the network fails or takes more than four seconds. Nothing under /api/,
// /auth/, /b/ or /feed/ is ever cached: bookings stay on the server.

const CACHE = 'kalendar-shell-v2'
const SHELL = [
  '/', '/src/styles.css', '/src/main.js', '/src/shell.js', '/src/ui.js', '/src/icons.js', '/src/api.js',
  '/src/sound.js', '/src/theme.js', '/src/time.js', '/src/zones.js',
  '/src/views/book.js', '/src/views/profile.js', '/src/views/manage.js', '/src/views/dash.js', '/src/views/landing.js',
  '/src/views/onboard.js', '/src/views/common.js', '/src/views/missing.js', '/src/views/zone-picker.js',
  '/src/views/event-sheet.js', '/src/views/profile-sheet.js',
  '/assets/inter-latin.woff2', '/icon-192.png'
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return
  if (/^\/(api|auth|b|feed)(\/|$)|^\/_/.test(url.pathname)) return
  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  const network = fetch(request).then((response) => {
    if (response.ok && !response.redirected) cache.put(request, response.clone())
    return response
  })
  try {
    const response = await Promise.race([network, new Promise((resolve) => setTimeout(resolve, 4000))])
    if (response) return response
  } catch {}
  const cached = await cache.match(request, { ignoreSearch: true }) ||
    (request.mode === 'navigate' ? await cache.match('/') : undefined)
  return cached || network
}
