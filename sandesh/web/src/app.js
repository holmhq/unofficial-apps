// Sandesh's page: the shell (header, tabs, account menu), the router and
// start-up. Views live in ./views and redraw on store events.

import { h, ic, $, toast, fill, reveal } from './dom.js'
import * as theme from './theme.js'
import * as api from './api.js'
import { store, on, emit, loadState, loadThreads } from './store.js'
import { connect } from './live.js'
import { landing } from './views/landing.js'
import { chats } from './views/chats.js'
import { templates } from './views/templates.js'
import { developers } from './views/developers.js'
import { phone } from './views/phone.js'

theme.apply()

const TABS = [
  { href: '/', name: 'Chats', icon: 'messagesSquare', match: /^\/($|t\/|new$)/ },
  { href: '/templates', name: 'Templates', icon: 'fileText', match: /^\/templates$/ },
  { href: '/developers', name: 'API', icon: 'codeXml', match: /^\/developers$/ },
  { href: '/phone', name: 'Phone', icon: 'smartphone', match: /^\/phone$/ }
]

const VIEWS = { landing, chats, templates, developers, phone, missing }

const HOLM = 'M4.667 0h22.666A4.667 4.667 0 0 1 32 4.667v22.666A4.667 4.667 0 0 1 27.333 32H4.667A4.667 4.667 0 0 1 0 27.333V4.667A4.667 4.667 0 0 1 4.667 0ZM6.75 16h18.5c.414 0 .75.336.75.75v10.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75v4.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-10.5c0-.414.336-.75.75-.75Zm0-12h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Zm14 0h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Z'

// "A Holm app · Source", at the foot of a page or the account menu.
export function footer(variant = '') {
  return h('footer.foot' + (variant ? '.' + variant : ''),
    h('a', { href: 'https://holmhq.com', html: `<svg viewBox="0 0 32 32" width="12" height="12" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${HOLM}"/></svg>A Holm app` }),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/sandesh' }, 'Source'))
}

/* ---- Routing --------------------------------------------------------- */

const main = $('#main')
let view = null
let viewName = null

function parse() {
  const path = location.pathname
  if (!store.me || !store.me.member) return { name: 'landing' }
  if (path === '/') return { name: 'chats', params: {} }
  if (path === '/new') return { name: 'chats', params: { compose: true } }
  const t = /^\/t\/([^/]+)$/.exec(path)
  if (t) return { name: 'chats', params: { number: decodeURIComponent(t[1]) } }
  if (path === '/templates') return { name: 'templates' }
  if (path === '/developers') return { name: 'developers' }
  if (path === '/phone') return { name: 'phone', params: { demo: new URLSearchParams(location.search).get('demo') === '1' } }
  return { name: 'missing' }
}

function render() {
  const route = parse()
  drawTabs()
  if (view && viewName === route.name && view.update) {
    view.update(route.params || {})
  } else {
    if (view && view.destroy) view.destroy()
    view = VIEWS[route.name](route.params || {})
    viewName = route.name
    fill(main, view.el)
  }
  if (location.hash) requestAnimationFrame(() => reveal(document.getElementById(location.hash.slice(1))))
}

export function go(path, { replace = false } = {}) {
  if (path !== location.pathname + location.search + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', path)
  render()
}

window.addEventListener('popstate', render)
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]')
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  go(link.getAttribute('href'))
})

function missing() {
  return {
    el: h('div.panel', h('div.empty', h('h3', 'Nothing here'), h('p', 'That page doesn’t exist.'), h('a.btn.primary', { href: '/', 'data-link': '' }, 'Back to chats'))),
    destroy() {}
  }
}

/* ---- Header and tabs ------------------------------------------------- */

function drawTop() {
  const top = $('#top')
  const me = store.me
  const brand = h('a.brand', { href: '/', 'data-link': '', 'aria-label': 'Sandesh, home' },
    h('span', { html: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" fill-rule="nonzero" d="M 4 3 L 20 3 C 21.657 3 23 4.343 23 6 L 23 16 C 23 17.657 21.657 19 20 19 L 10.5 19 L 4.6 23.2 C 4.3 23.4 3.9 23.15 4 22.8 L 5 19 L 4 19 C 2.343 19 1 17.657 1 16 L 1 6 C 1 4.343 2.343 3 4 3 Z M 4.6 6.4 L 4.6 8.9 L 12 13.9 L 19.4 8.9 L 19.4 6.4 L 12 11.4 Z"/></svg>', style: { display: 'contents' } }),
    h('b', 'Sandesh'), h('i', { lang: 'hi' }, 'संदेश'))
  if (!me || !me.member) {
    fill(top, brand, h('a.btn.small.primary', { href: me ? me.loginURL : '/auth/login' }, 'Sign in'))
    return
  }
  const p = store.state && store.state.phone
  const online = p && (p.kind === 'demo' || (p.lastSeen && Date.now() - p.lastSeen < 20 * 60000))
  const chip = p
    ? h('a.phone-chip', { href: '/phone', 'data-link': '', title: 'Your phone' }, h('span.dot' + (p.kind === 'demo' ? '.demo' : online ? '.on' : '')), h('span', p.name))
    : h('a.phone-chip', { href: '/phone', 'data-link': '' }, h('span.dot'), h('span', 'Connect phone'))
  fill(top, brand, store.state ? chip : null,
    h('button.avatar-btn', { type: 'button', 'aria-label': 'Account', 'aria-haspopup': 'dialog', onclick: menu }, avatar(me.member, 36)))
}

function avatar(member, size) {
  if (member.picture) return h('img.avatar', { src: member.picture, alt: '', width: size, height: size })
  return h('span.avatar', (member.name || '?').slice(0, 1).toUpperCase())
}

function drawTabs() {
  const tabs = $('#tabs')
  const signedIn = Boolean(store.me && store.me.member)
  tabs.hidden = !signedIn
  if (!signedIn) return
  const unread = (store.threads || []).reduce((n, t) => n + (t.unread || 0), 0)
  fill(tabs, ...TABS.map(tab => h('a.tab', {
    href: tab.href, 'data-link': '', 'aria-current': tab.match.test(location.pathname) ? 'page' : null
  }, ic(tab.icon, 22), h('span', tab.name), tab.href === '/' && unread ? h('span.badge', unread) : null)), footer('rail-foot'))
}

/* ---- Account menu ---------------------------------------------------- */

function menu(event) {
  event.stopPropagation()
  const existing = $('.popup')
  if (existing) {
    existing.remove()
    return
  }
  const me = store.me
  const modes = [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']]
  const seg = h('div.seg', { role: 'group', 'aria-label': 'Theme' }, modes.map(([value, name, icon]) =>
    h('button', { type: 'button', 'aria-pressed': theme.mode() === value ? 'true' : 'false', onclick: () => { theme.setMode(value); seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', modes[i][0] === value ? 'true' : 'false')) } }, ic(icon, 16), name)))
  const surfaces = globalThis.__HOLM_SURFACES__
  const popup = h('div.popup', { role: 'dialog', 'aria-label': 'Account' },
    h('div.me', avatar(me.member, 40), h('div', h('b', me.member.name), h('span.faint', 'Signed in to Sandesh'))),
    seg,
    surfaces && surfaces.analytics ? h('a.item', { href: surfaces.analytics }, ic('chartColumn', 18), 'Analytics') : null,
    h('a.item', { href: '/phone#rules', 'data-link': '', onclick: () => popup.remove() }, ic('shieldCheck', 18), 'India’s SMS rules'),
    h('button.item', { type: 'button', onclick: signOut }, ic('logOut', 18), 'Sign out'),
    footer())
  document.body.append(popup)
  const close = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return
    if (e.type === 'click' && popup.contains(e.target)) return
    popup.remove()
    document.removeEventListener('click', close)
    document.removeEventListener('keydown', close)
  }
  setTimeout(() => {
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
  })
}

async function signOut() {
  try {
    await fetch(store.me.logoutURL, { method: 'POST', headers: { accept: 'application/json' } })
  } catch {}
  location.href = '/'
}

/* ---- Start-up -------------------------------------------------------- */

on((event) => {
  if (event.type === 'state') drawTop()
  if (event.type === 'threads') drawTabs()
  // The chats view reloads for itself; elsewhere, keep the unread count right.
  if (event.type === 'changed' && viewName !== 'chats') loadThreads().catch(() => {})
})

async function boot() {
  try {
    store.me = await api.get('/api/me')
  } catch {
    store.me = { member: null, loginURL: '/auth/login' }
  }
  drawTop()
  if (store.me.member) {
    try {
      const state = await loadState()
      // A real phone's "last seen" comes from SMSGate; ask now and then.
      if (state.phone && state.phone.kind !== 'demo' && Date.now() - (state.phone.checkedAt || 0) > 10 * 60000) {
        api.post('/api/phone/check').then(loadState).catch(() => {})
      }
    } catch (error) {
      toast(error.message, { error: true })
    }
    connect(store.me.channel, (data) => {
      if (data.type === 'update') emit({ type: 'changed', numbers: data.numbers || [] })
      if (data.type === 'resync' && store.state && store.state.phone) loadThreads().catch(() => {})
    })
  }
  render()
}

boot()

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
