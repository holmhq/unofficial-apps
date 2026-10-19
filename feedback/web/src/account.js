// Who is signed in: the avatar circle, its menu (with the theme), and Holm's
// hosted sign-in page in an overlay, so the reader keeps their place.
import { $, el, api, glyph, store } from './lib.js'

// Light, dark or the system's choice. index.html applies the saved one
// before the first paint.
const THEMES = [['light', 'sun', 'Light'], ['system', 'system', 'System'], ['dark', 'moon', 'Dark']]

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

function themeSwitch() {
  const group = el('div', { class: 'theme', role: 'group', 'aria-label': 'Theme' })
  const paint = () => group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.choice === store.get('theme', 'system'))))
  for (const [choice, icon, label] of THEMES) {
    group.append(el('button', {
      type: 'button', 'data-choice': choice, 'aria-label': label + ' theme', title: label,
      onclick: () => { store.set('theme', choice); applyTheme(choice); paint() }
    }, glyph(icon)))
  }
  paint()
  return group
}

let me = null
const listeners = []

export const viewer = () => ({ me })
export const onViewer = fn => listeners.push(fn)

export async function loadViewer() {
  try {
    const body = await api('GET', '/api/me')
    me = body.member
  } catch {
    me = null
  }
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
  }, me ? el('img', { src: me.avatar, alt: '', referrerpolicy: 'no-referrer' }) : person())
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
        el('a', { href: '/stats', 'data-link': true, role: 'menuitem' }, 'Stats'),
        el('a', { href: '/keys', 'data-link': true, role: 'menuitem' }, 'API keys'),
        theme,
        el('button', { type: 'button', role: 'menuitem', onclick: signOut }, 'Sign out'))
    : el('div', { class: 'menu', role: 'menu' },
        el('button', { type: 'button', role: 'menuitem', onclick: () => signIn().catch(() => {}) }, 'Sign in'),
        theme)
  $('#account').append(menu)
  button.setAttribute('aria-expanded', 'true')
  menu.querySelector('a, button').focus()
  const dismiss = event => {
    if (event.type === 'keydown' && event.key !== 'Escape') return
    // The theme buttons and the menu's own padding keep it open.
    if (event.type === 'click' && menu.contains(event.target) && (!event.target.closest('a, button') || event.target.closest('.theme'))) return
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
