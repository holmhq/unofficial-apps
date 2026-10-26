// Small DOM and formatting helpers shared by the store's views.
export const REPO = 'https://github.com/holmhq/unofficial-apps'
// The repository as holm app install names it: github.com/<org>/<repo>.
export const ADDRESS = REPO.replace(/^https?:\/\//, '')

export const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('catalog.' + key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem('catalog.' + key, JSON.stringify(value)) } catch {} }
}

// The reader's node, as the holm CLI knows it; the install sheet and the
// guide both write their commands for it.
export const node = Object.assign({ peer: '', domain: '' }, store.get('node', {}))

export const $ = (selector, root = document) => root.querySelector(selector)

export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (key === 'class') element.className = value
    else if (key === 'style') element.style.cssText = value
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value)
    else element.setAttribute(key, value === true ? '' : value)
  }
  element.append(...children.flat(Infinity).filter(child => child != null && child !== false))
  return element
}

export function bytes(n) {
  if (!n) return ''
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'
  return (n / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + ' MB'
}

export const paragraphs = value => String(value || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean)

// The app icon: its holm.symbol.svg path in white on its theme colour, with
// room around it, the way Holm draws consumer icons.
export function icon(app, size = 'm') {
  const ns = 'http://www.w3.org/2000/svg'
  const tile = el('span', { class: `icon icon-${size}`, style: app.themeColor ? `--tile: ${app.themeColor}` : null, 'aria-hidden': 'true' })
  if (app.symbol) {
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '-7 -7 38 38')
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', app.symbol)
    svg.append(path)
    tile.append(svg)
  } else {
    tile.append(el('span', { class: 'letter' }, (app.title || app.path).charAt(0).toUpperCase()))
  }
  return tile
}

// JSON in and out of the store's API; failures throw with the API's message.
export async function api(method, path, data) {
  const response = await fetch(path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.ok === false) throw new Error(body.error?.message || 'That didn’t work. Try again.')
  return body
}

// Light counting: a page view once per app per tab, every Get and every
// copied command. The server ignores admins and keeps no record of who.
export function track(app, kind) {
  if (kind === 'view') {
    try {
      if (sessionStorage.getItem('catalog.viewed.' + app)) return
      sessionStorage.setItem('catalog.viewed.' + app, '1')
    } catch {}
  }
  fetch('/api/events', {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app, kind })
  }).catch(() => {})
}

export function stars(rating, label = true) {
  const full = Math.round(rating)
  return el('span', { class: 'stars', role: label ? 'img' : null, 'aria-label': label ? `${rating} out of 5 stars` : null, 'aria-hidden': label ? null : 'true' },
    [1, 2, 3, 4, 5].map(n => el('span', { class: n <= full ? null : 'off' }, '★')))
}

export const date = value => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function applyTint(tint) {
  if (!/^#[0-9a-fA-F]{6}$/.test(tint || '')) return
  document.documentElement.style.setProperty('--tint', tint)
  store.set('tint', tint)
}

// Light, dark or the device's choice, remembered in this browser. The page
// carries the one in effect as data-theme; shell.html sets it before first
// paint the same way, so a reload doesn't flash.
const darkQuery = matchMedia('(prefers-color-scheme: dark)')
const BAR = { light: '#f2f5f4', dark: '#0f1a1e' }

export const themeMode = () => ['light', 'dark'].includes(store.get('theme')) ? store.get('theme') : 'system'

export function setTheme(mode) {
  store.set('theme', mode)
  applyTheme()
}

export function applyTheme() {
  const mode = themeMode()
  const shown = mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode
  document.documentElement.dataset.theme = shown
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = BAR[shown]
}

darkQuery.addEventListener('change', () => { if (themeMode() === 'system') applyTheme() })

// A command or prompt to copy. Each line is a list of strings and { you }
// parts, the reader's own values, which are highlighted. Shell commands keep
// their line breaks (long ones continue with a backslash); a prose prompt is
// one paragraph that wraps.
export function command(lines, { label, kind = 'Terminal', prose = false, onCopy } = {}) {
  const plain = parts => parts.map(part => typeof part === 'string' ? part : part.you).join('')
  const code = el('code', {}, lines.map(line =>
    el('span', { class: 'line' }, line.map(part => typeof part === 'string' ? part : el('span', { class: 'you' }, part.you)))))
  const copy = el('button', { type: 'button', class: 'copy', 'aria-label': 'Copy ' + label }, 'Copy')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lines.map(plain).join('\n'))
      copy.textContent = 'Copied'
      if (onCopy) onCopy()
    } catch {
      copy.textContent = 'Select and copy'
    }
    setTimeout(() => { copy.textContent = 'Copy' }, 1600)
  })
  return el('div', { class: 'command' + (prose ? ' prose' : '') },
    el('div', { class: 'bar' }, el('span', {}, kind), copy),
    el('pre', {}, code))
}

// Tabs over one panel, with the arrow keys moving between them. ways maps
// each tab's key to its label and a render() for the panel; repaint() draws
// the current one again.
export function tabbed({ id, label, ways, current, onChoose }) {
  const keys = Object.keys(ways)
  const bar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': label })
  const panel = el('div', { class: 'panel', role: 'tabpanel', id: id + '-panel' })
  let at = keys.includes(current) ? current : keys[0]
  const repaint = () => panel.replaceChildren(...ways[at].render())
  const paint = () => {
    bar.replaceChildren(...keys.map(key => el('button', {
      type: 'button', role: 'tab', id: id + '-' + key, 'aria-controls': id + '-panel',
      'aria-selected': String(key === at), tabindex: key === at ? '0' : '-1',
      onclick: () => choose(key)
    }, ways[key].label)))
    panel.setAttribute('aria-labelledby', id + '-' + at)
    repaint()
  }
  const choose = key => {
    at = key
    onChoose(key)
    paint()
    document.getElementById(id + '-' + key).focus()
  }
  bar.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const i = keys.indexOf(at)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
      : (i + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length
    choose(keys[next])
  })
  paint()
  return { bar, panel, repaint }
}
