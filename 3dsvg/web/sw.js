// 3dsvg's app shell. Installing a version keeps every page file of that
// version, all or nothing, and from then on the editor opens straight from
// them, like an app on a phone: no request waits on the network, and it
// works offline. A new deploy changes VERSION, so the browser installs the
// new set next time it looks; it takes over on the next launch, and the old
// set goes.
//
// Nothing under /api/, /auth/ or /.well-known/, no address starting with /_
// (Holm's own pages) and no share page (/s/…, which the server writes with
// the shape's own title and preview) is ever cached or answered from here.
// The 32 MB video converter (/vendor/ffmpeg/) loads from the network the
// first time a video is made, and the browser's own cache keeps it. An
// address that ends like a file (/icon-512.png) is that file, even typed
// into the address bar; every other address is a page and gets the shell.

const VERSION = '0.1.3'
const CACHE = '3dsvg-' + VERSION
const FILES = [
  '/', '/manifest.webmanifest', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png', '/icon-192.png',
  '/src/account.js', '/src/app.js', '/src/capture.js', '/src/design.js', '/src/dialogs.js', '/src/editor.js',
  '/src/ffmpeg.js', '/src/fonts.js', '/src/geometry.js', '/src/icons.js', '/src/materials.js', '/src/pixels.js',
  '/src/scene.js', '/src/settings.js', '/src/shapes.js', '/src/share.js', '/src/state.js', '/src/styles.css',
  '/src/textures.js', '/src/tools.js', '/src/ui.js',
  '/fonts/geist.woff2', '/fonts/text/archivo-black.ttf', '/fonts/text/bebas-neue.ttf', '/fonts/text/black-ops-one.ttf',
  '/fonts/text/dm-sans.ttf', '/fonts/text/oswald.ttf', '/fonts/text/pacifico.ttf', '/fonts/text/permanent-marker.ttf',
  '/fonts/text/playfair-display.ttf', '/fonts/text/righteous.ttf', '/fonts/text/rubik-mono-one.ttf',
  '/vendor/feedback/embed.js', '/vendor/opentype/opentype.module.js', '/vendor/three/addons/exporters/GLTFExporter.js',
  '/vendor/three/addons/exporters/OBJExporter.js', '/vendor/three/addons/exporters/PLYExporter.js', '/vendor/three/addons/exporters/STLExporter.js',
  '/vendor/three/addons/loaders/SVGLoader.js', '/vendor/three/addons/shaders/HorizontalBlurShader.js', '/vendor/three/addons/shaders/VerticalBlurShader.js',
  '/vendor/three/addons/utils/BufferGeometryUtils.js', '/vendor/three/three.core.min.js', '/vendor/three/three.module.min.js'
]
const FILE = /^\/.*\.[a-z0-9]+$/i
const PASS = /^\/(_[^/]*|api|auth|s|\.well-known)(\/|$)|^\/vendor\/ffmpeg\/|^\/sw\.js$/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((path) => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('3dsvg-') && key !== CACHE).map((key) => caches.delete(key))))
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
  // Anything else of ours (the larger icons) is kept once fetched.
  const response = await fetch(request)
  if (response.ok && response.type === 'basic' && !response.redirected) cache.put(url.pathname, response.clone())
  return response
}
