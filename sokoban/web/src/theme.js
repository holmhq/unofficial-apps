// Sokoban — palettes + theme/palette application.
// Each palette is a coordinated set of flat pastel colours for the three game
// entities (box, box-on-goal, player) plus one accent that drives the chrome.
// Tiles are drawn on canvas; the accent is exposed as the `--accent` CSS var.

import { prefs } from './state.js'

export const PALETTES = [
  {
    id: 'bloom',
    label: 'Bloom',
    accent: '#b197dc',
    tiles: { box: '#f0b27a', boxDone: '#8fd3a8', player: '#7ec4e8' }
  },
  {
    id: 'mist',
    label: 'Mist',
    accent: '#8fb0cc',
    tiles: { box: '#cdb08c', boxDone: '#a4c9be', player: '#97a0c2' }
  },
  {
    id: 'sage',
    label: 'Sage',
    accent: '#8fb5a0',
    tiles: { box: '#c2a77e', boxDone: '#8fb89a', player: '#a39eba' }
  },
  {
    id: 'soda',
    label: 'Soda',
    accent: '#bf9ad6',
    tiles: { box: '#f2b074', boxDone: '#92d6a6', player: '#8fb8e0' }
  },
  {
    id: 'mono',
    label: 'Mono',
    accent: '#b0aeb8',
    tiles: { box: '#d2c9bc', boxDone: '#cdcac0', player: '#caccd2' }
  }
]

export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES[0]
}

export function effectiveDark(mode = prefs.theme) {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return matchMedia('(prefers-color-scheme: dark)').matches
}

function apply() {
  const root = document.documentElement
  root.setAttribute('data-theme', prefs.theme)
  root.setAttribute('data-palette', prefs.palette)
  const p = paletteById(prefs.palette)
  root.style.setProperty('--accent', p.accent)
  // soft accent derived for chips/hovers
  root.style.setProperty('--accent-soft', hexToRgba(p.accent, effectiveDark() ? 0.22 : 0.16))
  const bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', effectiveDark() ? '#101014' : '#f4f3f7')
}

let sysMql = null
export function init() {
  apply()
  prefs.on(apply)
  sysMql = matchMedia('(prefers-color-scheme: dark)')
  sysMql.addEventListener('change', () => {
    if (prefs.theme === 'system') apply()
  })
}

export { apply }

/* ---- colour helpers (used by the canvas renderer) -------------------- */

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// amt in [-1, 1]: negative darkens toward black, positive lightens toward white.
export function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex)
  if (amt >= 0) {
    return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
  }
  const k = 1 + amt
  return rgbToHex(r * k, g * k, b * k)
}

export function hexToRgba(hex, a) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
