// The conversation list: beside the open conversation on a wide screen, the
// Chats tab on a phone. Rows are kept by number and slide when they move.

import { h, fill, ic, avatar, listWhen, flip, wide, menu, sheet, confirm, toast, collapsing, ago, haptic } from '../ui.js'
import { ticks } from '../icons.js'
import { store, on, loadThreads, emit } from '../store.js'
import { formatPhone, normalizePhone } from '../sms.js'
import { go, accountButton } from '../main.js'
import * as api from '../api.js'

export const label = (t) => (t && t.name) || formatPhone(t.number)

export function list() {
  let folder = 'all'
  let query = ''
  let selected = null

  const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search conversations', autocomplete: 'off', enterkeyhint: 'search' })
  const clear = h('button.clear', { type: 'button', 'aria-label': 'Clear search', hidden: true, onclick: () => { search.value = ''; query = ''; clear.hidden = true; draw(); search.focus() } }, ic('x', 12, 3))
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); clear.hidden = !search.value; draw() })
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { const first = rows.querySelector('.row'); first && first.click() }
    if (event.key === 'Escape') { search.value = ''; query = ''; clear.hidden = true; draw(); search.blur() }
  })
  const searchBox = h('label.search', ic('search', 17, 2.2), search, clear, h('kbd.only-wide', { 'aria-hidden': 'true' }, navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K'))

  const ink = h('span.ink', { 'aria-hidden': 'true' })
  const folders = h('div.folders', { role: 'tablist', 'aria-label': 'Show' }, ink)
  const rows = h('div.rows', { role: 'list' })
  const strip = h('button.phone-strip', { type: 'button', onclick: () => go('/phone') })
  const panel = h('div.panel', h('h1.large-title', 'Chats'), searchBox, folders, rows)
  const compose = h('button.icon-btn', { type: 'button', 'aria-label': 'New text', title: 'New text (N)', onclick: () => newText() }, ic('compose', 23, 1.8))
  const bar = h('header.bar', h('span.small-title', 'Chats'), h('span.right', compose, h('span.only-narrow', accountButton())))
  collapsing(bar, panel)
  const el = h('div', { style: { display: 'contents' } }, bar, panel, strip)

  function newText() {
    if (!store.state || !store.state.phone) { go('/phone'); return }
    go('/new', { state: { fromList: true } })
  }

  function drawFolders() {
    const n = (store.threads || []).filter(t => t.unread).length
    const items = [['all', 'All', 0], ['unread', 'Unread', n]]
    const keep = [...folders.querySelectorAll('.folder')]
    if (keep.length !== items.length) {
      fill(folders, ink, items.map(([id]) => h('button.folder', { type: 'button', role: 'tab', 'data-id': id, onclick: () => { folder = id; draw(); haptic(4) } })))
    }
    for (const b of folders.querySelectorAll('.folder')) {
      const [id, name, count] = items.find(x => x[0] === b.dataset.id)
      b.setAttribute('aria-selected', String(folder === id))
      fill(b, name, count ? h('span.n.num', count) : null)
    }
    requestAnimationFrame(() => {
      const on = folders.querySelector('[aria-selected="true"]')
      if (!on) return
      ink.style.width = (on.offsetWidth - 16) + 'px'
      ink.style.transform = `translateX(${on.offsetLeft + 8}px)`
    })
  }

  function shown() {
    const all = store.threads || []
    return all.filter(t => {
      if (!t.last || !t.last.at) return false
      if (folder === 'unread' && !t.unread && t.number !== selected) return false
      if (!query) return true
      const digits = query.replace(/[^\d+]/g, '')
      return label(t).toLowerCase().includes(query) || (digits.length > 2 && t.number.includes(digits.replace(/^\+/, ''))) || (t.last.body || '').toLowerCase().includes(query)
    })
  }

  function draw() {
    drawFolders()
    drawStrip()
    if (!store.threads) {
      fill(rows, Array.from({ length: 6 }, () => h('div.skeleton-row', h('span.s-av.shimmer'), h('span.s-lines', h('span.shimmer', { style: { height: '14px', width: '42%' } }), h('span.shimmer', { style: { height: '12px', width: '78%' } })))))
      return
    }
    const list = shown()
    flip(rows, () => {
      const keep = new Map([...rows.children].filter(x => x.dataset.key).map(x => [x.dataset.key, x]))
      const next = list.map(t => {
        const row = keep.get(t.number) || h('button.row', { type: 'button', role: 'listitem', 'data-key': t.number })
        if (!row.wired) wire(row)
        drawRow(row, t)
        return row
      })
      rows.replaceChildren(...next)
      if (!list.length) rows.append(emptyNote())
    })
  }

  function emptyNote() {
    if (query) return h('div.list-empty', `No conversation matches “${search.value.trim()}”.`)
    if (folder === 'unread') return h('div.list-empty', 'You’re all caught up.')
    if (!store.state || !store.state.phone) {
      return h('div.empty', { style: { 'padding-top': '56px' } },
        h('span.glyph', ic('phone', 34, 1.6)),
        h('h2', 'Connect your phone'),
        h('p', 'Zend sends texts through the Android phone you already have. Or try a demo phone first.'),
        h('a.btn.primary', { href: '/phone', 'data-link': '' }, 'Get started'))
    }
    return h('div.empty', { style: { 'padding-top': '56px' } },
      h('span.glyph', ic('send', 32, 1.6)),
      h('h2', 'No texts yet'),
      h('p', 'Write your first one. It goes out from your phone, on your number.'),
      h('a.btn.primary', { href: '/new', 'data-link': '' }, ic('compose', 18, 2), 'New text'))
  }

  function drawRow(row, t) {
    const last = t.last
    const out = last.dir === 'out'
    const failed = out && last.state === 'failed'
    const scheduled = out && last.state === 'scheduled'
    const when = h('span.when.num', out && ['queued', 'sent', 'delivered'].includes(last.state) ? ticks(last.state) : null, listWhen(scheduled ? (last.scheduleAt || last.at) : last.at))
    const preview = h('span.preview' + (failed ? '.bad' : ''))
    if (scheduled) preview.append(ic('clock', 15, 2), 'Scheduled: ')
    else if (failed) preview.append(ic('alert', 15, 2), 'Not delivered: ')
    else if (out) preview.append(h('span.you', 'You: '))
    preview.append(last.body || '')
    // A badge pops in only when its count changes, not on every redraw.
    const badgeKey = t.unread ? 'u' + t.unread : failed ? 'f' : t.optedOut ? 'o' : ''
    const still = row.dataset.badge === badgeKey
    row.dataset.badge = badgeKey
    row.classList.toggle('unread', t.unread > 0)
    row.setAttribute('aria-current', String(t.number === selected))
    row.setAttribute('aria-label', `${label(t)}${t.unread ? `, ${t.unread} unread` : ''}: ${last.body || ''}`)
    fill(row,
      avatar({ key: t.number, name: t.name }),
      h('span.body',
        h('span.top', h('span.name.trunc', label(t)), when),
        h('span.bottom', preview,
          t.unread ? h('span.badge.num' + (still ? '.still' : ''), t.unread)
            : failed ? h('span.badge.bad' + (still ? '.still' : ''), ic('bang', 14, 3))
              : t.optedOut ? h('span.tag', 'Opted out') : null)))
  }

  function wire(row) {
    row.wired = true
    row.addEventListener('click', () => {
      const number = row.dataset.key
      if (number === selected && wide()) return
      go(`/t/${encodeURIComponent(number)}`, { state: { fromList: true } })
    })
    row.addEventListener('contextmenu', (event) => { event.preventDefault(); rowMenu(row, { x: event.clientX, y: event.clientY }) })
    let timer = null
    row.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return
      timer = setTimeout(() => { timer = null; haptic(14); rowMenu(row, row) }, 520)
    })
    const cancel = () => { clearTimeout(timer); timer = null }
    row.addEventListener('pointerup', cancel)
    row.addEventListener('pointercancel', cancel)
    row.addEventListener('pointermove', (event) => { if (Math.abs(event.movementY) > 2) cancel() })
  }

  function rowMenu(row, at) {
    const t = (store.threads || []).find(x => x.number === row.dataset.key)
    if (!t) return
    menu(at, [
      { label: 'Open', icon: 'chats', onclick: () => go(`/t/${encodeURIComponent(t.number)}`, { state: { fromList: true } }) },
      { label: t.name ? 'Rename' : 'Add a name', icon: 'pencil', onclick: () => rename(t) },
      { label: 'Copy number', icon: 'copy', onclick: () => navigator.clipboard.writeText(t.number).then(() => toast('Number copied'), () => {}) },
      'sep',
      { label: 'Delete conversation', icon: 'trash', danger: true, onclick: () => remove(t) }
    ], { align: 'start' })
  }

  function drawStrip() {
    const state = store.state
    const p = state && state.phone
    if (!state) { strip.hidden = true; return }
    const online = p && (p.kind === 'demo' || (p.lastSeen && Date.now() - p.lastSeen < 20 * 60000))
    strip.hidden = !wide() && online
    fill(strip,
      h('span.dot' + (!p ? '' : p.kind === 'demo' ? '.demo' : online ? '.on' : '.warn')),
      h('span.grow.trunc', !p ? 'No phone connected' : p.kind === 'demo' ? p.name : online ? `${p.name} · online` : `${p.name} · last seen ${ago(p.lastSeen)}`),
      p ? h('span.num', `${state.usage.texts} of ${state.limits.perDay} today`) : h('span', { style: { color: 'var(--accent-text)', 'font-weight': '600' } }, 'Connect'))
  }

  on((event) => {
    if (event.type === 'threads' || event.type === 'state') draw()
  })
  addEventListener('resize', drawStrip)
  draw()

  return {
    el,
    select(number) {
      selected = number
      for (const row of rows.querySelectorAll('.row')) row.setAttribute('aria-current', String(row.dataset.key === number))
      if (folder === 'unread') draw()
    },
    focusSearch() { search.focus(); search.select() },
    step(delta) {
      const list = [...rows.querySelectorAll('.row')]
      if (!list.length) return
      const i = list.findIndex(r => r.dataset.key === selected)
      const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + delta))]
      go(`/t/${encodeURIComponent(next.dataset.key)}`, { replace: true })
      const p = panel.getBoundingClientRect()
      const r = next.getBoundingClientRect()
      if (r.top < p.top + 100 || r.bottom > p.bottom) panel.scrollBy({ top: r.top - p.top - p.height / 2, behavior: 'smooth' })
    }
  }
}

/* ---- Shared with the conversation's details ----------------------------------- */

export async function rename(t) {
  const input = h('input.input', { type: 'text', value: t.name || '', placeholder: formatPhone(t.number), maxlength: '40', autofocus: true, 'aria-label': 'Name', autocomplete: 'off' })
  const saved = await sheet({
    title: t.name ? 'Rename' : 'Add a name',
    done: 'Save',
    onDone: (close) => close(input.value.trim()),
    body: () => [h('div.group', input), h('p.section-foot', { style: { margin: '-12px 16px 0' } }, `Only you see this name. ${formatPhone(t.number)}`)]
  })
  if (saved === undefined) return
  try {
    const result = await api.patch(`/api/threads/${encodeURIComponent(t.number)}`, { name: saved })
    t.name = result.name
    const open = store.open.get(t.number)
    if (open) open.name = result.name
    emit({ type: 'threads' })
    emit({ type: 'thread', number: t.number })
  } catch (error) {
    toast(error.message, { kind: 'bad' })
  }
}

export async function remove(t) {
  const ok = await confirm({ title: 'Delete this conversation?', text: `Every text with ${label(t)} is removed from Zend. Nothing is deleted on your phone.`, action: 'Delete conversation' })
  if (!ok) return
  try {
    await api.del(`/api/threads/${encodeURIComponent(t.number)}`)
    store.open.delete(t.number)
    if (store.viewing === t.number) go('/', { replace: true })
    await loadThreads()
    toast('Conversation deleted')
  } catch (error) {
    toast(error.message, { kind: 'bad' })
  }
}

export { normalizePhone }
