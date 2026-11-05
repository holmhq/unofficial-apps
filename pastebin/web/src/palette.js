// ⌘K: one field that goes anywhere or does anything the account menu can.
// The list scrolls itself; scrollIntoView would move the fixed shell too.

import { h, icon } from './lib.js'

let open = null

export function togglePalette(commands) {
  if (open) { open.close(); return }
  const back = document.activeElement
  const input = h('input.pal-field', { type: 'text', placeholder: 'Go to or do…', 'aria-label': 'Go to or do', autocomplete: 'off', spellcheck: 'false' })
  const list = h('div.pal-list', { role: 'listbox', 'aria-label': 'Commands' })
  const box = h('div.pal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command menu' },
    h('div.pal-top', icon('search'), input, h('kbd', 'esc')), list)
  const layer = h('div.pal-layer', { onclick: e => { if (e.target === layer) close() } }, box)
  document.body.append(layer)
  requestAnimationFrame(() => layer.classList.add('is-in'))
  input.focus()

  let at = 0
  let shown = []
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
    shown = commands().map(c => ({ ...c, s: q ? score(c.label, q) : 1 })).filter(c => c.s > 0).sort((a, b) => b.s - a.s)
    at = Math.min(at, Math.max(0, shown.length - 1))
    list.replaceChildren(...(shown.length
      ? shown.map((c, n) => h('button.pal-item', {
          type: 'button', role: 'option', class: n === at ? 'is-on' : null, 'aria-selected': String(n === at),
          onpointermove: () => { if (at !== n) { at = n; mark() } },
          onclick: () => pick(c),
        }, h('span.pal-ic', icon(c.icon)), h('span.pal-label', c.label), c.hint ? h('small', c.hint) : null))
      : [h('div.pal-none', 'Nothing matches')]))
  }
  const mark = () => [...list.children].forEach((el, n) => { el.classList.toggle('is-on', n === at); el.setAttribute('aria-selected', String(n === at)) })
  function reveal() {
    const el = list.children[at]
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    if (r.top < b.top + 6) list.scrollTop -= b.top + 6 - r.top
    else if (r.bottom > b.bottom - 6) list.scrollTop += r.bottom - b.bottom + 6
  }
  function pick(c) { close(); setTimeout(() => c.run(), 0) }
  function close() {
    layer.classList.remove('is-in')
    setTimeout(() => layer.remove(), 160)
    open = null
    document.removeEventListener('keydown', onKey, true)
    if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); reveal() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); reveal() }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); close() }
  }
  document.addEventListener('keydown', onKey, true)
  input.addEventListener('input', () => { at = 0; draw() })
  draw()
  open = { close }
}
