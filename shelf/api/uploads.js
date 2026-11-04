// Things that come from a file rather than a link: books (EPUB, read in the browser), PDFs,
// the pictures inside them, and highlights brought over from a Kindle or from Readwise.
//
//   PUT    /api/pictures/:hash         a picture's bytes, named by their SHA-256
//   POST   /api/uploads                a new book or PDF on the shelf (its words come after)
//   PUT    /api/items/:id/file         a PDF's bytes
//   GET    /api/items/:id/file         the PDF again
//   POST   /api/import/highlights      books and articles with their highlights, a batch at a time

import { json, err, readJSON, ITEMS, TEXT, MARKS, itemDTO, getItem, saveThing, saveLink, cleanTags, bump, version, sha, clip } from './lib.js'

const PICTURE_MAX = 6_000_000
const PDF_MAX = 30_000_000
const IMAGE = { jpeg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], gif: [0x47, 0x49, 0x46], webp: [0x52, 0x49, 0x46, 0x46] }

function sniff(bytes) {
  const head = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))
  for (const type in IMAGE) if (IMAGE[type].every((b, i) => head[i] === b)) return type === 'webp' && head[8] !== 0x57 ? '' : 'image/' + type
  return ''
}

export async function uploads(request, env, url, { k }, from) {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const { ds, s3 } = env.holm.app

  let m = /^\/api\/pictures\/([a-f0-9]{32})$/.exec(path)
  if (m && method === 'PUT') {
    const hash = m[1]
    const { kv } = env.holm.app
    if (kv.get('imgk:' + hash)) return json({ ok: true, kept: true })
    if (Number(request.headers.get('content-length') || 0) > PICTURE_MAX) return err(413, 'too_large', 'That picture is too large.')
    const bytes = await request.arrayBuffer()
    const type = sniff(bytes)
    if (!type || bytes.byteLength > PICTURE_MAX) return err(415, 'not_picture', 'That isn’t a picture Shelf can keep.')
    if ((await sha(new Uint8Array(bytes))) !== hash) return err(400, 'bad_hash', 'The picture didn’t arrive whole. Try again.')
    s3.put('i/' + hash, bytes, type)
    kv.set('imgk:' + hash, 1)
    return json({ ok: true }, 201)
  }

  if (path === '/api/uploads' && method === 'POST') {
    const input = await readJSON(request, 20_000)
    const kind = ['pdf', 'book', 'notes', 'doc'].includes(input.kind) ? input.kind : 'book'
    // A paper book is a place to keep highlights you type in; it has no words of its own.
    const doc = saveThing(env, k, kind === 'notes'
      ? { kind, title: input.title, author: input.author, source: 'paper', state: 'archived', status: 'notes' }
      : { kind, title: input.title, author: input.author, site: input.site, source: 'upload' })
    const item = itemDTO(doc)
    const v = bump(env, k, { item }, from)
    return json({ item, v }, 201)
  }

  // A book's cover from Open Library, looked for once.
  m = /^\/api\/items\/([A-Za-z0-9_-]+)\/cover$/.exec(path)
  if (m && method === 'POST') {
    const { kv } = env.holm.app
    const doc = getItem(env, k, m[1])
    if (!doc || doc.url || doc.img) return json({ image: doc && doc.img ? '/i/' + doc.img : null })
    if (kv.get('cover:' + k + ':' + doc.id)) return json({ image: null })
    // Asked once a month when Open Library has none, again in a few hours when it didn't answer.
    kv.set('cover:' + k + ':' + doc.id, 1, 6 * 3600 * 1000)
    let found = ''
    try {
      const q = 'title=' + encodeURIComponent(doc.title.replace(/[:(].*$/, '').trim()) + (doc.author ? '&author=' + encodeURIComponent(doc.author.split(',')[0]) : '') + '&limit=1&fields=cover_i'
      const r = env.holm.net.fetch('https://openlibrary.org/search.json?' + q, { timeout: 3000, headers: { 'user-agent': 'Shelf (a Holm app; https://holmhq.com)', accept: 'application/json' } })
      const data = r.ok ? JSON.parse(r.text()) : null
      const id = data && data.docs && data.docs[0] && data.docs[0].cover_i
      if (id) found = 'https://covers.openlibrary.org/b/id/' + id + '-M.jpg'
      else if (data) kv.set('cover:' + k + ':' + doc.id, 1, 30 * 864e5)
    } catch {}
    if (!found) return json({ image: null })
    const img = await sha(found)
    if (!kv.get('img:' + img)) kv.set('img:' + img, found)
    ds.update(ITEMS(k), { id: doc.id }, { $set: { img } })
    const item = itemDTO({ ...doc, img })
    const v = bump(env, k, { item, quiet: true }, from)
    return json({ image: '/i/' + img, item, v })
  }

  // A saved link that turned out to be a PDF: the server keeps the file, and it becomes a PDF
  // on the shelf, read in the PDF viewer.
  m = /^\/api\/items\/([A-Za-z0-9_-]+)\/pdf$/.exec(path)
  if (m && method === 'POST') {
    const doc = getItem(env, k, m[1])
    if (!doc || !doc.url) return err(404, 'not_found', 'That link isn’t on your shelf any more.')
    let response
    try {
      response = env.holm.net.fetch(doc.url, { responseType: 'file', filename: doc.id + '.pdf', timeout: 9000, headers: { 'user-agent': 'Mozilla/5.0 (compatible; Shelf; read-later on a Holm server; +https://holmhq.com)', accept: 'application/pdf,*/*;q=0.5' } })
    } catch (error) {
      return err(502, 'unreachable', /timeout|deadline/i.test(String(error && error.message)) ? 'The PDF took too long to download.' : 'The PDF couldn’t be downloaded.')
    }
    const file = response.file
    if (!response.ok || !file) return err(502, 'unreachable', 'The PDF couldn’t be downloaded.')
    if (file.size > PDF_MAX) return err(413, 'too_large', 'PDFs can be up to 30 MB.')
    s3.put('f/' + k + '/' + doc.id + '.pdf', file, 'application/pdf')
    ds.update(ITEMS(k), { id: doc.id }, { $set: { kind: 'pdf' } })
    const item = itemDTO({ ...doc, kind: 'pdf' })
    const v = bump(env, k, { item }, from)
    return json({ item, v })
  }

  m = /^\/api\/items\/([A-Za-z0-9_-]+)\/file$/.exec(path)
  if (m) {
    const doc = getItem(env, k, m[1])
    if (!doc || doc.kind !== 'pdf') return err(404, 'not_found', 'That PDF isn’t on your shelf any more.')
    const key = 'f/' + k + '/' + doc.id + '.pdf'
    if (method === 'GET') {
      const file = s3.get(key)
      if (!file) return err(404, 'no_file', 'This PDF hasn’t arrived yet.')
      return new Response(file.data, { headers: { 'content-type': 'application/pdf', 'content-security-policy': "sandbox; default-src 'none'", 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=31536000, immutable' } })
    }
    if (method === 'PUT') {
      if (Number(request.headers.get('content-length') || 0) > PDF_MAX) return err(413, 'too_large', 'PDFs can be up to 30 MB.')
      const bytes = await request.arrayBuffer()
      const head = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))
      if (String.fromCharCode(...head) !== '%PDF-') return err(415, 'not_pdf', 'That isn’t a PDF.')
      s3.put(key, bytes, 'application/pdf')
      return json({ ok: true, size: bytes.byteLength })
    }
  }

  if (path === '/api/import/highlights' && method === 'POST') return importHighlights(env, k, await readJSON(request, 1_500_000), from)

  return err(404, 'not_found', 'There’s nothing at that address.')
}

/* ---- Highlights from elsewhere ------------------------------------------------------------------ */

// Each source (a book, or an article with its link) is found again by its title and author, or
// its link, so importing the same file twice adds only what's new.
async function importHighlights(env, k, input, from) {
  const { ds, kv } = env.holm.app
  const list = Array.isArray(input.sources) ? input.sources.slice(0, 40) : []
  const started = Date.now()
  let done = 0
  let books = 0
  let added = 0
  let skipped = 0
  for (const src of list) {
    if (Date.now() - started > 2400) break
    const highlights = Array.isArray(src && src.highlights) ? src.highlights.slice(0, 2000) : []
    if (!highlights.length) { done++; continue }
    let doc = null
    if (src.url && /^https?:\/\//i.test(src.url)) {
      try { doc = saveLink(env, k, { url: src.url, title: src.title, tags: src.tags, via: 'import', state: 'archived', saved: Number(highlights[0].at) || 0 }).doc } catch {}
    }
    if (!doc) {
      const key = 'src:' + k + ':' + (await sha(String(src.title || '').toLowerCase().trim() + '|' + String(src.author || '').toLowerCase().trim()))
      const id = kv.get(key)
      doc = id ? getItem(env, k, id) : null
      if (!doc) {
        doc = saveThing(env, k, { kind: 'notes', title: src.title, author: src.author, source: ['kindle', 'readwise'].includes(src.source) ? src.source : 'import', state: 'archived', saved: Math.min(...highlights.map((h) => Number(h.at) || Date.now())), tags: src.tags, status: 'notes' })
        kv.set(key, doc.id)
        books++
      }
    }
    // What this source has already, by its words, so nothing comes in twice.
    const have = new Set()
    for (const mk of ds.find(MARKS(k), { item: doc.id }, { limit: 5000 })) have.add(String(mk.quote).replace(/\s+/g, ' ').trim())
    let n = 0
    for (const h of highlights) {
      const quote = String(h && h.quote || '').trim().slice(0, 5000)
      const key = quote.replace(/\s+/g, ' ')
      if (!quote || have.has(key)) { skipped++; continue }
      have.add(key)
      const at = Number(h.at) > 0 && Number(h.at) < Date.now() + 864e5 ? Math.round(Number(h.at)) : Date.now()
      ds.insert(MARKS(k), {
        item: doc.id, quote, prefix: '', suffix: '', start: 0, end: 0,
        note: String(h.note || '').slice(0, 4000),
        loc: clip(h.loc, 40),
        tags: cleanTags(h.tags || []),
        fav: !!h.fav,
        at,
        due: 0
      })
      n++
    }
    if (n) {
      const marks = ds.count(MARKS(k), { item: doc.id })
      ds.update(ITEMS(k), { id: doc.id }, { $set: { marks } })
      added += n
    }
    done++
  }
  // Today's review may have come up short before these arrived.
  if (added) for (const d of [-1, 0, 1]) { try { kv.delete('rvtop:' + k + ':' + new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)) } catch {} }
  const v = added || books ? bump(env, k, { full: true }, from) : version(env, k)
  return json({ done, books, added, skipped, v })
}
