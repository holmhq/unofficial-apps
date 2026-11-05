import { h, api, avatar, mcpMark, icon, store } from './ui.js'
import { togglePalette } from './palette.js'
import { mcpSheet } from './mcp.js'
import { soundOn, setSound, tick } from './sound.js'
import { homeView } from './home.js'
import { createView } from './create.js'
import { planView } from './plan.js'

export const session = { me: null }

// Sign-in returns to the page you were on.
export async function signIn(next = location.pathname) {
  const data = await api(`/api/me?next=${encodeURIComponent(next)}`)
  location.href = data.loginURL
}

// Who was here last time draws at once (the avatar, Your plans); /api/me corrects it a moment
// later, and the page is drawn again only if that changed.
const cachedMe = store.get('me')
session.me = cachedMe?.member || null
session.logoutURL = cachedMe?.logoutURL
session.mcp = cachedMe?.mcp

async function loadSession() {
  const was = session.me?.id || null
  try {
    const data = await api(`/api/me?next=${encodeURIComponent(location.pathname)}`)
    session.me = data.member
    session.logoutURL = data.logoutURL
    session.mcp = data.mcp
    store.set('me', { member: data.member, logoutURL: data.logoutURL, mcp: data.mcp })
  } catch { return false }
  renderAccount()
  return (session.me?.id || null) !== was
}

// Holm signs out on POST only: a link (a GET) answers 405 and leaves the session.
async function signOut() {
  try { await fetch(session.logoutURL || '/auth/logout', { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  // Signing out leaves nothing of the account on this device.
  try { Object.keys(localStorage).filter(k => /^overlap:(me|plans:)/.test(k)).forEach(k => localStorage.removeItem(k)) } catch {}
  location.href = '/'
}

// Theme: three icons in the account menu. Auto follows the device.
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
  const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#121314' : '#f6f3ec'))
}
let theme = (() => { try { return localStorage.getItem('overlap:theme') } catch { return null } })()
applyTheme(theme)
function setTheme(next) {
  theme = next
  try { theme ? localStorage.setItem('overlap:theme', theme) : localStorage.removeItem('overlap:theme') } catch {}
  const swap = () => applyTheme(theme)
  document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(swap) : swap()
}
const THEMES = [['light', 'sun', 'Light'], [null, 'auto', 'Auto'], ['dark', 'moon', 'Dark']]
function themeSwitch() {
  const group = h('div', { class: 'theme-switch', role: 'group', 'aria-label': 'Theme' })
  const paint = () => group.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(THEMES[i][0] === theme)))
  for (const [value, name, label] of THEMES) {
    group.append(h('button', { type: 'button', 'aria-label': `${label} theme`, title: label, onclick: () => { setTheme(value); paint() } }, icon(name)))
  }
  paint()
  return group
}

function toggleSound() {
  const on = !soundOn()
  setSound(on)
  if (on) tick()
  return on
}

// The account button is always a round avatar at the top right, signed out too. A second
// click, Escape or a click anywhere else closes its menu.
let closeMenu = () => {}
function renderAccount() {
  closeMenu()
  const root = document.getElementById('account')
  const me = session.me
  const face = me
    ? avatar({ name: me.name || me.email, picture: me.picture, color: 0 }, '2.1rem')
    : h('span', { class: 'avatar guest', vars: { '--size': '2.1rem' } }, icon('user'))
  const button = h('button', {
    class: 'avatar-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': me ? 'Account and settings' : 'Sign in and settings', title: me ? 'Account' : 'Sign in'
  }, face)
  const soundItem = h('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(soundOn()), class: 'menu-check',
    onclick: e => { e.stopPropagation(); soundItem.setAttribute('aria-checked', String(toggleSound())) } },
  h('span', {}, 'Sound'), icon('check'))
  const themeRow = h('div', { class: 'menu-row', onclick: e => e.stopPropagation() }, h('span', {}, 'Theme'), themeSwitch())
  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' },
    me
      ? [
          h('div', { class: 'who' }, h('strong', {}, me.name || 'Signed in'), me.email || ''),
          h('a', { href: '/', role: 'menuitem' }, 'Your plans'),
          h('a', { href: '/new', role: 'menuitem' }, 'New plan'),
          // The menu item is gone once the sheet opens, so closing it puts focus on the avatar.
          h('button', { type: 'button', role: 'menuitem', class: 'menu-mcp', onclick: () => openMcp() },
            h('span', {}, 'Connect via MCP…'), mcpMark())
        ]
      : h('button', { type: 'button', role: 'menuitem', onclick: () => signIn() }, 'Sign in'),
    h('div', { class: 'menu-sep' }),
    soundItem,
    themeRow,
    me ? [h('div', { class: 'menu-sep' }), h('button', { type: 'button', role: 'menuitem', onclick: signOut }, 'Sign out')] : null)
  const set = open => {
    menu.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    if (open) soundItem.setAttribute('aria-checked', String(soundOn()))
  }
  button.addEventListener('click', e => { e.stopPropagation(); set(menu.hidden) })
  const onClick = () => set(false)
  const onKey = e => { if (e.key === 'Escape' && !menu.hidden) { set(false); button.focus() } }
  document.addEventListener('click', onClick)
  addEventListener('keydown', onKey)
  closeMenu = () => { document.removeEventListener('click', onClick); removeEventListener('keydown', onKey) }
  root.replaceChildren(h('div', { class: 'menu-wrap' }, button, menu))
}
const avatarButton = () => document.querySelector('.avatar-button')
const openMcp = () => mcpSheet(session.mcp, { onClose: () => avatarButton()?.focus() })

// ⌘K: the places and actions of the account menu, from the keyboard.
const commands = () => [
  { label: 'Your plans', icon: 'home', run: () => navigate('/') },
  session.me ? { label: 'New plan', icon: 'plus', run: () => navigate('/new') } : null,
  session.me ? { label: 'Connect via MCP…', mark: mcpMark, run: openMcp } : null,
  { label: soundOn() ? 'Turn sound off' : 'Turn sound on', icon: soundOn() ? 'mute' : 'sound', run: toggleSound },
  ...THEMES.map(([value, name, label]) => ({ label: `${label} theme`, icon: name, hint: theme === value ? 'Current' : null, run: () => setTheme(value) })),
  session.me ? { label: 'Sign out', icon: 'signout', run: signOut } : { label: 'Sign in', icon: 'user', run: () => signIn() }
].filter(Boolean)
addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K') || e.altKey || e.shiftKey) return
  if (document.querySelector('dialog[open]')) return
  e.preventDefault()
  togglePalette(commands)
})

// Routing
const routes = [
  [/^\/$/, homeView],
  [/^\/new$/, createView],
  [/^\/p\/([a-z2-9]{10})$/, planView]
]
let current = null

async function route() {
  current?.destroy?.()
  current = null
  const view = document.getElementById('view')
  const render = async () => {
    view.replaceChildren()
    for (const [pattern, show] of routes) {
      const match = pattern.exec(location.pathname)
      if (match) { current = await show(view, ...match.slice(1)); return }
    }
    view.append(h('div', { class: 'card empty' },
      h('h1', { class: 'title' }, 'Nothing here'),
      h('p', {}, 'This page does not exist.'),
      h('a', { class: 'button accent', href: '/' }, 'Go home')))
  }
  await render()
}

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  const go = () => route().then(() => { document.getElementById('view').scrollTop = 0 })
  document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(go) : go()
}

document.addEventListener('click', e => {
  const a = e.target.closest?.('a')
  if (!a || a.target || a.hasAttribute('download') || a.hasAttribute('data-native')) return
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || /^\/(auth|api|_holm)\//.test(url.pathname)) return
  e.preventDefault()
  navigate(url.pathname + url.search)
})
addEventListener('popstate', () => route())

renderAccount()
const session0 = loadSession()
// On a first visit, wait for the session so a signed-in person never sees the signed-out page.
if (!cachedMe) { await session0; await route() }
else { await route(); if (await session0) route() }

// The app shell: every file of this version is kept on the device, so pages open at once.
// (The awaits above may finish after the load event, so don't wait for it.)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
