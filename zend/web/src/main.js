// Zend's page: start-up, the shell (rail, conversation list, main pane, tab
// bar), routing, the account menu and keyboard shortcuts. Each screen is a
// view in ./views that returns { el, update?, destroy? }.

import { h, fill, ic, wide, menu, toast, segmented, haptic, $ } from './ui.js'
import { mark, HOLM } from './icons.js'
import * as theme from './theme.js'
import { sound } from './sound.js'
import { store, on, loadMe, loadState, loadThreads, connect, unread } from './store.js'
import { list } from './views/list.js'
import { thread } from './views/thread.js'
import { compose } from './views/compose.js'
import { templates } from './views/templates.js'
import { developers } from './views/developers.js'
import { phone } from './views/phone.js'
import { welcome } from './views/welcome.js'
import * as api from './api.js'

theme.apply()

const TABS = [
  { id: 'chats', path: '/', name: 'Chats', icon: 'chats', active: 'chatsFill' },
  { id: 'templates', path: '/templates', name: 'Templates', icon: 'templates' },
  { id: 'developers', path: '/developers', name: 'API', icon: 'code' },
  { id: 'phone', path: '/phone', name: 'Phone', icon: 'phone' }
]

const root = $('#root')
let shell = null   // { app, side, main, rail, tabs, list }
let view = null    // what the main pane shows
let route = null

/* ---- Routing ------------------------------------------------------------- */

function parse() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const query = new URLSearchParams(location.search)
  const t = /^\/t\/([^/]+)$/.exec(path)
  if (t) return { tab: 'chats', name: 'thread', number: decodeURIComponent(t[1]) }
  if (path === '/new') return { tab: 'chats', name: 'compose', to: query.get('to') || '' }
  if (path === '/templates') return { tab: 'templates', name: 'templates' }
  if (path === '/developers') return { tab: 'developers', name: 'developers' }
  if (path === '/phone') return { tab: 'phone', name: 'phone', demo: query.has('demo') }
  return { tab: 'chats', name: 'home' }
}

export function go(path, { replace = false, state = null } = {}) {
  if (path !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](state, '', path)
  render()
}

// Back from a conversation: to the list on a phone, to nothing on a wide screen.
export function back() {
  if (history.state && history.state.fromList && !wide()) history.back()
  else go('/')
}

addEventListener('popstate', render)
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]')
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  go(link.getAttribute('href'))
})

const VIEWS = { thread, compose, templates, developers, phone, home }

function render() {
  if (!store.me || !store.me.member) {
    if (shell) { shell.app.remove(); shell = null }
    if (!$('.welcome')) fill(root, welcome().el)
    return
  }
  if (!shell) buildShell()
  const next = parse()
  const same = route && view && route.name === next.name && view.update
  const was = route
  route = next
  store.viewing = next.name === 'thread' ? next.number : null
  if (same && (next.name !== 'thread' || next.number === was.number)) view.update(next)
  else {
    const old = view
    view = VIEWS[next.name](next)
    if (old && old.destroy) old.destroy()
    // On a phone a conversation slides away over the list: swap it out after.
    if (next.name === 'home' && !wide() && old && was && was.tab === 'chats') {
      const el = view.el
      setTimeout(() => { if (view && view.el === el) fill(shell.main, el) }, 460)
    } else fill(shell.main, view.el)
  }
  syncShell()
}

function syncShell() {
  const { app } = shell
  app.dataset.tab = route.tab
  const detail = route.tab === 'chats' && route.name !== 'home'
  app.toggleAttribute('data-detail', detail)
  for (const b of app.querySelectorAll('.tab')) {
    const current = b.dataset.tab === route.tab
    if (current) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
    const t = TABS.find(x => x.id === b.dataset.tab)
    if (t.active) b.querySelector('svg').replaceWith(ic(current ? t.active : t.icon, b.closest('.rail') ? 24 : 27, 1.7))
  }
  drawBadges()
  shell.list.select(route.name === 'thread' ? route.number : null)
}

function drawBadges() {
  if (!shell) return
  const n = unread()
  for (const b of shell.app.querySelectorAll('.tab[data-tab="chats"]')) {
    const old = b.querySelector('.badge')
    if (n && (!old || old.textContent !== String(n))) {
      old && old.remove()
      b.append(h('span.badge.num', { 'aria-label': `${n} unread` }, n > 99 ? '99+' : n))
    } else if (!n && old) old.remove()
  }
  document.title = n ? `(${n}) Zend` : 'Zend'
}

/* ---- Shell ----------------------------------------------------------------- */

function buildShell() {
  const tabButton = (t, size) => h('button.tab', { type: 'button', 'data-tab': t.id, 'aria-label': t.name, onclick: () => pickTab(t) }, ic(t.icon, size, 1.7), h('span', t.name))
  const rail = h('nav.rail', { 'aria-label': 'Sections' },
    h('a.mark', { href: '/', 'data-link': '', 'aria-label': 'Zend' }, mark(24)),
    TABS.map(t => tabButton(t, 24)))
  const tabs = h('nav.tabs', { 'aria-label': 'Sections' }, TABS.map(t => tabButton(t, 27)))
  const listView = list()
  const side = h('section.side', { 'aria-label': 'Conversations' }, listView.el)
  const main = h('section.main')
  const app = h('div.app', side, main, rail, tabs)
  fill(root, app)
  shell = { app, side, main, rail, tabs, list: listView }
  swipeBack(app, main)
}

function pickTab(t) {
  haptic(6)
  sound.tap()
  if (route && route.tab === t.id) {
    // Tapping the current tab again goes to its top.
    if (t.id === 'chats' && route.name !== 'home') { go('/'); return }
    const panel = (t.id === 'chats' ? shell.side : shell.main).querySelector('.panel')
    if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  go(t.path)
}

// On a phone, drag a conversation from the left edge to go back, as on iOS.
function swipeBack(app, main) {
  let start = null
  main.addEventListener('pointerdown', (event) => {
    if (wide() || !app.hasAttribute('data-detail') || event.pointerType === 'mouse') return
    if (event.clientX > 28) return
    start = { x: event.clientX, y: event.clientY, t: performance.now(), dx: 0, active: false, id: event.pointerId }
  })
  main.addEventListener('pointermove', (event) => {
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.active) {
      if (Math.abs(dy) > 12) { start = null; return }
      if (dx < 10) return
      start.active = true
      app.classList.add('dragging')
      main.setPointerCapture(event.pointerId)
    }
    start.dx = Math.max(0, dx)
    const p = start.dx / main.offsetWidth
    main.style.transform = `translate3d(${start.dx}px, 0, 0)`
    shell.side.style.transform = `translate3d(${-28 + 28 * p}%, 0, 0)`
    shell.side.style.filter = `brightness(${.94 + .06 * p})`
  })
  const end = (event) => {
    if (!start || event.pointerId !== start.id) return
    const { dx, t, active } = start
    start = null
    if (!active) return
    app.classList.remove('dragging')
    main.style.transform = ''
    shell.side.style.transform = ''
    shell.side.style.filter = ''
    const speed = dx / Math.max(1, performance.now() - t)
    if (dx > main.offsetWidth * .35 || speed > .5) back()
  }
  main.addEventListener('pointerup', end)
  main.addEventListener('pointercancel', end)
}

// The wide screen's conversation pane with nothing open.
function home() {
  const el = h('div', { style: { display: 'contents' } },
    h('header.bar', h('span.right', accountButton())),
    h('div.empty.fade-in',
      h('span.glyph', ic('chats', 36, 1.6)),
      h('h2', store.state && store.state.phone ? 'Pick a conversation' : 'Connect a phone to start'),
      h('p', store.state && store.state.phone
        ? 'Or write a new text. It goes out from your own phone, on your own number.'
        : 'Zend sends texts through your own Android phone, or a demo phone while you look around.'),
      store.state && store.state.phone
        ? h('a.btn.primary', { href: '/new', 'data-link': '' }, ic('compose', 18, 2), 'New text')
        : h('a.btn.primary', { href: '/phone', 'data-link': '' }, 'Connect a phone')))
  return { el }
}

/* ---- Account ------------------------------------------------------------------ */

export function accountButton() {
  const member = store.me.member
  const btn = h('button.avatar-btn', { type: 'button', 'aria-label': 'Account', 'aria-haspopup': 'menu', onclick: () => accountMenu(btn) },
    avatarOf(member))
  return btn
}

function avatarOf(member) {
  const el = h('span.avatar.me', { 'aria-hidden': 'true' })
  if (member.picture) el.append(h('img', { src: member.picture, alt: '', referrerpolicy: 'no-referrer' }))
  else el.textContent = (member.name || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase()
  return el
}

function accountMenu(anchor) {
  const member = store.me.member
  const seg = segmented(
    [{ value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'system', label: 'Auto', icon: 'monitor' }],
    theme.mode(),
    (value) => {
      const r = seg.querySelector(`[aria-pressed="true"]`).getBoundingClientRect()
      theme.setMode(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    },
    { label: 'Appearance' })
  const soundRow = h('button.menu-item', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(sound.on), onclick: () => {
    sound.set(!sound.on)
    soundRow.setAttribute('aria-checked', String(sound.on))
    soundRow.firstChild.replaceWith(ic(sound.on ? 'sound' : 'mute', 19))
  } }, ic(sound.on ? 'sound' : 'mute', 19), h('span.grow', 'Sounds'), h('span.switch'))
  const surfaces = globalThis.__HOLM_SURFACES__
  const feedback = globalThis.HolmFeedback
  menu(anchor, [
    h('div.me', avatarOf(member), h('div.grow', h('b.trunc', member.name), h('small', 'Signed in to Zend'))),
    seg,
    soundRow,
    'sep',
    surfaces && surfaces.analytics ? { label: 'Analytics', icon: 'chart', onclick: () => { location.href = surfaces.analytics } } : null,
    feedback ? { label: 'Send feedback', icon: 'feedback', onclick: () => feedback.open() } : null,
    { label: 'Rules for texting', icon: 'shield', onclick: () => go('/phone#rules') },
    { label: 'Sign out', icon: 'logout', onclick: signOut },
    'sep',
    footNote()
  ])
}

export function footNote() {
  return h('div.foot',
    h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener', html: `<svg width="12" height="12" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${HOLM}"/></svg>A Holm app` }),
    h('span', { 'aria-hidden': 'true' }, '·'),
    h('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/zend', target: '_blank', rel: 'noopener' }, 'Source'))
}

async function signOut() {
  try { await fetch(store.me.logoutURL, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

export function signIn() {
  location.href = store.me && store.me.loginURL ? store.me.loginURL : '/auth/login'
}

/* ---- Keyboard ------------------------------------------------------------------- */

addEventListener('keydown', (event) => {
  if (!shell || $('.layer') || $('.menu')) return
  const mod = event.metaKey || event.ctrlKey
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (route.tab !== 'chats') go('/')
    requestAnimationFrame(() => shell.list.focusSearch())
  } else if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    shell.list.step(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Escape' && !typing && route.tab === 'chats' && route.name !== 'home') {
    go('/')
  } else if (!typing && !mod && event.key === 'n' && store.state && store.state.phone) {
    event.preventDefault()
    go('/new')
  }
})

/* ---- Start-up --------------------------------------------------------------------- */

on((event) => {
  if (event.type === 'threads') drawBadges()
  if (event.type === 'changed' && event.arrived.length) {
    sound.received()
    haptic(12)
    const elsewhere = event.arrived.filter(n => n !== store.viewing)
    if (elsewhere.length && document.hidden === false && route && route.name !== 'thread') {
      const t = store.threads.find(x => x.number === elsewhere[0])
      if (t && wide()) toast(`${t.name || 'New reply'}: ${t.last.body}`, { kind: 'info' })
    }
  }
  if (event.type === 'state' && route && route.name === 'home') render()
})

async function boot() {
  await loadMe()
  if (store.me.member) {
    try {
      await Promise.all([loadState(), loadThreads()])
    } catch (error) {
      toast(error.message, { kind: 'bad' })
    }
    connect(store.me.channel)
    // A real phone's "last seen" comes from SMSGate: ask now and then.
    const p = store.state && store.state.phone
    if (p && p.kind !== 'demo' && Date.now() - (p.checkedAt || 0) > 10 * 60000) {
      api.post('/api/phone/check').then(loadState).catch(() => {})
    }
  }
  render()
}

boot()

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
