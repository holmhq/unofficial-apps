// Domains' page: one shell, three tabs that stay alive (so a search keeps its place).
//
//   /            search; /?q=zacharia runs one
//   /saved       names you starred
//   /about       how it works

import { h, ic, haptic, reduced } from './ui.js'
import { state, loadMe, setRenderer, topBar, go } from './shell.js'
import * as theme from './theme.js'
import * as catalog from './catalog.js'
import * as saved from './saved.js'
import { filtersPanel } from './views/filters.js'
import { searchView } from './views/search.js'

const root = document.getElementById('root')
const TABS = [
  { id: 'search', path: '/', label: 'Search', icon: 'search' },
  { id: 'saved', path: '/saved', label: 'Saved', icon: 'star' },
  { id: 'about', path: '/about', label: 'About', icon: 'info' },
]

theme.apply()
await Promise.all([catalog.load(), loadMe()])
saved.connect(state.me)

const views = { search: searchView() }
const lazy = {
  saved: async () => (await import('./views/saved.js')).savedView(),
  about: async () => (await import('./views/about.js')).aboutView(),
}

const main = h('div.main', views.search.el)
let lastSearch = '/'
const pathOf = (tab) => (tab.id === 'search' ? lastSearch : tab.path)
const counts = new Map()
const navItem = (tab) => {
  const n = tab.id === 'saved' ? h('span.n.num') : null
  if (n) counts.set('side', n)
  return h('button.side-item', { type: 'button', 'data-tab': tab.id, onclick: () => { haptic(); go(pathOf(tab)) } }, ic(tab.icon, 19, 2), tab.label, n)
}
const side = h('aside.side', { 'aria-label': 'Navigation and filters' }, h('nav.side-nav', TABS.map(navItem)), filtersPanel())
const tabItem = (tab) => {
  const n = tab.id === 'saved' ? h('span.tab-count.num') : null
  if (n) counts.set('tab', n)
  return h('button.tab', { type: 'button', 'data-tab': tab.id, onclick: () => { haptic(); go(pathOf(tab)) } }, h('span.tab-icon', ic(tab.icon, 24, 1.9), n), tab.label)
}
const tabbar = h('nav.tabbar', { 'aria-label': 'Tabs' }, TABS.map(tabItem))
const app = h('div.app', topBar(), h('div.body', side, main), tabbar)
root.replaceChildren(app)

function paintCounts() {
  const n = saved.count()
  for (const el of counts.values()) { el.textContent = n ? String(n) : ''; el.hidden = !n }
}
saved.on(paintCounts)
paintCounts()

let current = null
async function render(dir = 'none') {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const tab = TABS.find((t) => t.path === path) || TABS[0]
  if (!views[tab.id]) views[tab.id] = await lazy[tab.id]()
  const view = views[tab.id]
  if (current !== tab.id) {
    const swap = () => {
      for (const t of TABS) if (views[t.id] && views[t.id].el.parentNode !== main) main.append(views[t.id].el)
      for (const t of TABS) if (views[t.id]) views[t.id].el.hidden = t.id !== tab.id
      for (const b of app.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab.id)
    }
    if (current && document.startViewTransition && !reduced() && dir !== 'none') {
      document.documentElement.dataset.vt = dir
      const t = document.startViewTransition(swap)
      t.finished.finally(() => { delete document.documentElement.dataset.vt })
    } else swap()
    current = tab.id
  }
  document.title = tab.id === 'search' ? (new URLSearchParams(location.search).get('q') ? `${new URLSearchParams(location.search).get('q')} · Domains` : 'Domains · find a short domain that’s actually free') : `${tab.label} · Domains`
  if (tab.id === 'search') { lastSearch = location.pathname + location.search; view.show(new URLSearchParams(location.search).get('q') || '') }
  else view.show()
}

setRenderer(render)
addEventListener('popstate', () => render('none'))
addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  e.preventDefault()
  if (current !== 'search') go('/')
  views.search.focus()
})
await render()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
