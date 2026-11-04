// Sharing a highlight: a public link (/q/<slug>) that shows the words, the article's title and
// link and the sharer's first name, and a card for link previews drawn here on a canvas in the
// reader's own typefaces. Notes are never shared.

import { h, ic, sheet, toast, copyField, wide } from './ui.js'
import { MARK } from './icons.js'
import * as api from './api.js'
import { lib } from './store.js'
import { failure } from './shell.js'

const W = 1200
const H = 630

function wrap(g, text, width) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word
    if (g.measureText(next).width <= width || !line) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

function ellipsize(g, text, width) {
  if (g.measureText(text).width <= width) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > width) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

export async function drawCard({ quote, title, site }) {
  try { await Promise.all([document.fonts.load('450 56px Newsreader'), document.fonts.load('600 26px Inter'), document.fonts.load('700 26px Inter')]) } catch {}
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#fbf8f2'
  g.fillRect(0, 0, W, H)

  // The words, as large as they fit in the top part, each line underlaid with a highlighter.
  const left = 84
  const width = W - left * 2
  const room = 360
  const text = '“' + quote.replace(/\s+/g, ' ').trim() + '”'
  let size = 84
  let lines = []
  for (; size >= 30; size -= 2) {
    g.font = `450 ${size}px Newsreader, Georgia, serif`
    lines = wrap(g, text, width)
    if (lines.length * size * 1.3 <= room) break
  }
  const lh = size * 1.3
  const fit = Math.floor(room / lh)
  if (lines.length > fit) {
    lines = lines.slice(0, fit)
    lines[fit - 1] = ellipsize(g, lines[fit - 1] + ' …', width).replace(/\s*…$/, '…')
  }
  let y = 78 + (room - lines.length * lh) / 2
  for (const line of lines) {
    const base = y + size * 0.98
    const w = g.measureText(line).width
    g.fillStyle = 'rgba(245, 196, 0, .45)'
    g.fillRect(left - 4, base - size * 0.4, w + 8, size * 0.52)
    g.fillStyle = '#22201c'
    g.fillText(line, left, base)
    y += lh
  }

  // Where it's from, and Shelf's mark.
  g.fillStyle = 'rgba(43, 38, 32, .14)'
  g.fillRect(left, 496, 64, 3)
  g.font = '600 28px Inter, system-ui, sans-serif'
  g.fillStyle = '#2b2620'
  g.fillText(ellipsize(g, title || site, 860), left, 548)
  g.font = '400 23px Inter, system-ui, sans-serif'
  g.fillStyle = '#7a7368'
  g.fillText(ellipsize(g, site || '', 760), left, 584)
  const tile = 58
  const tx = W - left - tile
  const ty = 528
  g.fillStyle = '#1d1d1f'
  g.beginPath()
  g.roundRect(tx, ty, tile, tile, 15)
  g.fill()
  g.save()
  g.translate(tx + 13, ty + 13)
  g.scale(32 / 24, 32 / 24)
  g.fillStyle = '#ffffff'
  g.fill(new Path2D(MARK))
  g.restore()
  g.font = '700 27px Inter, system-ui, sans-serif'
  g.fillStyle = '#1d1d1f'
  g.textAlign = 'right'
  g.fillText('Shelf', tx - 14, ty + 38)
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

export async function shareHighlight(item, mark) {
  let r
  try { r = await api.post('/api/marks/' + mark.id + '/share') } catch (e) { failure(e); return }
  const url = location.origin + '/q/' + r.slug
  let preview = '/q/' + r.slug + '/card.png'
  if (!r.card) {
    try {
      const blob = await drawCard({ quote: mark.quote, title: item.title || item.host, site: item.site || item.host })
      preview = URL.createObjectURL(blob)
      await fetch('/api/q/' + r.slug + '/card', { method: 'PUT', body: blob, headers: { 'content-type': 'image/png', 'x-shelf-page': api.PAGE } })
    } catch {}
  }
  const local = (lib.marks.get(item.id) || []).find((m) => m.id === mark.id)
  if (local) local.share = r.slug
  sheet({
    title: 'Share highlight',
    cancel: null,
    done: 'Done',
    body: (close) => [
      h('img.share-card', { src: preview, alt: 'The card people see when you share the link' }),
      h('p.sheet-note', 'Anyone with the link sees these words, the article’s title and link, and your first name. Notes stay private.'),
      copyField(url),
      navigator.share && !wide() ? h('button.btn.primary.large.block', { type: 'button', onclick: () => navigator.share({ url, title: '“' + mark.quote.slice(0, 80) + '”' }).catch(() => {}) }, ic('share', 18, 2), 'Share…') : null,
      h('button.btn.plain.block', { type: 'button', style: { color: 'var(--red-text)' }, onclick: async () => {
        try {
          await api.del('/api/marks/' + mark.id + '/share')
          if (local) local.share = ''
          close()
          toast('The link no longer works')
        } catch (e) { failure(e) }
      } }, 'Stop sharing')
    ]
  })
}
