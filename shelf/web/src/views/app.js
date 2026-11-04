// The signed-in app: a frosted top bar, a sidebar of places on a desk and a tab bar on a phone,
// the list, and the article beside it (a desk) or sliding over it (a phone). Each list page is
// kept alive with its scroll while you're elsewhere.
//
//   /              the reading list          /tags/<tag>   one tag
//   /favourites    favourites                /search?q=    search
//   /highlights    every highlight           /read/<id>    an article (?at=<highlight>)
//   /archive       finished

import { h, ic, fill, toast, menu, haptic, reduced, wide, flip, copyText, closeMenus } from '../ui.js'
import { mark, starFill } from '../icons.js'
import * as api from '../api.js'
import {
  lib, on, unread, favourites, archived, tagged, tags, all, minutes, tone, update, remove, highlights, keptHighlights, isWorking, makeReadable,
  reviewSet, keptReview, findCover, books
} from '../store.js'
import { go, link, accountButton, credit, failure, saveSheet, saveURL, looksLikeURL, connectSheet, importSheet, keysSheet, state } from '../shell.js'
import { createReader } from '../reader.js'
import { favicon, when, plural } from '../bits.js'

const PLACES = [
  { path: '/', label: 'Reading list', icon: 'bookOpen', count: () => unread().length },
  { path: '/favourites', label: 'Favourites', icon: 'star', count: () => favourites().length },
  { path: '/highlights', label: 'Highlights', icon: 'highlighter', count: () => all().reduce((n, i) => n + (i.marks || 0), 0) },
  { path: '/archive', label: 'Archive', icon: 'archive', count: () => archived().length }
]
const TABS = [
  { path: '/', label: 'Reading list', icon: 'bookOpen' },
  { path: '/favourites', label: 'Favourites', icon: 'star' },
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
  const side = h('nav.side', { 'aria-label': 'Places' }, h('div.side-list', sideLinks), sideTags, h('div.side-foot', credit()))
  const tabbar = h('nav.tabbar', { 'aria-label': 'Sections' }, TABS.map((x) => link(x.path, { class: 'tab', 'data-path': x.path }, ic(x.icon, 24, 1.8), h('span', x.label))))

  const reader = createReader({ onClose: () => closeReader(), onNext: (id, peek) => neighbour(id, peek) })
  const empty = h('div.r-empty', h('div', mark(34), h('b', 'Pick something to read'), h('p', 'Articles open here. ', h('kbd', 'J'), ' ', h('kbd', 'K'), ' move through the list, ', h('kbd', '↵'), ' opens one.')))
  const readerCol = h('div.reader-col.reader-layer', empty)
  const listCol = h('div.list-col')
  const main = h('main.main', listCol, readerCol)
  const root = h('div.app', top, h('div.body', side, main), tabbar)
  const drop = h('div.drop', h('div', ic('bookmarkPlus', 30, 1.8), 'Drop a link to save it'))
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

  function rowMeta(i, { archive = false } = {}) {
    const bits = [favicon(i, 16), h('span.host', i.site || i.host)]
    const add = (...x) => { bits.push(h('i.dot')); bits.push(...x) }
    if (i.status === 'pending') {
      if (isWorking(i.id)) add(h('span.shimmer'))
      else add(h('span', i.via === 'import' ? 'Not fetched yet' : 'Waiting to fetch'))
    } else if (i.status === 'failed') add(h('span', 'Couldn’t fetch'))
    else if (i.status === 'link') add(h('span', 'Link'))
    else if (i.words) {
      const m = minutes(i)
      if (!archive && i.progress > 0.02 && i.progress < 0.97) add(h('span.left', `${Math.max(1, Math.round(m * (1 - i.progress)))} min left`))
      else add(h('span', `${m} min`))
    }
    if (archive && i.read) add(h('span', 'Read ' + when(i.read)))
    if (i.marks) add(h('span', { title: plural(i.marks, 'highlight') }, ic('highlighter', 12, 2.2)))
    if (i.fav) bits.push(h('span.star', starFill(12)))
    for (const t of (i.tags || []).slice(0, 3)) bits.push(h('i.tagdot', { style: { background: tone(t) }, title: '#' + t }))
    return h('div.meta', bits)
  }

  function rowEl(i, opts = {}) {
    const showProgress = !opts.archive && i.progress > 0.02 && i.progress < 0.97
    const btn = h('button.row-item' + (i.status === 'pending' ? '.is-pending' : '') + (reading === i.id ? '.is-open' : ''), { type: 'button', 'data-id': i.id },
      h('div', { style: { 'min-width': '0' } },
        h('div.row-t', i.title || i.host || i.url),
        i.excerpt ? h('div.row-x', i.excerpt) : null,
        i.note && !i.excerpt ? h('div.row-note', ic('notebookPen', 13, 2), h('span', i.note)) : null,
        rowMeta(i, opts)),
      i.image ? h('div.pic', h('img', { src: i.image + '/t', alt: '', loading: 'lazy', decoding: 'async', onload: (e) => e.target.classList.add('is-in'), onerror: (e) => e.target.parentNode.remove() })) : null,
      showProgress ? h('div.row-prog', h('i', { style: { transform: `scaleX(${i.progress})` } })) : null)
    const wrap = h('div.row-wrap', { 'data-key': i.id, 'data-sig': sig(i) },
      h('div.row-acts', h('span.is-fav', starFill(18), i.fav ? 'Unfavourite' : 'Favourite'), h('span.is-arch', ic(i.state === 'archived' ? 'rotateCcw' : 'archive', 18, 2), i.state === 'archived' ? 'Unarchive' : 'Archive')),
      btn)
    btn.addEventListener('click', () => openItem(i.id))
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); rowMenu(i.id, { x: e.clientX, y: e.clientY }) })
    swipe(wrap, btn, i.id)
    return wrap
  }

  function rowMenu(id, at) {
    const i = lib.items.get(id)
    if (!i) return
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
        setTimeout(() => setArchived(id, i.state !== 'archived'), 180)
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

  function listPage({ key, title, source, chips = null, empty: emptyFor, archive = false, sub = null }) {
    const panel = h('div.panel')
    const head = h('div.page-head', h('h1.large-title', typeof title === 'function' ? title() : title))
    const chipRow = h('div.chips')
    const rows = h('div.rows')
    const more = h('div.list-end')
    const foot = h('div.phone-only', { style: { padding: '18px 16px calc(20px + var(--sab))' } }, credit())
    panel.append(head, chipRow, rows, more, foot)
    const el = h('section.page', panel)
    let filter = 'all'
    let shown = 0
    let list = []

    const filtered = () => {
      const base = source()
      const f = chips ? chips().find((c) => c.key === filter) : null
      return f ? base.filter(f.test) : base
    }

    function drawChips() {
      if (!chips) { chipRow.hidden = true; return }
      const base = source()
      const defs = chips().map((c) => ({ ...c, n: c.key === 'all' ? base.length : base.filter(c.test).length })).filter((c) => c.key === 'all' || c.key === filter || c.n)
      if (defs.length < 2) { chipRow.hidden = true; if (filter !== 'all') filter = 'all'; return }
      chipRow.hidden = false
      fill(chipRow, defs.map((c) => h('button.chip' + (c.key === filter ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(c.key === filter), onclick: () => { filter = filter === c.key && c.key !== 'all' ? 'all' : c.key; drawChips(); draw(true); panel.scrollTop = 0 } },
        c.dot ? h('i.tagdot', { style: { background: c.dot, width: '7px', height: '7px', 'border-radius': '50%' } }) : null, c.label, h('span.n', c.n.toLocaleString()))))
    }

    function draw(full = false) {
      head.firstChild.textContent = typeof title === 'function' ? title() : title
      list = filtered()
      if (!lib.ready) { fill(rows, skeleton()); return }
      if (!list.length) { fill(rows, emptyFor ? emptyFor(filter) : null); shown = 0; return }
      if (rows.querySelector('.empty, .welcome, .skeleton')) full = true
      const want = Math.max(CHUNK, full ? CHUNK : shown)
      const next = list.slice(0, want)
      shown = next.length
      const have = new Map([...rows.children].filter((c) => c.dataset.key).map((c) => [c.dataset.key, c]))
      const els = next.map((i) => {
        const old = have.get(i.id)
        if (old && old.dataset.sig === sig(i)) { old.firstChild.nextSibling.classList.toggle('is-open', reading === i.id); return old }
        return rowEl(i, { archive })
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
      show() { drawChips(); draw(); updateTitle(panel) },
      change(c) { drawChips(); draw(!!c.full) },
      ids: () => list.map((i) => i.id),
      setOpen(id) { for (const r of rows.querySelectorAll('.row-item')) r.classList.toggle('is-open', r.dataset.id === id) },
      rows
    }
  }

  function skeleton() { return h('div.skeleton', [0, 1, 2, 3, 4].map(() => h('div.sk', h('div', h('i'), h('i'), h('i')), h('em')))) }

  function updateTitle(panel) {
    const t = panel.querySelector('.large-title')
    top.classList.toggle('scrolled', !!t && panel.scrollTop > t.offsetTop + t.offsetHeight - 8)
  }

  const timeChips = () => [
    { key: 'all', label: 'All', test: () => true },
    { key: 'quick', label: 'Quick reads', test: (i) => i.words && minutes(i) <= 10 },
    { key: 'long', label: 'Long reads', test: (i) => minutes(i) >= 20 },
    { key: 'started', label: 'Started', test: (i) => i.progress > 0.02 && i.progress < 0.97 },
    { key: 'claude', label: 'From Claude', test: (i) => i.via === 'claude' },
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
        way('plug', 'Save from anywhere', 'A bookmark button, your phone’s share sheet, or Claude', () => connectSheet()),
        way('fileUp', 'Bring in your Pocket links', 'Or an Instapaper, Omnivore or bookmarks export', () => importSheet())))
  }

  function caughtUp() {
    return h('div.empty', art(), h('b', 'All caught up'), h('p', 'Everything on your reading list is read. Save something new, or find an old favourite in the Archive.'),
      h('button.btn', { type: 'button', onclick: () => saveSheet() }, ic('plus', 17, 2.2), 'Save a link'))
  }

  const emptyState = (icon, title, text) => h('div.empty', h('div.empty-ic', ic(icon, 28, 1.7)), h('b', title), h('p', text))

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
    panel.append(head, box, out, h('div.list-end'))
    panel.addEventListener('scroll', () => updateTitle(panel), { passive: true })
    const el = h('section.page', panel)
    let q = ''
    let timer = 0
    let asked = 0
    function run(text) {
      q = text.trim()
      if (searchInput.value !== text && document.activeElement !== searchInput) searchInput.value = text
      if (field.value !== text && document.activeElement !== field) field.value = text
      const url = '/search' + (q ? '?q=' + encodeURIComponent(q) : '')
      if (location.pathname === '/search' && location.pathname + location.search !== url) history.replaceState({}, '', url)
      if (!q) { fill(out, emptyState('search', 'Search your shelf', 'Find words in the titles, the articles you saved, and your highlights and notes.')); return }
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
      const local = all().filter((i) => { const hay = [i.title, i.site, i.host, i.excerpt, i.note, ...(i.tags || [])].join(' ').toLowerCase(); return terms.every((t) => hay.includes(t)) }).sort((a, b) => (b.saved || 0) - (a.saved || 0))
      const draw = (server) => {
        const seen = new Set(local.map((i) => i.id))
        const deep = server ? server.results.filter((r) => !seen.has(r.id) && lib.items.has(r.id)) : []
        const marks = server ? server.marks.filter((m) => lib.items.has(m.item)) : []
        const snippets = new Map(server ? server.results.map((r) => [r.id, r.snippet]) : [])
        if (!local.length && !deep.length && !marks.length) {
          fill(out, server ? emptyState('search', 'Nothing found', `Nothing on your shelf mentions “${q}”.`) : h('div.empty', h('span.shimmer')))
          return
        }
        fill(out,
          local.length ? [h('div.section-head', 'Titles', h('span.n', local.length.toLocaleString())), h('div.rows', local.slice(0, 50).map((i) => rowEl(i, { archive: i.state === 'archived' })))] : null,
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
      timer = setTimeout(async () => {
        try { const r = await api.get('/api/search?q=' + encodeURIComponent(q)); if (mine === asked) draw(r) } catch { if (mine === asked) draw({ results: [], marks: [] }) }
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
    if (key === '/archive') return listPage({ key, title: 'Archive', source: archived, archive: true, chips: () => [{ key: 'all', label: 'All', test: () => true }, { key: 'marks', label: 'With highlights', test: (i) => i.marks > 0 }, ...tags().slice(0, 10).map(({ tag }) => ({ key: '#' + tag, label: tag, dot: tone(tag), test: (i) => (i.tags || []).includes(tag) }))], empty: () => emptyState('archive', 'Nothing finished yet', 'Archive an article when you’re done with it. It stays here, searchable, with your highlights.') })
    if (key === '/highlights') return highlightsPage()
    if (key === '/search') return searchPage()
    const t = /^\/tags\/(.+)$/.exec(key)
    if (t) return listPage({ key, title: '#' + t[1], source: () => tagged(t[1]), empty: () => emptyState('tag', 'No links with this tag', 'Add tags to an article from its ⋯ menu.') })
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
    if (['/', '/favourites', '/highlights', '/archive', '/search'].includes(path) || /^\/tags\/[^/]+$/.test(path)) return { key: path }
    return { key: '/', missing: path !== '/' }
  }

  function show() {
    const r = parse()
    if (r.missing) { history.replaceState({}, '', '/'); }
    let key = r.key
    if (r.read) {
      const item = lib.items.get(r.read)
      if (!item && lib.ready) { toast('That article isn’t on your shelf.', { kind: 'bad' }); history.replaceState({}, '', listKey); return show() }
      key = pages.has(listKey) ? listKey : (item && item.state === 'archived' ? '/archive' : '/')
    } else listKey = key
    const p = page(key)
    if (active !== p) {
      fill(listCol, p.el)
      active = p
    }
    p.show()
    for (const a of [...sideLinks, ...tabbar.children]) a.classList.toggle('is-on', a.dataset.path === key)
    for (const a of sideTags.querySelectorAll('.side-item')) a.classList.toggle('is-on', a.dataset.path === key)
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
  const linkIn = (e) => e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'text/uri-list' || t === 'text/plain')
  document.addEventListener('dragenter', (e) => { if (!root.isConnected || !linkIn(e)) return; dragDepth++; drop.classList.add('is-on') })
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('is-on') } })
  document.addEventListener('dragover', (e) => { if (root.isConnected && linkIn(e)) e.preventDefault() })
  document.addEventListener('drop', (e) => {
    if (!root.isConnected) return
    dragDepth = 0
    drop.classList.remove('is-on')
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
      ? { full: pending.full || change.full, marks: pending.marks || change.marks, review: pending.review || change.review, item: change.item || pending.item }
      : { full: change.full, marks: change.marks, review: change.review, item: change.item }
    requestAnimationFrame(() => {
      if (!pending) return
      const c = pending
      pending = null
      if (active) active.change(c)
      for (const [key, p] of pages) if (p !== active && p.stale !== true) p.stale = true
      counts()
      markCursor()
    })
  })

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
