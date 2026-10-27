// Event types: the kinds of meeting a host offers, each at /@handle/slug.
import { reject, text, longText, int } from './lib.js'

export const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'graphite']
const KINDS = ['none', 'video', 'phone', 'place', 'custom']

const ds = (env) => env.holm.app.ds

export function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

export function eventsOf(env, hostId) {
  return ds(env).find('events', { host: hostId }, { limit: 100, order: 'asc' })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a._createdAt || 0) - (b._createdAt || 0))
}

export function eventBySlug(env, hostId, slug) {
  if (!/^[a-z0-9-]{1,40}$/.test(String(slug || ''))) return null
  return ds(env).find('events', { host: hostId, slug }, { limit: 1, order: 'asc' })[0] || null
}

function cleanLocation(value) {
  const kind = value && KINDS.includes(value.kind) ? value.kind : 'none'
  let detail = text(value && value.value, 300, 'Location')
  if (kind === 'video' && detail) {
    if (!/^https:\/\/[^\s<>"]+$/i.test(detail)) reject(400, 'invalid_input', 'A video link starts with https://')
  }
  if ((kind === 'place' || kind === 'custom') && !detail) reject(400, 'invalid_input', kind === 'place' ? 'Add the address.' : 'Say where you’ll meet.')
  if (kind === 'none' || kind === 'phone') detail = ''
  return { kind, value: detail }
}

function clean(input, existing) {
  const out = {}
  const has = (k) => k in input || !existing
  if (has('title')) out.title = text(input.title, 80, 'Name', true)
  if (has('slug')) out.slug = slugify(input.slug || out.title || (existing && existing.title))
  if (has('slug') && !out.slug) reject(400, 'invalid_input', 'The link needs a letter or a number.')
  if (has('duration')) out.duration = int(input.duration ?? 30, 'Duration', 5, 720)
  if (has('step')) out.step = input.step ? int(input.step, 'Start times', 5, 720) : 0
  if (has('notice')) out.notice = int(input.notice ?? 240, 'Notice', 0, 43200)
  if (has('window')) out.window = int(input.window ?? 60, 'How far ahead', 1, 365)
  if (has('before')) out.before = int(input.before ?? 0, 'Time before', 0, 240)
  if (has('after')) out.after = int(input.after ?? 0, 'Time after', 0, 240)
  if (has('location')) out.location = cleanLocation(input.location)
  if (has('description')) out.description = longText(input.description, 1000, 'Description')
  if (has('color')) out.color = COLORS.includes(input.color) ? input.color : 'blue'
  if (has('active')) out.active = input.active !== false
  return out
}

function uniqueSlug(env, hostId, slug, id) {
  const taken = ds(env).find('events', { host: hostId, slug }, { limit: 2 }).some((e) => e.id !== id)
  if (taken) reject(409, 'slug_taken', 'You already have an event at that link.')
}

export function createEvent(env, host, input) {
  const doc = clean(input, null)
  uniqueSlug(env, host.id, doc.slug, null)
  if (ds(env).count('events', { host: host.id }) >= 40) reject(400, 'too_many', 'Up to 40 event types.')
  const order = eventsOf(env, host.id).reduce((n, e) => Math.max(n, (e.order ?? 0) + 1), 0)
  const id = ds(env).insert('events', { ...doc, host: host.id, order })
  return ds(env).findOne('events', id)
}

export function updateEvent(env, host, id, input) {
  const event = ds(env).findOne('events', id)
  if (!event || event.host !== host.id) reject(404, 'not_found', 'That event type is gone.')
  const set = clean(input, event)
  if (set.slug && set.slug !== event.slug) uniqueSlug(env, host.id, set.slug, id)
  if ('order' in input) set.order = int(input.order, 'Order', 0, 1000)
  ds(env).update('events', { id }, { $set: set })
  return { ...event, ...set }
}

export function deleteEvent(env, host, id) {
  const event = ds(env).findOne('events', id)
  if (!event || event.host !== host.id) reject(404, 'not_found', 'That event type is gone.')
  ds(env).delete('events', { id })
}

export function createDefaults(env, host) {
  if (ds(env).count('events', { host: host.id })) return
  ds(env).insert('events', { host: host.id, order: 0, title: 'Quick chat', slug: 'chat', duration: 15, step: 0, notice: 240, window: 60, before: 0, after: 0, location: { kind: 'none', value: '' }, description: '', color: 'blue', active: true })
  ds(env).insert('events', { host: host.id, order: 1, title: 'Meeting', slug: 'meeting', duration: 30, step: 0, notice: 240, window: 60, before: 0, after: 0, location: { kind: 'none', value: '' }, description: '', color: 'red', active: true })
}

// The step between start times: the meeting's length, up to half an hour.
export const stepOf = (event) => event.step || Math.min(event.duration, 30)

export function locationLabel(location, hostName) {
  const l = location || { kind: 'none' }
  if (l.kind === 'video') return 'Video call'
  if (l.kind === 'phone') return `Phone call · ${hostName || 'your host'} will call you`
  if (l.kind === 'place') return l.value
  if (l.kind === 'custom') return l.value
  return ''
}

export function eventDTO(event, { mine = false, hostName = '' } = {}) {
  const location = event.location || { kind: 'none', value: '' }
  return {
    ...(mine ? { id: event.id, step: event.step || 0 } : {}),
    slug: event.slug,
    title: event.title,
    duration: event.duration,
    description: event.description || '',
    color: event.color || 'blue',
    notice: event.notice,
    window: event.window,
    before: event.before || 0,
    after: event.after || 0,
    active: event.active !== false,
    location: mine ? location : { kind: location.kind, value: location.kind === 'video' ? '' : location.value, label: locationLabel(location, hostName) }
  }
}
