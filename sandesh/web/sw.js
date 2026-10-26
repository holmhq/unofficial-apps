// Sandesh's offline shell. Every page file comes from the network first,
// so a new deploy shows on the next launch; the cached copy answers only
// when the network fails or takes more than four seconds. Nothing under
// /api/, /auth/ or /hooks/ is ever cached: conversations stay on the server.

const CACHE = 'sandesh-shell-v1'
const SHELL = [
  '/', '/src/styles.css', '/src/app.js', '/src/api.js', '/src/dom.js', '/src/icons.js', '/src/theme.js',
  '/src/store.js', '/src/live.js', '/src/postmark.js', '/src/composer.js', '/src/sms.js',
  '/src/views/landing.js', '/src/views/chats.js', '/src/views/templates.js', '/src/views/developers.js',
  '/src/views/phone.js', '/assets/fonts/anek-latin.woff2', '/icon-192.png'
]

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return
  if (/^\/(api|auth|hooks)(\/|$)|^\/_/.test(url.pathname)) return
  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  const network = fetch(request).then(response => {
    if (response.ok && !response.redirected) cache.put(request, response.clone())
    return response
  })
  try {
    const response = await Promise.race([network, new Promise(resolve => setTimeout(resolve, 4000))])
    if (response) return response
  } catch {}
  const cached = await cache.match(request, { ignoreSearch: true }) ||
    (request.mode === 'navigate' ? await cache.match('/') : undefined)
  return cached || network
}
