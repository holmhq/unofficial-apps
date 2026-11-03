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
  const time = col('time_added', 'timestamp', 'created', 'date', 'saved', 'added')
  const tags = col('tags', 'tag', 'labels')
  const status = col('status', 'state')
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
      state: st === 'archive' || st === 'archived' || st === 'read' || f === 'archive' ? 'archived' : 'unread',
      fav: (fav >= 0 && /^(1|true|yes)$/i.test(r[fav] || '')) || f === 'starred'
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
