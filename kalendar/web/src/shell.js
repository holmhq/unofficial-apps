// What every page shares: who's signed in, moving between pages, the top
// bar with its round account button, and the account menu.
import { h, ic, avatar, menu, segmented, toggle, haptic, copyText, toast } from './ui.js'
import { mark, HOLM } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'
import { sound } from './sound.js'
import { clock24, setClock24 } from './time.js'

export const state = { me: null }

export async function loadMe() {
  const next = encodeURIComponent(location.pathname + location.search)
  try {
    state.me = await api.get('/api/me?next=' + next)
  } catch {
    state.me = { member: null, host: null, loginURL: '/auth/login', logoutURL: null }
  }
  return state.me
}

// ---- Moving between pages ----------------------------------------------------

let render = () => {}
export function setRenderer(fn) { render = fn }

export function go(path, { replace = false, dir = 'forward' } = {}) {
  if (path === location.pathname + location.search && !replace) return
  history[replace ? 'replaceState' : 'pushState']({ page: path }, '', path)
  render(dir)
}

// An <a> that moves inside the app without reloading.
export function link(href, attrs, ...kids) {
  return h('a', {
    href,
    ...attrs,
    onclick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return
      event.preventDefault()
      if (attrs && attrs.onclick) attrs.onclick(event)
      go(href)
    }
  }, ...kids)
}

export const pageURL = (handle) => `${location.origin}/@${handle}`
export const prettyURL = (handle) => `${location.host}/@${handle}`

export function signIn() {
  location.href = state.me && state.me.loginURL ? state.me.loginURL : '/auth/login'
}

export async function signOut() {
  try { await fetch(state.me.logoutURL, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

export async function share(handle, title = 'Book time with me') {
  const url = pageURL(handle)
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, url }); return } catch (error) { if (error && error.name === 'AbortError') return }
  }
  await copyText(url, 'Link copied')
  sound.pop()
}

// ---- Top bar ------------------------------------------------------------------

export function brand() {
  return h('a.brand', { href: '/', 'aria-label': 'Kalendar home', onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/') } },
    h('span.brand-mark', mark(18)), h('span.brand-name', 'Kalendar'))
}

export function topBar({ left = null, title = null, right = [], glass = true } = {}) {
  return h('header.top' + (glass ? '.glass' : ''),
    h('div.top-l', left || brand()),
    title ? h('div.top-title', title) : null,
    h('div.top-r', ...right, accountButton()))
}

export function accountButton() {
  const m = state.me && state.me.member
  const btn = h('button.avatar-btn', { type: 'button', 'aria-label': m ? `Account: ${m.name}` : 'Account and settings', 'aria-haspopup': 'menu' },
    m ? avatar({ key: m.id, name: m.name, picture: m.picture }) : h('span.avatar.ghost', ic('user', 17, 2)))
  btn.addEventListener('click', () => { haptic(); accountMenu(btn) })
  return btn
}

function row(icon, label, control) {
  return h('label.menu-item.row-switch', ic(icon, 19), h('span.grow', label), control)
}

function accountMenu(anchor) {
  const me = state.me || {}
  const m = me.member
  const host = me.host
  const themes = segmented([
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'Auto', icon: 'monitor' }
  ], theme.mode(), (value) => {
    const r = themes.getBoundingClientRect()
    theme.setMode(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    sound.tap()
  }, { label: 'Appearance' })
  const surfaces = globalThis.__HOLM_SURFACES__
  const items = [
    m
      ? h('div.me', avatar({ key: m.id, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name), h('small.trunc', host ? prettyURL(host.handle) : m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to get your own link'))),
    host ? { label: 'Your page', icon: 'externalLink', onclick: () => window.open(pageURL(host.handle), '_blank', 'noopener') } : null,
    host ? { label: 'Copy your link', icon: 'link', onclick: () => { copyText(pageURL(host.handle), 'Link copied'); sound.pop() } } : null,
    host ? { label: 'Profile and link', icon: 'user', onclick: () => import('./views/profile-sheet.js').then((v) => v.profileSheet()) } : null,
    'sep',
    themes,
    row('volume2', 'Sounds', toggle(sound.on, (v) => { sound.set(v); if (!v) sound.toggle(false) }, 'Sounds')),
    row('clock', '24-hour time', toggle(clock24(), (v) => { setClock24(v); sound.toggle(v); dispatchEvent(new Event('kalendar:clock')) }, '24-hour time')),
    surfaces && surfaces.analytics && me.admin ? { label: 'Analytics', icon: 'chartColumn', onclick: () => { location.href = surfaces.analytics } } : null,
    'sep',
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn },
    h('a.holm-line', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener', html: `<svg width="11" height="11" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${HOLM}"/></svg>A Holm app` })
  ]
  menu(anchor, items, { align: 'end' })
}

export function holmFooter() {
  return h('footer.holm-foot', h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener', html: `<svg width="12" height="12" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${HOLM}"/></svg>A Holm app` }))
}

export function failure(error) {
  toast(error && error.message ? error.message : 'Something went wrong.', { kind: 'bad' })
  sound.error()
}
