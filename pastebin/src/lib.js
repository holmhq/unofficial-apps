// Shared helpers: DOM building, API calls, formatting, icons, toasts, dialogs.

// ── DOM ────────────────────────────────────────────────────

// h('div.cls#id', { attr }, ...children). Strings become text nodes, so user
// data never reaches innerHTML through here.
export function h(tag, props, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag)
  const node = document.createElement((m && m[1]) || 'div')
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') node.classList.add(part.slice(1))
      else node.id = part.slice(1)
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props)
    props = null
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') node.className += (node.className ? ' ' : '') + v
      else if (k === 'html') node.innerHTML = v
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v)
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k in node && typeof v !== 'string') node[k] = v
      else node.setAttribute(k, v === true ? '' : v)
    }
  }
  append(node, children)
  return node
}

function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue
    if (Array.isArray(c)) append(node, c)
    else node.append(c instanceof Node ? c : String(c))
  }
}

export function icon(name, cls) {
  const span = document.createElement('span')
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
    (cls ? ' class="' + cls + '"' : '') + '>' + (ICONS[name] || '') + '</svg>'
  return span.firstChild
}

const ICONS = {
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  raw: '<path d="M8 6.5L3.5 12 8 17.5"/><path d="M16 6.5l4.5 5.5-4.5 5.5"/>',
  wrap: '<path d="M4 6.5h16"/><path d="M4 12h13a3 3 0 0 1 0 6h-4"/><path d="M15 15.5L12.5 18l2.5 2.5"/><path d="M4 17.5h5"/>',
  flame: '<path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.4-2.3-5.6-3.6-7.6-.4 1.8-1.4 3-2.6 3.6.3-3.1-1-5.9-3.6-7.8.2 3.2-1.4 5-3 6.9C4.6 11.4 5.5 21 12 21z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12.5h9l1-12.5"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5"/><path d="M16.5 6.5l2.5 2.5"/><path d="M14 9l2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  system: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  file: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  pdf: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M9 13h6M9 16.5h4"/>',
  text: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M9 12.5h6M9 16h6"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  out: '<path d="M14 4.5h4.5v15H14"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.5" cy="6.5" r="0.8"/><circle cx="4.5" cy="12" r="0.8"/><circle cx="4.5" cy="17.5" r="0.8"/>',
  share: '<path d="M12 3.5v12"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5"/>',
  open: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  paperclip: '<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
}

// ── API ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || 'Request failed')
    this.status = status
    this.code = code || 'error'
  }
}

export async function api(method, path, body) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(path, init)
  } catch (e) {
    throw new ApiError(0, 'network', 'You appear to be offline. Check your connection and try again.')
  }
  return readJSON(res)
}

async function readJSON(res) {
  let data = null
  try { data = await res.json() } catch (e) { /* non-JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    const err = (data && data.error) || {}
    throw new ApiError(res.status, err.code || 'http_' + res.status, err.message || defaultMessage(res.status))
  }
  return data || {}
}

function defaultMessage(status) {
  if (status === 401) return 'Sign in to continue.'
  if (status === 403) return 'You do not have access to this.'
  if (status === 404) return 'Not found.'
  if (status === 413) return 'That is too large to upload.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return 'Request failed (' + status + ').'
}

// Multipart upload with progress. fetch() cannot report upload progress.
export function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onerror = () => reject(new ApiError(0, 'network', 'The upload failed. Check your connection and try again.'))
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch (e) { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && !(data && data.ok === false)) return resolve(data || {})
      const err = (data && data.error) || {}
      reject(new ApiError(xhr.status, err.code || 'http_' + xhr.status, err.message || defaultMessage(xhr.status)))
    }
    xhr.send(form)
  })
}

// ── Formatting ─────────────────────────────────────────────

export function bytes(n) {
  if (n == null || isNaN(n)) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
  return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB'
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS = [['year', 31536e6], ['month', 2592e6], ['week', 6048e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]]

export function ago(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!t) return ''
  const diff = t - Date.now()
  if (Math.abs(diff) < 45e3) return diff < 0 ? 'just now' : 'in a moment'
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit)
  }
  return ''
}

// "3d 4h", "12m", "40s": compact time left for the fuse.
export function left(ms) {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return d + 'd' + (hr ? ' ' + hr + 'h' : '')
  if (hr > 0) return hr + 'h' + (m ? ' ' + m + 'm' : '')
  if (m > 0) return m + 'm'
  return s + 's'
}

export function fullDate(iso) {
  const t = Date.parse(iso)
  return t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export const EXPIRY = [
  ['never', 'Never'],
  ['10m', '10 minutes'],
  ['1h', '1 hour'],
  ['1d', '1 day'],
  ['7d', '1 week'],
  ['30d', '30 days'],
]

export function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

// ── Storage (best effort) ──────────────────────────────────

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v) } catch (e) { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { /* private mode */ }
  },
  del(key) {
    try { localStorage.removeItem(key) } catch (e) { /* private mode */ }
  },
}

// ── Feedback ───────────────────────────────────────────────

export function toast(message, kind) {
  const host = document.getElementById('toasts')
  const node = h('div.toast', { class: kind === 'error' ? 'error' : null },
    icon(kind === 'error' ? 'x' : 'check'), message)
  host.append(node)
  setTimeout(() => node.remove(), kind === 'error' ? 5200 : 2600)
}

export async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    toast(label || 'Copied')
    return true
  } catch (e) {
    // Older Safari or no permission: fall back to a hidden textarea.
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } }, text)
    document.body.append(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch (err) { /* ignore */ }
    ta.remove()
    toast(ok ? (label || 'Copied') : 'Copy failed. Select the text and copy it yourself.', ok ? null : 'error')
    return ok
  }
}

export function confirmDialog({ title, body, confirm, danger }) {
  return new Promise(resolve => {
    const dlg = h('dialog.confirm', { 'aria-labelledby': 'dlg-title' },
      h('h2#dlg-title', title),
      h('p', body),
      h('div.dialog-actions',
        h('button.btn', { type: 'button', onclick: () => dlg.close('cancel') }, 'Cancel'),
        h('button.btn', { type: 'button', class: danger ? 'btn-danger-solid' : 'btn-primary', onclick: () => dlg.close('ok') }, confirm)
      )
    )
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove() })
    document.body.append(dlg)
    dlg.showModal()
  })
}

export function spinner() {
  return h('div.loading', h('div.spinner', { role: 'progressbar', 'aria-label': 'Loading' }))
}

// The API returns absolute URLs. The page and its API always share an origin,
// so app paths become relative and share links use this page's origin.
export function local(url) {
  if (!url) return url
  try {
    const u = new URL(url, location.href)
    if (u.host === location.host || /^\/(api|raw|auth|_holm)\//.test(u.pathname)) return u.pathname + u.search + u.hash
    return url
  } catch (e) {
    return url
  }
}

export function shareUrl(slug) {
  return location.origin + '/p/' + slug
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}
