// SwarmChat's page shell. Installing a version keeps every page file of that version, all or
// nothing, and from then on the page opens straight from them. A new deploy changes VERSION
// (it follows holm.json), so the browser installs the new set next time it looks.
//
// Nothing under /api/, /auth/, /v1/ or /mcp, no address starting with /_ (Holm's own pages),
// not the agent client /swarmchat.mjs and nothing asked for with cache: 'no-store' is ever
// answered from the cache. An address that ends like a file (/icon-512.png) is that file,
// even typed into the address bar; every other address is a page and gets the shell.

const VERSION = '0.1.0'
const CACHE = 'swarmchat-' + VERSION
const FILES = [
  '/', '/app.css', '/console.css', '/src/main.js', '/src/kit.js', '/src/landing.js', '/src/map.js', '/src/pages.js',
  '/src/ways.js', '/src/export.js', '/fonts/inter-latin.woff2',
  '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png', '/manifest.webmanifest',
  '/vendor/feedback/embed.js',
  '/viewer', '/src/viewer.js', '/vendor/swarmchat/app.css', '/vendor/swarmchat/app.js', '/vendor/swarmchat/layout-worker.js',
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const VIEWER = /^\/s\/s[0-9a-f]{14}\/?$/
const PASS = /^\/(_[^/]*|api|auth|v1|mcp|dev|\.well-known)(\/|$)|^\/(sw\.js|swarmchat\.mjs)$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('swarmchat-') && key !== CACHE).map((key) => caches.delete(key))))
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
    // A swarm's viewer has its own page; every other page address gets the app's shell.
    const shell = await cache.match(VIEWER.test(url.pathname) ? '/viewer' : '/')
    if (shell) return shell
    return fetch(request)
  }
  const kept = await cache.match(url.pathname)
  if (kept) return kept
  // Anything else of ours (an icon) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
