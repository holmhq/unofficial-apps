// Who is signed in, and the round avatar at the top right. Its menu holds
// the appearance, feedback, the analytics link for admins and sign in/out.

import { h } from './ui.js'
import { icon } from './icons.js'
import { state, emit, setSetting, on } from './state.js'

export async function loadMe() {
  try {
    const next = location.pathname + location.search
    const r = await fetch(`/api/me?next=${encodeURIComponent(next)}`, { headers: { accept: 'application/json' } })
    const me = await r.json()
    state.me = me.member || null
    state.loginURL = me.loginURL || '/auth/login'
    state.logoutURL = me.logoutURL || null
  } catch {
    state.me = null
  }
  emit('me', state.me)
}

export function signIn() { location.href = state.loginURL }

async function signOut() {
  try { await fetch(state.logoutURL || '/auth/logout', { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
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
    const me = state.me
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
    const surfaces = globalThis.__HOLM_SURFACES__
    menu = h('section', { class: 'popover glass', 'aria-label': 'Account and settings' },
      h('div', { class: 'who' },
        me === undefined ? h('strong', {}, 'Checking…')
          : me ? [h('strong', {}, me.name || 'Signed in'), me.email && h('span', {}, me.email)]
            : [h('strong', {}, 'Not signed in'), h('span', {}, 'Sign in to keep your shapes and share them.')]),
      h('div', { class: 'menu-group' },
        h('p', { class: 'group-label' }, 'Appearance'),
        h('div', { class: 'segmented' }, seg('light', 'sun', 'Light'), seg('dark', 'moon', 'Dark'), seg('system', 'monitor', 'Same as device'))),
      extra(close),
      globalThis.HolmFeedback && h('button', { class: 'menu-row', type: 'button', onclick: () => { close(); globalThis.HolmFeedback.open() } }, icon('message-circle', 16), h('span', {}, 'Send feedback')),
      surfaces?.analytics && h('a', { class: 'menu-row', href: surfaces.analytics, target: '_blank', rel: 'noopener' }, icon('chart-column', 16), h('span', {}, 'Analytics')),
      me
        ? h('button', { class: 'menu-row', type: 'button', onclick: signOut }, icon('log-out', 16), h('span', {}, 'Sign out'))
        : me === null && h('button', { class: 'menu-row', type: 'button', onclick: signIn }, icon('log-in', 16), h('span', {}, 'Sign in')),
      h('hr', { class: 'menu-sep' }),
      h('p', { class: 'menu-note' },
        'Based on ', h('a', { href: 'https://github.com/renatoworks/3dsvg', target: '_blank', rel: 'noopener' }, '3dsvg'),
        ' (MIT). ',
        h('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/3dsvg', target: '_blank', rel: 'noopener' }, 'Source'),
        ' · ', h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, 'A Holm app')))
    wrap.append(menu)
    button.setAttribute('aria-expanded', 'true')
  }

  button.addEventListener('click', () => { if (!close()) open() })
  document.addEventListener('pointerdown', e => { if (menu && !wrap.contains(e.target)) close() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && close()) button.focus() })
  wrap.append(button)
  return { el: wrap, close }
}
