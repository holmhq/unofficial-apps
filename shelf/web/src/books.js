// Books you own: an EPUB opened here in the browser, its chapters joined into one long article
// the reader already knows how to show, highlight and read aloud, with a contents list. Its
// pictures are made smaller here and kept on your server under the hash of their bytes.

import DOMPurify from '/vendor/dompurify/purify.es.mjs'
import { readZip } from './zip.js'
import { TAGS, ATTRS, plainText, countWords } from './extract.js'

const XHTML = /x?html?$/i
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

function resolve(from, href) {
  const base = from.split('/').slice(0, -1)
  for (const part of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (part === '..') base.pop()
    else if (part && part !== '.') base.push(part)
  }
  return base.join('/')
}

const parseXML = (text, type = 'application/xhtml+xml') => {
  let doc = new DOMParser().parseFromString(text, type)
  if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(text, 'text/html')
  return doc
}
const byName = (root, name) => [...root.getElementsByTagName('*')].filter((e) => e.localName === name)

export async function shaBytes(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  let out = ''
  for (let i = 0; i < 16; i++) out += d[i].toString(16).padStart(2, '0')
  return out
}

// A picture made web-sized: at most 1600 px on its long side, JPEG or WebP unless it's small.
async function shrink(bytes, type) {
  if (bytes.length < 160_000 || !/^image\/(jpeg|png|webp)$/.test(type) || typeof createImageBitmap !== 'function') return { bytes, type }
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type }))
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const out = type === 'image/png' ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise((r) => c.toBlob(r, out, 0.84))
    if (!blob || blob.size >= bytes.length) return { bytes, type }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: out }
  } catch { return { bytes, type } }
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }

// An EPUB file → what Shelf keeps for it, plus its pictures to upload ({ hash: { bytes, type } }).
export async function readEPUB(file, onStep = () => {}) {
  const zip = await readZip(await file.arrayBuffer())
  const container = await zip.text('META-INF/container.xml')
  if (!container) throw new Error('This isn’t an EPUB book.')
  const opfPath = (/full-path="([^"]+)"/.exec(container) || [])[1]
  const opfText = opfPath && await zip.text(opfPath)
  if (!opfText) throw new Error('This book’s contents list is missing.')
  const opf = parseXML(opfText, 'application/xml')
  const meta = (name) => clean((byName(opf, name)[0] || {}).textContent)
  const manifest = new Map()
  for (const it of byName(opf, 'item')) manifest.set(it.getAttribute('id'), { href: resolve(opfPath, it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' })
  const spine = byName(opf, 'itemref').filter((r) => r.getAttribute('linear') !== 'no').map((r) => manifest.get(r.getAttribute('idref'))).filter((x) => x && XHTML.test(x.type + x.href))

  // Chapter names from the book's own table of contents (EPUB 3 nav, or EPUB 2 NCX).
  const names = new Map()
  const nav = [...manifest.values()].find((x) => /\bnav\b/.test(x.props))
  const ncx = [...manifest.values()].find((x) => /ncx/.test(x.type))
  if (nav) {
    const doc = parseXML(await zip.text(nav.href) || '')
    for (const a of doc.querySelectorAll('nav a[href]')) { const p = resolve(nav.href, a.getAttribute('href')); if (!names.has(p)) names.set(p, clean(a.textContent)) }
  } else if (ncx) {
    const doc = parseXML(await zip.text(ncx.href) || '', 'application/xml')
    for (const p of byName(doc, 'navPoint')) {
      const src = byName(p, 'content')[0]
      const label = byName(p, 'text')[0]
      if (src && label) { const path = resolve(ncx.href, src.getAttribute('src') || ''); if (!names.has(path)) names.set(path, clean(label.textContent)) }
    }
  }

  const images = {}
  const pictureFor = async (path) => {
    const raw = await zip.bytes(path)
    if (!raw) return ''
    const ext = (path.split('.').pop() || '').toLowerCase()
    const type = MIME[ext] || 'image/jpeg'
    if (type === 'image/svg+xml' || raw.length > 12_000_000) return ''
    const { bytes, type: out } = await shrink(raw, type)
    const hash = await shaBytes(bytes)
    images[hash] = { bytes, type: out }
    return hash
  }

  const out = document.createElement('div')
  const contents = []
  let n = 0
  for (const ch of spine) {
    onStep(++n / (spine.length + 1))
    const text = await zip.text(ch.href)
    if (!text) continue
    const doc = parseXML(text)
    const body = doc.body || byName(doc, 'body')[0]
    if (!body) continue
    // Project Gutenberg's licence at the start and end of its books isn't part of the book.
    for (const el of [...body.querySelectorAll('#pg-header, #pg-footer, .pg-boilerplate, #pg-machine-header, #pg-start-separator, #pg-end-separator')]) el.remove()
    // SVG-wrapped cover pages and other pictures become plain images first.
    for (const svg of [...body.querySelectorAll('svg')]) {
      const im = svg.querySelector('image')
      const href = im && (im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))
      if (href) { const img = doc.createElementNS('http://www.w3.org/1999/xhtml', 'img'); img.setAttribute('src', href); svg.replaceWith(img) } else svg.remove()
    }
    const section = document.createElement('section')
    section.append(DOMPurify.sanitize(body.innerHTML, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, RETURN_DOM_FRAGMENT: true, ALLOW_DATA_ATTR: false }))
    for (const img of [...section.querySelectorAll('img')]) {
      const src = img.getAttribute('src') || ''
      const hash = src && !/^(data|https?):/i.test(src) ? await pictureFor(resolve(ch.href, src)) : ''
      if (hash) { img.setAttribute('src', '/i/' + hash); img.removeAttribute('width'); img.removeAttribute('height') } else img.remove()
    }
    // Links inside the book can't go anywhere in one long page; they become plain words.
    for (const a of [...section.querySelectorAll('a')]) {
      const href = a.getAttribute('href') || ''
      if (!/^https?:\/\//i.test(href)) a.replaceWith(...a.childNodes)
    }
    for (const el of section.querySelectorAll('[id]')) el.removeAttribute('id')
    if (!section.textContent.trim() && !section.querySelector('img')) continue
    const id = 'ch' + contents.length
    section.id = id
    const heading = section.querySelector('h1, h2, h3')
    const name = (names.get(ch.href) || clean(heading && heading.textContent) || '').slice(0, 120)
    // The chapter's name rides on its section: the reader builds its contents from them.
    if (name) section.setAttribute('aria-label', name)
    contents.push({ id, name })
    out.append(section)
  }
  if (!contents.length) throw new Error('This book has no chapters Shelf can read.')

  // The cover: what the book names as its cover, or the first picture in it.
  let cover = ''
  const coverItem = [...manifest.values()].find((x) => /cover-image/.test(x.props)) || manifest.get((byName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover') || { getAttribute: () => '' }).getAttribute('content'))
  if (coverItem && /^image\//.test(coverItem.type)) cover = await pictureFor(coverItem.href)
  if (!cover) { const first = out.querySelector('img'); if (first) cover = first.getAttribute('src').slice(3) }
  // A first chapter that is only the cover picture is dropped; the cover shows above the book.
  const firstSection = out.querySelector('section')
  if (cover && firstSection && !firstSection.textContent.trim() && firstSection.querySelectorAll('img').length === 1) { firstSection.remove(); contents.shift() }

  onStep(1)
  const creators = byName(opf, 'creator').map((c) => clean(c.textContent)).filter(Boolean)
  // The book's own title page repeats what Shelf shows above it: its title and "by" its author.
  const norm = (t) => clean(t).toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, '')
  const same = new Set([norm(meta('title')), ...creators.map((c) => norm('by ' + c)), ...creators.map(norm)])
  const opening = out.querySelector('section')
  if (opening) for (const head of [...opening.querySelectorAll('h1, h2, h3, h4')]) if (same.has(norm(head.textContent))) head.remove()
  const plain = plainText(out)
  return {
    book: {
      title: meta('title').slice(0, 300) || file.name.replace(/\.epub$/i, ''),
      author: creators.slice(0, 3).join(', ').slice(0, 120),
      site: clean(meta('publisher')).slice(0, 80),
      lang: meta('language').slice(0, 12),
      published: meta('date').slice(0, 40),
      excerpt: clean(meta('description').replace(/<[^>]+>/g, ' ')).slice(0, 400) || plain.slice(0, 300),
      words: countWords(plain),
      html: out.innerHTML,
      text: plain.slice(0, 400_000),
      contents: contents.slice(0, 400),
      cover
    },
    images
  }
}
