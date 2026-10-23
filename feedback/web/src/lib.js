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
// An inbox link's page (link.js): its calls say so, each one tells the
// server someone is there, and a locked session locks the page.
export const link = { project: null, sentAt: 0, onLocked: null }
export const linkURL = path => link.project ? path + (path.includes('?') ? '&' : '?') + 'link=1' : path

export async function api(method, path, data) {
  const headers = data === undefined ? {} : { 'Content-Type': 'application/json' }
  if (link.project) {
    headers['X-Feedback-Link'] = '1'
    link.sentAt = Date.now()
  }
  const response = await fetch(path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) })
  const body = await response.json().catch(() => ({}))
  if (link.project && body.error?.code === 'link_locked') link.onLocked?.()
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
export const KIND = { issue: 'Issue', idea: 'Idea', question: 'Question', praise: 'Praise', problem: 'Problem' }
// What a project is for picks the three kinds its form offers.
export const KIND_SETS = { site: ['issue', 'idea', 'question'], place: ['praise', 'problem', 'idea'] }

const PATHS = {
  issue: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 5v7h2V7h-2Zm0 9v2h2v-2h-2Z',
  idea: 'M12 2a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 12 2Zm-3 18h6v2H9v-2Z',
  question: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 14v2h2v-2h-2Zm1-10a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-1.2.7-2 1.6-2 3.3h2c0-.9.4-1.3 1-1.7A4 4 0 0 0 12 6Z',
  praise: 'M12 20.5C6 16.3 2.5 12.9 2.5 8.9 2.5 6 4.7 3.8 7.4 3.8c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 2.7 0 4.9 2.2 4.9 5.1 0 4-3.5 7.4-9.5 11.6Z',
  problem: 'M12 2.5 22.5 20.5h-21L12 2.5Zm-1 6.5v6h2V9h-2Zm0 7.5v2h2v-2h-2Z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0Z',
  chevron: 'M15 5 8 12l7 7',
  up: 'M12 5 5 13h4v6h6v-6h4Z',
  comment: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  sun: 'M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM11 1.5h2v3h-2Zm0 18h2v3h-2ZM1.5 11h3v2h-3Zm18 0h3v2h-3ZM4.2 5.6l1.4-1.4 2.2 2.1-1.5 1.5Zm12 12 1.5-1.5 2.1 2.2-1.4 1.4ZM4.2 18.4l2.1-2.2 1.5 1.5-2.2 2.1Zm12-12 2.2-2.1 1.4 1.4-2.1 2.2Z',
  moon: 'M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z',
  system: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8v2h4v2H7v-2h4v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z',
  // Line icons: drawn with a stroke (give them the "line" class).
  camera: 'M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  clip: 'M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l7.5-7.5',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  out: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.3 15.3 20 20',
  sliders: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4',
  reply: 'M9.5 7 4.5 12l5 5M5 12h9.5a5 5 0 0 1 5 5v1',
  check: 'M5 12.5 10 17.5 19 7',
  star: 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z',
  down: 'M6 9.5l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  copy: 'M9 8.5h10a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1ZM16 8.5V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h3',
  globe: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM3.5 9h17M3.5 15h17M12 3c2.3 2.4 3.4 5.4 3.4 9s-1.1 6.6-3.4 9M12 3C9.7 5.4 8.6 8.4 8.6 12s1.1 6.6 3.4 9',
  pin: 'M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  short: 'M4 8h16M4 12h16M4 16h9',
  dropdown: 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm10 5 2.2 2.2 2.3-2.2',
  radio: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  boxes: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3 8 3 3 5-6',
  'side-left': 'M4 4.5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM6.5 16.5h4',
  'side-right': 'M4 4.5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM13.5 16.5h4',
  'button-pill': 'M7.5 8.5h9a3.5 3.5 0 0 1 0 7h-9a3.5 3.5 0 0 1 0-7Z',
  'button-icon': 'M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2 0V7a5 5 0 0 1 10 0v4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  apps: 'M5 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM5 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm9 0h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z',
  desktop: 'M3.5 4.5h17a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1ZM8 20h8M12 16v4',
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5Zm3 16h2',
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

// Copies text; false when the browser refused. Pages served without HTTPS
// have no clipboard API, so the text is selected and copied the old way.
async function copy(text, node) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try { getSelection().selectAllChildren(node); return document.execCommand('copy') } catch { return false }
}

// Code to copy, with its copy button joined to the box's right edge.
// `box.set(text)` changes the code.
export function codeBox(text, label = 'Copy') {
  const code = el('code', {}, text)
  const word = el('span', {}, label)
  const button = el('button', { type: 'button', class: 'codebox-copy' }, glyph('copy', 'glyph line'), word)
  let timer
  button.addEventListener('click', async () => {
    const done = await copy(code.textContent, code)
    word.textContent = done ? 'Copied' : 'Select and copy'
    button.classList.toggle('done', done)
    if (done) getSelection().removeAllRanges()
    clearTimeout(timer)
    timer = setTimeout(() => { word.textContent = label; button.classList.remove('done') }, 1600)
  })
  const box = el('div', { class: 'codebox' }, el('pre', {}, code), button)
  box.set = value => { code.textContent = value }
  return box
}

// One choice from a few, as a row of buttons with a thumb that slides to the
// chosen one. Arrow keys move the choice, as in a radio group.
// options: [{ value, label, icon?, line? }]; icon-only when label is ''.
export function segmented({ label, value, options, onchange, className = '' }) {
  const thumb = el('span', { class: 'segmented-thumb', 'aria-hidden': 'true' })
  const group = el('div', { class: `segmented ${className}`.trim(), role: 'radiogroup', 'aria-label': label, style: `--count: ${options.length}` }, thumb)
  const buttons = options.map(option => el('button', {
    type: 'button', role: 'radio', 'data-value': option.value, title: option.label ? null : option.title,
    'aria-label': option.label ? null : option.title,
    onclick: () => pick(option.value, true)
  }, option.icon && glyph(option.icon, option.line === false ? 'glyph' : 'glyph line'), option.label && el('span', {}, option.label)))
  group.append(...buttons)
  const paint = () => {
    const index = Math.max(0, options.findIndex(option => option.value === value))
    group.style.setProperty('--index', index)
    buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === index))
      button.tabIndex = i === index ? 0 : -1
    })
  }
  const pick = (next, user) => {
    if (next === value) return
    value = next
    paint()
    if (user) onchange?.(value)
  }
  group.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = (options.findIndex(option => option.value === value) + step + options.length) % options.length
    pick(options[index].value, true)
    buttons[index].focus()
  })
  paint()
  Object.defineProperty(group, 'value', { get: () => value, set: next => pick(next, false) })
  return group
}

// A dropdown that looks like the rest of the app: a button showing the
// choice, and a list that opens under it (above it, near the bottom of the
// window). Arrow keys, Home, End, a letter, Enter and Escape work as in a
// select. options: [{ value, label, icon?, line?, hint? }]. As a menu
// (menu: true) it always reads `label` and hands each pick to onchange.
let pickers = 0
let opened = null
export function picker({ label, value = '', options, onchange, menu = false, className = '' }) {
  const id = 'picker' + (++pickers)
  let active = -1
  const text = el('span', { class: 'picker-text' })
  const button = el('button', { type: 'button', class: 'picker-button', 'aria-haspopup': menu ? 'menu' : 'listbox', 'aria-expanded': 'false', 'aria-controls': id },
    text, glyph(menu ? 'plus' : 'down', 'glyph line picker-caret'))
  const list = el('ul', { class: 'picker-list', id, role: menu ? 'menu' : 'listbox', tabindex: '-1', 'aria-label': label })
  const root = el('div', { class: `picker ${menu ? 'menu' : ''} ${className}`.replace(/\s+/g, ' ').trim() }, button, list)
  const items = options.map((option, index) => el('li', {
    id: `${id}-${index}`, role: menu ? 'menuitem' : 'option',
    onclick: () => choose(index), onpointermove: () => highlight(index)
  },
    option.icon && glyph(option.icon, option.line === false ? 'glyph' : 'glyph line'),
    el('span', { class: 'picker-label' }, option.label, option.hint && el('small', {}, option.hint)),
    !menu && glyph('check', 'glyph line picker-check')))
  list.append(...items)

  const paint = () => {
    const chosen = options.find(option => option.value === value)
    text.textContent = menu ? label : chosen ? chosen.label : label
    if (!menu) {
      button.setAttribute('aria-label', `${label}: ${chosen ? chosen.label : 'none'}`)
      root.classList.toggle('set', value !== '' && value != null)
      items.forEach((item, i) => item.setAttribute('aria-selected', String(options[i].value === value)))
    }
  }
  const highlight = index => {
    active = index
    items.forEach((item, i) => item.classList.toggle('active', i === index))
    if (index >= 0) { list.setAttribute('aria-activedescendant', items[index].id); items[index].scrollIntoView({ block: 'nearest' }) }
  }
  const outside = event => { if (!root.contains(event.target)) close(false) }
  const open = () => {
    if (root.classList.contains('open')) return
    if (opened && opened !== close) opened(false)
    opened = close
    const box = button.getBoundingClientRect()
    const room = innerHeight - box.bottom
    root.classList.toggle('up', room < Math.min(list.scrollHeight + 12, 300) && box.top > room)
    root.classList.add('open')
    button.setAttribute('aria-expanded', 'true')
    highlight(menu ? 0 : Math.max(0, options.findIndex(option => option.value === value)))
    list.focus({ preventScroll: true })
    document.addEventListener('pointerdown', outside, true)
  }
  function close(refocus = true) {
    if (!root.classList.contains('open')) return
    root.classList.remove('open')
    button.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (opened === close) opened = null
    if (refocus) button.focus()
  }
  const choose = index => {
    const option = options[index]
    close()
    if (!menu && option.value === value) return
    if (!menu) { value = option.value; paint() }
    onchange?.(option.value)
  }
  button.addEventListener('click', () => root.classList.contains('open') ? close() : open())
  button.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open() }
  })
  let typed = '', typedAt = 0
  list.addEventListener('keydown', event => {
    const last = options.length - 1
    if (event.key === 'ArrowDown') highlight(Math.min(last, active + 1))
    else if (event.key === 'ArrowUp') highlight(Math.max(0, active - 1))
    else if (event.key === 'Home') highlight(0)
    else if (event.key === 'End') highlight(last)
    else if (event.key === 'Enter' || event.key === ' ') { if (active >= 0) choose(active) }
    else if (event.key === 'Escape') close()
    else if (event.key === 'Tab') { close(false); return }
    else if (event.key.length === 1) {
      typed = Date.now() - typedAt < 700 ? typed + event.key.toLowerCase() : event.key.toLowerCase()
      typedAt = Date.now()
      const found = options.findIndex(option => option.label.toLowerCase().startsWith(typed))
      if (found >= 0) highlight(found)
    } else return
    event.preventDefault()
  })
  paint()
  Object.defineProperty(root, 'value', { get: () => value, set: next => { value = next; paint() } })
  return root
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
