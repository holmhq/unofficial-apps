// Light, dark or the device's choice, remembered in this browser, and the
// host's colour. The page applies both before its first paint (index.html);
// this keeps them current and animates a change where the browser can.

const KEY = 'kalendar:theme'
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
  document.documentElement.classList.toggle('dark', dark)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', dark ? BAR.dark : BAR.light)
}

// Change the theme, revealed in a circle from where it was chosen.
export function setMode(value, origin) {
  try { localStorage.setItem(KEY, value) } catch {}
  const before = document.documentElement.classList.contains('dark')
  if (before === (value === 'dark' || (value === 'system' && media.matches))) apply()
  else reveal(apply, origin)
}

media.addEventListener('change', () => { if (mode() === 'system') apply() })

/* ---- The host's colour ------------------------------------------------------
   A host picks one for their pages: their dashboard, their page and its
   booking pages wear it, for whoever opens them. Each page remembers the
   colour it last wore, so it opens in it: "me" for the host's own tabs,
   "@handle" for a host's page and its events, "b:<id>" for a booking. */

export const ACCENTS = [
  { id: 'red', name: 'Red' },
  { id: 'amber', name: 'Amber' },
  { id: 'teal', name: 'Teal' },
  { id: 'blue', name: 'Blue' },
  { id: 'violet', name: 'Violet' },
  { id: 'graphite', name: 'Graphite' }
]
const ACCENT_KEY = 'kalendar:accent:'
const known = (id) => (ACCENTS.some((a) => a.id === id) ? id : 'red')

// The same rule as index.html's.
export function scopeOf(path) {
  let m
  if ((m = /^\/@([^/]+)/.exec(path))) { try { return '@' + decodeURIComponent(m[1]).toLowerCase() } catch { return null } }
  if ((m = /^\/b\/([a-z0-9-]+)/.exec(path))) return 'b:' + m[1]
  return ['/', '/events', '/hours', '/insights', '/profile'].includes(path) ? 'me' : null
}

export function accent() {
  return document.documentElement.dataset.accent || 'red'
}

// Remember a colour for a page, without wearing it now.
export function remember(scope, id) {
  try {
    if (known(id) === 'red') localStorage.removeItem(ACCENT_KEY + scope)
    else localStorage.setItem(ACCENT_KEY + scope, known(id))
  } catch {}
}

// Wear a colour on this page (red when there's none to wear), and remember
// it for the page. From a tap, it spreads in a circle from the finger.
export function setAccent(id, { scope = null, origin = null } = {}) {
  const next = known(id)
  if (scope) remember(scope, next)
  if (next === accent()) return
  const paint = () => {
    if (next === 'red') delete document.documentElement.dataset.accent
    else document.documentElement.dataset.accent = next
    tabIcon(next)
  }
  if (origin) reveal(paint, origin)
  else paint()
}

// The browser tab's icon wears the colour too (index.html sets it at start).
// A home-screen icon is fixed when the app is added, so that one stays red.
function tabIcon(id) {
  const path = id === 'red' ? '/favicon' : '/icons/' + id
  for (const link of document.querySelectorAll('link[rel="icon"][type^="image/"]')) {
    link.href = path + (link.type === 'image/svg+xml' ? '.svg' : '.png')
  }
}

// Signing out: the host's own tabs open in red again.
export function forgetMine() {
  try { localStorage.removeItem(ACCENT_KEY + 'me') } catch {}
}

/* ---- Revealing a change ------------------------------------------------------ */

function reveal(change, origin) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change()
    return
  }
  const x = origin ? origin.x : innerWidth / 2
  const y = origin ? origin.y : 0
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const transition = document.startViewTransition(change)
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', pseudoElement: '::view-transition-new(root)' })
  }).catch(() => {})
}
