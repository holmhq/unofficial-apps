// SwarmChat's building blocks, shared by the app's pages and the viewer: elements, icons, the theme, toasts,
// sheets, small menus, segmented controls, click-to-copy fields, who's here, the account menu, ⌘K, Connect via
// MCP and feedback. Nothing here knows about swarms.

export const $ = (s, r = document) => r.querySelector(s)
export const $$ = (s, r = document) => [...r.querySelectorAll(s)]
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const fine = () => matchMedia('(pointer: fine)').matches
export const wide = () => innerWidth >= 760
export const num = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
export const bytes = (n) => (n < 1000 ? `${n} B` : n < 1e6 ? `${(n / 1e3).toFixed(1)} KB` : n < 1e9 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e9).toFixed(2)} GB`)

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('swarmchat:' + k)) } catch { return null } },
  set(k, v) { try { localStorage.setItem('swarmchat:' + k, JSON.stringify(v)) } catch {} },
  raw(k) { try { return localStorage.getItem('swarmchat:' + k) } catch { return null } },
  setRaw(k, v) { try { localStorage.setItem('swarmchat:' + k, v) } catch {} },
  del(k) { try { localStorage.removeItem('swarmchat:' + k) } catch {} },
}

/* ---------- Icons: Lucide-style strokes, drawn inline so they take the text colour ---------- */
export const I = {
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5"/>',
  users: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19c.8-3.1 3.2-4.8 6.2-4.8s5.4 1.7 6.2 4.8"/><path d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4M17.8 14.6c1.8.7 3 2.2 3.4 4.4"/>',
  plug: '<path d="M9 3.5v4M15 3.5v4M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
  in: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H8"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  chat: '<path d="M7 4.5h10a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5h-4.5L8 20v-3.5h-1A3.5 3.5 0 0 1 3.5 13V8A3.5 3.5 0 0 1 7 4.5z"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  rewind: '<path d="M11 18 4 12l7-6zM20 18l-7-6 7-6z"/>',
  chart: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dots: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 6.5l2.5 2.5M14 8.5l2 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7"/>',
  pencil: '<path d="M14.5 5.5l4 4M4.5 19.5l1-4.5L16 4.5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5z"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  side: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  bot: '<rect x="4.5" y="8" width="15" height="11" rx="3.5"/><path d="M12 4.5V8M9 13v1.5M15 13v1.5M2.5 13v2.5M21.5 13v2.5"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12a7.5 7.5 0 0 1 12.8-5.3M17.3 3.5v3.2h-3.2M6.7 20.5v-3.2h3.2"/>',
  box: '<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="m4 7.5 8 3.5 8-3.5M12 11v9"/>',
  mcp: '<path fill="currentColor" stroke="none" d="M15.228,3.596C14.355,2.745 12.942,2.745 12.068,3.596L3.642,11.859C3.351,12.142 2.881,12.142 2.589,11.859C2.45,11.723 2.371,11.537 2.371,11.342C2.371,11.148 2.45,10.962 2.589,10.826L11.015,2.563C12.472,1.146 14.825,1.146 16.281,2.563C17.107,3.366 17.501,4.52 17.335,5.661C18.49,5.497 19.659,5.879 20.494,6.694L20.538,6.738C21.235,7.416 21.629,8.348 21.629,9.32C21.629,10.293 21.235,11.225 20.538,11.903L12.917,19.375C12.871,19.421 12.845,19.483 12.845,19.548C12.845,19.611 12.871,19.674 12.917,19.719L14.482,21.254C14.622,21.39 14.7,21.577 14.7,21.771C14.7,21.965 14.622,22.152 14.482,22.287C14.191,22.571 13.721,22.571 13.429,22.287L11.864,20.753C11.539,20.437 11.355,20.002 11.355,19.548C11.355,19.093 11.539,18.658 11.864,18.342L19.485,10.869C19.903,10.462 20.139,9.902 20.139,9.319C20.139,8.736 19.903,8.177 19.485,7.77L19.441,7.727C18.568,6.877 17.158,6.876 16.284,7.725L10.006,13.882L9.918,13.968C9.627,14.252 9.156,14.252 8.865,13.968C8.725,13.833 8.647,13.646 8.647,13.452C8.647,13.258 8.725,13.071 8.865,12.935L15.231,6.692C15.647,6.285 15.882,5.727 15.882,5.145C15.882,4.562 15.647,4.003 15.228,3.596ZM14.175,5.661C14.314,5.526 14.393,5.339 14.393,5.145C14.393,4.951 14.314,4.764 14.175,4.629C13.884,4.345 13.413,4.345 13.121,4.629L6.89,10.74C6.193,11.418 5.799,12.35 5.799,13.322C5.799,14.295 6.193,15.227 6.89,15.904C8.346,17.322 10.699,17.322 12.156,15.904L18.388,9.793C18.527,9.657 18.606,9.471 18.606,9.277C18.606,9.082 18.527,8.896 18.388,8.76C18.097,8.477 17.626,8.477 17.334,8.76L11.103,14.872C10.229,15.722 8.816,15.722 7.943,14.872C7.524,14.465 7.289,13.905 7.289,13.322C7.289,12.739 7.524,12.18 7.943,11.773L14.175,5.661Z"/>',
}
export const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`
export function ic(n, cls = 'i') {
  const t = document.createElement('template')
  t.innerHTML = icon(n, cls)
  return t.content.firstChild
}

/* ---------- Elements: h('button.btn.primary', { onclick }, 'Send') ---------- */
export function h(selector, ...rest) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(selector)
  const el = document.createElement(m[1] || 'div')
  for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1))
    else el.id = part.slice(1)
  }
  if (rest.length && rest[0] && typeof rest[0] === 'object' && !(rest[0] instanceof Node) && !Array.isArray(rest[0])) {
    for (const [k, v] of Object.entries(rest.shift())) {
      if (v == null || v === false) continue
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'style') for (const [n, x] of Object.entries(v)) el.style.setProperty(n, x)
      else if (k === 'html') el.innerHTML = v
      else if (['value', 'checked', 'disabled', 'hidden', 'textContent'].includes(k)) el[k] = v
      else el.setAttribute(k, v === true ? '' : v)
    }
  }
  return append(el, rest)
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k))
  return el
}
export function fill(el, ...kids) { el.replaceChildren(); return append(el, kids) }

/* ---------- Talking to the server ---------- */
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status } }
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  let res
  try {
    res = await fetch(path, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch { throw new ApiError(0, 'Can’t reach the server. Check your connection.') }
  let data = null
  try { data = await res.json() } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `The server answered ${res.status}.`)
  return data
}

/* ---------- Theme: light, dark or the device's ---------- */
export const themeMode = () => { const t = store.raw('theme'); return t === 'light' || t === 'dark' ? t : 'auto' }
export function setTheme(v) {
  store.setRaw('theme', v)
  if (v === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', v)
  const dark = v === 'dark' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', v === 'auto' ? (m.media.includes('dark') ? '#000000' : '#f5f5f7') : dark ? '#000000' : '#f5f5f7'))
  document.dispatchEvent(new CustomEvent('swarmchat:theme', { detail: v }))
}

/* ---------- Toast ---------- */
let toastTimer
export function toast(text, { bad = false } = {}) {
  let t = $('#toast')
  if (!t) { t = h('div.toast#toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(t) }
  t.textContent = text
  t.classList.toggle('is-bad', bad)
  t.classList.add('is-on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('is-on'), bad ? 4200 : 2800)
}

/* ---------- Segmented control: a sunk track and a raised thumb that slides ---------- */
export function segmented(options, value, onPick, { label = 'Choose', icons = false } = {}) {
  const thumb = h('span.seg-thumb', { 'aria-hidden': 'true' })
  const box = h('div.seg', { role: 'group', 'aria-label': label }, thumb)
  const btns = options.map((o) => h('button', {
    type: 'button', 'data-v': o.value, 'aria-selected': String(o.value === value), 'aria-label': icons ? o.label : null, title: icons ? o.label : null,
    html: icons ? icon(o.icon) : (o.icon ? icon(o.icon) : '') + esc(o.label),
    onclick: () => pick(o.value),
  }))
  box.append(...btns)
  const place = (animate) => {
    const b = btns[options.findIndex((o) => o.value === value)]
    if (!b || !b.offsetWidth) return
    if (!animate) thumb.style.transition = 'none'
    thumb.style.width = b.offsetWidth + 'px'
    thumb.style.transform = `translateX(${b.offsetLeft}px)`
    if (!animate) { void thumb.offsetWidth; thumb.style.transition = '' }
  }
  const set = (v, animate = true) => { value = v; btns.forEach((b, i) => b.setAttribute('aria-selected', String(options[i].value === v))); place(animate) }
  function pick(v) { set(v); onPick && onPick(v) }
  box.set = set
  new ResizeObserver(() => place(false)).observe(box)
  requestAnimationFrame(() => place(false))
  return box
}

/* ---------- Click-to-copy field: the whole field is the button ---------- */
export function copyField(value, html = esc(value), { label } = {}) {
  const el = h('div.copy-field', { role: 'button', tabindex: '0', 'aria-label': label || 'Copy ' + value })
  el.innerHTML = `<code class="copy-value">${html}</code><span class="copy-cue"><span class="copy-word" aria-live="polite">Copy</span>${icon('copy', 'i cf-copy')}${icon('check', 'i cf-tick')}</span>`
  const text = $('.copy-value', el)
  const word = $('.copy-word', el)
  let timer
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch {
      getSelection().selectAllChildren(text)
      toast('Couldn’t copy. It’s selected, so copy it by hand.', { bad: true })
      return
    }
    el.classList.add('is-copied'); word.textContent = 'Copied'
    clearTimeout(timer)
    timer = setTimeout(() => { el.classList.remove('is-copied'); word.textContent = 'Copy' }, 1600)
  }
  el.addEventListener('click', copy)
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy() } })
  const fade = () => el.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  return el
}

/* ---------- Sheets: a dialog on a desk, rising from the bottom on a phone ---------- */
// sheet({ title, body(close), done, cancel, wide }) resolves with what close() was given, or undefined.
export function sheet({ title = '', label = null, body, cancel = 'Cancel', done = null, onDone = null, wide: isWide = false, plain = false, onClose = null }) {
  return new Promise((resolve) => {
    let closed = false
    const previous = document.activeElement
    const close = (value) => {
      if (closed) return
      closed = true
      layer.classList.remove('is-open')
      document.removeEventListener('keydown', onKey, true)
      setTimeout(() => layer.remove(), 420)
      if (previous && previous.focus && document.contains(previous) && !layer.contains(previous)) previous.focus({ preventScroll: true })
      if (onClose) onClose(value)
      resolve(value)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key === 'Tab') trap(e, box)
    }
    const doneBtn = done ? h('button.btn.plain.is-strong.r', { type: 'button', onclick: () => (onDone ? onDone(close) : close(true)) }, done) : h('span.r')
    const box = h('div.sheet' + (isWide ? '.is-wide' : '') + (plain ? '.is-plain' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Options', tabindex: '-1' },
      h('div.grabber'),
      h('div.sheet-head', cancel ? h('button.btn.plain.l', { type: 'button', onclick: () => close() }, cancel) : h('span.l'), h('h2', title), doneBtn),
      h('div.sheet-body', body(close)))
    const layer = h('div.layer', h('div.scrim', { onclick: () => close() }), box)
    document.body.append(layer)
    document.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add('is-open')
      const first = box.querySelector('[autofocus]')
      if (first && wide()) first.focus({ preventScroll: true })
      else box.focus({ preventScroll: true })
    }))
    box.doneButton = doneBtn
  })
}
function trap(e, box) {
  const items = [...box.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

// Destructive confirms start safe: on a desk the keyboard starts on Cancel, on a phone nothing is focused.
export function confirm({ title, text, action, danger = true }) {
  return sheet({
    title: '', label: title, cancel: null, plain: true,
    body: (close) => [
      h('div.confirm-head', h('b', title), text ? h('p', text) : null),
      h('div.confirm-actions',
        h('button.btn.block' + (danger ? '.danger' : '.primary'), { type: 'button', onclick: () => close(true) }, action),
        h('button.btn.block', { type: 'button', autofocus: fine() ? true : null, onclick: () => close(false) }, 'Cancel')),
    ],
  }).then(Boolean)
}

// A short form in a sheet: fields [{ name, label, value, placeholder, hint, type, maxlength }]. Resolves with the
// values, or undefined. `submit(values)` may throw an ApiError, shown under the fields.
export function formSheet({ title, fields, action, submit }) {
  let err
  return sheet({
    title, done: action,
    onDone: async (close) => {
      const box = $('.sheet .form-fields:last-of-type') || document
      const values = {}
      for (const f of fields) values[f.name] = $(`[name="${f.name}"]`, box).value.trim()
      try { close(await submit(values)) } catch (e) { err.textContent = e.message }
    },
    body: () => {
      err = h('p.form-err', { role: 'alert' })
      const form = h('form.form-fields', { onsubmit: (e) => { e.preventDefault(); e.target.closest('.sheet').doneButton.click() } },
        fields.map((f, i) => h('label.field',
          h('span.field-label', f.label),
          h(f.type === 'textarea' ? 'textarea' : 'input', {
            name: f.name, value: f.value || '', placeholder: f.placeholder || '', maxlength: f.maxlength || null, autofocus: i === 0 ? true : null,
            autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', type: f.type && f.type !== 'textarea' ? f.type : (f.type ? null : 'text'),
            rows: f.type === 'textarea' ? 8 : null,
          }),
          f.hint ? h('small.field-hint', f.hint) : null)),
        err, h('button', { type: 'submit', hidden: true }))
      return form
    },
  })
}

/* ---------- Small menus beside a button. Its own button again closes it, as do Escape and a click away. ---------- */
let openPop = null
export function popMenu(anchor, items, { align = 'end' } = {}) {
  const again = openPop && openPop.anchor === anchor
  closePop()
  if (again) return null
  const box = h('div.pop-menu', { role: 'menu' })
  for (const it of items) {
    if (!it) continue
    if (it === 'sep') { box.append(h('hr')); continue }
    if (it instanceof Node) { box.append(it); continue }
    box.append(h((it.href ? 'a' : 'button') + '.mi' + (it.danger ? '.is-danger' : ''), {
      type: it.href ? null : 'button', role: 'menuitem', href: it.href || null,
      onclick: () => { closePop(); if (it.run) it.run() }, html: (it.icon ? icon(it.icon) : '') + `<span>${esc(it.label)}</span>` + (it.checked ? icon('check', 'i mi-check') : ''),
    }))
  }
  document.body.append(box)
  const r = anchor.getBoundingClientRect()
  const bw = box.offsetWidth
  const bh = box.offsetHeight
  let left = align === 'end' ? r.right - bw : r.left
  left = Math.max(10, Math.min(left, innerWidth - bw - 10))
  let top = r.bottom + 6
  if (top + bh > innerHeight - 10) top = Math.max(10, r.top - bh - 6)
  box.style.left = left + 'px'
  box.style.top = top + 'px'
  anchor.setAttribute('aria-expanded', 'true')
  const away = (e) => {
    if (e.type === 'keydown') {
      if (e.key === 'Escape') { closePop(); anchor.focus({ preventScroll: true }); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = $$('.mi', box)
        const i = list.indexOf(document.activeElement)
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus()
        e.preventDefault()
      }
      return
    }
    if (box.contains(e.target) || anchor.contains(e.target)) return
    closePop()
  }
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', away, true) })
  openPop = { box, away, anchor }
  if (anchor.matches(':focus-visible')) $('.mi', box)?.focus({ preventScroll: true })
  return box
}
export function closePop() {
  if (!openPop) return
  const { box, away, anchor } = openPop
  openPop = null
  document.removeEventListener('pointerdown', away, true)
  document.removeEventListener('keydown', away, true)
  anchor.setAttribute('aria-expanded', 'false')
  box.remove()
}

/* ---------- Who's here: drawn from this browser's copy first, then the server's ---------- */
export const session = { me: store.get('me') || { signed_in: false }, listeners: new Set() }
export const initials = (name) => (String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('') || '?').toUpperCase()
export function faceHTML(m, cls = 'face') {
  if (!m.signed_in) return `<span class="${cls} is-out">${icon('user')}</span>`
  return `<span class="${cls} is-in">${m.picture ? `<img src="${esc(m.picture)}" alt="">` : esc(initials(m.name || m.email))}</span>`
}
const fingerprint = (m) => JSON.stringify([m.signed_in, m.name, m.email, m.picture, m.admin, m.creator, (m.workspaces || []).map((w) => [w.id, w.name, w.role, w.swarms])])
export function onMe(fn) { session.listeners.add(fn) }
export async function loadMe() {
  try {
    const fresh = await api('/api/me?return=' + encodeURIComponent(location.pathname + location.search))
    const changed = fingerprint(session.me) !== fingerprint(fresh)
    session.me = fresh
    if (fresh.signed_in) store.set('me', fresh); else store.del('me')
    if (changed) for (const fn of session.listeners) fn(fresh)
    if (fresh.admin) loadSurfaces()
    return fresh
  } catch { return session.me }
}
// Holm writes its own pages' addresses (Analytics) into the page it serves; the worker's copy may predate sign-in.
export let surfaces = globalThis.__HOLM_SURFACES__ || null
async function loadSurfaces() {
  try {
    const page = await (await fetch('/', { cache: 'no-store' })).text()
    const m = /__HOLM_SURFACES__\s*=\s*(\{[^}]*\})/.exec(page)
    surfaces = m ? JSON.parse(m[1]) : null
  } catch {}
}
export function signIn() { location.href = session.me.login_url || '/auth/login?return=' + encodeURIComponent(location.pathname) }
export async function signOut() {
  store.del('me')
  for (const k of Object.keys(localStorage)) if (k.startsWith('swarmchat:c:')) store.del(k.slice(10))
  try { if (session.me.logout_url) await fetch(session.me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }) } catch {}
  location.href = '/'
}

/* ---------- The account menu: who you are, the app's places, Connect via MCP…, theme, sign in or out ---------- */
export function accountMenu(btn, places = () => []) {
  const menu = h('div.menu', { role: 'menu', hidden: true })
  // On a phone the menu is a sheet over a scrim; a tap on the scrim closes it without reaching the page below.
  const scrim = h('div.menu-scrim', { hidden: true, 'aria-hidden': 'true', onclick: () => close() })
  document.body.append(scrim, menu)
  const draw = () => { $('.face', btn).outerHTML = faceHTML(session.me); btn.setAttribute('aria-label', session.me.signed_in ? `Account: ${session.me.name || session.me.email}` : 'Account') }
  draw()
  onMe(draw)
  const close = (refocus) => {
    if (menu.hidden) return
    menu.hidden = true
    scrim.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    if (refocus) btn.focus({ preventScroll: true })
  }
  const open = () => {
    const m = session.me
    const items = places(m).filter(Boolean)
    fill(menu)
    menu.innerHTML = `<div class="menu-who">${faceHTML(m)}<div><b>${m.signed_in ? esc(m.name || 'You') : 'Not Signed In'}</b><small>${m.signed_in ? esc(m.email || '') : 'Sign in to watch your swarms.'}</small></div></div>`
    if (!m.signed_in) menu.append(h('button.mi.is-accent', { type: 'button', role: 'menuitem', 'data-act': 'signin', html: icon('in') + 'Sign In' }))
    for (const it of items) menu.append(h(it.href ? 'a.mi' : 'button.mi', { type: it.href ? null : 'button', role: 'menuitem', href: it.href || null, 'data-run': '1', html: icon(it.icon) + esc(it.label) }))
    if (m.signed_in) menu.append(h('button.mi', { type: 'button', role: 'menuitem', 'data-act': 'mcp', html: icon('mcp') + 'Connect via MCP…' }))
    if (m.admin && surfaces && surfaces.analytics) menu.append(h('a.mi', { role: 'menuitem', href: surfaces.analytics, html: icon('chart') + 'Analytics' }))
    menu.append(h('hr'))
    const row = h('div.theme-row', h('span', 'Theme'))
    row.append(segmented([{ value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'auto', label: 'Automatic', icon: 'auto' }], themeMode(), setTheme, { label: 'Theme', icons: true }))
    menu.append(row)
    if (m.signed_in) menu.append(h('hr'), h('button.mi', { type: 'button', role: 'menuitem', 'data-act': 'signout', html: icon('out') + 'Sign Out' }))
    $$('[data-run]', menu).forEach((el, i) => el.addEventListener('click', () => { close(false); if (items[i].run) items[i].run() }))
    menu.hidden = false
    scrim.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    // The keyboard lands on the first item when the keyboard opened the menu; a click leaves no ring behind.
    const first = $('.mi', menu)
    if (first && btn.matches(':focus-visible')) first.focus({ preventScroll: true })
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) { closePalette(); open() } else close() })
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]')
    if (!b) return
    close(b.dataset.act !== 'mcp')
    if (b.dataset.act === 'signin') signIn()
    else if (b.dataset.act === 'signout') signOut()
    else if (b.dataset.act === 'mcp') mcpSheet()
  })
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(true); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = $$('.mi', menu)
    const i = items.indexOf(document.activeElement)
    e.preventDefault()
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
  })
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target) && e.target !== scrim) close() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) close(true) })
  return { close, open }
}

/* ---------- ⌘K: places and actions, and whatever the page adds ---------- */
let pal = null
let palBack = null
export function palette(commands) {
  const layer = h('div.pal-layer', { hidden: true })
  document.body.append(layer)
  let sel = 0
  let items = []
  const draw = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    items = commands().filter(Boolean).filter((c) => words.every((w) => (c.label + ' ' + (c.also || '')).toLowerCase().includes(w)))
    sel = Math.min(sel, Math.max(0, items.length - 1))
    $('.pal-list', layer).innerHTML = items.length
      ? items.map((c, i) => `<button class="pal-item${i === sel ? ' is-sel' : ''}" type="button" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(c.icon)}${esc(c.label)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</button>`).join('')
      : `<p class="pal-empty">No commands match “${esc(q)}”.</p>`
  }
  const run = (c) => {
    if (!c) return
    close(!c.keepFocus)
    if (c.href) { if (c.blank) window.open(c.href, '_blank', 'noopener'); else location.href = c.href } else c.run()
  }
  const open = () => {
    palBack = document.activeElement
    sel = 0
    layer.innerHTML = `<div class="scrim" data-close></div><div class="pal" role="dialog" aria-modal="true" aria-label="Commands">
      <div class="pal-field">${icon('search')}<input type="text" placeholder="Type a command" aria-label="Type a command" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>
      <div class="pal-list" role="listbox"></div></div>`
    layer.hidden = false
    const input = $('input', layer)
    draw('')
    input.addEventListener('input', () => { sel = 0; draw(input.value) })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!items.length) return
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        draw(input.value)
        const el = $('.pal-item.is-sel', layer)
        const list = $('.pal-list', layer)
        if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 6
        else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 6
      } else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]) }
    })
    input.focus({ preventScroll: true })
  }
  const close = (refocus = true) => {
    if (layer.hidden) return
    layer.hidden = true
    layer.innerHTML = ''
    if (refocus && palBack && document.contains(palBack) && palBack !== document.body) palBack.focus({ preventScroll: true })
    palBack = null
  }
  layer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { close(true); return }
    const b = e.target.closest('.pal-item')
    if (b) run(items[Number(b.dataset.i)])
  })
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (layer.hidden) { closePop(); open() } else close(true); return }
    if (e.key === 'Escape' && !layer.hidden) close(true)
  })
  pal = { open, close }
  return pal
}
export function closePalette() { if (pal) pal.close(false) }

/* ---------- Connect via MCP: the people's tools at /_holm/mcp ---------- */
export function mcpSheet() {
  const address = (session.me && session.me.mcp) || location.origin + '/_holm/mcp'
  const command = 'claude mcp add --transport http swarmchat ' + address
  const step = (n, title, text) => h('div.row', h('span.row-ic.is-num', String(n)), h('div.grow', h('b', title), h('small', text)))
  const can = (name, title, text) => h('div.row', h('span.row-ic', ic(name)), h('div.grow', h('b', title), h('small', text)))
  const panes = {
    claude: h('div.group',
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it SwarmChat and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your workspaces.')),
    chatgpt: h('div.group',
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it SwarmChat, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick SwarmChat from + in a chat.')),
    code: h('div.sheet-stack', copyField(command), h('p.sheet-note', 'Run it in a terminal, then type ', h('code', '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div.group',
      can('grid', 'See your swarms', 'List workspaces, swarms, agents and their chats.'),
      can('chat', 'Read what agents said', 'Read and search messages, without moving anyone’s place.'),
      can('bot', 'Add agents', 'Make a swarm or add an agent and get its token once.'),
      can('chart', 'Watch activity', 'Messages over time, by chat and by agent.')),
  }
  const show = (v) => Object.entries(panes).forEach(([k, el]) => { el.classList.toggle('is-on', k === v); el.inert = k !== v })
  show('claude')
  const back = () => {
    const at = document.activeElement
    if (at && at !== document.body && !at.closest('.layer')) return
    const b = $$('.avatar-btn').find((x) => x.offsetParent)
    if (b) b.focus({ preventScroll: true })
  }
  return sheet({
    title: 'Connect via MCP', cancel: null, done: 'Done', wide: true, onClose: back,
    body: () => h('div.sheet-stack',
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: 60, height: 60 }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', ic('mcp'))),
      h('div.sheet-label', 'Connector Address'),
      copyField(address),
      segmented([{ value: 'claude', label: 'Claude' }, { value: 'chatgpt', label: 'ChatGPT' }, { value: 'code', label: 'Claude Code' }, { value: 'tools', label: 'Tools' }], 'claude', show, { label: 'Where to connect' }),
      h('div.mcp-panes', ...Object.values(panes))),
  })
}

/* ---------- Feedback: the app's own project on feedback.zyt.app, in a panel ---------- */
const FEEDBACK = { project: 'j38pjfac', origin: 'https://feedback.zyt.app', color: '#127a46' }
export const FEEDBACK_URL = `${FEEDBACK.origin}/widget?p=${FEEDBACK.project}`
let feedbackLoad = null
export function openFeedback() {
  if (!feedbackLoad) {
    feedbackLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/vendor/feedback/embed.js'
      Object.assign(s.dataset, { project: FEEDBACK.project, origin: FEEDBACK.origin, color: FEEDBACK.color, button: 'none' })
      s.onload = () => (globalThis.HolmFeedback ? resolve(globalThis.HolmFeedback) : reject(new Error('no form')))
      s.onerror = () => { feedbackLoad = null; s.remove(); reject(new Error('no form')) }
      document.head.append(s)
    })
  }
  feedbackLoad.then((form) => form.open()).catch(() => window.open(FEEDBACK_URL, '_blank', 'noopener'))
}
document.addEventListener('click', (e) => {
  const fb = e.target instanceof Element ? e.target.closest('a[data-feedback]') : null
  if (!fb || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  openFeedback()
})

/* ---------- Times in words: forward for the future, back for the past ---------- */
export function ago(at, now = Date.now()) {
  const t = typeof at === 'number' ? at : Date.parse(at)
  if (!t) return ''
  const s = (now - t) / 1000
  if (s < 0) {
    const f = -s
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`
    if (f < 86400) return `in ${Math.round(f / 3600)} h`
    return `in ${Math.round(f / 86400)} days`
  }
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function registerWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname.endsWith('localhost'))) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}
