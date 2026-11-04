// Reading an export from another read-later app into rows Shelf can save:
//   Pocket (CSV: title, url, time_added, tags, status)
//   Instapaper (CSV: URL, Title, Selection, Folder, Timestamp)
//   Omnivore, Raindrop and browser bookmarks (HTML bookmark files, JSON lists)
//   anything else with links in it (one per line, or anywhere in the text)

export function parseExport(text, name = '') {
  const lower = name.toLowerCase()
  const head = text.slice(0, 2000)
  let rows = []
  if (/\.json$/.test(lower) || /^\s*[[{]/.test(head)) rows = fromJSON(text)
  else if (/<dt>|<a\s+href=/i.test(head) || /\.html?$/.test(lower)) rows = fromHTML(text)
  else if (/\.csv$/.test(lower) || /^[^\n]*,[^\n]*url/i.test(head) || /^[^\n]*url[^\n]*,/i.test(head)) rows = fromCSV(text)
  if (!rows.length) rows = fromText(text)
  const seen = new Set()
  return rows.filter((r) => {
    if (!r.url || !/^https?:\/\//i.test(r.url) || seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, 5000)
}

const when = (v) => {
  const n = Number(v)
  if (n > 1e12) return n
  if (n > 1e9) return n * 1000
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : 0
}
const tagList = (v) => String(v || '').split(/[|,;]/).map((t) => t.trim()).filter((t) => t && !/^(unread|archive|starred)$/i.test(t))

function fromCSV(text) {
  const table = csv(text)
  if (table.length < 2) return []
  const head = table[0].map((h) => h.trim().toLowerCase())
  const col = (...names) => head.findIndex((h) => names.includes(h))
  const url = col('url', 'link', 'href', 'address')
  if (url < 0) return []
  const title = col('title', 'name')
  const time = col('time_added', 'timestamp', 'created', 'date', 'saved', 'added', 'saved date', 'saved_at')
  const tags = col('tags', 'tag', 'labels', 'document tags')
  const status = col('status', 'state', 'location')
  const progress = col('reading progress', 'progress')
  const folder = col('folder')
  const fav = col('favorite', 'starred', 'favourite')
  return table.slice(1).map((r) => {
    const f = folder >= 0 ? String(r[folder] || '').toLowerCase() : ''
    const st = status >= 0 ? String(r[status] || '').toLowerCase() : ''
    return {
      url: (r[url] || '').trim(),
      title: title >= 0 ? (r[title] || '').trim() : '',
      saved: time >= 0 ? when(r[time]) : 0,
      tags: [...(tags >= 0 ? tagList(r[tags]) : []), ...(f && !['unread', 'archive', 'starred'].includes(f) ? [f] : [])],
      // Readwise Reader's locations: new, later, shortlist, archive, feed.
      state: st === 'archive' || st === 'archived' || st === 'read' || f === 'archive' || (progress >= 0 && Number(r[progress]) >= 0.97) ? 'archived' : 'unread',
      fav: (fav >= 0 && /^(1|true|yes)$/i.test(r[fav] || '')) || f === 'starred' || st === 'shortlist'
    }
  })
}

// RFC 4180: quoted fields, doubled quotes, newlines inside quotes.
function csv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0]) rows.push(row)
      row = []
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function fromHTML(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  return [...doc.querySelectorAll('a[href]')].map((a) => ({
    url: a.getAttribute('href'),
    title: a.textContent.trim(),
    saved: when(a.getAttribute('add_date') || a.getAttribute('time_added') || ''),
    tags: tagList(a.getAttribute('tags')),
    state: /archive|read/i.test(a.closest('dl') && a.closest('dl').previousElementSibling ? a.closest('dl').previousElementSibling.textContent : '') ? 'archived' : 'unread'
  }))
}

function fromJSON(text) {
  let data
  try { data = JSON.parse(text) } catch { return [] }
  const list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.bookmarks) ? data.bookmarks : Array.isArray(data.list) ? data.list : Object.values(data.list || {})
  return list.map((r) => ({
    url: r.url || r.link || r.href || r.given_url || r.resolved_url || r.originalArticleUrl || '',
    title: r.title || r.resolved_title || r.given_title || r.name || '',
    saved: when(r.savedAt || r.created || r.time_added || r.date || r.created_at || 0),
    tags: Array.isArray(r.labels) ? r.labels.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean) : Array.isArray(r.tags) ? r.tags.map((t) => (typeof t === 'string' ? t : t.name || t.tag)).filter(Boolean) : tagList(r.tags),
    state: r.archivedAt || r.archived || r.isArchived || String(r.status) === '1' || r.state === 'ARCHIVED' ? 'archived' : 'unread',
    fav: !!(r.favorite || r.starred || String(r.favorite) === '1')
  }))
}

function fromText(text) {
  return (text.match(/https?:\/\/[^\s"'<>()]+/g) || []).map((url) => ({ url: url.replace(/[.,;:!?]+$/, ''), title: '' }))
}

/* ---- Highlights from elsewhere -------------------------------------------------------------------
   A Kindle's My Clippings.txt, a Readwise export (CSV), Readwise's CSV import layout, and
   Bookcision's JSON. Each becomes a list of sources (a book, or an article with its link), each
   with its highlights in reading order. */

export function parseHighlights(text, name = '') {
  const lower = name.toLowerCase()
  const head = text.replace(/^﻿/, '').slice(0, 3000)
  let books = []
  if (/==========/.test(head) || /my clippings/.test(lower)) books = fromClippings(text)
  else if (/^\s*[[{]/.test(head)) books = fromBookcision(text)
  else if (/highlight/i.test(head.split('\n')[0] || '')) books = fromHighlightCSV(text)
  return books.filter((b) => b.highlights.length)
}

// Highlights files name their columns; this tells whether a CSV is one (and not a list of links).
export function looksLikeHighlights(text, name = '') {
  const first = text.replace(/^﻿/, '').slice(0, 3000)
  return /==========/.test(first) || /my clippings/i.test(name) || /^"?highlight"?\s*,/i.test(first) || /"highlights"\s*:\s*\[/.test(first)
}

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim()

function source(map, title, author, extra = {}) {
  title = squash(title).slice(0, 300) || 'Untitled'
  author = squash(author).slice(0, 120)
  const key = (extra.url || title.toLowerCase() + '|' + author.toLowerCase())
  if (!map.has(key)) map.set(key, { title, author, url: '', kind: 'book', source: '', tags: [], highlights: [], ...extra })
  return map.get(key)
}

// A Kindle keeps every highlight, note and bookmark in one file, separated by lines of =.
// Changing a highlight adds another entry over the same place; the newest one wins.
function fromClippings(text) {
  const map = new Map()
  const notes = []
  for (const block of text.replace(/^﻿/, '').split(/\r?\n?==========\r?\n?/)) {
    const lines = block.replace(/^﻿/, '').split(/\r?\n/)
    while (lines.length && !lines[0].trim()) lines.shift()
    if (lines.length < 2) continue
    const head = lines[0].replace(/^﻿/, '').trim()
    const meta = lines[1]
    const body = lines.slice(2).join('\n').trim()
    const kind = /note|notiz|nota|メモ/i.test(meta) ? 'note' : /bookmark|lesezeichen|marcador|ブックマーク/i.test(meta) ? 'bookmark' : 'highlight'
    if (kind === 'bookmark' || !body) continue
    // "Title (Author)", the author in the last brackets.
    const m = /^(.*)\(([^()]*)\)\s*$/.exec(head)
    // Kindles write "Last, First" and separate several authors with semicolons.
    const author = m ? m[2].split(';').map((a) => (a.split(',').length === 2 ? a.split(',').reverse().join(' ') : a).trim()).filter(Boolean).join(', ') : ''
    const book = source(map, m ? m[1] : head, author, { source: 'kindle' })
    const loc = /(?:location|loc\.|position|posición|emplacement)\s*([\d]+)(?:-([\d]+))?/i.exec(meta)
    const page = /(?:page|seite|página)\s*([\divxlc]+)/i.exec(meta)
    const added = /added on\s+(?:\w+,\s*)?(.+)$/i.exec(meta)
    const at = added ? Date.parse(added[1].replace(/(\d)(st|nd|rd|th)\b/, '$1')) || 0 : 0
    const start = loc ? Number(loc[1]) : 0
    const end = loc ? Number(loc[2] || loc[1]) : 0
    if (kind === 'note') { notes.push({ book, at: end || start, note: body }); continue }
    const h = { quote: body, note: '', loc: loc ? 'Location ' + loc[1] + (loc[2] ? '–' + loc[2] : '') : page ? 'Page ' + page[1] : '', pos: start || (page ? Number(page[1]) || 0 : 0), end, at }
    // A newer highlight over the same place replaces the older one.
    const i = book.highlights.findIndex((x) => x.pos && start && x.pos <= end && start <= x.end && (x.quote.includes(body) || body.includes(x.quote) || x.pos === start))
    if (i >= 0) book.highlights[i] = h
    else book.highlights.push(h)
  }
  for (const n of notes) {
    const h = n.book.highlights.find((x) => x.end === n.at) || n.book.highlights.find((x) => x.pos <= n.at && n.at <= x.end + 1)
    if (h) h.note = h.note ? h.note + '\n' + n.note : n.note
    else n.book.highlights.push({ quote: '', note: n.note, loc: 'Location ' + n.at, pos: n.at, end: n.at, at: 0 })
  }
  for (const b of map.values()) {
    b.highlights = b.highlights.filter((x) => x.quote).sort((a, c) => a.pos - c.pos)
  }
  return [...map.values()]
}

// Readwise's export ("Highlight, Book Title, Book Author, Amazon Book ID, Note, Color, Tags,
// Location Type, Location, Highlighted at, Document tags") and its import layout ("Highlight,
// Title, Author, URL, Note, Location, Date").
function fromHighlightCSV(text) {
  const table = csv(text.replace(/^﻿/, ''))
  if (table.length < 2) return []
  const head = table[0].map((h) => h.trim().toLowerCase())
  const col = (...names) => head.findIndex((h) => names.includes(h))
  const quote = col('highlight', 'text', 'quote')
  if (quote < 0) return []
  const title = col('book title', 'title', 'source title')
  const author = col('book author', 'author')
  const url = col('url', 'source url', 'link')
  const note = col('note', 'notes')
  const tags = col('tags', 'highlight tags')
  const dtags = col('document tags', 'book tags')
  const loc = col('location')
  const locType = col('location type')
  const at = col('highlighted at', 'date', 'created', 'highlighted_at')
  const asin = col('amazon book id', 'asin')
  const category = col('category', 'source type')
  const map = new Map()
  table.slice(1).forEach((r, n) => {
    const q = (r[quote] || '').trim()
    if (!q) return
    const link = url >= 0 ? (r[url] || '').trim() : ''
    const kind = /^https?:\/\//i.test(link) && !/amazon\.|goodreads\./i.test(link) ? 'article' : 'book'
    const book = source(map, title >= 0 ? r[title] : '', author >= 0 ? r[author] : '', kind === 'article' ? { url: link, kind, source: 'readwise' } : { source: 'readwise' })
    if (asin >= 0 && r[asin] && !book.asin) book.asin = r[asin].trim()
    if (category >= 0 && /article|tweet|podcast/i.test(r[category] || '') && kind === 'book') book.kind = 'note'
    if (dtags >= 0 && r[dtags]) for (const t of tagList(r[dtags])) if (!book.tags.includes(t)) book.tags.push(t)
    const where = loc >= 0 ? String(r[loc] || '').trim() : ''
    const type = locType >= 0 ? String(r[locType] || '').trim().toLowerCase() : ''
    // Readwise tags a highlight with ".word" in its note; .favorite marks a favourite.
    let text = note >= 0 ? (r[note] || '').trim() : ''
    const inline = []
    text = text.replace(/(^|\s)\.([a-z][\w-]{0,31})(?=\s|$)/gi, (all, space, tag) => { inline.push(tag.toLowerCase()); return space }).replace(/\s+$/, '').trim()
    const fav = inline.some((t) => t === 'favorite' || t === 'favourite')
    const extra = inline.filter((t) => t !== 'favorite' && t !== 'favourite' && !/^(h[1-6]|c\d+|qa)$/.test(t))
    book.highlights.push({
      quote: q,
      note: text,
      fav,
      tags: [...new Set([...(tags >= 0 ? tagList(r[tags]) : []).map((t) => t.toLowerCase()), ...extra])].filter((t) => t !== 'favorite' || !fav),
      loc: where && /^(location|page|)$/.test(type) ? (type === 'page' ? 'Page ' : 'Location ') + where : '',
      pos: Number(where) || n,
      at: at >= 0 ? when(r[at]) : 0
    })
  })
  for (const b of map.values()) b.highlights.sort((a, c) => a.pos - c.pos)
  return [...map.values()]
}

// Bookcision (a Kindle notebook exporter): { title, authors, asin, highlights: [{ text, note, location: { value } }] }.
function fromBookcision(text) {
  let data
  try { data = JSON.parse(text) } catch { return [] }
  const list = Array.isArray(data) ? data : [data]
  const map = new Map()
  for (const d of list) {
    if (!d || !Array.isArray(d.highlights)) continue
    const book = source(map, d.title, d.authors || d.author, { source: 'kindle', asin: d.asin || '' })
    for (const x of d.highlights) {
      if (!x || !x.text) continue
      const v = x.location && (x.location.value || x.location)
      book.highlights.push({ quote: String(x.text).trim(), note: String(x.note || '').trim(), loc: v ? 'Location ' + v : '', pos: Number(v) || 0, at: 0 })
    }
  }
  return [...map.values()]
}
