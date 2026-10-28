// The signed-in app: a tab bar on a phone, a sidebar on a wide screen, one panel that
// scrolls. The inbox keeps receiving on every tab; Live shows it.
import { h, ic, fill, collapsing, haptic, reduced } from '../ui.js'
import { topBar, go, holmFooter } from '../shell.js'
import { inbox, on } from '../inbox.js'
import * as audio from '../audio.js'
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
  const s = { tab, view: null }
  const main = h('div.panel.main')
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
  const bar = topBar()
  const el = h('div.app', bar, h('div.body', side, main), tabbar)
  const recollapse = collapsing(bar, main)

  function switchTo(id) {
    if (id === s.tab) { main.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return }
    haptic(5)
    audio.play('pro_hover_tick/soft')
    go(TABS.find((x) => x.id === id).path)
  }

  function show(id, animate = true) {
    if (s.view && s.view.leave) s.view.leave()
    s.tab = id
    el.dataset.tab = id
    for (const [k, b] of sideButtons) b.classList.toggle('on', k === id)
    for (const [k, b] of tabButtons) { b.classList.toggle('on', k === id); b.setAttribute('aria-current', k === id ? 'page' : 'false') }
    const t = TABS.find((x) => x.id === id)
    document.title = id === 'live' ? 'Ralk' : `${t.label} · Ralk`
    let tt = bar.querySelector('.top-title')
    if (!tt) { tt = h('div.top-title.small-title'); bar.insertBefore(tt, bar.querySelector('.top-r')) }
    tt.textContent = t.label
    s.view = t.make({ panel: main })
    fill(main, s.view.el, holmFooter())
    main.scrollTop = 0
    recollapse()
    if (animate && !reduced()) s.view.el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
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
    leave() { if (s.view && s.view.leave) s.view.leave(); for (const f of off) f() },
  }
}
