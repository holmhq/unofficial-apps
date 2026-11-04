// Shelf's JSON API for its own pages. Every route but /api/me needs someone signed in, and
// only ever reads or changes that person's shelf.
//
//   GET    /api/me                     who's here, their channel, where Claude connects
//   GET    /api/library?v=             every saved link (or "same" when v is current)
//   POST   /api/items                  save a link
//   POST   /api/import                 save many links at once (a Pocket or Instapaper export)
//   GET    /api/fetch?url=             the page at an address, for the browser to make readable
//   PUT    /api/items/:id/content      the readable article, cleaned in the browser
//   GET    /api/items/:id/content      that article again
//   PATCH  /api/items/:id              archive, favourite, tags, progress, note
//   DELETE /api/items/:id              forget it, highlights and all
//   POST   /api/items/:id/summary      a short summary from the node's AI, kept with the item
//   GET    /api/items/:id/marks        its highlights
//   POST   /api/items/:id/marks        highlight a passage
//   PATCH  /api/marks/:id              change a highlight's note
//   DELETE /api/marks/:id              remove a highlight
//   GET    /api/highlights             every highlight, newest first
//   GET    /api/search?q=              words in titles, articles and highlights
//   POST   /api/marks/:id/share        a public link to a highlight (/q/<slug>)
//   DELETE /api/marks/:id/share        stop sharing it
//   PUT    /api/q/:slug/card           the link's preview picture, drawn in the browser
//   GET    /api/q/:slug                a shared highlight, for anyone with the link
//   /api/review…, /api/feeds…, /api/uploads, /api/pictures/…, /api/import/highlights,
//   /api/ask, /api/lookup, /api/items/:id/ask   in review.js, feeds.js, uploads.js and ask.js
//   GET    /q/:slug                    its page, with its own title and picture for previews

import {
  who, fail, Fail, ITEMS, TEXT, MARKS, itemDTO, markDTO, getItem, allItems, saveLink, forgetURL, cleanTags, bump, channel,
  version, sha, minutes, host, LIMIT
} from './lib.js'
export { markDTO }

const MAX_HTML = 1_500_000
const MAX_BOOK = 9_000_000 // a book's chapters in one page
const BIG = ['book', 'pdf', 'doc']
const MAX_TEXT = 400_000
const FETCH_CAP = 600 // pages fetched per person per day
const AI_CAP = 60 // summaries per person per day
const AI_NODE_CAP = 2000
const UA = 'Mozilla/5.0 (compatible; Shelf/0.1; read-later on a Holm server; +https://holmhq.com)'

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }
})
const err = (status, code, message) => json({ error: { code, message } }, status)

export async function handle(request, env, url) {
  try {
    return await route(request, env, url)
  } catch (error) {
    if (error instanceof Fail || (error && error.public)) return err(error.status, error.code, error.message)
    console.error('shelf: ' + request.method + ' ' + url.pathname + ' failed: ' + String(error && (error.stack || error.message) || error).slice(0, 600))
    return err(500, 'error', 'Something went wrong on the server. Try again in a moment.')
  }
}

async function body(request, max = 2_000_000) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > max) fail(413, 'too_large', 'That’s more than Shelf takes in one go.')
  try { return await request.json() } catch { fail(400, 'bad_json', 'The request wasn’t valid JSON.') }
}

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const from = request.headers.get('x-shelf-page') || ''

  if (path === '/api/me' && method === 'GET') return me(env, url)

  const q = /^\/(api\/)?q\/([A-Za-z0-9]{8,32})(\/card(?:\.png)?)?$/.exec(path)
  if (q && method === 'GET') {
    if (q[3]) return quoteCard(env, q[2])
    return q[1] ? quoteJSON(env, q[2]) : quotePage(env, url, q[2])
  }

  const caller = who(env)
  if (!caller) return err(401, 'signed_out', 'Sign in to use your shelf.')
  const { k } = caller
  const { ds, kv } = env.holm.app

  if (path.startsWith('/api/review')) return (await import('./review.js')).review(request, env, url, caller, from)
  if (path.startsWith('/api/feeds')) return (await import('./feeds.js')).feeds(request, env, url, caller, from)
  if (path === '/api/lookup' || path === '/api/ask' || path === '/api/prompts' || /^\/api\/items\/[A-Za-z0-9_-]+\/(ask|tags)$/.test(path)) return (await import('./ask.js')).ask(request, env, url, caller, from)
  if (path === '/api/uploads' || path.startsWith('/api/pictures/') || path === '/api/import/highlights' || /^\/api\/items\/[A-Za-z0-9_-]+\/(file|cover|pdf)$/.test(path)) {
    return (await import('./uploads.js')).uploads(request, env, url, caller, from)
  }

  if (path === '/api/library' && method === 'GET') {
    const v = version(env, k)
    if (url.searchParams.get('v') === String(v) && v) return json({ v, same: true })
    const items = allItems(env, k).map(itemDTO)
    return json({ v, items, limit: LIMIT })
  }

  if (path === '/api/items' && method === 'POST') {
    const input = await body(request, 20_000)
    const { doc, existing } = saveLink(env, k, { url: input.url, title: input.title, note: input.note, tags: input.tags, via: ['bookmarklet', 'share'].includes(input.via) ? input.via : 'app' })
    const item = itemDTO(doc)
    const v = bump(env, k, { item }, from)
    return json({ item, existing, v }, existing ? 200 : 201)
  }

  if (path === '/api/import' && method === 'POST') {
    const input = await body(request, 600_000)
    const list = Array.isArray(input.items) ? input.items.slice(0, 100) : []
    let added = 0
    let skipped = 0
    const started = Date.now()
    let done = 0
    for (const row of list) {
      if (Date.now() - started > 2500) break
      done++
      try {
        const { existing } = saveLink(env, k, {
          url: row && row.url, title: row && row.title, tags: row && row.tags, via: 'import',
          saved: Number(row && row.saved) || 0, state: row && row.state, fav: row && row.fav
        })
        if (existing) skipped++
        else added++
      } catch (error) {
        if (error && error.code === 'full') { skipped += list.length - done + 1; break }
        skipped++
      }
    }
    const v = added ? bump(env, k, { full: true }, from) : version(env, k)
    return json({ added, skipped, done, v })
  }

  if (path === '/api/fetch' && method === 'GET') return fetchPage(env, k, url.searchParams.get('url'))

  // Every highlight, newest first, a thousand at a time (a Kindle library can hold many more).
  if (path === '/api/highlights' && method === 'GET') {
    const cursor = url.searchParams.get('cursor')
    const page = ds.find(MARKS(k), {}, { limit: 1000, order: 'desc', page: true, ...(cursor ? { cursor } : {}) })
    const items = {}
    for (const m of page.rows) {
      if (m.item in items) continue
      const doc = getItem(env, k, m.item)
      items[m.item] = doc ? { id: doc.id, kind: doc.kind || 'article', title: doc.title || doc.url || 'Untitled', author: doc.author || '', host: doc.host || (doc.url ? host(doc.url) : ''), url: doc.url || '', image: doc.img ? '/i/' + doc.img : null } : null
    }
    for (const id in items) if (!items[id]) delete items[id]
    return json({ marks: page.rows.filter((m) => items[m.item]).map(markDTO), items, cursor: page.cursor || null })
  }

  if (path === '/api/search' && method === 'GET') return search(env, k, url.searchParams.get('q'))

  let m = /^\/api\/items\/([A-Za-z0-9_-]+)(\/content|\/summary|\/marks)?$/.exec(path)
  if (m) {
    const id = m[1]
    const part = m[2] || ''
    const doc = getItem(env, k, id)
    if (!doc) return err(404, 'not_found', 'That link isn’t on your shelf any more.')

    if (part === '' && method === 'PATCH') {
      const input = await body(request, 20_000)
      const set = {}
      if (input.state === 'archived' || input.state === 'unread') {
        set.state = input.state
        set.read = input.state === 'archived' ? Date.now() : 0
        // Saved from the Feed: it joins the top of the reading list.
        if (doc.state === 'feed') { set.saved = Date.now(); set.seen = true; if (input.state === 'unread') set.via = 'feed' }
        if (input.state === 'unread' && doc.state === 'archived') set.progress = doc.progress >= 0.97 ? 0 : doc.progress || 0
      }
      if (typeof input.fav === 'boolean') set.fav = input.fav
      if (Array.isArray(input.tags)) set.tags = cleanTags(input.tags)
      if (typeof input.note === 'string') set.note = input.note.slice(0, 2000)
      if (typeof input.title === 'string' && input.title.trim()) set.title = input.title.replace(/\s+/g, ' ').trim().slice(0, 300)
      if (typeof input.progress === 'number' && input.progress >= 0 && input.progress <= 1) {
        set.progress = Math.round(input.progress * 1000) / 1000
        set.opened = Date.now()
      }
      if (input.opened === true) { set.opened = Date.now(); if (doc.state === 'feed') set.seen = true }
      if (typeof input.seen === 'boolean' && doc.state === 'feed') set.seen = input.seen
      if (['never', 'less', 'normal', 'more'].includes(input.freq)) set.freq = input.freq
      if (typeof input.author === 'string') set.author = input.author.replace(/\s+/g, ' ').trim().slice(0, 120)
      if (!Object.keys(set).length) return json({ item: itemDTO(doc), v: version(env, k) })
      ds.update(ITEMS(k), { id }, { $set: set })
      const item = itemDTO({ ...doc, ...set })
      // Reading progress is quiet: it moves the version on, but other pages pick it up when
      // they next look rather than redrawing while someone reads.
      const v = bump(env, k, { item, quiet: Object.keys(set).every((x) => x === 'progress' || x === 'opened') }, from)
      return json({ item, v })
    }

    if (part === '' && method === 'DELETE') {
      for (const quote of ds.find('quotes', { k, item: id }, { limit: 500 })) { ds.delete('quotes', { id: quote.id }); try { env.holm.app.s3.delete('q/' + quote.slug + '.png') } catch {} }
      ds.delete(ITEMS(k), { id })
      ds.delete(TEXT(k), { item: id })
      ds.delete(MARKS(k), { item: id })
      try { env.holm.app.s3.delete('c/' + k + '/' + id) } catch {}
      if (doc.kind === 'pdf') try { env.holm.app.s3.delete('f/' + k + '/' + id + '.pdf') } catch {}
      forgetURL(env, k, doc.url)
      const v = bump(env, k, { removed: id }, from)
      return json({ ok: true, v })
    }

    if (part === '/content' && method === 'GET') {
      const file = env.holm.app.s3.get('c/' + k + '/' + id)
      if (!file) return err(404, 'no_content', 'This article hasn’t been made readable yet.')
      const fixed = url.searchParams.get('v') === String(doc.cv || 0)
      // Plain text that a browser never runs: the page reads it and draws it itself.
      return new Response(file.data, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-security-policy': "sandbox; default-src 'none'",
          'x-content-type-options': 'nosniff',
          'cache-control': fixed ? 'private, max-age=31536000, immutable' : 'private, no-cache'
        }
      })
    }

    if (part === '/content' && method === 'PUT') return putContent(env, k, doc, await body(request, (BIG.includes(doc.kind) ? MAX_BOOK : MAX_HTML) + MAX_TEXT + 200_000), from)

    if (part === '/summary' && method === 'POST') return summarize(env, k, doc, from)

    if (part === '/marks' && method === 'GET') {
      return json({ marks: ds.find(MARKS(k), { item: id }, { limit: 1000, order: 'asc' }).map(markDTO) })
    }

    if (part === '/marks' && method === 'POST') {
      const input = await body(request, 40_000)
      const quote = String(input.quote || '').trim()
      if (!quote || quote.length > 5000) return err(400, 'bad_mark', 'Select up to a few paragraphs to highlight.')
      const mark = {
        item: id,
        quote,
        prefix: String(input.prefix || '').slice(-64),
        suffix: String(input.suffix || '').slice(0, 64),
        start: Math.max(0, Math.round(Number(input.start) || 0)),
        end: Math.max(0, Math.round(Number(input.end) || 0)),
        note: String(input.note || '').slice(0, 4000),
        loc: String(input.loc || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        tags: cleanTags(input.tags || []),
        at: Date.now(),
        due: Date.now() + 3 * 864e5
      }
      if (ds.count(MARKS(k), { item: id }) >= 500) return err(409, 'full', 'This article already has 500 highlights.')
      mark.id = ds.insert(MARKS(k), mark)
      const marks = ds.count(MARKS(k), { item: id })
      // Highlighting something in the Feed keeps it: it moves to the reading list.
      const moved = doc.state === 'feed' ? { state: 'unread', seen: true, saved: Date.now() } : {}
      ds.update(ITEMS(k), { id }, { $set: { marks, ...moved } })
      const v = bump(env, k, { item: itemDTO({ ...doc, marks, ...moved }), mark: markDTO(mark) }, from)
      return json({ mark: markDTO(mark), v }, 201)
    }
  }

  m = /^\/api\/marks\/([A-Za-z0-9_-]+)\/share$/.exec(path)
  if (m) {
    const mark = ds.findOne(MARKS(k), m[1])
    if (!mark) return err(404, 'not_found', 'That highlight is gone.')
    if (method === 'POST') {
      if (mark.share) { const kept = ds.find('quotes', { slug: mark.share }, { limit: 1 })[0]; if (kept) return json({ slug: mark.share, fresh: false, card: !!kept.card }) }
      const doc = getItem(env, k, mark.item)
      if (!doc) return err(404, 'not_found', 'That article isn’t on your shelf any more.')
      const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const by = String(caller.member.name || '').trim().split(/\s+/)[0].slice(0, 40)
      ds.insert('quotes', { slug, k, mark: mark.id, item: doc.id, quote: mark.quote.replace(/\s+/g, ' ').trim().slice(0, 1200), title: doc.title || doc.host, site: doc.site || '', host: doc.host || host(doc.url), url: doc.url, author: doc.author || '', by, at: Date.now(), card: false })
      ds.update(MARKS(k), { id: mark.id }, { $set: { share: slug } })
      const v = bump(env, k, { mark: markDTO({ ...mark, share: slug }) }, from)
      return json({ slug, fresh: true, card: false, v }, 201)
    }
    if (method === 'DELETE') {
      if (mark.share) {
        ds.delete('quotes', { slug: mark.share })
        try { env.holm.app.s3.delete('q/' + mark.share + '.png') } catch {}
        ds.update(MARKS(k), { id: mark.id }, { $set: { share: '' } })
      }
      const v = bump(env, k, { mark: markDTO({ ...mark, share: '' }) }, from)
      return json({ ok: true, v })
    }
  }

  m = /^\/api\/q\/([A-Za-z0-9]{8,32})\/card$/.exec(path)
  if (m && method === 'PUT') {
    const doc = ds.find('quotes', { slug: m[1] }, { limit: 1 })[0]
    if (!doc || doc.k !== k) return err(404, 'not_found', 'That link isn’t yours.')
    const length = Number(request.headers.get('content-length') || 0)
    if (length > 800_000) return err(413, 'too_large', 'That picture is too large.')
    const bytes = await request.arrayBuffer()
    const head = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength))
    if (bytes.byteLength > 800_000 || head[0] !== 0x89 || head[1] !== 0x50) return err(415, 'not_png', 'The preview has to be a PNG.')
    env.holm.app.s3.put('q/' + doc.slug + '.png', bytes, 'image/png')
    ds.update('quotes', { id: doc.id }, { $set: { card: true } })
    return json({ ok: true })
  }

  m = /^\/api\/marks\/([A-Za-z0-9_-]+)$/.exec(path)
  if (m) {
    const mark = ds.findOne(MARKS(k), m[1])
    if (!mark) return err(404, 'not_found', 'That highlight is gone.')
    if (method === 'PATCH') {
      const input = await body(request, 20_000)
      const set = {}
      if (typeof input.note === 'string') set.note = input.note.slice(0, 4000)
      if (Array.isArray(input.tags)) set.tags = cleanTags(input.tags)
      if (typeof input.fav === 'boolean') set.fav = input.fav
      if (typeof input.quote === 'string' && input.quote.trim() && !mark.end) set.quote = input.quote.trim().slice(0, 5000)
      if (typeof input.loc === 'string' && !mark.end) set.loc = input.loc.replace(/\s+/g, ' ').trim().slice(0, 40)
      ds.update(MARKS(k), { id: mark.id }, { $set: set })
      const after = markDTO({ ...mark, ...set })
      const v = bump(env, k, { mark: after }, from)
      return json({ mark: after, v })
    }
    if (method === 'DELETE') {
      if (mark.share) { ds.delete('quotes', { slug: mark.share }); try { env.holm.app.s3.delete('q/' + mark.share + '.png') } catch {} }
      ds.delete(MARKS(k), { id: mark.id })
      const doc = getItem(env, k, mark.item)
      let item = null
      if (doc) {
        const marks = ds.count(MARKS(k), { item: doc.id })
        ds.update(ITEMS(k), { id: doc.id }, { $set: { marks } })
        item = itemDTO({ ...doc, marks })
      }
      const v = bump(env, k, { item, unmark: mark.id }, from)
      return json({ ok: true, v })
    }
  }

  return err(404, 'not_found', 'There’s nothing at that address.')
}

/* ---- Who's here ------------------------------------------------------------------------------- */

function me(env, url) {
  const { auth } = env.holm
  const back = url.searchParams.get('return') || '/'
  const safeBack = /^\/[^/\\]/.test(back) || back === '/' ? back : '/'
  const base = { login_url: auth.getLoginURL(safeBack), mcp: url.origin + '/_holm/mcp' }
  if (url.origin && !url.origin.includes('127.0.0.1')) {
    try { if (env.holm.app.kv.get('site:origin') !== url.origin) env.holm.app.kv.set('site:origin', url.origin) } catch {}
  }
  const member = auth.getMember()
  if (!member) return json({ signed_in: false, ...base })
  const caller = who(env)
  return json({
    signed_in: true,
    id: member.id,
    name: member.name || '',
    email: member.email || '',
    picture: member.picture || null,
    admin: !!(auth.isAppAdmin && auth.isAppAdmin()),
    logout_url: auth.getLogoutURL(),
    channel: channel(env, caller.k),
    v: version(env, caller.k),
    ...base
  })
}

/* ---- Fetching a page for the reader ------------------------------------------------------------ */

function fetchPage(env, k, raw) {
  const { kv } = env.holm.app
  let target
  const text = String(raw || '').trim().replace(/^http:\/\//i, 'https://')
  try { target = new URL(text) } catch { return err(400, 'bad_url', 'That isn’t a web address.') }
  if (target.protocol !== 'https:') return err(400, 'bad_url', 'Shelf can only fetch https:// pages.')
  const day = 'f:' + k + ':' + new Date().toISOString().slice(0, 10)
  if ((Number(kv.get(day)) || 0) >= FETCH_CAP) return err(429, 'slow_down', 'Shelf has fetched a lot of pages for you today. The rest will come tomorrow.')
  kv.increment(day)
  let response
  try {
    response = env.holm.net.fetch(target.href, {
      timeout: 8000,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en;q=0.9,*;q=0.5' }
    })
  } catch (error) {
    const text = String(error && (error.message || error) || '')
    console.warn('shelf: fetch ' + target.hostname + ' failed: ' + text.slice(0, 200))
    return json({ ok: false, reason: /blocked|allow/i.test(text) ? 'blocked' : /timeout|deadline/i.test(text) ? 'timeout' : 'unreachable' })
  }
  const headers = response.headers || {}
  const type = String(headers['content-type'] || '').toLowerCase()
  if (!response.ok) return json({ ok: false, status: response.status, reason: response.status === 403 || response.status === 401 ? 'refused' : response.status === 404 || response.status === 410 ? 'gone' : 'error' })
  if (type && !/html|xml|json|text\/plain/.test(type)) return json({ ok: false, status: response.status, reason: 'not_html', type: type.split(';')[0] })
  let html = response.text()
  if (html.length > 3_000_000) html = html.slice(0, 3_000_000)
  return json({ ok: true, status: response.status, type: type.split(';')[0], html })
}

/* ---- Keeping the readable article --------------------------------------------------------------- */

const clip = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')

async function putContent(env, k, doc, input, from) {
  const { ds, kv, s3 } = env.holm.app
  const status = input.status === 'link' ? 'link' : input.status === 'failed' ? 'failed' : 'ready'
  const html = typeof input.html === 'string' ? input.html : ''
  const text = typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : ''
  if (html.length > (BIG.includes(doc.kind) ? MAX_BOOK : MAX_HTML)) return err(413, 'too_large', BIG.includes(doc.kind) ? 'This book is too long to keep.' : 'This article is too long to keep.')
  if (status === 'ready' && !html) return err(400, 'empty', 'There was no article to keep.')

  // Pictures: the page names each one by the hash of its address, and Shelf keeps the address
  // so /i/<hash> can fetch it once and keep a copy (the article keeps its pictures even if
  // the site changes or goes away).
  const images = input.images && typeof input.images === 'object' ? input.images : {}
  let n = 0
  for (const h in images) {
    if (++n > 80) break
    const src = String(images[h] || '')
    if (!/^[a-f0-9]{32}$/.test(h) || !/^https:\/\//.test(src) || src.length > 2000) continue
    if (kv.get('img:' + h)) continue
    if ((await sha(src)) === h) kv.set('img:' + h, src)
  }
  let img = doc.img || ''
  // A book's cover, uploaded already under the hash of its bytes.
  if (typeof input.cover === 'string' && /^[a-f0-9]{32}$/.test(input.cover) && kv.get('imgk:' + input.cover)) img = input.cover
  else if (typeof input.image === 'string' && /^https:\/\//.test(input.image) && input.image.length < 2000) {
    img = await sha(input.image)
    if (!kv.get('img:' + img)) kv.set('img:' + img, input.image)
  }

  const words = Math.max(0, Math.min(500000, Math.round(Number(input.words) || 0)))
  const set = {
    status,
    title: clip(input.title, 300) || doc.title || host(doc.url),
    site: clip(input.site, 80),
    author: clip(input.author, 120),
    excerpt: clip(input.excerpt, 400),
    lang: clip(input.lang, 12),
    dir: input.dir === 'rtl' ? 'rtl' : '',
    published: clip(input.published, 40),
    words,
    img,
    pages: Math.max(0, Math.min(100000, Math.round(Number(input.pages) || doc.pages || 0))),
    error: status === 'failed' ? clip(input.error, 200) : '',
    cv: (doc.cv || 0) + 1
  }
  if (html) s3.put('c/' + k + '/' + doc.id, html, 'text/html')
  const existing = ds.find(TEXT(k), { item: doc.id }, { limit: 1 })[0]
  const words2 = { item: doc.id, title: set.title, site: set.site || doc.host || '', author: set.author, text }
  if (existing) ds.update(TEXT(k), { id: existing.id }, { $set: words2 })
  else if (text || set.title) ds.insert(TEXT(k), words2)
  ds.update(ITEMS(k), { id: doc.id }, { $set: set })
  const item = itemDTO({ ...doc, ...set })
  const v = bump(env, k, { item }, from)
  return json({ item, v })
}

/* ---- Search ----------------------------------------------------------------------------------- */

function search(env, k, raw) {
  const q = String(raw || '').replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!q) return json({ results: [], marks: [] })
  const { ds } = env.holm.app
  const terms = q.toLowerCase().split(' ').filter((t) => t.length > 1)
  let found = []
  let marks = []
  try { found = ds.search(TEXT(k), q, { limit: 40 }).results || [] } catch (error) { console.warn('shelf: search ' + String(error && error.message).slice(0, 120)) }
  try { marks = ds.search(MARKS(k), q, { limit: 20 }).results || [] } catch {}
  const results = []
  for (const row of found) {
    const text = String(row.text || '')
    results.push({ id: row.item, snippet: snippet(text, terms) })
  }
  // Highlights match on their own words and notes, not the text kept around them.
  const hit = (m) => { const t = (String(m.quote) + ' ' + String(m.note || '')).toLowerCase(); return terms.some((x) => t.includes(x)) }
  return json({ results, marks: marks.filter(hit).map(markDTO) })
}

function snippet(text, terms) {
  const lower = text.toLowerCase()
  let at = -1
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i }
  if (at < 0) return text.slice(0, 180)
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 70)) + 1)
  const end = Math.min(text.length, at + 150)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}

/* ---- Highlights --------------------------------------------------------------------------------- */


/* ---- Summaries from the node's AI ----------------------------------------------------------------- */

function summarize(env, k, doc, from) {
  const { ds, kv } = env.holm.app
  if (Array.isArray(doc.summary) && doc.summary.length) return json({ summary: doc.summary })
  const words = ds.find(TEXT(k), { item: doc.id }, { limit: 1 })[0]
  const text = words && words.text ? String(words.text) : ''
  if (text.length < 400) return err(422, 'too_short', 'There isn’t enough here to summarise.')
  const today = new Date().toISOString().slice(0, 10)
  const mine = 'ai:' + k + ':' + today
  const all = 'ai:all:' + today
  if ((Number(kv.get(mine)) || 0) >= AI_CAP || (Number(kv.get(all)) || 0) >= AI_NODE_CAP) return err(429, 'slow_down', 'Summaries are resting for today. They’ll be back tomorrow.')
  kv.increment(mine)
  kv.increment(all)
  const body = text.length > 16000 ? text.slice(0, 11000) + '\n…\n' + text.slice(-4000) : text
  let answer
  try {
    answer = env.holm.ai.chat({
      messages: [
        { role: 'system', content: 'You summarise articles for a reader deciding what to read. Answer with JSON only.' },
        { role: 'user', content: [
          `Title: ${doc.title || ''}`,
          `Article:\n${body}`,
          '',
          'Write the three most important points as three short, plain sentences of at most 22 words each, in the language the article is written in. State what the article says; do not describe the article ("The author argues…"). No marketing words, no emoji.',
          'Reply with JSON only: {"points":["","",""]}'
        ].join('\n') }
      ],
      temperature: 0.3,
      max_tokens: 400
    })
  } catch (error) {
    console.warn('shelf: summary failed: ' + String(error && (error.code || error.message) || error).slice(0, 200))
    return err(503, 'ai_unavailable', 'Summaries aren’t available on this server right now.')
  }
  let points = []
  try {
    const raw = String(answer && answer.content || '')
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
    points = (parsed.points || []).map((p) => String(p).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4)
  } catch {}
  if (!points.length) return err(502, 'ai_unclear', 'The summary didn’t come back clearly. Try again.')
  ds.update(ITEMS(k), { id: doc.id }, { $set: { summary: points } })
  const v = bump(env, k, { item: itemDTO({ ...doc, summary: points }) }, from)
  return json({ summary: points, v, minutes: minutes(doc.words) })
}

/* ---- Shared highlights ----------------------------------------------------------------------------- */

// A highlight someone chose to share: the words, the article's title and link, and their first
// name. Notes stay private, and so does everything else on their shelf.
function quoteDoc(env, slug) {
  return env.holm.app.ds.find('quotes', { slug }, { limit: 1 })[0] || null
}

function quoteJSON(env, slug) {
  const q = quoteDoc(env, slug)
  if (!q) return err(404, 'not_found', 'This highlight isn’t shared any more.')
  return json({ quote: q.quote, title: q.title, site: q.site, host: q.host, url: q.url, author: q.author, by: q.by, at: q.at, card: !!q.card }, 200, { 'cache-control': 'public, max-age=60' })
}

function quoteCard(env, slug) {
  const file = env.holm.app.s3.get('q/' + slug + '.png')
  if (!file) return new Response(null, { status: 302, headers: { location: '/social_preview.png', 'cache-control': 'public, max-age=300' } })
  return new Response(file.data, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } })
}

async function quotePage(env, url, slug) {
  const shell = await env.holm.web.fetch(new Request(new URL('/', url), { headers: { accept: 'text/html' } }))
  let html = await shell.text()
  const q = quoteDoc(env, slug)
  if (q) {
    const words = q.quote.replace(/\s+/g, ' ').trim()
    const short = words.length > 120 ? words.slice(0, 118).replace(/\s+\S*$/, '') + '…' : words
    const title = esc('“' + short + '”')
    const description = esc('From ' + q.title + (q.site || q.host ? ' · ' + (q.site || q.host) : '') + '. Highlighted' + (q.by ? ' by ' + q.by : '') + ' in Shelf.')
    const image = esc(url.origin + '/q/' + slug + '/card.png')
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/<meta[^>]+(property|name)="(og:title|og:description|og:image|og:url|og:type|twitter:title|twitter:description|twitter:image|twitter:card|description)"[^>]*>\s*/g, '')
      .replace('</head>', `<meta name="description" content="${description}">\n<meta property="og:type" content="article">\n<meta property="og:title" content="${title}">\n<meta property="og:description" content="${description}">\n<meta property="og:image" content="${image}">\n<meta property="og:url" content="${esc(url.origin + url.pathname)}">\n<meta name="twitter:card" content="summary_large_image">\n</head>`)
  }
  const headers = new Headers(shell.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(html, { status: q ? 200 : 404, headers })
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
