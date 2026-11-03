// Pictures in saved articles. /i/<hash> is a picture an article showed, fetched from its site
// the first time anyone opens it and kept from then on; /i/<hash>/t is a small square of it for
// the list. Only addresses that came in with a saved article have a hash here, so this is no
// open proxy. The copies are public web pictures, shared by everyone on the node who saved the
// same one.

const MAX = 12_000_000
const UA = 'Mozilla/5.0 (compatible; Shelf/0.1; read-later on a Holm server; +https://holmhq.com)'
const RESIZABLE = /^image\/(jpeg|png|webp|gif)$/

export function image(request, env, hash, thumb) {
  const { kv, s3 } = env.holm.app
  const tag = '"' + hash + (thumb ? 't' : '') + '"'
  const headers = { 'cache-control': 'public, max-age=31536000, immutable', etag: tag, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }
  if (request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers })

  if (thumb) {
    const small = s3.get('i/' + hash + '.t')
    if (small) return send(small, headers, request)
  }
  let file = s3.get('i/' + hash)
  if (!file) {
    const src = kv.get('img:' + hash)
    if (!src) return missing()
    if (kv.get('imgx:' + hash)) return missing(true)
    let response
    try {
      response = env.holm.net.fetch(src, { responseType: 'file', filename: hash, timeout: 3500, headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', referer: new URL(src).origin + '/' } })
    } catch (error) {
      try { kv.set('imgx:' + hash, 1, 30 * 60 * 1000) } catch {}
      return missing(true)
    }
    const kept = response.file
    const type = String((kept && kept.type) || (response.headers && response.headers['content-type']) || '').split(';')[0].toLowerCase()
    if (!response.ok || !kept || !/^image\//.test(type) || kept.size > MAX || type === 'image/svg+xml') {
      kv.set('imgx:' + hash, 1, 24 * 3600 * 1000)
      return missing(true)
    }
    s3.put('i/' + hash, kept, type)
    file = s3.get('i/' + hash)
    if (!file) return missing(true)
  }
  if (!thumb) return send(file, headers, request)
  const type = String(file.mime || '').toLowerCase()
  if (!RESIZABLE.test(type)) return send(file, headers, request)
  try {
    const made = env.holm.image.resize(file.data, { width: 320, height: 320, fit: 'cover', quality: 78 })
    const mime = type === 'image/png' ? 'image/png' : 'image/jpeg'
    s3.put('i/' + hash + '.t', made.data, mime)
    return send({ data: made.data, mime }, headers, request)
  } catch {
    return send(file, headers, request)
  }
}

function send(file, headers, request) {
  return new Response(request.method === 'HEAD' ? null : file.data, { headers: { ...headers, 'content-type': file.mime || 'application/octet-stream' } })
}

function missing(gone = false) {
  return new Response(gone ? 'That picture couldn’t be fetched.' : 'Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': gone ? 'public, max-age=3600' : 'no-store' } })
}
