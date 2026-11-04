// A Markdown file as an article: headings, paragraphs, lists, quotes, code, rules, links,
// pictures by address, emphasis and inline code. Everything is escaped first, and the reader
// cleans the result again with DOMPurify when it draws it.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safe = (url) => (/^(https?:|mailto:|#)/i.test(url) ? url : '')

function inline(text) {
  const code = []
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { code.push(c); return '\u0000' + (code.length - 1) + '\u0000' })
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => (safe(url) ? `<img src="${url}" alt="${alt}">` : alt))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => (safe(url) ? `<a href="${url}">${label}</a>` : label))
    .replace(/(^|[^*])\*\*([^*]+)\*\*/g, '$1<strong>$2</strong>')
    .replace(/(^|[^_])__([^_]+)__/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + code[Number(i)] + '</code>')
}

export function markdown(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '')
  const lines = src.split('\n')
  const out = []
  let title = ''
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const fence = /^(```|~~~)/.exec(line)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !lines[i].startsWith(fence[1])) body.push(lines[i++])
      i++
      out.push('<pre><code>' + esc(body.join('\n')) + '</code></pre>')
      continue
    }
    const head = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line)
    if (head) {
      if (!title && head[1].length === 1) { title = head[2].replace(/[*_`]/g, ''); i++; continue }
      out.push(`<h${head[1].length}>${inline(head[2])}</h${head[1].length}>`)
      i++
      continue
    }
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line.trim())) { out.push('<hr>'); i++; continue }
    if (/^>\s?/.test(line)) {
      const body = []
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''))
      out.push('<blockquote>' + markdown(body.join('\n')).html + '</blockquote>')
      continue
    }
    const list = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line)
    if (list) {
      const ordered = /\d/.test(list[2])
      const items = []
      while (i < lines.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i++].replace(/^(\s*)([-*+]|\d+[.)])\s+/, '')
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) item += ' ' + lines[i++].trim()
        items.push('<li>' + inline(item.replace(/^\[( |x)\]\s+/i, (m, x) => (x.trim() ? '☑ ' : '☐ '))) + '</li>')
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|```|~~~|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++].trim())
    out.push('<p>' + inline(para.join(' ')) + '</p>')
  }
  return { title, html: out.join('\n') }
}
