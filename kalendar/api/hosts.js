// Hosts: a signed-in person with a public link (/@handle), a profile (role,
// company, where they are, a website and links), a time zone, weekly hours
// (each weekday can be paused and keep its hours), days with other hours or
// none, saved links that tag where visits come from, and a private
// calendar feed.
import { reject, text, longText, randomId, displayName, cleanTag, email as cleanEmail, sha256, sameHash, MIN, DAY } from './lib.js'
import { verifyMail, send } from './mail.js'
import { cleanTable, cleanZone, cleanZoneLabel, offsetAt } from './tz.js'
import { createDefaults, eventsOf } from './events.js'

const RESERVED = new Set(('about admin api app apps assets auth b book booking bookings calendar dashboard demo docs ' +
  'edit events feed help holm home hours kalendar login logout me new null privacy root settings signin signup ' +
  'src static support terms undefined user users vendor www').split(' '))

export const WORKWEEK = [[], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], []]

export function cleanHandle(value) {
  const handle = String(value || '').trim().replace(/^@/, '').toLowerCase()
  if (handle.length < 3) reject(400, 'invalid_handle', 'Use at least 3 characters.')
  if (handle.length > 30) reject(400, 'invalid_handle', 'Use 30 characters at most.')
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(handle)) reject(400, 'invalid_handle', 'Use letters, numbers, dots, dashes or underscores.')
  if (/[._-]{2}/.test(handle)) reject(400, 'invalid_handle', 'Don’t put two dots or dashes together.')
  if (RESERVED.has(handle)) reject(409, 'handle_taken', 'That one’s taken.')
  return handle
}

function cleanRanges(value, label) {
  if (!Array.isArray(value) || value.length > 6) reject(400, 'invalid_input', `${label}: up to 6 time ranges.`)
  const ranges = value.map((r) => {
    if (!Array.isArray(r) || r.length !== 2) reject(400, 'invalid_input', `${label}: a range is a start and an end.`)
    const [s, e] = r.map(Number)
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || s >= e || s % 5 || e % 5) reject(400, 'invalid_input', `${label}: each range must start before it ends.`)
    return [s, e]
  }).sort((a, b) => a[0] - b[0])
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) reject(400, 'invalid_input', `${label}: the times overlap.`)
  return ranges
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function cleanWeekly(value) {
  if (!Array.isArray(value) || value.length !== 7) reject(400, 'invalid_input', 'Send hours for all seven days.')
  return value.map((ranges, i) => cleanRanges(ranges, DAY_NAMES[i]))
}

// Weekdays switched off for now: 0 is Sunday. Their hours stay as they are.
export function cleanPaused(value) {
  if (!Array.isArray(value) || value.length > 7 || !value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    reject(400, 'invalid_input', 'Paused days are weekday numbers, 0 (Sunday) to 6 (Saturday).')
  }
  return [...new Set(value)].sort((a, b) => a - b)
}

// Saved links: a name for each tag the host hands out (a flyer, a talk, an
// email signature), and which page it opens: the profile, or one event type.
export function cleanTags(env, host, value, now) {
  if (!Array.isArray(value)) reject(400, 'invalid_input', 'Send saved links as a list.')
  if (value.length > 50) reject(400, 'invalid_input', 'Up to 50 saved links.')
  const slugs = new Set(eventsOf(env, host.id).map((e) => e.slug))
  const seen = new Set()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) reject(400, 'invalid_input', 'Each saved link is an object with a tag and a label.')
    const tag = cleanTag(item.tag)
    if (!tag) reject(400, 'invalid_input', 'A tag uses lowercase letters, numbers, dots, dashes or underscores, up to 40, like sundown-2026.')
    if (seen.has(tag)) reject(400, 'invalid_input', `Two saved links share the tag ${tag}.`)
    seen.add(tag)
    const label = text(item.label, 60, 'A saved link’s name', true)
    const slug = item.slug === undefined || item.slug === null || item.slug === '' ? null : String(item.slug)
    if (slug !== null && !slugs.has(slug)) reject(400, 'invalid_input', `You have no event type at /${slug}.`)
    const createdAt = Number.isFinite(item.createdAt) && item.createdAt > 0 ? item.createdAt : now
    return { tag, label, slug, createdAt }
  })
}

export function cleanOverrides(value, now, table) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_input', 'Send days as an object.')
  const today = new Date(now + offsetAt(table, now) * MIN - DAY).toISOString().slice(0, 10)
  const out = {}
  const keys = Object.keys(value).filter((k) => k >= today).sort()
  if (keys.length > 200) reject(400, 'invalid_input', 'Up to 200 days with their own hours.')
  for (const key of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(key + 'T00:00:00Z'))) reject(400, 'invalid_input', 'Days look like 2025-11-04.')
    out[key] = cleanRanges(value[key], key)
  }
  return out
}

const hosts = (env) => env.holm.app.ds

export function hostOf(env, memberId) {
  return hosts(env).find('hosts', { member: memberId }, { limit: 1, order: 'asc' })[0] || null
}

export function hostByHandle(env, handle) {
  const h = String(handle || '').toLowerCase()
  if (!/^[a-z0-9._-]{1,30}$/.test(h)) return null
  return hosts(env).find('hosts', { handle: h }, { limit: 1, order: 'asc' })[0] || null
}

export function handleFree(env, handle, memberId) {
  let h
  try { h = cleanHandle(handle) } catch (error) { return { handle: String(handle || ''), free: false, reason: error.message } }
  const owner = hostByHandle(env, h)
  return { handle: h, free: !owner || owner.member === memberId, reason: owner && owner.member !== memberId ? 'That one’s taken.' : null }
}

// The profile shown on /@handle: who they are, what they do, where to find them.
const profileOf = (host) => ({
  role: host.role || '',
  company: host.company || '',
  place: host.place || '',
  website: host.website || '',
  links: Array.isArray(host.links) ? host.links : []
})

// A web address: https only; a bare domain gets https:// in front.
export function cleanURL(value, label) {
  let url = text(value, 200, label)
  if (!url) return ''
  if (/^http:\/\//i.test(url)) url = 'https://' + url.slice(7)
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url.replace(/^\/+/, '')
  let parsed = null
  try { parsed = new URL(url) } catch { parsed = null }
  if (!parsed || parsed.protocol !== 'https:' || !/^[^\s/?#]+\.[a-z]{2,}$/i.test(parsed.hostname) || /[\s<>"'`]/.test(url)) reject(400, 'invalid_input', `${label} must be a web address, like https://example.com.`)
  return url
}

function cleanLinks(value) {
  if (!Array.isArray(value)) reject(400, 'invalid_input', 'Send links as a list.')
  if (value.length > 8) reject(400, 'invalid_input', 'Up to 8 links.')
  const out = []
  const seen = new Set()
  for (const item of value) {
    const url = cleanURL(item, 'A link')
    const key = url.toLowerCase().replace(/\/+$/, '')
    if (!url || seen.has(key)) continue
    seen.add(key)
    out.push(url)
  }
  return out
}

/* ---- Email addresses ------------------------------------------------------------------ */

// Booking email goes to the sign-in address, or to another the host added
// and confirmed from its inbox. Guests see it as their invite's organizer.
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const extras = (host) => (Array.isArray(host.addresses) ? host.addresses : [])

export function mailbox(host) {
  const pick = host.sendTo
  if (pick && (same(pick, host.email) || extras(host).some((a) => a.verified && same(a.address, pick)))) return pick
  return host.email || null
}

// Adds an address (or sends its link again) with a link to confirm it,
// good for a week. Four besides the sign-in one; five links a day.
export async function addAddress(env, m, host, input, now, base) {
  const address = cleanEmail(input && input.address)
  if (same(address, m.email)) reject(400, 'invalid_input', 'That’s the address you sign in with.')
  const list = extras(host)
  const had = list.find((a) => same(a.address, address))
  if (had && had.verified) reject(409, 'already', 'That address is already confirmed.')
  if (!had && list.length >= 4) reject(400, 'too_many', 'You can add up to four addresses. Remove one first.')
  const day = new Date(now).toISOString().slice(0, 10)
  if (env.holm.app.kv.increment(`cap:verify:${host.id}:${day}`, 1) > 5) reject(429, 'too_many', 'That’s enough links for today. Try again tomorrow.')
  const token = randomId(24)
  const entry = { address, verified: false, tokenHash: await sha256(token), sentAt: now }
  const next = had ? list.map((a) => (a === had ? entry : a)) : [...list, entry]
  const sent = send(env, address, verifyMail({ base, host, address, link: `${base}/confirm-email?h=${host.id}&t=${token}` }))
  if (!sent.ok) reject(502, 'not_sent', 'The link couldn’t be sent. Try again in a moment.')
  hosts(env).update('hosts', { id: host.id }, { $set: { addresses: next } })
  return { ...host, addresses: next }
}

export function removeAddress(env, host, address) {
  const next = extras(host).filter((a) => !same(a.address, address))
  const set = { addresses: next }
  if (same(host.sendTo, address)) set.sendTo = null
  hosts(env).update('hosts', { id: host.id }, { $set: set })
  return { ...host, ...set }
}

// The link in the email: marks that address confirmed.
export async function confirmAddress(env, hostId, token, now) {
  const host = typeof hostId === 'string' && hostId.length < 60 ? hosts(env).findOne('hosts', hostId) : null
  const hash = typeof token === 'string' && token.length < 80 ? await sha256(token) : ''
  const list = host ? extras(host) : []
  const hit = list.find((a) => a.tokenHash && sameHash(a.tokenHash, hash))
  if (!hit || now - (hit.sentAt || 0) > 7 * DAY) reject(404, 'not_found', 'This link has expired or was already used. Add the address again in Kalendar.')
  const next = list.map((a) => (a === hit ? { address: a.address, verified: true, verifiedAt: now } : a))
  hosts(env).update('hosts', { id: host.id }, { $set: { addresses: next } })
  return hit.address
}

// What the host's own pages see.
export function privateHost(env, host, base) {
  return {
    handle: host.handle,
    name: host.name,
    picture: host.picture || null,
    email: host.email || null,
    bio: host.bio || '',
    ...profileOf(host),
    tz: host.tz,
    tzLabel: host.tzLabel,
    tableEnd: host.tzTable && host.tzTable.length ? host.tableEnd || 0 : 0,
    weekly: host.weekly,
    paused: Array.isArray(host.paused) ? host.paused : [],
    overrides: host.overrides || {},
    tags: Array.isArray(host.tags) ? host.tags : [],
    notify: host.notify !== false,
    addresses: extras(host).map((a) => ({ address: a.address, verified: !!a.verified })),
    sendTo: mailbox(host),
    feed: base + '/feed/' + host.feed + '.ics'
  }
}

// What anyone with the link sees.
export function publicHost(host) {
  return { handle: host.handle, name: host.name, picture: host.picture || null, bio: host.bio || '', ...profileOf(host), tz: host.tz, tzLabel: host.tzLabel }
}

function zoneFields(input) {
  const tz = cleanZone(input.tz)
  const tzTable = cleanTable(input.tzTable)
  const tableEnd = Number(input.tableEnd) || tzTable[tzTable.length - 1][0]
  return { tz, tzLabel: cleanZoneLabel(input.tzLabel, tz), tzTable, tableEnd }
}

export function createHost(env, m, input, now) {
  const handle = cleanHandle(input.handle)
  const name = text(input.name, 80, 'Name') || displayName(m)
  const zone = zoneFields(input)
  const weekly = input.weekly ? cleanWeekly(input.weekly) : WORKWEEK
  const doc = {
    member: m.id, handle, name, picture: m.picture || null, email: m.email || null, bio: '',
    ...zone, weekly, paused: [], overrides: {}, tags: [], notify: true, feed: randomId(32), createdAt: now
  }
  let host
  let created = false
  hosts(env).transaction((tx) => {
    const mine = tx.find('hosts', { member: m.id }, { limit: 1 })[0]
    if (mine) { host = mine; return }
    const taken = tx.find('hosts', { handle }, { limit: 1 })[0]
    if (taken) reject(409, 'handle_taken', 'That one’s taken.')
    host = { ...doc, id: tx.insert('hosts', doc) }
    created = true
  })
  if (created) createDefaults(env, host)
  return host
}

export function updateHost(env, m, host, input, now) {
  const set = {}
  if ('name' in input) set.name = text(input.name, 80, 'Name', true)
  if ('bio' in input) set.bio = longText(input.bio, 600, 'About you')
  if ('role' in input) set.role = text(input.role, 80, 'Role')
  if ('company' in input) set.company = text(input.company, 80, 'Company')
  if ('place' in input) set.place = text(input.place, 80, 'Where you are')
  if ('website' in input) set.website = cleanURL(input.website, 'Website')
  if ('links' in input) set.links = cleanLinks(input.links)
  if ('notify' in input) set.notify = input.notify !== false
  if ('sendTo' in input) {
    const pick = String(input.sendTo || '')
    if (!same(pick, m.email) && !extras(host).some((a) => a.verified && same(a.address, pick))) reject(400, 'invalid_input', 'Pick your sign-in address or one you’ve confirmed.')
    set.sendTo = same(pick, m.email) ? null : extras(host).find((a) => same(a.address, pick)).address
  }
  if ('tz' in input || 'tzTable' in input) Object.assign(set, zoneFields(input))
  if ('weekly' in input) set.weekly = cleanWeekly(input.weekly)
  if ('paused' in input) set.paused = cleanPaused(input.paused)
  if ('tags' in input) set.tags = cleanTags(env, host, input.tags, now)
  if ('overrides' in input) set.overrides = cleanOverrides(input.overrides, now, set.tzTable || host.tzTable)
  if (input.rotateFeed === true) set.feed = randomId(32)
  // Sign-in details can change: keep the picture and verified email fresh.
  set.picture = m.picture || null
  set.email = m.email || null
  if ('handle' in input) {
    const handle = cleanHandle(input.handle)
    if (handle !== host.handle) {
      hosts(env).transaction((tx) => {
        const taken = tx.find('hosts', { handle }, { limit: 1 })[0]
        if (taken && taken.member !== m.id) reject(409, 'handle_taken', 'That one’s taken.')
        tx.update('hosts', { id: host.id }, { $set: { ...set, handle } })
      })
      return { ...host, ...set, handle }
    }
  }
  hosts(env).update('hosts', { id: host.id }, { $set: set })
  return { ...host, ...set }
}
