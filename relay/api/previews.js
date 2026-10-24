import { holm } from "./_holm.js";
// Relay API — link previews: server-side OG unfurl + S3-cached image proxy.
// Fetching happens server-side so the viewer's IP/referrer never reach the target
// site, and og:image is re-served through us (no hotlink/CORS breakage). Authed
// (requireMember) + SSRF-guarded (literal private/metadata IPs) + KV-cached.

import { requireMember, ok, bad } from './lib.js'

var FETCH_TIMEOUT_MS = 6000
var MAX_HTML_BYTES = 512 * 1024
var MAX_IMAGE_BYTES = 5 * 1024 * 1024
var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ── SSRF guard ──────────────────────────────────────────────────────────────
// Blocks non-http(s) schemes, literal private/loopback/link-local IPs, known
// cloud-metadata hosts, and *.internal / *.local / localhost. NOTE: this does
// NOT prevent DNS-rebinding (a public hostname that resolves to a private IP);
// that relies on Holm's net.fetch sandboxing. Best-effort application guard.
var METADATA_HOSTS = ['169.254.169.254', '169.254.170.2', 'metadata.google.internal', 'metadata', 'metadata.azure.com']
function isPrivateIp(ip) {
  var m = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    var a = +m[1], b = +m[2]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a >= 224) return true // multicast / reserved
  }
  var v = String(ip).toLowerCase()
  if (v === '::1' || v === '::' || /^fe[89ab]/.test(v) || /^fc/.test(v)) return true
  return false
}
function safeUrl(raw) {
  var u
  try { u = new URL(String(raw)) } catch (_e) { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  var host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (METADATA_HOSTS.indexOf(host) >= 0) return null
  if (isPrivateIp(host)) return null
  if (host === 'localhost' || host.indexOf('.localhost') === host.length - 10) return null
  if (host.indexOf('.internal') === host.length - 10 || host.indexOf('.local') === host.length - 6) return null
  return u
}

// ── OG extraction (slim, self-contained; inspired by metatags/api/lib/extract) ─
function decodeEntities(t) {
  var map = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
  return String(t || '').replace(/&(#39|amp|lt|gt|quot|nbsp);/gi, function (f, k) {
    var v = map[String(k).toLowerCase()]
    return v != null ? v : f
  })
}
function attr(rawTag, name) {
  var m = String(rawTag).match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'<>]+))', 'i'))
  return m ? (m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : null
}
function metaValue(html, key) {
  var re = /<meta\b[^>]*>/gi, tag
  while ((tag = re.exec(html))) {
    var prop = String(attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop') || '').toLowerCase()
    if (prop === key) { var c = attr(tag, 'content'); if (c) return decodeEntities(c.trim()) }
  }
  return ''
}
function titleTag(html) {
  var m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '').trim()) : ''
}
function favicon(html, base) {
  var re = /<link\b[^>]*>/gi, tag
  while ((tag = re.exec(html))) {
    if (String(attr(tag, 'rel') || '').toLowerCase().indexOf('icon') >= 0) {
      var h = attr(tag, 'href'); if (h) return resolveUrl(h, base)
    }
  }
  return ''
}
function resolveUrl(href, base) { try { return new URL(href, base).href } catch (_e) { return null } }
function hostOf(u) { try { return new URL(u).host.replace(/^www\./, '') } catch (_e) { return '' } }

function buildPreview(targetUrl, html, finalUrl) {
  var base = finalUrl || targetUrl
  var title = metaValue(html, 'og:title') || metaValue(html, 'twitter:title') || titleTag(html) || ''
  var desc = metaValue(html, 'og:description') || metaValue(html, 'twitter:description') || metaValue(html, 'description') || ''
  var img = metaValue(html, 'og:image:secure_url') || metaValue(html, 'og:image') || metaValue(html, 'twitter:image') || ''
  if (img) img = resolveUrl(img, base)
  return {
    url: targetUrl, finalUrl: base, host: hostOf(base),
    title: String(title).slice(0, 300), description: String(desc).slice(0, 600),
    image: img || '', favicon: favicon(html, base) || ''
  }
}
function minimalPreview(url, finalUrl) {
  var f = finalUrl || url
  return { url: url, finalUrl: f, host: hostOf(f), title: '', description: '', image: '', favicon: '' }
}

// ── handlers ─────────────────────────────────────────────────────────────────
export function handlePreview(request) {
  var ctx = requireMember()
  if (ctx.error) return ctx.error
  var raw = request.query && request.query.url ? String(request.query.url) : ''
  var u = safeUrl(raw)
  if (!u) return bad('Invalid URL')
  var href = u.href
  var key = 'preview:' + hash(href)
  var cached = readCache(key)
  if (cached) return ok({ ok: true, preview: cached })

  var res = null
  try {
    res = holm.net.fetch(href, { method: 'GET', timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': 'RelayPreview/1.0', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })
  } catch (_e) {
    return ok({ ok: true, preview: minimalPreview(href, href) })
  }
  if (!res || !res.ok) {
    writeCache(key, minimalPreview(href, href))
    return ok({ ok: true, preview: minimalPreview(href, href) })
  }
  var ct = header(res, 'content-type')
  var text = ''
  try { text = res.text() || '' } catch (_e) { text = '' }
  if (typeof text === 'string') text = text.slice(0, MAX_HTML_BYTES)
  var finalUrl = header(res, 'x-final-url') || href
  var isHtml = /text\/html|application\/xhtml/i.test(ct) || /<html|<!doctype html/i.test(text.slice(0, 300))
  var preview = isHtml ? buildPreview(href, text, finalUrl) : minimalPreview(href, finalUrl)
  writeCache(key, preview)
  return ok({ ok: true, preview: preview })
}

export function handlePreviewImage(request) {
  var ctx = requireMember()
  if (ctx.error) return ctx.error
  var raw = request.query && request.query.u ? String(request.query.u) : ''
  var u = safeUrl(raw)
  if (!u) return bad('Invalid image URL')
  var href = u.href
  var s3key = 'preview-img/' + hash(href)

  var cached = null
  try { cached = holm.app.s3.get(s3key) } catch (_e) { cached = null }
  if (cached && cached.data) {
    return { status: 200, body: cached.data, headers: { 'Content-Type': cached.mime || 'image/png', 'Cache-Control': 'public, max-age=86400' } }
  }
  var res = null
  try { res = holm.net.fetch(href, { method: 'GET', timeout: FETCH_TIMEOUT_MS, responseType: 'file', filename: 'preview' }) } catch (_e) { return bad('Image unavailable') }
  if (!res || !res.ok || !res.file) return bad('Image unavailable')
  var mime = res.file.type || header(res, 'content-type') || 'image/png'
  if (!/^image\//i.test(mime)) return bad('Not an image')
  if (res.file.size && res.file.size > MAX_IMAGE_BYTES) return bad('Image too large')
  try { holm.app.s3.put(s3key, res.file, mime) } catch (_e) { return bad('Image unavailable') }
  var blob = null
  try { blob = holm.app.s3.get(s3key) } catch (_e) { blob = null }
  if (!blob || !blob.data) return bad('Image unavailable')
  return { status: 200, body: blob.data, headers: { 'Content-Type': blob.mime || mime, 'Cache-Control': 'public, max-age=86400' } }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function header(res, name) {
  if (!res || !res.headers) return ''
  return res.headers[name] || res.headers[name.toLowerCase()] || ''
}
// Cache/S3 key. djb2 is not cryptographic, but a collision only wastes one fetch.
function hash(s) {
  var h = 5381
  for (var i = 0; i < String(s).length; i++) h = ((h << 5) + h + String(s).charCodeAt(i)) >>> 0
  return h.toString(36)
}
function readCache(key) {
  var raw = null
  try { raw = holm.app.kv.get(key) } catch (_e) { return null }
  if (!raw) return null
  try { var obj = JSON.parse(raw); if (obj && obj._ts && (Date.now() - obj._ts) < CACHE_TTL_MS) return obj.preview } catch (_e) {}
  return null
}
function writeCache(key, preview) {
  try { holm.app.kv.set(key, JSON.stringify({ _ts: Date.now(), preview: preview })) } catch (_e) {}
}
