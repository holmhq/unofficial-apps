// 3dsvg's offline shell. Every page file comes from the network first, so a
// new deploy shows on the next launch; the cached copy answers only when the
// network fails or takes more than four seconds. Nothing under /api/,
// /auth/ or /s/ is cached, and neither is the 32 MB video converter.

const CACHE = '3dsvg-shell-v1'
const SHELL = [
  '/', '/src/styles.css', '/src/app.js', '/src/editor.js', '/src/share.js', '/src/state.js', '/src/design.js',
  '/src/scene.js', '/src/geometry.js', '/src/materials.js', '/src/fonts.js', '/src/pixels.js', '/src/textures.js',
  '/src/tools.js', '/src/settings.js', '/src/capture.js', '/src/dialogs.js', '/src/shapes.js', '/src/account.js',
  '/src/ui.js', '/src/icons.js', '/fonts/geist.woff2', '/fonts/text/rubik-mono-one.ttf',
  '/vendor/three/three.module.min.js', '/vendor/three/three.core.min.js',
  '/vendor/three/addons/loaders/SVGLoader.js', '/vendor/three/addons/utils/BufferGeometryUtils.js',
  '/vendor/three/addons/shaders/HorizontalBlurShader.js', '/vendor/three/addons/shaders/VerticalBlurShader.js',
  '/vendor/three/addons/exporters/STLExporter.js', '/vendor/three/addons/exporters/GLTFExporter.js',
  '/vendor/three/addons/exporters/OBJExporter.js', '/vendor/three/addons/exporters/PLYExporter.js',
  '/vendor/opentype/opentype.module.js'
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
  if (/^\/(api|auth|s)(\/|$)|^\/_|^\/vendor\/ffmpeg\//.test(url.pathname)) return
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
