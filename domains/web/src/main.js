// Domains' page: one fixed shell. The search lives in the navbar once a search has run; a
// sidebar of places (Search, Saved, your lists) hides with one tap; phones get a tab bar.
//
//   /              search; /?q=photon runs one
//   /saved         names you starred
//   /lists         your lists; /lists/<id> one of them
//   /about         how it works
//   /s/<slug>      a shared list, for whoever has the link

import { $, act, dispatch, phone } from './dom.js'
import * as theme from './theme.js'
import * as catalog from './catalog.js'
import * as saved from './saved.js'
import * as lists from './lists.js'
import { state, loadMe, setRenderer, topHTML, sideHTML, tabsHTML, drawLayer, closeLayer, go, paintSide } from './shell.js'
import * as search from './views/search.js'
import './views/filters.js'
import { submitNewList, onChange } from './views/cards.js'
import { savedHTML, listHTML, listsHTML, submitRename, rerender } from './views/collections.js'
import { aboutHTML } from './views/about.js'
import { sharedHTML, mountShared } from './views/shared.js'
import './palette.js'

theme.apply()
const root = document.getElementById('root')
await Promise.all([catalog.load(), loadMe()])
Promise.all([saved.connect(state.me), lists.connect(state.me)]).then(() => { paintSide(); rerender() })

function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  if (path.startsWith('/s/')) return { view: 'shared', slug: path.slice(3) }
  if (path === '/saved') return { view: 'saved' }
  if (path === '/lists') return { view: 'lists' }
  const m = /^\/lists\/([a-z0-9-]+)$/.exec(path)
  if (m) return { view: 'list', listId: m[1] }
  if (path === '/about') return { view: 'about' }
  return { view: 'search', q: new URLSearchParams(location.search).get('q') || '' }
}

const TITLE = 'Domains · find a short domain that’s still available'

function render(o = {}) {
  const r = route()
  if (r.view === 'shared') { root.innerHTML = sharedHTML(); mountShared(r.slug); return }
  state.view = r.view
  state.listId = r.listId || null
  if (r.view === 'search' && r.q.trim() !== search.query()) search.start(r.q)
  const hero = r.view === 'search' && !search.hasResults()
  let main
  if (r.view === 'search') main = hero ? search.heroHTML({ animateIn: o.animateIn, hold: o.hold }) : search.resultsHTML()
  else if (r.view === 'saved') main = savedHTML()
  else if (r.view === 'list') main = listHTML(r.listId)
  else if (r.view === 'lists') main = listsHTML()
  else main = aboutHTML()
  const small = phone()
  root.innerHTML = `<div class="shell${state.sideOn ? '' : ' side-off'}${o.entering ? ' entering' : ''}${small ? ' has-tabs' : ''}">
    ${topHTML(hero ? '' : search.fieldHTML(true, o.hold && !hero))}
    <div class="body"><aside class="side" id="side" aria-label="Places">${sideHTML()}</aside><main class="main" id="main">${main}</main></div>
    ${small ? tabsHTML() : ''}
    <div class="layer" id="layer"></div>
    <div class="toast" id="toast" role="status"></div>
  </div>`
  if (r.view === 'search') search.mount()
  drawLayer(true)
  const l = r.view === 'list' && lists.get(r.listId)
  document.title = r.view === 'search' ? (search.query() ? `${search.query()} · Domains` : TITLE)
    : r.view === 'saved' ? 'Saved · Domains' : r.view === 'lists' ? 'Lists · Domains' : r.view === 'about' ? 'How it works · Domains' : `${l ? l.name : 'List'} · Domains`
}

setRenderer(render)

act({
  nav: (el, event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    closeLayer()
    const href = el.getAttribute('href')
    if (href === '/' && state.view === 'search' && search.hasResults()) return
    go(href === '/' && search.query() ? '/?q=' + encodeURIComponent(search.query()) : href)
  },
  home: (el, event) => {
    if (event.metaKey || event.ctrlKey) return
    event.preventDefault()
    if (state.view === 'search' && search.hasResults()) search.toHero()
    else go('/')
  },
})

// A star or list changed: pages that show them redraw (not while a note is being typed).
onChange(() => { if (['saved', 'list', 'lists'].includes(state.view)) rerender() })
// Changed somewhere else (another device, or Claude): the sidebar and those pages redraw.
const fromElsewhere = () => { paintSide(); if (['saved', 'list', 'lists'].includes(state.view)) rerender() }
saved.onRemote(fromElsewhere)
lists.onRemote(fromElsewhere)

document.addEventListener('click', dispatch)
document.addEventListener('submit', (e) => {
  const f = e.target
  e.preventDefault()
  if (f.id === 'form') { const v = f.elements.q.value.trim(); if (v) { f.elements.q.blur(); search.run(v) } }
  else if (f.dataset.form === 'newlist') submitNewList(f)
  else if (f.dataset.form === 'rename') submitRename(f)
})
let noteTimer = null
document.addEventListener('input', (e) => {
  const t = e.target
  if (t.dataset && t.dataset.note) { clearTimeout(noteTimer); const id = t.dataset.note, v = t.value; noteTimer = setTimeout(() => lists.setNote(id, v), 300) }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.layer) { closeLayer(); return }
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  const q = $('#q')
  if (q) { e.preventDefault(); q.focus(); q.select() }
})
addEventListener('popstate', () => {
  const r = route()
  if (r.view === 'search' && !r.q && state.view === 'search' && search.hasResults()) search.toHero({ push: false })
  else render()
})
let wasPhone = phone()
addEventListener('resize', () => { if (phone() !== wasPhone) { wasPhone = phone(); closeLayer(); render() } })
lists.on(() => {})

render({ animateIn: !new URLSearchParams(location.search).get('q') })
if (route().view === 'search' && !search.hasResults() && !phone()) { const q = $('#q'); if (q) q.focus({ preventScroll: true }) }

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {})
