// What every page shares: who's signed in, moving between pages, the navbar (the search
// lives there once a search has run), the sidebar of places, the phone's tab bar, the
// account menu, and one layer for popovers, sheets and modals.

import { $, esc, act, phone, rel, toast } from './dom.js'
import { svg, svgMark, svgHolm } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'
import * as saved from './saved.js'
import * as lists from './lists.js'

export const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/domains'
export const state = { me: null, view: 'search', listId: null, sideOn: false, layer: null }

try { state.sideOn = localStorage.getItem('domains:side') === '1' } catch {}

export async function loadMe() {
  const back = encodeURIComponent(location.pathname + location.search)
  try { state.me = await api.get('/api/me?return=' + back) } catch { state.me = { signed_in: false, login_url: '/auth/login', logout_url: null } }
  return state.me
}
export function signIn() { location.href = state.me && state.me.login_url ? state.me.login_url : '/auth/login' }
export async function signOut() {
  try { await fetch(state.me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

/* ---- Moving between pages ---- */

let renderer = () => {}
export function setRenderer(fn) { renderer = fn }
export function render(o = {}) { renderer(o) }
export function go(path, { replace = false } = {}) {
  if (path !== location.pathname + location.search || replace) history[replace ? 'replaceState' : 'pushState']({}, '', path)
  renderer()
}

/* ---- Navbar, sidebar, tabs ---- */

export function topHTML(fieldHTML) {
  const n = saved.count()
  return `<header class="top${fieldHTML ? ' has-field' : ''}">
    <div class="top-l"><button type="button" class="icon-btn tgl-side" data-act="side" aria-label="${state.sideOn ? 'Hide' : 'Show'} sidebar" title="${state.sideOn ? 'Hide' : 'Show'} sidebar" aria-expanded="${state.sideOn}">${svg('panelLeft', 19, 1.9)}</button>
      <a class="brand" href="/" data-act="home" aria-label="Domains home">${svgMark(26)}<span>Domains</span></a></div>
    <div class="top-c">${fieldHTML || ''}</div>
    <div class="top-r">${avatarHTML()}</div>
  </header>`
}

function avatarHTML() {
  const m = state.me && state.me.signed_in ? state.me : null
  const inner = m && m.picture ? `<img src="${esc(m.picture)}" alt="" referrerpolicy="no-referrer">` : svg('user', 17, 2)
  return `<button type="button" class="avatar" id="avatar" data-act="account" aria-haspopup="menu" aria-label="${m ? 'Account: ' + esc(m.name || m.email || 'you') : 'Sign in and settings'}" title="${m ? esc(m.name || 'Account') : 'Account'}">${inner}</button>`
}

export function sideHTML() {
  const nav = (view, ic, label, n, id) => {
    const on = state.view === view && (!id || state.listId === id)
    const href = view === 'search' ? '/' : view === 'saved' ? '/saved' : '/lists/' + id
    return `<a class="nav${on ? ' on' : ''}" href="${href}" data-act="nav"${on ? ' aria-current="page"' : ''}>${svg(ic, 18, 1.9)}<span class="nav-t">${esc(label)}</span>${n != null ? `<span class="n">${n}</span>` : ''}</a>`
  }
  return `${nav('search', 'search', 'Search')}${nav('saved', 'star', 'Saved', saved.count() || null)}
    <div class="side-h"><span>Lists</span><button type="button" class="icon-btn sm" data-act="newlist" aria-label="New list" title="New list">${svg('plus', 15, 2.1)}</button></div>
    ${lists.all().map((l) => nav('list', 'folder', l.name, l.items.length || null, l.id)).join('') || '<p class="side-empty">Collect names for a friend or a project.</p>'}
    <div class="side-foot">
      <p>Checked live with <b>Namecheap</b>. Prices are a guide; checkout has the final one.</p>
      <p class="credit"><a href="https://holmhq.com" target="_blank" rel="noopener">${svgHolm(11)}<span>A Holm app</span></a><i></i><a href="/about" data-act="nav">How it works</a><i></i><a href="${SOURCE}" target="_blank" rel="noopener">Source</a></p>
    </div>`
}

export function tabsHTML() {
  const t = (view, ic, label, href) => `<a class="tab${state.view === view || (view === 'lists' && state.view === 'list') ? ' on' : ''}" href="${href}" data-act="nav">${svg(ic, 23, 1.9)}<span>${label}</span></a>`
  return `<nav class="tabs" aria-label="Tabs">${t('search', 'search', 'Search', '/')}${t('saved', 'star', 'Saved', '/saved')}${t('lists', 'folder', 'Lists', '/lists')}</nav>`
}

export function paintSide() {
  const side = $('#side'); if (side) side.innerHTML = sideHTML()
}

export function setSide(on) {
  state.sideOn = on
  try { localStorage.setItem('domains:side', on ? '1' : '0') } catch {}
  const shell = $('.shell'); if (shell) shell.classList.toggle('side-off', !on)
  const b = $('[data-act="side"]')
  if (b) { const l = (on ? 'Hide' : 'Show') + ' sidebar'; b.setAttribute('aria-label', l); b.title = l; b.setAttribute('aria-expanded', String(on)) }
}

/* ---- Layer: popovers on a desk, sheets on a phone, modals for a name and for sharing ---- */

const bodies = {}
export function layerKind(kind, fn) { bodies[kind] = fn }
export function openLayer(o) { state.layer = o; drawLayer(false) }
export function closeLayer() { const was = state.layer; state.layer = null; drawLayer(false); if (was && was.onClose) was.onClose() }
export function isOpen(kind) { return !!state.layer && state.layer.kind === kind }

export function drawLayer(still) {
  const L = $('#layer')
  if (!L) return
  const o = state.layer
  if (!o) { L.className = 'layer'; L.innerHTML = ''; return }
  const b = bodies[o.kind](o)
  const small = phone()
  const box = $('.pop, .sheet, .modal', L)
  const scroll = box ? box.scrollTop : 0
  if (b.modal || small) {
    L.className = 'layer on dim'
    L.innerHTML = small
      ? `<div class="scrim" data-act="close-layer"></div><div class="sheet${still ? ' still' : ''}" role="dialog" aria-modal="true" aria-label="${esc(b.title || 'Details')}"><div class="grab"></div>${b.title && b.head !== false ? `<div class="sheet-h"><h3>${esc(b.title)}</h3><button type="button" class="link-btn" data-act="close-layer">Done</button></div>` : ''}${b.html}</div>`
      : `<div class="scrim" data-act="close-layer"></div><div class="modal${still ? ' still' : ''}" role="dialog" aria-modal="true" aria-label="${esc(b.title || 'Details')}"><button type="button" class="icon-btn sm m-x" data-act="close-layer" aria-label="Close">${svg('x', 16)}</button>${b.html}</div>`
  } else {
    L.className = 'layer on'
    const w = Math.min(b.w || 280, innerWidth - 24)
    let pos = still && o.pos
    if (!pos) {
      let left = 12, top = 64, bottom = null
      const anchor = o.anchor && document.contains(o.anchor) ? o.anchor : (o.sel ? $(o.sel) : null)
      if (anchor) {
        const r = rel(anchor)
        left = b.right ? r.x + r.w - w : r.x
        top = r.y + r.h + 8
        if (top + 220 > innerHeight && r.y > innerHeight / 2) { top = null; bottom = innerHeight - r.y + 8 }
      }
      left = Math.max(12, Math.min(left, innerWidth - w - 12))
      pos = o.pos = { left, top, bottom }
    }
    L.innerHTML = `<div class="scrim" data-act="close-layer"></div><div class="pop${b.right ? ' right' : ''}${still ? ' still' : ''}" role="dialog" aria-label="${esc(b.title || '')}" style="left:${pos.left}px;${pos.top != null ? `top:${pos.top}px` : `bottom:${pos.bottom}px`};width:${w}px">${b.html}</div>`
  }
  const nb = $('.pop, .sheet, .modal', L)
  if (nb && still) nb.scrollTop = scroll
  const focus = $('[autofocus]', L)
  if (focus && !still) setTimeout(() => focus.focus({ preventScroll: true }), 30)
}

/* ---- Account ---- */

layerKind('account', () => {
  const me = state.me || {}
  const m = me.signed_in ? me : null
  const surfaces = globalThis.__HOLM_SURFACES__
  const mode = theme.mode()
  const themes = [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'sunMoon', 'Match this device']]
  return {
    title: 'Account', w: 248, right: true,
    html: `<div class="acct">
      ${m ? `<div class="me">${m.picture ? `<img class="me-pic" src="${esc(m.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="me-pic">${svg('user', 18)}</span>`}<div class="me-t"><b>${esc(m.name || 'You')}</b><small>${esc(m.email || '')}</small></div></div>`
        : `<p>Sign in to keep Saved and your lists on every device, and to share a list.</p><button type="button" class="btn primary" data-act="sign-in">Sign in</button>`}
      <div class="acct-row"><span>Theme</span><div class="theme-seg" role="group" aria-label="Theme">${themes.map(([v, ic, l]) => `<button type="button" class="${mode === v ? 'on' : ''}" data-act="theme" data-v="${v}" aria-label="${l}" title="${l}" aria-pressed="${mode === v}">${svg(ic, 16)}</button>`).join('')}</div></div>
      ${surfaces && surfaces.analytics && me.admin ? `<a class="opt" href="${esc(surfaces.analytics)}" target="_blank" rel="noopener"><span class="ck">${svg('chartColumn', 16)}</span><span class="opt-t">Analytics</span></a>` : ''}
      ${m ? `<button type="button" class="opt" data-act="sign-out"><span class="ck">${svg('logOut', 16)}</span><span class="opt-t">Sign out</span></button>` : ''}
    </div>`,
  }
})

act({
  account: (el) => { if (isOpen('account')) closeLayer(); else openLayer({ kind: 'account', anchor: el }) },
  'sign-in': () => signIn(),
  'sign-out': () => signOut(),
  theme: (el) => {
    const r = el.getBoundingClientRect()
    theme.setMode(el.dataset.v, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    drawLayer(true)
  },
  side: () => setSide(!state.sideOn),
  'close-layer': () => {
    const back = state.layer && state.layer.back
    closeLayer()
    if (back) openLayer(back)
  },
})

export function needsAccount(what) {
  toast(`Sign in to ${what}`)
}
