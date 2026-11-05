// Roll's API. Everything a member stores is theirs alone: each photo and album carries its
// owner, and every route checks it. Photos live in the document store (`photos`, `albums`)
// with their files in object storage: t/<id> the thumbnail, p/<id> the preview and, when
// the browser could send it, o/<id> the original. The browser makes the thumbnail and the
// preview, so the server never decodes an image.
//
// Each member has a library version in KV (v:<member>), bumped by every change, so a page
// that already holds the current library gets a one-line answer. The MCP tools in ops.js
// change photos and albums through the functions exported here, so they bump it too.

const DAY = 86400000
export const TRASH_DAYS = 30
const MAX_ORIGINAL = 30 * 1024 * 1024
const MAX_PREVIEW = 4 * 1024 * 1024
const MAX_THUMB = 600 * 1024
const BATCH = 500
const BUDGET_MS = 3200

export async function handle(request, env, url) {
  try {
    return await route(request, env, url)
  } catch (error) {
    if (error && error.status) return fail(error.status, error.code, error.message)
    console.error('roll:', String((error && (error.stack || error.message)) || error).slice(0, 600))
    return fail(500, 'error', 'Something went wrong on the server. Try again.')
  }
}

async function route(request, env, url) {
  const path = url.pathname
  const method = request.method
  if (path === '/api/me' && method === 'GET') return me(env, url)

  const share = /^\/s\/([A-Za-z0-9]{6,32})(\/cover\.jpg)?\/?$/.exec(path)
  if (share && method === 'GET') return share[2] ? sharedCover(env, share[1]) : sharedPage(request, env, url, share[1])
  const shared = /^\/api\/s\/([A-Za-z0-9]{6,32})$/.exec(path)
  if (shared && method === 'GET') return json(sharedAlbum(env, shared[1]), { 'cache-control': 'no-store' })

  const member = env.holm.auth.getMember()
  if (!member) throw problem(401, 'signed_out', 'Sign in to see your photos.')
  const ctx = context(env, member)

  if (path === '/api/library' && method === 'GET') return json(library(ctx, url.searchParams.get('v')), { 'cache-control': 'no-store' })
  if (path === '/api/photos' && method === 'POST') return json(await upload(ctx, request))
  const original = /^\/api\/photos\/([A-Za-z0-9_-]{1,64})\/original$/.exec(path)
  if (original && method === 'PUT') return json(await putOriginal(ctx, original[1], request))
  if (path === '/api/photos/batch' && method === 'POST') return json(batch(ctx, await body(request)))
  if (path === '/api/photos/delete' && method === 'POST') return json(destroy(ctx, (await body(request)).ids))
  if (path === '/api/trash/empty' && method === 'POST') return json(emptyTrash(ctx))
  if (path === '/api/albums' && method === 'POST') return json(createAlbum(ctx, await body(request)))
  const album = /^\/api\/albums\/([A-Za-z0-9_-]{1,64})(\/share)?$/.exec(path)
  if (album && !album[2] && method === 'PATCH') return json(updateAlbum(ctx, album[1], await body(request)))
  if (album && !album[2] && method === 'DELETE') return json(deleteAlbum(ctx, album[1]))
  if (album && album[2] && method === 'POST') return json(shareAlbum(ctx, album[1], await body(request)))
  throw problem(404, 'not_found', 'There is nothing at this address.')
}

/* ---- Helpers ------------------------------------------------------------------ */

export function context(env, member) {
  return { env, member, owner: member.id, ds: env.holm.app.ds, kv: env.holm.app.kv, s3: env.holm.app.s3 }
}

function json(data, headers = {}) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

function fail(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export function problem(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

async function body(request) {
  try { return (await request.json()) || {} } catch { throw problem(400, 'bad_json', 'The request wasn’t valid JSON.') }
}

const text = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
const num = (value, min, max) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null }

function bump(ctx) { return String(ctx.kv.increment('v:' + ctx.owner)) }
function version(ctx) { return String(ctx.kv.get('v:' + ctx.owner) || 0) }

function quota(ctx) {
  if (ctx.env.holm.auth.isAppAdmin()) return 0
  const mb = Number(ctx.env.holm.env.get('QUOTA_MB', '1024'))
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : 0
}

function bytesOf(doc) { return (doc.size && doc.orig ? doc.size : 0) + (doc.psize || 0) + (doc.tsize || 0) }

// What the page gets for a photo: everything but the owner.
function view(doc) {
  const out = {}
  for (const key in doc) if (key !== 'owner' && key !== '_rev' && key !== '_updatedAt') out[key] = doc[key]
  return out
}

function mine(ctx, collection, id) {
  const doc = ctx.ds.findOne(collection, id)
  if (!doc || doc.owner !== ctx.owner) throw problem(404, 'not_found', collection === 'albums' ? 'That album is gone.' : 'That photo is gone.')
  return doc
}

function randomSlug(length = 12) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += chars[b % chars.length]
  return out
}

function idsOf(list) {
  if (!Array.isArray(list)) throw problem(400, 'bad_ids', 'Say which photos.')
  return [...new Set(list.filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, BATCH)
}

/* ---- Who's here ------------------------------------------------------------------ */

function me(env, url) {
  const { auth } = env.holm
  // Tools have no request to read the address from, so their links use the last one seen.
  const kv = env.holm.app.kv
  if (kv.get('site:origin') !== url.origin) kv.set('site:origin', url.origin)
  const back = (url.searchParams.get('return') || '/').replace(/[^\w\-./?=&%]/g, '')
  const member = auth.getMember()
  if (!member) return json({ signed_in: false, login_url: auth.getLoginURL(back.startsWith('/') ? back : '/') }, { 'cache-control': 'no-store' })
  return json({
    signed_in: true,
    id: member.id,
    name: member.name || '',
    email: member.email || '',
    picture: member.picture || null,
    admin: auth.isAppAdmin(),
    logout_url: auth.getLogoutURL(),
    mcp: url.origin + '/_holm/mcp'
  }, { 'cache-control': 'no-store' })
}

/* ---- The library ----------------------------------------------------------------- */

// Every photo and album of the member, unless the page already has this version. Photos
// left in the Trash past 30 days are deleted here, a few at a time.
function library(ctx, known) {
  sweepTrash(ctx)
  const v = version(ctx)
  if (known && known === v) return { v, same: true }
  const photos = []
  let used = 0
  let cursor
  for (let page = 0; page < 200; page++) {
    const result = ctx.ds.find('photos', { owner: ctx.owner }, { page: true, limit: 500, order: 'desc', cursor })
    for (const doc of result.rows) { photos.push(view(doc)); used += bytesOf(doc) }
    cursor = result.cursor
    if (!cursor || !result.rows.length) break
  }
  ctx.kv.set('used:' + ctx.owner, used)
  const albums = ctx.ds.find('albums', { owner: ctx.owner }, { limit: 1000, order: 'desc' }).map(view)
  const limit = quota(ctx)
  // The tools can't read the app's settings, so they take the quota from here.
  if (String(ctx.kv.get('quota:' + ctx.owner)) !== String(limit)) ctx.kv.set('quota:' + ctx.owner, limit)
  return { v, photos, albums, used, quota: limit }
}

function sweepTrash(ctx) {
  const before = Date.now() - TRASH_DAYS * DAY
  const old = ctx.ds.find('photos', { owner: ctx.owner, trashed: { $gt: 0, $lt: before } }, { limit: 25 })
  if (!old.length) return
  let bytes = 0
  for (const doc of old) bytes += removeFiles(ctx, doc)
  spent(ctx, bytes)
  bump(ctx)
}

function removeFiles(ctx, doc) {
  for (const kind of ['t', 'p', 'o']) { try { ctx.s3.delete(kind + '/' + doc.id) } catch {} }
  ctx.ds.delete('photos', { id: doc.id })
  return bytesOf(doc)
}

function spent(ctx, bytes) {
  const used = Number(ctx.kv.get('used:' + ctx.owner)) || 0
  ctx.kv.set('used:' + ctx.owner, Math.max(0, used - bytes))
}

/* ---- Adding photos ---------------------------------------------------------------- */

// A new photo: its details as JSON in `meta`, the thumbnail and the preview as files. The
// original follows in its own request (PUT …/original), so the photo shows at once and a
// large original never holds up the rest.
async function upload(ctx, request) {
  let form
  try { form = await request.formData() } catch { throw problem(400, 'bad_form', 'The upload didn’t arrive whole. Try again.') }
  let meta
  try { meta = JSON.parse(String(form.get('meta') || '{}')) } catch { throw problem(400, 'bad_meta', 'The photo’s details didn’t arrive.') }
  const thumb = form.get('thumb')
  const preview = form.get('preview')
  if (!thumb || typeof thumb === 'string' || !thumb.size) throw problem(400, 'no_thumb', 'The thumbnail is missing.')
  if (!preview || typeof preview === 'string' || !preview.size) throw problem(400, 'no_preview', 'The preview is missing.')
  if (thumb.size > MAX_THUMB || preview.size > MAX_PREVIEW) throw problem(413, 'too_large', 'That photo’s copies are too large.')

  const hash = /^[a-f0-9]{16,64}$/.test(meta.hash || '') ? meta.hash : null
  if (hash) {
    const twin = ctx.ds.find('photos', { owner: ctx.owner, hash }, { limit: 1 })[0]
    if (twin) {
      if (twin.trashed) ctx.ds.update('photos', { id: twin.id }, { $set: { trashed: 0 } })
      const v = twin.trashed ? bump(ctx) : version(ctx)
      return { photo: view(twin.trashed ? { ...twin, trashed: 0 } : twin), duplicate: true, v }
    }
  }

  const size = Math.round(num(meta.size, 0, 1e10) || 0)
  const limit = quota(ctx)
  const used = Number(ctx.kv.get('used:' + ctx.owner)) || 0
  if (limit && used + thumb.size + preview.size + size > limit) {
    throw problem(413, 'quota', `Your library is full: ${Math.round(limit / 1048576)} MB is the limit on this server.`)
  }

  const gps = Array.isArray(meta.gps) && meta.gps.length === 2 ? [num(meta.gps[0], -90, 90), num(meta.gps[1], -180, 180)] : null
  const doc = {
    owner: ctx.owner,
    name: text(meta.name, 160) || 'Photo',
    type: text(meta.type, 60) || 'image/jpeg',
    size,
    w: Math.round(num(meta.w, 1, 100000) || 1),
    h: Math.round(num(meta.h, 1, 100000) || 1),
    taken: Math.round(num(meta.taken, 0, 4102444800000) || Date.now()),
    offset: /^[+-]\d\d:\d\d$/.test(meta.offset || '') ? meta.offset : null,
    camera: text(meta.camera, 80) || null,
    lens: text(meta.lens, 100) || null,
    exp: cleanExposure(meta.exp),
    gps: gps && gps[0] != null && gps[1] != null ? gps : null,
    place: text(meta.place, 120) || null,
    th: /^[A-Za-z0-9+/=]{8,64}$/.test(meta.th || '') ? meta.th : null,
    hash,
    fav: false,
    trashed: 0,
    albums: [],
    orig: false,
    tsize: thumb.size,
    psize: preview.size
  }
  const id = ctx.ds.insert('photos', doc)
  ctx.s3.put('t/' + id, await thumb.arrayBuffer(), 'image/jpeg')
  ctx.s3.put('p/' + id, await preview.arrayBuffer(), 'image/jpeg')
  ctx.kv.set('used:' + ctx.owner, used + thumb.size + preview.size)
  const v = bump(ctx)
  const saved = ctx.ds.findOne('photos', id)
  return { photo: view(saved || { ...doc, id }), v }
}

function cleanExposure(exp) {
  if (!exp || typeof exp !== 'object') return null
  const out = {}
  const f = num(exp.f, 0.5, 64); if (f) out.f = Math.round(f * 10) / 10
  const s = num(exp.s, 0.00001, 3600); if (s) out.s = s
  const iso = num(exp.iso, 1, 1000000); if (iso) out.iso = Math.round(iso)
  const mm = num(exp.mm, 0.5, 5000); if (mm) out.mm = Math.round(mm * 10) / 10
  const mm35 = num(exp.mm35, 1, 5000); if (mm35) out.mm35 = Math.round(mm35)
  return Object.keys(out).length ? out : null
}

async function putOriginal(ctx, id, request) {
  const doc = mine(ctx, 'photos', id)
  if (doc.orig) return { photo: view(doc), v: version(ctx) }
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_ORIGINAL) throw problem(413, 'too_large', 'That original is larger than 30 MB, so Roll kept a full-size copy instead.')
  const data = await request.arrayBuffer()
  if (!data.byteLength) throw problem(400, 'empty', 'The original was empty.')
  if (data.byteLength > MAX_ORIGINAL) throw problem(413, 'too_large', 'That original is larger than 30 MB, so Roll kept a full-size copy instead.')
  const limit = quota(ctx)
  const used = Number(ctx.kv.get('used:' + ctx.owner)) || 0
  if (limit && used + data.byteLength > limit) throw problem(413, 'quota', 'Your library is full, so Roll kept a full-size copy instead of the original.')
  const type = /^image\/[\w.+-]+$/.test(doc.type) ? doc.type : 'application/octet-stream'
  ctx.s3.put('o/' + id, data, type)
  ctx.ds.update('photos', { id }, { $set: { orig: true, size: data.byteLength } })
  ctx.kv.set('used:' + ctx.owner, used + data.byteLength)
  const v = bump(ctx)
  return { photo: view({ ...doc, orig: true, size: data.byteLength }), v }
}

/* ---- Changing photos --------------------------------------------------------------- */

// One change to many photos: favourite or not, to the Trash and back, into or out of an
// album. Stops before the request's time runs out (or at `until`, for a tool that makes
// more than one change) and says how many it did; the page sends the rest again.
export function batch(ctx, input, until = Date.now() + BUDGET_MS) {
  const ids = idsOf(input.ids)
  const op = String(input.op || '')
  let album = null
  if (op === 'add' || op === 'remove') album = mine(ctx, 'albums', String(input.album || ''))
  let done = 0
  const now = Date.now()
  for (const id of ids) {
    if (Date.now() > until) break
    const doc = ctx.ds.findOne('photos', id)
    done++
    if (!doc || doc.owner !== ctx.owner) continue
    let set = null
    if (op === 'fav' && !doc.fav) set = { fav: true }
    else if (op === 'unfav' && doc.fav) set = { fav: false }
    else if (op === 'trash' && !doc.trashed) set = { trashed: now }
    else if (op === 'restore' && doc.trashed) set = { trashed: 0 }
    else if (op === 'add' && !(doc.albums || []).includes(album.id)) set = { albums: [...(doc.albums || []), album.id] }
    else if (op === 'remove' && (doc.albums || []).includes(album.id)) set = { albums: doc.albums.filter((a) => a !== album.id) }
    else if (!['fav', 'unfav', 'trash', 'restore', 'add', 'remove'].includes(op)) throw problem(400, 'bad_op', 'That change isn’t one Roll knows.')
    if (set) ctx.ds.update('photos', { id }, { $set: set })
  }
  if (album) {
    if (op === 'add' && !album.cover && ids.length) ctx.ds.update('albums', { id: album.id }, { $set: { cover: ids[0] } })
    if (op === 'remove' && ids.includes(album.cover)) ctx.ds.update('albums', { id: album.id }, { $set: { cover: null } })
  }
  return { done, v: bump(ctx), at: now }
}

// Deletes photos for good: their files and their record.
export function destroy(ctx, list) {
  const ids = idsOf(list)
  const start = Date.now()
  let done = 0
  let bytes = 0
  for (const id of ids) {
    if (Date.now() - start > BUDGET_MS) break
    const doc = ctx.ds.findOne('photos', id)
    done++
    if (doc && doc.owner === ctx.owner) bytes += removeFiles(ctx, doc)
  }
  spent(ctx, bytes)
  return { done, v: bump(ctx) }
}

export function emptyTrash(ctx) {
  const start = Date.now()
  let removed = 0
  let bytes = 0
  while (Date.now() - start < BUDGET_MS) {
    const rows = ctx.ds.find('photos', { owner: ctx.owner, trashed: { $gt: 0 } }, { limit: 40 })
    if (!rows.length) break
    for (const doc of rows) { bytes += removeFiles(ctx, doc); removed++; if (Date.now() - start > BUDGET_MS) break }
  }
  spent(ctx, bytes)
  const left = ctx.ds.count('photos', { owner: ctx.owner, trashed: { $gt: 0 } })
  return { removed, left, v: bump(ctx) }
}

/* ---- Albums ------------------------------------------------------------------------- */

export function createAlbum(ctx, input) {
  const title = text(input.title, 80) || 'Untitled album'
  const count = ctx.ds.count('albums', { owner: ctx.owner })
  if (count >= 1000) throw problem(409, 'too_many', 'You have 1,000 albums, the most Roll keeps.')
  const id = ctx.ds.insert('albums', { owner: ctx.owner, title, cover: null, share: null, sharedAt: 0 })
  bump(ctx)
  return { album: view(ctx.ds.findOne('albums', id)) }
}

export function updateAlbum(ctx, id, input) {
  mine(ctx, 'albums', id)
  const set = {}
  if (input.title != null) set.title = text(input.title, 80) || 'Untitled album'
  if (input.cover !== undefined) {
    if (input.cover === null) set.cover = null
    else {
      const photo = mine(ctx, 'photos', String(input.cover))
      if (!(photo.albums || []).includes(id)) throw problem(400, 'not_in_album', 'That photo isn’t in this album.')
      set.cover = photo.id
    }
  }
  if (Object.keys(set).length) ctx.ds.update('albums', { id }, { $set: set })
  const v = bump(ctx)
  return { album: view(ctx.ds.findOne('albums', id)), v }
}

// Takes the album off its photos a batch at a time, then deletes it. The photos stay.
export function deleteAlbum(ctx, id) {
  mine(ctx, 'albums', id)
  const start = Date.now()
  while (Date.now() - start < BUDGET_MS) {
    const rows = ctx.ds.find('photos', { owner: ctx.owner, albums: { $contains: id } }, { limit: 100 })
    if (!rows.length) {
      ctx.ds.delete('albums', { id })
      return { left: 0, v: bump(ctx) }
    }
    for (const doc of rows) {
      ctx.ds.update('photos', { id: doc.id }, { $set: { albums: (doc.albums || []).filter((a) => a !== id) } })
      if (Date.now() - start > BUDGET_MS) break
    }
  }
  return { left: 1, v: bump(ctx) }
}

export function shareAlbum(ctx, id, input) {
  const album = mine(ctx, 'albums', id)
  const set = input.on
    ? { share: album.share || randomSlug(), sharedAt: album.share ? album.sharedAt : Date.now(), by: text(ctx.member.name, 80) || null }
    : { share: null, sharedAt: 0 }
  ctx.ds.update('albums', { id }, { $set: set })
  const v = bump(ctx)
  return { album: view({ ...album, ...set }), v }
}

/* ---- Shared albums --------------------------------------------------------------------- */

function sharedAlbumDoc(env, slug) {
  return env.holm.app.ds.find('albums', { share: slug }, { limit: 1 })[0] || null
}

// What anyone with the link sees: the album's title, who shared it, and each photo's shape,
// date and placeholder. No places, cameras or file names.
function sharedAlbum(env, slug) {
  const album = sharedAlbumDoc(env, slug)
  if (!album) throw problem(404, 'not_shared', 'This album isn’t shared any more, or the link is wrong.')
  const { ds } = env.holm.app
  const photos = []
  let cursor
  for (let page = 0; page < 40; page++) {
    const result = ds.find('photos', { owner: album.owner, albums: { $contains: album.id } }, { page: true, limit: 500, order: 'desc', cursor })
    for (const doc of result.rows) if (!doc.trashed) photos.push({ id: doc.id, w: doc.w, h: doc.h, taken: doc.taken, offset: doc.offset || null, th: doc.th || null })
    cursor = result.cursor
    if (!cursor || !result.rows.length) break
  }
  const member = env.holm.auth.getMember()
  return {
    slug,
    title: album.title,
    by: album.by || null,
    cover: album.cover && photos.some((p) => p.id === album.cover) ? album.cover : (photos[0] && photos[0].id) || null,
    photos,
    mine: !!member && member.id === album.owner,
    album: !!member && member.id === album.owner ? album.id : null
  }
}

function sharedCover(env, slug) {
  const album = sharedAlbumDoc(env, slug)
  if (!album) return new Response('Not found', { status: 404 })
  const { ds, s3 } = env.holm.app
  let id = album.cover
  let doc = id ? ds.findOne('photos', id) : null
  if (!doc || doc.trashed || !(doc.albums || []).includes(album.id)) {
    doc = ds.find('photos', { owner: album.owner, albums: { $contains: album.id }, trashed: 0 }, { limit: 1, order: 'desc' })[0]
  }
  const object = doc ? s3.get('p/' + doc.id) : null
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.data, { headers: { 'content-type': object.mime || 'image/jpeg', 'cache-control': 'public, max-age=3600' } })
}

// The app's page, with the album's own title and picture for link previews.
async function sharedPage(request, env, url, slug) {
  const shell = await env.holm.web.fetch(new Request(new URL('/', url), { headers: { accept: 'text/html' } }))
  let html = await shell.text()
  const album = sharedAlbumDoc(env, slug)
  if (album) {
    const count = env.holm.app.ds.count('photos', { owner: album.owner, albums: { $contains: album.id }, trashed: 0 })
    const title = esc(album.title) + ' · Roll'
    const description = esc(`${count} ${count === 1 ? 'photo' : 'photos'}${album.by ? ' shared by ' + album.by : ''}`)
    const image = esc(url.origin + '/s/' + slug + '/cover.jpg')
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/<meta[^>]+(property|name)="(og:title|og:description|og:image|og:url|twitter:title|twitter:description|twitter:image|twitter:card|description)"[^>]*>\s*/g, '')
      .replace('</head>', `<meta name="description" content="${description}">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<meta property="og:image" content="${image}">\n<meta property="og:url" content="${esc(url.origin + url.pathname)}">\n<meta name="twitter:card" content="summary_large_image">\n</head>`)
  }
  const headers = new Headers(shell.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(html, { status: album ? 200 : 404, headers })
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
