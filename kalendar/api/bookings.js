// Bookings: open times, booking one (no account needed), seeing and
// cancelling it with the secret link from the email, moving it, and the
// host's list and calendar feed.
import { reject, text, longText, email as cleanEmail, int, randomId, sha256, sameHash, MIN, DAY, HOUR } from './lib.js'
import { offsetAt, cleanZone, cleanZoneLabel } from './tz.js'
import { slotsFor } from './slots.js'
import { hostByHandle, publicHost } from './hosts.js'
import { eventBySlug, eventDTO, stepOf } from './events.js'
import { inviteeMail, hostMail, send } from './mail.js'
import { calendar, googleLink, outlookLink } from './ics.js'

const ds = (env) => env.holm.app.ds
const kv = (env) => env.holm.app.kv

// Times already taken, with each booking's own buffers.
function busyFor(env, hostId, lo, hi, skip = null) {
  return ds(env).find('bookings', { host: hostId, status: 'confirmed', from: { $lt: hi }, to: { $gt: lo } }, { limit: 500 })
    .filter((b) => b.id !== skip).map((b) => [b.from, b.to])
}

const shape = (event) => ({ duration: event.duration, step: stepOf(event), notice: event.notice ?? 240, window: event.window ?? 60, before: event.before || 0, after: event.after || 0 })

function bookable(env, handle, slug) {
  const host = hostByHandle(env, handle)
  if (!host) reject(404, 'not_found', 'There’s no one at that link.')
  const event = eventBySlug(env, host.id, slug)
  if (!event || event.active === false) reject(404, 'not_found', `${host.name} doesn’t offer that any more.`)
  return { host, event }
}

// GET /api/u/:handle/:slug/slots?from&to — up to 45 days at a time.
export function openSlots(env, handle, slug, from, to, now, skip = null) {
  const { host, event } = bookable(env, handle, slug)
  const lo = Number(from)
  let hi = Number(to)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) reject(400, 'invalid_input', 'Ask for a range of days.')
  hi = Math.min(hi, lo + 45 * DAY)
  const busy = busyFor(env, host.id, lo - DAY, hi + DAY, skip)
  const slots = slotsFor(host, shape(event), busy, lo, hi, now)
  const horizon = now + (event.window ?? 60) * DAY
  return { slots, until: horizon, earliest: now + (event.notice ?? 240) * MIN }
}

export function bookingPage(env, handle, slug) {
  const { host, event } = bookable(env, handle, slug)
  return { host: publicHost(host), event: eventDTO(event, { hostName: host.name }) }
}

async function withToken(env, id, token) {
  const b = typeof id === 'string' && id.length < 40 ? ds(env).findOne('bookings', id) : null
  if (!b || typeof token !== 'string' || !sameHash(b.tokenHash, await sha256(token))) reject(404, 'not_found', 'This link doesn’t open a booking. Check the email it came in.')
  return b
}

function links(env, base, b, host, token) {
  const manage = `${base}/b/${b.id}?t=${token}`
  const entry = calendarEntry(b, host, base, manage, false)
  return {
    manage,
    reschedule: `${base}/@${host.handle}/${b.slug}?reschedule=${b.id}&t=${token}`,
    ics: `${base}/b/${b.id}/invite.ics?t=${token}`,
    google: googleLink(entry),
    outlook: outlookLink(entry),
    rebook: `${base}/@${host.handle}/${b.slug}`,
    dashboard: `${base}/`
  }
}

function placeText(b) {
  const l = b.location || {}
  if (l.kind === 'video') return l.value || 'Video call'
  if (l.kind === 'phone') return b.phone ? `Phone: ${b.phone}` : 'Phone call'
  if (l.kind === 'place' || l.kind === 'custom') return l.value
  return ''
}

// The event as a calendar shows it, for the invitee or for the host.
function calendarEntry(b, host, base, manage, forHost) {
  const description = forHost
    ? [`${b.name} <${b.email}>`, b.phone ? `Phone: ${b.phone}` : '', b.notes ? `Notes:\n${b.notes}` : '', `Booked through Kalendar: ${base}/`].filter(Boolean).join('\n\n')
    : [`${b.eventTitle} with ${host.name}.`, b.location && b.location.kind === 'video' && b.location.value ? `Join: ${b.location.value}` : '', manage ? `Reschedule or cancel: ${manage}` : ''].filter(Boolean).join('\n\n')
  return {
    id: b.id, start: b.start, end: b.end, updated: b.updatedAt || b.createdAt,
    title: forHost ? `${b.eventTitle} with ${b.name}` : `${b.eventTitle} with ${host.name}`,
    description, location: placeText(b), url: forHost ? `${base}/` : manage,
    cancelled: b.status === 'cancelled', sequence: b.sequence || 0
  }
}

function mailBoth(env, kind, b, host, base, token, old = null) {
  const c = { b, host, base, links: links(env, base, b, host, token), hostOffset: offsetAt(host.tzTable, b.start), old }
  const invitee = send(env, b.email, inviteeMail(kind, c))
  const hostSent = host.notify !== false && host.email ? send(env, host.email, hostMail(kind, c)) : { ok: false, code: 'OFF' }
  return { invitee: invitee.ok, host: hostSent.ok, code: invitee.ok ? null : invitee.code }
}

// The bookings.create operation. Anyone may call it, behind Holm's challenge
// and rate limit; a few more caps here keep it from becoming a mailer.
export async function createBooking(env, input, now, base) {
  const { host, event } = bookable(env, input.handle, input.event)
  const start = Number(input.start)
  if (!Number.isInteger(start)) reject(400, 'invalid_input', 'Pick a time.')
  const name = text(input.name, 80, 'Your name', true)
  const address = cleanEmail(input.email)
  const notes = longText(input.notes, 1000, 'Notes')
  const location = event.location || { kind: 'none', value: '' }
  const phone = text(input.phone, 32, 'Phone number', location.kind === 'phone')
  if (phone && !/^\+?[0-9][0-9 ().-]{5,30}$/.test(phone)) reject(400, 'invalid_input', 'That phone number doesn’t look right.')
  const tz = cleanZone(input.tz)
  const offset = int(input.offset, 'Offset', -840, 840)
  const tzLabel = cleanZoneLabel(input.tzLabel, tz)
  const h24 = input.h24 === true

  let old = null
  let oldToken = null
  if (input.reschedule) {
    old = await withToken(env, input.reschedule.id, input.reschedule.token)
    oldToken = input.reschedule.token
    if (old.host !== host.id) reject(400, 'invalid_input', 'That booking is with someone else.')
    if (old.status !== 'confirmed') reject(410, 'gone', 'That booking was cancelled, so there’s nothing to move.')
  }

  const day = new Date(now).toISOString().slice(0, 10)
  if (kv(env).increment(`cap:mail:${address}:${day}`, 1) > 10) reject(429, 'too_many', 'That address has booked a lot today. Try again tomorrow.')
  if (kv(env).increment(`cap:host:${host.id}:${day}`, 1) > 80) reject(429, 'too_many', `${host.name} can’t take more bookings today.`)

  const s = shape(event)
  const busy = busyFor(env, host.id, start - DAY, start + DAY, old && old.id)
  if (!slotsFor(host, s, busy, start, start + 1, now).includes(start)) reject(409, 'slot_taken', 'That time just went. Pick another.')

  const end = start + event.duration * MIN
  const token = randomId(24)
  const doc = {
    host: host.id, event: event.id, slug: event.slug, eventTitle: event.title, duration: event.duration, color: event.color || 'blue',
    location, start, end, from: start - s.before * MIN, to: end + s.after * MIN,
    name, email: address, phone, notes, tz, tzLabel, offset, h24,
    tokenHash: await sha256(token), status: 'confirmed', sequence: 0, createdAt: now,
    rescheduledFrom: old ? old.id : null
  }
  let id
  ds(env).transaction((tx) => {
    const clash = tx.find('bookings', { host: host.id, status: 'confirmed', from: { $lt: doc.to }, to: { $gt: doc.from } }, { limit: 3 })
      .filter((b) => !old || b.id !== old.id)
    if (clash.length) reject(409, 'slot_taken', 'That time just went. Pick another.')
    id = tx.insert('bookings', doc)
    if (old) tx.update('bookings', { id: old.id }, { $set: { status: 'cancelled', cancelledBy: 'invitee', reason: '', cancelledAt: now, rescheduledTo: id, sequence: (old.sequence || 0) + 1, updatedAt: now } })
  })
  const b = { ...doc, id }
  const emailed = mailBoth(env, old ? 'rescheduled' : 'confirmed', b, host, base, token, old)
  return { booking: inviteeDTO(b, host, links(env, base, b, host, token)), token, emailed }
}

// The bookings.cancel operation, from the link in the email.
export async function cancelByInvitee(env, input, now, base) {
  const b = await withToken(env, input.id, input.token)
  const reason = longText(input.reason, 500, 'Note')
  if (b.status !== 'confirmed') return { ok: true, already: true }
  const host = ds(env).findOne('hosts', b.host)
  const done = { ...b, status: 'cancelled', cancelledBy: 'invitee', reason, cancelledAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now }
  ds(env).update('bookings', { id: b.id }, { $set: { status: done.status, cancelledBy: done.cancelledBy, reason, cancelledAt: now, sequence: done.sequence, updatedAt: now } })
  const emailed = host ? mailBoth(env, 'cancelled', done, host, base, input.token) : null
  return { ok: true, emailed }
}

export async function cancelByHost(env, host, id, input, now, base) {
  const b = ds(env).findOne('bookings', id)
  if (!b || b.host !== host.id) reject(404, 'not_found', 'That booking is gone.')
  if (b.status !== 'confirmed') return { ok: true, already: true }
  const reason = longText(input.reason, 500, 'Note')
  const done = { ...b, status: 'cancelled', cancelledBy: 'host', reason, cancelledAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now }
  ds(env).update('bookings', { id }, { $set: { status: 'cancelled', cancelledBy: 'host', reason, cancelledAt: now, sequence: done.sequence, updatedAt: now } })
  const c = { b: done, host, base, links: { rebook: `${base}/@${host.handle}/${b.slug}` } }
  const sent = send(env, b.email, inviteeMail('cancelled', c))
  return { ok: true, emailed: sent.ok }
}

/* ---- Reading ----------------------------------------------------------------- */

export function inviteeDTO(b, host, l) {
  const location = b.location || { kind: 'none', value: '' }
  return {
    id: b.id, status: b.status, start: b.start, end: b.end, name: b.name, email: b.email, phone: b.phone || '',
    event: { title: b.eventTitle, slug: b.slug, duration: b.duration, color: b.color },
    host: publicHost(host), location: { kind: location.kind, value: location.value },
    cancelledBy: b.cancelledBy || null, reason: b.reason || '', rescheduledTo: b.rescheduledTo || null,
    links: l ? { ics: l.ics, google: l.google, outlook: l.outlook, reschedule: l.reschedule, manage: l.manage } : null
  }
}

export async function bookingForInvitee(env, id, token, base) {
  const b = await withToken(env, id, token)
  const host = ds(env).findOne('hosts', b.host)
  if (!host) reject(404, 'not_found', 'This booking’s host has left Kalendar.')
  return inviteeDTO(b, host, links(env, base, b, host, token))
}

export async function inviteIcs(env, id, token, base, domain) {
  const b = await withToken(env, id, token)
  const host = ds(env).findOne('hosts', b.host)
  if (!host) reject(404, 'not_found', 'This booking’s host has left Kalendar.')
  return calendar([calendarEntry(b, host, base, `${base}/b/${b.id}?t=${token}`, false)], { domain })
}

export function hostDTO(b) {
  return {
    id: b.id, status: b.status, start: b.start, end: b.end, name: b.name, email: b.email, phone: b.phone || '', notes: b.notes || '',
    event: { title: b.eventTitle, slug: b.slug, duration: b.duration, color: b.color || 'blue' }, location: b.location || { kind: 'none', value: '' },
    tz: b.tz, tzLabel: b.tzLabel, cancelledBy: b.cancelledBy || null, reason: b.reason || '', cancelledAt: b.cancelledAt || null,
    rescheduledFrom: b.rescheduledFrom || null, rescheduledTo: b.rescheduledTo || null, createdAt: b.createdAt
  }
}

export function listForHost(env, host, view, now) {
  const all = (query, cap) => {
    const out = []
    let cursor
    do {
      const page = ds(env).find('bookings', query, { page: true, limit: 200, order: 'desc', ...(cursor ? { cursor } : {}) })
      out.push(...page.rows)
      cursor = page.cursor
    } while (cursor && out.length < cap)
    return out
  }
  if (view === 'past') return all({ host: host.id, status: 'confirmed', end: { $lte: now } }, 400).sort((a, b) => b.start - a.start).slice(0, 300).map(hostDTO)
  if (view === 'cancelled') return all({ host: host.id, status: 'cancelled' }, 400).sort((a, b) => b.start - a.start).slice(0, 300).map(hostDTO)
  return all({ host: host.id, status: 'confirmed', end: { $gt: now } }, 1000).sort((a, b) => a.start - b.start).map(hostDTO)
}

export function counts(env, host, now) {
  return {
    upcoming: ds(env).count('bookings', { host: host.id, status: 'confirmed', end: { $gt: now } }),
    today: ds(env).count('bookings', { host: host.id, status: 'confirmed', end: { $gt: now }, start: { $lt: now + 24 * HOUR } })
  }
}

// The host's private feed: the last month and everything ahead.
export function feedFor(env, secret, base, domain, now) {
  if (!/^[a-z0-9]{32}$/.test(String(secret || ''))) return null
  const host = ds(env).find('hosts', { feed: secret }, { limit: 1 })[0]
  if (!host) return null
  const rows = ds(env).find('bookings', { host: host.id, end: { $gt: now - 31 * DAY } }, { limit: 1000, order: 'desc' })
  return calendar(rows.map((b) => calendarEntry(b, host, base, null, true)), { domain, name: `Kalendar · ${host.name}` })
}
