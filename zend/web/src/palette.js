// ⌘K: a section, a conversation or something to do, by typing a few letters of it.
// Conversations match by name, number or what was said last.

import { h, fill, ic, $ } from './ui.js'
import { store } from './store.js'
import { formatPhone } from './sms.js'

let open = null

const score = (text, q) => {
  const t = String(text || '').toLowerCase()
  if (t.startsWith(q)) return 3
  if (t.includes(' ' + q)) return 2
  if (t.includes(q)) return 1
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 0.5 : 0
}

// commands() gives { label, icon, hint?, run } for the app's places and actions.
export function openPalette(commands) {
  if (open) { open.close(); return }
  const back = document.activeElement
  const input = h('input.pal-field', { type: 'text', placeholder: 'Go to, find or do…', 'aria-label': 'Go to, find or do', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' })
  const list = h('div.pal-list', { role: 'listbox' })
  const box = h('div.pal', { role: 'dialog', 'aria-label': 'Command menu' }, h('div.pal-top', ic('search', 18, 2.1), input, h('kbd', 'esc')), list)
  const layer = h('div.pal-layer', { onclick: (e) => { if (e.target === layer) close() } }, box)
  document.body.append(layer)
  requestAnimationFrame(() => layer.classList.add('is-in'))
  input.focus()
  let at = 0
  let shown = []

  function draw() {
    const q = input.value.trim().toLowerCase()
    const cmds = commands().map((c) => ({ ...c, s: q ? score(c.label, q) : 1 })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s)
    const digits = q.replace(/[^\d]/g, '')
    const chats = q ? (store.threads || []).filter((t) => t.last).map((t) => {
      const name = t.name || formatPhone(t.number)
      const s = Math.max(score(name, q), digits.length > 2 && t.number.includes(digits) ? 2 : 0, String(t.last.body || '').toLowerCase().includes(q) ? 0.75 : 0)
      return { label: name, icon: 'chats', hint: t.name ? formatPhone(t.number) : '', s, run: () => import('./main.js').then((m) => m.go('/t/' + encodeURIComponent(t.number))) }
    }).filter((c) => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 6) : []
    shown = [...cmds.filter((c) => c.s >= 2), ...chats, ...cmds.filter((c) => c.s < 2)].slice(0, 12)
    at = Math.min(at, Math.max(0, shown.length - 1))
    fill(list, shown.length
      ? shown.map((c, n) => h('button.pal-item' + (n === at ? '.is-on' : ''), { type: 'button', role: 'option', onpointermove: () => { if (at !== n) { at = n; mark() } }, onclick: () => pick(c) },
          h('span.pal-ic', ic(c.icon, 16, 2)), h('span.grow.trunc', c.label), c.hint ? h('small.trunc', c.hint) : null))
      : h('div.pal-none', 'Nothing matches'))
  }
  const mark = () => [...list.children].forEach((el, n) => el.classList.toggle('is-on', n === at))
  // Keeps the chosen row in view by scrolling the list itself; scrollIntoView would move the shell too.
  function reveal() {
    const el = list.children[at]
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    if (r.top < b.top + 6) list.scrollTop -= b.top + 6 - r.top
    else if (r.bottom > b.bottom - 6) list.scrollTop += r.bottom - b.bottom + 6
  }
  function pick(c) { close(false); setTimeout(() => c.run(), 0) }
  function close(refocus = true) {
    layer.classList.remove('is-in')
    setTimeout(() => layer.remove(), 180)
    open = null
    document.removeEventListener('keydown', onKey, true)
    if (refocus && back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); reveal() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); reveal() }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
  }
  document.addEventListener('keydown', onKey, true)
  input.addEventListener('input', () => { at = 0; draw() })
  draw()
  open = { close }
}

export const paletteOpen = () => !!open || !!$('.pal-layer')
