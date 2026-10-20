import { h, api, avatar } from './ui.js'
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

async function loadSession() {
  try {
    const data = await api(`/api/me?next=${encodeURIComponent(location.pathname)}`)
    session.me = data.member
    session.logoutURL = data.logoutURL
  } catch { session.me = null }
  renderAccount()
}

function renderAccount() {
  const root = document.getElementById('account')
  root.replaceChildren()
  if (!session.me) {
    root.append(h('button', { class: 'button quiet small', type: 'button', onclick: () => signIn() }, 'Sign in'))
    return
  }
  const me = { name: session.me.name || session.me.email, picture: session.me.picture, color: 0 }
  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' },
    h('div', { class: 'who' }, h('strong', {}, session.me.name || 'Signed in'), session.me.email || ''),
    h('a', { href: '/', role: 'menuitem' }, 'Your plans'),
    h('a', { href: '/new', role: 'menuitem' }, 'New plan'),
    h('a', { href: session.logoutURL, role: 'menuitem', 'data-native': '' }, 'Sign out'))
  const button = h('button', { class: 'avatar-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Account' }, avatar(me, '2.1rem'))
  const wrap = h('div', { class: 'menu-wrap' }, button, menu)
  const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false') }
  button.addEventListener('click', e => {
    e.stopPropagation()
    menu.hidden = !menu.hidden
    button.setAttribute('aria-expanded', String(!menu.hidden))
  })
  document.addEventListener('click', close)
  addEventListener('keydown', e => { if (e.key === 'Escape') close() })
  root.append(wrap)
}

// Theme: system, then light, then dark.
const themeButton = document.getElementById('theme')
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
  themeButton.title = `Theme: ${theme || 'system'}`
  const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#121314' : '#f6f3ec'))
}
let theme = (() => { try { return localStorage.getItem('overlap:theme') } catch { return null } })()
applyTheme(theme)
themeButton.addEventListener('click', () => {
  theme = theme === null ? 'light' : theme === 'light' ? 'dark' : null
  try { theme ? localStorage.setItem('overlap:theme', theme) : localStorage.removeItem('overlap:theme') } catch {}
  const swap = () => applyTheme(theme)
  document.startViewTransition ? document.startViewTransition(swap) : swap()
})

const soundButton = document.getElementById('sound')
soundButton.setAttribute('aria-pressed', String(soundOn()))
soundButton.addEventListener('click', () => {
  const on = !soundOn()
  setSound(on)
  soundButton.setAttribute('aria-pressed', String(on))
  soundButton.title = on ? 'Sound on' : 'Sound off'
  if (on) tick()
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
  const go = () => route().then(() => scrollTo({ top: 0 }))
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

await loadSession()
await route()
