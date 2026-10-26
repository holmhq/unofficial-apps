// Small building blocks: elements, avatars, times, sheets, menus, toasts,
// segmented controls and list animations.

import { ic } from './icons.js'

export { ic }

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const wide = () => innerWidth >= 760
export const $ = (selector, root = document) => root.querySelector(selector)

// h('button.btn.primary', { onclick }, 'Send'): a tag with classes, then
// optional props, then children (strings, nodes, arrays, null).
export function h(selector, ...rest) {
  const match = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(selector)
  const el = document.createElement(match[1] || 'div')
  for (const part of match[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1))
    else el.id = part.slice(1)
  }
  if (rest.length && rest[0] && typeof rest[0] === 'object' && !(rest[0] instanceof Node) && !Array.isArray(rest[0])) {
    for (const [key, value] of Object.entries(rest.shift())) {
      if (value == null || value === false) continue
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value)
      else if (key === 'style') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v)
      else if (key === 'html') el.innerHTML = value
      else if (['value', 'checked', 'disabled', 'hidden', 'textContent'].includes(key)) el[key] = value
      else el.setAttribute(key, value === true ? '' : value)
    }
  }
  append(el, rest)
  return el
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid))
  return el
}

export function fill(el, ...kids) {
  el.replaceChildren()
  return append(el, kids)
}

/* ---- People -------------------------------------------------------------- */

// Gradient pairs for avatars, chosen by the number so a person keeps theirs.
const GRADIENTS = [
  ['#ff8a6b', '#f2545b'], ['#ffc46b', '#f7934c'], ['#a18cff', '#6d5ff0'], ['#7fd98f', '#3dbb63'],
  ['#5fd8d0', '#24b0b8'], ['#6ec2ff', '#2f8cf2'], ['#f39bd8', '#d665c0'], ['#a6b1c5', '#7d889c']
]

export function hue(key) {
  let n = 7
  for (const ch of String(key)) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[n % (GRADIENTS.length - 1)]
}

export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]]
  return letters.map(w => [...w][0]).join('').toUpperCase()
}

export function avatar({ key, name, picture = null, size = null, cls = '' }) {
  const [a1, a2] = hue(key || name || '')
  const el = h('span.avatar' + cls, { 'aria-hidden': 'true', style: { '--a1': a1, '--a2': a2, ...(size ? { width: size + 'px', height: size + 'px', 'font-size': Math.round(size * .36) + 'px' } : {}) } })
  if (picture) el.append(h('img', { src: picture, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' }))
  else {
    const letters = initials(name)
    if (letters) el.textContent = letters
    else el.append(ic('user', size ? Math.round(size * .5) : 20, 2))
  }
  return el
}

/* ---- Times --------------------------------------------------------------- */

export const MIN = 60000
export const HOUR = 3600000
export const DAY = 86400000
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })
const fullFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const ms = (value) => (typeof value === 'number' ? value : Date.parse(value))
export const clock = (value) => clockFmt.format(ms(value))
export const full = (value) => fullFmt.format(ms(value))
const startOfDay = (value) => { const d = new Date(ms(value)); d.setHours(0, 0, 0, 0); return d.getTime() }
export const sameDay = (a, b) => startOfDay(a) === startOfDay(b)
const dayOffset = (value) => Math.round((startOfDay(value) - startOfDay(Date.now())) / DAY)

// "9:41 PM", "Yesterday", "Tue", "12 Oct": the time beside a conversation.
export function listWhen(value) {
  const days = dayOffset(value)
  if (days === 0) return clock(value)
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > -7 && days < 0) return weekdayFmt.format(ms(value))
  return dateFmt.format(ms(value))
}

// "Today", "Yesterday", "Monday", "12 October": a day in a conversation.
export function dayName(value) {
  const days = dayOffset(value)
  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  if (days > -7 && days < 0) return weekdayLong.format(ms(value))
  return longDate.format(ms(value))
}

// "today at 9:41 PM", "tomorrow at 8:00 AM", "Mon 3 Nov at 8:00 AM".
export function when(value) {
  const days = dayOffset(value)
  if (days === 0) return `today at ${clock(value)}`
  if (days === 1) return `tomorrow at ${clock(value)}`
  if (days === -1) return `yesterday at ${clock(value)}`
  return full(value).replace(/,?\s(\d{1,2}:\d{2})/, ' at $1')
}

export function ago(value) {
  if (!value) return 'never'
  const s = Math.max(0, (Date.now() - ms(value)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`
  return 'on ' + dateFmt.format(ms(value))
}

/* ---- Toasts ---------------------------------------------------------------- */

let toastEl = null
let toastTimer = null

export function toast(text, { kind = 'good', ms: duration } = {}) {
  if (!toastEl) {
    toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' })
    document.body.append(toastEl)
  }
  const icon = kind === 'bad' ? 'bang' : kind === 'info' ? 'info' : 'check'
  fill(toastEl, h('span.ic', ic(icon, 15, 2.6)), h('span', text))
  toastEl.className = 'toast ' + kind
  requestAnimationFrame(() => toastEl.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration || (kind === 'bad' ? 4200 : 2400))
}

/* ---- Sheets ------------------------------------------------------------------ */

// sheet({ title, body(close), cancel, done, ... }) resolves with what close()
// was given, or undefined when dismissed. On a phone it rises from the
// bottom and can be pulled down; on a wide screen it's a dialog.
export function sheet({ title = '', label = null, body, cancel = 'Cancel', done = null, onDone = null, wide: isWide = false, plain = false }) {
  return new Promise((resolve) => {
    let closed = false
    const previous = document.activeElement
    const close = (value) => {
      if (closed) return
      closed = true
      layer.classList.remove('open')
      document.removeEventListener('keydown', onKey, true)
      setTimeout(() => layer.remove(), 480)
      if (previous && previous.focus && document.contains(previous)) previous.focus({ preventScroll: true })
      resolve(value)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close() }
      if (event.key === 'Tab') trapFocus(event, box)
    }
    const doneBtn = done ? h('button.btn.plain.strong.r', { type: 'button', onclick: () => (onDone ? onDone(close) : close(true)) }, done) : h('span.r')
    const box = h('div.sheet' + (isWide ? '.wide' : '') + (plain ? '.plain' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Options' },
      h('div.grabber'),
      h('div.sheet-head', cancel ? h('button.btn.plain.l', { type: 'button', onclick: () => close() }, cancel) : h('span.l'), h('h2', title), doneBtn),
      h('div.sheet-body', body(close)))
    const layer = h('div.layer', h('div.scrim', { onclick: () => close() }), box)
    document.body.append(layer)
    document.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add('open')
      const first = box.querySelector('[autofocus]')
      if (first && wide()) first.focus({ preventScroll: true })
    }))
    pullToDismiss(box, close)
    box.doneButton = doneBtn
  })
}

function trapFocus(event, box) {
  const items = [...box.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function pullToDismiss(box, close) {
  let start = null
  let dy = 0
  let t0 = 0
  const grab = [box.querySelector('.grabber'), box.querySelector('.sheet-head')]
  for (const el of grab) {
    el.addEventListener('pointerdown', (event) => {
      if (wide() || event.target.closest('button')) return
      start = event.clientY
      dy = 0
      t0 = performance.now()
      box.style.transition = 'none'
      el.setPointerCapture(event.pointerId)
    })
    el.addEventListener('pointermove', (event) => {
      if (start == null) return
      dy = event.clientY - start
      box.style.transform = `translate3d(0, ${dy > 0 ? dy : dy / 6}px, 0)`
    })
    const end = () => {
      if (start == null) return
      start = null
      const speed = dy / Math.max(1, performance.now() - t0)
      box.style.transition = ''
      box.style.transform = ''
      if (dy > 110 || speed > .6) close()
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }
}

export function confirm({ title, text, action, danger = true }) {
  return sheet({
    title: '',
    label: title,
    cancel: null,
    plain: true,
    body: (close) => [
      h('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px', 'text-align': 'center', padding: '4px 8px 0' } },
        h('b', { style: { 'font-size': '19px', 'letter-spacing': '-.016em' } }, title),
        h('p.muted', { style: { margin: 0, 'font-size': '15px', 'line-height': '1.5' } }, text)),
      h('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '8px' } },
        h('button.btn.large.block' + (danger ? '.danger' : '.primary'), { type: 'button', autofocus: true, onclick: () => close(true) }, action),
        h('button.btn.large.block', { type: 'button', onclick: () => close(false) }, 'Cancel'))
    ]
  }).then(Boolean)
}

/* ---- Menus ------------------------------------------------------------------- */

// A small menu beside `anchor` (an element or { x, y }). items: { label, icon,
// danger, onclick } or 'sep' or a ready node.
export function menu(anchor, items, { align = 'end', lift = null } = {}) {
  closeMenus()
  const box = h('div.menu', { role: 'menu' })
  const done = () => closeMenus()
  for (const item of items) {
    if (!item) continue
    if (item === 'sep') { box.append(h('hr')); continue }
    if (item instanceof Node) { box.append(item); continue }
    box.append(h('button.menu-item' + (item.danger ? '.danger' : ''), {
      type: 'button', role: 'menuitem',
      onclick: () => { done(); item.onclick() }
    }, item.icon ? ic(item.icon, 19) : null, h('span.grow', item.label)))
  }
  const backdrop = lift ? h('div.backdrop') : null
  if (backdrop) document.body.append(backdrop)
  document.body.append(box)
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
  const bw = box.offsetWidth
  const bh = box.offsetHeight
  let left = align === 'end' ? r.right - bw : r.left
  left = Math.max(10, Math.min(left, innerWidth - bw - 10))
  let top = r.bottom + 8
  if (top + bh > innerHeight - 10) top = Math.max(10, r.top - bh - 8)
  box.style.left = left + 'px'
  box.style.top = top + 'px'
  box.style.transformOrigin = `${r.left + (r.right - r.left) / 2 - left}px ${top > r.top ? 0 : bh}px`
  let clone = null
  if (lift) {
    const rect = lift.getBoundingClientRect()
    clone = lift.cloneNode(true)
    clone.classList.add('lift')
    Object.assign(clone.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: 0 })
    document.body.append(clone)
    requestAnimationFrame(() => { clone.style.transform = 'scale(1.03)' })
  }
  requestAnimationFrame(() => { box.classList.add('open'); backdrop && backdrop.classList.add('open') })
  // Focus the first item only when the menu was opened from the keyboard.
  const first = box.querySelector('button')
  if (first && anchor instanceof Element && anchor.matches(':focus-visible')) first.focus({ preventScroll: true })
  const away = (event) => {
    if (event.type === 'keydown') {
      if (event.key === 'Escape') { closeMenus(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const list = [...box.querySelectorAll('button')]
        const i = list.indexOf(document.activeElement)
        list[(i + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus()
        event.preventDefault()
      }
      return
    }
    if (box.contains(event.target) || (anchor instanceof Element && anchor.contains(event.target))) return
    closeMenus()
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', away, true)
  })
  openMenu = { box, backdrop, clone, away }
  return box
}

let openMenu = null
export function closeMenus() {
  if (!openMenu) return
  const { box, backdrop, clone, away } = openMenu
  openMenu = null
  document.removeEventListener('pointerdown', away, true)
  document.removeEventListener('keydown', away, true)
  box.classList.remove('open')
  backdrop && backdrop.classList.remove('open')
  if (clone) clone.style.transform = ''
  setTimeout(() => { box.remove(); backdrop && backdrop.remove(); clone && clone.remove() }, 260)
}

/* ---- Segmented control ----------------------------------------------------------- */

export function segmented(options, value, onchange, { label = 'Choose' } = {}) {
  const thumb = h('span.thumb', { 'aria-hidden': 'true' })
  const box = h('div.seg', { role: 'group', 'aria-label': label }, thumb)
  const buttons = options.map(o => h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: () => pick(o.value) }, o.icon ? ic(o.icon, 15, 2) : null, o.label))
  box.append(...buttons)
  function place(animate) {
    const i = options.findIndex(o => o.value === value)
    const b = buttons[i]
    if (!b || !b.offsetWidth) return
    if (!animate) thumb.style.transition = 'none'
    thumb.style.width = b.offsetWidth + 'px'
    thumb.style.transform = `translateX(${b.offsetLeft}px)`
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = '' })
  }
  function pick(v) {
    value = v
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)))
    place(true)
    onchange(v)
  }
  new ResizeObserver(() => place(false)).observe(box)
  return box
}

/* ---- Lists ------------------------------------------------------------------------ */

// Run `mutate`, then slide every keyed child from where it was to where it is.
export function flip(container, mutate) {
  const before = new Map()
  for (const el of container.children) if (el.dataset.key) before.set(el.dataset.key, el.getBoundingClientRect().top)
  mutate()
  if (reduced()) return
  for (const el of container.children) {
    if (!el.dataset.key) continue
    const was = before.get(el.dataset.key)
    if (was == null) {
      if (before.size) el.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' })
      continue
    }
    const dy = was - el.getBoundingClientRect().top
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.32,.72,0,1)' })
  }
}

// Shake an element to say no.
export function nope(el) {
  if (!el || reduced()) return
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' })
}

export async function copyText(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(what)
  } catch {
    toast('Select it and copy by hand.', { kind: 'bad' })
  }
}

// Scroll the nearest panel so `el` shows, without moving the fixed shell.
export function reveal(el, panel = el && el.closest('.panel, .convo, .sheet-body')) {
  if (!el || !panel) return
  const p = panel.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.top < p.top + 60) panel.scrollBy({ top: r.top - p.top - 60, behavior: reduced() ? 'auto' : 'smooth' })
  else if (r.bottom > p.bottom - 20) panel.scrollBy({ top: r.bottom - p.bottom + 20, behavior: reduced() ? 'auto' : 'smooth' })
}

// iOS-style large titles: the bar turns to glass and shows a small title
// once the large one has scrolled under it.
export function collapsing(bar, panel) {
  const update = () => {
    const title = panel.querySelector('.large-title')
    const limit = title ? title.offsetTop + title.offsetHeight - 8 : 4
    bar.classList.toggle('scrolled', panel.scrollTop > limit)
  }
  panel.addEventListener('scroll', update, { passive: true })
  requestAnimationFrame(update)
}

export function haptic(ms = 8) {
  // Browsers allow vibration only after the person has touched the page.
  const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive
  try { if (touched && navigator.vibrate) navigator.vibrate(ms) } catch {}
}
