// DOM, API and formatting helpers shared by the views.
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

export const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('feedback.' + key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem('feedback.' + key, JSON.stringify(value)) } catch {} }
}

// JSON in and out; failures throw with the API's own message.
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

export function ago(value) {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000)
  if (seconds < 60) return 'just now'
  const units = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']]
  let n = seconds / 60
  for (const [size, unit] of units) {
    if (n < size) return `${Math.floor(n)} ${unit}${Math.floor(n) === 1 ? '' : 's'} ago`
    n /= size
  }
}

export const STATUS = {
  new: 'New', planned: 'Planned', progress: 'In progress', done: 'Done', closed: 'Closed'
}
export const KIND = { bug: 'Bug', idea: 'Idea', question: 'Question' }

const PATHS = {
  bug: 'M12 3a4 4 0 0 1 4 4v1h1.5l1.8-1.8 1.4 1.4L19 9.3V11h2v2h-2v1a7 7 0 0 1-.4 2.3l2.1 2.1-1.4 1.4-1.7-1.7A7 7 0 0 1 12 21a7 7 0 0 1-5.6-2.9l-1.7 1.7-1.4-1.4 2.1-2.1A7 7 0 0 1 5 14v-1H3v-2h2V9.3L3.3 7.6l1.4-1.4L6.5 8H8V7a4 4 0 0 1 4-4Zm-1 7v9.9a5 5 0 0 0 2 0V10h-2Z',
  idea: 'M12 2a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 12 2Zm-3 18h6v2H9v-2Z',
  question: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 14v2h2v-2h-2Zm1-10a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-1.2.7-2 1.6-2 3.3h2c0-.9.4-1.3 1-1.7A4 4 0 0 0 12 6Z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0Z',
  chevron: 'M15 5 8 12l7 7',
  up: 'M12 5 5 13h4v6h6v-6h4Z',
  comment: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  sun: 'M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM11 1.5h2v3h-2Zm0 18h2v3h-2ZM1.5 11h3v2h-3Zm18 0h3v2h-3ZM4.2 5.6l1.4-1.4 2.2 2.1-1.5 1.5Zm12 12 1.5-1.5 2.1 2.2-1.4 1.4ZM4.2 18.4l2.1-2.2 1.5 1.5-2.2 2.1Zm12-12 2.2-2.1 1.4 1.4-2.1 2.2Z',
  moon: 'M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z',
  system: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8v2h4v2H7v-2h4v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z',
  // Line icons: drawn with a stroke (give them the "line" class).
  clip: 'M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  out: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  logo: 'M 12.000149 0.0002 C 5.383922 0.001176 0.000191 5.382931 0.000191 12.000157 C 0.000191 13.95425 0.484565 15.887893 1.406436 17.620137 L 0.034366 22.741119 C -0.058406 23.086818 0.040226 23.454016 0.293165 23.70694 C 0.546105 23.959865 0.914263 24.058489 1.258987 23.96574 L 6.379969 22.593669 C 8.112387 23.514566 10.046956 23.999914 11.999949 23.999914 C 15.308437 23.999914 18.307426 22.654219 20.481418 20.481427 C 22.654261 18.30761 23.999906 15.308695 23.999906 11.999957 C 23.999906 5.383731 18.617175 0 11.999949 0 Z M 12.000149 22.000122 C 6.477668 22.000122 2.000184 17.522638 2.000184 12.000157 C 2.000184 6.477677 6.477668 2.000193 12.000149 2.000193 C 17.522629 2.000193 22.000113 6.476677 22.000113 12.000157 C 22.000113 17.522638 17.522629 22.000122 12.000149 22.000122 Z M 8.500161 10.000164 C 8.500161 10.552887 8.052888 11.000161 7.500165 11.000161 C 6.947442 11.000161 6.500168 10.552887 6.500168 10.000164 C 6.500168 9.447441 6.947442 9.000168 7.500165 9.000168 C 8.052888 9.000168 8.500161 9.447441 8.500161 10.000164 Z M 14.605639 13.204153 C 15.045088 13.539102 15.130062 14.166074 14.796069 14.605523 C 14.122246 15.492245 13.1037 16.000043 12.000079 16.000043 C 10.896458 16.000043 9.878011 15.492245 9.204089 14.605523 C 8.870115 14.166074 8.956042 13.538152 9.395493 13.204153 C 9.834941 12.870179 10.462864 12.957084 10.796863 13.395557 C 11.380836 14.164104 12.619131 14.164104 13.205054 13.395557 C 13.537078 12.955134 14.164026 12.870159 14.605449 13.204153 Z M 17.500129 10.000164 C 17.500129 10.552887 17.052856 11.000161 16.500133 11.000161 C 15.94741 11.000161 15.500136 10.552887 15.500136 10.000164 C 15.500136 9.447441 15.94741 9.000168 16.500133 9.000168 C 17.052856 9.000168 17.500129 9.447441 17.500129 10.000164 Z'
}

export function glyph(name, className = 'glyph') {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', className)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', PATHS[name])
  svg.append(path)
  return svg
}

// White or ink, whichever reads better on a colour.
export function inkOn(hex) {
  const channel = value => { const c = parseInt(value, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(channel)
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (1.05 / (light + 0.05)) >= ((light + 0.05) / 0.06) ? '#ffffff' : '#1c1917'
}

// A colour moved toward white by a share between 0 and 1.
export function lighten(hex, share) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - share) + 255 * share).toString(16).padStart(2, '0')).join('')
}

export function size(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + ' MB'
}

export function copyButton(text, label = 'Copy') {
  const button = el('button', { type: 'button', class: 'button' }, label)
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(typeof text === 'function' ? text() : text); button.textContent = 'Copied' }
    catch { button.textContent = 'Select and copy' }
    setTimeout(() => { button.textContent = label }, 1600)
  })
  return button
}
