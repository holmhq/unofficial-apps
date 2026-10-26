// Light, dark or the device's choice, remembered in this browser. The page
// applies the saved choice before its first paint (index.html); this keeps
// it current and animates a change where the browser can.

const KEY = 'zend:theme'
const BAR = { light: '#f9f9fb', dark: '#000000' }
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
  document.documentElement.classList.toggle('dark', dark)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', dark ? BAR.dark : BAR.light)
}

// Change the theme, revealed in a circle from where it was chosen.
export function setMode(value, origin) {
  try { localStorage.setItem(KEY, value) } catch {}
  const before = document.documentElement.classList.contains('dark')
  if (before === (value === 'dark' || (value === 'system' && media.matches)) || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }
  const x = origin ? origin.x : innerWidth / 2
  const y = origin ? origin.y : 0
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const transition = document.startViewTransition(apply)
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', pseudoElement: '::view-transition-new(root)' })
  }).catch(() => {})
}

media.addEventListener('change', () => { if (mode() === 'system') apply() })
