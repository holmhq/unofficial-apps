// Light, dark or the device's choice, remembered in this browser.

const KEY = 'sandesh:theme'
const BAR = { light: '#e8eef6', dark: '#0e1524' }
const media = matchMedia('(prefers-color-scheme: dark)')

export function mode() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function setMode(value) {
  try { localStorage.setItem(KEY, value) } catch {}
  apply()
}

export function apply() {
  const m = mode()
  const dark = m === 'dark' || (m === 'system' && media.matches)
  const root = document.documentElement
  root.dataset.theme = m
  root.classList.toggle('is-dark', dark)
  const bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', dark ? BAR.dark : BAR.light)
}

media.addEventListener('change', () => { if (mode() === 'system') apply() })
