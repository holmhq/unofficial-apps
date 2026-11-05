// What every page shares: who's signed in, the catalog of sounds, moving between pages, the
// top bar with its round account button, the account menu and the footer.
import { h, ic, avatar, menu, segmented, toggle, haptic, toast, sheet, copyField } from './ui.js'
import { mark, holmMark } from './icons.js'
import * as api from './api.js'
import * as theme from './theme.js'
import * as audio from './audio.js'
import * as notify from './notify.js'

export const state = { me: null, catalog: null }

export async function loadMe() {
  const back = encodeURIComponent(location.pathname + location.search)
  try {
    state.me = await api.get('/api/me?return=' + back)
  } catch {
    state.me = { signed_in: false, login_url: '/auth/login', logout_url: null, voice_ready: false }
  }
  return state.me
}

export async function loadCatalog() {
  if (state.catalog) return state.catalog
  state.catalog = await api.get('/api/sounds')
  return state.catalog
}

export const kindOf = (id) => (state.catalog && state.catalog.kinds.find((k) => k.id === id)) || (id === 'say' ? { id: 'say', label: 'Said', icon: 'voice', tone: 'violet' } : { id, label: id, icon: 'info', tone: 'grey' })
export const soundOf = (id) => (state.catalog && state.catalog.sounds.find((s) => s.id === id)) || null
export const soundName = (id) => (id === 'none' ? 'Silent' : (soundOf(id) || {}).name || id)
export const KIND_ICON = { check: 'circleCheck', hand: 'hand', help: 'circleHelp', alert: 'triangleAlert', info: 'info', play: 'play', voice: 'audioLines' }

// This browser, as the server shows it on cards ("heard on Chrome · Mac").
export function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad|iPod/.test(ua) ? (/iPad/.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua)) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : ''
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone
  return [standalone ? 'Ralk app' : browser, os].filter(Boolean).join(' · ')
}

/* ---- Moving between pages ------------------------------------------------- */

let render = () => {}
export function setRenderer(fn) { render = fn }

export function go(path, { replace = false, dir = 'forward' } = {}) {
  if (path === location.pathname + location.search && !replace) return
  history[replace ? 'replaceState' : 'pushState']({ page: path }, '', path)
  render(dir)
}

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

export function signIn() {
  location.href = state.me && state.me.login_url ? state.me.login_url : '/auth/login'
}

export async function signOut() {
  try { await fetch(state.me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

/* ---- Top bar ------------------------------------------------------------------ */

export function brand() {
  return h('a.brand', { href: '/', 'aria-label': 'Ralk home', onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/') } },
    h('span.brand-mark', mark(16)), h('span.brand-name', 'Ralk'))
}

export function topBar({ left = null, title = null, right = [] } = {}) {
  return h('header.top.glass',
    h('div.top-l', left || brand()),
    title ? h('div.top-title.small-title', title) : null,
    h('div.top-r', ...right, accountButton()))
}

export function accountButton() {
  const m = state.me && state.me.signed_in ? state.me : null
  const btn = h('button.avatar-btn', { type: 'button', 'aria-label': m ? `Account: ${m.name}` : 'Sign in', 'aria-haspopup': 'menu' },
    m ? avatar({ key: m.email || m.name, name: m.name, picture: m.picture }) : h('span.avatar.ghost', ic('user', 17, 2)))
  btn.addEventListener('click', () => { haptic(); accountMenu(btn) })
  return btn
}

function row(icon, label, control) {
  return h('label.menu-item.row-switch', ic(icon, 19), h('span.grow', label), control)
}

function accountMenu(anchor) {
  const me = state.me || {}
  const m = me.signed_in ? me : null
  const themes = segmented([
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'Match this device', icon: 'monitor' }
  ], theme.mode(), (value) => {
    const r = themes.getBoundingClientRect()
    theme.setMode(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    audio.play('pro_hover_tick/soft')
  }, { label: 'Appearance', icons: true })
  const surfaces = globalThis.__HOLM_SURFACES__
  const perm = notify.permission()
  const items = [
    m
      ? h('div.me', avatar({ key: m.email || m.name, name: m.name, picture: m.picture }), h('div.grow', h('b.trunc', m.name || 'You'), h('small.trunc', m.email || '')))
      : h('div.me', h('span.avatar.ghost', ic('user', 22, 2)), h('div.grow', h('b', 'Not signed in'), h('small', 'Sign in to connect Claude'))),
    'sep',
    m ? { label: 'Connect via MCP…', icon: 'mcp', onclick: () => mcpSheet() } : null,
    themes,
    row('volume2', 'Sounds', toggle(audio.isOn(), (v) => { audio.setOn(v); if (v) audio.play('ui_pop/soft', { force: true }) }, 'Sounds')),
    m && perm !== 'unsupported' ? { label: perm === 'granted' ? 'Notifications allowed' : perm === 'denied' ? 'Notifications blocked' : 'Allow notifications', icon: perm === 'granted' ? 'bellRing' : perm === 'denied' ? 'bellOff' : 'bell', onclick: () => { if (perm === 'default') notify.ask().then((p) => toast(p === 'granted' ? 'Notifications allowed' : 'Notifications stay off', { kind: p === 'granted' ? 'good' : 'info' })); else if (perm === 'denied') toast('Allow notifications for this site in your browser’s settings.', { kind: 'info', ms: 5000 }); else toast('Browser notifications are on') } } : null,
    surfaces && surfaces.analytics && me.admin ? { label: 'Analytics', icon: 'chartColumn', href: surfaces.analytics } : null,
    'sep',
    m ? { label: 'Sign out', icon: 'logOut', onclick: signOut } : { label: 'Sign in', icon: 'user', onclick: signIn }
  ]
  menu(anchor, items, { align: 'end' })
}

/* ---- Connecting Claude, or any app that takes MCP connectors ---------------------- */

// One sheet: the address to copy, then how to add it to Claude, ChatGPT or Claude Code, and
// what the tools do. The address comes from /api/me, so each host shows its own.
export function mcpSheet(tab = 'claude') {
  const mcp = (state.me && state.me.mcp) || location.origin + '/_holm/mcp'
  const command = 'claude mcp add --transport http ralk ' + mcp
  const pop = () => audio.play('ui_pop/soft')
  const step = (n, title, text) => h('div.row', h('span.row-ic.is-num', String(n)), h('div.grow', h('b', title), h('small', text)))
  const can = (icon, title, text) => h('div.row', h('span.row-ic', ic(icon, 17, 2)), h('div.grow', h('b', title), h('small', text)))
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div.group',
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it Ralk and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your notifications.')),
    chatgpt: h('div.group',
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it Ralk, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick Ralk from + in a chat.')),
    code: h('div.sheet-stack',
      copyField(command, { onCopy: pop }),
      h('p.sheet-note', 'Run it where Claude Code runs, then type ', h('code', '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div.group',
      can('bellRing', 'Tell you', 'A sound and a notification on your devices.'),
      can('audioLines', 'Say it out loud', 'A line or two, in the voice you chose.'),
      can('slidersHorizontal', 'Change your sounds', 'The voice, and the sound for each kind.'),
      can('history', 'Look back', 'Recent notifications, or clear them.'))
  }
  const show = (v) => Object.entries(panes).forEach(([k, el]) => { el.classList.toggle('is-on', k === v); el.inert = k !== v })
  show(tab)
  return sheet({
    title: 'Connect via MCP',
    cancel: null,
    done: 'Done',
    wide: true,
    // Opened from the account menu, whose item is gone by now: focus goes back to the avatar.
    onClose: () => { if (!document.activeElement || document.activeElement === document.body) { const b = document.querySelector('.avatar-btn'); if (b) b.focus({ preventScroll: true }) } },
    body: () => h('div.sheet-stack.mcp-sheet',
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: 60, height: 60 }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', ic('mcp', 32))),
      h('div.sheet-label', 'Connector address'),
      copyField(mcp, { onCopy: pop }),
      segmented([
        { value: 'claude', label: 'Claude' },
        { value: 'chatgpt', label: 'ChatGPT' },
        { value: 'code', label: 'Claude Code' },
        { value: 'tools', label: 'Tools' }
      ], tab, (v) => { show(v); audio.play('pro_hover_tick/soft') }, { label: 'Where to connect' }),
      h('div.mcp-panes', ...Object.values(panes)))
  })
}

/* ---- Footer and feedback ------------------------------------------------------- */

export const FEEDBACK_PROJECT = 'rjqkscen'
let feedbackScript = null
export function feedback() {
  if (!FEEDBACK_PROJECT) return
  if (!feedbackScript) {
    feedbackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: FEEDBACK_PROJECT, origin: 'https://feedback.zyt.app', color: '#6d4cf2', button: 'none' })
      s.onload = () => resolve()
      s.onerror = () => { feedbackScript = null; reject(new Error('Feedback is not available right now.')) }
      document.head.append(s)
    })
  }
  feedbackScript.then(() => (globalThis.HolmFeedback || globalThis.ZytFeedback)?.open?.()).catch((error) => toast(error.message, { kind: 'bad' }))
}

export function holmFooter() {
  return h('footer.holm-foot',
    h('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener' }, holmMark(12), 'A Holm app'),
    FEEDBACK_PROJECT ? h('span.dot') : null,
    FEEDBACK_PROJECT ? h('button', { type: 'button', onclick: feedback }, 'Send feedback') : null,
    h('span.dot'),
    h('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/ralk', target: '_blank', rel: 'noopener' }, 'Source'))
}

export function failure(error) {
  toast(error && error.message ? error.message : 'Something went wrong.', { kind: 'bad' })
  audio.play('ui_pop/fall')
}
