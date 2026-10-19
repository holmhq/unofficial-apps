import { holm } from "./_holm.js";
// Shared helpers. App storage is shared; every owner lookup is explicitly scoped.
export const ds = () => holm.app.ds
export const now = () => Date.now()
export const iso = value => value == null ? null : new Date(value).toISOString()
export const SLUG = /^[A-Za-z0-9]{12}$/
export const MAX_CONTENT = 512 * 1024
export const MAX_FILE = 25 * 1024 * 1024
export const MAX_TOTAL = 50 * 1024 * 1024
export const GRANT_MS = 10 * 60 * 1000
export const FILE_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, no-cache',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
}

export function json(status, body) {
  return { status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } }
}
export const ok = (body = {}, status = 200) => json(status, Object.assign({ ok: true }, body))
export const fail = (status, code, message) => json(status, { ok: false, error: { code, message } })
export function reject(status, code, message) { throw Object.assign(new Error(message), { status, code, public: true }) }
export function header(request, name) {
  const headers = request.headers || {}
  for (const key in headers) if (key.toLowerCase() === name.toLowerCase()) return String(Array.isArray(headers[key]) ? headers[key][0] : headers[key])
  return null
}
// Links in API replies are absolute. The runtime does not pass the request
// host to apps yet, so replies fall back to this. Set it to your own host.
export const DEFAULT_ORIGIN = 'https://pastebin.zyt.app'
export function origin(request) {
  const host = String(header(request, 'Host') || '').trim()
  return /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d+)?$/i.test(host) ? 'https://' + host : DEFAULT_ORIGIN
}
export function absolute(request, value) { return /^https?:\/\//i.test(value || '') ? value : origin(request) + value }
export function random(length) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (let i = 0; i < bytes.length && out.length < length; i++) if (bytes[i] < 248) out += alphabet[bytes[i] % 62]
  }
  return out
}
export async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}
export function member() {
  const value = holm.auth.getMember()
  return value && value.id && !holm.auth.isAnonymous() ? value : null
}
export function cookieOwner() {
  const value = member()
  if (!value) reject(401, 'unauthorized', 'Sign in required.')
  return value
}
export function body(request) {
  const value = request.body
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_body', 'Send JSON or multipart fields.')
  return value
}
export function boolean(value) {
  return value === true || value === 1 || /^(true|1|on|yes)$/i.test(String(value == null ? '' : value).trim())
}
export function text(value, max, label) {
  if (value == null) return ''
  if (typeof value !== 'string') reject(400, 'invalid_field', label + ' must be text.')
  const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (result.length > max) reject(400, 'invalid_field', label + ' is too long.')
  return result
}
export function expiry(value, at = now()) {
  const durations = { '10m': 600, '1h': 3600, '1d': 86400, '7d': 604800, '30d': 2592000, '1y': 31536000 }
  if (value == null || value === 'never') return null
  const seconds = Object.prototype.hasOwnProperty.call(durations, value) ? durations[value] : (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN)
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > 31536000) reject(400, 'invalid_expiry', 'Expiry must be never, a supported duration, or 60–31536000 seconds.')
  return at + Math.round(seconds * 1000)
}
export function state(doc, at = now()) {
  if (doc.revokedAt) return 'revoked'
  if (doc.burnAfterRead && doc.openedAt) return 'burned'
  if (doc.expiresAt != null && doc.expiresAt <= at) return 'expired'
  return 'live'
}
export function grantLive(doc, at = now()) {
  return state(doc, at) === 'burned' && doc.fileTokenExpiresAt > at && (doc.expiresAt == null || doc.expiresAt > at)
}
export function getPaste(slug, owner) {
  const doc = SLUG.test(slug || '') ? ds().findOne('pastes', { id: slug }) : null
  if (!doc || owner && doc.ownerId !== owner.id) reject(404, 'not_found', 'Paste not found.')
  return doc
}
export function paths(doc) {
  const result = []
  for (const file of doc.files || []) { result.push(file.path); if (file.previewPath) result.push(file.previewPath) }
  return result
}
export function deleteBlobs(doc) { for (const path of paths(doc)) holm.app.s3.delete(path) }
export function purge(doc) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = ds().findOne('pastes', { id: doc.id })
    if (!fresh) { deleteBlobs(doc); return doc }
    if (state(fresh) === 'live') return fresh
    if (!fresh.purgedAt || Object.prototype.hasOwnProperty.call(fresh, 'content')) {
      const result = ds().update('pastes', { id: fresh.id }, { $unset: { content: true } }, { ifRevision: fresh._rev })
      if (result.code === 'DS_REVISION_CONFLICT') continue
      if (!result.ok || !result.count) continue
      delete fresh.content
    }
    // Burn text is gone; only its bounded file grant survives public 410s.
    if (!grantLive(fresh)) deleteBlobs(fresh)
    // Failed deletion leaves cleanup pending for a later write sweep.
    if (!fresh.purgedAt) {
      fresh.purgedAt = now()
      ds().update('pastes', { id: fresh.id }, { $set: { purgedAt: fresh.purgedAt } })
    }
    return fresh
  }
  reject(503, 'busy', 'Paste changed during cleanup. Please retry.')
}
export function requireLive(doc) {
  const status = state(doc)
  if (status !== 'live') { purge(doc); reject(410, status, 'This paste is ' + status + '.') }
}
export function sweep() {
  const at = now()
  // Nulls sort first, keeping already-purged history behind pending cleanup.
  const rows = ds().find('pastes', { $or: [{ revokedAt: { $gt: 0 } }, { burnAfterRead: true, openedAt: { $gt: 0 } }, { expiresAt: { $gt: 0, $lte: at } }] }, { orderBy: 'purgedAt', order: 'asc', limit: 40 })
  let count = 0
  for (const doc of rows) if (!doc.purgedAt && state(doc, at) !== 'live') { purge(doc); if (++count === 20) break }
}
export function filename(value) {
  return String(value || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '_').trim().slice(0, 160) || 'file'
}
export function cleanName(value) {
  return filename(value).replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '') || 'file'
}
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac|flac)|application\/pdf)$/
export function safeMime(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase()
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime : 'application/octet-stream'
}
// curl and some clients send application/octet-stream; fall back to the extension.
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv', log: 'text/plain' }
export function mimeFor(type, name) {
  const mime = safeMime(type)
  if (mime !== 'application/octet-stream') return mime
  const ext = String(name || '').toLowerCase().split('.').pop()
  return EXT_MIME[ext] || mime
}
export const dangerous = (mime, name) => /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)$/.test(mime) || /\.(svgz?|html?|xhtml)$/i.test(name)
export function textLike(mime, name) {
  return !dangerous(mime, name) && (/^text\//.test(mime) || /(?:json|xml|javascript|yaml|toml)/.test(mime) || /\.(txt|log|md|csv|js|mjs|ts|tsx|jsx|json|py|go|rs|c|cpp|h|css|sh|sql|yaml|yml|toml)$/i.test(name))
}
export function kind(mime, name) {
  if (dangerous(mime, name)) return 'file'
  if (/^(image|video|audio)\//.test(mime)) return mime.split('/')[0]
  return mime === 'application/pdf' ? 'pdf' : textLike(mime, name) ? 'text' : 'file'
}
export function binary(data, mime, name, download = false) {
  const unsafe = dangerous(mime, name)
  const type = textLike(mime, name) ? 'text/plain; charset=utf-8' : mime
  const inline = !download && !unsafe && (INLINE.test(mime) || textLike(mime, name))
  const encoded = encodeURIComponent(filename(name)).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())
  return { status: 200, body: data, headers: Object.assign({}, FILE_HEADERS, {
    'Content-Type': type, 'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + cleanName(name) + '"; filename*=UTF-8\'\'' + encoded
  }) }
}
// Original dimensions, not the resized thumbnail's dimensions; bounded header parsing.
export function dimensions(data, mime) {
  const b = new Uint8Array(data), view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u16 = (i, little = false) => view.getUint16(i, little), u32 = i => view.getUint32(i)
  if (mime === 'image/png' && b.length >= 24 && u32(0) === 0x89504e47) return [u32(16), u32(20)]
  if (mime === 'image/gif' && b.length >= 10 && b[0] === 71 && b[1] === 73) return [u16(6, true), u16(8, true)]
  if (mime === 'image/jpeg') {
    let i = 2
    while (i + 8 < b.length) {
      if (b[i++] !== 255) continue
      while (b[i] === 255) i++
      const marker = b[i++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue
      if (i + 7 >= b.length) break
      const size = u16(i)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [u16(i + 5), u16(i + 3)]
      if (size < 2) break
      i += size
    }
  }
  if (mime === 'image/webp' && b.length >= 30) {
    if (b[15] === 88) return [1 + b[24] + (b[25] << 8) + (b[26] << 16), 1 + b[27] + (b[28] << 8) + (b[29] << 16)]
    if (b[15] === 76) return [1 + b[21] + ((b[22] & 63) << 8), 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 15) << 10)]
    return [u16(26, true) & 16383, u16(28, true) & 16383]
  }
  if (mime === 'image/avif') for (let i = 4; i + 16 <= Math.min(b.length, 100000); i++) if (u32(i) === 0x69737065) return [u32(i + 8), u32(i + 12)]
  return [null, null]
}
