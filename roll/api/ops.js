// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"), and each one only ever touches
// the caller's own photos and albums, through the same functions as the app's routes. Those
// check the owner of everything they touch and bump the library's version, so an open Roll
// page takes the change the next time it looks.
//
// Claude sees each photo's details (when, where, which camera, which albums), not the
// picture: the files answer only the owner's browser, or a shared album's link, and a tool's
// answer is text. Uploading stays in the page, which makes the thumbnail and the preview.

import { context, problem, batch, destroy, emptyTrash, createAlbum, updateAlbum, deleteAlbum, shareAlbum, TRASH_DAYS } from './http.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT' }
const DAY = 86400000
const BUDGET = 2500
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn fall', 'autumn fall', 'autumn fall', 'winter']

function op(env, run) {
  try {
    const member = env.holm.auth.getMember()
    if (!member) throw problem(401, 'signed_out', 'Sign in to Roll first.')
    return run(context(env, member))
  } catch (error) {
    if (error && error.status) {
      const status = CODES[error.status] ? error.status : 400
      const out = new Error(error.message)
      out.code = CODES[status]
      out.status = status
      out.public = true
      throw out
    }
    throw error
  }
}

const fail = (status, message) => { throw problem(status, 'invalid', message) }
const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)
const iso = (ms) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined)
// A photo's time is its own wall clock, kept as milliseconds read as UTC.
const wall = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ')
const dayOf = (t) => new Date(t).toISOString().slice(0, 10)
const link = (ctx, path) => { const base = ctx.kv.get('site:origin'); return base ? base + path : undefined }
const fold = (s) => { const t = String(s || '').toLowerCase(); try { return t.normalize('NFKD').replace(/[̀-ͯ]/g, '') } catch { return t } }
const size = (n) => (n >= 1073741824 ? +(n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? +(n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

function day(value, name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN
  if (!Number.isFinite(t) || dayOf(t) !== m[0]) fail(400, `Give ${name} as a date like 2024-06-01.`)
  return t
}

function ids(list, max = 100) {
  if (!Array.isArray(list) || !list.length) fail(400, 'Say which photos, by their ids from photos_list.')
  const out = [...new Set(list.map(String).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)))]
  if (!out.length) fail(400, 'Those aren’t photo ids. Use the ids photos_list gives.')
  if (out.length > max) fail(400, `Give up to ${max} photos at a time.`)
  return out
}

// The caller's photos among ids, and the ids that aren't theirs or are gone.
function owned(ctx, list) {
  const found = []
  const missing = []
  for (const id of list) {
    const doc = ctx.ds.findOne('photos', id)
    if (doc && doc.owner === ctx.owner) found.push(doc)
    else missing.push(id)
  }
  return { found, missing }
}

function albumsOf(ctx) {
  return ctx.ds.find('albums', { owner: ctx.owner }, { limit: 1000, order: 'desc' })
}

// An album by its id, or by its title when only one album has it.
function findAlbum(ctx, value) {
  const want = String(value || '').trim()
  if (!want) fail(400, 'Say which album: its id or its title from albums_list.')
  const byId = /^[A-Za-z0-9_-]{1,64}$/.test(want) ? ctx.ds.findOne('albums', want) : null
  if (byId && byId.owner === ctx.owner) return byId
  const named = albumsOf(ctx).filter((a) => fold(a.title) === fold(want))
  if (named.length > 1) throw problem(409, 'ambiguous', `More than one album is called “${want}”. Use its id from albums_list.`)
  if (!named.length) throw problem(404, 'not_found', 'No album by that name. Use albums_list to find it.')
  return named[0]
}

function exposure(e) {
  if (!e) return undefined
  const parts = []
  if (e.f) parts.push('f/' + e.f)
  if (e.s) parts.push(e.s >= 1 ? e.s + ' s' : '1/' + Math.round(1 / e.s) + ' s')
  if (e.iso) parts.push('ISO ' + e.iso)
  if (e.mm) parts.push(e.mm + ' mm' + (e.mm35 && e.mm35 !== e.mm ? ' (' + e.mm35 + ' mm full-frame)' : ''))
  return parts.length ? parts.join(', ') : undefined
}

function brief(ctx, p, titles) {
  const albums = (p.albums || []).map((id) => titles.get(id)).filter(Boolean)
  return {
    id: p.id,
    taken: wall(p.taken),
    zone: p.offset || undefined,
    name: p.name,
    place: p.place || undefined,
    camera: p.camera || undefined,
    size: p.w + '×' + p.h,
    favourite: p.fav || undefined,
    albums: albums.length ? albums : undefined,
    in_trash: p.trashed ? true : undefined,
    open: link(ctx, '/?photo=' + encodeURIComponent(p.id))
  }
}

function detail(ctx, p, titles) {
  return {
    ...brief(ctx, p, titles),
    weekday: WEEKDAYS[new Date(p.taken).getUTCDay()],
    lens: p.lens || undefined,
    exposure: exposure(p.exp),
    location: p.gps ? { latitude: p.gps[0], longitude: p.gps[1] } : undefined,
    type: p.type,
    original: p.orig ? 'kept, ' + size(p.size) : 'not kept: Roll has a full-size copy',
    added: iso(p._createdAt),
    trashed: iso(p.trashed || 0),
    deleted_for_good_after: p.trashed ? dayOf(p.trashed + TRASH_DAYS * DAY) : undefined
  }
}

const titlesOf = (ctx) => new Map(albumsOf(ctx).map((a) => [a.id, a.title]))

// What search matches, as on the search page: name, camera, lens, place, album titles, month,
// weekday, year, season, shape, time of day, and favourite.
function words(p, titles) {
  const d = new Date(p.taken)
  const hour = d.getUTCHours()
  const shape = p.w / p.h > 2.1 ? 'panorama wide' : p.w > p.h * 1.05 ? 'landscape' : p.h > p.w * 1.05 ? 'portrait vertical' : 'square'
  const time = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening sunset' : 'night'
  const albums = (p.albums || []).map((id) => titles.get(id) || '').join(' ')
  return fold([p.name, p.camera, p.lens, p.place, albums, MONTHS[d.getUTCMonth()], WEEKDAYS[d.getUTCDay()], String(d.getUTCFullYear()),
    SEASONS[d.getUTCMonth()], shape, time, p.fav ? 'favorite favourite loved' : ''].filter(Boolean).join(' '))
}

/* ---- Reading ------------------------------------------------------------------------ */

export function libraryGet(input, env) {
  return op(env, (ctx) => {
    const own = { owner: ctx.owner }
    const live = { ...own, trashed: 0 }
    const first = ctx.ds.find('photos', live, { orderBy: 'taken', order: 'asc', limit: 1 })[0]
    const last = ctx.ds.find('photos', live, { orderBy: 'taken', order: 'desc', limit: 1 })[0]
    const years = []
    if (first && last) {
      for (let y = new Date(last.taken).getUTCFullYear(); y >= new Date(first.taken).getUTCFullYear(); y--) {
        const n = ctx.ds.count('photos', { ...live, taken: { $gte: Date.UTC(y, 0, 1), $lt: Date.UTC(y + 1, 0, 1) } })
        if (n) years.push({ year: y, photos: n })
      }
    }
    // Places and cameras from the newest photos, as far as the time allows.
    const places = new Map()
    const cameras = new Map()
    const start = Date.now()
    let looked = 0
    let bound = null
    for (;;) {
      const rows = ctx.ds.find('photos', bound == null ? live : { ...live, taken: { $lt: bound } }, { orderBy: 'taken', order: 'desc', limit: 100 })
      for (const p of rows) {
        looked++
        if (p.place) { const k = p.place.split(',')[0]; places.set(k, (places.get(k) || 0) + 1) }
        if (p.camera) cameras.set(p.camera, (cameras.get(p.camera) || 0) + 1)
      }
      if (rows.length < 100 || Date.now() - start > BUDGET) break
      bound = rows[rows.length - 1].taken
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, photos]) => ({ name, photos }))
    const albums = albumsOf(ctx)
    const used = Number(ctx.kv.get('used:' + ctx.owner)) || 0
    const limit = Number(ctx.kv.get('quota:' + ctx.owner)) || 0
    const total = ctx.ds.count('photos', live)
    return {
      photos: total,
      favourites: ctx.ds.count('photos', { ...live, fav: true }),
      in_trash: ctx.ds.count('photos', { ...own, trashed: { $gt: 0 } }),
      albums: albums.length,
      shared_albums: albums.filter((a) => a.share).length || undefined,
      first_photo: first ? wall(first.taken) : undefined,
      latest_photo: last ? wall(last.taken) : undefined,
      years,
      top_places: places.size ? top(places, 8) : undefined,
      cameras: cameras.size ? top(cameras, 4) : undefined,
      places_and_cameras_from: looked < total ? `the newest ${looked} photos` : undefined,
      storage: limit ? `${size(used)} of ${size(limit)}` : `${size(used)} used`,
      open: link(ctx, '/')
    }
  })
}

// A cursor: the last photo time a page reached, and the photos at that time already given.
function readCursor(value) {
  if (value == null || value === '') return null
  const m = /^(-?\d{1,16}):([A-Za-z0-9_,-]{0,6600})$/.exec(String(value))
  if (!m) fail(400, 'That cursor isn’t one photos_list gave. Leave it out to start again.')
  return { t: Number(m[1]), ids: m[2] ? m[2].split(',') : [] }
}

export function photosList(input, env) {
  return op(env, (ctx) => {
    const titles = titlesOf(ctx)
    const filter = { owner: ctx.owner, trashed: input.trash ? { $gt: 0 } : 0 }
    if (input.favourites) filter.fav = true
    let album = null
    if (input.album) {
      album = findAlbum(ctx, input.album)
      filter.albums = { $contains: album.id }
    }
    const from = input.from ? day(input.from, 'from') : null
    const to = input.to ? day(input.to, 'to') + DAY - 1 : null
    if (from != null && to != null && to < from) fail(400, 'The to date comes before the from date.')
    const newest = input.order !== 'oldest'
    const terms = fold(input.query).split(/\s+/).filter(Boolean)
    const place = fold(input.place).trim()
    const match = (p) => (!place || fold(p.place).includes(place)) && (!terms.length || terms.every((t) => words(p, titles).includes(t)))
    const limit = count(input.limit, 1, 100, 30)
    const cursor = readCursor(input.cursor)
    let bound = cursor ? cursor.t : null
    let seen = new Set(cursor ? cursor.ids : [])
    const out = []
    const start = Date.now()
    let stopped = false
    for (;;) {
      const low = newest ? from : bound == null ? from : Math.max(bound, from == null ? -Infinity : from)
      const high = newest ? (bound == null ? to : Math.min(bound, to == null ? Infinity : to)) : to
      const taken = {}
      if (low != null) taken.$gte = low
      if (high != null) taken.$lte = high
      const rows = ctx.ds.find('photos', Object.keys(taken).length ? { ...filter, taken } : filter, { orderBy: 'taken', order: newest ? 'desc' : 'asc', limit: 100 })
      let moved = false
      for (const p of rows) {
        if (p.taken === bound && seen.has(p.id)) continue
        moved = true
        if (p.taken !== bound) { bound = p.taken; seen = new Set() }
        seen.add(p.id)
        if (match(p)) out.push(p)
        if (out.length >= limit) break
      }
      if (out.length >= limit) { stopped = true; break }
      if (!moved || rows.length < 100) break
      if (Date.now() - start > BUDGET) { stopped = true; break }
    }
    const filtered = terms.length || place
    return {
      album: album ? { id: album.id, title: album.title, open: link(ctx, '/albums/' + album.id) } : undefined,
      photos: out.map((p) => brief(ctx, p, titles)),
      total: filtered ? undefined : ctx.ds.count('photos', from != null || to != null ? { ...filter, taken: { ...(from != null ? { $gte: from } : {}), ...(to != null ? { $lte: to } : {}) } } : filter),
      next: stopped && seen.size <= 100 ? bound + ':' + [...seen].join(',') : undefined,
      search: terms.length ? link(ctx, '/search?q=' + encodeURIComponent(input.query.trim())) : undefined
    }
  })
}

export function photosGet(input, env) {
  return op(env, (ctx) => {
    const { found, missing } = owned(ctx, ids(input.photos, 50))
    const titles = titlesOf(ctx)
    return { photos: found.map((p) => detail(ctx, p, titles)), not_found: missing.length ? missing : undefined }
  })
}

// "On this day": photos from within a day of the date in earlier years, as the page shows them.
export function memoriesGet(input, env) {
  return op(env, (ctx) => {
    const date = input.date ? day(input.date, 'date') : Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    const d = new Date(date)
    const live = { owner: ctx.owner, trashed: 0 }
    const first = ctx.ds.find('photos', live, { orderBy: 'taken', order: 'asc', limit: 1 })[0]
    const titles = titlesOf(ctx)
    const each = count(input.per_year, 1, 50, 12)
    const years = []
    if (first) {
      for (let y = d.getUTCFullYear() - 1; y >= new Date(first.taken).getUTCFullYear(); y--) {
        const same = Date.UTC(y, d.getUTCMonth(), d.getUTCDate())
        const rows = ctx.ds.find('photos', { ...live, taken: { $gte: same - DAY, $lte: same + 2 * DAY } }, { orderBy: 'taken', order: 'asc', limit: 100 })
        if (!rows.length) continue
        const places = new Map()
        for (const p of rows) if (p.place) { const k = p.place.split(',')[0]; places.set(k, (places.get(k) || 0) + 1) }
        const place = [...places.entries()].sort((a, b) => b[1] - a[1])[0]
        years.push({
          year: y,
          years_ago: d.getUTCFullYear() - y,
          place: place ? place[0] : undefined,
          count: rows.length,
          photos: rows.slice(0, each).map((p) => brief(ctx, p, titles))
        })
      }
    }
    return { date: dayOf(date), years, open: years.length ? link(ctx, '/') : undefined }
  })
}

function albumBrief(ctx, a) {
  return {
    id: a.id,
    title: a.title,
    photos: ctx.ds.count('photos', { owner: ctx.owner, albums: { $contains: a.id }, trashed: 0 }),
    cover: a.cover || undefined,
    shared: a.share ? link(ctx, '/s/' + a.share) || '/s/' + a.share : undefined,
    made: iso(a._createdAt),
    open: link(ctx, '/albums/' + a.id)
  }
}

export function albumsList(input, env) {
  return op(env, (ctx) => {
    let list = albumsOf(ctx)
    const q = fold(input.query).trim()
    if (q) list = list.filter((a) => fold(a.title).includes(q))
    const limit = count(input.limit, 1, 200, 100)
    return { albums: list.slice(0, limit).map((a) => albumBrief(ctx, a)), more: list.length > limit ? list.length - limit : undefined }
  })
}

/* ---- Changing ------------------------------------------------------------------------- */

// One change to the caller's photos in batches, as the page sends them; what didn't fit in
// the time comes back as `left`.
function apply(ctx, docs, op, album, until) {
  const list = docs.map((p) => p.id)
  if (!list.length) return []
  const r = batch(ctx, { ids: list, op, album }, until)
  return list.slice(Math.max(0, r.done))
}

// The time a tool has for its changes, so two of them still fit in one request.
const deadline = () => Date.now() + 3000

export function photosUpdate(input, env) {
  return op(env, (ctx) => {
    const fav = typeof input.favourite === 'boolean'
    if (fav === (typeof input.trash === 'boolean')) fail(400, 'Give favourite or trash, one change at a time.')
    const until = deadline()
    const { found, missing } = owned(ctx, ids(input.photos))
    const left = apply(ctx, found, fav ? (input.favourite ? 'fav' : 'unfav') : input.trash ? 'trash' : 'restore', null, until)
    const done = found.filter((p) => !left.includes(p.id)).map((p) => p.id)
    const titles = titlesOf(ctx)
    return {
      changed: done.length,
      photos: done.slice(0, 20).map((id) => brief(ctx, ctx.ds.findOne('photos', id), titles)),
      left: left.length ? left : undefined,
      not_found: missing.length ? missing : undefined,
      note: left.length ? 'Call again with the left photos to finish.' : input.trash === true && done.length ? `In the Trash, they're deleted for good after ${TRASH_DAYS} days.` : undefined
    }
  })
}

export function albumsCreate(input, env) {
  return op(env, (ctx) => {
    const title = String(input.title || '').trim()
    if (!title) fail(400, 'Give the album a title.')
    const docs = input.photos ? owned(ctx, ids(input.photos)) : { found: [], missing: [] }
    const until = deadline()
    const { album } = createAlbum(ctx, { title })
    const left = apply(ctx, docs.found.filter((p) => !p.trashed), 'add', album.id, until)
    if (input.share === true) shareAlbum(ctx, album.id, { on: true })
    return {
      ...albumBrief(ctx, ctx.ds.findOne('albums', album.id)),
      left: left.length ? left : undefined,
      not_found: docs.missing.length ? docs.missing : undefined,
      skipped_in_trash: docs.found.some((p) => p.trashed) ? docs.found.filter((p) => p.trashed).map((p) => p.id) : undefined
    }
  })
}

export function albumsUpdate(input, env) {
  return op(env, (ctx) => {
    const album = findAlbum(ctx, input.album)
    const changes = ['title', 'cover', 'add', 'remove', 'share'].filter((k) => input[k] !== undefined)
    if (!changes.length) fail(400, 'Say what to change: title, cover, add, remove or share.')
    const set = {}
    if (typeof input.title === 'string') {
      if (!input.title.trim()) fail(400, 'An album needs a title.')
      set.title = input.title
    }
    const until = deadline()
    let missing = []
    let left = []
    let added = 0
    let removed = 0
    if (input.add) {
      const docs = owned(ctx, ids(input.add))
      missing = missing.concat(docs.missing)
      const fresh = docs.found.filter((p) => !p.trashed && !(p.albums || []).includes(album.id))
      left = left.concat(apply(ctx, fresh, 'add', album.id, until))
      added = fresh.length - left.length
    }
    if (input.remove && !left.length) {
      const docs = owned(ctx, ids(input.remove))
      missing = missing.concat(docs.missing)
      const there = docs.found.filter((p) => (p.albums || []).includes(album.id))
      const rest = apply(ctx, there, 'remove', album.id, until)
      left = left.concat(rest)
      removed = there.length - rest.length
    }
    if (input.cover !== undefined) set.cover = input.cover
    if (Object.keys(set).length) updateAlbum(ctx, album.id, set)
    if (typeof input.share === 'boolean') shareAlbum(ctx, album.id, { on: input.share })
    return {
      ...albumBrief(ctx, ctx.ds.findOne('albums', album.id)),
      added: added || undefined,
      removed: removed || undefined,
      left: left.length ? left : undefined,
      not_found: missing.length ? [...new Set(missing)] : undefined
    }
  })
}

export function albumsDelete(input, env) {
  return op(env, (ctx) => {
    const album = findAlbum(ctx, input.album)
    const r = deleteAlbum(ctx, album.id)
    if (r.left) return { album: album.title, finished: false, note: 'Roll is still taking the album off its photos. Call albums_delete again to finish.' }
    return { deleted: album.title, finished: true, note: 'Its photos are still in the library.', link_stopped: album.share ? true : undefined }
  })
}

// Deleting for good works only on photos already in the Trash, as in the page, and only once
// the person has said yes: without confirm it says what would go.
export function photosDelete(input, env) {
  return op(env, (ctx) => {
    const all = input.empty_trash === true
    if (all === !!input.photos) fail(400, 'Give photos from the Trash, or empty_trash true, not both.')
    const titles = titlesOf(ctx)
    let docs = []
    let missing = []
    let notInTrash = []
    if (all) {
      docs = ctx.ds.find('photos', { owner: ctx.owner, trashed: { $gt: 0 } }, { limit: 100 })
    } else {
      const r = owned(ctx, ids(input.photos))
      missing = r.missing
      docs = r.found.filter((p) => p.trashed)
      notInTrash = r.found.filter((p) => !p.trashed).map((p) => p.id)
    }
    const total = all ? ctx.ds.count('photos', { owner: ctx.owner, trashed: { $gt: 0 } }) : docs.length
    const extra = {
      not_in_trash: notInTrash.length ? notInTrash : undefined,
      not_found: missing.length ? missing : undefined
    }
    if (!total) return { deleted: 0, note: all ? 'The Trash is empty.' : notInTrash.length ? 'None of those are in the Trash. Move photos there first with photos_update.' : 'None of those are in your library.', ...extra }
    if (input.confirm !== true) {
      return {
        confirm_needed: true,
        would_delete: total,
        photos: docs.slice(0, 10).map((p) => brief(ctx, p, titles)),
        note: 'Deleting for good removes the photos and their originals from this server, and can’t be undone. Ask the person first, then call again with confirm true.',
        ...extra
      }
    }
    const r = all ? emptyTrash(ctx) : destroy(ctx, docs.map((p) => p.id))
    const left = all ? r.left : docs.length - r.done
    return {
      deleted: all ? r.removed : r.done,
      left: left || undefined,
      note: left ? 'Some are still in the Trash. Call again to finish.' : undefined,
      ...extra
    }
  })
}
