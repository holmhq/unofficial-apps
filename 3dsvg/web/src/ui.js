// Small DOM helpers: elements, bound controls, dialogs, popovers and toasts.

import { icon } from './icons.js'

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue
    if (key === 'class') el.className = value
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (key in el && typeof value !== 'string') el[key] = value
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, value)
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

// ── Bound controls ──
// Each control reads its value through get() and writes through set(). A
// panel keeps its controls' sync functions, so a design loaded from
// elsewhere refreshes every control in place, without rebuilding the panel
// (which would break a drag in progress).

export function binder() {
  const syncs = []
  const bind = (el, sync) => { syncs.push(sync); sync(); return el }
  return {
    bind,
    sync: () => syncs.forEach(fn => fn()),
    // Shows el only while when() is true.
    showIf: (el, when) => bind(el, () => { el.hidden = !when() })
  }
}

export function slider(b, { label, min, max, step, get, set, format = v => String(v) }) {
  const value = h('span', { class: 'ctl-value' })
  const input = h('input', { type: 'range', min, max, step, 'aria-label': label })
  const paint = () => {
    const v = Number(input.value)
    value.textContent = format(v)
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`)
  }
  input.addEventListener('input', () => { set(Number(input.value)); paint() })
  const row = h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-label' }, label), value), input)
  return b.bind(row, () => { if (document.activeElement !== input || !input.matches(':active')) input.value = get(); paint() })
}

export function toggle(b, { label, get, set }) {
  const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label },
    h('span', { class: 'switch-thumb' }))
  sw.addEventListener('click', () => { set(!get()); sync() })
  const sync = () => sw.setAttribute('aria-checked', String(!!get()))
  const row = h('div', { class: 'ctl-row' }, h('span', { class: 'ctl-label' }, label), sw)
  return b.bind(row, sync)
}

export function choice(b, { label, options, get, set }) {
  const select = h('select', { class: 'select', 'aria-label': label },
    options.map(o => h('option', { value: o.value }, o.label)))
  select.addEventListener('change', () => set(select.value))
  return b.bind(select, () => { select.value = get() })
}

export function colorField(b, { label, get, set, presets }) {
  const input = h('input', { type: 'color', 'aria-label': label })
  const chip = h('span', { class: 'color-chip' })
  const hex = h('span', { class: 'color-hex' })
  input.addEventListener('input', () => { set(input.value); sync() })
  const dots = presets.map(p => {
    const dot = h('button', { class: 'swatch', type: 'button', title: p.name, 'aria-label': p.name, style: { background: p.hex } })
    dot.addEventListener('click', () => { set(p.hex); sync() })
    return dot
  })
  const sync = () => {
    const v = get()
    input.value = v
    chip.style.background = v
    hex.textContent = v
    dots.forEach((d, i) => d.classList.toggle('active', presets[i].hex.toLowerCase() === v.toLowerCase()))
  }
  const el = h('div', { class: 'ctl' },
    h('label', { class: 'color-field' }, input, chip, hex),
    h('div', { class: 'swatches' }, dots))
  return b.bind(el, sync)
}

// An accordion: one open section at a time, or none.
export function accordion() {
  const sections = []
  let open = null
  let onchange = () => {}
  const api = {
    section(id, iconName, title, ...content) {
      const body = h('div', { class: 'section-body' }, ...content)
      const head = h('button', { class: 'section-head', type: 'button', 'aria-expanded': 'false' },
        icon(iconName, 16), h('span', {}, title), h('span', { class: 'chev' }, icon('chevron-down', 16)))
      const el = h('section', { class: 'section' }, head, body)
      head.addEventListener('click', () => api.open(open === id ? null : id))
      sections.push({ id, el, head })
      return el
    },
    open(id) {
      open = id
      for (const s of sections) {
        s.el.classList.toggle('open', s.id === id)
        s.head.setAttribute('aria-expanded', String(s.id === id))
      }
      onchange(id)
    },
    get current() { return open },
    onChange(fn) { onchange = fn }
  }
  return api
}

// A disclosure inside a section ("Advanced", "Transform").
export function disclosure(title, ...content) {
  const body = h('div', { class: 'disclosure-body', hidden: true }, ...content)
  const head = h('button', { class: 'disclosure', type: 'button', 'aria-expanded': 'false' }, icon('chevron-down', 14), title)
  head.addEventListener('click', () => {
    body.hidden = !body.hidden
    head.setAttribute('aria-expanded', String(!body.hidden))
  })
  return h('div', {}, head, body)
}

// ── Dialogs ──
// A centred card on a computer, a sheet from the bottom on a phone. Escape,
// the backdrop or close() put it away and return focus to the opener.

const stack = []

export function dialog({ title, className = '', onclose, wide = false }, ...children) {
  const opener = document.activeElement
  const close = h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Close' }, icon('x', 16))
  const card = h('section', { class: `dialog ${wide ? 'wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabIndex: -1 },
    h('header', { class: 'dialog-head' }, h('h2', {}, title), close),
    h('div', { class: 'dialog-body' }, ...children))
  const overlay = h('div', { class: 'overlay' }, card)
  const entry = {
    el: card,
    close() {
      const i = stack.indexOf(entry)
      if (i < 0) return
      stack.splice(i, 1)
      overlay.classList.add('leaving')
      setTimeout(() => overlay.remove(), 160)
      onclose?.()
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }
  close.addEventListener('click', () => entry.close())
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) entry.close() })
  document.body.append(overlay)
  stack.push(entry)
  ;(card.querySelector('[autofocus]') || card).focus({ preventScroll: true })
  return entry
}

const closeTopDialog = () => {
  if (!stack.length) return false
  stack.at(-1).close()
  return true
}

addEventListener('keydown', e => { if (e.key === 'Escape' && closeTopDialog()) e.stopPropagation() }, true)

// ── Toasts: one line at the bottom, gone after a few seconds ──

let toastTimer = 0
export function toast(message, { tone = '', action = null } = {}) {
  let el = document.getElementById('toast')
  if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el) }
  el.className = `toast show ${tone}`
  el.replaceChildren(h('span', {}, message))
  if (action) el.append(h('button', { class: 'toast-action', type: 'button', onclick: () => { action.run(); el.classList.remove('show') } }, action.label))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 3200)
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  const area = h('textarea', { style: { position: 'fixed', opacity: '0' } })
  area.value = text
  document.body.append(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

export function download(href, filename) {
  const a = h('a', { href, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  download(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const isPhone = () => matchMedia('(max-width: 767px)').matches
