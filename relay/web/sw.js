// Relay's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on Relay opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION (tools/check.mjs keeps it equal
// to holm.json), so the browser installs the new set next time it looks; it takes over on
// the next launch.
//
// Nothing under /api/, /auth/ or /_ (Holm's own pages and the realtime socket) is ever
// answered from here. An address that ends like a file (/icon-512.png) is that file, even
// typed into the address bar; every other address is a page and gets the shell.
// (No `push` handler: Holm has no Web Push yet. Notifications are shown by the page.)

const VERSION = '0.4.1'
const CACHE = 'relay-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/assets/inter-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/api.js', '/src/auth.js', '/src/icons.js', '/src/mcp.js', '/src/palette.js', '/src/realtime.js',
  '/src/router.js', '/src/sound.js', '/src/state.js', '/src/theme.js', '/src/ui.js',
  '/src/pages/chat.js', '/src/pages/conversations.js', '/src/pages/discover.js', '/src/pages/friends.js',
  '/src/pages/onboarding.js', '/src/pages/settings.js',
  '/vendor/feedback/embed.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|cdn-cgi|\.well-known)(\/|$)|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('relay-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
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

// Notification tap: focus an open Relay window and route it to the chat, or
// open one. Notifications are shown by the page via registration.showNotification
// (tag `relay:<roomId>`, data.url = chat path) so they also work in installed PWAs.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.url) || '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) {
        win.postMessage({ type: 'relay:navigate', url: path })
        return win.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
