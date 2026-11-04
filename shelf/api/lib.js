// What every part of Shelf's server shares: who is asking, where their things are kept, how a
// link is tidied before it's saved, and how a change reaches their other devices.
//
// Everything a person saves lives in shared storage under collections named for them, so a
// list, a search or a delete only ever sees their own: items.<key> (one per saved link),
// text.<key> (the article's words, for search) and marks.<key> (highlights). The article
// itself, cleaned in the browser, is a file at c/<key>/<id>.

export const LIMIT = 5000 // links one person can keep
export const PAGE = 500

export function who(env) {
  const member = env.holm.auth.getMember()
  return member ? { member, k: key(member.id) } : null
}

export const key = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
export const ITEMS = (k) => 'items.' + k
export const TEXT = (k) => 'text.' + k
export const MARKS = (k) => 'marks.' + k
export const FEEDS = (k) => 'feeds.' + k

export class Fail extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
    this.public = true
  }
}
export const fail = (status, code, message) => { throw new Fail(status, code, message) }

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }
})
export const err = (status, code, message) => json({ error: { code, message } }, status)

export async function readJSON(request, max = 2_000_000) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > max) fail(413, 'too_large', 'That’s more than Shelf takes in one go.')
  try { return await request.json() } catch { fail(400, 'bad_json', 'The request wasn’t valid JSON.') }
}

export const clip = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')

/* ---- Links -------------------------------------------------------------------------------- */

// Query parameters that only say where a click came from.
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|mkt_tok|ref_src|ref_url|cmpid|ncid|s_cid|spm|oly_[a-z_]+|vero_[a-z_]+|__s|guccounter|guce_referrer|guce_referrer_sig)$/i

// An https address with the tracking taken off, or null when it can't be saved.
export function cleanURL(raw) {
  let text = String(raw || '').trim()
  if (/^http:\/\//i.test(text)) text = 'https://' + text.slice(7)
  let url
  try { url = new URL(text) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || /\.(local|localhost|internal|test)$/.test(host)) return null
  // The runtime's URL can't be changed in place, so the address is put back together by hand.
  const keep = []
  for (const part of url.search.replace(/^\?/, '').split('&')) {
    if (!part) continue
    const name = decodeSafe(part.split('=')[0])
    if (!TRACKING.test(name)) keep.push(part)
  }
  const hash = /^#!?\//.test(url.hash) ? url.hash : ''
  const out = 'https://' + host + (url.port && url.port !== '443' ? ':' + url.port : '') + (url.pathname || '/') + (keep.length ? '?' + keep.join('&') : '') + hash
  return out.length > 2000 ? null : out
}

const decodeSafe = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s } }

// The same page however it was linked: no www, no trailing slash, no fragment.
export function canonical(url) {
  const u = new URL(url)
  return u.hostname.toLowerCase().replace(/^www\./, '') + (u.pathname.replace(/\/+$/, '') || '/') + u.search
}

export const host = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }

export async function sha(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', typeof text === 'string' ? new TextEncoder().encode(text) : text))
  let out = ''
  for (let i = 0; i < 16; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16)
  return out
}

/* ---- Items ---------------------------------------------------------------------------------- */

// What the page and Claude see of a saved link.
export function itemDTO(doc) {
  return {
    id: doc.id,
    kind: doc.kind || 'article',
    url: doc.url || '',
    title: doc.title || '',
    site: doc.site || '',
    host: doc.host || (doc.url ? host(doc.url) : ''),
    author: doc.author || '',
    excerpt: doc.excerpt || '',
    image: doc.img ? '/i/' + doc.img : null,
    lang: doc.lang || '',
    dir: doc.dir || '',
    words: doc.words || 0,
    published: doc.published || '',
    status: doc.status || 'pending',
    state: doc.state || 'unread',
    fav: !!doc.fav,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    progress: doc.progress || 0,
    saved: doc.saved || doc._createdAt,
    read: doc.read || 0,
    opened: doc.opened || 0,
    cv: doc.cv || 0,
    marks: doc.marks || 0,
    via: doc.via || 'app',
    note: doc.note || '',
    summary: Array.isArray(doc.summary) ? doc.summary : null,
    error: doc.error || '',
    source: doc.source || '',
    feed: doc.feed || '',
    seen: !!doc.seen,
    video: doc.video || '',
    pages: doc.pages || 0,
    freq: doc.freq || 'normal'
  }
}

// What the page and Claude see of a highlight. Imported ones have a place in the book (loc)
// in place of a place in the text (start, end).
export function markDTO(m) {
  return {
    id: m.id, item: m.item, quote: m.quote, prefix: m.prefix || '', suffix: m.suffix || '', start: m.start || 0, end: m.end || 0,
    note: m.note || '', at: m.at || m._createdAt, share: m.share || '', loc: m.loc || '', tags: Array.isArray(m.tags) ? m.tags : [],
    fav: !!m.fav, skip: !!m.skip, due: m.due || 0
  }
}

export const minutes = (words) => Math.max(1, Math.round((words || 0) / 230))

export function getItem(env, k, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null
  return env.holm.app.ds.findOne(ITEMS(k), id)
}

export function allItems(env, k) {
  const { ds } = env.holm.app
  const out = []
  let cursor = null
  do {
    const page = ds.find(ITEMS(k), {}, { limit: PAGE, order: 'desc', page: true, ...(cursor ? { cursor } : {}) })
    for (const row of page.rows) out.push(row)
    cursor = page.cursor
  } while (cursor && out.length < LIMIT)
  return out
}

const urlKey = (k, c) => 'u:' + k + ':' + c.slice(0, 900)

export function findByURL(env, k, url) {
  const id = env.holm.app.kv.get(urlKey(k, canonical(url)))
  if (!id) return null
  const doc = getItem(env, k, id)
  return doc && doc.url ? doc : null
}

export function cleanTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  for (const t of tags) {
    const tag = String(t || '').toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-').slice(0, 32)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= 12) break
  }
  return out
}

// Save a link, or find it already saved (then it comes back to the top of the list, unread).
export function saveLink(env, k, { url, title = '', note = '', tags = [], via = 'app', saved = 0, state = 'unread', fav = false }) {
  const clean = cleanURL(url)
  if (!clean) fail(400, 'bad_url', 'That isn’t a web address Shelf can save. Use a full https:// link.')
  const { ds, kv } = env.holm.app
  const found = findByURL(env, k, clean)
  if (found) {
    if (via === 'import') return { doc: found, existing: true }
    const set = { state: 'unread', saved: Date.now() }
    if (note) set.note = clip(note, 2000)
    if (tags.length) set.tags = cleanTags([...(found.tags || []), ...tags])
    ds.update(ITEMS(k), { id: found.id }, { $set: set })
    return { doc: { ...found, ...set }, existing: true }
  }
  if (ds.count(ITEMS(k), {}) >= LIMIT) fail(409, 'full', `Your shelf holds ${LIMIT} links. Delete some from the Archive to save more.`)
  const doc = {
    url: clean,
    host: host(clean),
    title: clip(title, 300),
    site: '',
    status: 'pending',
    state: state === 'archived' ? 'archived' : 'unread',
    fav: !!fav,
    tags: cleanTags(tags),
    progress: 0,
    saved: saved && saved > 0 && saved < Date.now() + 864e5 ? Math.round(saved) : Date.now(),
    read: state === 'archived' ? (saved || Date.now()) : 0,
    cv: 0,
    marks: 0,
    via,
    note: clip(note, 2000)
  }
  const id = ds.insert(ITEMS(k), doc)
  kv.set(urlKey(k, canonical(clean)), id)
  return { doc: { ...doc, id }, existing: false }
}

// A book, a PDF or a source of imported highlights: something on the shelf without a web
// address of its own.
export function saveThing(env, k, { kind = 'book', title = '', author = '', site = '', source = 'upload', state = 'unread', saved = 0, tags = [], status = 'pending' }) {
  const { ds } = env.holm.app
  if (ds.count(ITEMS(k), {}) >= LIMIT) fail(409, 'full', `Your shelf holds ${LIMIT} things. Delete some from the Archive to make room.`)
  const doc = {
    kind: ['book', 'pdf', 'notes', 'doc'].includes(kind) ? kind : 'book',
    url: '',
    host: '',
    title: clip(title, 300) || 'Untitled',
    author: clip(author, 120),
    site: clip(site, 80),
    status,
    state: state === 'archived' ? 'archived' : 'unread',
    fav: false,
    tags: cleanTags(tags),
    progress: 0,
    saved: saved && saved > 0 && saved < Date.now() + 864e5 ? Math.round(saved) : Date.now(),
    read: state === 'archived' ? (saved || Date.now()) : 0,
    cv: 0,
    marks: 0,
    via: source === 'upload' ? 'app' : 'import',
    source: clip(source, 20),
    note: ''
  }
  const id = ds.insert(ITEMS(k), doc)
  // Found by its title and author in search, before it has any words of its own.
  try { ds.insert(TEXT(k), { item: id, title: doc.title, site: '', author: doc.author, text: '' }) } catch {}
  return { ...doc, id }
}

export function forgetURL(env, k, url) {
  if (!url) return
  try { env.holm.app.kv.delete(urlKey(k, canonical(url))) } catch {}
}

/* ---- Telling the other devices ------------------------------------------------------------- */

// Each person has a channel with a name nobody can guess; the page learns it from /api/me.
export function channel(env, k, create = true) {
  const { kv } = env.holm.app
  let name = kv.get('chan:' + k)
  if (!name && create) {
    name = 's-' + crypto.randomUUID().replace(/-/g, '')
    kv.set('chan:' + k, name)
  }
  return name
}

export const version = (env, k) => Number(env.holm.app.kv.get('v:' + k)) || 0

// Every change to someone's shelf moves its version on, so a page that kept an old copy knows
// to ask again, and open pages hear about it at once. `from` is the page that made the change.
export function bump(env, k, message = {}, from = '') {
  const v = env.holm.app.kv.increment('v:' + k)
  try {
    const name = channel(env, k, false)
    if (name) env.holm.realtime.broadcast(name, { type: 'changed', v, from, ...message })
  } catch {}
  return v
}

/* ---- Where the app lives ----------------------------------------------------------------------- */

// The address people open, remembered from the page so Claude's answers can link back to it.
export const origin = (env) => env.holm.app.kv.get('site:origin') || ''
