// Bookings: open times, booking one (no account needed), seeing and
// cancelling it with the secret link from the email, moving it, and the
// host's list and calendar feed. A guest can also ask for times outside the
// host's hours: they paint when they could meet, and the host accepts at a
// time inside it or declines. A request never blocks anyone else's booking.
import { reject, text, longText, email as cleanEmail, int, randomId, sha256, hmac, sameHash, cleanTag, MIN, DAY, HOUR } from './lib.js'
import { offsetAt, cleanZone, cleanZoneLabel } from './tz.js'
import { slotsFor } from './slots.js'
import { hostByHandle, publicHost, mailbox } from './hosts.js'
import { eventBySlug, eventDTO, stepOf } from './events.js'
import { inviteeMail, hostMail, guestMail, send } from './mail.js'
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

// Open starts for one of a host's own event types, for their tools.
export function slotsForHost(env, host, event, lo, hi, now) {
  return slotsFor(host, shape(event), busyFor(env, host.id, lo - DAY, hi + DAY), lo, hi, now)
}

// The soonest open start for each event type in the next 30 days, from one
// busy query: { [eventId]: ms | null }.
export function nextOpen(env, host, events, now) {
  const busy = busyFor(env, host.id, now - DAY, now + 31 * DAY)
  const out = {}
  for (const event of events) {
    const s = shape(event)
    const until = now + Math.min(30, s.window) * DAY
    let first = null
    for (const [a, b] of [[now, now + 7 * DAY], [now + 7 * DAY, until]]) {
      if (a >= until) break
      const slots = slotsFor(host, s, busy, a, Math.min(b, until), now)
      if (slots.length) { first = slots[0]; break }
    }
    out[event.id] = first
  }
  return out
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

// Calendar file links end in /calendar, not .ics: Apple Mail hands a link
// ending in .ics to Calendar as a calendar to subscribe to, not an event to add.
function links(env, base, b, host, token) {
  const manage = `${base}/b/${b.id}?t=${token}`
  const rebook = `${base}/@${host.handle}/${b.slug}`
  // A request isn't on anyone's calendar yet: it can only be withdrawn.
  if (b.status === 'requested' || b.status === 'declined') return { manage, rebook, dashboard: `${base}/` }
  const entry = calendarEntry(b, host, base, manage, false)
  return {
    manage,
    reschedule: `${base}/@${host.handle}/${b.slug}?reschedule=${b.id}&t=${token}`,
    ics: `${base}/b/${b.id}/calendar?t=${token}`,
    google: googleLink(entry),
    outlook: outlookLink(entry),
    rebook: `${base}/@${host.handle}/${b.slug}`,
    dashboard: `${base}/`
  }
}

// The host's own copy of a booking, titled with the guest's name, behind
// the links in emails before 0.5.1. They're keyed with the feed secret, so
// a new feed link retires old ones.
const hostKey = (host, id) => hmac(host.feed, `booking:${id}`)

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
    ? [`${b.name} <${b.email}>`, guestsOf(b).length ? `Guests: ${guestsOf(b).join(', ')}` : '', b.phone ? `Phone: ${b.phone}` : '', b.notes ? `Notes:\n${b.notes}` : '', `Booked through Kalendar: ${base}/`].filter(Boolean).join('\n\n')
    : [`${b.eventTitle} with ${host.name}.`, b.location && b.location.kind === 'video' && b.location.value ? `Join: ${b.location.value}` : '', manage ? `Reschedule or cancel: ${manage}` : ''].filter(Boolean).join('\n\n')
  return {
    id: b.uid || b.id, start: b.start, end: b.end, updated: b.updatedAt || b.createdAt,
    title: forHost ? `${b.eventTitle} with ${b.name}` : `${b.eventTitle} with ${host.name}`,
    description, location: placeText(b), url: forHost ? `${base}/` : manage,
    cancelled: b.status === 'cancelled', sequence: b.sequence || 0
  }
}

// The invite that rides in a booking email, so Mail, Gmail and Outlook show
// their own card and put it on the calendar. The guests' names the host as
// organizer (at the address they get booking email), so Accept or Decline
// goes to them, and a cancellation takes the event off again. Everyone the
// booker invited is on it; only the booker's copy links to changing it.
// Requests and declines aren't on anyone's calendar, so they carry none.
const INVITED = ['confirmed', 'accepted', 'rescheduled', 'cancelled']
const guestsOf = (b) => (Array.isArray(b.guests) ? b.guests : [])
export function guestInvite(kind, b, host, base, manage, only = null) {
  if (!INVITED.includes(kind)) return null
  const entry = calendarEntry(b, host, base, manage, false)
  const domain = new URL(base).host
  const organizer = mailbox(host)
  if (!organizer) return { method: 'PUBLISH', ics: calendar([entry], { domain }) }
  const method = kind === 'cancelled' ? 'CANCEL' : 'REQUEST'
  const attendees = only ? [{ email: only }] : [{ name: b.name, email: b.email }, ...guestsOf(b).map((email) => ({ email }))]
  const invite = { ...entry, cancelled: method === 'CANCEL', organizer: { name: host.name, email: organizer }, attendees }
  return { method, ics: calendar([invite], { domain, method }) }
}

// The host's copy is an invitation too, from Kalendar's own address (the
// sender Holm reports), so their calendar takes it in by itself and drops or
// moves it when the booking does. The host offered the time, so it comes
// already accepted, and it has a UID of its own, since Kalendar organizes it
// and not the host. Without that address it just publishes the event.
export function hostInvite(kind, b, host, base, sender = null) {
  if (!INVITED.includes(kind)) return null
  const entry = calendarEntry(b, host, base, null, true)
  const domain = new URL(base).host
  const to = mailbox(host)
  if (!sender || !to) return { method: 'PUBLISH', ics: calendar([entry], { domain }) }
  const method = kind === 'cancelled' ? 'CANCEL' : 'REQUEST'
  const invite = { ...entry, id: `${entry.id}-host`, organizer: sender, attendees: [{ name: host.name, email: to, accepted: true }] }
  return { method, ics: calendar([invite], { domain, method }) }
}

async function mailBoth(env, kind, b, host, base, token, old = null) {
  const started = Date.now()
  const c = { b, host, base, links: links(env, base, b, host, token), hostOffset: offsetAt(host.tzTable, b.start), hostTable: host.tzTable, old }
  const invitee = send(env, b.email, { ...inviteeMail(kind, c), calendar: guestInvite(kind, b, host, base, c.links.manage) })
  const hostLinkSet = { dashboard: `${base}/`, review: `${base}/?r=${b.id}` }
  const to = mailbox(host)
  const hostSent = host.notify !== false && to ? send(env, to, { ...hostMail(kind, { ...c, links: hostLinkSet }), calendar: hostInvite(kind, b, host, base, invitee.from) }) : { ok: false, code: 'OFF' }
  const waiting = INVITED.includes(kind) ? tellGuests(env, b, host, base, guestKinds(kind, b, old), started) : 0
  return { invitee: invitee.ok, host: hostSent.ok, code: invitee.ok ? null : invitee.code, waiting }
}

/* ---- The booker's guests ------------------------------------------------------- */

// Up to five more people the booker invites, by address: not the booker or
// the host, no repeats.
const MAX_GUESTS = 5
function cleanGuests(value, booker, host) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_GUESTS) reject(400, 'invalid_input', `Invite up to ${MAX_GUESTS} people.`)
  const out = []
  for (const v of value) {
    let address
    try { address = cleanEmail(v, 'Guest') } catch { reject(400, 'invalid_guest', `${String(v).slice(0, 80)} doesn’t look like an email address.`) }
    if (address === booker || (host.email && address === host.email.toLowerCase()) || out.includes(address)) continue
    out.push(address)
  }
  return out
}

// Who hears what: the guests now on it, and on a move, anyone the booker
// took off the list.
function guestKinds(kind, b, old) {
  const now = guestsOf(b).map((to) => ({ to, kind: kind === 'accepted' ? 'confirmed' : kind === 'rescheduled' && old && !guestsOf(old).includes(to) ? 'confirmed' : kind }))
  const gone = kind === 'rescheduled' && old ? guestsOf(old).filter((to) => !guestsOf(b).includes(to)).map((to) => ({ to, kind: 'removed' })) : []
  return [...now, ...gone]
}

// Guests' emails go out after the booker's and the host's, while the request
// has time (Holm sends one at a time, and a request stops near five
// seconds). The rest wait on the booking, newest news per address, for
// POST /api/b/:id/flush from the page, or the next change.
const SEND_FOR = 2500
function tellGuests(env, b, host, base, jobs, started) {
  const queue = (Array.isArray(b.outbox) ? b.outbox : []).filter((j) => !jobs.some((n) => n.to === j.to))
  queue.push(...jobs)
  return sendGuests(env, b, host, base, queue, started)
}

function sendGuests(env, b, host, base, queue, started) {
  let n = 0
  while (n < queue.length && Date.now() - started < SEND_FOR) {
    const { to, kind } = queue[n++]
    const removed = kind === 'removed'
    const mailKind = removed ? 'cancelled' : kind
    send(env, to, { ...guestMail(mailKind, { b, host, base, removed }), calendar: guestInvite(mailKind, b, host, base, null, removed ? to : null) })
  }
  const rest = queue.slice(n)
  if (rest.length || (Array.isArray(b.outbox) && b.outbox.length)) ds(env).update('bookings', { id: b.id }, { $set: { outbox: rest } })
  b.outbox = rest
  return rest.length
}

// Sends what's waiting for a booking's guests. Anyone may ask: it only
// sends what's already due, to the addresses the booker gave.
export function flushGuests(env, id, base) {
  const b = typeof id === 'string' && id.length < 40 ? ds(env).findOne('bookings', id) : null
  if (!b || !Array.isArray(b.outbox) || !b.outbox.length) return { waiting: 0 }
  const host = ds(env).findOne('hosts', b.host)
  if (!host) return { waiting: 0 }
  return { waiting: sendGuests(env, b, host, base, b.outbox, Date.now()) }
}

/* ---- Requests ---------------------------------------------------------------- */

// The stretches a guest painted: 1–12, on five-minute marks, each long enough
// for the meeting and at most twelve hours, from half an hour ahead to the
// event's horizon. Overlapping or touching stretches merge.
export function cleanRequestRanges(value, start, event, now) {
  const dur = event.duration * MIN
  let ranges = value
  if (ranges === undefined || ranges === null) {
    if (!Number.isInteger(start)) reject(400, 'invalid_input', 'Paint when you could meet.')
    ranges = [[start, start + dur]]
  }
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 12) reject(400, 'invalid_input', 'Send one to twelve stretches of time.')
  const lo = now + 30 * MIN
  const hi = now + (event.window ?? 60) * DAY
  const sorted = ranges.map((r) => {
    if (!Array.isArray(r) || r.length !== 2) reject(400, 'invalid_input', 'Each stretch is a start and an end.')
    const [a, b] = r.map(Number)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a % (5 * MIN) || b % (5 * MIN)) reject(400, 'invalid_input', 'Times go in five-minute steps.')
    if (b - a < dur) reject(400, 'invalid_input', `Each stretch needs at least ${event.duration} minutes.`)
    if (a < lo) reject(400, 'too_soon', 'Ask for times at least half an hour from now.')
    if (b > hi) reject(400, 'too_far', `Ask for times up to ${event.window ?? 60} days ahead.`)
    return [a, b]
  }).sort((x, y) => x[0] - y[0])
  const merged = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push(r.slice())
  }
  for (const [a, b] of merged) if (b - a > 12 * HOUR) reject(400, 'invalid_input', 'Keep each stretch under twelve hours.')
  return merged
}

const sameRanges = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1])

// The host says yes at a time inside what the guest painted.
export async function acceptRequest(env, host, id, input, now, base) {
  const b = ds(env).findOne('bookings', id)
  if (!b || b.host !== host.id) reject(404, 'not_found', 'That request is gone.')
  if (b.status !== 'requested') reject(409, 'not_pending', b.status === 'confirmed' ? 'You already accepted it.' : 'That request was withdrawn or declined.')
  const ranges = Array.isArray(b.ranges) && b.ranges.length ? b.ranges : [[b.start, b.end]]
  const dur = b.duration * MIN
  let start = input && input.start
  if (start === undefined || start === null || start === '') {
    if (ranges.length === 1 && ranges[0][1] - ranges[0][0] === dur) start = ranges[0][0]
    else reject(400, 'invalid_input', 'Pick a start time inside what they offered.')
  }
  start = Number(start)
  if (!Number.isInteger(start) || start % (5 * MIN)) reject(400, 'invalid_input', 'Pick a start time on a five-minute mark.')
  if (start <= now) reject(410, 'gone', 'That time has passed.')
  if (!ranges.some(([a, z]) => start >= a && start + dur <= z)) reject(400, 'invalid_input', 'That time isn’t inside what they offered.')
  const event = ds(env).findOne('events', b.event)
  const before = event ? event.before || 0 : 0
  const after = event ? event.after || 0 : 0
  let token = b.pendingToken
  const set = {
    status: 'confirmed', start, end: start + dur, from: start - before * MIN, to: start + dur + after * MIN,
    acceptedAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now, pendingToken: null
  }
  if (!token) {
    token = randomId(24)
    set.tokenHash = await sha256(token)
  }
  ds(env).transaction((tx) => {
    const cur = tx.find('bookings', { id }, { limit: 1 })[0]
    if (!cur || cur.status !== 'requested') reject(409, 'not_pending', 'That request was withdrawn or declined.')
    const clash = tx.find('bookings', { host: host.id, status: 'confirmed', from: { $lt: set.to }, to: { $gt: set.from } }, { limit: 1 })
    if (clash.length) reject(409, 'clash', 'You already have something then.')
    tx.update('bookings', { id }, { $set: set })
  })
  const done = { ...b, ...set }
  const emailed = await mailBoth(env, 'accepted', done, host, base, token)
  return { ok: true, booking: hostDTO(done), emailed }
}

export function declineRequest(env, host, id, input, now, base) {
  const b = ds(env).findOne('bookings', id)
  if (!b || b.host !== host.id) reject(404, 'not_found', 'That request is gone.')
  if (b.status !== 'requested') reject(409, 'not_pending', b.status === 'confirmed' ? 'You accepted it; cancel the booking instead.' : 'That request was already withdrawn or declined.')
  const reason = longText(input && input.reason, 500, 'Note')
  const set = { status: 'declined', reason, declinedAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now, pendingToken: null }
  ds(env).update('bookings', { id }, { $set: set })
  const done = { ...b, ...set }
  const sent = send(env, b.email, inviteeMail('declined', { b: done, host, base, links: { rebook: `${base}/@${host.handle}/${b.slug}` } }))
  return { ok: true, emailed: sent.ok }
}

// The bookings.create operation. Anyone may call it, behind Holm's challenge
// and rate limit; a few more caps here keep it from becoming a mailer.
export async function createBooking(env, input, now, base) {
  const { host, event } = bookable(env, input.handle, input.event)
  const asking = input.request === true && !input.reschedule
  const start = input.start === undefined || input.start === null ? null : Number(input.start)
  if (start === null ? !asking : !Number.isInteger(start)) reject(400, 'invalid_input', 'Pick a time.')
  const name = text(input.name, 80, 'Your name', true)
  const address = cleanEmail(input.email)
  let guests = cleanGuests(input.guests, address, host)
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
    // A move without a guest list keeps the one it had.
    if (input.guests === undefined) guests = guestsOf(old)
  }
  // The link that brought them (?ref=), for the host's stats. A bad one is
  // dropped, never a reason to refuse the booking; a move keeps the first.
  const ref = cleanTag(input.ref) || (old && old.ref) || null

  const day = new Date(now).toISOString().slice(0, 10)
  if (kv(env).increment(`cap:mail:${address}:${day}`, 1) > 10) reject(429, 'too_many', 'That address has booked a lot today. Try again tomorrow.')
  if (kv(env).increment(`cap:host:${host.id}:${day}`, 1) > 80) reject(429, 'too_many', `${host.name} can’t take more bookings today.`)

  const s = shape(event)
  // An open time books at once, even when it came as a request; anything else
  // is a request when the guest asked and the host takes them.
  const open = start !== null && (!asking || input.ranges === undefined || input.ranges === null) &&
    slotsFor(host, s, busyFor(env, host.id, start - DAY, start + DAY, old && old.id), start, start + 1, now).includes(start)
  if (!open) {
    if (!asking) reject(409, 'slot_taken', 'That time just went. Pick another.')
    if (event.requests === false) reject(409, 'slot_taken', `${host.name} only takes the times shown.`)
    return createRequest(env, { host, event, input, start, now, base, name, address, guests, notes, location, phone, tz, tzLabel, offset, h24, ref })
  }

  const end = start + event.duration * MIN
  const token = randomId(24)
  const doc = {
    host: host.id, event: event.id, slug: event.slug, eventTitle: event.title, duration: event.duration, color: event.color || 'blue',
    location, start, end, from: start - s.before * MIN, to: end + s.after * MIN,
    name, email: address, guests, phone, notes, tz, tzLabel, offset, h24, ref,
    tokenHash: await sha256(token), status: 'confirmed', sequence: 0, createdAt: now,
    rescheduledFrom: old ? old.id : null,
    // A move is the same calendar event at a new time: same UID, one
    // version on, so calendars move it rather than add a second.
    ...(old ? { uid: old.uid || old.id, sequence: (old.sequence || 0) + 1 } : {})
  }
  let id
  ds(env).transaction((tx) => {
    const clash = tx.find('bookings', { host: host.id, status: 'confirmed', from: { $lt: doc.to }, to: { $gt: doc.from } }, { limit: 3 })
      .filter((b) => !old || b.id !== old.id)
    if (clash.length) reject(409, 'slot_taken', 'That time just went. Pick another.')
    id = tx.insert('bookings', doc)
    if (old) tx.update('bookings', { id: old.id }, { $set: { status: 'cancelled', cancelledBy: 'invitee', reason: '', cancelledAt: now, rescheduledTo: id, sequence: (old.sequence || 0) + 1, updatedAt: now, outbox: [] } })
  })
  const b = { ...doc, id }
  const emailed = await mailBoth(env, old ? 'rescheduled' : 'confirmed', b, host, base, token, old)
  return { booking: inviteeDTO(b, host, links(env, base, b, host, token)), token, emailed }
}

async function createRequest(env, c) {
  const { host, event, input, start, now, base } = c
  const ranges = cleanRequestRanges(input.ranges, start, event, now)
  const pending = ds(env).find('bookings', { host: host.id, email: c.address, status: 'requested' }, { limit: 50 })
  if (pending.some((b) => sameRanges(b.ranges, ranges))) reject(409, 'already_asked', `You’ve already asked ${host.name} for these times.`)
  if (pending.length >= 5) reject(429, 'too_many', `You have several requests waiting with ${host.name}. Wait for an answer first.`)
  const token = randomId(24)
  const first = ranges[0][0]
  const doc = {
    host: host.id, event: event.id, slug: event.slug, eventTitle: event.title, duration: event.duration, color: event.color || 'blue',
    location: c.location, start: first, end: first + event.duration * MIN, from: first, to: first + event.duration * MIN,
    ranges, until: ranges[ranges.length - 1][1], asked: true,
    name: c.name, email: c.address, guests: c.guests, phone: c.phone, notes: c.notes, tz: c.tz, tzLabel: c.tzLabel, offset: c.offset, h24: c.h24, ref: c.ref,
    tokenHash: await sha256(token), pendingToken: token, status: 'requested', sequence: 0, createdAt: now, rescheduledFrom: null
  }
  const id = ds(env).insert('bookings', doc)
  const b = { ...doc, id }
  const emailed = await mailBoth(env, 'requested', b, host, base, token)
  return { booking: inviteeDTO(b, host, links(env, base, b, host, token)), token, emailed, requested: true }
}

// The bookings.cancel operation, from the link in the email. On a request
// it withdraws it, and only the host hears.
export async function cancelByInvitee(env, input, now, base) {
  const b = await withToken(env, input.id, input.token)
  const reason = longText(input.reason, 500, 'Note')
  if (b.status === 'requested') {
    const host = ds(env).findOne('hosts', b.host)
    const set = { status: 'cancelled', cancelledBy: 'invitee', reason, cancelledAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now, pendingToken: null }
    ds(env).update('bookings', { id: b.id }, { $set: set })
    const done = { ...b, ...set }
    const sent = host && host.notify !== false && mailbox(host) ? send(env, mailbox(host), hostMail('withdrawn', { b: done, host, base, hostOffset: offsetAt(host.tzTable, b.start), hostTable: host.tzTable, links: { dashboard: `${base}/` } })) : { ok: false }
    return { ok: true, withdrawn: true, emailed: { invitee: false, host: sent.ok } }
  }
  if (b.status !== 'confirmed') return { ok: true, already: true }
  const host = ds(env).findOne('hosts', b.host)
  const done = { ...b, status: 'cancelled', cancelledBy: 'invitee', reason, cancelledAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now }
  ds(env).update('bookings', { id: b.id }, { $set: { status: done.status, cancelledBy: done.cancelledBy, reason, cancelledAt: now, sequence: done.sequence, updatedAt: now } })
  const emailed = host ? await mailBoth(env, 'cancelled', done, host, base, input.token) : null
  return { ok: true, emailed }
}

export async function cancelByHost(env, host, id, input, now, base) {
  const b = ds(env).findOne('bookings', id)
  if (!b || b.host !== host.id) reject(404, 'not_found', 'That booking is gone.')
  if (b.status !== 'confirmed') return { ok: true, already: true }
  const reason = longText(input.reason, 500, 'Note')
  const done = { ...b, status: 'cancelled', cancelledBy: 'host', reason, cancelledAt: now, sequence: (b.sequence || 0) + 1, updatedAt: now }
  ds(env).update('bookings', { id }, { $set: { status: 'cancelled', cancelledBy: 'host', reason, cancelledAt: now, sequence: done.sequence, updatedAt: now } })
  const started = Date.now()
  const c = { b: done, host, base, links: { rebook: `${base}/@${host.handle}/${b.slug}` } }
  const sent = send(env, b.email, { ...inviteeMail('cancelled', c), calendar: guestInvite('cancelled', done, host, base, null) })
  // Takes it off the host's calendar too, when an invite put it there.
  if (sent.from && host.notify !== false && mailbox(host)) {
    send(env, mailbox(host), { ...hostMail('cancelled', { ...c, hostOffset: offsetAt(host.tzTable, b.start), links: { dashboard: `${base}/` } }), calendar: hostInvite('cancelled', done, host, base, sent.from) })
  }
  const waiting = tellGuests(env, done, host, base, guestKinds('cancelled', done, null), started)
  return { ok: true, emailed: sent.ok, waiting }
}

/* ---- Reading ----------------------------------------------------------------- */

export function inviteeDTO(b, host, l) {
  const location = b.location || { kind: 'none', value: '' }
  return {
    id: b.id, status: b.status, start: b.start, end: b.end, name: b.name, email: b.email, phone: b.phone || '',
    event: { title: b.eventTitle, slug: b.slug, duration: b.duration, color: b.color },
    host: publicHost(host), location: { kind: location.kind, value: location.value },
    cancelledBy: b.cancelledBy || null, reason: b.reason || '', rescheduledTo: b.rescheduledTo || null,
    ranges: b.ranges || null, asked: !!b.asked, h24: !!b.h24, tz: b.tz || null, guests: guestsOf(b),
    links: !l ? null : l.ics ? { ics: l.ics, google: l.google, outlook: l.outlook, reschedule: l.reschedule, manage: l.manage, rebook: l.rebook } : { manage: l.manage, rebook: l.rebook }
  }
}

export async function bookingForInvitee(env, id, token, base) {
  const b = await withToken(env, id, token)
  const host = ds(env).findOne('hosts', b.host)
  if (!host) reject(404, 'not_found', 'This booking’s host has left Kalendar.')
  return inviteeDTO(b, host, links(env, base, b, host, token))
}

// A booking that moved hands its calendar event to the new one, so it's no
// longer a calendar entry of its own.
const onCalendar = (b) => !b.rescheduledTo && (b.status === 'confirmed' || (b.status === 'cancelled' && !(b.asked && !b.acceptedAt)))
const moved = (b) => { if (b.rescheduledTo) reject(410, 'gone', 'This booking moved. The email about the new time has its calendar invite.') }

export async function inviteIcs(env, id, token, base, domain) {
  const b = await withToken(env, id, token)
  moved(b)
  if (!onCalendar(b)) reject(404, 'not_found', 'This isn’t booked yet.')
  const host = ds(env).findOne('hosts', b.host)
  if (!host) reject(404, 'not_found', 'This booking’s host has left Kalendar.')
  return calendar([calendarEntry(b, host, base, `${base}/b/${b.id}?t=${token}`, false)], { domain })
}

export async function hostIcs(env, id, key, base, domain) {
  const b = typeof id === 'string' && id.length < 40 ? ds(env).findOne('bookings', id) : null
  const host = b && ds(env).findOne('hosts', b.host)
  if (!host || typeof key !== 'string' || !sameHash(key, await hostKey(host, b.id))) reject(404, 'not_found', 'This link doesn’t open a booking. Check the email it came in.')
  moved(b)
  if (!onCalendar(b)) reject(404, 'not_found', 'This isn’t booked yet.')
  return calendar([calendarEntry(b, host, base, null, true)], { domain })
}

export function hostDTO(b) {
  return {
    id: b.id, status: b.status, start: b.start, end: b.end, name: b.name, email: b.email, phone: b.phone || '', notes: b.notes || '',
    event: { title: b.eventTitle, slug: b.slug, duration: b.duration, color: b.color || 'blue' }, location: b.location || { kind: 'none', value: '' },
    tz: b.tz, tzLabel: b.tzLabel, cancelledBy: b.cancelledBy || null, reason: b.reason || '', cancelledAt: b.cancelledAt || null,
    rescheduledFrom: b.rescheduledFrom || null, rescheduledTo: b.rescheduledTo || null, createdAt: b.createdAt,
    ranges: b.ranges || null, asked: !!b.asked, acceptedAt: b.acceptedAt || null, declinedAt: b.declinedAt || null,
    ref: b.ref || null, guests: guestsOf(b), waiting: Array.isArray(b.outbox) ? b.outbox.length : 0
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
  if (view === 'cancelled') return all({ host: host.id, status: { $in: ['cancelled', 'declined'] } }, 400).sort((a, b) => b.start - a.start).slice(0, 300).map(hostDTO)
  if (view === 'requests') return all({ host: host.id, status: 'requested', until: { $gt: now } }, 400).sort((a, b) => a.start - b.start).map(hostDTO)
  return all({ host: host.id, status: 'confirmed', end: { $gt: now } }, 1000).sort((a, b) => a.start - b.start).map(hostDTO)
}

export function counts(env, host, now) {
  return {
    upcoming: ds(env).count('bookings', { host: host.id, status: 'confirmed', end: { $gt: now } }),
    today: ds(env).count('bookings', { host: host.id, status: 'confirmed', end: { $gt: now }, start: { $lt: now + 24 * HOUR } }),
    requests: ds(env).count('bookings', { host: host.id, status: 'requested', until: { $gt: now } })
  }
}

// The host's private feed: the last month and everything ahead.
export function feedFor(env, secret, base, domain, now) {
  if (!/^[a-z0-9]{32}$/.test(String(secret || ''))) return null
  const host = ds(env).find('hosts', { feed: secret }, { limit: 1 })[0]
  if (!host) return null
  const rows = ds(env).find('bookings', { host: host.id, end: { $gt: now - 31 * DAY } }, { limit: 1000, order: 'desc' }).filter(onCalendar)
  return calendar(rows.map((b) => calendarEntry(b, host, base, null, true)), { domain, name: `Kalendar · ${host.name}` })
}
