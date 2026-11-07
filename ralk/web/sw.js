// Ralk's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch, and the old set goes.
//
// Nothing under /api/ or /auth/, no address starting with /_ (Holm's own pages: /_holm/,
// and the analytics and settings pages it puts under a prefix of its choosing) and nothing
// asked for with cache: 'no-store' is ever cached or answered from the cache: notifications
// stay on the server, and Holm's own pages stay Holm's. An address that ends like a file
// (/icon-512.png) is that file, even typed into the address bar; every other address is a
// page and gets the shell. A click on a notification brings the open tab to the front.

const VERSION = '0.3.1'
const CACHE = 'ralk-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/shell.js', '/src/ui.js', '/src/icons.js', '/src/api.js', '/src/live.js', '/src/theme.js',
  '/src/audio.js', '/src/notify.js', '/src/inbox.js', '/src/store.js', '/src/render-worker.js',
  '/src/views/app.js', '/src/views/live.js', '/src/views/sounds.js', '/src/views/voice.js', '/src/views/connect.js', '/src/views/landing.js',
  '/vendor/earshot/earshot.js', '/vendor/feedback/embed.js'
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
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ralk-') && key !== CACHE).map((key) => caches.delete(key))))
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
  // Anything else of ours (an icon, a vendored file) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c)
    if (open) return open.focus()
    return self.clients.openWindow('/')
  }))
})
