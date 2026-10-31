// What every page shares: who's signed in, moving between pages, the top
// bar with its round account button, the account menu, and the footer.
import { h, ic, fill, avatar, menu, segmented, toggle, haptic, copyText, toast } from './ui.js'
import { mark, HOLM } from './icons.js'
import * as api from './api.js'
import * as store from './store.js'
import * as theme from './theme.js'
import { sound } from './sound.js'
import { clock24, setClock24 } from './time.js'

// Who's signed in, as this browser last saw it, so the first page draws
// without waiting; loadMe() then asks the server.
export const state = { me: store.peek('me') || null }

const who = (me) => (me && me.member ? me.member.id + ':' + (me.host ? me.host.handle : '') : '')

// Asks the server who's signed in. Says whether that changed who it is
// (signed in or out, or became a host) since the page last drew.
export async function loadMe() {
  const next = encodeURIComponent(location.pathname + location.search)
  const before = who(state.me)
  let fresh = true
  try {
    state.me = await api.get('/api/me?next=' + next)
  } catch (error) {
    fresh = false
    // Offline: keep what we had. Signed out for sure: forget it.
    if (!state.me || error.status) state.me = { member: null, host: null, loginURL: '/auth/login', logoutURL: null }
  }
  if (fresh) {
    if (who(state.me) !== before) store.forget((k) => k.startsWith('m:'))
    store.keep('me', state.me)
    if (state.me.admin) loadSurfaces()
  }
  paintAccounts()
  return who(state.me) !== before
}

// Holm writes the addresses of its own pages for this app, analytics among
// them, into the page for the people allowed to see them. The copy of the
// page this browser keeps may predate who's signed in, or Holm may have
// moved them since, so an admin's browser reads them from a fresh copy (the
// service worker lets a no-store request through).
let surfaces = globalThis.__HOLM_SURFACES__ || null
async function loadSurfaces() {
  try {
    const page = await (await fetch('/', { cache: 'no-store' })).text()
    const m = /__HOLM_SURFACES__\s*=\s*(\{[^}]*\})/.exec(page)
    surfaces = m ? JSON.parse(m[1]) : null
  } catch {}
}

// Lists that belong to the signed-in host carry their id.
export const mine = (name) => 'm:' + (state.me && state.me.member ? state.me.member.id : '-') + ':' + name

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
  store.forget()
  theme.forgetMine()
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

// Every account button on the page, so they change together when the
// server says someone else is signed in.
const buttons = new Set()

function paintAccount(btn) {
  const m = state.me && state.me.member
  const face = m ? (m.picture || '') + m.name : ''
  if (btn.dataset.face === face && btn.firstChild) return
  btn.dataset.face = face
  btn.setAttribute('aria-label', m ? `Account: ${m.name}` : 'Account and settings')
  fill(btn, m ? avatar({ key: m.id, name: m.name, picture: m.picture }) : h('span.avatar.ghost', ic('user', 17, 2)))
}

function paintAccounts() {
  for (const btn of buttons) {
    if (!btn.isConnected) buttons.delete(btn)
    else paintAccount(btn)
  }
}

export function accountButton() {
  const btn = h('button.avatar-btn', { type: 'button', 'aria-haspopup': 'menu' })
  paintAccount(btn)
  buttons.add(btn)
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
  const analytics = me.admin && surfaces && typeof surfaces.analytics === 'string' ? surfaces.analytics : null
  const items = [
    m
      ? h('div.me', avatar({ key: m.id, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name), h('small.trunc', host ? prettyURL(host.handle) : m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to get your own link'))),
    'sep',
    themes,
    row('volume2', 'Sounds', toggle(sound.on, (v) => { sound.set(v); if (!v) sound.toggle(false) }, 'Sounds')),
    row('clock', '24-hour time', toggle(clock24(), (v) => { setClock24(v); sound.toggle(v); dispatchEvent(new Event('kalendar:clock')) }, '24-hour time')),
    analytics ? { label: 'Analytics', icon: 'chartColumn', onclick: () => window.open(analytics, '_blank', 'noopener') } : null,
    'sep',
    FEEDBACK_PROJECT ? { label: 'Send feedback', icon: 'messageSquareText', onclick: feedback } : null,
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn }
  ]
  menu(anchor, items, { align: 'end' })
}

/* ---- Footer and feedback ------------------------------------------------------- */

// Send feedback opens Kalendar's form on the owner's feedback app, from a
// local copy of its embed.js (web/vendor/feedback/), loaded on first use.
export const FEEDBACK_PROJECT = '2pbgt57k'
let feedbackScript = null
export function feedback() {
  if (!FEEDBACK_PROJECT) return
  if (!feedbackScript) {
    feedbackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: FEEDBACK_PROJECT, origin: 'https://feedback.zyt.app', color: '#e0352b', button: 'none' })
      s.onload = () => resolve()
      s.onerror = () => { feedbackScript = null; reject(new Error('Feedback is not available right now.')) }
      document.head.append(s)
    })
  }
  feedbackScript.then(() => (globalThis.HolmFeedback || globalThis.ZytFeedback)?.open?.()).catch((error) => toast(error.message, { kind: 'bad' }))
}

const holmMark = (size) => h('span.holm-mark', { 'aria-hidden': 'true', html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><path fill="currentColor" fill-rule="evenodd" d="${HOLM}"/></svg>` })
export const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/kalendar'

// The bar along the bottom of public pages, frosted like the top one: who
// makes it, where its source is, and a way to say what you think.
export function holmFooter({ bar = true } = {}) {
  return h('footer.holm-foot' + (bar ? '.bar' : ''),
    h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, holmMark(12), 'A Holm app'),
    h('span.dot'),
    h('a', { href: SOURCE, target: '_blank', rel: 'noopener' }, ic('github', 13, 2), 'Source'),
    FEEDBACK_PROJECT ? h('span.dot') : null,
    FEEDBACK_PROJECT ? h('button', { type: 'button', onclick: feedback }, ic('messageSquareText', 13, 2.2), 'Send feedback') : null)
}

export function failure(error) {
  toast(error && error.message ? error.message : 'Something went wrong.', { kind: 'bad' })
  sound.error()
}
