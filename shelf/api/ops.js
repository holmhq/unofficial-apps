// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"), and each one only ever sees the
// caller's own shelf. Named operations can't fetch from the web, so a link Claude saves waits
// as "pending" until Shelf is next open on one of the person's devices, which then fetches it
// and makes it readable.

import { who, Fail, ITEMS, TEXT, MARKS, itemDTO, getItem, saveLink, cleanTags, bump, minutes, origin, host } from './lib.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT', 422: 'APP_INVALID', 429: 'APP_RATE_LIMITED' }

function op(env, run) {
  try {
    const caller = who(env)
    if (!caller) throw new Fail(401, 'signed_out', 'Sign in to Shelf first.')
    return run(caller.k)
  } catch (error) {
    if (error && error.public) {
      const out = new Error(error.message)
      out.code = CODES[error.status] || 'APP_INVALID_INPUT'
      out.status = error.status
      out.public = true
      throw out
    }
    throw error
  }
}

const link = (env, id) => (origin(env) ? origin(env) + '/read/' + id : '')

function brief(env, doc) {
  const d = itemDTO(doc)
  return {
    id: d.id,
    title: d.title || d.host,
    kind: d.kind !== 'article' ? d.kind : undefined,
    url: d.url || undefined,
    site: d.site || d.host,
    author: d.author || undefined,
    minutes: d.words ? minutes(d.words) : undefined,
    saved: new Date(d.saved).toISOString(),
    state: d.state,
    seen: d.state === 'feed' ? d.seen : undefined,
    favourite: d.fav || undefined,
    tags: d.tags.length ? d.tags : undefined,
    progress: d.progress ? Math.round(d.progress * 100) + '%' : undefined,
    highlights: d.marks || undefined,
    readable: d.status === 'ready',
    pending: d.status === 'pending' || undefined,
    excerpt: d.excerpt || undefined,
    note: d.note || undefined,
    open: link(env, d.id) || undefined
  }
}

export function opList(input, env) {
  return op(env, (k) => {
    const { ds } = env.holm.app
    const show = input.show || 'unread'
    const limit = Math.max(1, Math.min(100, Math.round(input.limit || 30)))
    const query = show === 'archived' ? { state: 'archived' } : show === 'favourites' ? { fav: true } : show === 'all' ? {} : show === 'feed' ? { state: 'feed' } : { state: 'unread' }
    let rows = ds.find(ITEMS(k), query, { limit: 1000, order: 'desc' })
    if (show !== 'all' && show !== 'feed') rows = rows.filter((r) => r.kind !== 'notes')
    if (input.tag) rows = rows.filter((r) => (r.tags || []).includes(String(input.tag).toLowerCase().replace(/^#/, '')))
    if (input.longest_first) rows.sort((a, b) => (b.words || 0) - (a.words || 0))
    else rows.sort((a, b) => (show === 'feed' ? (a.seen ? 1 : 0) - (b.seen ? 1 : 0) : 0) || (b.saved || 0) - (a.saved || 0))
    if (input.max_minutes) rows = rows.filter((r) => r.words && minutes(r.words) <= input.max_minutes)
    return { total: rows.length, items: rows.slice(0, limit).map((r) => brief(env, r)) }
  })
}

export function opRead(input, env) {
  return op(env, (k) => {
    const { ds } = env.holm.app
    const doc = getItem(env, k, input.id)
    if (!doc) throw new Fail(404, 'not_found', 'No saved link has that id. Call items_list or items_search to find one.')
    const words = ds.find(TEXT(k), { item: doc.id }, { limit: 1 })[0]
    const text = words && words.text ? String(words.text) : ''
    const offset = Math.max(0, Math.round(input.offset || 0))
    const length = Math.max(2000, Math.min(60000, Math.round(input.length || 30000)))
    const part = text.slice(offset, offset + length)
    const marks = ds.find(MARKS(k), { item: doc.id }, { limit: 200, order: 'asc' })
    return {
      ...brief(env, doc),
      summary: Array.isArray(doc.summary) ? doc.summary : undefined,
      text: part || (doc.status === 'pending' ? '' : ''),
      characters: text.length,
      next_offset: offset + length < text.length ? offset + length : undefined,
      highlights: marks.map((m) => ({ quote: m.quote.replace(/\s+/g, " ").trim(), note: m.note || undefined, where: m.loc || undefined, tags: m.tags && m.tags.length ? m.tags : undefined })),
      hint: !text ? (doc.kind === 'notes' ? 'Shelf keeps only the highlights of this book, not its text.' : doc.status === 'pending' ? 'This link hasn’t been fetched yet: Shelf makes it readable the next time it is open on one of the person’s devices. Read the original at its url meanwhile.' : 'Shelf couldn’t make this page readable. Read the original at its url.') : undefined
    }
  })
}

export function opSearch(input, env) {
  return op(env, (k) => {
    const { ds } = env.holm.app
    const q = String(input.query || '').replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!q) throw new Fail(400, 'empty', 'Say what to search for.')
    const limit = Math.max(1, Math.min(30, Math.round(input.limit || 10)))
    const terms = q.toLowerCase().split(' ').filter((t) => t.length > 1)
    let found = []
    let marks = []
    try { found = ds.search(TEXT(k), q, { limit }).results || [] } catch {}
    try { marks = ds.search(MARKS(k), q, { limit: 10 }).results || [] } catch {}
    const items = []
    for (const row of found) {
      const doc = getItem(env, k, row.item)
      if (!doc) continue
      const text = String(row.text || '')
      const lower = text.toLowerCase()
      let at = -1
      for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i }
      items.push({ ...brief(env, doc), match: at < 0 ? undefined : text.slice(Math.max(0, at - 120), at + 200).replace(/\s+/g, ' ').trim() })
    }
    // Titles and sites too, for links that haven't been fetched yet.
    if (items.length < limit) {
      const seen = new Set(items.map((i) => i.id))
      for (const doc of ds.find(ITEMS(k), {}, { limit: 1000, order: 'desc' })) {
        if (seen.has(doc.id)) continue
        const hay = ((doc.title || '') + ' ' + (doc.host || '') + ' ' + (doc.tags || []).join(' ') + ' ' + (doc.note || '')).toLowerCase()
        if (terms.every((t) => hay.includes(t))) { items.push(brief(env, doc)); if (items.length >= limit) break }
      }
    }
    const hit = (m) => { const t = (String(m.quote) + ' ' + String(m.note || '')).toLowerCase(); return terms.some((x) => t.includes(x)) }
    return {
      items,
      highlights: marks.filter(hit).map((m) => {
        const doc = getItem(env, k, m.item)
        return { quote: m.quote.replace(/\s+/g, " ").trim(), note: m.note || undefined, item: m.item, title: doc ? doc.title : undefined }
      })
    }
  })
}

export function opSave(input, env) {
  return op(env, (k) => {
    let { doc, existing } = saveLink(env, k, { url: input.url, title: input.title, note: input.note, tags: input.tags, via: 'claude' })
    const text = typeof input.text === 'string' ? input.text.replace(/\r\n?/g, '\n').trim() : ''
    if (text.length >= 200 && (doc.status === 'pending' || doc.status === 'failed')) doc = keepText(env, k, doc, text, input)
    bump(env, k, { item: itemDTO(doc), fetch: doc.status === 'pending' ? doc.id : undefined })
    return {
      saved: true,
      already_saved: existing || undefined,
      item: brief(env, doc),
      next: doc.status === 'pending' ? 'Saved. Shelf fetches the article and makes it readable the next time it’s open on any of the person’s devices (an open tab does it right away).' : 'Saved.'
    }
  })
}

export function opUpdate(input, env) {
  return op(env, (k) => {
    const { ds } = env.holm.app
    const doc = getItem(env, k, input.id)
    if (!doc) throw new Fail(404, 'not_found', 'No saved link has that id.')
    const set = {}
    if (input.state === 'archived' || input.state === 'unread') {
      set.state = input.state
      set.read = input.state === 'archived' ? Date.now() : 0
      if (doc.state === 'feed') { set.saved = Date.now(); set.seen = true }
    }
    if (typeof input.favourite === 'boolean') set.fav = input.favourite
    if (Array.isArray(input.tags)) set.tags = cleanTags(input.tags)
    if (typeof input.note === 'string') set.note = input.note.slice(0, 2000)
    if (!Object.keys(set).length) return { item: brief(env, doc) }
    ds.update(ITEMS(k), { id: doc.id }, { $set: set })
    const after = { ...doc, ...set }
    bump(env, k, { item: itemDTO(after) })
    return { item: brief(env, after) }
  })
}

export function opHighlights(input, env) {
  return op(env, (k) => {
    const { ds } = env.holm.app
    const limit = Math.max(1, Math.min(200, Math.round(input.limit || 50)))
    const marks = input.id
      ? ds.find(MARKS(k), { item: input.id }, { limit, order: 'asc' })
      : ds.find(MARKS(k), {}, { limit, order: 'desc' })
    const titles = {}
    return {
      highlights: marks.map((m) => {
        if (!(m.item in titles)) { const doc = getItem(env, k, m.item); titles[m.item] = doc ? { title: doc.title || doc.host, url: doc.url } : null }
        const t = titles[m.item]
        return { quote: m.quote.replace(/\s+/g, " ").trim(), note: m.note || undefined, at: new Date(m.at || m._createdAt).toISOString(), item: m.item, title: t ? t.title : undefined, url: t ? t.url : undefined }
      }).filter((m) => m.title !== undefined)
    }
  })
}

/* ---- An article Claude already read ------------------------------------------------------------ */

// Claude can pass the article's text when it saves a link. It becomes the readable copy at once
// (the page can still fetch the original later), set from a small, safe subset of Markdown.
function keepText(env, k, doc, text, input) {
  const { ds, s3 } = env.holm.app
  const html = markdown(text.slice(0, 200000))
  const plain = text.replace(/^#+\s*/gm, '').replace(/^[-*>]\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '')
  const words = (plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
  const first = plain.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).find((p) => p.length >= 60) || ''
  const set = {
    status: 'ready',
    title: String(input.title || doc.title || host(doc.url)).replace(/\s+/g, ' ').trim().slice(0, 300),
    site: String(input.site || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    author: String(input.author || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    excerpt: first.slice(0, 400),
    words,
    cv: (doc.cv || 0) + 1,
    error: ''
  }
  s3.put('c/' + k + '/' + doc.id, html, 'text/html')
  const kept = ds.find(TEXT(k), { item: doc.id }, { limit: 1 })[0]
  const row = { item: doc.id, title: set.title, site: set.site || doc.host || '', author: set.author, text: plain.slice(0, 400000) }
  if (kept) ds.update(TEXT(k), { id: kept.id }, { $set: row })
  else ds.insert(TEXT(k), row)
  ds.update(ITEMS(k), { id: doc.id }, { $set: set })
  return { ...doc, ...set }
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function inline(s) {
  return escape(s)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, t, u) => '<a href="' + u.replace(/"/g, '%22') + '">' + t + '</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
function markdown(text) {
  const out = []
  for (const block of text.split(/\n\s*\n/)) {
    const b = block.trim()
    if (!b) continue
    const head = /^(#{1,4})\s+(.+)$/.exec(b)
    if (head && !b.includes('\n')) { const n = Math.min(4, head[1].length + 1); out.push('<h' + n + '>' + inline(head[2]) + '</h' + n + '>'); continue }
    const lines = b.split('\n')
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) { out.push('<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('') + '</ul>'); continue }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) { out.push('<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>'); continue }
    if (lines.every((l) => /^>\s?/.test(l))) { out.push('<blockquote><p>' + inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' ')) + '</p></blockquote>'); continue }
    out.push('<p>' + inline(lines.join(' ')) + '</p>')
  }
  return out.join('\n')
}
