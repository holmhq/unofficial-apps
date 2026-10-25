// Until's offline shell. Every page file comes from the network first, so a
// new deploy shows on the next launch; the cached copy answers only when the
// network fails or takes more than four seconds. Nothing under /api/ or
// /auth/ is ever cached: a member's trackers stay with the node.

const CACHE = 'until-shell-v1'
const SHELL = ['/', '/src/styles.css', '/src/app.js', '/src/ui.js', '/src/icons.js', '/src/dates.js', '/fonts/manrope-latin.woff2']

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
  if (/^\/(api|auth)(\/|$)|^\/_/.test(url.pathname)) return
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
