// Shelf's app shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the app opens straight from them, like an app on a phone: no
// request waits on the network. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch.
//
// Articles (/api/items/<id>/content?v=<n>, which never change at a given n), PDFs
// (/api/items/<id>/file) and the pictures kept from them (/i/…) are kept too, in their own
// caches, so what you saved reads offline;
// signing out empties them. Nothing else under /api/, /auth/ or /_ (Holm's own pages) is ever
// answered from here. An address that ends like a file (/icon-512.png) is that file, even
// typed into the address bar; every other address is a page and gets the shell.

const VERSION = '0.8.2'
const CACHE = 'shelf-' + VERSION
const ARTICLES = 'shelf-articles'
const PICTURES = 'shelf-pictures'
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/fonts/inter-latin.woff2', '/fonts/newsreader-latin.woff2', '/fonts/newsreader-italic-latin.woff2',
  '/fonts/atkinson-latin.woff2', '/fonts/atkinson-bold-latin.woff2', '/fonts/atkinson-italic-latin.woff2', '/src/styles.css',
  '/src/main.js', '/src/ui.js', '/src/icons.js', '/src/theme.js', '/src/api.js', '/src/live.js', '/src/store.js', '/src/shell.js', '/src/bits.js',
  '/src/extract.js', '/src/reader.js', '/src/listen.js', '/src/importer.js', '/src/share.js', '/src/zip.js', '/src/export.js', '/src/feeds.js', '/src/books.js', '/src/md.js', '/src/pdfview.js', '/src/ask.js', '/src/query.js',
  '/src/views/app.js', '/src/views/landing.js', '/src/views/add.js', '/src/views/quote.js', '/src/views/review.js', '/src/views/page.js',
  '/vendor/readability/Readability.js', '/vendor/dompurify/purify.es.mjs'
]
// The PDF viewer (1.7 MB) is kept the first time a PDF is opened, not installed with the app.
const LAZY = ['/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs']
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|\.well-known)(\/|$)|^\/sw\.js$/
const ARTICLE = /^\/api\/items\/[A-Za-z0-9_-]+\/content$/
const PDF = /^\/api\/items\/[A-Za-z0-9_-]+\/file$/
const PICTURE = /^\/i\/[a-f0-9]{32}(\/t)?$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('shelf-') && key !== CACHE && key !== ARTICLES && key !== PICTURES).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || request.cache === 'no-store' || url.origin !== location.origin) return
  if (ARTICLE.test(url.pathname) && url.searchParams.has('v')) { event.respondWith(kept(request, ARTICLES)); return }
  if (PICTURE.test(url.pathname)) { event.respondWith(kept(request, PICTURES)); return }
  if (PDF.test(url.pathname)) { event.respondWith(kept(request, ARTICLES)); return }
  if (PASS.test(url.pathname)) return
  event.respondWith(answer(request, url))
})

async function kept(request, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') cache.put(request, response.clone())
  return response
}

async function answer(request, url) {
  const cache = await caches.open(CACHE)
  if (request.mode === 'navigate' && !FILE.test(url.pathname)) {
    const shell = await cache.match('/')
    if (shell) return shell
    return fetch(request)
  }
  const hit = await cache.match(url.pathname)
  if (hit) return hit
  // Anything else of ours (the sample pictures, an icon) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
