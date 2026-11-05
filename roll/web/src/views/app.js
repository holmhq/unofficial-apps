// The signed-in app: a frosted top bar, a sidebar of places on a desk and a tab bar on a
// phone, and the pages, each kept alive with its scroll while you're elsewhere.
//
//   /                library        /albums          albums
//   /favorites       favourites     /albums/<id>     one album
//   /places          places         /places/<name>   one place
//   /trash           the Trash      /search?q=       search

import { h, ic, haptic, toast, menu, confirm, reduced, closeMenus, fill } from '../ui.js'
import { mark, heartFill } from '../icons.js'
import { lib, on, timeline, favorites, trash, inAlbum, atPlace, albums, places, memories, search, suggestions, emptyTrash, updateAlbum, deleteAlbum, change, photoURL } from '../store.js'
import { go, link, accountButton, credit, usage, mcpSheet, favorite, toTrash, restore, deleteForGood, albumPicker, download, askName, shareSheet, removeFromAlbum, failure, plural, viewerActions } from '../shell.js'
import { photosPage, emptyState } from './photos.js'
import { memoryStrip, playMemory } from '../memories.js'
import { pickFiles, acceptDrops } from '../upload.js'
import { placeholder, createGrid, Selection } from '../grid.js'
import { range, count, bytes } from '../time.js'
import { closeViewer, viewerOpen, refreshViewer, openViewer } from '../viewer.js'

const PLACES = [
  { path: '/', label: 'Library', icon: 'images' },
  { path: '/favorites', label: 'Favorites', icon: 'heart' },
  { path: '/albums', label: 'Albums', icon: 'bookImage' },
  { path: '/places', label: 'Places', icon: 'mapPin' },
  { path: '/trash', label: 'Trash', icon: 'trash2' }
]
const TABS = [
  { path: '/', label: 'Library', icon: 'images' },
  { path: '/favorites', label: 'Favorites', icon: 'heart' },
  { path: '/albums', label: 'Albums', icon: 'bookImage' },
  { path: '/search', label: 'Search', icon: 'search' }
]
const isPhone = () => innerWidth < 760

export function createApp() {
  const pages = new Map()
  let active = null
  let unSelect = null

  /* ---- Bars --------------------------------------------------------------------- */

  const brand = h('a.brand', { href: '/', 'aria-label': 'Roll, your library', onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/') } },
    h('span.brand-mark', mark(17)), h('span.brand-name', 'Roll'))
  const sideBtn = h('button.icon-btn.side-btn', { type: 'button', 'aria-label': 'Hide sidebar', title: 'Hide sidebar', onclick: () => toggleSide() }, ic('panelLeft', 20, 1.9))
  const backBtn = h('button.icon-btn.top-back', { type: 'button', 'aria-label': 'Back', onclick: () => back() }, ic('chevronLeft', 24, 2.2))
  const smallTitle = h('div.top-title.small-title')
  const searchInput = h('input.search-input', { type: 'search', placeholder: 'Search places, cameras, months…', 'aria-label': 'Search your photos', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' })
  const searchBox = h('label.top-search', ic('search', 17, 2.1), searchInput)
  const uploadBtn = h('button.btn.primary.upload-btn', { type: 'button', onclick: () => pickFiles(currentAlbum() ? currentAlbum().id : null) }, ic('upload', 17, 2.2), h('span', 'Upload'))
  const addBtn = h('button.icon-btn.add-btn', { type: 'button', 'aria-label': 'Add photos', onclick: () => pickFiles(currentAlbum() ? currentAlbum().id : null) }, ic('plus', 24, 2.2))
  const selectBtn = h('button.btn.plain.select-btn', { type: 'button', onclick: () => startSelecting() }, 'Select')
  const top = h('header.top.glass',
    h('div.top-l', sideBtn, backBtn, brand, selectBtn),
    smallTitle,
    searchBox,
    h('div.top-r', uploadBtn, addBtn, accountButton()))

  const selCount = h('b.sel-count')
  const selActions = h('div.sel-actions')
  const selbar = h('div.selbar.glass',
    h('button.icon-btn', { type: 'button', 'aria-label': 'Clear selection', title: 'Clear selection (Esc)', onclick: () => active && active.selection.clear() }, ic('x', 22, 2.2)),
    selCount, h('button.btn.plain.sel-all', { type: 'button', onclick: () => selectAll() }, 'Select all'), h('span.grow'), selActions)

  const sideLinks = PLACES.map((x) => link(x.path, { class: 'side-item', 'data-path': x.path }, ic(x.icon, 19, 1.9), h('span.grow', x.label), h('span.side-count.num')))
  const sideUsage = h('div.side-usage')
  const side = h('nav.side', { 'aria-label': 'Roll' }, h('div.side-list', sideLinks), h('div.side-albums'), h('div.side-foot', sideUsage, credit()))
  const tabbar = h('nav.tabbar', { 'aria-label': 'Sections' }, TABS.map((x) => link(x.path, { class: 'tab', 'data-path': x.path }, ic(x.icon, 25, 1.8), h('span', x.label))))
  const actbar = h('nav.actbar.glass', { 'aria-label': 'Selected photos' })
  const main = h('main.main')
  const root = h('div.app', top, selbar, h('div.body', side, main), tabbar, actbar)

  // The sidebar hides with one click on a desk, and stays as it was left.
  function toggleSide(hidden = !root.classList.contains('is-side-hidden')) {
    root.classList.toggle('is-side-hidden', hidden)
    sideBtn.setAttribute('aria-label', hidden ? 'Show sidebar' : 'Hide sidebar')
    sideBtn.title = hidden ? 'Show sidebar' : 'Hide sidebar'
    try { localStorage.setItem('roll:side', hidden ? 'hidden' : 'shown') } catch {}
  }
  try { if (localStorage.getItem('roll:side') === 'hidden') toggleSide(true) } catch {}

  /* ---- Pages ----------------------------------------------------------------------- */

  function parse(path) {
    const p = decodeURIComponent(path.replace(/\/+$/, '') || '/')
    if (p === '/' || p === '/favorites' || p === '/albums' || p === '/places' || p === '/trash' || p === '/search') return { key: p }
    let m = /^\/albums\/([A-Za-z0-9_-]+)$/.exec(p)
    if (m) return { key: '/albums/' + m[1], album: m[1] }
    m = /^\/places\/(.+)$/.exec(p)
    if (m) return { key: '/places/' + m[1], place: m[1] }
    return { key: '/', missing: p !== '/' }
  }

  function make(r) {
    if (r.key === '/') return libraryPage()
    if (r.key === '/favorites') return photosPage({
      key: 'favorites', title: 'Favorites', source: favorites, small: (l) => l.length ? count(l.length, 'photo') : null,
      empty: () => emptyState({ icon: 'heart', title: 'No favorites yet', text: 'Tap the heart on a photo you love and it shows up here.' })
    })
    if (r.key === '/trash') return trashPage()
    if (r.key === '/albums') return albumsPage()
    if (r.key === '/places') return placesPage()
    if (r.key === '/search') return searchPage()
    if (r.album) return albumPage(r.album)
    if (r.place) return photosPage({
      key: 'place', title: r.place.split(',')[0], source: () => atPlace(r.place), small: (l) => [r.place.split(',').slice(1).join(',').trim(), l.length ? count(l.length, 'photo') : null, l.length ? range(l[l.length - 1].taken, l[0].taken) : null].filter(Boolean).join(' · '),
      empty: () => emptyState({ icon: 'mapPin', title: 'No photos here any more', text: 'Photos from this place were moved to the Trash.' })
    })
  }

  function libraryPage() {
    let stripKey = ''
    let strip = null
    const page = photosPage({
      key: 'library', title: 'Library', source: timeline,
      before: () => {
        const list = memories()
        const key = list.map((m) => m.key + m.photos.length).join()
        if (key !== stripKey) { stripKey = key; strip = list.length ? memoryStrip(list, { onOpen: (m, card) => playMemory(m, card) }) : null }
        return strip
      },
      empty: () => lib.ready ? h('div.welcome',
        h('div.welcome-art', [0, 1, 2].map((i) => h('span', { style: { '--i': i } }, ic('image', 26, 1.5)))),
        h('h2', 'Bring your photos home'),
        h('p', 'Drop photos anywhere on this page, or choose them. Roll reads the date, camera and place from each one and keeps the original.'),
        h('button.btn.primary.large', { type: 'button', onclick: () => pickFiles() }, ic('upload', 18, 2.2), 'Choose photos'),
        h('small', isPhone() ? 'Photos from your camera roll keep their dates and places.' : 'Tip: paste a photo with ⌘V or Ctrl+V.')) : skeleton()
    })
    return page
  }

  function skeleton() {
    return h('div.skeleton', [0, 1, 2].map(() => h('div.sk-row', [3, 2, 4].map((n) => h('i', { style: { flex: n } })))))
  }

  function trashPage() {
    const days = (p) => {
      const left = Math.max(0, 30 - Math.floor((Date.now() - p.trashed) / 86400000))
      return left <= 1 ? '1 day' : `${left} days`
    }
    return photosPage({
      key: 'trash', title: 'Trash', source: trash, context: 'trash', group: 'none', months: false, badge: days,
      small: (l) => l.length ? 'Photos stay here for 30 days, then they’re deleted for good.' : null,
      head: () => trash().length ? [h('button.btn.danger-quiet', { type: 'button', onclick: async () => {
        const n = trash().length
        const ok = await confirm({ title: `Delete ${plural(n)} for good?`, text: 'Everything in the Trash is removed from this server, originals too. This can’t be undone.', action: 'Empty Trash' })
        if (!ok) return
        try { await emptyTrash(); toast('Trash emptied') } catch (e) { failure(e) }
      } }, 'Empty Trash')] : [],
      empty: () => emptyState({ icon: 'trash2', title: 'The Trash is empty', text: 'Photos you delete wait here for 30 days, so you can change your mind.' })
    })
  }

  function albumPage(id) {
    const album = () => lib.albums.get(id)
    const page = photosPage({
      key: 'album', album, context: 'album',
      title: () => (album() ? album().title : 'Album'),
      source: () => inAlbum(id),
      small: (l) => {
        const a = album()
        const parts = [l.length ? count(l.length, 'photo') : null, l.length ? range(l[l.length - 1].taken, l[0].taken) : null].filter(Boolean)
        return h('span.sub-line', parts.join(' · '), a && a.share ? h('button.pill', { type: 'button', onclick: () => shareSheet(id) }, ic('link', 12, 2.4), 'Shared') : null)
      },
      head: () => album() ? [
        h('button.btn', { type: 'button', onclick: () => pickPhotos(album()) }, ic('imagePlus', 17, 2), h('span', 'Add photos')),
        h('button.btn', { type: 'button', onclick: () => shareSheet(id) }, ic('share', 17, 2), h('span', 'Share')),
        h('button.icon-btn.is-soft', { type: 'button', 'aria-label': 'More', onclick: (e) => menu(e.currentTarget, [
          { label: 'Rename', icon: 'pencil', onclick: async () => { const t = await askName({ title: 'Rename album', value: album().title, action: 'Save' }); if (t) updateAlbum(id, { title: t }).catch(failure) } },
          { label: 'Add from this device', icon: 'upload', onclick: () => pickFiles(id) },
          { label: 'Download all', icon: 'download', onclick: () => download(inAlbum(id)) },
          'sep',
          { label: 'Delete album', icon: 'trash2', danger: true, onclick: async () => {
            const ok = await confirm({ title: `Delete “${album().title}”?`, text: 'The album goes, and its link stops working. The photos stay in your library.', action: 'Delete album' })
            if (!ok) return
            go('/albums', { replace: true })
            deleteAlbum(id).then(() => toast('Album deleted')).catch(failure)
          } }
        ], { align: 'end' }) }, ic('ellipsis', 20, 2.2))
      ] : [],
      empty: () => album() ? emptyState({ icon: 'imagePlus', title: 'This album is empty', text: 'Add photos from your library, or drop new ones here.', action: h('button.btn.primary', { type: 'button', onclick: () => pickPhotos(album()) }, 'Add photos') })
        : emptyState({ icon: 'bookImage', title: 'This album is gone', text: 'It was deleted, or it was never yours.', action: link('/albums', { class: 'btn' }, 'See albums') })
    })
    return page
  }

  // Pick photos from the library to add to an album.
  function pickPhotos(album) {
    const selection = new Selection()
    selection.active = true
    const panel = h('div.panel')
    const addBtn2 = h('button.btn.primary', { type: 'button', disabled: true }, 'Add')
    const head = h('div.picker-head.glass', h('button.btn.plain', { type: 'button', onclick: () => close() }, 'Cancel'), h('b.trunc', 'Add to ' + album.title), addBtn2)
    const already = new Set(inAlbum(album.id).map((p) => p.id))
    const list = timeline().filter((p) => !already.has(p.id))
    const grid = createGrid({ panel, selection, onOpen: (p) => selection.toggle(p.id) })
    panel.append(grid.el, h('div.page-end'))
    selection.emit()
    const root2 = h('div.picker', head, h('div.picker-body', panel, grid.scrub))
    document.body.append(root2)
    requestAnimationFrame(() => { root2.classList.add('is-open'); grid.set(list) })
    if (!list.length) panel.prepend(emptyState({ icon: 'images', title: 'Everything is in this album', text: 'Upload more photos to add them.' }))
    selection.on(() => {
      addBtn2.disabled = !selection.size
      addBtn2.textContent = selection.size ? `Add ${selection.size}` : 'Add'
    })
    addBtn2.addEventListener('click', async () => {
      const ids = selection.list()
      close()
      try { await change(ids, 'add', album.id); toast(`Added ${plural(ids.length)} to ${album.title}`) } catch (e) { failure(e) }
    })
    const onKey = (e) => { if (e.key === 'Escape' && !viewerOpen()) close() }
    document.addEventListener('keydown', onKey)
    function close() {
      document.removeEventListener('keydown', onKey)
      root2.classList.remove('is-open')
      setTimeout(() => { grid.destroy(); root2.remove() }, 420)
    }
  }

  function albumsPage() {
    const panel = h('div.panel')
    const head = h('header.page-head', h('div.page-title', h('h1.large-title', 'Albums')))
    const cards = h('div.cards')
    const more = h('div.more.phone-only')
    panel.append(head, cards, more, h('div.phone-only.page-credit', credit()), h('div.page-end'))
    const el = h('section.page', { 'data-page': 'albums' }, panel)
    const page = { el, panel, selection: new Selection(), dirty: true, title: 'Albums' }
    page.draw = () => {
      if (el.hidden) { page.dirty = true; return }
      page.dirty = false
      const list = albums()
      cards.replaceChildren(...list.map((a) => card({
        href: '/albums/' + a.id, photo: a.coverPhoto, title: a.title,
        sub: [a.count ? count(a.count, 'photo') : 'Empty'].join(''), badge: a.share ? ic('link', 13, 2.4) : null
      })), h('button.card.is-new', { type: 'button', onclick: () => newAlbum() }, h('span.card-cover', ic('plus', 30, 1.6)), h('span.card-title', 'New album'), h('span.card-sub', ' ')))
      const t = trash().length
      more.replaceChildren(h('h2.section-title', 'More'), h('div.group',
        moreRow('/favorites', 'heart', 'Favorites', favorites().length),
        moreRow('/places', 'mapPin', 'Places', places().length),
        moreRow('/trash', 'trash2', 'Trash', t)))
    }
    page.show = () => { el.hidden = false; if (page.dirty) page.draw() }
    page.hide = () => { el.hidden = true }
    page.collapse = null
    return page
  }

  const moreRow = (path, icon, label, n) => link(path, { class: 'row' }, h('span.row-ic', ic(icon, 18, 2)), h('span.grow', label), h('span.row-value.num', n ? n.toLocaleString() : ''), ic('chevronRight', 17, 2.2))

  function card({ href, photo, title, sub, badge = null }) {
    const cover = h('span.card-cover', photo ? { style: { 'background-image': `url(${placeholder(photo.th) || ''})` } } : {})
    if (photo) {
      const img = h('img', { src: photoURL(photo, 't'), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' })
      img.onload = () => img.classList.add('is-in')
      if (img.complete && img.naturalWidth) img.classList.add('is-in')
      cover.append(img)
    } else cover.append(ic('image', 30, 1.5))
    if (badge) cover.append(h('span.card-badge', badge))
    return link(href, { class: 'card' }, cover, h('span.card-title.trunc', { title }, title), h('span.card-sub', sub))
  }

  async function newAlbum(ids = []) {
    const title = await askName({ title: 'New album', action: 'Create' })
    if (!title) return
    try {
      const { createAlbum } = await import('../store.js')
      const a = await createAlbum(title, ids)
      go('/albums/' + a.id)
    } catch (e) { failure(e) }
  }

  function placesPage() {
    const panel = h('div.panel')
    const head = h('header.page-head', h('div.page-title', h('h1.large-title', 'Places'), h('p.page-sub')))
    const cards = h('div.cards')
    const empty = h('div.page-empty', { hidden: true }, emptyState({ icon: 'mapPin', title: 'No places yet', text: 'Photos with a location show up here, named after the nearest town or city.' }))
    panel.append(head, cards, empty, h('div.page-end'))
    const el = h('section.page', { 'data-page': 'places' }, panel)
    const page = { el, panel, selection: new Selection(), dirty: true, title: 'Places' }
    page.draw = () => {
      if (el.hidden) { page.dirty = true; return }
      page.dirty = false
      const list = places()
      head.querySelector('.page-sub').textContent = list.length ? count(list.length, 'place') : ''
      cards.replaceChildren(...list.map((p) => card({ href: '/places/' + encodeURIComponent(p.name), photo: p.cover, title: p.name.split(',')[0], sub: [p.name.split(',').slice(1).join(',').trim(), count(p.count, 'photo')].filter(Boolean).join(' · ') })))
      empty.hidden = list.length > 0
    }
    page.show = () => { el.hidden = false; if (page.dirty) page.draw() }
    page.hide = () => { el.hidden = true }
    return page
  }

  function searchPage() {
    let query = ''
    const field = h('input.field.search-field', { type: 'search', placeholder: 'Places, cameras, months, albums', 'aria-label': 'Search your photos', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' })
    field.addEventListener('input', () => setQuery(field.value, true))
    const fieldBox = h('label.search-box.phone-only', ic('search', 18, 2.1), field)
    const sugg = h('div.suggest')
    const page = photosPage({
      key: 'search', title: () => (query ? `“${query}”` : 'Search'), group: 'day',
      source: () => (query ? search(query) : []),
      small: (l) => (query ? (l.length ? count(l.length, 'photo') : null) : null),
      before: () => h('div', fieldBox, query ? null : suggestions_()),
      empty: () => query ? emptyState({ icon: 'search', title: 'Nothing found', text: 'Try a place, a camera, a month like “june”, a year, or words like “portrait”, “night” or “favorite”.' }) : h('span')
    })
    function suggestions_() {
      const s = suggestions()
      const chip = (label, q = label) => h('button.chip', { type: 'button', onclick: () => setQuery(q) }, label)
      const rowOf = (title, items) => items.length ? h('div.chip-group', h('h2.section-title', title), h('div.chip-row', items)) : null
      fill(sugg,
        rowOf('Places', s.places.map((p) => chip(p))),
        rowOf('Years', s.years.map((y) => chip(y))),
        rowOf('Cameras', s.cameras.map((c) => chip(c))),
        rowOf('Albums', albums().slice(0, 8).map((a) => chip(a.title))),
        rowOf('Try', ['Favorites', 'Portrait', 'Panorama', 'Morning', 'Night', 'Summer'].map((w) => chip(w, w.toLowerCase()))))
      return sugg
    }
    let timer = 0
    function setQuery(q, typing = false) {
      query = q.trim()
      if (field.value !== q && document.activeElement !== field) field.value = q
      if (searchInput.value !== q && document.activeElement !== searchInput) searchInput.value = q
      clearTimeout(timer)
      timer = setTimeout(() => {
        const url = '/search' + (query ? '?q=' + encodeURIComponent(query) : '')
        if (location.pathname + location.search !== url) history.replaceState({}, '', url)
        page.draw(true)
        if (!typing) page.panel.scrollTop = 0
      }, typing ? 140 : 0)
    }
    page.setQuery = setQuery
    page.focus = () => { if (isPhone()) setTimeout(() => field.focus({ preventScroll: true }), 50) }
    return page
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value
    if (!location.pathname.startsWith('/search')) go('/search' + (q ? '?q=' + encodeURIComponent(q) : ''))
    const page = pages.get('/search')
    if (page) page.setQuery(q, true)
  })
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchInput.value = ''; searchInput.blur(); if (location.pathname.startsWith('/search')) back() } })

  /* ---- Selection ------------------------------------------------------------------------ */

  function startSelecting() {
    if (!active || !active.grid) return
    active.selection.active = true
    active.selection.emit()
  }

  function selectAll() {
    if (!active || !active.list) return
    const all = active.list.map((p) => p.id)
    const every = all.length && all.every((id) => active.selection.has(id))
    if (every) active.selection.clear()
    else active.selection.set(all, true)
  }

  function drawSelection() {
    const s = active && active.selection
    const n = s ? s.size : 0
    const picking = n > 0 || (s && s.active)
    root.classList.toggle('is-picking', !!picking)
    if (!picking) return
    selCount.textContent = n ? `${n.toLocaleString()} selected` : 'Select photos'
    const ids = s.list()
    const context = active.spec && active.spec.context
    const btn = (icon, label, fn, cls = '') => h('button.icon-btn' + cls, { type: 'button', 'aria-label': label, title: label, disabled: !n, onclick: (e) => fn(e.currentTarget) }, typeof icon === 'string' ? ic(icon, 21, 1.9) : icon)
    let list
    if (context === 'trash') {
      list = [
        h('button.btn.plain', { type: 'button', disabled: !n, onclick: () => restore(ids).then((ok) => ok && s.clear()) }, 'Restore'),
        h('button.btn.plain.is-danger', { type: 'button', disabled: !n, onclick: () => deleteForGood(ids).then((ok) => ok && s.clear()) }, 'Delete')
      ]
    } else {
      const allFav = n && ids.every((id) => (lib.photos.get(id) || {}).fav)
      const album = active.spec && active.spec.album ? active.spec.album() : null
      list = [
        btn(allFav ? heartFill(21) : 'heart', allFav ? 'Remove from Favorites' : 'Add to Favorites', () => favorite(ids, !allFav), allFav ? '.is-on' : ''),
        btn('bookImage', 'Add to album', (anchor) => albumPicker(anchor, ids, { onDone: () => s.clear() })),
        btn('download', 'Download', () => download(ids.map((id) => lib.photos.get(id)).filter(Boolean))),
        album ? btn('circleMinus', `Remove from ${album.title}`, () => removeFromAlbum(ids, album).then((ok) => ok && s.clear())) : null,
        btn('trash2', 'Move to Trash', () => toTrash(ids).then((ok) => ok && s.clear()))
      ]
    }
    const nodes = list.filter(Boolean)
    if (isPhone()) { selActions.replaceChildren(); actbar.replaceChildren(...nodes) }
    else { actbar.replaceChildren(); selActions.replaceChildren(...nodes) }
  }

  /* ---- Showing a page ----------------------------------------------------------------------- */

  function back() {
    if (history.length > 1 && history.state) history.back()
    else go(location.pathname.startsWith('/albums/') ? '/albums' : location.pathname.startsWith('/places/') ? '/places' : '/')
  }

  function currentAlbum() {
    return active && active.spec && active.spec.album ? active.spec.album() : null
  }

  let collapse = null
  function show() {
    if (viewerOpen()) closeViewer()
    closeMenus()
    const r = parse(location.pathname)
    let page = pages.get(r.key)
    if (!page) {
      page = make(r)
      pages.set(r.key, page)
      main.append(page.el)
      page.el.hidden = true
    }
    if (r.key === '/search') {
      const q = new URLSearchParams(location.search).get('q') || ''
      page.setQuery(q)
      searchInput.value = q
    } else if (document.activeElement !== searchInput) searchInput.value = ''
    if (active !== page) {
      if (active) active.hide()
      if (unSelect) unSelect()
      active = page
      page.show()
      unSelect = page.selection.on(drawSelection)
      drawSelection()
      if (r.key === '/search' && page.focus) page.focus()
    } else if (page.dirty) page.draw()
    // Album and place pages that came and went are let go.
    for (const [key, p] of pages) if (p !== page && /^\/(albums|places)\/./.test(key)) { p.el.remove(); pages.delete(key) }
    const sub = r.key.split('/').length > 2
    root.classList.toggle('is-sub', sub)
    for (const a of [...sideLinks, ...tabbar.children]) {
      const path = a.dataset.path
      a.classList.toggle('is-on', path === r.key || (path !== '/' && r.key.startsWith(path + '/')))
    }
    smallTitle.textContent = page.title || ''
    syncSelect()
    top.classList.remove('scrolled')
    if (collapse) collapse.panel.removeEventListener('scroll', collapse.fn)
    const fn = () => {
      const title = page.panel.querySelector('.large-title')
      top.classList.toggle('scrolled', page.panel.scrollTop > (title ? title.offsetTop + title.offsetHeight - 8 : 4))
      smallTitle.textContent = page.title || ''
    }
    page.panel.addEventListener('scroll', fn, { passive: true })
    collapse = { panel: page.panel, fn }
    fn()
    document.title = r.key === '/' ? 'Roll' : `${page.title || 'Roll'} · Roll`
    openLinked()
  }

  function syncSelect() {
    selectBtn.hidden = !active || !active.grid || !(active.list && active.list.length)
  }

  function drawSide() {
    const counts = { '/favorites': favorites().length, '/trash': trash().length, '/': timeline().length, '/albums': lib.albums.size, '/places': places().length }
    for (const a of sideLinks) a.querySelector('.side-count').textContent = counts[a.dataset.path] ? counts[a.dataset.path].toLocaleString() : ''
    sideUsage.replaceChildren(lib.ready ? usage() : '')
  }

  // ?photo=<id>, as Claude's links have it: that photo in the viewer, once the library has it.
  function openLinked() {
    const id = new URLSearchParams(location.search).get('photo')
    if (!id || viewerOpen()) return
    const p = lib.photos.get(id)
    if (!p) return
    const url = new URL(location.href)
    url.searchParams.delete('photo')
    history.replaceState({}, '', url.pathname + url.search)
    const list = p.trashed ? trash() : active && active.list && active.list.includes(p) ? active.list : timeline()
    openViewer({ list, index: list.indexOf(p), actions: viewerActions(), context: p.trashed ? 'trash' : 'library' })
  }

  on(() => {
    for (const page of pages.values()) page.draw()
    drawSide()
    drawSelection()
    refreshViewer()
    syncSelect()
    if (active) smallTitle.textContent = active.title || ''
    openLinked()
  })

  acceptDrops(() => currentAlbum(), () => !document.querySelector('.layer, .picker'))

  // ⌘K: a place, an album or something to do, by typing a few letters of it.
  let palette = null
  function openPalette() {
    if (palette) { palette.close(); return }
    const opener = document.activeElement
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
      { label: 'Search', icon: 'search', hint: '/', run: () => go('/search') },
      { label: 'Upload photos', icon: 'upload', run: () => pickFiles(currentAlbum() ? currentAlbum().id : null) },
      active && active.grid && active.list && active.list.length ? { label: 'Select photos', icon: 'squareCheck', run: () => startSelecting() } : null,
      { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet() },
      ...albums().map((a) => ({ label: a.title, icon: 'bookImage', hint: 'Album', run: () => go('/albums/' + a.id) })),
      ...places().slice(0, 40).map((x) => ({ label: x.name.split(',')[0], icon: 'mapPin', hint: 'Place', run: () => go('/places/' + encodeURIComponent(x.name)) }))
    ].filter(Boolean)
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
      const all = commands()
      shown = q ? all.map((c) => ({ ...c, s: score(c.label, q) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 12) : all.slice(0, 12)
      if (q) shown.push({ label: 'Search for “' + input.value.trim() + '”', icon: 'search', run: () => go('/search?q=' + encodeURIComponent(input.value.trim())) })
      at = Math.min(at, Math.max(0, shown.length - 1))
      fill(list, shown.length ? shown.map((c, n) => h('button.pal-item' + (n === at ? '.is-on' : ''), { type: 'button', role: 'option', onpointermove: () => { if (at !== n) { at = n; markAt() } }, onclick: () => pick(c) }, h('span.pal-ic', ic(c.icon, 16, 2)), h('span.grow.trunc', c.label), c.hint ? h('small.trunc', c.hint) : null)) : h('div.pal-none', 'Nothing matches'))
    }
    const markAt = () => [...list.children].forEach((el, n) => el.classList.toggle('is-on', n === at))
    // Keeps the chosen row in view by scrolling the list itself; scrollIntoView would move the shell too.
    function reveal() {
      const el = list.children[at]
      if (!el) return
      const r = el.getBoundingClientRect()
      const frame = list.getBoundingClientRect()
      if (r.top < frame.top + 6) list.scrollTop -= frame.top + 6 - r.top
      else if (r.bottom > frame.bottom - 6) list.scrollTop += r.bottom - frame.bottom + 6
    }
    function pick(c) { close(); setTimeout(() => c.run(), 0) }
    function close() {
      layer.classList.remove('is-in'); setTimeout(() => layer.remove(), 180); palette = null; document.removeEventListener('keydown', onKey, true)
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); markAt(); reveal() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); markAt(); reveal() }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); close() }
    }
    document.addEventListener('keydown', onKey, true)
    input.addEventListener('input', () => { at = 0; draw() })
    draw()
    palette = { close }
  }

  document.addEventListener('keydown', (e) => {
    if (viewerOpen() || document.querySelector('.layer, .picker, .story, .pal-layer')) return
    if (root.isConnected && (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); return }
    const typing = e.target.closest && e.target.closest('input, textarea')
    if (e.key === 'Escape' && active && (active.selection.size || active.selection.active)) active.selection.clear()
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !typing && active && active.list) { e.preventDefault(); active.selection.set(active.list.map((p) => p.id), true) }
    else if (e.key === '/' && !typing && !isPhone()) { e.preventDefault(); searchInput.focus() }
  })

  drawSide()
  return { el: root, show }
}
