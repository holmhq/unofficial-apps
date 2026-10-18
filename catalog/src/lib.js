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
