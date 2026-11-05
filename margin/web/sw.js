// Margin Studio's app shell. Installing a version keeps every file Studio needs, all or
// nothing, and from then on Studio opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch, and the old set goes.
//
// Only Studio is answered from here. Its addresses (/studio and below, /new, /join/…) open
// the same shell, which draws the page itself; /studio/preview/… is a page the server
// writes, so it goes to the network. Everything else Margin serves is written by the server
// for readers (the home page, workspaces, writers, posts, feeds, themes, drawings, media),
// so those pages and their files always go to the network, untouched: this worker answers
// a reader's page only with the same files Studio uses. Nothing under /api/ or /auth/, no
// address starting with /_ (Holm's own pages) and nothing asked for with cache: 'no-store'
// is ever answered from here. The maths renderer (KaTeX) and the cover drawings are kept
// the first time Studio uses them.

const VERSION = '0.8.2'
const CACHE = 'margin-' + VERSION
const FILES = [
  '/studio', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/themes/quiet/inter-latin.woff2', '/margin/ui.css', '/margin/live-covers.js', '/vendor/editor/tiptap.js',
  '/studio/boot.js', '/studio/studio.css', '/studio/app.js', '/studio/lib.js', '/studio/mcp.js', '/studio/zip.js',
  '/studio/editor.js', '/studio/editor.css'
]
const STUDIO = /^\/(studio(\/(?!preview\/).*)?|join\/[a-z0-9]+|new)$/
const LAZY = /^\/(vendor\/katex\/.+|margin\/covers\.js)$/
const KEPT = new Set(FILES)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('margin-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin) return
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (request.mode === 'navigate') {
    if (STUDIO.test(path)) event.respondWith(shell(request))
    return
  }
  if (KEPT.has(path) || LAZY.test(path)) event.respondWith(file(request, path))
})

async function shell(request) {
  const kept = await caches.match('/studio', { cacheName: CACHE })
  return kept || fetch(request)
}

async function file(request, path) {
  const cache = await caches.open(CACHE)
  const kept = await cache.match(path)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected && LAZY.test(path)) cache.put(path, response.clone())
  return response
}
