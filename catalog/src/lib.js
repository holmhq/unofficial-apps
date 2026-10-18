// Small DOM and formatting helpers shared by the store's views.
export const REPO = 'https://github.com/holmhq/unofficial-apps'
export const ALIAS = 'unofficial'

export const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('catalog.' + key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem('catalog.' + key, JSON.stringify(value)) } catch {} }
}

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
