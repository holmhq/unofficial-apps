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
  logo: 'M 4 0 L 20 0 A 4 4 0 0 1 24 4 L 24 14 A 4 4 0 0 1 20 18 L 11 18 L 5 24 L 5 18 L 4 18 A 4 4 0 0 1 0 14 L 0 4 A 4 4 0 0 1 4 0 Z M 10.75 3.5 L 10.75 10.5 L 13.25 10.5 L 13.25 3.5 Z M 10.75 12.25 L 10.75 14.75 L 13.25 14.75 L 13.25 12.25 Z'
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

export function copyButton(text, label = 'Copy') {
  const button = el('button', { type: 'button', class: 'button' }, label)
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(typeof text === 'function' ? text() : text); button.textContent = 'Copied' }
    catch { button.textContent = 'Select and copy' }
    setTimeout(() => { button.textContent = label }, 1600)
  })
  return button
}
