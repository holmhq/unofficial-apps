// Named operations (contract.json). Booking takes no account, so it sits
// behind Holm's challenge and rate limit, plus the caps in bookings.js. The
// rest are the host's tools for Claude through Holm's MCP endpoint
// (/_holm/mcp): open to anyone signed in (auth "user"), and each acts only
// on the caller's own Kalendar.
import { origin, reject, text, cleanTag, MIN, DAY } from './lib.js'
import { hostOf, updateHost, privateHost } from './hosts.js'
import { eventsOf, eventDTO, createEvent, updateEvent, deleteEvent, stepOf } from './events.js'
import { createBooking, cancelByInvitee, cancelByHost, acceptRequest, declineRequest, listForHost, counts, slotsForHost } from './bookings.js'
import { statsFor } from './stats.js'
import { offsetAt, toUtc, parts, clockRange, shortDate, longDate, ymd, gmt } from './tz.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 410: 'APP_GONE', 413: 'APP_INVALID_INPUT', 429: 'APP_RATE_LIMITED' }

// The contract declares no error details, so what they carry is already in the message.
async function op(run) {
  try {
    return await run()
  } catch (error) {
    if (error && error.public) {
      error.code = CODES[error.status] || 'APP_INVALID_INPUT'
      delete error.details
    }
    throw error
  }
}

export function opBook(input, env) {
  return op(() => createBooking(env, input, Date.now(), origin(env)))
}

export function opCancel(input, env) {
  return op(() => cancelByInvitee(env, input, Date.now(), origin(env)))
}

/* ---- The host's tools ------------------------------------------------------------ */

function caller(env) {
  const auth = env.holm.auth
  let m = null
  try { m = auth.isLoggedIn() ? auth.getMember() : null } catch { m = null }
  if (!m || !m.id) reject(401, 'sign_in', 'Sign in first.')
  const host = hostOf(env, m.id)
  if (!host) reject(409, 'no_host', `Open ${origin(env) || 'Kalendar'} once and choose your link; your time zone comes from your browser. Then these tools work.`)
  return { m, host }
}

function tool(env, run) {
  return op(() => run(caller(env), Date.now()))
}

const pad = (n) => String(n).padStart(2, '0')

// "2026-10-30T10:30:00+04:00", in the host's zone.
function iso(host, ms) {
  const off = offsetAt(host.tzTable, ms)
  const a = Math.abs(off)
  return `${new Date(ms + off * MIN).toISOString().slice(0, 19)}${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}

// "Thu, Oct 30, 10:30 – 11:00 AM"
function when(host, start, end) {
  const off = offsetAt(host.tzTable, start)
  return `${shortDate(parts(start, off))}, ${clockRange(start, end, off, false)}`
}

// An ISO 8601 time (with an offset, or else read in the host's zone) or Unix ms.
function instant(host, value, label) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const s = String(value ?? '').trim()
  if (/^\d{12,14}$/.test(s)) return Number(s)
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s)
  if (!m) reject(400, 'invalid_input', `${label}: use a time like 2026-10-30T10:30:00+04:00.`)
  const local = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}Z`)
  if (Number.isNaN(local)) reject(400, 'invalid_input', `${label}: that date doesn’t exist.`)
  if (!m[5]) {
    const utc = toUtc(host.tzTable, local)
    if (utc === null) reject(400, 'invalid_input', `${label}: the clocks skip that time.`)
    return utc
  }
  if (m[5] === 'Z') return local
  const sign = m[5][0] === '-' ? -1 : 1
  const digits = m[5].slice(1).replace(':', '')
  return local - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * MIN
}

const link = (env, host) => `${origin(env)}/@${host.handle}`

function meeting(host, b) {
  const out = {
    id: b.id, status: b.status, event: b.event.title, event_slug: b.event.slug, minutes: b.event.duration,
    guest: { name: b.name, email: b.email, phone: b.phone || undefined }, notes: b.notes || undefined,
    guest_zone: b.tzLabel || b.tz || undefined
  }
  if (b.status === 'requested') {
    out.ranges = (b.ranges || [[b.start, b.end]]).map(([a, z]) => ({ from: iso(host, a), to: iso(host, z), when: when(host, a, z) }))
    out.next = `Accept with requests_accept { id, start } at a start inside one range (the meeting is ${b.event.duration} min), or requests_decline.`
  } else {
    out.start = iso(host, b.start)
    out.end = iso(host, b.end)
    out.when = when(host, b.start, b.end)
  }
  if (b.reason) out.reason = b.reason
  if (b.cancelledBy) out.cancelled_by = b.cancelledBy === 'host' ? 'you' : 'guest'
  if (b.rescheduledTo) out.moved = true
  if (b.ref) out.came_from = b.ref
  return out
}

/* me.get */
export function opMe(input, env) {
  return tool(env, ({ host }, now) => {
    const c = counts(env, host, now)
    const up = listForHost(env, host, 'upcoming', now)[0]
    const p = privateHost(env, host, origin(env))
    return {
      link: link(env, host), handle: host.handle, name: host.name,
      profile: { bio: p.bio, role: p.role, company: p.company, place: p.place, website: p.website, links: p.links },
      zone: host.tz, zone_label: host.tzLabel, now: iso(host, now), emails_on: host.notify !== false,
      counts: c,
      next_meeting: up ? meeting(host, up) : null,
      next: c.requests
        ? `${c.requests} request${c.requests === 1 ? '' : 's'} waiting: meetings_list { view: "requests" }, then requests_accept or requests_decline.`
        : 'meetings_list shows bookings; hours_get and events_list show what people can book.'
    }
  })
}

/* profile.update */
export function opProfile(input, env) {
  return tool(env, ({ m, host }, now) => {
    const change = {}
    for (const k of ['name', 'bio', 'role', 'company', 'place', 'website', 'links', 'notify']) if (k in input) change[k] = input[k]
    if (!Object.keys(change).length) reject(400, 'invalid_input', 'Send at least one field to change.')
    const next = updateHost(env, m, host, change, now)
    const p = privateHost(env, next, origin(env))
    return { link: link(env, next), name: p.name, bio: p.bio, role: p.role, company: p.company, place: p.place, website: p.website, links: p.links, emails_on: p.notify }
  })
}

/* hours.get / hours.update */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
function minutes(value, label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  const v = m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  if (!m || Number(m[2]) > 59 || v > 1440) reject(400, 'invalid_input', `${label}: write times like "09:00" (24-hour, "24:00" for midnight).`)
  return v
}

const dayIndex = (k) => {
  const i = DAY_KEYS.indexOf(k)
  if (i < 0) reject(400, 'invalid_input', `Days are ${DAY_KEYS.join(', ')}.`)
  return i
}

function hoursOf(host, now) {
  const today = ymd(now + offsetAt(host.tzTable, now) * MIN)
  const overrides = host.overrides || {}
  const keys = Object.keys(overrides).filter((k) => k >= today).sort()
  const paused = Array.isArray(host.paused) ? host.paused : []
  return {
    zone: host.tz, zone_label: host.tzLabel,
    weekly: Object.fromEntries(DAY_KEYS.map((k, i) => [k, (host.weekly[i] || []).map(([a, b]) => [hhmm(a), hhmm(b)])])),
    paused: DAY_KEYS.filter((k, i) => paused.includes(i)),
    ...(paused.length ? { paused_note: 'Paused days keep their hours but offer no times until unpaused.' } : {}),
    days_off: keys.filter((k) => !overrides[k].length),
    special_hours: Object.fromEntries(keys.filter((k) => overrides[k].length).map((k) => [k, overrides[k].map(([a, b]) => [hhmm(a), hhmm(b)])]))
  }
}

export function opHoursGet(input, env) {
  return tool(env, ({ host }, now) => hoursOf(host, now))
}

export function opHoursUpdate(input, env) {
  return tool(env, ({ m, host }, now) => {
    const change = {}
    if (input.weekly) {
      const weekly = host.weekly.map((r) => r.map((x) => x.slice()))
      for (const [k, ranges] of Object.entries(input.weekly)) {
        const i = dayIndex(k)
        weekly[i] = (ranges || []).map((r) => [minutes(r[0], k), minutes(r[1], k)])
      }
      change.weekly = weekly
    }
    const add = input.days_off_add || []
    const remove = input.days_off_remove || []
    if (add.length || remove.length) {
      const overrides = { ...(host.overrides || {}) }
      for (const d of remove) if (overrides[d] && !overrides[d].length) delete overrides[d]
      for (const d of add) overrides[d] = []
      change.overrides = overrides
    }
    const pause = input.pause || []
    const unpause = input.unpause || []
    if (pause.length || unpause.length) {
      const paused = new Set(Array.isArray(host.paused) ? host.paused : [])
      for (const k of unpause) paused.delete(dayIndex(k))
      for (const k of pause) paused.add(dayIndex(k))
      change.paused = [...paused]
    }
    if (!Object.keys(change).length) reject(400, 'invalid_input', 'Send weekly hours, pause, unpause, days_off_add or days_off_remove.')
    const next = updateHost(env, m, host, change, now)
    return { ...hoursOf(next, now), saved: true }
  })
}

/* events.* */
const EVENT_FIELDS = ['title', 'duration', 'description', 'color', 'location', 'notice', 'window', 'step', 'before', 'after', 'active', 'requests']

function eventOut(env, host, e) {
  const d = eventDTO(e, { mine: true })
  return { ...d, url: `${link(env, host)}/${e.slug}`, step: d.step || stepOf(e) }
}

function findEvent(env, host, input) {
  const all = eventsOf(env, host.id)
  const e = input.id ? all.find((x) => x.id === input.id) : input.slug ? all.find((x) => x.slug === input.slug) : null
  if (!input.id && !input.slug) reject(400, 'invalid_input', 'Say which event type: its id or its slug.')
  if (!e) reject(404, 'not_found', 'You have no event type like that. events_list shows them.')
  return e
}

export function opEventsList(input, env) {
  return tool(env, ({ host }) => ({ events: eventsOf(env, host.id).map((e) => eventOut(env, host, e)) }))
}

export function opEventsCreate(input, env) {
  return tool(env, ({ host }) => {
    const doc = {}
    for (const k of EVENT_FIELDS) if (k in input) doc[k] = input[k]
    if (input.slug) doc.slug = input.slug
    return { event: eventOut(env, host, createEvent(env, host, doc)) }
  })
}

export function opEventsUpdate(input, env) {
  return tool(env, ({ host }) => {
    const e = findEvent(env, host, input)
    const change = {}
    for (const k of EVENT_FIELDS) if (k in input) change[k] = input[k]
    if (input.new_slug) change.slug = input.new_slug
    if (!Object.keys(change).length) reject(400, 'invalid_input', 'Send at least one field to change.')
    return { event: eventOut(env, host, updateEvent(env, host, e.id, change)) }
  })
}

export function opEventsDelete(input, env) {
  return tool(env, ({ host }) => {
    const e = findEvent(env, host, input)
    deleteEvent(env, host, e.id)
    return { deleted: e.slug, next: 'Bookings already made for it stay as they are.' }
  })
}

/* meetings.* and requests.* */
export function opMeetingsList(input, env) {
  return tool(env, ({ host }, now) => {
    const view = input.view || 'upcoming'
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20))
    const all = listForHost(env, host, view, now)
    return { view, zone: host.tzLabel, total: all.length, meetings: all.slice(0, limit).map((b) => meeting(host, b)) }
  })
}

export function opMeetingsCancel(input, env) {
  return tool(env, async ({ host }, now) => {
    const r = await cancelByHost(env, host, input.id, { reason: input.reason || '' }, now, origin(env))
    return { ok: true, already: !!r.already, guest_emailed: !!r.emailed }
  })
}

export function opRequestsAccept(input, env) {
  return tool(env, async ({ host }, now) => {
    const start = input.start === undefined || input.start === null || input.start === '' ? undefined : instant(host, input.start, 'start')
    const r = await acceptRequest(env, host, input.id, { start }, now, origin(env))
    return { ok: true, meeting: meeting(host, r.booking), guest_emailed: !!(r.emailed && r.emailed.invitee) }
  })
}

export function opRequestsDecline(input, env) {
  return tool(env, async ({ host }, now) => {
    const r = declineRequest(env, host, input.id, { reason: input.reason || '' }, now, origin(env))
    return { ok: true, guest_emailed: !!r.emailed }
  })
}

/* slots.list */
export function opSlotsList(input, env) {
  return tool(env, ({ host }, now) => {
    const e = findEvent(env, host, { slug: input.event })
    const days = Math.min(14, Math.max(1, Number(input.days) || 7))
    const today = ymd(now + offsetAt(host.tzTable, now) * MIN)
    const from = input.from || today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from + 'T00:00:00Z'))) reject(400, 'invalid_input', 'from looks like 2026-10-30.')
    const lo = toUtc(host.tzTable, Date.parse(from + 'T00:00:00Z')) ?? Date.parse(from + 'T00:00:00Z')
    const hi = toUtc(host.tzTable, Date.parse(from + 'T00:00:00Z') + days * DAY) ?? lo + days * DAY
    const slots = slotsForHost(env, host, e, lo, hi, now)
    const byDay = new Map()
    for (const s of slots) {
      const off = offsetAt(host.tzTable, s)
      const key = ymd(s + off * MIN)
      if (!byDay.has(key)) byDay.set(key, { day: key, label: longDate(parts(s, off)), starts: [] })
      byDay.get(key).starts.push(iso(host, s))
    }
    return {
      event: e.slug, minutes: e.duration, zone: host.tzLabel, offset: gmt(offsetAt(host.tzTable, lo)), from, days,
      open: [...byDay.values()],
      next: slots.length ? `Share ${link(env, host)}/${e.slug} to let someone book one of these.` : 'Nothing open in these days; hours_get shows your weekly hours.'
    }
  })
}

/* stats.get */
export function opStats(input, env) {
  return tool(env, ({ host }, now) => statsFor(env, host, input.days, now))
}

/* links.* : saved links that tag where visits come from */
function linkOut(env, host, x) {
  const url = `${link(env, host)}${x.slug ? '/' + x.slug : ''}?ref=${x.tag}`
  return { tag: x.tag, label: x.label, event: x.slug || null, url, qr_url: `${url}&via=qr`, created: iso(host, x.createdAt) }
}

const savedOf = (host) => (Array.isArray(host.tags) ? host.tags : [])

// "Sundown 2026 flyer" → "sundown-2026-flyer", made unique with -2, -3…
function tagFor(label, taken) {
  const base = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').replace(/[._-]{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '').slice(0, 40).replace(/[._-]+$/, '') || 'link'
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const tag = `${base.slice(0, 40 - String(n).length - 1).replace(/[._-]+$/, '')}-${n}`
    if (!taken.has(tag)) return tag
  }
}

export function opLinksList(input, env) {
  return tool(env, ({ host }, now) => {
    const numbers = new Map(statsFor(env, host, 30, now).tags.map((x) => [x.tag, x]))
    return {
      links: savedOf(host).map((x) => {
        const n = numbers.get(x.tag) || {}
        return { ...linkOut(env, host, x), last_30_days: { views: n.views || 0, visitors: n.visitors || 0, scans: n.scans || 0, bookings: n.bookings || 0 } }
      }),
      next: 'links_create makes a new one; stats_get shows every tag, including links nobody saved.'
    }
  })
}

export function opLinksCreate(input, env) {
  return tool(env, ({ m, host }, now) => {
    const label = text(input.label, 60, 'label', true)
    const saved = savedOf(host)
    if (saved.length >= 50) reject(400, 'invalid_input', 'You have 50 saved links, the most there can be. links_delete one first.')
    const taken = new Set(saved.map((x) => x.tag))
    let tag
    if (input.tag !== undefined && input.tag !== null && input.tag !== '') {
      tag = cleanTag(input.tag)
      if (!tag) reject(400, 'invalid_input', 'A tag uses lowercase letters, numbers, dots, dashes or underscores, up to 40, like sundown-2026.')
      if (taken.has(tag)) reject(409, 'tag_taken', `You already have a link tagged ${tag}. links_list shows it.`)
    } else tag = tagFor(label, taken)
    const slug = input.event ? findEvent(env, host, { slug: input.event }).slug : null
    const next = updateHost(env, m, host, { tags: [...saved, { tag, label, slug, createdAt: now }] }, now)
    const made = savedOf(next).find((x) => x.tag === tag)
    return { link: linkOut(env, next, made), next: 'Share url anywhere; print qr_url as a QR code so scans count apart. stats_get shows what each brings in.' }
  })
}

export function opLinksDelete(input, env) {
  return tool(env, ({ m, host }, now) => {
    const tag = cleanTag(input.tag)
    const saved = savedOf(host)
    if (!tag || !saved.some((x) => x.tag === tag)) reject(404, 'not_found', 'You have no saved link with that tag. links_list shows them.')
    updateHost(env, m, host, { tags: saved.filter((x) => x.tag !== tag) }, now)
    return { deleted: tag, next: 'The link still opens your page; visits through it still count in stats_get, under its tag.' }
  })
}

/* guide.get */
export function opGuide(input, env) {
  return { guide: env.holm.private.read('guide.md') }
}
