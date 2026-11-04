// Feeds: sites, newsletters with a feed and YouTube channels you follow. The server keeps the
// list and fetches each feed when asked; the browser reads it (RSS, Atom, JSON Feed) and sends
// back the entries, which become items on the shelf in the Feed (state "feed") until you save
// them to the reading list. Holm v1 has no schedules, so feeds are checked whenever Shelf is
// open on one of your devices.
//
//   GET    /api/feeds                   the feeds you follow
//   POST   /api/feeds                   follow one (the page found and read it first)
//   POST   /api/feeds/import            follow many (an OPML file)
//   PATCH  /api/feeds/:id               rename one
//   DELETE /api/feeds/:id               unfollow, and drop what it brought that you didn't save
//   POST   /api/feeds/due               the few feeds due a look, set aside for this page
//   GET    /api/feeds/:id/fetch         the feed itself, unless it hasn't changed
//   POST   /api/feeds/:id/entries       what the page read in it
//   POST   /api/feeds/seen              mark entries seen

import { json, err, readJSON, ITEMS, FEEDS, itemDTO, getItem, cleanURL, canonical, host, bump, version, sha, clip, LIMIT } from './lib.js'

const MAX_FEEDS = 300
const EVERY = 30 * 60 * 1000 // a feed is looked at most every half hour
const FEED_ITEMS = 1500 // entries waiting in the Feed, at most
const KEEP_SEEN = 21 * 864e5 // seen entries go after three weeks
const FETCH_CAP = 4000 // feed fetches per person per day
const UA = 'Mozilla/5.0 (compatible; Shelf/0.4; feed reader on a Holm server; +https://holmhq.com)'

export function feedDTO(f) {
  return { id: f.id, url: f.url, title: f.title || '', site: f.site || '', icon: f.icon || '', folder: f.folder || '', added: f.added || f._createdAt, checked: f.checked || 0, error: f.error || '', fails: f.fails || 0 }
}

const feedKey = (k, url) => 'feed:' + k + ':' + canonical(url.replace(/^http:/, 'https:')).slice(0, 900)

export async function feeds(request, env, url, { k }, from) {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const { ds, kv } = env.holm.app

  if (path === '/api/feeds' && method === 'GET') {
    return json({ feeds: ds.find(FEEDS(k), {}, { limit: MAX_FEEDS, order: 'asc' }).map(feedDTO) })
  }

  if (path === '/api/feeds' && method === 'POST') {
    const input = await readJSON(request, 20_000)
    const feed = follow(env, k, input)
    if (!feed) return err(400, 'bad_url', 'That isn’t a feed address Shelf can follow.')
    const v = bump(env, k, { feeds: true }, from)
    return json({ feed: feedDTO(feed), v }, 201)
  }

  if (path === '/api/feeds/import' && method === 'POST') {
    const input = await readJSON(request, 400_000)
    const list = Array.isArray(input.feeds) ? input.feeds.slice(0, MAX_FEEDS) : []
    let added = 0
    const started = Date.now()
    let done = 0
    for (const f of list) {
      if (Date.now() - started > 2400) break
      done++
      const before = ds.count(FEEDS(k), {})
      if (follow(env, k, f) && ds.count(FEEDS(k), {}) > before) added++
    }
    const v = added ? bump(env, k, { feeds: true }, from) : version(env, k)
    return json({ added, done, v })
  }

  if (path === '/api/feeds/due' && method === 'POST') {
    const now = Date.now()
    const due = ds.find(FEEDS(k), { next: { $lte: now } }, { limit: 4, order: 'asc' })
    for (const f of due) ds.update(FEEDS(k), { id: f.id }, { $set: { next: now + 3 * 60 * 1000 } })
    tidy(env, k)
    return json({ feeds: due.map(feedDTO), more: due.length === 4 })
  }

  if (path === '/api/feeds/seen' && method === 'POST') {
    const input = await readJSON(request, 200_000)
    const ids = Array.isArray(input.ids) ? input.ids.slice(0, 500) : []
    let n = 0
    for (const id of ids) {
      const doc = getItem(env, k, id)
      if (doc && doc.state === 'feed' && !doc.seen) { ds.update(ITEMS(k), { id }, { $set: { seen: true } }); n++ }
    }
    const v = n ? bump(env, k, { full: true }, from) : version(env, k)
    return json({ seen: n, v })
  }

  const m = /^\/api\/feeds\/([A-Za-z0-9_-]+)(\/fetch|\/entries)?$/.exec(path)
  if (!m) return err(404, 'not_found', 'There’s nothing at that address.')
  const feed = ds.findOne(FEEDS(k), m[1])
  if (!feed) return err(404, 'not_found', 'You don’t follow that feed any more.')
  const part = m[2] || ''

  if (part === '' && method === 'PATCH') {
    const input = await readJSON(request, 4000)
    const set = {}
    if (typeof input.title === 'string' && input.title.trim()) { set.title = clip(input.title, 120); set.renamed = true }
    if (typeof input.folder === 'string') set.folder = clip(input.folder, 60)
    ds.update(FEEDS(k), { id: feed.id }, { $set: set })
    const v = bump(env, k, { feeds: true }, from)
    return json({ feed: feedDTO({ ...feed, ...set }), v })
  }

  if (part === '' && method === 'DELETE') {
    ds.delete(FEEDS(k), { id: feed.id })
    try { kv.delete(feedKey(k, feed.url)) } catch {}
    // What it brought and you didn't save goes with it.
    let gone = 0
    for (const doc of ds.find(ITEMS(k), { feed: feed.id, state: 'feed' }, { limit: 2000 })) {
      ds.delete(ITEMS(k), { id: doc.id })
      try { kv.delete('u:' + k + ':' + canonical(doc.url).slice(0, 900)) } catch {}
      gone++
    }
    const v = bump(env, k, { full: true, feeds: true }, from)
    return json({ ok: true, gone, v })
  }

  if (part === '/fetch' && method === 'GET') {
    const day = 'ff:' + k + ':' + new Date().toISOString().slice(0, 10)
    if ((Number(kv.get(day)) || 0) >= FETCH_CAP) return json({ ok: false, reason: 'cap' })
    kv.increment(day)
    let response
    // Holm fetches over https only; a feed saved with an http address is tried over https.
    const plain = /^http:/.test(feed.url)
    try {
      response = env.holm.net.fetch(feed.url.replace(/^http:/, 'https:'), {
        timeout: 6000,
        headers: {
          'user-agent': UA,
          accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.5',
          ...(feed.etag ? { 'if-none-match': feed.etag } : {}),
          ...(feed.modified ? { 'if-modified-since': feed.modified } : {})
        }
      })
    } catch (error) {
      const text = String(error && (error.message || error) || '')
      return json({ ok: false, reason: plain ? 'http' : /timeout|deadline/i.test(text) ? 'timeout' : 'unreachable' })
    }
    if (response.status === 304) return json({ ok: true, same: true })
    if (!response.ok) return json({ ok: false, status: response.status, reason: response.status === 404 || response.status === 410 ? 'gone' : 'error' })
    const headers = response.headers || {}
    let body = response.text()
    if (body.length > 4_000_000) body = body.slice(0, 4_000_000)
    return json({ ok: true, body, etag: String(headers.etag || '').slice(0, 200), modified: String(headers['last-modified'] || '').slice(0, 100), type: String(headers['content-type'] || '').split(';')[0] })
  }

  if (part === '/entries' && method === 'POST') {
    const input = await readJSON(request, 1_500_000)
    const now = Date.now()
    const set = { checked: now, next: now + EVERY + Math.round(Math.random() * 5 * 60 * 1000) }
    if (input.error) {
      // A feed that keeps failing is looked at less and less often, up to once a day.
      const fails = (feed.fails || 0) + 1
      Object.assign(set, { error: clip(input.error, 160), fails, next: now + Math.min(24 * 3600 * 1000, EVERY * Math.pow(2, fails)) })
      ds.update(FEEDS(k), { id: feed.id }, { $set: set })
      return json({ added: 0, v: version(env, k) })
    }
    set.error = ''
    set.fails = 0
    if (typeof input.title === 'string' && input.title.trim() && !feed.renamed) set.title = clip(input.title, 120)
    if (typeof input.site === 'string' && /^https?:\/\//.test(input.site)) set.site = input.site.slice(0, 500)
    if (typeof input.icon === 'string' && /^https:\/\//.test(input.icon)) set.icon = input.icon.slice(0, 500)
    if (typeof input.etag === 'string') set.etag = input.etag.slice(0, 200)
    if (typeof input.modified === 'string') set.modified = input.modified.slice(0, 100)
    const entries = Array.isArray(input.entries) ? input.entries.slice(0, 60) : []
    const waiting = ds.count(ITEMS(k), { state: 'feed' })
    const total = ds.count(ITEMS(k), {})
    // The first look at a feed brings its newest few, not its whole history.
    const first = !feed.checked
    const fresh = []
    const started = Date.now()
    for (const e of entries.sort((a, b) => (Number(b.published) || 0) - (Number(a.published) || 0))) {
      if (Date.now() - started > 2000) break
      if (first && fresh.length >= 8) break
      if (waiting + fresh.length >= FEED_ITEMS || total + fresh.length >= LIMIT) break
      const link = cleanURL(e && e.url)
      if (!link) continue
      const key = 'fe:' + k + ':' + feed.id + ':' + (await sha(String(e.guid || link)))
      if (kv.get(key)) continue
      kv.set(key, 1, 400 * 864e5)
      // Already on the shelf (saved by hand, or from another feed): leave it be.
      if (kv.get('u:' + k + ':' + canonical(link).slice(0, 900))) continue
      const published = Number(e.published) > 0 && Number(e.published) < now + 864e5 ? Math.round(Number(e.published)) : now
      if (now - published > 60 * 864e5) continue
      const img = typeof e.image === 'string' && /^https:\/\//.test(e.image) && e.image.length < 2000 ? await sha(e.image) : ''
      if (img && !kv.get('img:' + img)) kv.set('img:' + img, e.image)
      const doc = {
        url: link,
        host: host(link),
        title: clip(e.title, 300),
        author: clip(e.author, 120),
        site: clip(set.title || feed.title, 80),
        excerpt: clip(e.excerpt, 400),
        img,
        status: 'pending',
        state: 'feed',
        seen: false,
        feed: feed.id,
        video: /^[A-Za-z0-9_-]{6,20}$/.test(e.video || '') ? e.video : '',
        fav: false,
        tags: [],
        progress: 0,
        saved: published,
        read: 0,
        cv: 0,
        marks: 0,
        via: 'feed',
        note: ''
      }
      const id = ds.insert(ITEMS(k), doc)
      kv.set('u:' + k + ':' + canonical(link).slice(0, 900), id)
      fresh.push(itemDTO({ ...doc, id }))
    }
    ds.update(FEEDS(k), { id: feed.id }, { $set: set })
    const v = fresh.length ? bump(env, k, { full: true }, from) : version(env, k)
    return json({ added: fresh.length, items: fresh, feed: feedDTO({ ...feed, ...set }), v })
  }

  return err(404, 'not_found', 'There’s nothing at that address.')
}

// Feeds keep their own address, plain http included: many older blogs never moved, and what
// comes back is read in the browser and cleaned like anything else.
function feedURL(raw) {
  const text = String(raw || '').trim()
  if (/^http:\/\//i.test(text)) {
    const https = cleanURL('https://' + text.slice(7))
    return https ? 'http://' + https.slice(8) : null
  }
  return cleanURL(text)
}

function follow(env, k, input) {
  const { ds, kv } = env.holm.app
  const link = feedURL(input && input.url)
  if (!link) return null
  const known = kv.get(feedKey(k, link))
  if (known) { const f = ds.findOne(FEEDS(k), known); if (f) return f }
  if (ds.count(FEEDS(k), {}) >= MAX_FEEDS) return null
  const doc = {
    url: link,
    title: clip(input.title, 120) || host(link),
    site: typeof input.site === 'string' && /^https?:\/\//.test(input.site) ? input.site.slice(0, 500) : '',
    icon: typeof input.icon === 'string' && /^https:\/\//.test(input.icon) ? input.icon.slice(0, 500) : '',
    folder: clip(input.folder, 60),
    added: Date.now(),
    checked: 0,
    next: 0,
    fails: 0
  }
  const id = ds.insert(FEEDS(k), doc)
  kv.set(feedKey(k, link), id)
  return { ...doc, id }
}

// Seen entries older than three weeks go, a hundred at a time, so the Feed doesn't fill the shelf.
function tidy(env, k) {
  const { ds, kv } = env.holm.app
  if (kv.get('ftidy:' + k)) return
  kv.set('ftidy:' + k, 1, 6 * 3600 * 1000)
  const old = Date.now() - KEEP_SEEN
  let gone = 0
  for (const doc of ds.find(ITEMS(k), { state: 'feed', seen: true, saved: { $lt: old } }, { limit: 100 })) {
    ds.delete(ITEMS(k), { id: doc.id })
    try { kv.delete('u:' + k + ':' + canonical(doc.url).slice(0, 900)) } catch {}
    gone++
  }
  if (gone) bump(env, k, { full: true })
}
