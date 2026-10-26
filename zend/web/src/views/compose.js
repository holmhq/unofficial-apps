// A new text: pick up to ten people (names you've given, or any number),
// write, send. One person opens their conversation; several stay here with
// a note of how it went.

import { h, fill, ic, avatar, toast, wide, nope, haptic } from '../ui.js'
import { store, addSent } from '../store.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { composer } from '../composer.js'
import { sound } from '../sound.js'
import { go, back, accountButton } from '../main.js'
import { label } from './list.js'
import * as api from '../api.js'

const MAX = 10

export function compose(params) {
  const chosen = []
  const chips = h('span', { style: { display: 'contents' } })
  const input = h('input', { type: 'text', inputmode: 'tel', id: 'to', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Name or number', 'aria-label': 'Add a name or number' })
  const to = h('div.to', h('label', { for: 'to' }, 'To:'), chips, input)
  const rows = h('div.rows')
  const head = h('div.suggest-label')
  const panel = h('div.panel', head, rows)

  const box = composer({
    numbers: () => current(),
    placeholder: 'Text Message',
    send: async (payload) => {
      const numbers = current()
      const result = await api.post('/api/messages', { to: numbers, ...payload })
      addSent(result)
      if (numbers.length === 1) {
        go(`/t/${encodeURIComponent(result.messages[0].number)}`, { replace: true })
      } else {
        toast(`Sent to ${numbers.length} people`)
        go('/', { replace: true })
      }
    }
  })

  // Who it goes to: the chips, or a number still being typed.
  function current() {
    const typed = normalizePhone(input.value)
    return typed && !chosen.includes(typed) && chosen.length < MAX ? [...chosen, typed] : [...chosen]
  }

  function name(n) {
    const t = (store.threads || []).find(x => x.number === n)
    return t ? label(t) : formatPhone(n)
  }

  // Chips are kept by number, so only a new one pops in.
  const chipFor = new Map()
  function drawChips() {
    fill(chips, chosen.map(n => {
      if (!chipFor.has(n)) chipFor.set(n, h('span.chip', name(n), h('button', { type: 'button', 'aria-label': `Remove ${name(n)}`, onclick: () => { chosen.splice(chosen.indexOf(n), 1); chipFor.delete(n); changed(); input.focus() } }, ic('x', 14, 2.6))))
      return chipFor.get(n)
    }))
  }

  function add(n) {
    if (!n) return false
    if (chosen.length >= MAX) { toast(`Up to ${MAX} people in one text. More than that is bulk.`, { kind: 'bad' }); sound.error(); return false }
    if (!chosen.includes(n)) chosen.push(n)
    input.value = ''
    haptic(5)
    changed()
    return true
  }

  function tryAdd() {
    const raw = input.value.trim()
    if (!raw) return
    const known = (store.threads || []).find(t => label(t).toLowerCase() === raw.toLowerCase())
    const n = known ? known.number : normalizePhone(raw)
    if (!n) { sound.error(); nope(to); toast('That isn’t a phone number. Start with + for a number outside India.', { kind: 'bad' }); return }
    add(n)
  }

  input.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ',' || event.key === ';') && input.value.trim()) { event.preventDefault(); tryAdd() }
    else if (event.key === 'Backspace' && !input.value && chosen.length) { chipFor.delete(chosen.pop()); changed() }
    else if (event.key === 'ArrowDown') { const first = rows.querySelector('.row'); first && first.focus(); event.preventDefault() }
  })
  input.addEventListener('input', () => { drawSuggest(); box.refresh() })
  input.addEventListener('blur', () => { if (normalizePhone(input.value)) setTimeout(() => { if (document.activeElement !== input && normalizePhone(input.value)) tryAdd() }, 120) })

  function changed() {
    drawChips()
    drawSuggest()
    box.refresh()
  }

  function drawSuggest() {
    const q = input.value.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    const typed = normalizePhone(input.value)
    const list = (store.threads || []).filter(t => !chosen.includes(t.number) && t.last &&
      (!q || label(t).toLowerCase().includes(q) || (digits.length > 1 && t.number.includes(digits))))
    head.textContent = q ? (list.length || typed ? 'Matches' : '') : (list.length ? 'Recent' : '')
    const out = []
    if (typed && !chosen.includes(typed) && !list.some(t => t.number === typed)) {
      out.push(h('button.row', { type: 'button', onclick: () => { add(typed); input.focus() } },
        avatar({ key: typed, name: '' }),
        h('span.body', h('span.top', h('span.name.num', formatPhone(typed))), h('span.bottom', h('span.preview', 'Text this number')))))
    }
    for (const t of list.slice(0, 30)) {
      out.push(h('button.row', { type: 'button', onclick: () => { add(t.number); input.focus() } },
        avatar({ key: t.number, name: t.name }),
        h('span.body', h('span.top', h('span.name.trunc', label(t))), h('span.bottom', h('span.preview.num', t.name ? formatPhone(t.number) : 'No name')))))
    }
    if (!out.length && q && !typed) out.push(h('div.list-empty', 'Type a full number, like 98450 11223 or +44 7700 900123.'))
    fill(rows, out)
  }

  if (params.to) {
    for (const raw of params.to.split(',')) { const n = normalizePhone(raw); if (n && !chosen.includes(n)) chosen.push(n) }
  }
  drawChips()
  drawSuggest()
  setTimeout(() => (chosen.length ? box.focus() : input.focus({ preventScroll: true })), wide() ? 30 : 460)

  const bar = h('header.bar.glass',
    h('button.back.only-narrow', { type: 'button', 'aria-label': 'Back to chats', onclick: back }, ic('back', 28, 2.2), 'Chats'),
    h('span.small-title', { style: { opacity: 1, transform: 'none' } }, 'New text'),
    h('span.right', h('span.only-wide', accountButton())))
  return { el: h('div', { style: { display: 'contents' } }, bar, to, panel, box.el) }
}
