// Pages that are a grid of photos: the library, favourites, an album, a place, the Trash,
// search results. Each keeps its own scroll, selection and grid alive while you're on
// another page, and redraws only when the library changed.

import { h, ic, collapsing, fill } from '../ui.js'
import { createGrid, Selection } from '../grid.js'
import { openViewer } from '../viewer.js'
import { viewerActions } from '../shell.js'

// spec: { key, title, small?, source(), context, group, months, badge, head(page) → nodes,
//         before(page) → node, empty(page) → node, album() → album or null }
export function photosPage(spec) {
  const selection = new Selection()
  const panel = h('div.panel')
  const head = h('header.page-head')
  const before = h('div.page-before')
  const empty = h('div.page-empty', { hidden: true })
  const el = h('section.page', { 'data-page': spec.key }, panel)
  const page = { el, panel, selection, spec, dirty: true, list: [] }
  const grid = createGrid({
    panel,
    group: spec.group || 'day',
    months: spec.months !== false,
    selection,
    badge: spec.badge || null,
    onOpen: (p, list) => openViewer({ list, index: list.indexOf(p), from: grid, actions: viewerActions({ album: spec.album ? spec.album() : null }), context: spec.context || 'library' })
  })
  page.grid = grid
  panel.append(head, before, grid.el, empty, h('div.page-end'))
  el.append(grid.scrub)

  page.draw = (force = false) => {
    if (!el.isConnected || el.hidden) { page.dirty = true; return }
    page.dirty = false
    const list = spec.source()
    const same = !force && list === page.list
    page.list = list
    const title = typeof spec.title === 'function' ? spec.title() : spec.title
    page.title = title
    fill(head, h('div.page-title', h('h1.large-title', title), spec.small ? h('p.page-sub', spec.small(list)) : null), spec.head ? h('div.page-tools', spec.head(page)) : null)
    if (spec.before) before.replaceChildren(spec.before(page) || '')
    if (!same) grid.set(list)
    empty.hidden = list.length > 0
    if (!list.length && spec.empty) empty.replaceChildren(spec.empty(page))
    if (selection.size) {
      const here = new Set(list.map((p) => p.id))
      for (const id of [...selection.ids]) if (!here.has(id)) selection.ids.delete(id)
      selection.emit()
    }
  }
  page.show = () => {
    el.hidden = false
    if (page.dirty) page.draw()
    requestAnimationFrame(() => grid.relayout())
  }
  page.hide = () => { el.hidden = true; selection.clear() }
  page.collapse = (bar) => collapsing(bar, panel)
  return page
}

// The quiet empty state every page uses: an icon, a line and an action.
export function emptyState({ icon, title, text, action = null }) {
  return h('div.empty', h('span.empty-ic', ic(icon, 30, 1.6)), h('b', title), text ? h('p', text) : null, action)
}
