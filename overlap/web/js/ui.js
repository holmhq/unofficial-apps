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
    out: 'M14 5h5v5 M19 5l-8 8 M17 13.5V19H5V7h5.5'
  }
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', paths[name] || '')
  svg.append(path)
  return svg
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
