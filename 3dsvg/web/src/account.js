// Who is signed in, and the round avatar at the top right. Its menu holds
// the appearance, the analytics link for admins and sign in/out; feedback
// lives in the footer.

import { h } from './ui.js'
import { icon } from './icons.js'
import { state, emit, setSetting, on } from './state.js'

// Who was signed in last time, so the avatar shows at once on the next
// launch; the server's answer replaces it a moment later.
const ME_KEY = '3dsvg:me'
let kept = null
try { kept = JSON.parse(localStorage.getItem(ME_KEY) || 'null') } catch {}
function keep(me) {
  kept = me ? { name: me.name || '', email: me.email || '', picture: me.picture || null } : null
  try { if (kept) localStorage.setItem(ME_KEY, JSON.stringify(kept)); else localStorage.removeItem(ME_KEY) } catch {}
}

// Holm adds globalThis.__HOLM_SURFACES__ to the page for people allowed to
// see the app's analytics. The copy of the page the service worker keeps may
// predate who's signed in, so a signed-in browser reads them from a fresh
// copy (the service worker lets a no-store request through).
let surfaces = globalThis.__HOLM_SURFACES__ || null
async function loadSurfaces() {
  try {
    const page = await (await fetch('/', { cache: 'no-store' })).text()
    const m = /__HOLM_SURFACES__\s*=\s*(\{[^}]*\})/.exec(page)
    surfaces = m ? JSON.parse(m[1]) : null
  } catch {}
}

export async function loadMe() {
  try {
    const next = location.pathname + location.search
    const r = await fetch(`/api/me?next=${encodeURIComponent(next)}`, { headers: { accept: 'application/json' } })
    const me = await r.json()
    state.me = me.member || null
    state.loginURL = me.loginURL || '/auth/login'
    state.logoutURL = me.logoutURL || null
    keep(state.me)
  } catch {
    state.me = null
  }
  emit('me', state.me)
  if (state.me) loadSurfaces()
}

export function signIn() { location.href = state.loginURL }

async function signOut() {
  try { await fetch(state.logoutURL || '/auth/logout', { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  keep(null)
  location.reload()
}

// ── Appearance: the panels follow the device, or stay light or dark ──

export function applyTheme() {
  const pref = state.settings.appearance
  const mode = pref === 'light' || pref === 'dark' ? pref : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f4f4f6' : '#0a0a0a')
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme)
on('settings', applyTheme)

// ── The avatar and its menu ──

export function accountButton({ extra = () => [] } = {}) {
  const wrap = h('div', { class: 'avatar-wrap' })
  let menu = null

  const close = () => {
    if (!menu) return false
    menu.remove()
    menu = null
    button.setAttribute('aria-expanded', 'false')
    return true
  }

  const button = h('button', { class: 'round-btn glass avatar-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' })
  const paint = () => {
    const me = state.me === undefined ? kept : state.me
    button.classList.toggle('signedout', !me)
    button.setAttribute('aria-label', me ? `Account and settings for ${me.name || me.email || 'you'}` : 'Settings and sign in')
    button.title = me ? me.name || me.email || 'Account' : 'Sign in and settings'
    button.replaceChildren(me?.picture ? h('img', { src: me.picture, alt: '', referrerpolicy: 'no-referrer' }) : icon('user', 18))
  }
  paint()
  on('me', paint)

  const seg = (value, iconName, label) => h('button', {
    class: `seg-btn${state.settings.appearance === value ? ' active' : ''}`, type: 'button',
    'aria-pressed': String(state.settings.appearance === value), 'aria-label': label, title: label,
    onclick: () => { setSetting('appearance', value); open() }
  }, icon(iconName, 16))

  function open() {
    close()
    const me = state.me
    const shown = me === undefined ? kept : me
    menu = h('section', { class: 'popover glass', 'aria-label': 'Account and settings' },
      h('div', { class: 'who' },
        shown ? [h('strong', {}, shown.name || 'Signed in'), shown.email && h('span', {}, shown.email)]
          : me === undefined ? h('strong', {}, 'Checking…')
            : [h('strong', {}, 'Not signed in'), h('span', {}, 'Sign in to keep your shapes and share them.')]),
      h('div', { class: 'menu-group' },
        h('p', { class: 'group-label' }, 'Appearance'),
        h('div', { class: 'segmented' }, seg('light', 'sun', 'Light'), seg('dark', 'moon', 'Dark'), seg('system', 'monitor', 'Same as device'))),
      extra(close),
      surfaces?.analytics && h('a', { class: 'menu-row', href: surfaces.analytics, target: '_blank', rel: 'noopener' }, icon('chart-column', 16), h('span', {}, 'Analytics')),
      me
        ? h('button', { class: 'menu-row', type: 'button', onclick: signOut }, icon('log-out', 16), h('span', {}, 'Sign out'))
        : me === null && h('button', { class: 'menu-row', type: 'button', onclick: signIn }, icon('log-in', 16), h('span', {}, 'Sign in')))
    wrap.append(menu)
    button.setAttribute('aria-expanded', 'true')
  }

  button.addEventListener('click', () => { if (!close()) open() })
  document.addEventListener('pointerdown', e => { if (menu && !wrap.contains(e.target)) close() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && close()) button.focus() })
  wrap.append(button)
  return { el: wrap, close }
}
