// Everything on your shelf as one ZIP file, made here in the browser:
//
//   Highlights/<title>.md   one Markdown file per book or article you highlighted, with front
//                           matter, for Obsidian, Logseq or Notion (Notion imports a folder of them)
//   Articles/<title>.md     the articles themselves, if asked for
//   highlights.csv          in the layout Readwise's CSV import takes (tags ride in the note as
//                           Readwise's ".tag" words)
//   library.csv             every saved thing, in Readwise Reader's export columns and a few more
//   feeds.opml              the feeds you follow
//   shelf.json              all of it, to bring back into Shelf or anything else

import { writeZip } from './zip.js'
import { lib, everyHighlight, all, article } from './store.js'

const pad = (n) => String(n).padStart(2, '0')
const stamp = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const day = (t) => (t ? stamp(t).slice(0, 10) : '')
const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const csvOf = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
const yaml = (s) => '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'

function fileName(title, used) {
  let base = String(title || 'Untitled').replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '') || 'Untitled'
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`
  used.add(name.toLowerCase())
  return name
}

const quoteBlock = (text) => text.trim().split(/\n+/).map((line) => '> ' + line.trim()).join('\n>\n')

function sourceMarkdown(it, marks, origin) {
  const lines = ['---', `title: ${yaml(it.title)}`]
  if (it.author) lines.push(`author: ${yaml(it.author)}`)
  if (it.url) lines.push(`source: ${yaml(it.url)}`)
  if (it.site || it.host) lines.push(`site: ${yaml(it.site || it.host)}`)
  lines.push(`kind: ${it.kind === 'notes' ? 'book' : it.kind || 'article'}`)
  if (it.tags && it.tags.length) lines.push(`tags: [${it.tags.map((t) => yaml(t)).join(', ')}]`)
  if (it.saved) lines.push(`saved: ${day(it.saved)}`)
  lines.push(`shelf: ${yaml(origin + '/read/' + it.id)}`, '---', '', `# ${it.title || 'Untitled'}`, '')
  if (it.note) lines.push(it.note, '')
  if (it.summary && it.summary.length) lines.push('## Summary', '', ...it.summary.map((p) => '- ' + p), '')
  lines.push('## Highlights', '')
  for (const m of marks) {
    lines.push(quoteBlock(m.quote), '')
    if (m.note) lines.push(m.note, '')
    const meta = []
    if (m.fav) meta.push('★')
    if (m.tags && m.tags.length) meta.push(m.tags.map((t) => '#' + t).join(' '))
    if (m.loc) meta.push(m.loc)
    if (m.end) meta.push(`[Open in Shelf](${origin}/read/${it.id}?at=${m.id})`)
    if (meta.length) lines.push(meta.join(' · '), '')
  }
  return lines.join('\n')
}

/* ---- Articles as Markdown ------------------------------------------------------------------------- */

function markdownOf(html, origin) {
  const doc = new DOMParser().parseFromString('<body>' + html, 'text/html')
  const out = []
  const inline = (node) => {
    let s = ''
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.nodeValue.replace(/\s+/g, ' ')
      else if (c.nodeType !== 1) continue
      else {
        const t = c.tagName
        const inner = inline(c)
        if (t === 'A') { const href = c.getAttribute('href') || ''; s += /^https?:/.test(href) ? `[${inner.trim()}](${href})` : inner }
        else if (t === 'EM' || t === 'I') s += inner.trim() ? `*${inner.trim()}*` : ''
        else if (t === 'STRONG' || t === 'B') s += inner.trim() ? `**${inner.trim()}**` : ''
        else if (t === 'CODE') s += '`' + c.textContent + '`'
        else if (t === 'BR') s += '  \n'
        else if (t === 'IMG') { const src = c.getAttribute('src') || ''; if (src) s += `![${c.getAttribute('alt') || ''}](${src.startsWith('/') ? origin + src : src})` }
        else s += inner
      }
    }
    return s
  }
  const block = (node, prefix = '') => {
    for (const c of node.children) {
      const t = c.tagName
      if (/^H[1-6]$/.test(t)) out.push(prefix + '#'.repeat(Math.min(6, Number(t[1]) + 1)) + ' ' + inline(c).trim(), '')
      else if (t === 'P' || t === 'FIGCAPTION' || t === 'DT' || t === 'DD') { const x = inline(c).trim(); if (x) out.push(prefix + x, '') }
      else if (t === 'BLOCKQUOTE') block(c, prefix + '> ')
      else if (t === 'UL' || t === 'OL') {
        let n = Number(c.getAttribute('start')) || 1
        for (const li of c.children) if (li.tagName === 'LI') out.push(prefix + (t === 'OL' ? `${n++}. ` : '- ') + inline(li).trim())
        out.push('')
      } else if (t === 'PRE') out.push(prefix + '```', ...c.textContent.replace(/\n$/, '').split('\n').map((l) => prefix + l), prefix + '```', '')
      else if (t === 'HR') out.push('---', '')
      else if (t === 'IMG') { const x = inline({ childNodes: [c] }); if (x) out.push(prefix + x, '') }
      else if (t === 'TABLE') {
        for (const tr of c.querySelectorAll('tr')) out.push(prefix + '| ' + [...tr.children].map((td) => inline(td).trim().replace(/\|/g, '\\|')).join(' | ') + ' |')
        out.push('')
      } else if (c.children.length) block(c, prefix)
      else { const x = inline(c).trim(); if (x) out.push(prefix + x, '') }
    }
  }
  block(doc.body)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/* ---- The whole thing ------------------------------------------------------------------------------- */

export async function exportShelf({ articles = false, feeds = [], onStep = () => {} } = {}) {
  const origin = location.origin
  const items = all().sort((a, b) => (a.saved || 0) - (b.saved || 0))
  onStep('Gathering your highlights…', 0)
  const { marks } = await everyHighlight((n) => onStep(`Gathering your highlights… ${n.toLocaleString()}`, 0.1))
  const byItem = new Map()
  for (const m of marks) { if (!byItem.has(m.item)) byItem.set(m.item, []); byItem.get(m.item).push(m) }
  const order = (a, b) => (a.end ? a.start - b.start : 0) || (num(a.loc) - num(b.loc)) || ((a.at || 0) - (b.at || 0))
  const num = (loc) => { const n = /\d+/.exec(loc || ''); return n ? Number(n[0]) : 0 }

  const files = []
  const used = new Set()
  const names = new Map()
  for (const it of items) {
    const list = byItem.get(it.id)
    if (!list || !list.length) continue
    const name = fileName(it.title, used)
    names.set(it.id, name)
    files.push({ name: `Shelf/Highlights/${name}.md`, data: sourceMarkdown(it, list.sort(order), origin), date: it.saved })
  }

  if (articles) {
    const ready = items.filter((i) => i.status === 'ready')
    const usedA = new Set()
    for (let n = 0; n < ready.length; n++) {
      const it = ready[n]
      onStep(`Writing out articles… ${n + 1} of ${ready.length}`, 0.2 + 0.7 * (n / ready.length))
      try {
        const html = await article(it)
        const head = ['---', `title: ${yaml(it.title)}`, it.author ? `author: ${yaml(it.author)}` : null, it.url ? `source: ${yaml(it.url)}` : null, `saved: ${day(it.saved)}`, '---', '', `# ${it.title || 'Untitled'}`, ''].filter((x) => x !== null)
        files.push({ name: `Shelf/Articles/${fileName(it.title, usedA)}.md`, data: head.join('\n') + markdownOf(html, origin), date: it.saved })
      } catch {}
    }
  }

  onStep('Packing it up…', 0.95)
  const titleOf = new Map(items.map((i) => [i.id, i]))
  const hl = [['Highlight', 'Title', 'Author', 'URL', 'Note', 'Location', 'Date']]
  for (const m of marks.slice().sort((a, b) => (a.at || 0) - (b.at || 0))) {
    const it = titleOf.get(m.item)
    if (!it) continue
    const note = [m.note, ...(m.tags || []).map((t) => '.' + t), m.fav ? '.favorite' : ''].filter(Boolean).join(' ')
    hl.push([m.quote, it.title, it.author || '', it.url || '', note, num(m.loc) || '', stamp(m.at)])
  }
  files.push({ name: 'Shelf/highlights.csv', data: csvOf(hl) })

  const where = (i) => (i.kind === 'notes' ? 'archive' : i.state === 'feed' ? 'feed' : i.state === 'archived' ? 'archive' : 'later')
  const lib1 = [['Title', 'URL', 'ID', 'Document tags', 'Saved date', 'Reading progress', 'Location', 'Seen', 'Author', 'Site', 'Words', 'Favourite', 'Highlights', 'Note']]
  for (const i of items) lib1.push([i.title, i.url || '', i.id, (i.tags || []).join(', '), stamp(i.saved), i.progress || 0, where(i), i.state === 'feed' ? String(!!i.seen) : 'true', i.author || '', i.site || i.host || '', i.words || 0, i.fav ? 'true' : 'false', i.marks || 0, i.note || ''])
  files.push({ name: 'Shelf/library.csv', data: csvOf(lib1) })

  if (feeds.length) {
    const { writeOPML } = await import('./feeds.js')
    files.push({ name: 'Shelf/feeds.opml', data: writeOPML(feeds) })
  }

  files.push({ name: 'Shelf/shelf.json', data: JSON.stringify({ app: 'shelf', exported: new Date().toISOString(), items, highlights: marks, feeds }, null, 1) })
  onStep('Done', 1)
  return { blob: writeZip(files), counts: { items: items.length, highlights: marks.length, sources: names.size } }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
