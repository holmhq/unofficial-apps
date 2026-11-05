// Small DOM helpers shared by every view.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue
    if (key === 'class') el.className = value
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value)
    else if (key === 'vars') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, v)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (key === 'html') el.innerHTML = value
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, value)
  }
  append(el, children)
  return el
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

const SVG = 'http://www.w3.org/2000/svg'
export function icon(name) {
  const paths = {
    link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1 M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    calendar: 'M4.5 7.5h15v12h-15z M4.5 11h15 M8.5 4.5v4 M15.5 4.5v4',
    plus: 'M12 5v14 M5 12h14',
    x: 'M6 6l12 12 M18 6L6 18',
    more: 'M6 12h.01 M12 12h.01 M18 12h.01',
    trash: 'M5 7h14 M10 7V5h4v2 M7 7l1 12h8l1-12',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    edit: 'M5 19h4L19 9l-4-4L5 15z',
    eraser: 'M8 19h11 M4.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 17H8z',
    out: 'M14 5h5v5 M19 5l-8 8 M17 13.5V19H5V7h5.5',
    copy: 'M9 9h10v10H9z M5 15V5h10',
    sun: 'M12 8.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 0 0 0-7.6z M12 2.8v2 M12 19.2v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.8 12h2 M19.2 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    auto: 'M3.5 5h17v11h-17z M8.5 20h7 M12 16v4',
    user: 'M12 4.8a3.7 3.7 0 1 0 0 7.4a3.7 3.7 0 0 0 0-7.4z M4.8 20c1.2-3.5 3.9-5.3 7.2-5.3s6 1.8 7.2 5.3',
    search: 'M11 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13z M20 20l-4.3-4.3',
    home: 'M4.5 11L12 4.5l7.5 6.5 M6.5 9.5V19.5h11V9.5',
    sound: 'M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z M15.5 9a4.2 4.2 0 0 1 0 6 M18 6.6a7.6 7.6 0 0 1 0 10.8',
    mute: 'M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z M15.5 9.5l5 5 M20.5 9.5l-5 5',
    signout: 'M14 4.5h4.5v15H14 M10 8l-4 4 4 4 M6 12h10'
  }
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', paths[name] || '')
  svg.append(path)
  return svg
}

// The MCP mark, filled, at its true proportions: 21 units tall on the 24 grid.
export function mcpMark() {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'mcp-mark')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', 'M15.228,3.596C14.355,2.745 12.942,2.745 12.068,3.596L3.642,11.859C3.351,12.142 2.881,12.142 2.589,11.859C2.45,11.723 2.371,11.537 2.371,11.342C2.371,11.148 2.45,10.962 2.589,10.826L11.015,2.563C12.472,1.146 14.825,1.146 16.281,2.563C17.107,3.366 17.501,4.52 17.335,5.661C18.49,5.497 19.659,5.879 20.494,6.694L20.538,6.738C21.235,7.416 21.629,8.348 21.629,9.32C21.629,10.293 21.235,11.225 20.538,11.903L12.917,19.375C12.871,19.421 12.845,19.483 12.845,19.548C12.845,19.611 12.871,19.674 12.917,19.719L14.482,21.254C14.622,21.39 14.7,21.577 14.7,21.771C14.7,21.965 14.622,22.152 14.482,22.287C14.191,22.571 13.721,22.571 13.429,22.287L11.864,20.753C11.539,20.437 11.355,20.002 11.355,19.548C11.355,19.093 11.539,18.658 11.864,18.342L19.485,10.869C19.903,10.462 20.139,9.902 20.139,9.319C20.139,8.736 19.903,8.177 19.485,7.77L19.441,7.727C18.568,6.877 17.158,6.876 16.284,7.725L10.006,13.882L9.918,13.968C9.627,14.252 9.156,14.252 8.865,13.968C8.725,13.833 8.647,13.646 8.647,13.452C8.647,13.258 8.725,13.071 8.865,12.935L15.231,6.692C15.647,6.285 15.882,5.727 15.882,5.145C15.882,4.562 15.647,4.003 15.228,3.596ZM14.175,5.661C14.314,5.526 14.393,5.339 14.393,5.145C14.393,4.951 14.314,4.764 14.175,4.629C13.884,4.345 13.413,4.345 13.121,4.629L6.89,10.74C6.193,11.418 5.799,12.35 5.799,13.322C5.799,14.295 6.193,15.227 6.89,15.904C8.346,17.322 10.699,17.322 12.156,15.904L18.388,9.793C18.527,9.657 18.606,9.471 18.606,9.277C18.606,9.082 18.527,8.896 18.388,8.76C18.097,8.477 17.626,8.477 17.334,8.76L11.103,14.872C10.229,15.722 8.816,15.722 7.943,14.872C7.524,14.465 7.289,13.905 7.289,13.322C7.289,12.739 7.524,12.18 7.943,11.773L14.175,5.661Z')
  svg.append(path)
  return svg
}

// Anything to copy is one click-to-copy field: the value on one line in mono, a copy icon at its
// end, Copy fading in on hover, and a tick with Copied for 1.6 s after a click. No toast.
export function copyField(value, { label = 'Copy', onCopy } = {}) {
  const text = h('code', { class: 'copy-value' }, value)
  const word = h('span', { class: 'copy-word', 'aria-live': 'polite' }, 'Copy')
  const copyIcon = icon('copy'), tick = icon('check')
  copyIcon.classList.add('cf-copy'); tick.classList.add('cf-tick')
  let timer
  const field = h('div', { class: 'copy-field', role: 'button', tabindex: '0', 'aria-label': `${label}: ${value}` }, text, h('span', { class: 'copy-cue' }, word, copyIcon, tick))
  async function copy() {
    try { await navigator.clipboard.writeText(value) } catch {
      getSelection().selectAllChildren(text)
      toast('Couldn’t copy. It’s selected, so copy it by hand.')
      return
    }
    onCopy?.()
    field.classList.add('is-copied')
    word.textContent = 'Copied'
    clearTimeout(timer)
    timer = setTimeout(() => { field.classList.remove('is-copied'); word.textContent = 'Copy' }, 1600)
  }
  field.addEventListener('click', copy)
  field.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy() } })
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  return field
}

// Twelve person colours of equal weight around the hue wheel.
const HUES = [172, 18, 262, 48, 205, 330, 128, 290, 82, 232, 0, 150]
export const personColor = index => `oklch(0.66 0.15 ${HUES[((index % 12) + 12) % 12]})`

export const initials = name =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('').toUpperCase() || '?'

export function avatar(person, size) {
  const el = h('span', { class: 'avatar', vars: { '--c': personColor(person.color ?? 0), ...(size ? { '--size': size } : {}) }, title: person.name || '' })
  if (person.picture) {
    const img = h('img', { src: person.picture, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })
    img.addEventListener('error', () => { img.remove(); el.textContent = initials(person.name) })
    el.append(img)
  } else el.textContent = initials(person.name)
  return el
}

export function toast(message, { person, ms = 2600 } = {}) {
  const root = document.getElementById('toasts')
  const el = h('div', { class: 'toast' }, person ? avatar(person) : null, message)
  root.append(el)
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320) }, ms)
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// A short burst of confetti in the people's colours, for a settled time.
export function confetti(colors) {
  if (reducedMotion()) return
  const canvas = h('canvas', { class: 'confetti' })
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr }
  resize()
  const palette = colors.length ? colors : ['#0e8a78', '#f2603f', '#e6a100']
  const bits = Array.from({ length: 150 }, (_, i) => ({
    x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.32,
    vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 11,
    r: 4 + Math.random() * 5, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.35,
    c: palette[i % palette.length], shape: i % 3
  }))
  const start = performance.now()
  function frame(now) {
    const t = now - start
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.a += b.va
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a)
      ctx.globalAlpha = Math.max(0, 1 - t / 2600)
      ctx.fillStyle = b.c
      if (b.shape === 0) ctx.fillRect(-b.r, -b.r / 2.5, b.r * 2, b.r / 1.25)
      else if (b.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, b.r / 1.6, 0, Math.PI * 2); ctx.fill() }
      else { ctx.beginPath(); ctx.moveTo(0, -b.r); ctx.lineTo(b.r, b.r); ctx.lineTo(-b.r, b.r); ctx.fill() }
      ctx.restore()
    }
    if (t < 2700) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

// A segmented control with a sliding thumb.
export function segmented(options, value, onChange, label) {
  const thumb = h('span', { class: 'thumb', 'aria-hidden': 'true' })
  const root = h('div', { class: 'segmented', role: 'group', 'aria-label': label }, thumb)
  const buttons = options.map(([key, text]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(key === value) }, text)
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return
      set(key)
      onChange(key)
    })
    root.append(b)
    return [key, b]
  })
  function place() {
    const on = buttons.find(([, b]) => b.getAttribute('aria-pressed') === 'true')?.[1]
    if (on) { thumb.style.left = `${on.offsetLeft}px`; thumb.style.width = `${on.offsetWidth}px` }
  }
  function set(key) {
    for (const [k, b] of buttons) b.setAttribute('aria-pressed', String(k === key))
    place()
  }
  requestAnimationFrame(place)
  new ResizeObserver(place).observe(root)
  root.set = set
  return root
}

export async function api(path, { method = 'GET', body, key, keepalive = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (key) headers['X-Overlap-Key'] = key
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', keepalive })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}).`), { status: res.status })
  return data
}

export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(`overlap:${key}`); return v == null ? fallback : JSON.parse(v) } catch { return fallback } },
  set(key, value) { try { localStorage.setItem(`overlap:${key}`, JSON.stringify(value)) } catch {} },
  remove(key) { try { localStorage.removeItem(`overlap:${key}`) } catch {} }
}

// The window never scrolls: #view is the page's one scrolling panel. scrollIntoView would move
// the fixed shell too, so this scrolls the element's own scrolling boxes, up to and including
// the panel, by hand. block/inline: 'nearest' or 'center'.
export function reveal(el, { block = 'nearest', inline = 'nearest', smooth = false } = {}) {
  const panel = document.getElementById('view')
  if (!el || !panel || !panel.contains(el)) return
  const behavior = smooth && !reducedMotion() ? 'smooth' : 'auto'
  for (let box = el.parentElement; box; box = box.parentElement) {
    const style = getComputedStyle(box)
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && box.scrollHeight > box.clientHeight
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && box.scrollWidth > box.clientWidth
    if (scrollsY || scrollsX) {
      const r = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      const delta = (lo, hi, blo, bhi, how) => how === 'center'
        ? (lo + hi) / 2 - (blo + bhi) / 2
        : lo < blo ? lo - blo - 8 : hi > bhi ? hi - bhi + 8 : 0
      const top = scrollsY ? delta(r.top, r.bottom, b.top, b.bottom, block) : 0
      const left = scrollsX ? delta(r.left, r.right, b.left, b.right, inline) : 0
      if (top || left) box.scrollBy({ top, left, behavior })
    }
    if (box === panel) break
  }
}
