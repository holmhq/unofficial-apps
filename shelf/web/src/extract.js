// Making a saved page readable, in the browser. The server fetches the page (a browser can't
// read another site's HTML), Mozilla's Readability finds the article in it, DOMPurify keeps
// only plain article markup, and pictures are renamed to /i/<hash> so the server can keep a
// copy of each. What comes back is stored with the item: the article, its words for search
// and for Claude, and its title, site, author and lead picture.

import Readability from '/vendor/readability/Readability.js'
import DOMPurify from '/vendor/dompurify/purify.es.mjs'
import * as api from './api.js'

export const TAGS = ['p', 'br', 'a', 'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'abbr', 'cite', 'q', 'code', 'pre', 'kbd', 'samp', 'var',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'caption', 'div', 'span', 'section', 'article', 'details', 'summary', 'time', 'mark']
export const ATTRS = ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan', 'datetime', 'start', 'reversed', 'lang', 'dir', 'id']
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'FIGURE', 'FIGCAPTION', 'TR', 'DT', 'DD', 'TABLE', 'UL', 'OL', 'HR', 'BR', 'DETAILS', 'SUMMARY'])

export async function sha(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  let out = ''
  for (let i = 0; i < 16; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

const REASONS = {
  refused: 'The site refused to send this page to your server.',
  gone: 'The page isn’t there any more.',
  blocked: 'This server isn’t allowed to fetch pages from the web.',
  timeout: 'The site took too long to answer.',
  unreachable: 'The site couldn’t be reached.',
  error: 'The site answered with an error.'
}

export async function readable(item, given = '') {
  if (given) return fromHTML(`<!doctype html><html><head><title>${item.title.replace(/</g, '&lt;')}</title></head><body><article>${given}</article></body></html>`, item.url, item.title, { keep: true })
  let r
  try { r = await api.get('/api/fetch?url=' + encodeURIComponent(item.url)) } catch (e) {
    if (e.status === 429 || e.status === 0) throw e
    return { status: 'failed', error: e.message }
  }
  if (!r.ok) {
    if (r.reason === 'not_html') return { status: 'link', title: item.title || fileName(item.url), site: '', excerpt: kind(r.type) }
    return { status: 'failed', error: REASONS[r.reason] || REASONS.error }
  }
  return fromHTML(r.html, item.url, item.title)
}

const fileName = (url) => { try { return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname) } catch { return url } }
const kind = (type) => (/pdf/.test(type) ? 'A PDF document.' : /^image\//.test(type) ? 'A picture.' : /^video\//.test(type) ? 'A video.' : /^audio\//.test(type) ? 'A recording.' : 'A file.')

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

export async function fromHTML(html, url, fallbackTitle = '', { keep = false } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Words a feed carried are kept even when short (a video's description), as they are.
  const given = keep && doc.querySelector('article') ? doc.querySelector('article').innerHTML : ''
  const head = doc.head || doc.documentElement
  if (!doc.querySelector('base[href]')) {
    const base = doc.createElement('base')
    base.setAttribute('href', url)
    head.prepend(base)
  }
  const meta = (...names) => {
    for (const n of names) {
      const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`)
      if (el && el.getAttribute('content')) return clean(el.getAttribute('content'))
    }
    return ''
  }
  const abs = (u) => { try { const x = new URL(u, doc.baseURI); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : '' } catch { return '' } }
  const ogImage = abs(meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image'))
  const info = {
    title: meta('og:title', 'twitter:title') || clean(doc.title),
    site: meta('og:site_name', 'application-name', 'apple-mobile-web-app-title'),
    excerpt: meta('og:description', 'description', 'twitter:description'),
    author: meta('author', 'article:author', 'parsely-author', 'sailthru.author', 'byl'),
    published: meta('article:published_time', 'datePublished', 'date', 'pubdate', 'parsely-pub-date', 'dc.date'),
    lang: clean(doc.documentElement.getAttribute('lang')).slice(0, 12)
  }

  // Project Gutenberg wraps every book in its licence; the book is what's in between.
  for (const el of doc.querySelectorAll('#pg-header, #pg-footer, .pg-boilerplate, #pg-machine-header, #pg-start-separator, #pg-end-separator')) el.remove()
  // Wikipedia and other MediaWiki sites: notes about other pages, edit links, footnote marks.
  for (const el of doc.querySelectorAll('.hatnote, .mw-editsection, .navbox, .ambox, .shortdescription, sup.reference, .mw-jump-link, .noprint, .sidebar, .vertical-navbox')) el.remove()
  // An infobox becomes its picture and caption; its table of facts reads badly as an article.
  for (const box of doc.querySelectorAll('table.infobox')) {
    const img = box.querySelector('img')
    const w = img ? Number(img.getAttribute('width')) || 0 : 0
    if (!img || (w && w < 120)) { box.remove(); continue }
    const fig = doc.createElement('figure')
    fig.append(img)
    const cap = box.querySelector('.infobox-caption')
    if (cap) { const c = doc.createElement('figcaption'); c.textContent = cap.textContent.trim(); fig.append(c) }
    box.replaceWith(fig)
  }
  const gutenberg = /^the project gutenberg e-?book of (.+?)(?:,\s+by\s+(.+))?$/i.exec(info.title || clean(doc.title))
  if (gutenberg) { info.title = gutenberg[1]; if (gutenberg[2] && !info.author) info.author = gutenberg[2] }

  let parsed = null
  try {
    // Pictures that load lazily keep their real address elsewhere; put it where Readability looks.
    for (const img of doc.querySelectorAll('img')) {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('data-url')
      const set = img.getAttribute('srcset') || img.getAttribute('data-srcset')
      const best = set ? pickSrcset(set) : ''
      if (best) img.setAttribute('src', best)
      else if (lazy && (!img.getAttribute('src') || /^data:|placeholder|blank|spacer/.test(img.getAttribute('src')))) img.setAttribute('src', lazy)
    }
    for (const pic of doc.querySelectorAll('picture')) {
      const img = pic.querySelector('img')
      const source = pic.querySelector('source[srcset]')
      if (img && source && !img.getAttribute('src')) img.setAttribute('src', pickSrcset(source.getAttribute('srcset')))
    }
    parsed = new Readability(doc, { charThreshold: 350, keepClasses: false }).parse()
  } catch (e) { console.warn('readability', e) }

  const parsedTitle = clean(parsed && parsed.title)
  const title = tidyTitle((gutenberg ? info.title : '') || parsedTitle || info.title || fallbackTitle || hostOf(url), info.site || (parsed && parsed.siteName))
  // A publisher's legal name ("Wikimedia Foundation, Inc.") isn't what people call the site.
  const publisher = clean(parsed && parsed.siteName)
  const site = clean(info.site || (publisher && publisher.length <= 28 && !/\b(inc|ltd|llc|gmbh|foundation|corporation|corp|limited|group|media)\b\.?/i.test(publisher) ? publisher : '')).slice(0, 80)
  if ((!parsed || !parsed.content || (parsed.length || 0) < 280) && given) parsed = { ...(parsed || {}), content: given, length: given.length }
  if (!parsed || !parsed.content || (parsed.length || 0) < 280 && !given) {
    return { status: 'link', title, site, excerpt: info.excerpt.slice(0, 400), image: ogImage, author: info.author, lang: info.lang, published: info.published, words: 0, html: '', text: info.excerpt }
  }

  const box = document.createElement('div')
  box.append(DOMPurify.sanitize(parsed.content, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, RETURN_DOM_FRAGMENT: true, ALLOW_DATA_ATTR: false }))

  // The title is shown above the article, so a heading that repeats it goes.
  const first = box.querySelector('h1, h2')
  if (first && similar(first.textContent, title) && box.textContent.trim().indexOf(first.textContent.trim()) < 200) first.remove()

  const images = {}
  let lead = ogImage
  for (const img of [...box.querySelectorAll('img')]) {
    const src = abs(img.getAttribute('src') || '')
    const w = Number(img.getAttribute('width')) || 0
    if (!src || /^data:/.test(src) || /\.svg(\?|$)/i.test(src) && !w) { unwrapFigure(img); continue }
    // A picture of the title (some sites set their headlines as images) repeats it.
    if (similar(img.getAttribute('alt') || '', title)) { unwrapFigure(img); continue }
    if (w && w < 48) { img.setAttribute('data-small', '') }
    const h = await sha(src)
    if (Object.keys(images).length < 80) images[h] = src
    img.setAttribute('src', '/i/' + h)
    img.setAttribute('data-orig', src)
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    if (!lead && (!w || w >= 300)) lead = src
  }
  // Ids are kept for footnotes, renamed so they can't clash with the app's own.
  for (const el of box.querySelectorAll('[id]')) el.setAttribute('id', 'a-' + el.getAttribute('id').replace(/[^\w-]/g, '').slice(0, 60))
  for (const a of box.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    if (/^#/.test(href)) { a.setAttribute('href', '#a-' + href.slice(1).replace(/[^\w-]/g, '').slice(0, 60)); continue }
    const out = abs(href)
    if (out) a.setAttribute('href', out)
    else a.replaceWith(...a.childNodes)
  }
  // Gutenberg's start and end lines, and a "by …" line that repeats the byline.
  for (const el of [...box.querySelectorAll('p, div, h1, h2, h3, h4, h5, pre')]) {
    if (!box.contains(el)) continue
    const t = clean(el.textContent)
    if (/^\*{3}\s*end of (the|this) project gutenberg/i.test(t)) { let n = el; while (n && n !== box) { while (n.nextSibling) n.nextSibling.remove(); n = n.parentNode } el.remove(); continue }
    if (/^\*{3}\s*start of (the|this) project gutenberg/i.test(t) && t.length < 200) { el.remove(); continue }
  }
  const author = clean(parsed.byline || info.author).replace(/^by\s+/i, '').replace(/^contributors to .*$/i, '')
  for (const el of [...box.querySelectorAll('h1, h2, h3, h4, p')].slice(0, 4)) {
    const t = clean(el.textContent)
    if (author && /^by\s+/i.test(t) && similar(t.replace(/^by\s+/i, ''), author)) el.remove()
  }
  // A rule with nothing before it (or after it) separates nothing.
  for (const hr of [...box.querySelectorAll('hr')]) {
    const before = document.createRange(); before.setStart(box, 0); before.setEndBefore(hr)
    const after = document.createRange(); after.setStartAfter(hr); after.setEnd(box, box.childNodes.length)
    if (!before.toString().trim() || !after.toString().trim()) hr.remove()
  }
  for (const table of box.querySelectorAll('table')) {
    const wrap = document.createElement('div')
    wrap.className = 'table'
    table.replaceWith(wrap)
    wrap.append(table)
  }
  for (const el of box.querySelectorAll('p, div, span, section')) if (!el.textContent.trim() && !el.querySelector('img, br, hr, table')) el.remove()
  const leadInBody = lead && Object.values(images)[0] === lead

  const text = plainText(box)
  const words = countWords(text)
  // The excerpt: the page's own description, or else the first real paragraph (not a caption).
  let excerpt = info.excerpt
  if (!excerpt || excerpt.length < 40) {
    for (const p of box.querySelectorAll('p')) {
      if (p.closest('figure, figcaption, blockquote, li, table')) continue
      const t = clean(p.textContent)
      if (t.length >= 80 && !/^\*{3}/.test(t)) { excerpt = t; break }
    }
  }
  excerpt = clean(excerpt || parsed.excerpt).replace(/\s*\[[a-z\d]{1,3}\]/gi, '').replace(/\s*\((?:[^()]{0,90})\)/, '').slice(0, 400)
  return {
    status: 'ready',
    title,
    site,
    author: author.slice(0, 120),
    excerpt,
    image: lead || '',
    leadInBody,
    lang: clean(parsed.lang || info.lang).slice(0, 12),
    dir: parsed.dir === 'rtl' ? 'rtl' : '',
    published: clean(parsed.publishedTime || info.published).slice(0, 40),
    words,
    html: box.innerHTML,
    text,
    images
  }
}

function pickSrcset(set) {
  let best = ''
  let bestScore = -1
  for (const part of String(set).split(/,\s+(?=\S)/)) {
    const [u, d] = part.trim().split(/\s+/)
    if (!u) continue
    const n = parseFloat(d) || 1
    const w = /w$/.test(d || '') ? n : n * 600
    const score = w <= 1600 ? w : 3200 - w
    if (score > bestScore) { bestScore = score; best = u }
  }
  return best
}

function unwrapFigure(img) {
  const fig = img.closest('figure')
  if (fig && fig.querySelectorAll('img').length === 1) fig.remove()
  else img.remove()
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const norm = (s) => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const similar = (a, b) => { const x = norm(a); const y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)) }

// "How to Do Great Work | Paul Graham" → "How to Do Great Work".
function tidyTitle(title, site) {
  const parts = title.split(/\s+[|–—·•»:-]\s+/)
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    if ((site && similar(last, site)) || last.length < 28 && parts[0].length > 18) return parts.slice(0, -1).join(' – ')
  }
  return title.slice(0, 300)
}

// The article's words with a blank line between blocks, for search and for Claude.
export function plainText(root) {
  let out = ''
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.nodeValue.replace(/\s+/g, ' ')
      else if (child.nodeType === 1) {
        const block = BLOCK.has(child.tagName)
        if (block && !/\n\n$/.test(out)) out = out.replace(/ +$/, '') + (child.tagName === 'BR' || child.tagName === 'LI' || child.tagName === 'TR' ? '\n' : '\n\n')
        if (child.tagName === 'IMG') continue
        walk(child)
        if (block && !/\n$/.test(out)) out = out.replace(/ +$/, '') + '\n\n'
      }
    }
  }
  walk(root)
  return out.replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function countWords(text) {
  const cjk = (text.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length
  const latin = (text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length
  return latin + Math.round(cjk / 2)
}
