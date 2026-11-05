// ⌘K: one field to open a tracker, add one, or do what the account menu does.

import { h } from './ui.js'
import { icon } from './icons.js'

let open = null

export function togglePalette(commands) {
  if (open) return open.close()
  const opener = document.activeElement
  const input = h('input', { class: 'pal-field', type: 'text', placeholder: 'Open a tracker, or do…', 'aria-label': 'Open a tracker, or do something', autocomplete: 'off', spellcheck: 'false' })
  const list = h('div', { class: 'pal-list', role: 'listbox' })
  const box = h('div', { class: 'pal', role: 'dialog', 'aria-label': 'Command menu' },
    h('div', { class: 'pal-top' }, icon('search', 18), input, h('kbd', {}, 'esc')), list)
  const layer = h('div', { class: 'pal-layer', onclick: event => { if (event.target === layer) close() } }, box)
  document.body.append(layer)
  requestAnimationFrame(() => layer.classList.add('is-in'))
  input.focus()

  const score = (text, q) => {
    const t = String(text || '').toLowerCase()
    if (t.startsWith(q)) return 3
    if (t.includes(' ' + q)) return 2
    return t.includes(q) ? 1 : 0
  }
  let at = 0
  let shown = []
  function draw() {
    const q = input.value.trim().toLowerCase()
    shown = commands().map(c => ({ ...c, s: q ? score(c.label, q) : 1 })).filter(c => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 12)
    at = Math.min(at, Math.max(0, shown.length - 1))
    list.replaceChildren(...(shown.length
      ? shown.map((c, n) => h('button', {
          class: `pal-item${n === at ? ' is-on' : ''}`, type: 'button', role: 'option',
          onpointermove: () => { if (at !== n) { at = n; mark() } }, onclick: () => pick(c)
        }, h('span', { class: 'pal-ic' }, icon(c.icon, 16)), h('span', { class: 'pal-label' }, c.label), c.hint && h('small', {}, c.hint)))
      : [h('div', { class: 'pal-none' }, 'Nothing matches')]))
  }
  // Keep the highlighted row in view by scrolling the list itself, never the page around it.
  function mark() {
    ;[...list.children].forEach((node, n) => node.classList.toggle('is-on', n === at))
    const row = list.children[at]
    if (!row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 6
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 6
  }
  function pick(c) { close(); setTimeout(() => c.run(), 0) }
  function close() {
    if (!open) return
    open = null
    document.removeEventListener('keydown', onKey, true)
    layer.classList.remove('is-in')
    setTimeout(() => layer.remove(), 180)
    if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (event.key === 'ArrowDown') { event.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); at = Math.max(0, at - 1); mark() }
    else if (event.key === 'Enter') { event.preventDefault(); if (shown[at]) pick(shown[at]) }
  }
  document.addEventListener('keydown', onKey, true)
  input.addEventListener('input', () => { at = 0; draw() })
  draw()
  open = { close }
}
