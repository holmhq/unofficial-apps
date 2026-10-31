// Small helpers shared by the views, which draw from template strings: escaping, lookups,
// one delegated click handler (elements name their action with data-act), a toast, and
// positions measured against the app's frame.

export const $ = (s, el = document) => el.querySelector(s)
export const $$ = (s, el = document) => [...el.querySelectorAll(s)]
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const phone = () => innerWidth <= 700

// Actions: views register handlers by name; a click on [data-act="name"] calls it with the
// element and the event.
const actions = {}
export function act(map) { Object.assign(actions, map) }
export function dispatch(event) {
  const el = event.target.closest('[data-act]')
  if (!el) return
  const fn = actions[el.dataset.act]
  if (!fn) return
  if (el.tagName === 'A' && el.getAttribute('href') === '#') event.preventDefault()
  fn(el, event)
}

export function toast(text) {
  const t = $('#toast')
  if (!t) return
  t.innerHTML = `<svg class="i" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>${esc(text)}</span>`
  t.classList.remove('on'); void t.offsetWidth; t.classList.add('on')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => t.classList.remove('on'), 1800)
}

// An element's box within the app frame.
export function rel(el) {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  const area = document.createElement('textarea')
  area.value = text
  area.style.cssText = 'position:fixed;opacity:0'
  document.body.append(area)
  area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch {}
  area.remove()
  return ok
}

export function haptic(ms = 8) {
  try { if (navigator.vibrate && phone()) navigator.vibrate(ms) } catch {}
}

export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
