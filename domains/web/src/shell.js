// What every page shares: who's signed in, moving between pages, the top bar with its round
// account button, the account menu and the footer.
import { h, ic, avatar, menu, segmented, haptic } from './ui.js'
import { mark, holmMark } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'

export const state = { me: null }
export const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/domains'

export async function loadMe() {
  const back = encodeURIComponent(location.pathname + location.search)
  try {
    state.me = await api.get('/api/me?return=' + back)
  } catch {
    state.me = { signed_in: false, login_url: '/auth/login', logout_url: null }
  }
  return state.me
}

/* ---- Moving between pages ------------------------------------------------- */

let render = () => {}
export function setRenderer(fn) { render = fn }

export function go(path, { replace = false, dir = 'none' } = {}) {
  if (path === location.pathname + location.search && !replace) { render(dir, true); return }
  history[replace ? 'replaceState' : 'pushState']({ page: path }, '', path)
  render(dir)
}

export function signIn() {
  location.href = state.me && state.me.login_url ? state.me.login_url : '/auth/login'
}

export async function signOut() {
  try { await fetch(state.me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

/* ---- Top bar ------------------------------------------------------------------ */

export function brand() {
  return h('a.brand', { href: '/', 'aria-label': 'Domains home', onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/') } },
    h('span.brand-mark', mark(17, { dot: '#30d158' })), h('span.brand-name', 'Domains'))
}

export function topBar() {
  return h('header.top.glass', h('div.top-l', brand()), h('div.top-r', accountButton()))
}

export function accountButton() {
  const m = state.me && state.me.signed_in ? state.me : null
  const btn = h('button.avatar-btn', { type: 'button', 'aria-label': m ? `Account: ${m.name}` : 'Sign in', 'aria-haspopup': 'menu' },
    m ? avatar({ key: m.email || m.name, name: m.name, picture: m.picture }) : h('span.avatar.ghost', ic('user', 17, 2)))
  btn.addEventListener('click', () => { haptic(); accountMenu(btn) })
  return btn
}

function accountMenu(anchor) {
  const me = state.me || {}
  const m = me.signed_in ? me : null
  const themes = segmented([
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'Auto', icon: 'monitor' },
  ], theme.mode(), (value) => {
    const r = themes.getBoundingClientRect()
    theme.setMode(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, { label: 'Appearance' })
  const surfaces = globalThis.__HOLM_SURFACES__
  menu(anchor, [
    m
      ? h('div.me', avatar({ key: m.email || m.name, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name || 'You'), h('small.trunc', m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to keep saved names everywhere'))),
    'sep',
    themes,
    { label: 'Saved names', icon: 'star', onclick: () => go('/saved') },
    { label: 'How it works', icon: 'info', onclick: () => go('/about') },
    surfaces && surfaces.analytics && me.admin ? { label: 'Analytics', icon: 'chartColumn', href: surfaces.analytics } : null,
    'sep',
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn },
    h('a.holm-line', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, holmMark(11), 'A Holm app'),
  ], { align: 'end' })
}

/* ---- Footer ------------------------------------------------------------------------ */

export function holmFooter() {
  return h('footer.holm-foot',
    h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, holmMark(12), 'A Holm app'),
    h('span.dot'),
    h('a', { href: '/about', onclick: (e) => { e.preventDefault(); go('/about') } }, 'How it works'),
    h('span.dot'),
    h('a', { href: SOURCE, target: '_blank', rel: 'noopener' }, 'Source'))
}
