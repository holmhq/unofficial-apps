import {
  ds, now, iso, ok, reject, random, body, boolean, text, expiry, state, member, origin, absolute,
  MAX_CONTENT, MAX_FILE, MAX_TOTAL, GRANT_MS, getPaste, requireLive, grantLive, purge, paths,
  deleteBlobs, filename, cleanName, safeMime, mimeFor, kind, dimensions, binary
} from './lib.js'
import { owner } from './keys.js'

function isOwner(doc) { const user = member(); return !!(user && user.id === doc.ownerId) }
function dto(doc, request, owns, sealed = false, token = '', ownerShape = false) {
  const base = origin(request), url = base + '/p/' + doc.slug
  let author = null
  if (doc.showAuthor) {
    const profile = ds().findOne('profiles', { id: doc.ownerId })
    if (profile) author = { name: profile.name, avatar: absolute(request, profile.avatar) }
  }
  const paste = {
    slug: doc.slug, url, raw_url: !doc.burnAfterRead && doc.contentSize > 0 && state(doc) === 'live' ? base + '/raw/' + doc.slug : null,
    title: sealed ? null : doc.title, language: doc.language, content: sealed ? null : doc.content == null ? null : doc.content,
    contentSize: doc.contentSize, lines: doc.lines, files: sealed ? [] : (doc.files || []).map((file, index) => {
      const path = base + '/api/p/' + doc.slug + '/files/' + index
      const suffix = token ? 't=' + encodeURIComponent(token) : ''
      return { index, name: file.name, mime: file.mime, size: file.size, kind: file.kind, width: file.width || null, height: file.height || null,
        url: path + (suffix ? '?' + suffix : ''), previewUrl: file.previewPath ? path + '?v=preview' + (suffix ? '&' + suffix : '') : null,
        downloadUrl: path + '?download=1' + (suffix ? '&' + suffix : '') }
    }),
    createdAt: iso(doc.createdAt), expiresAt: iso(doc.expiresAt), burnAfterRead: doc.burnAfterRead, sealed, author, isOwner: owns
  }
  if (ownerShape) Object.assign(paste, { state: state(doc), views: doc.views, openedAt: iso(doc.openedAt), showAuthor: doc.showAuthor, revokedAt: iso(doc.revokedAt) })
  return paste
}
function stored(id) { return ds().findOne('pastes', { id }) }
function ttlOptions(expiresAt) { return expiresAt == null ? undefined : { ttlMs: Math.max(1, expiresAt - now()) } }
function reTTL(doc, expiresAt) {
  for (const path of paths(doc)) {
    const blob = holm.app.s3.get(path)
    if (blob) holm.app.s3.put(path, blob.data, blob.mime, ttlOptions(expiresAt))
  }
}
function reconcileTTL(doc, appliedDeadline = null) {
  const fresh = stored(doc.id)
  if (!fresh) { deleteBlobs(doc); reject(410, 'revoked', 'This paste was deleted.') }
  const status = state(fresh)
  if (status === 'live') {
    if (fresh.expiresAt !== doc.expiresAt) reTTL(fresh, fresh.expiresAt)
  } else if (grantLive(fresh)) {
    const deadline = Math.min(fresh.fileTokenExpiresAt, fresh.expiresAt == null ? Infinity : fresh.expiresAt)
    if (deadline !== appliedDeadline) reTTL(fresh, deadline)
  } else {
    purge(fresh)
  }
  return fresh
}

export async function create(request) {
  // A files-only multipart request carries no form fields, so Holm leaves body unset.
  const hasFiles = Object.keys(request.files || {}).length > 0
  const user = await owner(request), input = hasFiles && request.body == null ? {} : body(request), at = now()
  const content = input.content == null ? '' : input.content
  if (typeof content !== 'string') reject(400, 'invalid_field', 'Content must be text.')
  const contentSize = new TextEncoder().encode(content).byteLength
  // request.files is a map; keep the client's order (file, file1, file2, ...).
  const fieldOrder = field => Number((/(\d+)$/.exec(field) || [0, 0])[1])
  const uploads = Object.keys(request.files || {}).sort((a, b) => fieldOrder(a) - fieldOrder(b) || a.localeCompare(b)).map(field => request.files[field]).filter(Boolean)
  if (uploads.length > 10) reject(400, 'too_many_files', 'At most ten files are allowed.')
  let total = 0
  for (const file of uploads) {
    if (file.size > MAX_FILE) reject(413, 'too_large', 'A file exceeds 25 MiB.')
    total += file.size || 0
  }
  if (contentSize > MAX_CONTENT || total > MAX_TOTAL) reject(413, 'too_large', 'Content exceeds 512 KiB or files exceed 50 MiB.')
  if (!content.length && !uploads.length) reject(400, 'empty', 'Add text or at least one file.')
  let slug
  do { slug = random(12) } while (stored(slug))
  const doc = { id: slug, slug, ownerId: user.id, title: text(input.title, 120, 'Title'), language: text(input.language, 80, 'Language'),
    content, contentSize, lines: content ? content.split('\n').length : 0, files: [], createdAt: at, expiresAt: expiry(input.expires_in, at),
    burnAfterRead: boolean(input.burn_after_read), openedAt: null, fileToken: null, fileTokenExpiresAt: null,
    showAuthor: boolean(input.show_author), views: 0, revokedAt: null, purgedAt: null }
  const written = []
  try {
    for (let i = 0; i < uploads.length; i++) {
      const file = uploads[i], name = filename(file.name), mime = mimeFor(file.type, name), path = 'pastes/' + slug + '/' + i + '-' + cleanName(name)
      // ttlMs is unsupported on upload handles: use their lazy bytes when expiring.
      holm.app.s3.put(path, doc.expiresAt == null ? file : file.data, mime, ttlOptions(doc.expiresAt))
      written.push(path)
      const meta = { name, mime, size: file.size || 0, kind: kind(mime, name), path, width: null, height: null }
      if (meta.kind === 'image') {
        const bytes = file.data, size = dimensions(bytes, mime)
        meta.width = size[0]; meta.height = size[1]
        let preview = null
        try { preview = holm.image.thumbnail(bytes, 360) } catch (_error) { /* Unsupported encodings retain the original. */ }
        if (preview) {
          const previewPath = 'pastes/' + slug + '/' + i + '-preview.jpg'
          holm.app.s3.put(previewPath, preview.data, 'image/jpeg', ttlOptions(doc.expiresAt))
          written.push(previewPath); meta.previewPath = previewPath
        }
      }
      doc.files.push(meta)
    }
    ds().insert('pastes', doc)
  } catch (error) { for (const path of written) holm.app.s3.delete(path); throw error }
  const paste = dto(doc, request, true, false, '', true)
  return ok({ paste, url: paste.url, raw_url: paste.raw_url }, 201)
}
export async function list(request) {
  const user = await owner(request), options = { page: true, limit: 50, orderBy: 'createdAt', order: 'desc' }
  if (request.query && request.query.cursor) options.cursor = String(request.query.cursor)
  const page = ds().find('pastes', { ownerId: user.id }, options)
  const pastes = page.rows.map(doc => {
    if (state(doc) !== 'live') doc = purge(doc)
    const paste = dto(doc, request, true, false, '', true)
    // The owner's list shows the first line of untitled pastes.
    const first = (paste.content || '').split('\n').find(line => line.trim())
    paste.excerpt = first ? first.trim().slice(0, 100) : ''
    delete paste.content
    return paste
  })
  return ok({ pastes, cursor: page.cursor || null })
}
export async function owned(request, slug, action) {
  const user = await owner(request)
  let doc = getPaste(slug, user)
  if (request.method === 'GET' && !action) {
    if (state(doc) !== 'live') doc = purge(doc)
    return ok({ paste: dto(doc, request, true, false, '', true) })
  }
  if (request.method === 'PATCH' && !action) {
    if (state(doc) !== 'live') { purge(doc); reject(409, 'not_live', 'Only live pastes can be changed.') }
    const input = body(request), changes = {}
    if ('title' in input) changes.title = text(input.title, 120, 'Title')
    if ('show_author' in input) changes.showAuthor = boolean(input.show_author)
    if ('expires_in' in input) changes.expiresAt = expiry(input.expires_in)
    if (Object.keys(changes).length) {
      const result = ds().update('pastes', { id: doc.id }, { $set: changes }, { ifRevision: doc._rev })
      if (!result.ok || !result.count) reject(409, 'not_live', 'Paste changed. Reload before updating it.')
      doc = Object.assign({}, doc, changes)
      if ('expiresAt' in changes) reTTL(doc, doc.expiresAt)
      doc = reconcileTTL(doc)
      if (state(doc) !== 'live') reject(409, 'not_live', 'Paste is no longer live.')
    }
    return ok({ paste: dto(doc, request, true, false, '', true) })
  }
  if ((request.method === 'DELETE' && !action) || (request.method === 'POST' && action === 'revoke')) {
    ds().update('pastes', { id: doc.id }, { $set: { revokedAt: doc.revokedAt || now(), fileToken: null, fileTokenExpiresAt: null } })
    doc = purge(doc)
    if (request.method === 'DELETE') { ds().delete('pastes', { id: doc.id }); return ok() }
    return ok({ paste: dto(doc, request, true, false, '', true) })
  }
  reject(405, 'method_not_allowed', 'Method not allowed.')
}

export function publicRead(request, slug, open = false) {
  const doc = getPaste(slug)
  requireLive(doc)
  const owns = isOwner(doc)
  if (doc.burnAfterRead && !owns) {
    if (!open) return ok({ paste: dto(doc, request, false, true) })
    const at = now(), token = random(32)
    const claim = ds().update('pastes', { id: doc.id }, { $set: { openedAt: at, fileToken: token, fileTokenExpiresAt: at + GRANT_MS }, $inc: { views: 1 } }, { ifRevision: doc._rev })
    if ((!claim.ok && claim.code === 'DS_REVISION_CONFLICT') || !claim.count) reject(410, 'burned', 'This paste has already been opened.')
    // Keep the winning snapshot in memory; never expose it through a second read.
    const paste = dto(doc, request, false, false, token)
    ds().update('pastes', { id: doc.id }, { $unset: { content: true }, $set: { purgedAt: at } })
    const deadline = Math.min(at + GRANT_MS, doc.expiresAt == null ? Infinity : doc.expiresAt)
    reTTL(doc, deadline)
    const fresh = reconcileTTL(doc, deadline)
    if (fresh.revokedAt || !grantLive(fresh)) reject(410, state(fresh), 'This paste is no longer available.')
    return ok({ paste })
  }
  if (!owns) ds().update('pastes', { id: doc.id }, { $inc: { views: 1 } })
  return ok({ paste: dto(doc, request, owns) })
}
export function raw(request, slug) {
  const doc = getPaste(slug)
  requireLive(doc)
  if (doc.burnAfterRead) reject(403, 'sealed', 'Burn pastes cannot be read as raw text.')
  if (!doc.contentSize) reject(404, 'not_found', 'This paste has no text.')
  return binary(doc.content, 'text/plain', doc.slug + '.txt')
}
export function file(request, slug, index) {
  const doc = getPaste(slug), query = request.query || {}, owns = isOwner(doc)
  const status = state(doc)
  const validToken = grantLive(doc) && typeof query.t === 'string' && query.t === doc.fileToken
  if (status !== 'live' && !(status === 'burned' && grantLive(doc) && (owns || validToken))) {
    purge(doc); reject(410, status, 'This paste is ' + status + '.')
  }
  if (doc.burnAfterRead && !owns && !validToken) reject(403, 'sealed', 'Open this paste before downloading its files.')
  const meta = /^\d+$/.test(index) ? (doc.files || [])[Number(index)] : null
  if (!meta) reject(404, 'not_found', 'File not found.')
  const preview = query.v === 'preview' && meta.previewPath
  const blob = holm.app.s3.get(preview || meta.path)
  if (!blob) reject(404, 'not_found', 'Stored file is missing.')
  return binary(blob.data, preview ? 'image/jpeg' : meta.mime, preview ? doc.slug + '-preview.jpg' : meta.name, query.download === '1')
}
