// pastebin: router, session, theme and sign-in.

import { h, icon, api, spinner, local } from './lib.js'
import { mountCompose } from './views/compose.js'
import { mountView } from './views/view.js'
import { mountMine } from './views/mine.js'
import { mountKeys } from './views/keys.js'

const main = document.getElementById('main')
let me = null
let current = null
let meReady = null

const ctx = {
  me: () => me,
  setMe(next) { me = next; renderAccount() },
  navigate,
  signIn,
}

// ── theme ──────────────────────────────────────────────────

const THEME_ICONS = { light: 'sun', system: 'system', dark: 'moon' }
const themeButtons = document.querySelectorAll('[data-theme-set]')

function applyTheme(choice) {
  const root = document.documentElement
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')
  themeButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice)))
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (choice === 'system') m.setAttribute('content', m.media.includes('dark') ? '#0d2340' : '#f3f6fa')
    else m.setAttribute('content', dark ? '#0d2340' : '#f3f6fa')
  })
}

themeButtons.forEach(b => {
  b.append(icon(THEME_ICONS[b.dataset.themeSet]))
  b.addEventListener('click', () => {
    let choice = b.dataset.themeSet
    try { localStorage.setItem('pb.theme', choice) } catch (e) { /* private mode */ }
    applyTheme(choice)
  })
})
applyTheme((() => { try { return localStorage.getItem('pb.theme') || 'system' } catch (e) { return 'system' } })())

document.querySelector('.new-btn').append(icon('plus'), h('span', 'New paste'))

// ── session ────────────────────────────────────────────────

async function refreshMe() {
  try {
    const res = await api('GET', '/api/me')
    me = res.authenticated ? res.member : null
  } catch (e) {
    me = null
  }
  renderAccount()
  return me
}

function renderAccount() {
  const host = document.getElementById('account')
  if (!me) {
    host.replaceChildren(h('button.btn.btn-quiet', { type: 'button', onclick: () => signIn().catch(() => {}) }, 'Sign in'))
    return
  }
  const btn = h('button.avatar-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account menu' },
    h('img', { src: local(me.avatar) || '/auth/avatar?seed=' + encodeURIComponent(me.id), alt: '', referrerpolicy: 'no-referrer' }))
  btn.addEventListener('click', e => { e.stopPropagation(); openMenu(btn) })
  host.replaceChildren(btn)
}

function openMenu(anchor) {
  const existing = document.querySelector('.menu')
  if (existing) { existing.remove(); anchor.setAttribute('aria-expanded', 'false'); return }
  const menu = h('div.menu', { role: 'menu' },
    h('div.menu-head', h('strong', me.name || 'Signed in'), me.email ? h('span', me.email) : null),
    h('a', { href: '/mine', 'data-link': true, role: 'menuitem' }, icon('list'), 'My pastes'),
    h('a', { href: '/keys', 'data-link': true, role: 'menuitem' }, icon('key'), 'API keys'),
    h('button.danger', { type: 'button', role: 'menuitem', onclick: signOut }, icon('out'), 'Sign out'))
  const r = anchor.getBoundingClientRect()
  menu.style.top = (r.bottom + window.scrollY + 8) + 'px'
  menu.style.right = Math.max(12, document.documentElement.clientWidth - r.right) + 'px'
  document.body.append(menu)
  anchor.setAttribute('aria-expanded', 'true')
  menu.querySelector('a').focus()
  const close = e => {
    if (e.type === 'keydown' && e.key !== 'Escape') return
    if (e.type === 'click' && menu.contains(e.target) && !e.target.closest('a,button')) return
    menu.remove()
    anchor.setAttribute('aria-expanded', 'false')
    document.removeEventListener('click', close, true)
    document.removeEventListener('keydown', close)
    if (e.type === 'keydown') anchor.focus()
  }
  setTimeout(() => {
    document.addEventListener('click', close, true)
    document.addEventListener('keydown', close)
  })
}

async function signOut() {
  try {
    // 307 to /auth/login is the success signal; don't let fetch follow it as a POST.
    await fetch('/auth/logout', { method: 'POST', credentials: 'include', redirect: 'manual' })
  } catch (e) { /* the cookie is cleared server-side regardless */ }
  me = null
  renderAccount()
  navigate('/', true)
}

// Holm's hosted sign-in page in an overlay, so drafts and scroll survive.
let pendingSignIn = null
function signIn() {
  if (pendingSignIn) return pendingSignIn
  pendingSignIn = new Promise((resolve, reject) => {
    const back = encodeURIComponent(location.pathname + location.search)
    const frame = h('iframe', { src: '/auth/login?embed=1&dismissible=true&dismiss_to=' + back + '&redirect=' + back, title: 'Sign in' })
    const overlay = h('div.signin', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in' }, frame)
    const finish = ok => {
      overlay.remove()
      window.removeEventListener('message', onMessage)
      document.removeEventListener('keydown', onKey)
      pendingSignIn = null
      ok ? resolve(me) : reject(new Error('dismissed'))
    }
    const onMessage = async e => {
      if (e.origin !== location.origin || !e.data || e.data.source !== 'holm-auth') return
      if (e.data.type === 'dismiss') finish(false)
      if (e.data.type === 'signed-in') {
        await refreshMe()
        finish(!!me)
        if (current && current.onMe) current.onMe()
        else if (location.pathname !== '/') route()
      }
    }
    const onKey = e => { if (e.key === 'Escape') finish(false) }
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false) })
    window.addEventListener('message', onMessage)
    document.addEventListener('keydown', onKey)
    document.body.append(overlay)
  })
  return pendingSignIn
}

// ── router ─────────────────────────────────────────────────

function navigate(path, replace) {
  if (replace) history.replaceState(null, '', path)
  else if (path !== location.pathname + location.search) history.pushState(null, '', path)
  route()
}

function route() {
  if (current && current.destroy) current.destroy()
  current = null
  const menu = document.querySelector('.menu')
  if (menu) menu.remove()

  const path = location.pathname.replace(/\/+$/, '') || '/'
  let nav = ''
  let m
  document.title = 'pastebin'
  if (path === '/' || path === '/new') {
    nav = 'new'
    current = mountCompose(main, ctx)
  } else if ((m = /^\/p\/([A-Za-z0-9_-]{4,64})$/.exec(path))) {
    current = mountView(main, m[1], ctx)
  } else if (path === '/mine' || path === '/keys') {
    nav = path.slice(1)
    document.title = (nav === 'mine' ? 'My pastes' : 'API keys') + ' · pastebin'
    // These pages depend on who is signed in; wait for the session once.
    const token = current = {}
    main.replaceChildren(spinner())
    meReady.then(() => {
      if (current !== token) return
      current = (nav === 'mine' ? mountMine : mountKeys)(main, ctx)
    })
  } else {
    current = mountView(main, '__missing__', ctx)
  }
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  window.scrollTo(0, 0)
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]')
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin) return
  e.preventDefault()
  navigate(url.pathname + url.search)
})
window.addEventListener('popstate', route)

// Boot: show the page right away; the session fills in when it arrives.
renderAccount()
meReady = refreshMe()
route()
meReady.then(() => { if (current && current.onMe) current.onMe() })
