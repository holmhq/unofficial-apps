// Pieces shared by the booking pages and the dashboard.
import { h, ic } from '../ui.js'

// Event colours, Apple's system palette.
export const COLORS = {
  red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', teal: '#30b0c7',
  blue: '#007aff', indigo: '#5856d6', purple: '#af52de', pink: '#ff2d55', graphite: '#8e8e93'
}
export const colorOf = (name) => COLORS[name] || COLORS.blue

export const LOCATIONS = {
  none: { icon: 'mapPin', label: 'Decide later' },
  video: { icon: 'video', label: 'Video call' },
  phone: { icon: 'phone', label: 'Phone call' },
  place: { icon: 'mapPin', label: 'In person' },
  custom: { icon: 'messageSquareText', label: 'Somewhere else' }
}

// What the invitee is told about where they'll meet.
export function placeLine(location, hostName, { revealed = false, phone = '' } = {}) {
  const l = location || { kind: 'none' }
  if (l.kind === 'video') return { icon: 'video', text: 'Video call', sub: revealed ? (l.value || 'The link will follow') : 'The link comes with your invite', href: revealed && l.value ? l.value : null }
  if (l.kind === 'phone') return { icon: 'phone', text: 'Phone call', sub: phone ? `${hostName} will call ${phone}` : `${hostName} will call you` }
  if (l.kind === 'place') return { icon: 'mapPin', text: l.value, sub: null, href: `https://maps.apple.com/?q=${encodeURIComponent(l.value)}` }
  if (l.kind === 'custom') return { icon: 'messageSquareText', text: l.value, sub: null }
  return null
}

export function metaRow(icon, main, sub = null, href = null) {
  const text = href ? h('a', { href, target: '_blank', rel: 'noopener' }, main) : h('span', main)
  return h('li', ic(icon, 18, 1.9), h('div', text, sub ? h('small', sub) : null))
}

export function calendarButtons(links) {
  if (!links) return null
  return h('div.cal-buttons',
    h('a.cal-btn', { href: links.google, target: '_blank', rel: 'noopener' }, h('span.cal-logo.g', { 'aria-hidden': 'true' }), 'Google'),
    h('a.cal-btn', { href: links.ics }, h('span.cal-logo.a', { 'aria-hidden': 'true' }), 'Apple'),
    h('a.cal-btn', { href: links.outlook, target: '_blank', rel: 'noopener' }, h('span.cal-logo.o', { 'aria-hidden': 'true' }), 'Outlook'))
}

// A check that draws itself.
export function doneMark(kind = 'good') {
  const el = h('div.done-mark.' + kind)
  el.innerHTML = kind === 'good'
    ? '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring" cx="32" cy="32" r="29"/><path class="tick" d="M19.5 33.5l8.5 8.5 17-19"/></svg>'
    : '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring" cx="32" cy="32" r="29"/><path class="tick" d="M23 23l18 18M41 23 23 41"/></svg>'
  return el
}

export function field({ label, input, hint = null, error = null }) {
  const err = h('p.field-error', { role: 'alert', hidden: !error }, error || '')
  const box = h('label.field', h('span.field-label', label), input, hint ? h('span.field-hint', hint) : null, err)
  box.setError = (message) => { err.textContent = message || ''; err.hidden = !message; box.classList.toggle('bad', !!message) }
  return box
}
