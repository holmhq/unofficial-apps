// The signed-in app: a frosted top bar, a sidebar of places on a desk and a tab bar on a phone,
// the list, and the article beside it (a desk) or sliding over it (a phone). Each list page is
// kept alive with its scroll while you're elsewhere.
//
//   /              the reading list          /tags/<tag>   one tag
//   /feed          what feeds brought        /search?q=    search
//   /favourites    favourites
//   /highlights    every highlight           /read/<id>    an article (?at=<highlight>)
//   /archive       finished

import { h, ic, fill, toast, menu, haptic, reduced, wide, flip, copyText, closeMenus, sheet } from '../ui.js'
import { mark, starFill } from '../icons.js'
import * as api from '../api.js'
import {
  lib, on, unread, favourites, archived, tagged, tags, all, minutes, tone, update, remove, highlights, keptHighlights, isWorking, makeReadable,
  reviewSet, keptReview, findCover, books, inFeed, keptFeeds, loadFeeds, checkFeeds, isChecking, markSeen, keptViews, loadViews, saveViews, bulk
} from '../store.js'
import { parse as parseQuery, apply as applyQuery, HELP as QUERY_HELP } from '../query.js'
import { go, link, accountButton, credit, failure, saveSheet, saveURL, looksLikeURL, connectSheet, mcpSheet, importSheet, keysSheet, state, followSheet, feedsSheet, uploadSheet } from '../shell.js'
import { createReader } from '../reader.js'
import { favicon, when, plural } from '../bits.js'

const PLACES = [
  { path: '/', label: 'Reading list', icon: 'bookOpen', count: () => unread().length },
  { path: '/feed', label: 'Feed', icon: 'rss', count: () => inFeed().filter((i) => !i.seen).length },
  { path: '/favourites', label: 'Favourites', icon: 'star', count: () => favourites().length },
  { path: '/highlights', label: 'Highlights', icon: 'highlighter', count: () => all().reduce((n, i) => n + (i.marks || 0), 0) },
  { path: '/archive', label: 'Archive', icon: 'archive', count: () => archived().length }
]
// On a phone Favourites is a chip on the Reading list and the Archive, so the Feed gets its tab.
const TABS = [
  { path: '/', label: 'Reading list', icon: 'bookOpen' },
  { path: '/feed', label: 'Feed', icon: 'rss' },
  { path: '/highlights', label: 'Highlights', icon: 'highlighter' },
  { path: '/archive', label: 'Archive', icon: 'archive' },
  { path: '/search', label: 'Search', icon: 'search' }
]
const CHUNK = 60
const isPhone = () => innerWidth < 760

export function createApp() {
  const pages = new Map()
  let active = null
  let listKey = '/'
  let reading = null

  /* ---- Bars ----------------------------------------------------------------------------- */

  const brand = h('a.brand', { href: '/', 'aria-label': 'Shelf, your reading list', onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/') } },
    h('span.brand-mark', mark(17)), h('span.brand-name', 'Shelf'))
  const sideBtn = h('button.icon-btn.side-btn', { type: 'button', 'aria-label': 'Hide sidebar', title: 'Hide sidebar', onclick: () => toggleSide() }, ic('panelLeft', 20, 1.9))
  const smallTitle = h('div.top-title')
  const searchInput = h('input.search-input', { type: 'search', placeholder: 'Search your shelf', 'aria-label': 'Search your shelf', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' })
  const searchBox = h('label.top-search', ic('search', 17, 2.1), searchInput, h('kbd', '/'))
  const saveBtn = h('button.btn.primary.save-btn', { type: 'button', onclick: () => saveSheet() }, ic('plus', 17, 2.4), h('span', 'Save a link'))
  const addBtn = h('button.icon-btn.add-btn', { type: 'button', 'aria-label': 'Save a link', onclick: () => saveSheet() }, ic('plus', 24, 2.2))
  const top = h('header.top.glass', h('div.top-l', sideBtn, brand), smallTitle, searchBox, h('div.top-r', saveBtn, addBtn, accountButton()))

  const sideLinks = PLACES.map((x) => link(x.path, { class: 'side-item', 'data-path': x.path }, ic(x.icon, 18, 1.9), h('span.grow', x.label), h('span.side-count')))
  const sideTags = h('div.side-list')
  const sideViews = h('div.side-list')
  const side = h('nav.side', { 'aria-label': 'Places' }, h('div.side-list', sideLinks), sideViews, sideTags, h('div.side-foot', credit()))
  const tabbar = h('nav.tabbar', { 'aria-label': 'Sections' }, TABS.map((x) => link(x.path, { class: 'tab', 'data-path': x.path }, ic(x.icon, 24, 1.8), h('span', x.label))))

  const reader = createReader({ onClose: () => closeReader(), onNext: (id, peek) => neighbour(id, peek) })
  const empty = h('div.r-empty', h('div', mark(34), h('b', 'Pick something to read'), h('p', 'Articles open here. ', h('kbd', 'J'), ' ', h('kbd', 'K'), ' move through the list, ', h('kbd', '↵'), ' opens one.')))
  const readerCol = h('div.reader-col.reader-layer', empty)
  const listCol = h('div.list-col')
  const main = h('main.main', listCol, readerCol)
  const root = h('div.app', top, h('div.body', side, main), tabbar)
  const drop = h('div.drop', h('div', ic('bookmarkPlus', 30, 1.8), 'Drop a link, a book or a PDF'))
  root.append(drop)

  // The sidebar hides with one click and stays as it was left. Between 900 and 1180 px it
  // starts hidden, so the article has room.
  function toggleSide() {
    const narrow = innerWidth < 1180
    const hidden = narrow ? root.classList.contains('is-side-shown') : !root.classList.contains('is-side-hidden')
    root.classList.toggle(narrow ? 'is-side-shown' : 'is-side-hidden', narrow ? !hidden : hidden)
    sideBtn.setAttribute('aria-label', hidden ? 'Show sidebar' : 'Hide sidebar')
    sideBtn.title = hidden ? 'Show sidebar' : 'Hide sidebar'
    if (!narrow) try { localStorage.setItem('shelf:side', hidden ? 'hidden' : 'shown') } catch {}
  }
  try { if (localStorage.getItem('shelf:side') === 'hidden') root.classList.add('is-side-hidden') } catch {}

  /* ---- Rows ------------------------------------------------------------------------------- */

  function sig(i) {
    return [i.title, i.excerpt, i.status, i.state, i.fav, i.progress, i.image, (i.tags || []).join(), i.note, i.words, i.site, i.marks, isWorking(i.id)].join('|')
  }

  const KIND = { book: ['Book', 'book'], pdf: ['PDF', 'fileText'], doc: ['Document', 'notebookText'] }
  function rowMeta(i, { archive = false } = {}) {
    const own = !i.url && KIND[i.kind]
    const bits = own
      ? [h('span.kind-tile', ic(KIND[i.kind][1], 11, 2.3)), h('span.host', i.author || KIND[i.kind][0])]
      : [favicon(i, 16), h('span.host', i.site || i.host)]
    const add = (...x) => { bits.push(h('i.dot')); bits.push(...x) }
    if (i.status === 'pending') {
      if (isWorking(i.id)) add(h('span.shimmer'))
      else if (i.state !== 'feed') add(h('span', i.via === 'import' ? 'Not fetched yet' : 'Waiting to fetch'))
    } else if (i.status === 'failed') add(h('span', 'Couldn’t fetch'))
    else if (i.kind === 'pdf' && i.pages && !i.words) add(h('span', plural(i.pages, 'page')))
    else if (i.status === 'link') add(h('span', 'Link'))
    else if (i.words) {
      const m = minutes(i)
      if (!archive && i.progress > 0.02 && i.progress < 0.97) add(h('span.left', `${Math.max(1, Math.round(m * (1 - i.progress)))} min left`))
      else add(h('span', `${m} min`))
    }
    if (archive && i.read) add(h('span', 'Read ' + when(i.read)))
    if (i.state === 'feed') add(h('span', when(i.saved)))
    if (i.video) add(h('span', { title: 'A video' }, ic('circlePlay', 12, 2.2)))
    if (i.marks) add(h('span', { title: plural(i.marks, 'highlight') }, ic('highlighter', 12, 2.2)))
    if (i.fav) bits.push(h('span.star', starFill(12)))
    for (const t of (i.tags || []).slice(0, 3)) bits.push(h('i.tagdot', { style: { background: tone(t) }, title: '#' + t }))
    return h('div.meta', bits)
  }

  function rowEl(i, opts = {}) {
    const showProgress = !opts.archive && i.progress > 0.02 && i.progress < 0.97
    const feed = i.state === 'feed'
    const btn = h('button.row-item' + (i.status === 'pending' && !feed ? '.is-pending' : '') + (feed && i.seen ? '.is-seen' : '') + (reading === i.id ? '.is-open' : ''), { type: 'button', 'data-id': i.id },
      h('div', { style: { 'min-width': '0' } },
        h('div.row-t', i.title || i.host || i.url),
        i.excerpt ? h('div.row-x', i.excerpt) : null,
        i.note && !i.excerpt ? h('div.row-note', ic('notebookPen', 13, 2), h('span', i.note)) : null,
        rowMeta(i, opts)),
      i.image ? h('div.pic', h('img', { src: i.image + '/t', alt: '', loading: 'lazy', decoding: 'async', onload: (e) => e.target.classList.add('is-in'), onerror: (e) => e.target.parentNode.remove() })) : null,
      showProgress ? h('div.row-prog', h('i', { style: { transform: `scaleX(${i.progress})` } })) : null)
    const wrap = h('div.row-wrap', { 'data-key': i.id, 'data-sig': sig(i) },
      feed
        ? h('div.row-acts', h('span.is-save', ic('bookmarkPlus', 18, 2), 'Save'), h('span.is-arch', ic(i.seen ? 'eye' : 'eyeOff', 18, 2), i.seen ? 'Unseen' : 'Seen'))
        : h('div.row-acts', h('span.is-fav', starFill(18), i.fav ? 'Unfavourite' : 'Favourite'), h('span.is-arch', ic(i.state === 'archived' ? 'rotateCcw' : 'archive', 18, 2), i.state === 'archived' ? 'Unarchive' : 'Archive')),
      btn)
    btn.addEventListener('click', () => openItem(i.id))
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); rowMenu(i.id, { x: e.clientX, y: e.clientY }) })
    swipe(wrap, btn, i.id)
    return wrap
  }

  function rowMenu(id, at) {
    const i = lib.items.get(id)
    if (!i) return
    if (i.state === 'feed') {
      const f = (keptFeeds() || []).find((x) => x.id === i.feed)
      menu(at, [
        { label: 'Read', icon: 'bookOpen', onclick: () => openItem(id) },
        { label: 'Save to your reading list', icon: 'bookmarkPlus', onclick: () => saveFromFeed(id) },
        { label: i.seen ? 'Mark as unseen' : 'Mark as seen', icon: i.seen ? 'eye' : 'eyeOff', onclick: () => toggleSeen(id) },
        { label: 'Open the original', icon: 'externalLink', onclick: () => window.open(i.url, '_blank', 'noopener') },
        f ? 'sep' : null,
        f ? { label: 'Unfollow ' + (f.title.length > 28 ? f.title.slice(0, 26) + '…' : f.title), icon: 'rss', danger: true, onclick: () => import('../shell.js').then((m) => m.unfollowFeed(f)) } : null
      ], { align: 'start' })
      return
    }
    menu(at, [
      { label: 'Read', icon: 'bookOpen', onclick: () => openItem(id) },
      { label: 'Open the original', icon: 'externalLink', onclick: () => window.open(i.url, '_blank', 'noopener') },
      'sep',
      { label: i.fav ? 'Remove from Favourites' : 'Favourite', icon: 'star', onclick: () => setFav(id, !i.fav) },
      { label: i.state === 'archived' ? 'Back to the reading list' : 'Archive', icon: i.state === 'archived' ? 'rotateCcw' : 'archive', onclick: () => setArchived(id, i.state !== 'archived') },
      { label: 'Tags and note…', icon: 'tag', onclick: () => { openItem(id); setTimeout(() => reader.tags(), 300) } },
      { label: 'Copy link', icon: 'link', onclick: () => copyText(i.url, 'Link copied') },
      'sep',
      { label: 'Delete', icon: 'trash', danger: true, onclick: () => remove(id).then(() => toast('Deleted', { kind: 'info' })).catch(failure) }
    ], { align: 'start' })
  }

  // Swipe a row on a phone: left to archive, right to favourite, as in Mail.
  function swipe(wrap, btn, id) {
    let x0 = 0, y0 = 0, dx = 0, mode = null, pid = null
    const acts = wrap.querySelector('.row-acts')
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return
      x0 = e.clientX; y0 = e.clientY; dx = 0; mode = null; pid = e.pointerId
    })
    btn.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return
      const mx = e.clientX - x0
      const my = e.clientY - y0
      if (!mode) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { mode = 'x'; btn.setPointerCapture(e.pointerId); btn.style.transition = 'none' }
        else if (Math.abs(my) > 10) { mode = 'y'; pid = null; return }
        else return
      }
      dx = mx
      btn.style.transform = `translate3d(${dx}px,0,0)`
      acts.firstChild.style.opacity = dx > 0 ? Math.min(1, dx / 70) : 0
      acts.lastChild.style.opacity = dx < 0 ? Math.min(1, -dx / 70) : 0
      acts.firstChild.style.flex = dx > 0 ? '1' : ''
      acts.lastChild.style.flex = dx < 0 ? '1' : ''
    })
    const end = (e) => {
      if (pid !== e.pointerId) return
      pid = null
      if (mode !== 'x') return
      btn.style.transition = ''
      const i = lib.items.get(id)
      if (dx < -90 && i) {
        btn.style.transform = 'translate3d(-110%,0,0)'
        haptic(14)
        if (i.state === 'feed') setTimeout(() => { btn.style.transform = ''; toggleSeen(id) }, 180)
        else setTimeout(() => setArchived(id, i.state !== 'archived'), 180)
      } else if (dx > 90 && i && i.state === 'feed') {
        btn.style.transform = 'translate3d(110%,0,0)'
        haptic(14)
        setTimeout(() => saveFromFeed(id), 180)
      } else {
        btn.style.transform = ''
        if (dx > 90 && i) { haptic(14); setFav(id, !i.fav) }
      }
      setTimeout(() => { acts.firstChild.style.opacity = 0; acts.lastChild.style.opacity = 0 }, 300)
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
      btn.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => btn.removeEventListener('click', swallow, { capture: true }), 400)
    }
    btn.addEventListener('pointerup', end)
    btn.addEventListener('pointercancel', end)
  }

  async function saveFromFeed(id) {
    try {
      await update(id, { state: 'unread' })
      toast('Saved to your reading list', { action: { label: 'Read', onclick: () => openItem(id) } })
    } catch (e) { failure(e) }
  }
  async function toggleSeen(id) {
    const i = lib.items.get(id)
    if (!i) return
    try {
      if (i.seen) await update(id, { seen: false })
      else await markSeen([id])
    } catch (e) { failure(e) }
  }

  async function setFav(id, on) {
    try { await update(id, { fav: on }); toast(on ? 'Added to Favourites' : 'Removed from Favourites') } catch (e) { failure(e) }
  }
  async function setArchived(id, on) {
    const before = lib.items.get(id)
    try {
      await update(id, { state: on ? 'archived' : 'unread' })
      toast(on ? 'Archived' : 'Back on your reading list', { action: { label: 'Undo', onclick: () => update(id, { state: before.state }).catch(failure) } })
    } catch (e) { failure(e) }
  }

  /* ---- List pages --------------------------------------------------------------------------- */

  // How a list can be ordered; each page remembers its own.
  const SORTS = [
    { key: 'new', label: 'Newest first', fn: (a, b) => (b.saved || 0) - (a.saved || 0) },
    { key: 'old', label: 'Oldest first', fn: (a, b) => (a.saved || 0) - (b.saved || 0) },
    { key: 'short', label: 'Shortest first', fn: (a, b) => (a.words || 1e9) - (b.words || 1e9) },
    { key: 'long', label: 'Longest first', fn: (a, b) => (b.words || 0) - (a.words || 0) },
    { key: 'opened', label: 'Recently opened', fn: (a, b) => (b.opened || 0) - (a.opened || 0) || (b.saved || 0) - (a.saved || 0) }
  ]
  const sortOf = (key) => { try { return localStorage.getItem('shelf:sort:' + key) || '' } catch { return '' } }

  function listPage({ key, title, source, chips = null, empty: emptyFor, archive = false, sub = null, start = 'all', actions = null, footer = null, sortable = true, extra = null }) {
    const panel = h('div.panel')
    const moreBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Sort and select', title: 'Sort and select', 'aria-haspopup': 'menu', onclick: () => pageMenu() }, ic('ellipsis', 20, 2.1))
    const head = h('div.page-head', h('h1.large-title', typeof title === 'function' ? title() : title), h('div.head-acts', actions, moreBtn))
    const chipRow = h('div.chips')
    const rows = h('div.rows')
    const more = h('div.list-end')
    const tail = h('div.list-tail')
    const foot = h('div.phone-only', { style: { padding: '18px 16px calc(20px + var(--sab))' } }, credit())
    panel.append(head, chipRow, rows, tail, more, foot)
    const el = h('section.page', panel)
    let filter = start
    let shown = 0
    let list = []
    let sort = sortOf(key)
    let picked = null // ids, while selecting

    const filtered = () => {
      const base = source()
      const f = chips ? chips().find((c) => c.key === filter) : null
      const out = f ? base.filter(f.test) : base
      const s = SORTS.find((x) => x.key === sort)
      return s ? out.slice().sort(s.fn) : out
    }

    function pageMenu() {
      menu(moreBtn, [
        ...(sortable ? SORTS.map((x) => ({ label: ((sort || 'new') === x.key ? '✓ ' : '') + x.label, onclick: () => { sort = x.key === 'new' ? '' : x.key; try { localStorage.setItem('shelf:sort:' + key, sort) } catch {} draw(true) } })) : []),
        sortable ? 'sep' : null,
        { label: 'Select…', icon: 'listChecks', onclick: () => startPicking() },
        ...(extra ? ['sep', ...extra()] : [])
      ], { align: 'end' })
    }

    // Selecting: tap rows to pick them, then act on them all from the bar at the bottom.
    const bar = h('div.pick-bar')
    function startPicking() {
      picked = new Set()
      el.classList.add('is-picking')
      drawBar()
      root.append(bar)
      // On a desk it sits under the list it acts on.
      if (wide()) { const r = listCol.getBoundingClientRect(); bar.style.left = r.left + r.width / 2 + 'px' } else bar.style.left = ''
      requestAnimationFrame(() => bar.classList.add('is-in'))
      draw(true)
    }
    function stopPicking() {
      picked = null
      el.classList.remove('is-picking')
      bar.classList.remove('is-in')
      setTimeout(() => bar.remove(), 300)
      draw(true)
    }
    function drawBar() {
      const n = picked ? picked.size : 0
      const ids = picked ? [...picked] : []
      const any = (fn) => ids.some((id) => { const i = lib.items.get(id); return i && fn(i) })
      const run = async (changes, done) => {
        try { await bulk(ids, changes); toast(done(ids.length)); stopPicking() } catch (e) { failure(e) }
      }
      const feedOnly = ids.length && ids.every((id) => (lib.items.get(id) || {}).state === 'feed')
      fill(bar,
        h('button.btn.plain', { type: 'button', onclick: () => { if (picked.size === list.length) picked.clear(); else for (const i of list) picked.add(i.id); drawBar(); for (const r of rows.querySelectorAll('.row-item')) r.classList.toggle('is-picked', picked.has(r.dataset.id)) } }, picked && picked.size === list.length && list.length ? 'None' : 'All'),
        h('b.pick-n', n ? plural(n, 'item') : 'Pick some'),
        h('div.pick-acts',
          feedOnly ? h('button.icon-btn', { type: 'button', disabled: !n, 'aria-label': 'Save to the reading list', title: 'Save to the reading list', onclick: () => run({ state: 'unread' }, (c) => plural(c, 'post') + ' saved') }, ic('bookmarkPlus', 20, 2)) : null,
          !feedOnly ? h('button.icon-btn', { type: 'button', disabled: !n, 'aria-label': any((i) => i.state !== 'archived') ? 'Archive' : 'Back to the reading list', title: any((i) => i.state !== 'archived') ? 'Archive' : 'Back to the reading list', onclick: () => { const to = any((i) => i.state !== 'archived') ? 'archived' : 'unread'; run({ state: to }, (c) => to === 'archived' ? plural(c, 'item') + ' archived' : plural(c, 'item') + ' back on your list') } }, ic(any((i) => i.state !== 'archived') ? 'archive' : 'rotateCcw', 20, 2)) : null,
          h('button.icon-btn', { type: 'button', disabled: !n, 'aria-label': 'Favourite', title: 'Favourite', onclick: () => { const on = any((i) => !i.fav); run({ fav: on }, (c) => on ? plural(c, 'favourite') + ' added' : 'Removed from Favourites') } }, ic('star', 20, 2)),
          h('button.icon-btn', { type: 'button', disabled: !n, 'aria-label': 'Tag', title: 'Tag', onclick: async () => {
            const { tagSheet } = await import('./review.js')
            const t = await tagSheet([])
            if (t && t.length) run({ addTags: t }, (c) => 'Tagged ' + plural(c, 'item'))
          } }, ic('tag', 20, 2)),
          h('button.icon-btn.is-danger', { type: 'button', disabled: !n, 'aria-label': 'Delete', title: 'Delete', onclick: async () => {
            const { confirm } = await import('../ui.js')
            if (await confirm({ title: 'Delete ' + plural(n, 'item') + '?', text: 'Their highlights and notes go too. This can’t be undone.', action: 'Delete' })) run({ delete: true }, (c) => plural(c, 'item') + ' deleted')
          } }, ic('trash', 20, 2))),
        h('button.btn.plain.strong', { type: 'button', onclick: () => stopPicking() }, 'Done'))
    }
    rows.addEventListener('click', (e) => {
      if (!picked) return
      const row = e.target.closest('.row-item')
      if (!row) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const id = row.dataset.id
      if (picked.has(id)) picked.delete(id)
      else picked.add(id)
      row.classList.toggle('is-picked', picked.has(id))
      haptic(6)
      drawBar()
    }, true)

    function drawChips() {
      if (!chips) { chipRow.hidden = true; return }
      const base = source()
      const defs = chips().map((c) => ({ ...c, n: c.key === 'all' ? base.length : base.filter(c.test).length })).filter((c) => c.key === 'all' || c.key === filter || c.key === start || c.n)
      if (defs.length < 2) { chipRow.hidden = true; if (filter !== start) filter = start; return }
      chipRow.hidden = false
      fill(chipRow, defs.map((c) => h('button.chip' + (c.key === filter ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(c.key === filter), onclick: () => { filter = filter === c.key && c.key !== start ? start : c.key; drawChips(); draw(true); panel.scrollTop = 0 } },
        c.icon ? h('img.chip-ic', { src: c.icon, alt: '', onerror: (e) => e.target.remove() }) : null,
        c.dot ? h('i.tagdot', { style: { background: c.dot, width: '7px', height: '7px', 'border-radius': '50%' } }) : null, c.label, h('span.n', c.n.toLocaleString()))))
    }

    function draw(full = false) {
      head.firstChild.textContent = typeof title === 'function' ? title() : title
      list = filtered()
      if (footer) fill(tail, footer(list, filter))
      if (!lib.ready) { fill(rows, skeleton()); return }
      if (!list.length) { fill(rows, emptyFor ? emptyFor(filter) : null); shown = 0; return }
      if (rows.querySelector('.empty, .welcome, .skeleton')) full = true
      const want = Math.max(CHUNK, full ? CHUNK : shown)
      const next = list.slice(0, want)
      shown = next.length
      const have = new Map([...rows.children].filter((c) => c.dataset.key).map((c) => [c.dataset.key, c]))
      const els = next.map((i) => {
        const old = have.get(i.id)
        if (old && old.dataset.sig === sig(i)) { old.firstChild.nextSibling.classList.toggle('is-open', reading === i.id); old.firstChild.nextSibling.classList.toggle('is-picked', !!(picked && picked.has(i.id))); return old }
        const made = rowEl(i, { archive })
        if (picked && picked.has(i.id)) made.querySelector('.row-item').classList.add('is-picked')
        return made
      })
      const mutate = () => { rows.replaceChildren(...els) }
      if (full || !have.size || reduced()) mutate()
      else flip(rows, mutate)
    }

    // More rows as the list nears its end.
    panel.addEventListener('scroll', () => {
      if (shown < list.length && panel.scrollTop + panel.clientHeight > panel.scrollHeight - 900) {
        const add = list.slice(shown, shown + CHUNK)
        shown += add.length
        rows.append(...add.map((i) => rowEl(i, { archive })))
      }
      updateTitle(panel)
    }, { passive: true })

    return {
      key, el, panel,
      title: () => (typeof title === 'function' ? title() : title),
      show() { if (key === '/feed' && !reading) stillShown.clear(); drawChips(); draw(); updateTitle(panel); if (key === '/feed') checkFeeds() },
      change(c) { drawChips(); draw(!!c.full) },
      filter: () => filter,
      ids: () => list.map((i) => i.id),
      setOpen(id) { for (const r of rows.querySelectorAll('.row-item')) r.classList.toggle('is-open', r.dataset.id === id) },
      leave() { if (picked) stopPicking() },
      rows
    }
  }

  function skeleton() { return h('div.skeleton', [0, 1, 2, 3, 4].map(() => h('div.sk', h('div', h('i'), h('i'), h('i')), h('em')))) }

  function updateTitle(panel) {
    const t = panel.querySelector('.large-title')
    top.classList.toggle('scrolled', !!t && panel.scrollTop > t.offsetTop + t.offsetHeight - 8)
  }

  const favChip = () => (isPhone() ? [{ key: 'fav', label: 'Favourites', test: (i) => i.fav }] : [])
  const timeChips = () => [
    { key: 'all', label: 'All', test: () => true },
    ...favChip(),
    { key: 'quick', label: 'Quick reads', test: (i) => i.words && minutes(i) <= 10 },
    { key: 'long', label: 'Long reads', test: (i) => minutes(i) >= 20 },
    { key: 'started', label: 'Started', test: (i) => i.progress > 0.02 && i.progress < 0.97 },
    { key: 'claude', label: 'From Claude', test: (i) => i.via === 'claude' },
    { key: 'books', label: 'Books', test: (i) => i.kind === 'book' },
    { key: 'pdfs', label: 'PDFs', test: (i) => i.kind === 'pdf' },
    ...tags().slice(0, 12).map(({ tag }) => ({ key: '#' + tag, label: tag, dot: tone(tag), test: (i) => (i.tags || []).includes(tag) }))
  ]

  // The books drop onto the shelf the first time only.
  function art() {
    let first = false
    try { first = !localStorage.getItem('shelf:welcomed'); localStorage.setItem('shelf:welcomed', '1') } catch {}
    return h('div.shelf-art' + (first ? '.is-first' : ''), h('i.book'), h('i.book'), h('i.book'), h('i.board'))
  }

  function welcome() {
    const way = (icon, title, text, onclick) => h('button.way', { type: 'button', onclick }, h('span.way-ic', ic(icon, 18, 2)), h('div', h('b', title), h('small', text)))
    return h('div.welcome',
      art(),
      h('h2', 'Your shelf is empty'),
      h('p', 'Save articles to read when you have the time. Shelf keeps a clean copy of each one on your own server, with its pictures.'),
      h('div.welcome-ways',
        way('bookmarkPlus', 'Save a link', isPhone() ? 'Paste an address you copied' : 'Or paste one anywhere with ⌘V', () => saveSheet()),
        way('share', 'Save from anywhere', 'A bookmark button, your phone’s share sheet, or Claude', () => connectSheet()),
        way('fileUp', 'Bring in your Pocket links', 'Or an Instapaper, Omnivore or bookmarks export', () => importSheet())))
  }

  function caughtUp() {
    return h('div.empty', art(), h('b', 'All caught up'), h('p', 'Everything on your reading list is read. Save something new, or find an old favourite in the Archive.'),
      h('button.btn', { type: 'button', onclick: () => saveSheet() }, ic('plus', 17, 2.2), 'Save a link'))
  }

  const emptyState = (icon, title, text) => h('div.empty', h('div.empty-ic', ic(icon, 28, 1.7)), h('b', title), h('p', text))

  /* ---- The Feed ------------------------------------------------------------------------------------
     What the feeds you follow brought, newest first: Unseen until you've opened it or marked it,
     a swipe to save it to the reading list. The feeds are checked whenever Shelf is open. */

  // Posts opened from the Unseen list stay in it until you come back to the page, so the list
  // doesn't shift under you.
  const stillShown = new Set()

  function feedPage() {
    const refreshBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Check the feeds now', title: 'Check the feeds now', onclick: () => refresh() }, ic('refreshCw', 19, 2))
    const followBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Follow a site', title: 'Follow a site', onclick: () => followSheet() }, ic('plus', 21, 2.1))
    const manageBtn = h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Your feeds', title: 'Your feeds', 'aria-haspopup': 'dialog', onclick: () => feedsSheet() }, ic('listTree', 19, 2))
    const actions = h('div.head-acts', refreshBtn, followBtn, manageBtn)
    async function refresh() {
      refreshBtn.classList.add('is-busy')
      try { const n = await checkFeeds({ force: true }); toast(n ? `${n} new from your feeds` : 'Nothing new in your feeds', { kind: n ? 'good' : 'info' }) } catch (e) { failure(e) }
    }
    const feedChips = () => {
      const feeds = keptFeeds() || []
      const counts = new Map()
      for (const i of inFeed()) counts.set(i.feed, (counts.get(i.feed) || 0) + 1)
      return [
        { key: 'unseen', label: 'Unseen', test: (i) => !i.seen || stillShown.has(i.id) },
        { key: 'all', label: 'All', test: () => true },
        ...feeds.filter((f) => counts.get(f.id)).sort((a, b) => counts.get(b.id) - counts.get(a.id)).slice(0, 30).map((f) => ({ key: 'f:' + f.id, label: f.title, test: (i) => i.feed === f.id }))
      ]
    }
    const p = listPage({
      key: '/feed', title: 'Feed', source: inFeed, chips: feedChips, start: 'unseen', actions, sortable: false,
      empty: (f) => {
        const feeds = keptFeeds() || []
        if (!feeds.length) return feedWelcome()
        if (f === 'unseen') return h('div.empty', h('div.empty-ic', ic('checkCheck', 28, 1.8)), h('b', 'All seen'), h('p', 'New posts from the ' + plural(feeds.length, 'feed') + ' you follow show up here.'))
        return emptyState('rss', 'Nothing here yet', 'New posts show up here as your feeds are checked.')
      },
      // At the end of what's unseen: mark the lot as seen.
      footer: (list, f) => {
        const ids = list.filter((i) => !i.seen).map((i) => i.id)
        if (ids.length < 2 || f === 'all') return null
        return h('div.feed-end', h('button.btn', { type: 'button', onclick: async () => {
          try { await markSeen(ids); toast(plural(ids.length, 'post') + ' marked as seen', { kind: 'info' }) } catch (e) { failure(e) }
        } }, ic('checkCheck', 17, 2.2), 'Mark ' + (ids.length === list.length ? 'all ' : '') + ids.length.toLocaleString() + ' as seen'))
      }
    })
    on((c) => {
      if (c.feedsChecking !== undefined) refreshBtn.classList.toggle('is-busy', isChecking())
      if (c.feeds && active === p) p.change({ full: false })
    })
    if (!keptFeeds()) loadFeeds().catch(() => {})
    return p
  }

  // A saved view: a name and a query.
  async function editView(view) {
    let name, query
    const result = await sheet({
      title: view.id ? 'Change the view' : 'Save as a view',
      done: 'Save',
      onDone: (close) => {
        if (!name.value.trim()) { name.focus(); return }
        if (!parseQuery(query.value).filters.length && !query.value.trim()) { query.focus(); return }
        close({ name: name.value.trim(), q: query.value.trim() })
      },
      body: () => {
        name = h('input.field', { type: 'text', placeholder: 'Quick reads about design', maxlength: '40', autofocus: true, 'aria-label': 'Name' })
        name.value = view.name || ''
        query = h('input.field.is-mono', { type: 'text', maxlength: '300', 'aria-label': 'Query', autocapitalize: 'off', spellcheck: 'false' })
        query.value = view.q || ''
        return [h('div.sheet-label', 'Name'), name, h('div.sheet-label', 'Shows'), query, h('p.sheet-note', 'Filters like tag:design, in:list, minutes:<10, kind:book, has:highlights, saved:<7d and from:claude, with a minus to turn one around. Views sit in the sidebar.')]
      }
    })
    if (!result || result === true) return
    const views = keptViews().slice()
    if (view.id) { const i = views.findIndex((x) => x.id === view.id); if (i >= 0) views[i] = { ...views[i], ...result } }
    else views.push({ id: Math.random().toString(36).slice(2, 10), ...result })
    try {
      const saved = await saveViews(views)
      const made = view.id ? saved.find((x) => x.id === view.id) : saved[saved.length - 1]
      toast(view.id ? 'View changed' : 'View saved')
      if (made) go('/view/' + made.id)
    } catch (e) { failure(e) }
  }

  // ⌘K: a place, an article or something to do, by typing a few letters of it.
  let palette = null
  function openPalette() {
    if (palette) { palette.close(); return }
    const back = document.activeElement
    const input = h('input.pal-field', { type: 'text', placeholder: 'Go to, find or do…', 'aria-label': 'Go to, find or do', autocomplete: 'off', spellcheck: 'false' })
    const list = h('div.pal-list', { role: 'listbox' })
    const box = h('div.pal', { role: 'dialog', 'aria-label': 'Command menu' }, h('div.pal-top', ic('search', 18, 2.1), input, h('kbd', 'esc')), list)
    const layer = h('div.pal-layer', { onclick: (e) => { if (e.target === layer) close() } }, box)
    document.body.append(layer)
    requestAnimationFrame(() => layer.classList.add('is-in'))
    input.focus()
    let at = 0
    let shown = []
    const commands = () => [
      ...PLACES.map((x) => ({ label: x.label, icon: x.icon, hint: 'Go', run: () => go(x.path) })),
      { label: 'Search', icon: 'search', hint: 'Go', run: () => go('/search') },
      ...keptViews().map((x) => ({ label: x.name, icon: 'layers', hint: 'View', run: () => go('/view/' + x.id) })),
      { label: 'Today’s review', icon: 'repeat', hint: 'R', run: () => import('./review.js').then((m) => m.openReview()) },
      { label: 'Save a link', icon: 'bookmarkPlus', hint: 'A', run: () => saveSheet() },
      { label: 'Upload a book, PDF or Markdown file', icon: 'upload', run: () => import('../shell.js').then((m) => m.pickFile()) },
      { label: 'Follow a site', icon: 'rss', run: () => followSheet() },
      { label: 'Add a paper book', icon: 'bookPlus', run: () => import('../shell.js').then((m) => m.bookSheet()) },
      { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet() },
      { label: 'Import links, highlights, feeds', icon: 'fileUp', run: () => importSheet() },
      { label: 'Export your shelf', icon: 'download', run: () => import('../shell.js').then((m) => m.exportSheet()) },
      { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => keysSheet() },
      ...tags().slice(0, 30).map(({ tag }) => ({ label: '#' + tag, icon: 'hash', hint: 'Tag', run: () => go('/tags/' + encodeURIComponent(tag)) }))
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
      const cmds = commands().map((c) => ({ ...c, s: q ? score(c.label, q) : 1 })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s)
      const things = q ? all().map((i) => ({ i, s: score(i.title || i.host || '', q) })).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s || (b.i.saved || 0) - (a.i.saved || 0)).slice(0, 8)
        .map(({ i, s }) => ({ label: i.title || i.host, icon: i.kind === 'book' || i.kind === 'notes' ? 'book' : i.kind === 'pdf' ? 'fileText' : i.state === 'feed' ? 'rss' : 'bookOpen', hint: i.site || i.author || i.host || '', s, run: () => openItem(i.id) })) : []
      shown = [...cmds.slice(0, q ? 6 : 12), ...things]
      if (q && /\s|\?$/.test(q)) shown.push({ label: 'Search for “' + input.value.trim() + '”', icon: 'search', run: () => { go('/search?q=' + encodeURIComponent(input.value.trim())) } })
      at = Math.min(at, Math.max(0, shown.length - 1))
      fill(list, shown.length ? shown.map((c, n) => h('button.pal-item' + (n === at ? '.is-on' : ''), { type: 'button', role: 'option', onpointermove: () => { if (at !== n) { at = n; mark() } }, onclick: () => pick(c) }, h('span.pal-ic', ic(c.icon, 16, 2)), h('span.grow.trunc', c.label), c.hint ? h('small.trunc', c.hint) : null)) : h('div.pal-none', 'Nothing matches'))
    }
    const mark = () => [...list.children].forEach((el, n) => el.classList.toggle('is-on', n === at))
    // Keeps the chosen row in view by scrolling the list itself; scrollIntoView would move the shell too.
    function reveal() {
      const el = list.children[at]
      if (!el) return
      const r = el.getBoundingClientRect()
      const box = list.getBoundingClientRect()
      if (r.top < box.top + 6) list.scrollTop -= box.top + 6 - r.top
      else if (r.bottom > box.bottom - 6) list.scrollTop += r.bottom - box.bottom + 6
    }
    function pick(c) { close(); setTimeout(() => c.run(), 0) }
    function close() {
      layer.classList.remove('is-in'); setTimeout(() => layer.remove(), 180); palette = null; document.removeEventListener('keydown', onKey, true)
      if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); reveal() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); reveal() }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
    }
    document.addEventListener('keydown', onKey, true)
    input.addEventListener('input', () => { at = 0; draw() })
    draw()
    palette = { close }
  }
  document.addEventListener('keydown', (e) => {
    if (root.isConnected && (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && !document.querySelector('.layer')) { e.preventDefault(); openPalette() }
  })

  // No feeds yet: a field to follow a site, an OPML file, and a few to start with.
  function feedWelcome() {
    const SUGGEST = [
      { title: 'The Public Domain Review', url: 'https://publicdomainreview.org', note: 'Essays on curious corners of the past' },
      { title: 'NASA Image of the Day', url: 'https://www.nasa.gov/feeds/iotd-feed/', note: 'A photograph a day from NASA' },
      { title: 'kottke.org', url: 'https://kottke.org', note: 'Links to the liberal arts since 1998' },
      { title: 'Wikipedia: Featured articles', url: 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=atom', note: 'One of Wikipedia’s best articles a day' }
    ]
    return h('div.welcome.feed-welcome',
      h('div.empty-ic', ic('rss', 28, 1.8)),
      h('h2', 'Follow the sites you read'),
      h('p', 'New posts from blogs, newsletters with a feed and YouTube channels arrive here. Save the ones worth reading to your reading list.'),
      h('div.welcome-ways',
        h('button.way', { type: 'button', onclick: () => followSheet() }, h('span.way-ic', ic('plus', 18, 2)), h('div', h('b', 'Follow a site'), h('small', 'Its address, or a YouTube channel’s'))),
        h('button.way', { type: 'button', onclick: () => importSheet() }, h('span.way-ic', ic('fileUp', 18, 2)), h('div', h('b', 'Bring in your feeds'), h('small', 'An OPML file from Feedly, Inoreader, NetNewsWire or Readwise')))),
      h('div.sheet-label', { style: { margin: '18px 4px 4px', 'text-align': 'left' } }, 'To start with'),
      h('div.group.suggest', SUGGEST.map((x) => h('button.row', { type: 'button', onclick: () => followSheet(x.url) }, h('span.row-ic', ic('rss', 16, 2)), h('div.grow', h('b', x.title), h('small', x.note)), ic('plus', 17, 2.2)))))
  }

  /* ---- Highlights page ---------------------------------------------------------------------------- */

  function highlightsPage() {
    const panel = h('div.panel')
    const head = h('div.page-head', h('h1.large-title', 'Highlights'))
    const reviewSlot = h('div.rv-slot')
    const chipRow = h('div.chips')
    const list = h('div')
    const end = h('div.list-end')
    panel.append(head, reviewSlot, chipRow, list, end, h('div.phone-only', { style: { padding: '18px 16px calc(20px + var(--sab))' } }, credit()))
    const el = h('section.page', panel)
    let data = null
    let filter = 'all'
    let drawn = ''
    let groupsShown = 0
    let groups = []

    // Today's review, on paper at the top: what's waiting, the streak, one button.
    function drawReview(r) {
      if (!r || !r.cards) { if (!data || !data.marks.length) reviewSlot.replaceChildren(); return }
      const total = r.cards.length
      const left = r.cards.filter((c) => !r.done.includes(c.mark.id)).length
      const s = r.streak || { n: 0, today: false }
      if (!total) { reviewSlot.replaceChildren(); return }
      const finished = left === 0
      const first = r.cards.find((c) => !r.done.includes(c.mark.id)) || r.cards[0]
      const sources = new Set(r.cards.map((c) => c.item.id)).size
      const key = [total, left, s.n, s.today, first.mark.id].join('|')
      if (reviewSlot.dataset.key === key) return
      reviewSlot.dataset.key = key
      fill(reviewSlot, h('button.rv-hero' + (finished ? '.is-done' : ''), { type: 'button', onclick: () => import('./review.js').then((m) => m.openReview({ again: finished })) },
        h('div.rv-hero-text',
          h('small', finished ? 'Today’s review is done' : 'Today’s review'),
          h('b', finished ? (s.n > 1 ? `${s.n} days in a row` : 'See you tomorrow') : left === total ? `${plural(total, 'highlight')} from ${plural(sources, 'source')}` : `${left} of ${total} left`),
          h('q', h('span', first.mark.quote.length > 150 ? first.mark.quote.slice(0, 140).trim() + '…' : first.mark.quote))),
        h('div.rv-hero-side',
          s.n ? h('span.rv-streak' + (s.today ? '.is-lit' : ''), { title: s.today ? 'Done today' : 'Review today to keep it' }, ic('flame', 15, 2.2), h('b', String(s.n))) : null,
          h('span.btn.primary.small', finished ? 'Look again' : left === total ? 'Start' : 'Continue'))))
    }

    function source(id) {
      const src = (data && data.items[id]) || {}
      const item = lib.items.get(id)
      return { id, kind: (item && item.kind) || src.kind || 'article', title: (item && item.title) || src.title || 'Untitled', author: (item && item.author) || src.author || '', host: (item && item.host) || src.host || '', image: (item && item.image) || src.image || null, url: (item && item.url) || src.url || '' }
    }

    const chipDefs = () => {
      const marks = data ? data.marks : []
      const tagCount = new Map()
      for (const m of marks) for (const t of m.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1)
      const isBook = (m) => { const k = source(m.item).kind; return k === 'notes' || k === 'book' }
      return [
        { key: 'all', label: 'All', test: () => true },
        { key: 'fav', label: 'Favourites', test: (m) => m.fav },
        { key: 'books', label: 'Books', test: isBook },
        { key: 'articles', label: 'Articles', test: (m) => !isBook(m) },
        { key: 'notes', label: 'With notes', test: (m) => !!m.note },
        ...[...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => ({ key: '#' + t, label: t, dot: tone(t), test: (m) => (m.tags || []).includes(t) }))
      ]
    }

    function drawChips() {
      if (!data || !data.marks.length) { chipRow.hidden = true; return }
      const defs = chipDefs().map((c) => ({ ...c, n: data.marks.filter(c.test).length })).filter((c) => c.key === 'all' || c.key === filter || (c.n && c.n < data.marks.length))
      if (defs.length < 2) { chipRow.hidden = true; filter = 'all'; return }
      chipRow.hidden = false
      fill(chipRow, defs.map((c) => h('button.chip' + (c.key === filter ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(c.key === filter), onclick: () => { filter = filter === c.key && c.key !== 'all' ? 'all' : c.key; drawn = ''; drawChips(); render(); panel.scrollTop = Math.min(panel.scrollTop, head.offsetHeight) } },
        c.dot ? h('i.tagdot', { style: { background: c.dot, width: '7px', height: '7px', 'border-radius': '50%' } }) : null, c.label, h('span.n', c.n.toLocaleString()))))
    }

    function groupEl([id, marks]) {
      const src = source(id)
      const book = src.kind === 'notes' || src.kind === 'book'
      if (src.kind === 'notes' && !src.image) findCover(id)
      const pic = src.image
        ? h('div.pic' + (book ? '.is-cover' : ''), h('img', { src: src.image + '/t', alt: '', loading: 'lazy', onload: (e) => e.target.classList.add('is-in'), onerror: (e) => e.target.parentNode.replaceWith(favicon(src, 36)) }))
        : book ? h('div.pic.is-cover.is-plain', { style: { '--cloth': tone(src.title) } }, h('span', src.title.trim().charAt(0).toUpperCase())) : favicon(src, 36)
      return h('div.hl-group', { 'data-key': id },
        h('button.hl-src', { type: 'button', onclick: () => openItem(id) }, pic,
          h('div.grow', h('b', src.title), h('small', [src.author, book ? '' : src.host].filter(Boolean).join(' · ') || (book ? 'Book' : '')))),
        !marks.length ? h('button.hl-card.is-empty', { type: 'button', onclick: () => openItem(id) }, ic('plus', 15, 2.2), 'Add the first highlight') : null,
        cardsOf(id, marks.length > 6 ? marks.slice(0, 5) : marks),
        marks.length > 6 ? h('button.hl-more', { type: 'button', onclick: (e) => { const b = e.currentTarget; b.replaceWith(...cardsOf(id, marks.slice(5))) } }, `Show all ${marks.length.toLocaleString()}`, ic('chevronDown', 15, 2.2)) : null)
    }

    function cardsOf(id, marks) {
      return marks.map((m) => h('button.hl-card' + (m.skip ? '.is-skipped' : ''), { type: 'button', onclick: () => go('/read/' + id + (m.end ? '?at=' + m.id : '')) },
          h('q', h('span', m.quote)),
          m.note ? h('div.note', ic('notebookPen', 14, 2), h('div', m.note)) : null,
          h('span.when', m.fav ? h('span.star', starFill(11)) : null, (m.tags || []).map((t) => h('i.tagdot', { style: { background: tone(t) }, title: '#' + t })), m.loc ? m.loc + ' · ' : '', when(m.at))))
    }

    function render() {
      if (!data) { fill(list, skeleton()); return }
      const key = filter + JSON.stringify(data.marks.map((m) => m.id + m.note + (m.tags || []).join() + m.fav)) + books().filter((b) => !b.marks).map((b) => b.id + b.title + b.image).join()
      if (key === drawn) return
      drawn = key
      drawChips()
      if (!data.marks.length && !books().length) {
        fill(list, h('div.empty', h('div.empty-ic', ic('highlighter', 28, 1.7)), h('b', 'No highlights yet'),
          h('p', 'Select words in an article and choose Highlight. Your highlights come back here in a daily review, and Claude can read them too.'),
          h('button.btn', { type: 'button', onclick: () => importSheet() }, ic('fileUp', 17, 2), 'Bring in Kindle highlights')))
        return
      }
      const f = chipDefs().find((c) => c.key === filter) || chipDefs()[0]
      const by = new Map()
      for (const m of data.marks) { if (!f.test(m)) continue; if (!by.has(m.item)) by.set(m.item, []); by.get(m.item).push(m) }
      for (const marks of by.values()) marks.sort((a, b) => (a.end ? a.start - b.start : 0) || (posOf(a) - posOf(b)) || (a.at - b.at))
      groups = [...by.entries()]
      // Paper books still waiting for their first highlight come first, so they can be found.
      if (filter === 'all' || filter === 'books') for (const b of books()) if (!b.marks && !by.has(b.id)) groups.unshift([b.id, []])
      groupsShown = Math.min(groups.length, Math.max(24, groupsShown))
      fill(list, groups.slice(0, groupsShown).map(groupEl))
    }
    const posOf = (m) => { const n = /\d+/.exec(m.loc || ''); return n ? Number(n[0]) : 0 }

    panel.addEventListener('scroll', () => {
      updateTitle(panel)
      if (panel.scrollTop + panel.clientHeight < panel.scrollHeight - 900 || groupsShown >= groups.length) return
      const add = groups.slice(groupsShown, groupsShown + 24)
      groupsShown += add.length
      list.append(...add.map(groupEl))
    }, { passive: true })

    let partialAt = 0
    function load(force = false) {
      if (force) lib.highlights = null
      highlights((part) => {
        // A long list draws as it arrives, but not more than twice a second.
        if (Date.now() - partialAt < 500 && data) return
        partialAt = Date.now()
        if (!data || part.marks.length > data.marks.length) { data = part; render() }
      }).then((r) => { data = r; render(); drawReview(keptReview()) }).catch((e) => { if (!data) fill(list, emptyState('wifiOff', 'Highlights can’t load', e.message)) })
      reviewSet().then(drawReview).catch(() => {})
    }

    return {
      key: '/highlights', el, panel, title: () => 'Highlights',
      show() {
        data = keptHighlights() || data
        render()
        drawReview(keptReview())
        load()
      },
      change(c) {
        if (!active || active.key !== '/highlights') return
        if (c && c.review) { drawReview(lib.review); return }
        const total = all().reduce((n, i) => n + (i.marks || 0), 0)
        if (c && (c.marks || c.full) || (data && !data.partial && total !== data.marks.length)) load(true)
        else if (c && c.item && lib.items.get(c.item) && lib.items.get(c.item).kind === 'notes') { drawn = ''; render() }
      },
      ids: () => []
    }
  }

  /* ---- Search ------------------------------------------------------------------------------------- */

  function searchPage() {
    const panel = h('div.panel')
    const field = h('input.field', { type: 'search', placeholder: 'Titles, words in articles, highlights', 'aria-label': 'Search your shelf', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' })
    const head = h('div.page-head.phone-only', h('h1.large-title', 'Search'))
    const box = h('div.phone-only', { style: { padding: '4px 16px 8px' } }, field)
    const out = h('div')
    // A question gets an offer to ask the whole shelf, and the answer sits above the results.
    const askBox = h('div.ask-slot')
    const viewBox = h('div.view-slot')
    panel.append(head, box, askBox, viewBox, out, h('div.list-end'))
    panel.addEventListener('scroll', () => updateTitle(panel), { passive: true })
    const el = h('section.page', panel)
    let q = ''
    let askedFor = ''
    const question = (t) => /\?$/.test(t) || (t.split(/\s+/).length >= 4 && /^(what|why|how|who|when|where|which|did|do|does|is|are|can|should|would|could|tell|find|summari[sz]e|compare)\b/i.test(t))
    function offerAsk() {
      if (!q || !question(q)) { if (askedFor !== q) fill(askBox); return }
      if (askedFor === q) return
      fill(askBox, h('button.ask-row', { type: 'button', onclick: () => { askedFor = q; import('../ask.js').then((m) => m.askShelf(q, askBox)) } },
        h('span.ask-row-ic', ic('sparkles', 16, 2.1)), h('div.grow', h('b', 'Ask your shelf'), h('small', '“' + q + '”')), ic('arrowRight', 16, 2.2)))
    }
    let timer = 0
    let asked = 0
    function run(text) {
      q = text.trim()
      if (searchInput.value !== text && document.activeElement !== searchInput) searchInput.value = text
      if (field.value !== text && document.activeElement !== field) field.value = text
      const url = '/search' + (q ? '?q=' + encodeURIComponent(q) : '')
      if (location.pathname === '/search' && location.pathname + location.search !== url) history.replaceState({}, '', url)
      offerAsk()
      if (!q) {
        fill(viewBox)
        const views = keptViews()
        fill(out,
          views.length ? [h('div.section-head', 'Views'), h('div.group.views-list', views.map((x) => h('button.row', { type: 'button', onclick: () => go('/view/' + x.id) }, h('span.row-ic', ic('layers', 16, 2)), h('div.grow', h('b', x.name), h('small.trunc', x.q)), h('span.side-count', String(applyQuery(all(), x.q).length)))))] : null,
          h('div.empty', { style: { 'margin-top': views.length ? '5vh' : '9vh' } }, h('div.empty-ic', ic('search', 28, 1.7)), h('b', 'Search your shelf'), h('p', 'Find words in the titles, the articles you saved, and your highlights and notes. Ask a question to have it answered from them. Narrow it with:')),
          h('div.query-help', QUERY_HELP.map(([k, what]) => h('button.chip', { type: 'button', title: what, onclick: () => { const t = (field.value ? field.value + ' ' : '') + k; field.value = t; searchInput.value = t; (isPhone() ? field : searchInput).focus(); } }, h('b', k), what))))
        return
      }
      // Filters (tag:, in:, kind:, minutes:…) narrow the shelf; the other words are searched for.
      const parsed = parseQuery(q)
      const base = parsed.filters.length ? applyQuery(all(), parsed) : all()
      const inBase = new Set(base.map((i) => i.id))
      const terms = parsed.words.map((w) => w.toLowerCase()).filter(Boolean)
      const local = base.filter((i) => { const hay = [i.title, i.site, i.host, i.excerpt, i.note, i.author, ...(i.tags || [])].join(' ').toLowerCase(); return terms.every((t) => hay.includes(t)) }).sort((a, b) => (b.saved || 0) - (a.saved || 0))
      fill(viewBox, parsed.filters.length ? h('button.save-view', { type: 'button', onclick: () => editView({ name: '', q }) }, ic('layers', 15, 2.1), 'Save as a view') : null)
      const draw = (server) => {
        const seen = new Set(local.map((i) => i.id))
        const deep = server ? server.results.filter((r) => !seen.has(r.id) && lib.items.has(r.id) && inBase.has(r.id)) : []
        const marks = server ? server.marks.filter((m) => lib.items.has(m.item) && inBase.has(m.item)) : []
        const snippets = new Map(server ? server.results.map((r) => [r.id, r.snippet]) : [])
        if (!local.length && !deep.length && !marks.length) {
          fill(out, server ? (question(q) ? null : emptyState('search', 'Nothing found', parsed.filters.length && !terms.length ? 'Nothing on your shelf fits that.' : `Nothing on your shelf mentions “${q}”.`)) : h('div.empty', h('span.shimmer')))
          return
        }
        fill(out,
          local.length ? [h('div.section-head', terms.length ? 'Titles' : 'Found', h('span.n', local.length.toLocaleString())), h('div.rows', local.slice(0, terms.length ? 50 : 200).map((i) => rowEl(i, { archive: i.state === 'archived' })))] : null,
          deep.length ? [h('div.section-head', 'In articles', h('span.n', deep.length.toLocaleString())), h('div.rows', deep.map((r) => {
            const i = lib.items.get(r.id)
            const row = rowEl({ ...i, excerpt: '' }, { archive: i.state === 'archived' })
            const x = h('div.row-x', mark2(snippets.get(r.id) || '', terms))
            row.querySelector('.row-t').after(x)
            return row
          }))] : null,
          marks.length ? [h('div.section-head', 'Highlights', h('span.n', marks.length.toLocaleString())), h('div.hl-group', marks.map((m) => h('button.hl-card', { type: 'button', onclick: () => go('/read/' + m.item + '?at=' + m.id) }, h('q', h('span', m.quote)), m.note ? h('div.note', ic('notebookPen', 14, 2), h('div', m.note)) : null, h('span.when', (lib.items.get(m.item) || {}).title || ''))))] : null)
      }
      draw(null)
      clearTimeout(timer)
      const mine = ++asked
      if (!terms.length) { draw({ results: [], marks: [] }); return }
      timer = setTimeout(async () => {
        try { const r = await api.get('/api/search?q=' + encodeURIComponent(parsed.plain)); if (mine === asked) draw(r) } catch { if (mine === asked) draw({ results: [], marks: [] }) }
      }, 220)
    }
    field.addEventListener('input', () => run(field.value))
    return {
      key: '/search', el, panel, title: () => 'Search',
      show() { const p = new URLSearchParams(location.search).get('q') || ''; if (p !== q || !out.firstChild) run(p); if (isPhone() && !q) requestAnimationFrame(() => field.focus()) },
      change() { if (q) run(q) },
      ids: () => [...out.querySelectorAll('.row-item')].map((r) => r.dataset.id),
      run
    }
  }

  // Bold the words that were searched for, in a snippet.
  function mark2(text, terms) {
    const parts = []
    const lower = text.toLowerCase()
    let i = 0
    while (i < text.length) {
      let next = -1
      let len = 0
      for (const t of terms) { const j = lower.indexOf(t, i); if (j >= 0 && (next < 0 || j < next)) { next = j; len = t.length } }
      if (next < 0) { parts.push(text.slice(i)); break }
      parts.push(text.slice(i, next), h('b', text.slice(next, next + len)))
      i = next + len
    }
    return parts
  }

  searchInput.addEventListener('input', () => {
    if (location.pathname !== '/search') go('/search?q=' + encodeURIComponent(searchInput.value), { replace: location.pathname === '/search' })
    else page('/search').run(searchInput.value)
  })
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchInput.blur(); if (location.pathname === '/search') go(listKey === '/search' ? '/' : listKey) }
    if (e.key === 'ArrowDown') { e.preventDefault(); searchInput.blur(); moveCursor(1) }
  })

  /* ---- Pages ------------------------------------------------------------------------------------------ */

  function make(key) {
    if (key === '/') return listPage({ key, title: 'Reading list', source: unread, chips: timeChips, empty: (f) => (f !== 'all' ? emptyState('bookOpen', 'Nothing here', 'Nothing on your reading list fits that.') : lib.items.size ? caughtUp() : welcome()) })
    if (key === '/favourites') return listPage({ key, title: 'Favourites', source: favourites, empty: () => emptyState('star', 'No favourites yet', 'Star the articles worth keeping. They stay here after you’ve read them.') })
    if (key === '/feed') return feedPage()
    if (key === '/archive') return listPage({ key, title: 'Archive', source: archived, archive: true, chips: () => [{ key: 'all', label: 'All', test: () => true }, ...favChip(), { key: 'marks', label: 'With highlights', test: (i) => i.marks > 0 }, ...tags().slice(0, 10).map(({ tag }) => ({ key: '#' + tag, label: tag, dot: tone(tag), test: (i) => (i.tags || []).includes(tag) }))], empty: () => emptyState('archive', 'Nothing finished yet', 'Archive an article when you’re done with it. It stays here, searchable, with your highlights.') })
    if (key === '/highlights') return highlightsPage()
    if (key === '/search') return searchPage()
    const t = /^\/tags\/(.+)$/.exec(key)
    if (t) return listPage({ key, title: '#' + t[1], source: () => tagged(t[1]), empty: () => emptyState('tag', 'No links with this tag', 'Add tags to an article from its ⋯ menu.') })
    const v = /^\/view\/([\w-]+)$/.exec(key)
    if (v) {
      const view = () => keptViews().find((x) => x.id === v[1]) || { name: 'View', q: '' }
      return listPage({
        key, title: () => view().name,
        source: () => applyQuery(all(), view().q).sort((a, b) => (b.saved || 0) - (a.saved || 0)),
        empty: () => emptyState('search', 'Nothing in this view', 'Nothing on your shelf fits “' + view().q + '” right now.'),
        extra: () => [
          { label: 'Change the view…', icon: 'pencil', onclick: () => editView(view()) },
          { label: 'Delete the view', icon: 'trash', danger: true, onclick: async () => { await saveViews(keptViews().filter((x) => x.id !== v[1])); go('/'); toast('View deleted', { kind: 'info' }) } }
        ]
      })
    }
    return null
  }

  function page(key) {
    if (!pages.has(key)) { const p = make(key); if (!p) return null; pages.set(key, p) }
    return pages.get(key)
  }

  function parse() {
    const path = decodeURIComponent(location.pathname.replace(/\/+$/, '') || '/')
    const r = /^\/read\/([A-Za-z0-9_-]{6,64})$/.exec(path)
    if (r) return { read: r[1], at: new URLSearchParams(location.search).get('at') }
    if (['/', '/feed', '/favourites', '/highlights', '/archive', '/search'].includes(path) || /^\/tags\/[^/]+$/.test(path) || /^\/view\/[\w-]+$/.test(path)) return { key: path }
    return { key: '/', missing: path !== '/' }
  }

  function show() {
    const r = parse()
    if (r.missing) { history.replaceState({}, '', '/'); }
    let key = r.key
    if (r.read) {
      const item = lib.items.get(r.read)
      if (!item && lib.ready) { toast('That article isn’t on your shelf.', { kind: 'bad' }); history.replaceState({}, '', listKey); return show() }
      key = pages.has(listKey) ? listKey : (item && item.state === 'archived' ? '/archive' : item && item.state === 'feed' ? '/feed' : '/')
    } else listKey = key
    const p = page(key)
    // A page taken out of the document forgets its scroll, so it's kept here and given back.
    let back = null
    if (active !== p) {
      if (active) { active.scrolled = active.panel.scrollTop; if (active.leave) active.leave() }
      fill(listCol, p.el)
      active = p
      back = p.scrolled || 0
    }
    p.show()
    if (back) p.panel.scrollTop = back
    for (const a of [...sideLinks, ...tabbar.children]) a.classList.toggle('is-on', a.dataset.path === key)
    for (const a of sideTags.querySelectorAll('.side-item')) a.classList.toggle('is-on', a.dataset.path === key)
    for (const a of sideViews.querySelectorAll('.side-item')) a.classList.toggle('is-on', a.dataset.path === key)
    smallTitle.textContent = p.title()
    document.title = r.read ? ((lib.items.get(r.read) || {}).title || 'Shelf') : (key === '/' ? 'Shelf' : p.title() + ' · Shelf')
    if (key === '/search') { if (document.activeElement !== searchInput && wide()) searchInput.value = new URLSearchParams(location.search).get('q') || '' }
    else if (document.activeElement !== searchInput) searchInput.value = ''
    if (r.read) openReader(r.read, r.at)
    else if (reading) closeReader(true)
    counts()
  }

  function counts() {
    PLACES.forEach((x, n) => { const c = x.count(); sideLinks[n].querySelector('.side-count').textContent = c ? c.toLocaleString() : '' })
    const views = keptViews()
    const vkey = views.map((x) => x.id + x.name + x.q).join() + '|' + lib.v
    if (sideViews.dataset.key !== vkey) {
      sideViews.dataset.key = vkey
      const items = all()
      fill(sideViews, views.length ? h('div.side-h', 'Views') : null, views.map((x) => link('/view/' + x.id, { class: 'side-item side-view', 'data-path': '/view/' + x.id, title: x.q }, ic('layers', 17, 1.9), h('span.grow.trunc', x.name), h('span.side-count', String(applyQuery(items, x.q).length || '')))))
      for (const a of sideViews.querySelectorAll('.side-item')) a.classList.toggle('is-on', active && a.dataset.path === active.key)
    }
    const list = tags()
    const key = list.map((t) => t.tag + t.n).join()
    if (sideTags.dataset.key !== key) {
      sideTags.dataset.key = key
      fill(sideTags, list.length ? h('div.side-h', 'Tags') : null, list.slice(0, 24).map(({ tag, n }) => link('/tags/' + encodeURIComponent(tag), { class: 'side-item side-tag', 'data-path': '/tags/' + tag }, h('i.tagdot', { style: { background: tone(tag) } }), h('span.grow.trunc', tag), h('span.side-count', String(n)))))
      for (const a of sideTags.querySelectorAll('.side-item')) a.classList.toggle('is-on', active && a.dataset.path === active.key)
    }
  }

  /* ---- Reading ------------------------------------------------------------------------------------------ */

  function openItem(id) {
    closeMenus()
    const it = lib.items.get(id)
    if (it && it.state === 'feed') stillShown.add(id)
    if (location.pathname === '/read/' + id) return
    go('/read/' + id, { replace: !!reading && wide() })
  }

  async function openReader(id, at) {
    const was = reading
    reading = id
    if (readerCol.firstChild !== reader.el) fill(readerCol, reader.el)
    if (active && active.setOpen) active.setOpen(id)
    cursor = id
    markCursor()
    root.classList.add('is-reading')
    requestAnimationFrame(() => readerCol.classList.add('is-open'))
    if (was !== id || at) await reader.open(id, { at })
  }

  function closeReader(fromRoute = false) {
    if (!reading) return
    const id = reading
    reading = null
    reader.close()
    root.classList.remove('is-reading', 'is-focus')
    readerCol.classList.remove('is-open')
    if (active && active.setOpen) active.setOpen(null)
    if (wide()) fill(readerCol, empty)
    else setTimeout(() => { if (!reading) fill(readerCol, empty) }, 450)
    if (!fromRoute) go(listKey === '/search' ? '/search' + (searchInput.value ? '?q=' + encodeURIComponent(searchInput.value) : '') : listKey)
    cursor = id
    markCursor()
  }

  // The next article in the list you're reading from (for "Up next" and after archiving).
  function neighbour(id, peek = false) {
    const ids = active && active.ids ? active.ids() : unread().map((i) => i.id)
    const i = ids.indexOf(id)
    const next = ids[i + 1] || (peek ? null : ids[i - 1])
    return next && next !== id ? lib.items.get(next) : null
  }

  // Swipe from the left edge to go back to the list, as in iOS.
  ;(() => {
    let x0 = null, y0 = 0, dx = 0, pid = null
    readerCol.addEventListener('pointerdown', (e) => {
      if (wide() || e.pointerType === 'mouse' || e.clientX > 28) return
      x0 = e.clientX; y0 = e.clientY; dx = 0; pid = e.pointerId
    })
    readerCol.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId || x0 == null) return
      dx = e.clientX - x0
      if (dx < 0 || Math.abs(e.clientY - y0) > Math.abs(dx) * 1.2) return
      readerCol.classList.add('is-dragging')
      readerCol.style.transform = `translate3d(${dx}px,0,0)`
    })
    const end = (e) => {
      if (pid !== e.pointerId) return
      pid = null
      readerCol.classList.remove('is-dragging')
      readerCol.style.transform = ''
      if (dx > 90) closeReader()
      x0 = null
    }
    readerCol.addEventListener('pointerup', end)
    readerCol.addEventListener('pointercancel', end)
  })()

  /* ---- Keys, paste and drop -------------------------------------------------------------------------------- */

  let cursor = null
  function markCursor() {
    if (!active || !active.rows) return
    for (const r of active.rows.querySelectorAll('.row-item')) r.classList.toggle('is-cursor', r.dataset.id === cursor && !reading)
  }
  function moveCursor(d) {
    const ids = active && active.ids ? active.ids() : []
    if (!ids.length) return
    const now = reading || cursor
    const i = ids.indexOf(now)
    const next = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + d))]
    cursor = next
    if (reading && wide()) openItem(next)
    markCursor()
    const row = active.rows && active.rows.querySelector(`.row-item[data-id="${CSS.escape(next)}"]`)
    if (row) {
      const p = active.panel.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      if (r.top < p.top + 40) active.panel.scrollBy({ top: r.top - p.top - 40 })
      else if (r.bottom > p.bottom - 20) active.panel.scrollBy({ top: r.bottom - p.bottom + 20 })
    }
  }

  const typing = (t) => t && (t.closest('input, textarea, select, [contenteditable="true"]'))
  document.addEventListener('keydown', (e) => {
    if (!root.isConnected || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.layer, .review')) return
    if (typing(e.target)) return
    const k = e.key
    if (k === 'j' || (k === 'ArrowDown' && !reading)) { e.preventDefault(); moveCursor(1) }
    else if (k === 'k' || (k === 'ArrowUp' && !reading)) { e.preventDefault(); moveCursor(-1) }
    else if ((k === 'Enter' || k === 'o') && cursor && !reading) { e.preventDefault(); openItem(cursor) }
    else if (k === 'Escape') { if (document.querySelector('.pop, .aa')) reader.closePops(); else if (reading) closeReader() }
    else if (k === '/') { e.preventDefault(); if (wide()) { searchInput.focus(); searchInput.select() } else go('/search') }
    else if (k === 'a') { e.preventDefault(); saveSheet() }
    else if (k === '?') keysSheet()
    else if (k === 'r' && !reading) { e.preventDefault(); import('./review.js').then((m) => m.openReview()) }
    else if (k === 'e') { if (reading) reader.archive(); else if (cursor) { const i = lib.items.get(cursor); if (i) { const n = neighbour(cursor); setArchived(cursor, i.state !== 'archived'); cursor = n ? n.id : null; setTimeout(markCursor, 50) } } }
    else if (k === 's') { if (reading) reader.favourite(); else if (cursor) { const i = lib.items.get(cursor); if (i) setFav(cursor, !i.fav) } }
    else if (k === 'h' && reading) reader.highlight()
    else if (k === 'l' && reading) reader.listen()
    else if (k === 'f' && reading && wide()) root.classList.toggle('is-focus')
  })

  document.addEventListener('paste', (e) => {
    if (!root.isConnected || typing(e.target) || document.querySelector('.layer')) return
    const text = (e.clipboardData && e.clipboardData.getData('text')) || ''
    if (looksLikeURL(text)) { e.preventDefault(); saveURL(text.trim()) }
  })

  let dragDepth = 0
  const linkIn = (e) => e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'text/uri-list' || t === 'text/plain' || t === 'Files')
  document.addEventListener('dragenter', (e) => { if (!root.isConnected || !linkIn(e)) return; dragDepth++; drop.classList.add('is-on') })
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('is-on') } })
  document.addEventListener('dragover', (e) => { if (root.isConnected && linkIn(e)) e.preventDefault() })
  document.addEventListener('drop', (e) => {
    if (!root.isConnected) return
    dragDepth = 0
    drop.classList.remove('is-on')
    const file = e.dataTransfer.files && e.dataTransfer.files[0]
    if (file) { e.preventDefault(); uploadSheet(file); return }
    const text = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n').find((l) => l && !l.startsWith('#'))
    if (text && looksLikeURL(text)) { e.preventDefault(); saveURL(text.trim()) }
  })

  /* ---- Keeping up ---------------------------------------------------------------------------------------- */

  let pending = null
  on((change) => {
    if (change.progressOnly && !(active && active.key === '/')) return
    if (change.fresh && change.remote) {
      const i = lib.items.get(change.item)
      if (i && i.via === 'claude') toast('Claude saved “' + ((i.title || i.host).length > 46 ? (i.title || i.host).slice(0, 44) + '…' : (i.title || i.host)) + '”', { kind: 'info', action: { label: 'Read', onclick: () => openItem(i.id) } })
    }
    // Several changes in a row redraw once.
    pending = pending
      ? { full: pending.full || change.full, marks: pending.marks || change.marks, review: pending.review || change.review, item: change.item || pending.item, views: pending.views || change.views }
      : { full: change.full, marks: change.marks, review: change.review, item: change.item, views: change.views }
    requestAnimationFrame(() => {
      if (!pending) return
      const c = pending
      pending = null
      if (active) active.change(c)
      if (c.views) counts()
      for (const [key, p] of pages) if (p !== active && p.stale !== true) p.stale = true
      counts()
      markCursor()
    })
  })

  setTimeout(() => { loadFeeds().then((f) => { if (f.length) checkFeeds() }).catch(() => {}); loadViews().catch(() => {}) }, 2500)

  return {
    el: root,
    show() {
      const r = parse()
      const next = r.read ? null : page(r.key)
      if (next && next.stale) { next.stale = false }
      show()
    }
  }
}
