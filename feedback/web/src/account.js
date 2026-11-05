// Who is signed in: the avatar circle, its menu (with the theme), and Holm's
// hosted sign-in page in an overlay, so the reader keeps their place.
import { $, el, api, glyph, store, link } from './lib.js'
import { remembered, startLink, forget } from './link.js'
import { mcpSheet } from './mcp.js'

// Light, dark or the system's choice. index.html applies the saved one
// before the first paint.
const THEMES = [['light', 'sun', 'Light'], ['system', 'system', 'Auto'], ['dark', 'moon', 'Dark']]

function applyTheme(choice) {
  const root = document.documentElement
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice
  else delete root.dataset.theme
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    const dark = choice === 'dark' || (choice !== 'light' && meta.media.includes('dark'))
    meta.content = dark ? '#17151f' : '#f4f3f1'
  })
}
applyTheme(store.get('theme', 'system'))

function setTheme(choice) { store.set('theme', choice); applyTheme(choice) }

function themeSwitch() {
  const group = el('div', { class: 'theme', role: 'group', 'aria-label': 'Theme' })
  const paint = () => group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.choice === store.get('theme', 'system'))))
  for (const [choice, icon, label] of THEMES) {
    group.append(el('button', {
      type: 'button', 'data-choice': choice, 'aria-label': label + ' theme', title: label,
      onclick: () => { setTheme(choice); paint() }
    }, glyph(icon)))
  }
  paint()
  return group
}

let me = null
let opened = null
// This host's MCP connector address, from the server.
let mcp = null
const listeners = []

// `link`: this tab was opened from an inbox link, and its session is live.
export const viewer = () => ({ me, link: opened })
export const onViewer = fn => listeners.push(fn)

// Who was here last time, so a reload draws at once; /api/me corrects it a moment later. A
// tab opened from an inbox link always asks first.
export function cachedViewer() {
  if (remembered()) return false
  const kept = store.get('viewer', null)
  if (!kept) return false
  me = kept.me || null
  mcp = kept.mcp || null
  render()
  return true
}

export async function loadViewer() {
  const mine = remembered()
  if (mine && mine !== 'locked') link.project = mine
  try {
    const body = await api('GET', '/api/me')
    me = body.member
    opened = body.link || null
    mcp = body.mcp || null
    if (!opened) store.set('viewer', { me, mcp })
  } catch {
    me = null
    opened = null
  }
  if (opened) startLink(opened)
  else if (link.project) forget()
  render()
  listeners.forEach(fn => fn())
}

function person() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0')
  svg.append(path)
  return svg
}

function render() {
  const button = el('button', {
    type: 'button', class: 'avatar-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': me ? `Account: ${me.name}` : 'Sign in',
    onclick: event => { event.stopPropagation(); toggleMenu(button) }
  }, el('span', { class: 'avatar-face' }, me ? el('img', { src: me.avatar, alt: '', referrerpolicy: 'no-referrer' }) : person()))
  $('#account').replaceChildren(button)
}

function toggleMenu(button) {
  const open = $('.menu')
  if (open) return close(open, button)
  const theme = el('div', { class: 'menu-row' }, el('span', {}, 'Theme'), themeSwitch())
  const menu = me
    ? el('div', { class: 'menu', role: 'menu' },
        el('div', { class: 'menu-head' }, el('strong', {}, me.name), me.email && el('span', {}, me.email)),
        el('a', { href: '/', 'data-link': true, role: 'menuitem' }, 'Your projects'),
        el('a', { href: '/mine', 'data-link': true, role: 'menuitem' }, 'Your feedback'),
        el('a', { href: '/stats', 'data-link': true, role: 'menuitem' }, 'Stats'),
        el('a', { href: '/keys', 'data-link': true, role: 'menuitem' }, 'API keys'),
        el('a', { href: '/changelog', 'data-link': true, role: 'menuitem' }, 'Changelog'),
        el('button', { type: 'button', role: 'menuitem', class: 'menu-mcp', onclick: () => mcpSheet(mcp || undefined) },
          el('span', {}, 'Connect via MCP…'), glyph('mcp')),
        theme,
        el('button', { type: 'button', role: 'menuitem', onclick: signOut }, 'Sign out'))
    : el('div', { class: 'menu', role: 'menu' },
        !opened && el('button', { type: 'button', role: 'menuitem', onclick: () => signIn().catch(() => {}) }, 'Sign in'),
        el('a', { href: '/changelog', 'data-link': true, role: 'menuitem' }, 'Changelog'),
        theme)
  $('#account').append(menu)
  button.setAttribute('aria-expanded', 'true')
  menu.querySelector('a, button').focus()
  const dismiss = event => {
    if (event.type === 'keydown' && event.key !== 'Escape') return
    // The theme buttons and the menu's own padding keep it open.
    if (event.type === 'click' && menu.contains(event.target) && (!event.target.closest('a, button') || event.target.closest('.theme'))) return
    // A second click on the avatar only closes the menu; it never reaches
    // the avatar's own handler, which would open it again.
    if (event.type === 'click' && button.contains(event.target)) event.stopPropagation()
    close(menu, button, event.type === 'keydown')
    document.removeEventListener('click', dismiss, true)
    document.removeEventListener('keydown', dismiss)
  }
  setTimeout(() => {
    document.addEventListener('click', dismiss, true)
    document.addEventListener('keydown', dismiss)
  })
}

function close(menu, button, refocus) {
  menu.remove()
  button.setAttribute('aria-expanded', 'false')
  if (refocus) button.focus()
}

async function signOut() {
  try {
    // A redirect to the sign-in page means it worked; don't follow it.
    await fetch('/auth/logout', { method: 'POST', credentials: 'include', redirect: 'manual' })
  } catch {}
  me = null
  // Signing out leaves nothing of the account on this device.
  try { Object.keys(localStorage).filter(key => /^feedback\.(viewer|projects\.)/.test(key)).forEach(key => localStorage.removeItem(key)) } catch {}
  render()
  listeners.forEach(fn => fn())
}

let pending = null
export function signIn() {
  if (pending) return pending
  pending = new Promise((resolve, reject) => {
    const back = encodeURIComponent(location.pathname + location.search)
    const frame = el('iframe', { src: `/auth/login?embed=1&dismissible=true&dismiss_to=${back}&redirect=${back}`, title: 'Sign in' })
    const overlay = el('div', { class: 'signin', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in' }, frame)
    const finish = signedIn => {
      overlay.remove()
      removeEventListener('message', onMessage)
      document.removeEventListener('keydown', onKey)
      pending = null
      signedIn ? resolve(me) : reject(new Error('dismissed'))
    }
    const onMessage = async event => {
      if (event.origin !== location.origin || !event.data || event.data.source !== 'holm-auth') return
      if (event.data.type === 'dismiss') finish(false)
      if (event.data.type === 'signed-in') {
        await loadViewer()
        finish(!!me)
      }
    }
    const onKey = event => { if (event.key === 'Escape') finish(false) }
    overlay.addEventListener('click', event => { if (event.target === overlay) finish(false) })
    addEventListener('message', onMessage)
    document.addEventListener('keydown', onKey)
    document.body.append(overlay)
  })
  return pending
}

// ⌘K: the places and actions of the account menu, from the keyboard.
export function commands(go) {
  const current = store.get('theme', 'system')
  return [
    me && { label: 'Your projects', icon: 'boxes', run: () => go('/') },
    me && { label: 'Your feedback', icon: 'comment', run: () => go('/mine') },
    me && { label: 'Stats', icon: 'chart', run: () => go('/stats') },
    me && { label: 'API keys', icon: 'lock', run: () => go('/keys') },
    { label: 'Changelog', icon: 'file', run: () => go('/changelog') },
    me && { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet(mcp || undefined) },
    ...THEMES.map(([choice, icon, label]) => ({ label: label + ' theme', icon, hint: current === choice ? 'Current' : null, run: () => setTheme(choice) })),
    me ? { label: 'Sign out', icon: 'person', run: signOut } : !opened && { label: 'Sign in', icon: 'person', run: () => signIn().catch(() => {}) }
  ].filter(Boolean)
}
