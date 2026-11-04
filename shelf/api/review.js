// The daily review: a few highlights a day, chosen so that every source gets its turn,
// favourites come back more often and what you've just seen waits a while.
//
//   GET    /api/review?day=&tag=&item=   today's highlights (or a review of one tag or source)
//   POST   /api/review/:mark              keep, sooner, later or discard one
//   PATCH  /api/review                    how many a day
//
// Each highlight carries `due` (when it may come back) and `ivl` (days until then last time).
// Keeping one roughly doubles its wait, "less often" quadruples it, "more often" brings it
// back in four days, and discard keeps it out of reviews (the highlight itself stays).

import { json, err, readJSON, MARKS, getItem, host, markDTO } from './lib.js'

const DAY = 864e5
const SIZES = [3, 5, 10, 15]
const FREQ = { never: 0, less: 0.35, normal: 1, more: 2.5 }

const today = (raw) => (/^\d{4}-\d{2}-\d{2}$/.test(String(raw || '')) ? raw : new Date().toISOString().slice(0, 10))
const yesterday = (day) => new Date(Date.parse(day + 'T12:00:00Z') - DAY).toISOString().slice(0, 10)

export function source(doc) {
  return { id: doc.id, kind: doc.kind || 'article', title: doc.title || doc.host || (doc.url ? host(doc.url) : '') || 'Untitled', author: doc.author || '', site: doc.site || '', host: doc.host || (doc.url ? host(doc.url) : ''), url: doc.url || '', image: doc.img ? '/i/' + doc.img : null, freq: doc.freq || 'normal' }
}

export function review(request, env, url, { k }) {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const { ds, kv } = env.holm.app

  if (path === '/api/review' && method === 'GET') {
    // Highlights made before reviews existed get a due date first, a couple of seconds at a time.
    if (!kv.get('rvinit:' + k)) {
      const started = Date.now()
      let cursor = kv.get('rvinit:c:' + k) || null
      do {
        const page = ds.find(MARKS(k), {}, { limit: 200, order: 'asc', page: true, ...(cursor ? { cursor } : {}) })
        for (const m of page.rows) if (typeof m.due !== 'number') ds.update(MARKS(k), { id: m.id }, { $set: { due: 0 } })
        cursor = page.cursor
      } while (cursor && Date.now() - started < 1800)
      if (cursor) { kv.set('rvinit:c:' + k, cursor); return json({ preparing: true }) }
      kv.set('rvinit:' + k, 1)
      kv.delete('rvinit:c:' + k)
    }

    const day = today(url.searchParams.get('day'))
    const tag = String(url.searchParams.get('tag') || '').slice(0, 40)
    const item = String(url.searchParams.get('item') || '').slice(0, 64)
    const n = Number(kv.get('rvn:' + k)) || 5
    const sources = new Map()
    const itemOf = (id) => {
      if (!sources.has(id)) { const doc = getItem(env, k, id); sources.set(id, doc ? source(doc) : null) }
      return sources.get(id)
    }
    const card = (m) => { const s = itemOf(m.item); return s ? { mark: markDTO(m), item: s } : null }

    // A review of one tag or one source: everything in it, the ones waiting longest first.
    if (tag || item) {
      let pool = item ? ds.find(MARKS(k), { item }, { limit: 2000 }) : []
      if (tag) {
        try { pool = ds.find(MARKS(k), { tags: { $contains: tag } }, { limit: 2000 }) } catch { pool = [] }
        pool = pool.filter((m) => Array.isArray(m.tags) && m.tags.includes(tag))
      }
      pool = pool.filter((m) => !m.skip && m.quote).sort((a, b) => (a.due || 0) - (b.due || 0))
      const cards = shuffle(pool.slice(0, 60), day).slice(0, Math.max(n, 10)).map(card).filter(Boolean)
      return json({ day, n, themed: true, cards, done: [], streak: streak(kv, k, day) })
    }

    // Today's set is drawn once and kept, so every device shows the same highlights. A set that
    // came up short (few highlights were due) is topped up when more arrive, by an import say.
    let set = kv.get('rv:' + k + ':' + day)
    if (!set || (set.ids.length < n && !kv.get('rvtop:' + k + ':' + day))) {
      const now = Date.now()
      const have = new Set(set ? set.ids : [])
      const seen = new Set()
      const pool = []
      for (const order of ['asc', 'desc']) {
        for (const m of ds.find(MARKS(k), { due: { $lte: now } }, { limit: 250, order })) {
          if (seen.has(m.id) || have.has(m.id) || m.skip || !m.quote) continue
          seen.add(m.id)
          pool.push(m)
        }
      }
      const usedItems = new Set()
      for (const id of have) { const m = ds.findOne(MARKS(k), id); if (m) usedItems.add(m.item) }
      const more = pick(pool, n - have.size, day, (id) => itemOf(id), now, usedItems).map((m) => m.id)
      // Flashcards that are due join a new day's review, after the highlights, a few at a time.
      const cards = set ? [] : ds.find(MARKS(k), { cardDue: { $lte: now } }, { limit: 30, order: 'asc' })
        .filter((m) => m.card && !m.skip && !more.includes(m.id) && itemOf(m.item)).sort((a, b) => (a.cardDue || 0) - (b.cardDue || 0)).slice(0, 4).map((m) => m.id)
      set = { ids: [...(set ? set.ids : []), ...more, ...cards], done: set ? set.done : [] }
      kv.set('rv:' + k + ':' + day, set, 3 * DAY)
      // Look again at most every ten minutes.
      if (set.ids.length < n) kv.set('rvtop:' + k + ':' + day, 1, 10 * 60 * 1000)
    }
    const cards = []
    for (const id of set.ids) {
      const m = ds.findOne(MARKS(k), id)
      const c = m && card(m)
      if (c) cards.push(c)
    }
    let due = 0
    try { due = ds.count(MARKS(k), { due: { $lte: Date.now() } }) } catch {}
    return json({ day, n, cards, done: set.done.filter((id) => set.ids.includes(id)), streak: streak(kv, k, day), due })
  }

  if (path === '/api/review' && method === 'PATCH') {
    return readJSON(request, 2000).then((input) => {
      const n = SIZES.includes(Number(input.n)) ? Number(input.n) : 5
      kv.set('rvn:' + k, n)
      // Today's set grows or shrinks with it.
      const day = today(input.day)
      kv.delete('rv:' + k + ':' + day)
      return json({ n })
    })
  }

  const m = /^\/api\/review\/([A-Za-z0-9_-]+)$/.exec(path)
  if (m && method === 'POST') {
    return readJSON(request, 2000).then((input) => {
      const mark = ds.findOne(MARKS(k), m[1])
      if (!mark) return err(404, 'not_found', 'That highlight is gone.')
      const day = today(input.day)
      const now = Date.now()
      const ivl = Number(mark.ivl) || 0
      const set = {}
      if (input.action === 'keep') { set.ivl = ivl ? Math.min(365, Math.round(ivl * 2.2)) : 14; set.due = now + set.ivl * DAY }
      else if (input.action === 'later') { set.ivl = ivl ? Math.min(730, ivl * 4) : 60; set.due = now + set.ivl * DAY }
      else if (input.action === 'sooner') { set.ivl = 4; set.due = now + 4 * DAY }
      else if (input.action === 'discard') { set.skip = true }
      else if (input.action === 'restore') { set.skip = false; set.due = now }
      // A flashcard: remembered, it waits longer each time; missed, it comes back tomorrow.
      else if (input.action === 'got' && mark.card) { const c = Number(mark.cardIvl) || 0; set.cardIvl = c ? Math.min(365, Math.round(c * 2.5)) : 3; set.cardDue = now + set.cardIvl * DAY }
      else if (input.action === 'missed' && mark.card) { set.cardIvl = 1; set.cardDue = now + DAY }
      else return err(400, 'bad_action', 'That isn’t something a review can do.')
      ds.update(MARKS(k), { id: mark.id }, { $set: set })
      const key = 'rv:' + k + ':' + day
      const today_ = kv.get(key)
      let s = streak(kv, k, day)
      if (today_ && today_.ids.includes(mark.id) && input.action !== 'restore') {
        if (!today_.done.includes(mark.id)) today_.done.push(mark.id)
        kv.set(key, today_, 3 * DAY)
        // The streak counts days whose review was finished.
        if (today_.done.length >= today_.ids.length && !s.today) {
          const kept = kv.get('streak:' + k) || { n: 0, last: '' }
          const next = { n: kept.last === yesterday(day) ? kept.n + 1 : 1, last: day, best: Math.max(kept.best || 0, kept.last === yesterday(day) ? kept.n + 1 : 1) }
          kv.set('streak:' + k, next)
          s = streak(kv, k, day)
        }
      }
      return json({ mark: markDTO({ ...mark, ...set }), streak: s })
    })
  }

  return err(404, 'not_found', 'There’s nothing at that address.')
}

function streak(kv, k, day) {
  const s = kv.get('streak:' + k) || { n: 0, last: '' }
  const alive = s.last === day || s.last === yesterday(day)
  return { n: alive ? s.n : 0, today: s.last === day, best: s.best || s.n || 0 }
}

// A seeded random number, so the same day draws the same way.
function rng(seed) {
  let x = 2166136261
  for (const ch of seed) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 }
}

function shuffle(list, seed) {
  const r = rng(seed)
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}

// Draw n highlights: weighted by favourite, by how often its source should come up and by how
// long it has waited, and at most one per source until every source has had a turn.
export function pick(pool, n, day, sourceOf, now, used = new Set()) {
  const r = rng(day)
  const weighted = []
  for (const m of pool) {
    const s = sourceOf(m.item)
    if (!s) continue
    const w = (FREQ[s.freq] ?? 1) * (m.fav ? 2 : 1) * (1 + Math.min(2, Math.max(0, now - (m.due || 0)) / (60 * DAY)))
    if (w > 0) weighted.push({ m, key: Math.pow(r(), 1 / w) })
  }
  weighted.sort((a, b) => b.key - a.key)
  const out = []
  for (const x of weighted) { if (out.length >= n) break; if (!used.has(x.m.item)) { out.push(x.m); used.add(x.m.item) } }
  for (const x of weighted) { if (out.length >= n) break; if (!out.includes(x.m)) out.push(x.m) }
  return out
}
