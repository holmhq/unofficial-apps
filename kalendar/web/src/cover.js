// The picture a link to your page shows when it's shared: your name, what
// you do and your photo, when there's a real one, on your colour. The
// server can't draw, so your dashboard does: whenever something on it
// changes, it draws a new one and sends it to the server, which puts it in
// your page's link previews. The server names what a cover shows with a key
// (api/hosts.js), and shows only the one drawn from your current details.
import { state } from './shell.js'
import * as store from './store.js'

export const W = 1200
export const H = 630
const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
const GLYPH = 'M6.5 4h11a4 4 0 0 1 4 4v9.5a4 4 0 0 1-4 4h-11a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm0 6.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2ZM7.3 1.5a1.3 1.3 0 0 1 1.3 1.3v1.9a1.3 1.3 0 0 1-2.6 0V2.8a1.3 1.3 0 0 1 1.3-1.3Zm9.4 0A1.3 1.3 0 0 1 18 2.8v1.9a1.3 1.3 0 0 1-2.6 0V2.8a1.3 1.3 0 0 1 1.3-1.3Zm-1.2 11.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Z'

// Each colour's light shades, as on the page and the tab icon.
const COLOURS = {
  red: { fill: '#e0352b', top: '#ff5b50', on: '#ffffff', text: '#d0261c' },
  amber: { fill: '#f5a00a', top: '#ffbe45', on: '#1d1d1f', text: '#b25000' },
  teal: { fill: '#0b8a8f', top: '#22aeb2', on: '#ffffff', text: '#007a80' },
  blue: { fill: '#0a66d8', top: '#2f8fff', on: '#ffffff', text: '#0060d0' },
  violet: { fill: '#7b45e6', top: '#9b70ff', on: '#ffffff', text: '#6d36d9' },
  graphite: { fill: '#1d1d1f', top: '#4a4a4f', on: '#ffffff', text: '#1d1d1f' }
}

/* ---- The photo --------------------------------------------------------------------
   Only a real photo goes on the cover. Holm gives everyone without one a
   drawn avatar, an SVG; a photo from a sign-in service or an upload is a
   JPEG, PNG or WebP. Some services hand over a drawn stand-in of their own
   (a letter on a colour, a pattern, a silhouette): those are a few flat
   colours where a photo has thousands, so a picture whose two commonest
   colours cover most of it isn't a photo either. */

export async function photoOf(url) {
  if (!url) return null
  try {
    const r = await fetch(url, { credentials: 'same-origin' })
    if (!r.ok || !/^image\/(jpeg|png|webp|avif|gif)\b/.test(r.headers.get('content-type') || '')) return null
    const img = new Image()
    img.src = URL.createObjectURL(await r.blob())
    try { await img.decode() } finally { URL.revokeObjectURL(img.src) }
    return real(img) ? img : null
  } catch {
    return null
  }
}

function real(img) {
  const n = 40
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0, n, n)
  let px
  try { px = g.getImageData(0, 0, n, n).data } catch { return false }
  const counts = new Map()
  let seen = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    counts.set(k, (counts.get(k) || 0) + 1)
    seen++
  }
  if (seen < n * n / 4) return false
  const [a = 0, b = 0] = [...counts.values()].sort((x, y) => y - x)
  return (a + b) / seen < 0.75
}

/* ---- Drawing ----------------------------------------------------------------------- */

const font = (weight, size) => `${weight} ${size}px ${FONT}`
const spacing = (g, px) => { if ('letterSpacing' in g) g.letterSpacing = px + 'px' }
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Text in at most `max` lines of `width`, the type shrinking from `size` to
// `min` until it fits; if it still doesn't, the last line ends in …
function fit(g, text, { weight, size, min, width, max, track = 0 }) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  for (let s = size; ; s -= 2) {
    g.font = font(weight, s)
    spacing(g, track * s)
    const out = []
    let line = ''
    for (const w of words) {
      const next = line ? line + ' ' + w : w
      if (!line || g.measureText(next).width <= width) line = next
      else { out.push(line); line = w }
    }
    if (line) out.push(line)
    const fits = out.length <= max && out.every((l) => g.measureText(l).width <= width)
    if (fits || s <= min) {
      const lines = out.slice(0, max)
      if (!fits) {
        let last = lines[lines.length - 1]
        if (out.length > max) last += ' ' + out.slice(max).join(' ')
        while (last.length > 1 && g.measureText(last + '…').width > width) last = last.slice(0, -1).trimEnd()
        lines[lines.length - 1] = last + '…'
      }
      return { size: s, lines }
    }
  }
}

function mark(g, x, y, size, fill, ink) {
  g.beginPath()
  g.roundRect(x, y, size, size, size * 0.24)
  g.fillStyle = fill
  g.fill()
  g.save()
  g.translate(x + size * 0.15, y + size * 0.165)
  g.scale(size * 0.7 / 24, size * 0.7 / 24)
  g.fillStyle = ink
  g.fill(new Path2D(GLYPH))
  g.restore()
}

// The photo in a circle, filling it, a little above centre on a tall one.
function face(g, img, cx, cy, r) {
  const s = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - s) / 2
  const sy = Math.max(0, (img.naturalHeight - s) * 0.35)
  g.save()
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.clip()
  g.drawImage(img, sx, sy, s, s, cx - r, cy - r, r * 2, r * 2)
  g.restore()
}

function pill(g, x, y, label, { size, fill, ink, padX, height }) {
  g.font = font(640, size)
  spacing(g, -0.01 * size)
  const w = g.measureText(label).width + padX * 2
  g.beginPath()
  g.roundRect(x, y, w, height, height / 2)
  g.fillStyle = fill
  g.fill()
  g.fillStyle = ink
  g.textBaseline = 'middle'
  g.fillText(label, x + padX, y + height / 2 + 1)
  g.textBaseline = 'alphabetic'
  return w
}

// Your colour edge to edge, your name large, your photo in a ring.
function paint(g, host, photo, origin) {
  const c = COLOURS[host.theme] || COLOURS.red
  const bg = g.createLinearGradient(0, 0, W * 0.35, H)
  bg.addColorStop(0, c.top)
  bg.addColorStop(1, c.fill)
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(160, 0, 0, 160, 0, 760)
  glow.addColorStop(0, 'rgba(255,255,255,.16)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  const x = 84
  mark(g, x, 72, 52, alpha(c.on, 0.16), c.on)
  g.font = font(640, 30)
  spacing(g, -0.3)
  g.fillStyle = alpha(c.on, 0.92)
  g.fillText('Kalendar', x + 68, 108)

  const width = photo ? 590 : 1030
  const line = [host.role, host.company].map((s) => (s || '').trim()).filter(Boolean).join(' · ')
  const name = fit(g, host.name, { weight: 760, size: 96, min: 58, width, max: 2, track: -0.022 })
  const lead = name.size * 1.06
  let y = 330 - (name.lines.length * lead + (line ? 64 : 0)) / 2 + name.size * 0.78
  g.fillStyle = c.on
  g.font = font(760, name.size)
  spacing(g, -0.022 * name.size)
  for (const l of name.lines) { g.fillText(l, x, y); y += lead }
  if (line) {
    const role = fit(g, line, { weight: 520, size: 36, min: 26, width, max: 1 })
    g.fillStyle = alpha(c.on, 0.8)
    g.fillText(role.lines[0], x, y - lead + name.size * 0.22 + 52)
  }

  const w = pill(g, x, 494, 'Book a time', { size: 28, fill: c.on, ink: c.on === '#ffffff' ? c.text : c.fill, padX: 30, height: 64 })
  g.font = font(520, 28)
  spacing(g, -0.2)
  g.fillStyle = alpha(c.on, 0.78)
  g.textBaseline = 'middle'
  g.fillText(`${origin}/@${host.handle}`, x + w + 24, 527)
  g.textBaseline = 'alphabetic'

  if (photo) {
    g.beginPath()
    g.arc(912, 315, 186, 0, Math.PI * 2)
    g.fillStyle = alpha(c.on, 0.22)
    g.fill()
    face(g, photo, 912, 315, 174)
  }
}

export async function draw(host, { photo, origin = location.host } = {}) {
  await Promise.all([document.fonts.load(font(760, 96)), document.fonts.load(font(520, 28))]).catch(() => {})
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  paint(canvas.getContext('2d'), host, photo === undefined ? await photoOf(host.picture) : photo, origin)
  return canvas
}

/* ---- Keeping it current ---------------------------------------------------------------
   Called whenever your details may have changed. A moment after the last
   change it draws, sends, and tells the page (a "kalendar:cover" event, with
   the picture to show while the server's copy is on its way). */

let timer = null
let sending = null
export let latest = null // { key, url } of the last one drawn here

export function keep(wait = 1500) {
  clearTimeout(timer)
  const host = state.me && state.me.host
  if (!host || !host.coverKey || host.cover === host.coverKey || sending === host.coverKey) return
  timer = setTimeout(send, wait)
}

async function send() {
  const host = state.me && state.me.host
  if (!host || host.cover === host.coverKey || sending) return
  const key = host.coverKey
  sending = key
  try {
    const canvas = await draw(host)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    if (latest) URL.revokeObjectURL(latest.url)
    latest = { key, url: URL.createObjectURL(blob) }
    dispatchEvent(new CustomEvent('kalendar:cover'))
    const r = await fetch('/api/host/cover?key=' + key, { method: 'PUT', headers: { 'content-type': 'image/jpeg', accept: 'application/json' }, body: blob })
    if (r.ok && state.me && state.me.host && state.me.host.coverKey === key) {
      state.me.host.cover = key
      store.keep('me', state.me)
      dispatchEvent(new CustomEvent('kalendar:cover'))
    }
  } catch {
    // Offline, or the details changed meanwhile: the next change or visit tries again.
  } finally {
    sending = null
    // Changed while this one was drawn or sent: draw again.
    const now = state.me && state.me.host
    if (now && now.coverKey !== key) keep()
  }
}
