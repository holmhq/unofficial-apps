// Small pieces the list and the reader share: a site's letter tile and friendly dates.

import { h } from './ui.js'

const TILES = ['#3b6e4f', '#4b57e0', '#b5562a', '#7a5a2a', '#c4607a', '#0e7c96', '#6a3fe0', '#5b6472', '#9a3b3b', '#2f6f8f']

// A site's tile: the first letter of its name on a colour that's always the same for it.
// (Fetching sites' own icons would tell every site when you read.)
export function favicon(item, size = 16) {
  const host = item.host || ''
  const name = (item.site || host.replace(/^(www|m|en|blog|news)\./, '')).trim()
  let n = 5
  for (const ch of host) n = (n * 33 + ch.charCodeAt(0)) >>> 0
  const letter = ([...name.replace(/^the\s+/i, '')].find((c) => /[\p{L}\p{N}]/u.test(c)) || '·').toUpperCase()
  return h('span.fav', { 'aria-hidden': 'true', style: { background: TILES[n % TILES.length], width: size + 'px', height: size + 'px', 'font-size': Math.round(size * 0.6) + 'px', 'border-radius': Math.round(size * 0.28) + 'px' } }, letter)
}

// "just now", "today", "yesterday", "Tuesday", "3 Oct", "3 Oct 2024".
export function when(at, now = Date.now()) {
  if (!at) return ''
  const d = new Date(at)
  const s = (now - at) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return Math.round(s / 60) + ' min ago'
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  if (at >= today.getTime()) return 'today'
  if (at >= today.getTime() - 864e5) return 'yesterday'
  if (at >= today.getTime() - 6 * 864e5) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

export function plural(n, word, many = word + 's') {
  return n.toLocaleString() + ' ' + (n === 1 ? word : many)
}
