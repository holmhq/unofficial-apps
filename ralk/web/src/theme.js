// Light, dark or the device's choice, remembered in this browser. index.html applies the
// saved choice before the first paint; this keeps it current and animates a change.

const KEY = 'ralk:theme'
const BAR = { light: '#f5f5f7', dark: '#000000' }
const media = matchMedia('(prefers-color-scheme: dark)')

export function mode() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function isDark() {
  const m = mode()
  return m === 'dark' || (m === 'system' && media.matches)
}

export function apply() {
  const dark = isDark()
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', dark ? BAR.dark : BAR.light)
}

// Change the theme, revealed in a circle from where it was chosen.
export function setMode(value, origin) {
  try { localStorage.setItem(KEY, value) } catch {}
  const before = isDark()
  const after = value === 'dark' || (value === 'system' && media.matches)
  if (before === after || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }
  const x = origin ? origin.x : innerWidth / 2
  const y = origin ? origin.y : 0
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.dataset.vt = 'theme'
  const transition = document.startViewTransition(apply)
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', pseudoElement: '::view-transition-new(root)' })
  }).catch(() => {})
  transition.finished.finally(() => { if (document.documentElement.dataset.vt === 'theme') delete document.documentElement.dataset.vt })
}

media.addEventListener('change', () => { if (mode() === 'system') apply() })
