// The signed-in app: a tab bar on a phone, a sidebar on a wide screen that hides with one
// click, one panel that scrolls, and ⌘K to go anywhere or do something. The inbox keeps
// receiving on every tab; Live shows it. Each tab is built once and kept, with its scroll,
// while you're on another.
import { h, ic, fill, collapsing, haptic, reduced } from '../ui.js'
import { topBar, brand, go, holmFooter, mcpSheet, signOut } from '../shell.js'
import { inbox, on, test } from '../inbox.js'
import * as audio from '../audio.js'
import * as theme from '../theme.js'
import { liveTab } from './live.js'
import { soundsTab } from './sounds.js'
import { voiceTab } from './voice.js'
import { connectTab } from './connect.js'

const TABS = [
  { id: 'live', path: '/', label: 'Live', icon: 'radio', make: liveTab },
  { id: 'sounds', path: '/sounds', label: 'Sounds', icon: 'music', make: soundsTab },
  { id: 'voice', path: '/voice', label: 'Voice', icon: 'audioLines', make: voiceTab },
  { id: 'connect', path: '/connect', label: 'Connect', icon: 'cable', make: connectTab },
]

export function app(tab) {
  const s = { tab: null }
  const made = new Map()
  const main = h('div.panel.main')
  const footer = holmFooter()
  const sideButtons = new Map()
  const tabButtons = new Map()
  const status = h('div.side-status')
  const side = h('nav.side', { 'aria-label': 'Ralk' },
    TABS.map((x) => {
      const b = h('button.side-item', { type: 'button', onclick: () => switchTo(x.id) }, ic(x.icon, 19, 2), h('span.grow', x.label), x.id === 'live' ? h('span.badge', { hidden: true }) : null)
      sideButtons.set(x.id, b)
      return b
    }),
    status)
  const tabbar = h('nav.tabbar', { 'aria-label': 'Sections' }, TABS.map((x) => {
    const b = h('button.tab', { type: 'button', onclick: () => switchTo(x.id) }, h('span.tab-icon', ic(x.icon, 23, 1.9), x.id === 'live' ? h('span.tab-dot', { hidden: true }) : null), h('span', x.label))
    tabButtons.set(x.id, b)
    return b
  }))
  const sideBtn = h('button.icon-btn.side-btn', { type: 'button', 'aria-label': 'Hide sidebar', title: 'Hide sidebar', onclick: () => toggleSide() }, ic('panelLeft', 20, 1.9))
  const bar = topBar({ left: [sideBtn, brand()] })
  const el = h('div.app', bar, h('div.body', side, main), tabbar)
  const recollapse = collapsing(bar, main)

  // The sidebar hides with one click on a desk, and stays as it was left.
  function toggleSide(hidden = !el.classList.contains('is-side-hidden')) {
    el.classList.toggle('is-side-hidden', hidden)
    side.inert = hidden
    sideBtn.setAttribute('aria-label', hidden ? 'Show sidebar' : 'Hide sidebar')
    sideBtn.title = hidden ? 'Show sidebar' : 'Hide sidebar'
    try { localStorage.setItem('ralk:side', hidden ? 'hidden' : 'shown') } catch {}
  }
  try { if (localStorage.getItem('ralk:side') === 'hidden') toggleSide(true) } catch {}

  function switchTo(id) {
    if (id === s.tab) { main.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return }
    haptic(5)
    audio.play('pro_hover_tick/soft')
    go(TABS.find((x) => x.id === id).path)
  }

  function show(id, animate = true) {
    const was = s.tab && made.get(s.tab)
    if (was) was.top = main.scrollTop
    s.tab = id
    el.dataset.tab = id
    for (const [k, b] of sideButtons) b.classList.toggle('on', k === id)
    for (const [k, b] of tabButtons) { b.classList.toggle('on', k === id); b.setAttribute('aria-current', k === id ? 'page' : 'false') }
    const t = TABS.find((x) => x.id === id)
    document.title = id === 'live' ? 'Ralk' : `${t.label} · Ralk`
    let tt = bar.querySelector('.top-title')
    if (!tt) { tt = h('div.top-title.small-title'); bar.insertBefore(tt, bar.querySelector('.top-r')) }
    tt.textContent = t.label
    let view = made.get(id)
    if (!view) { view = t.make({ panel: main }); made.set(id, view) }
    fill(main, view.el, footer)
    main.scrollTop = view.top || 0
    recollapse()
    if (animate && !reduced()) view.el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  function paintStatus() {
    const n = inbox.notes.filter((x) => x.fresh && !x.heard.length).length
    for (const [, b] of sideButtons) { const badge = b.querySelector('.badge'); if (badge) { badge.hidden = !n || s.tab === 'live'; badge.textContent = String(n) } }
    const dot = tabbar.querySelector('.tab-dot')
    if (dot) dot.hidden = !n || s.tab === 'live'
    const live = inbox.status === 'live'
    fill(status, h('span.live-dot' + (live ? '' : '.off')), live ? (audio.armed() ? 'Listening here' : 'Connected, sound off') : inbox.status === 'down' ? 'Reconnecting…' : 'Connecting…')
  }
  const off = [on((type) => { if (type === 'status' || type === 'list' || type === 'note') paintStatus() }), audio.onChange(paintStatus)]

  /* ---- ⌘K: a place or something to do, by typing a few letters of it -------------- */

  let palette = null
  function openPalette() {
    if (palette) { palette.close(); return }
    const input = h('input.pal-field', { type: 'text', placeholder: 'Go to or do…', 'aria-label': 'Go to or do', autocomplete: 'off', spellcheck: 'false' })
    const list = h('div.pal-list', { role: 'listbox' })
    const box = h('div.pal', { role: 'dialog', 'aria-label': 'Command menu' }, h('div.pal-top', ic('search', 18, 2.1), input, h('kbd', 'esc')), list)
    const layer = h('div.pal-layer', { onclick: (e) => { if (e.target === layer) close() } }, box)
    const opener = document.activeElement
    document.body.append(layer)
    requestAnimationFrame(() => layer.classList.add('is-in'))
    input.focus()
    let at = 0
    let shown = []
    const commands = [
      ...TABS.map((x) => ({ label: x.label, icon: x.icon, hint: 'Go', run: () => go(x.path) })),
      { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet() },
      { label: 'Send a test', icon: 'flaskConical', run: () => audio.arm().then(() => test('done')).catch(() => {}) },
      { label: 'Light', icon: 'sun', hint: 'Appearance', run: () => theme.setMode('light') },
      { label: 'Dark', icon: 'moon', hint: 'Appearance', run: () => theme.setMode('dark') },
      { label: 'Match this device', icon: 'monitor', hint: 'Appearance', run: () => theme.setMode('system') },
      { label: 'Sign out', icon: 'logOut', run: () => signOut() },
    ]
    const score = (text, q) => {
      const t = text.toLowerCase()
      if (t.startsWith(q)) return 3
      if (t.includes(' ' + q)) return 2
      if (t.includes(q)) return 1
      let i = 0
      for (const ch of t) if (ch === q[i]) i++
      return i === q.length ? 0.5 : 0
    }
    function draw() {
      const q = input.value.trim().toLowerCase()
      shown = commands.map((c) => ({ ...c, s: q ? Math.max(score(c.label, q), c.hint ? score(c.hint, q) - 1 : 0) : 1 })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s)
      at = Math.min(at, Math.max(0, shown.length - 1))
      fill(list, shown.length ? shown.map((c, n) => h('button.pal-item' + (n === at ? '.is-on' : ''), { type: 'button', role: 'option', onpointermove: () => { if (at !== n) { at = n; mark() } }, onclick: () => pick(c) }, h('span.pal-ic', ic(c.icon, 16, 2)), h('span.grow.trunc', c.label), c.hint ? h('small.trunc', c.hint) : null)) : h('div.pal-none', 'Nothing matches'))
    }
    // Keep the chosen row in view by scrolling the list itself, never the page.
    const mark = () => {
      [...list.children].forEach((x, n) => x.classList.toggle('is-on', n === at))
      const row = list.children[at]
      if (!row) return
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 6
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 6
    }
    function pick(c) { close(true); setTimeout(() => c.run(), 0) }
    function close(picked = false) {
      layer.classList.remove('is-in')
      setTimeout(() => layer.remove(), 180)
      palette = null
      document.removeEventListener('keydown', onKey, true)
      if (!picked && opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true })
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark() }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
      else if (e.key === 'Tab') e.preventDefault()
    }
    document.addEventListener('keydown', onKey, true)
    input.addEventListener('input', () => { at = 0; draw() })
    draw()
    palette = { close }
  }
  const onCmdK = (e) => {
    if (!el.isConnected || !(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== 'k' && e.key !== 'K')) return
    if (!palette && document.querySelector('.layer')) return
    e.preventDefault()
    openPalette()
  }
  document.addEventListener('keydown', onCmdK)

  show(tab, false)
  paintStatus()
  return {
    el,
    tabs(path) {
      const next = TABS.find((x) => x.path === (path.replace(/\/+$/, '') || '/'))
      if (!next) return false
      if (next.id !== s.tab) { show(next.id); paintStatus() }
      return true
    },
    // The server's answer changed something about this person: each tab redraws its part.
    fresh() { for (const v of made.values()) if (v.fresh) v.fresh() },
    leave() {
      if (palette) palette.close()
      document.removeEventListener('keydown', onCmdK)
      for (const v of made.values()) if (v.leave) v.leave()
      for (const f of off) f()
    },
  }
}
