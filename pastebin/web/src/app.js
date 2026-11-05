// pastebin: router, session, theme and sign-in.

import { h, icon, api, spinner, local, scrollPanelTo, store } from './lib.js'
import { mountCompose } from './views/compose.js'
import { mountView } from './views/view.js'
import { mountMine } from './views/mine.js'
import { mountKeys } from './views/keys.js'
import { mcpSheet } from './mcp.js'
import { togglePalette } from './palette.js'

const main = document.getElementById('main')
let me = null
// This host's MCP connector address, from the server.
let mcp = null
let current = null
let meReady = null

// Who was here last time, so the avatar and the signed-in pages draw at once on a reload;
// /api/me corrects it a moment later if that changed.
me = store.get('pb.me', null)
mcp = store.get('pb.mcp', null)

const ctx = {
  me: () => me,
  setMe(next) { me = next; store.set('pb.me', me); renderAccount() },
  navigate,
  signIn,
}

// ── theme ──────────────────────────────────────────────────

const THEMES = [['light', 'sun', 'Light'], ['system', 'system', 'Auto'], ['dark', 'moon', 'Dark']]

function savedTheme() {
  try { return localStorage.getItem('pb.theme') || 'system' } catch (e) { return 'system' }
}

function applyTheme(choice) {
  const root = document.documentElement
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (choice === 'system') m.setAttribute('content', m.media.includes('dark') ? '#0d2340' : '#f3f6fa')
    else m.setAttribute('content', dark ? '#0d2340' : '#f3f6fa')
  })
}
applyTheme(savedTheme())

function setTheme(id) {
  try { localStorage.setItem('pb.theme', id) } catch (e) { /* private mode */ }
  applyTheme(id)
}

// Light / Auto / Dark as three icons, shown inside the account menu.
function themeSwitch() {
  const group = h('div.theme', { role: 'group', 'aria-label': 'Theme' })
  const paint = () => group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === savedTheme())))
  for (const [id, ico, label] of THEMES) {
    group.append(h('button', {
      type: 'button', 'data-theme': id, 'aria-label': label + ' theme', title: label,
      onclick: () => { setTheme(id); paint() },
    }, icon(ico)))
  }
  paint()
  return group
}

document.querySelector('.new-btn').append(icon('plus'), h('span', 'New paste'))

// ── session ────────────────────────────────────────────────

async function refreshMe() {
  try {
    const res = await api('GET', '/api/me')
    me = res.authenticated ? res.member : null
    mcp = res.mcp || null
    store.set('pb.me', me)
    store.set('pb.mcp', mcp)
  } catch (e) {
    // Offline: keep who we last knew, so the page still draws.
  }
  renderAccount()
  return me
}

function renderAccount() {
  const host = document.getElementById('account')
  const face = me
    ? h('img', { src: local(me.avatar) || '/auth/avatar?seed=' + encodeURIComponent(me.id), alt: '', referrerpolicy: 'no-referrer' })
    : icon('user')
  // A 44px target around a 34px face, so it's easy to tap without looking bigger.
  const btn = h('button.avatar-btn', {
    type: 'button', class: me ? null : 'is-guest', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': me ? 'Account and settings' : 'Sign in and settings',
  }, h('span.avatar-face', face))
  btn.addEventListener('click', e => { e.stopPropagation(); openMenu(btn) })
  host.replaceChildren(btn)
}

function openMenu(anchor) {
  const existing = document.querySelector('.account-menu')
  if (existing) { existing.remove(); anchor.setAttribute('aria-expanded', 'false'); return }
  const theme = h('div.menu-row', h('span', 'Theme'), themeSwitch())
  const menu = me
    ? h('div.menu.account-menu', { role: 'menu' },
        h('div.menu-head', h('strong', me.name || 'Signed in'), me.email ? h('span', me.email) : null),
        h('a', { href: '/mine', 'data-link': true, role: 'menuitem' }, icon('list'), 'My pastes'),
        h('a', { href: '/keys', 'data-link': true, role: 'menuitem' }, icon('key'), 'API keys'),
        h('button', { type: 'button', role: 'menuitem', onclick: () => mcpSheet(mcp, anchor) }, icon('mcp'), 'Connect via MCP…'),
        h('div.menu-sep'),
        theme,
        h('div.menu-sep'),
        h('button.danger', { type: 'button', role: 'menuitem', onclick: signOut }, icon('out'), 'Sign out'))
    : h('div.menu.account-menu', { role: 'menu' },
        h('button', { type: 'button', role: 'menuitem', onclick: () => signIn().catch(() => {}) }, icon('user'), 'Sign in'),
        h('div.menu-sep'),
        theme)
  const r = anchor.getBoundingClientRect()
  menu.style.position = 'fixed'
  menu.style.top = (r.bottom + 8) + 'px'
  menu.style.right = Math.max(12, document.documentElement.clientWidth - r.right) + 'px'
  document.body.append(menu)
  anchor.setAttribute('aria-expanded', 'true')
  menu.querySelector('a, button').focus()
  const close = e => {
    if (e.type === 'keydown' && e.key !== 'Escape') return
    // Theme buttons and the menu's own padding keep it open.
    if (e.type === 'click' && menu.contains(e.target) && (!e.target.closest('a,button') || e.target.closest('.theme'))) return
    // A second click on the avatar only closes the menu; it never reaches the avatar's own
    // handler, which would open it again.
    if (e.type === 'click' && anchor.contains(e.target)) e.stopPropagation()
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
  // Signing out leaves nothing of the account on this device.
  try { Object.keys(localStorage).filter(k => /^pb\.(mine|keys)\./.test(k)).forEach(k => localStorage.removeItem(k)) } catch (e) { /* private mode */ }
  ctx.setMe(null)
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

// Path the current view was mounted for; a change of hash alone (a heading
// anchor) must not re-mount it, or an opened one-time paste would be lost.
let mountedPath = ''

function route() {
  mountedPath = location.pathname + location.search
  if (current && current.destroy) current.destroy()
  current = null
  document.querySelectorAll('.menu').forEach(m => m.remove())

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
    // These pages depend on who is signed in. Whoever was here last draws at once; if the
    // session says otherwise, the page is drawn again for whoever it is.
    const mount = nav === 'mine' ? mountMine : mountKeys
    const was = me && me.id
    if (was) {
      current = mount(main, ctx)
      const token = current
      meReady.then(() => { if (current === token && (me && me.id) !== was) route() })
    } else {
      const token = current = {}
      main.replaceChildren(spinner())
      meReady.then(() => {
        if (current !== token) return
        current = mount(main, ctx)
      })
    }
  } else {
    current = mountView(main, '__missing__', ctx)
  }
  // The composer is the home page; elsewhere a quiet button leads back to it.
  document.querySelector('.new-btn').hidden = nav === 'new'
  if (!location.hash) main.scrollTop = 0
}

// The window never scrolls; <main> does. The bar frosts once something scrolls under it.
const topBar = document.getElementById('top')
main.addEventListener('scroll', () => topBar.classList.toggle('glass', main.scrollTop > 2), { passive: true })

// A heading's # link keeps its address, but the panel scrolls by hand: letting the browser
// follow an in-page anchor would move the fixed shell too.
document.addEventListener('click', e => {
  const a = e.target.closest('a.md-anchor')
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  history.replaceState(null, '', a.getAttribute('href'))
  scrollPanelTo(a.parentElement)
})

// ⌘K: the places and actions of the account menu, from the keyboard.
const commands = () => [
  { label: 'New paste', icon: 'plus', run: () => navigate('/') },
  ...(me ? [
    { label: 'My pastes', icon: 'list', run: () => navigate('/mine') },
    { label: 'API keys', icon: 'key', run: () => navigate('/keys') },
    { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet(mcp, document.querySelector('.avatar-btn')) },
  ] : []),
  ...THEMES.map(([id, ico, label]) => ({ label: label + ' theme', icon: ico, hint: savedTheme() === id ? 'Current' : null, run: () => setTheme(id) })),
  me
    ? { label: 'Sign out', icon: 'out', run: signOut }
    : { label: 'Sign in', icon: 'user', run: () => signIn().catch(() => {}) },
]
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K') || e.altKey || e.shiftKey) return
  if (document.querySelector('dialog[open], .signin, .lightbox')) return
  e.preventDefault()
  togglePalette(commands)
})

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]')
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin) return
  e.preventDefault()
  navigate(url.pathname + url.search)
})
window.addEventListener('popstate', () => {
  if (location.pathname + location.search === mountedPath) return
  route()
})

// The footer's feedback link opens the feedback form (vendor/feedback/embed.js).
document.getElementById('feedback').addEventListener('click', () => window.HolmFeedback && window.HolmFeedback.open())

// Boot: show the page right away; the session fills in when it arrives.
renderAccount()
meReady = refreshMe()
route()
meReady.then(() => { if (current && current.onMe) current.onMe() })

// The app shell: every file of this version is kept on the device, so pages open at once.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
