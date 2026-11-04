// Your shelf in this browser: every saved link, kept in localStorage so the list draws at once,
// checked against the server's version, and kept current over realtime while the page is open.
// Changes are made here first and sent after, so taps feel instant; a refusal puts things back.
//
// The queue at the bottom makes links readable: a link saved from anywhere (the bookmarklet,
// Claude, another device) arrives "pending", and whichever page is open fetches it through the
// server, cleans it with Readability and stores the article.

import * as api from './api.js'
import { subscribe } from './live.js'

export const lib = { me: null, items: new Map(), v: 0, ready: false, marks: new Map(), highlights: null, review: null, feeds: null, views: null }

const listeners = new Set()
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function emit(change) { for (const fn of listeners) { try { fn(change) } catch (e) { console.error(e) } } }

/* ---- This browser's copy -------------------------------------------------------------------- */

const cacheKey = () => 'shelf:lib:' + (lib.me && lib.me.id)
let saveTimer = 0

function readCache() {
  try {
    const kept = JSON.parse(localStorage.getItem(cacheKey()) || 'null')
    if (kept && Array.isArray(kept.items)) {
      lib.items = new Map(kept.items.map((i) => [i.id, i]))
      lib.v = kept.v || 0
      lib.ready = true
      return true
    }
  } catch {}
  return false
}

function writeCache() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(cacheKey(), JSON.stringify({ v: lib.v, items: [...lib.items.values()] })) } catch {}
  }, 300)
}

export function cachedVersion() {
  try { return (JSON.parse(localStorage.getItem(cacheKey()) || 'null') || {}).v || 0 } catch { return 0 }
}

export function forget() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('shelf:lib:') || k.startsWith('shelf:marks:') || k === 'shelf:me') localStorage.removeItem(k)
  } catch {}
  try { caches.delete('shelf-articles') } catch {}
}

/* ---- Loading and keeping current --------------------------------------------------------------- */

let loading = null
export function load(prefetched) {
  const drew = readCache()
  if (drew) emit({ full: true })
  loading = (async () => {
    let data
    try { data = await (prefetched || api.get('/api/library' + (lib.v ? '?v=' + lib.v : ''))) } catch (e) {
      if (!drew) { lib.ready = true; emit({ full: true }) }
      throw e
    }
    if (data && data.error) throw new Error(data.error.message)
    applyLibrary(data)
  })()
  return loading
}

function applyLibrary(data) {
  if (!data) return
  if (data.same && lib.ready) { lib.v = data.v; queueKick(); prefetchSoon(); return }
  if (Array.isArray(data.items)) {
    const before = lib.items
    lib.items = new Map(data.items.map((i) => [i.id, i]))
    lib.v = data.v
    lib.ready = true
    writeCache()
    const changed = before.size !== lib.items.size || data.items.some((i) => JSON.stringify(before.get(i.id)) !== JSON.stringify(i))
    if (changed || !before.size) emit({ full: true })
  }
  queueKick()
  prefetchSoon()
}

// Ask again; `whole` skips the version check, after a change made here that the page
// doesn't hold yet (an import).
export async function refresh(whole = false) {
  try { applyLibrary(await api.get('/api/library' + (lib.v && !whole ? '?v=' + lib.v : ''))) } catch {}
}

let unlisten = null
export function listen(channel) {
  if (unlisten || !channel) return
  unlisten = subscribe(channel, (m) => {
    if (m.type === 'ready') { if (m.again) refresh(); return }
    if (m.type !== 'changed') return
    if (m.from === api.PAGE) { if (!m.full) { lib.v = Math.max(lib.v, m.v); writeCache() } return }
    const inOrder = m.v === lib.v + 1
    if (m.item) upsert(m.item, { quiet: m.quiet, remote: true })
    if (m.removed) drop(m.removed, { remote: true })
    if (m.mark || m.unmark) { lib.highlights = null; if (m.mark) lib.marks.delete(m.mark.item); emit({ marks: m.mark ? m.mark.item : true }) }
    if (m.feeds) loadFeeds().catch(() => {})
    if (m.views) loadViews().catch(() => {})
    if (m.full || (!inOrder && !m.item && !m.removed)) { refresh(); return }
    lib.v = Math.max(lib.v, m.v)
    writeCache()
    if (m.fetch || (m.item && m.item.status === 'pending')) queueKick()
  })
}

function upsert(item, { quiet = false, remote = false, fresh = false } = {}) {
  if (!item || !item.id) return
  const had = lib.items.get(item.id)
  lib.items.set(item.id, item)
  writeCache()
  emit({ item: item.id, quiet, remote, fresh: fresh || (!had && remote), before: had })
}

function drop(id, { remote = false } = {}) {
  if (!lib.items.has(id)) return
  const had = lib.items.get(id)
  lib.items.delete(id)
  lib.marks.delete(id)
  lib.highlights = null
  writeCache()
  emit({ removed: id, remote, before: had })
}

/* ---- Lists ---------------------------------------------------------------------------------------- */

export const all = () => [...lib.items.values()]
export const minutes = (i) => (i.words ? Math.max(1, Math.round(i.words / 230)) : 0)
const bySaved = (a, b) => (b.saved || 0) - (a.saved || 0)
// Books kept only for their highlights (a Kindle import, a paper book) live on the Highlights
// page, not in the lists of things to read.
const readable = (i) => i.kind !== 'notes'
export const unread = () => all().filter((i) => readable(i) && i.state === 'unread').sort(bySaved)
export const inFeed = () => all().filter((i) => i.state === 'feed').sort(bySaved)
export const favourites = () => all().filter((i) => readable(i) && i.fav).sort(bySaved)
export const archived = () => all().filter((i) => readable(i) && i.state === 'archived').sort((a, b) => (b.read || b.saved) - (a.read || a.saved))
export const tagged = (tag) => all().filter((i) => (i.tags || []).includes(tag)).sort(bySaved)
export const books = () => all().filter((i) => i.kind === 'notes').sort((a, b) => a.title.localeCompare(b.title))

export function tags() {
  const count = new Map()
  for (const i of lib.items.values()) for (const t of i.tags || []) count.set(t, (count.get(t) || 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n }))
}

// A tag's colour: one of a few quiet ones, always the same for the same word.
const TONES = ['#e08a1e', '#3b6fe0', '#d6457a', '#1f9a5a', '#8b5cf6', '#0e97b5', '#d9452b', '#64748b', '#b8860b', '#c026d3']
// Colours go to tags in the order they were first used, so the first ten never share one and
// a tag keeps its colour as new ones arrive.
let tones = null
let tonesFor = -1
export function tone(tag) {
  if (!tones || tonesFor !== lib.items.size + lib.v) {
    const first = new Map()
    for (const i of lib.items.values()) for (const t of i.tags || []) if (!first.has(t) || i.saved < first.get(t)) first.set(t, i.saved || 0)
    tones = new Map([...first.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([t], n) => [t, TONES[n % TONES.length]]))
    tonesFor = lib.items.size + lib.v
  }
  if (tones.has(tag)) return tones.get(tag)
  let n = 2166136261
  for (const ch of String(tag)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0
  return TONES[n % TONES.length]
}

/* ---- Changes ---------------------------------------------------------------------------------------- */

export async function save(url, { title = '', via = 'app', tags = [] } = {}) {
  const r = await api.post('/api/items', { url, title, via, tags })
  lib.v = Math.max(lib.v, r.v || 0)
  upsert(r.item, { fresh: !r.existing })
  queueKick()
  return r
}

export async function update(id, changes) {
  const before = lib.items.get(id)
  if (!before) return
  const local = { ...before, ...changes }
  if (changes.state === 'archived') local.read = Date.now()
  upsert(local, { quiet: 'progress' in changes && Object.keys(changes).length === 1 })
  try {
    const r = await api.patch('/api/items/' + id, changes)
    lib.v = Math.max(lib.v, r.v || 0)
    if (!('progress' in changes)) upsert(r.item, { quiet: true })
    else { lib.items.set(id, { ...lib.items.get(id), ...r.item, progress: lib.items.get(id).progress }); writeCache() }
    return r.item
  } catch (e) {
    if (lib.items.get(id) === local) upsert(before)
    throw e
  }
}

export async function remove(id) {
  const before = lib.items.get(id)
  if (!before) return
  drop(id)
  try {
    const r = await api.del('/api/items/' + id)
    lib.v = Math.max(lib.v, r.v || 0)
  } catch (e) {
    upsert(before)
    throw e
  }
}

// Reading progress: kept here at once, sent a moment after scrolling stops, and on leaving.
const progressTimers = new Map()
export function progress(id, value, { now = false } = {}) {
  const item = lib.items.get(id)
  if (!item) return
  const p = Math.max(0, Math.min(1, Math.round(value * 1000) / 1000))
  if (Math.abs((item.progress || 0) - p) < 0.002 && !now) return
  lib.items.set(id, { ...item, progress: p })
  writeCache()
  emit({ item: id, quiet: true, progressOnly: true })
  clearTimeout(progressTimers.get(id))
  const send = () => {
    progressTimers.delete(id)
    fetch('/api/items/' + id, { method: 'PATCH', keepalive: true, headers: { 'content-type': 'application/json', accept: 'application/json', 'x-shelf-page': api.PAGE }, body: JSON.stringify({ progress: p }) })
      .then((r) => r.json()).then((r) => { if (r && r.v) lib.v = Math.max(lib.v, r.v) }).catch(() => {})
  }
  if (now) send()
  else progressTimers.set(id, setTimeout(send, 1800))
}
export function flushProgress() {
  for (const [id, t] of progressTimers) { clearTimeout(t); progress(id, lib.items.get(id).progress, { now: true }) }
}
addEventListener('pagehide', flushProgress)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushProgress() })

/* ---- Articles ---------------------------------------------------------------------------------------- */

export async function article(item) {
  const r = await fetch('/api/items/' + item.id + '/content?v=' + (item.cv || 0), { headers: { accept: 'text/plain' } })
  if (!r.ok) throw new api.ApiError(r.status, 'no_content', r.status === 404 ? 'This article hasn’t been made readable yet.' : 'The article couldn’t be loaded.')
  return r.text()
}

// The articles you're likely to open next, kept by the service worker for reading offline.
let prefetched = false
function prefetchSoon() {
  if (prefetched || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return
  prefetched = true
  const list = unread().filter((i) => i.status === 'ready').slice(0, 40)
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400))
  const next = () => {
    const item = list.shift()
    if (!item) return
    fetch('/api/items/' + item.id + '/content?v=' + (item.cv || 0)).catch(() => {}).finally(() => idle(next))
  }
  idle(next)
}

/* ---- Highlights ---------------------------------------------------------------------------------------- */

export async function marksFor(id, { fresh = false } = {}) {
  if (!fresh && lib.marks.has(id)) return lib.marks.get(id)
  let kept = null
  try { kept = JSON.parse(localStorage.getItem('shelf:marks:' + id) || 'null') } catch {}
  try {
    const r = await api.get('/api/items/' + id + '/marks')
    lib.marks.set(id, r.marks)
    try { localStorage.setItem('shelf:marks:' + id, JSON.stringify(r.marks)) } catch {}
    return r.marks
  } catch (e) {
    if (kept) return kept
    throw e
  }
}

function keepMarks(id, marks) {
  lib.marks.set(id, marks)
  lib.highlights = null
  try { localStorage.setItem('shelf:marks:' + id, JSON.stringify(marks)) } catch {}
}

export async function addMark(id, mark) {
  const r = await api.post('/api/items/' + id + '/marks', mark)
  lib.v = Math.max(lib.v, r.v || 0)
  keepMarks(id, [...(lib.marks.get(id) || []), r.mark])
  const item = lib.items.get(id)
  if (item) upsert({ ...item, marks: (item.marks || 0) + 1 }, { quiet: true })
  return r.mark
}

export async function noteMark(id, markId, note) { return editMark(id, markId, { note }) }

// Change a highlight's note, tags, favourite (or, for one typed in, its words and place).
export async function editMark(id, markId, changes) {
  const r = await api.patch('/api/marks/' + markId, changes)
  lib.v = Math.max(lib.v, r.v || 0)
  keepMarks(id, (lib.marks.get(id) || []).map((m) => (m.id === markId ? r.mark : m)))
  return r.mark
}

export async function removeMark(id, markId) {
  const r = await api.del('/api/marks/' + markId)
  lib.v = Math.max(lib.v, r.v || 0)
  keepMarks(id, (lib.marks.get(id) || []).filter((m) => m.id !== markId))
  const item = lib.items.get(id)
  if (item) upsert({ ...item, marks: Math.max(0, (item.marks || 1) - 1) }, { quiet: true })
}

// Every highlight, a page at a time (the server sends a hundred per request); `onPage` sees
// the list grow, so a long one draws before it has all arrived.
let gathering = null
export async function highlights(onPage = null) {
  if (lib.highlights) return lib.highlights
  if (gathering) return gathering
  gathering = (async () => {
    const marks = []
    const items = {}
    let cursor = null
    do {
      const r = await api.get('/api/highlights' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''))
      marks.push(...r.marks)
      Object.assign(items, r.items)
      cursor = r.cursor
      if (onPage && cursor) onPage({ marks: marks.slice(), items: { ...items }, partial: true })
    } while (cursor)
    const all = { marks, items }
    lib.highlights = all
    try { localStorage.setItem('shelf:marks:all', JSON.stringify(all)) } catch {}
    return all
  })()
  try { return await gathering } finally { gathering = null }
}

export async function everyHighlight(onPage = () => {}) {
  lib.highlights = null
  return highlights((part) => onPage(part.marks.length))
}

/* ---- Review ------------------------------------------------------------------------------------------- */

export const localDay = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

export async function reviewSet({ tag = '', item = '' } = {}) {
  const q = '?day=' + localDay() + (tag ? '&tag=' + encodeURIComponent(tag) : '') + (item ? '&item=' + encodeURIComponent(item) : '')
  for (let i = 0; i < 20; i++) {
    const r = await api.get('/api/review' + q)
    if (!r.preparing) {
      if (!tag && !item) { lib.review = r; try { localStorage.setItem('shelf:review:' + (lib.me && lib.me.id), JSON.stringify(r)) } catch {} }
      return r
    }
  }
  throw new Error('Your highlights are still being got ready. Try again in a moment.')
}
export const keptReview = () => {
  if (lib.review && lib.review.day === localDay()) return lib.review
  try { const r = JSON.parse(localStorage.getItem('shelf:review:' + (lib.me && lib.me.id)) || 'null'); return r && r.day === localDay() ? r : null } catch { return null }
}

export async function reviewed(markId, action) {
  const r = await api.post('/api/review/' + markId, { action, day: localDay() })
  if (lib.review && lib.review.cards.some((c) => c.mark.id === markId) && action !== 'restore' && !lib.review.done.includes(markId)) lib.review.done.push(markId)
  if (lib.review) { lib.review.streak = r.streak; try { localStorage.setItem('shelf:review:' + (lib.me && lib.me.id), JSON.stringify(lib.review)) } catch {} }
  for (const [id, marks] of lib.marks) if (marks.some((m) => m.id === markId)) keepMarks(id, marks.map((m) => (m.id === markId ? r.mark : m)))
  emit({ review: true })
  return r
}

export async function reviewSize(n) {
  await api.patch('/api/review', { n, day: localDay() })
  lib.review = null
  return reviewSet()
}

/* ---- Books kept for their highlights --------------------------------------------------------------------- */

export async function addBook({ title, author }) {
  const r = await api.post('/api/uploads', { kind: 'notes', title, author })
  lib.v = Math.max(lib.v, r.v || 0)
  upsert(r.item, { fresh: true })
  return r.item
}

// Covers are looked for two at a time, each book once per visit.
const coverAsked = new Map()
let coversRunning = 0
const coverQueue = []
export function findCover(id) {
  if (coverAsked.has(id)) return coverAsked.get(id)
  const job = new Promise((resolve) => coverQueue.push({ id, resolve }))
  coverAsked.set(id, job)
  nextCover()
  return job
}
function nextCover() {
  while (coversRunning < 2 && coverQueue.length) {
    const { id, resolve } = coverQueue.shift()
    coversRunning++
    api.post('/api/items/' + id + '/cover')
      .then((r) => { if (r.item) { lib.v = Math.max(lib.v, r.v || 0); upsert(r.item, { quiet: true }) } resolve(r.image || null) })
      .catch(() => resolve(null))
      .finally(() => { coversRunning--; nextCover() })
  }
}

export async function importHighlights(sources, onProgress) {
  let added = 0
  let skipped = 0
  let made = 0
  let i = 0
  while (i < sources.length) {
    // Batches small enough to send: a few books, or one very long one.
    const batch = []
    let size = 0
    for (let j = i; j < sources.length && batch.length < 20; j++) {
      const n = JSON.stringify(sources[j]).length
      if (batch.length && size + n > 900_000) break
      batch.push(sources[j])
      size += n
    }
    const r = await api.post('/api/import/highlights', { sources: batch })
    added += r.added
    skipped += r.skipped
    made += r.books
    i += Math.max(1, r.done || batch.length)
    if (onProgress) onProgress(i / sources.length, { added, skipped, made })
  }
  lib.highlights = null
  await refresh(true)
  emit({ marks: true })
  return { added, skipped, made }
}
export const keptHighlights = () => {
  if (lib.highlights) return lib.highlights
  try { return JSON.parse(localStorage.getItem('shelf:marks:all') || 'null') } catch { return null }
}

/* ---- Summaries --------------------------------------------------------------------------------------- */

export async function summarize(id) {
  const r = await api.post('/api/items/' + id + '/summary')
  const item = lib.items.get(id)
  if (item) upsert({ ...item, summary: r.summary }, { quiet: true })
  lib.v = Math.max(lib.v, r.v || 0)
  return r.summary
}

/* ---- Making links readable ------------------------------------------------------------------------------ */

const busy = new Map()
const tried = new Map()
let running = 0

// Links waiting to be fetched, newest first. Imported links wait until they're opened (an
// export can hold thousands), apart from the newest few.
function waiting() {
  const now = Date.now()
  const list = all().filter((i) => i.status === 'pending' && i.state !== 'feed' && !busy.has(i.id) && !(tried.get(i.id) > now - 5 * 60 * 1000))
  const own = list.filter((i) => i.via !== 'import').sort(bySaved)
  const imported = list.filter((i) => i.via === 'import' && i.state !== 'archived').sort(bySaved).slice(0, 12)
  return [...own, ...imported]
}

export function queueKick() {
  if (!lib.ready || !navigator.onLine) return
  while (running < 2) {
    const next = waiting()[0]
    if (!next) return
    running++
    makeReadable(next.id).catch(() => {}).finally(() => { running--; setTimeout(queueKick, 150) })
  }
}
addEventListener('online', () => queueKick())

export function makeReadable(id) {
  if (busy.has(id)) return busy.get(id)
  const job = (async () => {
    tried.set(id, Date.now())
    emit({ item: id, working: true })
    const { readable } = await import('./extract.js')
    const item = lib.items.get(id)
    if (!item) return null
    // A feed that carries whole articles (or a video's description) needs no trip to the site,
    // and a video page has nothing to read: its description is kept instead.
    const given = feedHTML.get(id) || (item.video ? '<p>' + (item.excerpt || item.title).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>' : '')
    // A PDF (uploaded, or a saved link that turned out to be one) is read from the file kept on
    // the server.
    let content = item.kind === 'pdf' ? { status: 'pdf' } : await readable(item, given)
    if (content.status === 'pdf') {
      try {
        if (item.kind !== 'pdf') { const made = await api.post('/api/items/' + id + '/pdf'); upsert(made.item, { quiet: true }) }
        content = await pdfContent(id, item)
      } catch (e) {
        if (e && e.status === 0) throw e
        content = { status: 'link', title: item.title, excerpt: 'A PDF document. ' + ((e && e.message) || '') }
      }
    }
    const r = await api.put('/api/items/' + id + '/content', content)
    lib.v = Math.max(lib.v, r.v || 0)
    upsert(r.item, { remote: false })
    return r.item
  })()
  busy.set(id, job)
  job.catch(() => {}).finally(() => { busy.delete(id); emit({ item: id, working: false }) })
  return job
}
export const isWorking = (id) => busy.has(id)

/* ---- Bringing in an export ----------------------------------------------------------------------------- */

export async function importLinks(rows, onProgress) {
  let added = 0
  let skipped = 0
  let i = 0
  while (i < rows.length) {
    const batch = rows.slice(i, i + 60)
    const r = await api.post('/api/import', { items: batch })
    added += r.added
    skipped += r.skipped
    i += Math.max(1, r.done || batch.length)
    if (onProgress) onProgress(i / rows.length, { added, skipped })
  }
  await refresh(true)
  return { added, skipped }
}

/* ---- Feeds ----------------------------------------------------------------------------------------------
   The list of feeds, kept like the library; checking them, a few at a time, whenever the app is
   open (Holm v1 has no schedules); and what you do with what they bring. */

const feedHTML = new Map()
const feedsKey = () => 'shelf:feeds:' + (lib.me && lib.me.id)

export function keptFeeds() {
  if (lib.feeds) return lib.feeds
  try { lib.feeds = JSON.parse(localStorage.getItem(feedsKey()) || 'null') } catch {}
  return lib.feeds
}

export async function loadFeeds() {
  const r = await api.get('/api/feeds')
  lib.feeds = r.feeds
  try { localStorage.setItem(feedsKey(), JSON.stringify(r.feeds)) } catch {}
  emit({ feeds: true })
  return r.feeds
}

function keepFeed(feed) {
  const list = keptFeeds() || []
  const i = list.findIndex((f) => f.id === feed.id)
  if (i >= 0) list[i] = feed
  else list.push(feed)
  lib.feeds = list
  try { localStorage.setItem(feedsKey(), JSON.stringify(list)) } catch {}
}

// Read a feed the server fetched, and send back what's in it.
async function readFeed(feed, parsed = null) {
  const { parseFeed } = await import('./feeds.js')
  let read = parsed
  let etag = ''
  let modified = ''
  if (!read) {
    const r = await api.get('/api/feeds/' + feed.id + '/fetch')
    if (r.ok && r.same) return api.post('/api/feeds/' + feed.id + '/entries', { entries: [] })
    if (!r.ok) {
      if (r.reason === 'cap') return null
      return api.post('/api/feeds/' + feed.id + '/entries', { error: r.reason === 'gone' ? 'The feed isn’t there any more.' : r.reason === 'timeout' ? 'The site took too long to answer.' : r.reason === 'http' ? 'This feed is only on plain http, which Shelf can’t fetch.' : 'The feed couldn’t be fetched.' })
    }
    read = parseFeed(r.body, feed.url)
    etag = r.etag
    modified = r.modified
    if (!read) return api.post('/api/feeds/' + feed.id + '/entries', { error: 'This isn’t a feed Shelf can read any more.' })
  }
  for (const e of read.items) if (e.html) feedHTML.set('pending:' + e.url, e.html)
  const r = await api.post('/api/feeds/' + feed.id + '/entries', {
    title: read.title, site: read.site, icon: read.icon, etag, modified,
    entries: read.items.map((e) => ({ url: e.url, guid: e.guid, title: e.title, author: e.author, published: e.published, excerpt: e.excerpt, image: e.image, video: e.video }))
  })
  for (const item of r.items || []) {
    const html = feedHTML.get('pending:' + item.url)
    if (html) feedHTML.set(item.id, html)
    upsert(item, { quiet: true })
  }
  lib.v = Math.max(lib.v, r.v || 0)
  if (r.feed) keepFeed(r.feed)
  return r
}

let checking = null
let checkedAt = 0
// Look at the feeds that are due, four at a time, until none are.
export function checkFeeds({ force = false } = {}) {
  if (checking) return checking
  if (!force && Date.now() - checkedAt < 4 * 60 * 1000) return Promise.resolve(0)
  if (!navigator.onLine || !lib.me) return Promise.resolve(0)
  checkedAt = Date.now()
  checking = (async () => {
    let added = 0
    emit({ feedsChecking: true })
    for (let round = 0; round < 40; round++) {
      let due
      try { due = await api.post('/api/feeds/due') } catch { break }
      if (!due.feeds.length) break
      const results = await Promise.all(due.feeds.map((f) => readFeed(f).catch(() => null)))
      for (const r of results) if (r && r.added) added += r.added
      if (!due.more) break
    }
    return added
  })()
  checking.finally(() => { checking = null; emit({ feedsChecking: false }) })
  return checking
}
export const isChecking = () => !!checking
setInterval(() => { if (document.visibilityState === 'visible') checkFeeds() }, 15 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkFeeds() })

// Follow what a person typed: a feed's own address, or a site (or YouTube channel) that names
// its feed, or one at the usual places.
export async function follow(raw) {
  const { parseFeed, feedsIn, guesses } = await import('./feeds.js')
  let address = String(raw || '').trim()
  if (!/^https?:\/\//i.test(address)) address = 'https://' + address
  const look = async (url) => { try { const r = await api.get('/api/fetch?url=' + encodeURIComponent(url)); return r.ok ? r : null } catch (e) { if (e.status === 429) throw e; return null } }
  const page = await look(address)
  if (!page) throw new Error('That address couldn’t be reached.')
  let feedURL = address
  let read = parseFeed(page.html, address)
  let later = null
  if (!read) {
    const named = feedsIn(page.html, address)
    for (const url of [...named.slice(0, 3), ...(named.length ? [] : guesses(address).slice(0, 5))]) {
      const r = await look(url)
      const p = r && parseFeed(r.html, url)
      if (p) { read = p; feedURL = url; break }
      // YouTube's feed server turns everyone away for hours at a time; the channel's page still
      // names its feed, so follow it and let the next checks bring the videos.
      if (!later && /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?/.test(url)) later = url
    }
  }
  if (!read && later) {
    const doc = new DOMParser().parseFromString(page.html, 'text/html')
    const name = ((doc.querySelector('meta[property="og:title"]') || {}).content || doc.title || 'YouTube channel').replace(/\s*-\s*YouTube$/, '').trim()
    const r = await api.post('/api/feeds', { url: later, title: name, site: address })
    keepFeed({ ...r.feed, waiting: true })
    emit({ feeds: true })
    return { ...r.feed, waiting: true }
  }
  if (!read) throw new Error('Shelf couldn’t find a feed there. Try the site’s RSS or Atom address.')
  const r = await api.post('/api/feeds', { url: feedURL, title: read.title, site: read.site, icon: read.icon })
  keepFeed(r.feed)
  emit({ feeds: true })
  await readFeed(r.feed, read).catch(() => null)
  emit({ full: true })
  return r.feed
}

export async function followMany(list, onProgress) {
  let added = 0
  for (let i = 0; i < list.length;) {
    const r = await api.post('/api/feeds/import', { feeds: list.slice(i, i + 50) })
    added += r.added
    i += Math.max(1, r.done || 50)
    if (onProgress) onProgress(Math.min(1, i / list.length), added)
  }
  await loadFeeds()
  checkFeeds({ force: true })
  return added
}

export async function unfollow(id) {
  const r = await api.del('/api/feeds/' + id)
  lib.feeds = (keptFeeds() || []).filter((f) => f.id !== id)
  try { localStorage.setItem(feedsKey(), JSON.stringify(lib.feeds)) } catch {}
  for (const i of all()) if (i.feed === id && i.state === 'feed') lib.items.delete(i.id)
  writeCache()
  lib.v = Math.max(lib.v, r.v || 0)
  emit({ full: true, feeds: true })
  return r
}

export async function renameFeed(id, title) {
  const r = await api.patch('/api/feeds/' + id, { title })
  keepFeed(r.feed)
  emit({ feeds: true })
}

// Seen: a few at once from the list, or everything showing.
export async function markSeen(ids) {
  const fresh = ids.filter((id) => { const i = lib.items.get(id); return i && i.state === 'feed' && !i.seen })
  if (!fresh.length) return
  for (const id of fresh) lib.items.set(id, { ...lib.items.get(id), seen: true })
  writeCache()
  emit({ full: true })
  try {
    for (let n = 0; n < fresh.length; n += 500) {
      const r = await api.post('/api/feeds/seen', { ids: fresh.slice(n, n + 500) })
      lib.v = Math.max(lib.v, r.v || 0)
    }
  } catch (e) {
    for (const id of fresh) { const i = lib.items.get(id); if (i) lib.items.set(id, { ...i, seen: false }) }
    emit({ full: true })
    throw e
  }
}

/* ---- Books, PDFs and Markdown from a file ------------------------------------------------------------
   Each is read here in the browser and kept on the server: an EPUB's chapters and pictures, a
   PDF itself with its words for search, a Markdown file as an article. */

const MB = 1024 * 1024

async function putPicture(hash, bytes, type) {
  const r = await fetch('/api/pictures/' + hash, { method: 'PUT', body: bytes, headers: { 'content-type': type, 'x-shelf-page': api.PAGE } })
  if (!r.ok && r.status !== 409) throw new api.ApiError(r.status, 'picture', r.status === 413 ? 'A picture in it is too large.' : 'A picture couldn’t be kept.')
}

async function pdfContent(id, item, bytes = null, onStep = () => {}) {
  const { readPDF } = await import('./pdfview.js')
  if (!bytes) {
    const r = await fetch('/api/items/' + id + '/file')
    if (!r.ok) throw new api.ApiError(r.status, 'no_file', 'The PDF isn’t on the server.')
    bytes = new Uint8Array(await r.arrayBuffer())
  }
  const info = await readPDF(bytes, onStep)
  let cover = ''
  if (info.cover) {
    try {
      const { shaBytes } = await import('./books.js')
      const data = new Uint8Array(await info.cover.arrayBuffer())
      cover = await shaBytes(data)
      await putPicture(cover, data, 'image/jpeg')
    } catch { cover = '' }
  }
  return {
    status: 'ready',
    title: info.title || item.title,
    author: info.author || item.author || '',
    site: item.site || '',
    excerpt: info.excerpt,
    words: info.words,
    pages: info.pages,
    html: info.html || '<p></p>',
    text: info.text,
    cover
  }
}

export function kindOf(file) {
  const name = (file && file.name) || ''
  if (/\.epub$/i.test(name) || file.type === 'application/epub+zip') return 'book'
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') return 'pdf'
  if (/\.(md|markdown|mdown|txt)$/i.test(name) || file.type === 'text/markdown') return 'doc'
  return null
}

export async function uploadFile(file, onStep = () => {}) {
  const kind = kindOf(file)
  if (!kind) throw new Error('Shelf takes EPUB books, PDFs and Markdown files.')
  if (kind === 'pdf' && file.size > 30 * MB) throw new Error('PDFs can be up to 30 MB.')
  if (file.size > 80 * MB) throw new Error('That file is too large.')
  const plainName = file.name.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ').trim()
  let created = null
  try {
    if (kind === 'book') {
      onStep('Reading the book…', 0)
      const { readEPUB } = await import('./books.js')
      const { book, images } = await readEPUB(file, (f) => onStep('Reading the book…', f * 0.45))
      created = (await api.post('/api/uploads', { kind, title: book.title, author: book.author, site: book.site })).item
      const list = Object.entries(images)
      let done = 0
      const next = async () => {
        while (list.length) {
          const [hash, { bytes, type }] = list.shift()
          await putPicture(hash, bytes, type)
          done++
          onStep(`Keeping its pictures… ${done} of ${done + list.length}`, 0.45 + 0.4 * (done / Math.max(1, done + list.length)))
        }
      }
      await Promise.all([next(), next(), next()])
      onStep('Putting it on your shelf…', 0.9)
      const { contents, cover, ...rest } = book
      const r = await api.put('/api/items/' + created.id + '/content', { status: 'ready', ...rest, cover })
      lib.v = Math.max(lib.v, r.v || 0)
      upsert(r.item, { fresh: true })
      return r.item
    }
    if (kind === 'pdf') {
      onStep('Reading the PDF…', 0)
      const bytes = new Uint8Array(await file.arrayBuffer())
      created = (await api.post('/api/uploads', { kind, title: plainName })).item
      onStep('Keeping the file…', 0.1)
      const put = await fetch('/api/items/' + created.id + '/file', { method: 'PUT', body: bytes, headers: { 'content-type': 'application/pdf', 'x-shelf-page': api.PAGE } })
      if (!put.ok) throw new api.ApiError(put.status, 'file', put.status === 413 ? 'That PDF is larger than this server takes.' : (await put.json().catch(() => ({ error: {} }))).error.message || 'The PDF couldn’t be kept.')
      const content = await pdfContent(created.id, created, bytes, (f) => onStep('Reading its words…', 0.3 + f * 0.6))
      const r = await api.put('/api/items/' + created.id + '/content', content)
      lib.v = Math.max(lib.v, r.v || 0)
      upsert(r.item, { fresh: true })
      return r.item
    }
    onStep('Reading the file…', 0.2)
    const { markdown } = await import('./md.js')
    const { sha, plainText, countWords } = await import('./extract.js')
    const doc = markdown(await file.text())
    const box = document.createElement('div')
    box.innerHTML = doc.html
    // Pictures by address are kept on the server like an article's.
    const images = {}
    for (const img of box.querySelectorAll('img[src^="https://"]')) {
      const src = img.getAttribute('src')
      const hash = await sha(src)
      images[hash] = src
      img.setAttribute('data-orig', src)
      img.setAttribute('src', '/i/' + hash)
    }
    const text = plainText(box)
    created = (await api.post('/api/uploads', { kind, title: doc.title || plainName })).item
    const r = await api.put('/api/items/' + created.id + '/content', { status: 'ready', title: doc.title || plainName, html: box.innerHTML || '<p></p>', text, words: countWords(text), excerpt: text.slice(0, 300), images })
    lib.v = Math.max(lib.v, r.v || 0)
    upsert(r.item, { fresh: true })
    return r.item
  } catch (e) {
    if (created) { try { await api.del('/api/items/' + created.id); drop(created.id) } catch {} }
    throw e
  }
}

/* ---- Saved views and changes to many at once ---------------------------------------------------- */

const viewsKey = () => 'shelf:views:' + (lib.me && lib.me.id)
export function keptViews() {
  if (lib.views) return lib.views
  try { lib.views = JSON.parse(localStorage.getItem(viewsKey()) || 'null') } catch {}
  return lib.views || []
}
export async function loadViews() {
  const r = await api.get('/api/views')
  lib.views = r.views
  try { localStorage.setItem(viewsKey(), JSON.stringify(r.views)) } catch {}
  emit({ views: true })
  return r.views
}
export async function saveViews(views) {
  lib.views = views
  emit({ views: true })
  const r = await api.put('/api/views', { views })
  lib.views = r.views
  lib.v = Math.max(lib.v, r.v || 0)
  try { localStorage.setItem(viewsKey(), JSON.stringify(r.views)) } catch {}
  emit({ views: true })
  return r.views
}

// Archive, favourite, tag or delete many: changed here at once, then on the server in batches.
export async function bulk(ids, changes) {
  const before = new Map(ids.map((id) => [id, lib.items.get(id)]).filter(([, i]) => i))
  for (const [id, i] of before) {
    if (changes.delete) { lib.items.delete(id); continue }
    const next = { ...i }
    if (changes.state) { next.state = changes.state; if (changes.state === 'archived') next.read = Date.now() }
    if (typeof changes.fav === 'boolean') next.fav = changes.fav
    if (changes.addTags) next.tags = [...new Set([...(i.tags || []), ...changes.addTags])]
    lib.items.set(id, next)
  }
  writeCache()
  emit({ full: true })
  try {
    const list = [...before.keys()]
    for (let n = 0; n < list.length;) {
      const r = await api.post('/api/items/bulk', { ids: list.slice(n, n + 100), ...changes })
      n += Math.max(1, r.done || 100)
      lib.v = Math.max(lib.v, r.v || 0)
    }
  } catch (e) {
    for (const [id, i] of before) lib.items.set(id, i)
    writeCache()
    emit({ full: true })
    throw e
  }
  await refresh(true)
}
