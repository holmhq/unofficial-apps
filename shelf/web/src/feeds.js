// Reading feeds in the browser: RSS 2.0, RSS 1.0, Atom and JSON Feed, the feed a web page
// points to, and OPML lists of subscriptions. The server only fetches; this file reads.

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '')
const local = (el, name) => {
  if (!el) return null
  for (const c of el.children) if (c.localName === name) return c
  return null
}
const locals = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : [])
const ns = (el, uri, name) => (el && el.getElementsByTagNameNS ? el.getElementsByTagNameNS(uri, name)[0] || null : null)

const MEDIA = 'http://search.yahoo.com/mrss/'
const YT = 'http://www.youtube.com/xml/schemas/2015'

function absolute(href, base) {
  try { return new URL(String(href || '').trim(), base).href } catch { return '' }
}

const when = (s) => {
  const t = Date.parse(String(s || '').trim())
  return Number.isFinite(t) ? t : 0
}

// Plain words from a bit of HTML, for an excerpt.
function plain(html, max = 400) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString('<body>' + html, 'text/html')
  for (const el of doc.querySelectorAll('script, style, figure, img, iframe')) el.remove()
  const t = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t
}

function firstImage(html, base) {
  if (!html) return ''
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
  return m ? absolute(m[1], base) : ''
}

// Words in a bit of HTML, to tell a full article in the feed from a teaser.
const wordsIn = (html) => (plain(html, 1e7).match(/\S+/g) || []).length

// A feed's title, its site and its newest entries, or null when it isn't a feed.
export function parseFeed(body, base) {
  const trimmed = String(body || '').replace(/^﻿/, '').trim()
  if (trimmed.startsWith('{')) return jsonFeed(trimmed, base)
  if (!/^<(\?xml|rss|feed|rdf:RDF)\b/i.test(trimmed) && !/<(rss|feed|rdf:RDF)\b/i.test(trimmed.slice(0, 2000))) return null
  const doc = new DOMParser().parseFromString(trimmed, 'application/xml')
  if (doc.querySelector('parsererror')) return null
  const root = doc.documentElement
  if (root.localName === 'feed') return atom(root, base)
  if (root.localName === 'rss' || root.localName === 'RDF') return rss(root, base)
  return null
}

function rss(root, base) {
  const channel = local(root, 'channel')
  if (!channel) return null
  const site = absolute(text(local(channel, 'link')), base) || base
  const image = local(channel, 'image')
  // RSS 1.0 keeps its items beside the channel, 2.0 inside it.
  const items = [...locals(channel, 'item'), ...locals(root, 'item')].slice(0, 60).map((it) => {
    const link = absolute(text(local(it, 'link')) || (local(it, 'guid') && local(it, 'guid').getAttribute('isPermaLink') !== 'false' ? text(local(it, 'guid')) : ''), site)
    const content = text(local(it, 'encoded')) ? local(it, 'encoded').textContent : ''
    const description = local(it, 'description') ? local(it, 'description').textContent : ''
    const thumb = ns(it, MEDIA, 'thumbnail') || ns(it, MEDIA, 'content')
    const enclosure = local(it, 'enclosure')
    const img = (thumb && thumb.getAttribute('url')) || (enclosure && /^image\//.test(enclosure.getAttribute('type') || '') ? enclosure.getAttribute('url') : '') || firstImage(content || description, link)
    return entry({
      url: link,
      guid: text(local(it, 'guid')) || link,
      title: text(local(it, 'title')),
      author: text(local(it, 'creator')) || text(local(it, 'author')),
      published: when(text(local(it, 'pubDate')) || text(local(it, 'date'))),
      html: content || (wordsIn(description) > 350 ? description : ''),
      excerpt: plain(description || content),
      image: absolute(img, link)
    })
  })
  return { title: text(local(channel, 'title')), site, icon: image ? absolute(text(local(image, 'url')), site) : '', items: items.filter(Boolean) }
}

function atom(root, base) {
  const linkOf = (el, rel = 'alternate') => {
    const links = locals(el, 'link')
    const l = links.find((x) => (x.getAttribute('rel') || 'alternate') === rel && !/xml|json/.test(x.getAttribute('type') || '')) || (rel === 'alternate' ? links.find((x) => !x.getAttribute('rel')) : null)
    return l ? absolute(l.getAttribute('href'), base) : ''
  }
  const site = linkOf(root) || base
  const items = locals(root, 'entry').slice(0, 60).map((e) => {
    const link = linkOf(e) || absolute(text(local(e, 'id')), site)
    const contentEl = local(e, 'content')
    const summaryEl = local(e, 'summary')
    const content = contentEl && /html/.test(contentEl.getAttribute('type') || '') ? contentEl.textContent : contentEl && contentEl.getAttribute('type') === 'xhtml' ? contentEl.innerHTML : ''
    const summary = summaryEl ? summaryEl.textContent : ''
    // YouTube's channel feeds: a video with its picture and description.
    const video = ns(e, YT, 'videoId')
    const group = ns(e, MEDIA, 'group')
    const thumb = ns(group || e, MEDIA, 'thumbnail')
    const described = ns(group || e, MEDIA, 'description')
    // A video's description becomes its words, paragraph by paragraph.
    const description = described ? described.textContent.trim() : ''
    const videoHTML = video && description ? '<p>' + description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>' : ''
    return entry({
      url: link,
      guid: text(local(e, 'id')) || link,
      title: text(local(e, 'title')),
      author: text(local(local(e, 'author'), 'name')) || text(local(local(root, 'author'), 'name')),
      published: when(text(local(e, 'published')) || text(local(e, 'updated'))),
      html: video ? videoHTML : wordsIn(content) > 120 ? content : '',
      excerpt: plain(summary || content || (described ? described.textContent : '')),
      image: (thumb && absolute(thumb.getAttribute('url'), link)) || firstImage(content || summary, link),
      video: video ? text(video) : ''
    })
  })
  const icon = text(local(root, 'icon')) || text(local(root, 'logo'))
  return { title: text(local(root, 'title')), site, icon: icon ? absolute(icon, site) : '', items: items.filter(Boolean) }
}

function jsonFeed(body, base) {
  let data
  try { data = JSON.parse(body) } catch { return null }
  if (!data || !/jsonfeed\.org/.test(data.version || '') || !Array.isArray(data.items)) return null
  const site = absolute(data.home_page_url, base) || base
  const items = data.items.slice(0, 60).map((it) => entry({
    url: absolute(it.url || it.external_url || it.id, site),
    guid: String(it.id || it.url || ''),
    title: String(it.title || ''),
    author: (it.authors && it.authors[0] && it.authors[0].name) || (it.author && it.author.name) || '',
    published: when(it.date_published || it.date_modified),
    html: it.content_html && wordsIn(it.content_html) > 120 ? it.content_html : '',
    excerpt: it.summary || plain(it.content_html || '') || String(it.content_text || '').slice(0, 400),
    image: absolute(it.image || it.banner_image || firstImage(it.content_html, site), site)
  }))
  return { title: String(data.title || ''), site, icon: absolute(data.icon || data.favicon || '', site), items: items.filter(Boolean) }
}

function entry(e) {
  if (!e.url || !/^https?:\/\//i.test(e.url)) return null
  return {
    url: e.url,
    guid: String(e.guid || e.url).slice(0, 500),
    title: (e.title || '').slice(0, 300),
    author: (e.author || '').slice(0, 120),
    published: e.published || 0,
    html: e.html || '',
    excerpt: (e.excerpt || '').slice(0, 500),
    image: e.image && /^https:\/\//i.test(e.image) ? e.image : '',
    video: e.video || ''
  }
}

// The feeds a page says it has, best first.
export function feedsIn(html, base) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const found = []
  for (const l of doc.querySelectorAll('link[rel~="alternate"][href]')) {
    const type = (l.getAttribute('type') || '').toLowerCase()
    if (!/rss|atom|feed\+json|application\/json/.test(type)) continue
    const href = absolute(l.getAttribute('href'), base)
    if (href && !/comments/i.test(href + (l.getAttribute('title') || '')) && !found.includes(href)) found.push(href)
  }
  return found
}

// Where feeds usually live, to try when a page doesn't say.
export function guesses(base) {
  const u = new URL(base)
  const root = u.origin
  const path = u.pathname.replace(/\/+$/, '')
  const out = []
  if (path) out.push(root + path + '/feed', root + path + '.rss', root + path + '/rss')
  out.push(root + '/feed', root + '/rss', root + '/feed.xml', root + '/atom.xml', root + '/index.xml', root + '/rss.xml', root + '/feed.json')
  return [...new Set(out)]
}

/* ---- OPML ------------------------------------------------------------------------------------- */

export function parseOPML(body) {
  const doc = new DOMParser().parseFromString(body, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const out = []
  for (const o of doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]')) {
    const url = o.getAttribute('xmlUrl') || o.getAttribute('xmlurl')
    const parent = o.parentElement && o.parentElement.localName === 'outline' ? (o.parentElement.getAttribute('title') || o.parentElement.getAttribute('text') || '') : ''
    if (/^https?:\/\//i.test(url || '')) out.push({ url: url.trim(), title: (o.getAttribute('title') || o.getAttribute('text') || '').trim(), site: o.getAttribute('htmlUrl') || '', folder: parent })
  }
  return out
}

const xml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function writeOPML(feeds) {
  const lines = feeds.map((f) => `    <outline type="rss" text="${xml(f.title || f.url)}" title="${xml(f.title || f.url)}" xmlUrl="${xml(f.url)}"${f.site ? ` htmlUrl="${xml(f.site)}"` : ''}/>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Shelf feeds</title></head>\n  <body>\n${lines.join('\n')}\n  </body>\n</opml>\n`
}
