// Snake — colour sets and light/dark. Each set gives the snake its colours
// from head to tail, the berry and the bloom, drawn on canvas by render.js,
// plus one accent for the chrome, exposed as the `--accent` CSS variable.

import { prefs } from './state.js'

export const PALETTES = [
  { id: 'coral', label: 'Coral', accent: '#c4607a', snake: ['#c4607a', '#f0b39b'], berry: '#e2a33a', bloom: '#5fa69e' },
  { id: 'koi', label: 'Koi', accent: '#dd7440', snake: ['#dd7440', '#f4d3b0'], berry: '#c4607a', bloom: '#4f8fc0' },
  { id: 'lagoon', label: 'Lagoon', accent: '#3d93a8', snake: ['#3d93a8', '#acd9cf'], berry: '#e8845c', bloom: '#d9a63a' },
  { id: 'ash', label: 'Ash', accent: '#998a90', snake: ['#8c7f85', '#d8cfd2'], berry: '#c39a78', bloom: '#a39bb8' }
]

export const BACKGROUND = { light: '#f8f0ee', dark: '#161112' }

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
  root.style.setProperty('--accent-soft', hexToRgba(p.accent, effectiveDark() ? 0.2 : 0.16))
  const bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', effectiveDark() ? BACKGROUND.dark : BACKGROUND.light)
}

export function init() {
  apply()
  prefs.on(apply)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (prefs.theme === 'system') apply()
  })
}

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
