// Strata — colour sets and light/dark. Each set gives the seven pieces their
// earth colours, drawn on canvas by render.js, plus one accent for the
// chrome, exposed as the `--accent` CSS variable.

import { prefs } from './state.js'

export const PALETTES = [
  {
    id: 'sandstone',
    label: 'Sandstone',
    accent: '#c98b2b',
    tiles: { I: '#8fa9c4', O: '#e5c58e', T: '#ad8fa8', S: '#a7b386', Z: '#c8705a', J: '#7d9f9a', L: '#dda15a' }
  },
  {
    id: 'canyon',
    label: 'Canyon',
    accent: '#d0703f',
    tiles: { I: '#6e95ba', O: '#efc176', T: '#b27aa0', S: '#97ad66', Z: '#d4573f', J: '#5e8f8b', L: '#e8913f' }
  },
  {
    id: 'shore',
    label: 'Shore',
    accent: '#4f9fb8',
    tiles: { I: '#6fb3cc', O: '#efd8a6', T: '#a3a6d6', S: '#8cc6aa', Z: '#e88f78', J: '#5b8db5', L: '#f2b67c' }
  },
  {
    id: 'ash',
    label: 'Ash',
    accent: '#a8998a',
    tiles: { I: '#b8b3ab', O: '#d8d0c2', T: '#a59f97', S: '#c6c0b3', Z: '#9a948b', J: '#afa9a0', L: '#cec5b6' }
  }
]

export const BACKGROUND = { light: '#f5efe4', dark: '#15120d' }

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
