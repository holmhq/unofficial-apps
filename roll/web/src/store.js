// The member's library in this tab: every photo and album, kept in IndexedDB so the next
// visit draws at once, then brought up to date from the server, which answers in one line
// when nothing changed. Changes show at once and go to the server in the background; if the
// server says no, they're undone.

import * as api from './api.js'
import { dayKey, todayWall, yearOf, monthName, weekdayName } from './time.js'

export const lib = {
  me: null,
  v: null,
  photos: new Map(),
  albums: new Map(),
  used: 0,
  quota: 0,
  ready: false,
  local: new Map() // id → object URL of a thumbnail made here, until the server's copy is cached
}

let revision = 0
const listeners = new Set()
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function emit(what = 'library') { revision++; memo.clear(); for (const fn of [...listeners]) fn(what) }
export const rev = () => revision

const memo = new Map()
function remember(key, make) {
  if (!memo.has(key)) memo.set(key, make())
  return memo.get(key)
}

const byTaken = (a, b) => b.taken - a.taken || (a.id < b.id ? 1 : -1)

/* ---- Views of the library --------------------------------------------------------- */

export const timeline = () => remember('all', () => [...lib.photos.values()].filter((p) => !p.trashed).sort(byTaken))
export const favorites = () => remember('fav', () => timeline().filter((p) => p.fav))
export const trash = () => remember('trash', () => [...lib.photos.values()].filter((p) => p.trashed).sort((a, b) => b.trashed - a.trashed || byTaken(a, b)))
export const inAlbum = (id) => remember('album:' + id, () => timeline().filter((p) => p.albums && p.albums.includes(id)))
export const atPlace = (name) => remember('place:' + name, () => timeline().filter((p) => p.place === name))

export const albums = () => remember('albums', () => [...lib.albums.values()].map((a) => {
  const photos = inAlbum(a.id)
  const cover = (a.cover && lib.photos.get(a.cover) && !lib.photos.get(a.cover).trashed && lib.photos.get(a.cover)) || photos[0] || null
  return { ...a, count: photos.length, coverPhoto: cover, first: photos.length ? photos[photos.length - 1].taken : 0, last: photos.length ? photos[0].taken : 0 }
}).sort((a, b) => (b.last || b._createdAt || 0) - (a.last || a._createdAt || 0)))

export const places = () => remember('places', () => {
  const map = new Map()
  for (const p of timeline()) {
    if (!p.place || p.pending) continue
    let entry = map.get(p.place)
    if (!entry) map.set(p.place, (entry = { name: p.place, photos: [] }))
    entry.photos.push(p)
  }
  return [...map.values()].map((e) => ({ name: e.name, count: e.photos.length, cover: e.photos.find((p) => p.fav) || e.photos[0], last: e.photos[0].taken }))
    .sort((a, b) => b.last - a.last)
})

// "On this day": photos from within a day of today's date in earlier years, a set per year.
export const memories = () => remember('memories', () => {
  const today = todayWall()
  const now = new Date(today)
  const years = new Map()
  for (const p of timeline()) {
    if (p.pending) continue
    const d = new Date(p.taken)
    const y = d.getUTCFullYear()
    if (y >= now.getUTCFullYear()) continue
    const same = Date.UTC(y, now.getUTCMonth(), now.getUTCDate())
    if (Math.abs(p.taken - same - 43200000) > 1.5 * 86400000) continue
    if (!years.has(y)) years.set(y, [])
    years.get(y).push(p)
  }
  return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([y, photos]) => {
    const list = photos.slice().sort((a, b) => a.taken - b.taken)
    const place = common(list.map((p) => p.place && p.place.split(',')[0]))
    return { key: 'y' + y, years: now.getUTCFullYear() - y, year: y, photos: list, cover: list.find((p) => p.fav) || list[Math.floor(list.length / 2)], place }
  })
})

export function common(values) {
  const counts = new Map()
  let best = null
  let bestN = 0
  for (const v of values) {
    if (!v) continue
    const n = (counts.get(v) || 0) + 1
    counts.set(v, n)
    if (n > bestN) { best = v; bestN = n }
  }
  return best
}

/* ---- Search -------------------------------------------------------------------------- */

const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn fall', 'autumn fall', 'autumn fall', 'winter']

function words(p) {
  const d = new Date(p.taken)
  const hour = d.getUTCHours()
  const albumTitles = (p.albums || []).map((id) => (lib.albums.get(id) || {}).title || '').join(' ')
  const shape = p.w / p.h > 2.1 ? 'panorama wide' : p.w > p.h * 1.05 ? 'landscape' : p.h > p.w * 1.05 ? 'portrait vertical' : 'square'
  const time = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening sunset' : 'night'
  return [p.name, p.camera, p.lens, p.place, albumTitles, monthName(p.taken), weekdayName(p.taken), String(yearOf(p.taken)),
    SEASONS[d.getUTCMonth()], shape, time, p.fav ? 'favorite favourite loved' : ''].filter(Boolean).join(' ').toLowerCase()
}

export function search(query) {
  const terms = query.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const index = remember('index', () => timeline().map((p) => [p, words(p).normalize('NFKD').replace(/[̀-ͯ]/g, '')]))
  return index.filter(([, text]) => terms.every((t) => text.includes(t))).map(([p]) => p)
}

// Things worth searching for, from the library itself.
export const suggestions = () => remember('suggest', () => {
  const tally = (list) => {
    const m = new Map()
    for (const v of list) if (v) m.set(v, (m.get(v) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
  }
  const all = timeline()
  return {
    places: tally(all.map((p) => p.place && p.place.split(',')[0])).slice(0, 8),
    cameras: tally(all.map((p) => p.camera)).slice(0, 4),
    years: [...new Set(all.map((p) => yearOf(p.taken)))].sort((a, b) => b - a).slice(0, 6).map(String)
  }
})

/* ---- Loading -------------------------------------------------------------------------- */

const DB = 'roll'
function idb(mode, fn) {
  return new Promise((resolve) => {
    let req
    try { req = indexedDB.open(DB, 1) } catch { return resolve(undefined) }
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onerror = () => resolve(undefined)
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('kv', mode)
        const r = fn(tx.objectStore('kv'))
        tx.oncomplete = () => { resolve(r && 'result' in r ? r.result : undefined); req.result.close() }
        tx.onerror = () => { resolve(undefined); req.result.close() }
      } catch { resolve(undefined) }
    }
  })
}
const cacheKey = () => 'lib:' + (lib.me && lib.me.id)
let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const data = { v: lib.v, photos: [...lib.photos.values()].filter((p) => !p.pending), albums: [...lib.albums.values()], used: lib.used, quota: lib.quota }
    idb('readwrite', (s) => s.put(data, cacheKey()))
    try { localStorage.setItem('roll:v', lib.v) } catch {}
  }, 400)
}
export function forget() {
  try { localStorage.removeItem('roll:v'); localStorage.removeItem('roll:me') } catch {}
  try { indexedDB.deleteDatabase(DB) } catch {}
  try { caches.delete('roll-photos') } catch {}
}

function apply(data) {
  lib.v = data.v
  lib.photos = new Map(data.photos.map((p) => [p.id, p]))
  lib.albums = new Map(data.albums.map((a) => [a.id, a]))
  lib.used = data.used || 0
  lib.quota = data.quota || 0
}

// Draws from this browser's copy first (if any), then from the server if it changed.
export async function load(prefetched) {
  const kept = await idb('readonly', (s) => s.get(cacheKey()))
  if (kept && kept.photos && !lib.ready) {
    apply(kept)
    lib.ready = true
    emit()
  }
  return refresh(prefetched)
}

let refreshing = null
export function refresh(prefetched) {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const data = prefetched ? await prefetched : await api.get('/api/library' + (lib.v && lib.ready ? '?v=' + encodeURIComponent(lib.v) : ''))
      if (!data || data.error) throw new Error((data && data.error && data.error.message) || 'Couldn’t load your library.')
      if (data.same && lib.ready) return false
      if (data.same) return refreshFull()
      const changed = !lib.ready || data.v !== lib.v
      apply(data)
      lib.ready = true
      if (changed) { emit(); save() }
      return changed
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}
async function refreshFull() {
  const data = await api.get('/api/library')
  apply(data)
  lib.ready = true
  emit()
  save()
  return true
}

/* ---- Changes ----------------------------------------------------------------------------- */

function settle(v) {
  if (v) lib.v = v
  save()
}

// A change to many photos, shown at once and sent in batches.
export async function change(ids, op, album = null) {
  ids = ids.filter((id) => lib.photos.has(id))
  if (!ids.length) return
  const before = ids.map((id) => [id, lib.photos.get(id)])
  const at = Date.now()
  for (const id of ids) {
    const p = lib.photos.get(id)
    const next = { ...p }
    if (op === 'fav') next.fav = true
    if (op === 'unfav') next.fav = false
    if (op === 'trash') next.trashed = at
    if (op === 'restore') next.trashed = 0
    if (op === 'add' && !(p.albums || []).includes(album)) next.albums = [...(p.albums || []), album]
    if (op === 'remove') next.albums = (p.albums || []).filter((a) => a !== album)
    lib.photos.set(id, next)
  }
  if (op === 'add' && album && lib.albums.get(album) && !lib.albums.get(album).cover) lib.albums.set(album, { ...lib.albums.get(album), cover: ids[0] })
  emit()
  try {
    let left = ids
    while (left.length) {
      const r = await api.post('/api/photos/batch', { ids: left.slice(0, 500), op, album })
      settle(r.v)
      left = left.slice(Math.max(1, r.done))
    }
  } catch (error) {
    for (const [id, p] of before) lib.photos.set(id, p)
    emit()
    throw error
  }
}

export async function destroy(ids) {
  const before = ids.map((id) => [id, lib.photos.get(id)]).filter(([, p]) => p)
  for (const [id] of before) lib.photos.delete(id)
  emit()
  try {
    let left = ids
    while (left.length) {
      const r = await api.post('/api/photos/delete', { ids: left.slice(0, 500) })
      settle(r.v)
      left = left.slice(Math.max(1, r.done))
    }
    lib.used = Math.max(0, lib.used - before.reduce((n, [, p]) => n + (p.orig ? p.size : 0) + (p.psize || 0) + (p.tsize || 0), 0))
  } catch (error) {
    for (const [id, p] of before) lib.photos.set(id, p)
    emit()
    throw error
  }
}

export async function emptyTrash() {
  const ids = trash().map((p) => p.id)
  return destroy(ids)
}

export async function createAlbum(title, ids = []) {
  const { album } = await api.post('/api/albums', { title })
  lib.albums.set(album.id, album)
  emit()
  if (ids.length) await change(ids, 'add', album.id)
  else save()
  return album
}

export async function updateAlbum(id, set) {
  const before = lib.albums.get(id)
  lib.albums.set(id, { ...before, ...set })
  emit()
  try {
    const r = await api.patch('/api/albums/' + id, set)
    lib.albums.set(id, r.album)
    settle(r.v)
  } catch (error) {
    lib.albums.set(id, before)
    emit()
    throw error
  }
}

export async function deleteAlbum(id) {
  const before = lib.albums.get(id)
  const touched = []
  lib.albums.delete(id)
  for (const p of lib.photos.values()) if (p.albums && p.albums.includes(id)) { touched.push(p); lib.photos.set(p.id, { ...p, albums: p.albums.filter((a) => a !== id) }) }
  emit()
  try {
    for (let i = 0; i < 50; i++) {
      const r = await api.del('/api/albums/' + id)
      settle(r.v)
      if (!r.left) break
    }
  } catch (error) {
    lib.albums.set(id, before)
    for (const p of touched) lib.photos.set(p.id, p)
    emit()
    throw error
  }
}

export async function shareAlbum(id, on) {
  const r = await api.post('/api/albums/' + id + '/share', { on })
  lib.albums.set(id, r.album)
  settle(r.v)
  emit()
  return r.album
}

// A photo the upload queue just added (or found again).
export function added(photo, v) {
  lib.photos.set(photo.id, photo)
  lib.used += (photo.psize || 0) + (photo.tsize || 0) + (photo.orig ? photo.size : 0)
  if (v) lib.v = v
  emit('added')
  save()
}

export function updated(photo, v) {
  const before = lib.photos.get(photo.id)
  lib.photos.set(photo.id, { ...before, ...photo })
  if (photo.orig && before && !before.orig) lib.used += photo.size || 0
  if (v) lib.v = v
  save()
}

export const local = lib.local

// A photo still on its way up: shown with a ring until the server has it.
export function pend(p) {
  lib.photos.set(p.id, p)
  emit('added')
}

export function unpend(localId, realId = null) {
  const url = lib.local.get(localId)
  lib.local.delete(localId)
  if (url && realId) lib.local.set(realId, url)
  else if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  lib.photos.delete(localId)
  if (!realId) emit()
}

export const hasHash = (hash) => remember('hashes', () => new Map([...lib.photos.values()].filter((p) => p.hash).map((p) => [p.hash, p.id]))).get(hash)

export const photoURL = (p, kind = 't', share = null) => (kind === 't' && lib.local.get(p.id)) || `/${kind}/${p.id}${share ? '?s=' + share : ''}`

export const dayOf = (p) => dayKey(p.taken)
