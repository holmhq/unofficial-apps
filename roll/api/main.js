// Roll's server. Holm loads this module on every request, so it stays small: photo files
// (/t thumbnails, /p previews, /o originals) are answered here, everything else under /api/
// and the shared-album pages (/s/…) load http.js, and the rest is the app's own static files.

const FILE = /^\/(t|p|o)\/([A-Za-z0-9_-]{1,64})$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const file = FILE.exec(path)
    if (file && (request.method === 'GET' || request.method === 'HEAD')) return photoFile(file[1], file[2], url, request, env)
    if (path.startsWith('/api/') || path.startsWith('/s/')) return (await import('./http.js')).handle(request, env, url)
    return env.holm.web.fetch(request)
  }
}

// A photo's file, for its owner, or for anyone holding the link of a shared album it's in.
// Shared viewers get the thumbnail and the preview, which the browser re-encoded without
// the photo's metadata; the original, with its location, stays with the owner.
function photoFile(kind, id, url, request, env) {
  const { ds, s3 } = env.holm.app
  const doc = ds.findOne('photos', id)
  if (!doc) return missing()
  const member = env.holm.auth.getMember()
  const own = !!member && doc.owner === member.id
  if (!own) {
    const slug = url.searchParams.get('s')
    if (!slug || kind === 'o' || doc.trashed) return missing()
    const album = ds.find('albums', { share: slug }, { limit: 1 })[0]
    if (!album || album.owner !== doc.owner || !(doc.albums || []).includes(album.id)) return missing()
  }
  const key = kind === 'o' && !doc.orig ? 'p/' + id : kind + '/' + id
  const tag = '"' + id + '-' + kind + (doc.orig ? 'o' : '') + '"'
  const headers = {
    'cache-control': own ? 'private, max-age=31536000, immutable' : 'public, max-age=3600',
    etag: tag,
    'x-content-type-options': 'nosniff'
  }
  if (request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers })
  const object = s3.get(key)
  if (!object) return missing()
  headers['content-type'] = object.mime || 'image/jpeg'
  if (url.searchParams.has('dl')) {
    const name = kind === 'o' && doc.orig ? doc.name : String(doc.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg'
    headers['content-disposition'] = `attachment; filename="${name.replace(/[^\w.\- ]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
  }
  return new Response(request.method === 'HEAD' ? null : object.data, { headers })
}

function missing() {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}
