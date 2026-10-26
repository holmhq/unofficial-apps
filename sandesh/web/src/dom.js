// Small DOM helpers: an element builder, toasts, sheets (dialogs) and the
// way times and faces are shown.

import { icon } from './icons.js'
import { formatPhone, isLetter } from './sms.js'

// h('button.btn.primary', { onclick }, 'Send') → <button class="btn primary">
export function h(spec, props, ...children) {
  const [tag, ...classes] = spec.split('.')
  const el = document.createElement(tag || 'div')
  if (classes.length) el.className = classes.join(' ')
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props)
    props = null
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
    else if (key === 'html') el.innerHTML = value
    else if (key === 'style' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) {
        if (name.startsWith('--')) el.style.setProperty(name, v)
        else el.style[name] = v
      }
    }
    else if (key in el && key !== 'list' && key !== 'form') el[key] = value
    else el.setAttribute(key, value === true ? '' : value)
  }
  append(el, children)
  return el
}

// Replace an element's children, skipping null and false like h() does
// (the native replaceChildren would print them as text).
export function fill(el, ...children) {
  el.replaceChildren()
  append(el, children)
  return el
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

// An icon as an element, for use inside h().
export function ic(name, size) {
  const span = document.createElement('span')
  span.style.display = 'contents'
  span.innerHTML = icon(name, size)
  return span
}

export const $ = (selector, root = document) => root.querySelector(selector)

// Scroll the panel holding `el` so it shows at the top. (scrollIntoView
// would also scroll the fixed app shell around it.)
export function reveal(el) {
  const panel = el && el.closest('.panel')
  if (!panel) return
  panel.scrollTop += el.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12
}

/* ---- Toasts ---------------------------------------------------------- */

export function toast(message, { error = false, ms = 3200 } = {}) {
  let box = $('.toasts')
  if (!box) {
    box = h('div.toasts', { role: 'status', 'aria-live': 'polite' })
    document.body.append(box)
  }
  const el = h('div.toast' + (error ? '.error' : ''), message)
  box.append(el)
  setTimeout(() => el.remove(), ms)
}

/* ---- Sheets ---------------------------------------------------------- */

// A dialog that rises from the bottom on a phone and sits centred on a
// computer. `build(close)` returns { body, foot? }. Resolves with the
// value passed to close().
export function sheet(title, build) {
  return new Promise(resolve => {
    const dialog = h('dialog.sheet', { 'aria-label': title, tabindex: '-1' })
    let done = false
    const close = (value) => {
      if (done) return
      done = true
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    const { body, foot } = build(close)
    dialog.append(
      h('div.sheet-head', h('h3', title), h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => close(undefined) }, ic('x'))),
      h('div.sheet-body', body),
      foot ? h('div.sheet-foot', foot) : null
    )
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(undefined) })
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(undefined) })
    document.body.append(dialog)
    dialog.showModal()
    dialog.focus() // not the close button: a ring there reads as a selection
  })
}

export function confirm(title, message, { action = 'OK' } = {}) {
  return sheet(title, (close) => ({
    body: h('p.muted', message),
    foot: [
      h('button.btn.quiet', { type: 'button', onclick: () => close(false) }, 'Keep it'),
      h('button.btn.primary', { type: 'button', onclick: () => close(true) }, action)
    ]
  })).then(Boolean)
}

/* ---- Times ----------------------------------------------------------- */

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const clock = (iso) => (iso ? timeFmt.format(new Date(iso)) : '')
export const when = (iso) => (iso ? fullFmt.format(new Date(iso)) : '')

// For the conversation list: a time today, "Yesterday", a weekday this
// week, otherwise a date.
export function listTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (days <= 0) return timeFmt.format(d)
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' })
  return shortFmt.format(d)
}

export function dayLabel(iso) {
  const d = new Date(iso)
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days === -1) return 'Tomorrow'
  return dayFmt.format(d)
}

export function ago(ms) {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/* ---- People ---------------------------------------------------------- */

export const label = (thread) => thread.name || formatPhone(thread.number)

// A face for a number: initials from its name, or its last two digits, on
// one of six muted inks chosen by the number.
const FACES = [
  ['#dfe7f5', '#2d4a86', '#22314f', '#a9c1f2'],
  ['#f3e2e2', '#9a2c33', '#3c2226', '#f2a7a2'],
  ['#e9e1f5', '#5b3796', '#2c2244', '#c6aef3'],
  ['#e0efe7', '#24704c', '#1c3329', '#94d9b5'],
  ['#f6ead8', '#87520d', '#3a2b17', '#eebd7a'],
  ['#e2eef1', '#2a6a78', '#1b3036', '#93cfdc']
]

export function face(number, name, size = 46) {
  let hash = 0
  for (const ch of String(number)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const [bg, ink, darkBg, darkInk] = FACES[hash % FACES.length]
  const initials = name
    ? name.trim().split(/\s+/).map(w => [...w].find(isLetter)).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : ''
  const text = initials || String(number).slice(-2)
  return h('span.face', {
    'aria-hidden': 'true',
    style: { '--face-bg': bg, '--face-ink': ink, '--face-dark-bg': darkBg, '--face-dark-ink': darkInk, width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.37) + 'px' }
  }, text)
}
