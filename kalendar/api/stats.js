// Stats for hosts: who opens their page, from where and on what, how long
// they stay, what they click, and how many book. The page sends small
// beacons (POST /api/hit); each lands in one document per host per day, in
// the host's own time zone. No cookies and no addresses: a visitor is a
// random id the browser keeps, and a place is the visitor's time zone.
// A tag (?ref=sundown-2026, from a saved link or a QR code) says which link
// brought them, and follows them to the booking.
import { MIN, DAY, HOUR, member, cleanTag } from './lib.js'
import { hostByHandle } from './hosts.js'
import { eventsOf } from './events.js'
import { offsetAt, toUtc, ymd } from './tz.js'

const ds = (env) => env.holm.app.ds
const kv = (env) => env.holm.app.kv

const KINDS = new Set(['view', 'click', 'pick', 'leave'])
const DEVICES = new Set(['phone', 'tablet', 'desktop'])
const VISITOR = /^[a-z0-9]{16,40}$/
const SLUG = /^[a-z0-9-]{1,40}$/
const SOURCE = /^(direct|[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+)$/
const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/
const LINK = /^[a-z0-9]{1,20}$/
// Map fields keep at most this many keys; the rest count as "other".
const LIMIT = { sources: 60, zones: 120, links: 24, events: 60, tags: 60 }

const HOST_CAP = 20000
const VISITOR_CAP = 300

// Keys come from visitors, so dots and dollars are written out before they
// become object keys in storage.
const enc = (key) => key.replace(/%/g, '%25').replace(/\./g, '%2E').replace(/\$/g, '%24')
const dec = (key) => key.replace(/%2E/g, '.').replace(/%24/g, '$').replace(/%25/g, '%')

function bump(map, key, by = 1, limit = 60) {
  const k = enc(key)
  if (!(k in map) && Object.keys(map).length >= limit) {
    map.other = (map.other || 0) + by
    return
  }
  map[k] = (map[k] || 0) + by
}

// A counter that forgets itself after a day and a half.
function count(env, key) {
  const n = kv(env).increment(key, 1)
  if (n === 1) kv(env).set(key, 1, 36 * HOUR)
  return n
}

function parse(raw) {
  if (typeof raw !== 'string' || raw.length > 2000) return null
  let b
  try { b = JSON.parse(raw) } catch { return null }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null
  if (typeof b.h !== 'string' || !KINDS.has(b.k) || typeof b.v !== 'string' || !VISITOR.test(b.v)) return null
  const hit = { h: b.h, k: b.k, v: b.v }
  if (b.e !== undefined) { if (typeof b.e !== 'string' || !SLUG.test(b.e)) return null; hit.e = b.e }
  if (b.p !== undefined) { if (b.p !== 'profile' && b.p !== 'event') return null; hit.p = b.p }
  if (b.t !== undefined) {
    if (typeof b.t !== 'string') return null
    if (b.t === 'website') hit.t = { kind: 'link', key: 'website' }
    else if (b.t.startsWith('event:') && SLUG.test(b.t.slice(6))) hit.t = { kind: 'event', key: b.t.slice(6) }
    else if (b.t.startsWith('link:') && LINK.test(b.t.slice(5))) hit.t = { kind: 'link', key: b.t.slice(5) }
    else return null
  }
  if (b.ms !== undefined) { const ms = Number(b.ms); if (!Number.isFinite(ms) || ms < 0) return null; hit.ms = Math.min(Math.round(ms), 30 * MIN) }
  // A bad source, tag or "via" loses only itself, never the visit. Pages
  // before 0.3.0 sent a ?ref= tag as the source: it counts as the tag.
  let legacy = null
  if (typeof b.ref === 'string' && b.ref.length <= 100) {
    const r = b.ref.toLowerCase()
    if (SOURCE.test(r)) hit.ref = r
    else legacy = cleanTag(r)
  }
  const tag = b.g !== undefined ? cleanTag(b.g) : legacy
  if (tag) hit.g = tag
  if (b.w === 'qr') hit.w = 'qr'
  if (b.tz !== undefined) { if (typeof b.tz !== 'string' || b.tz.length > 64 || !ZONE.test(b.tz)) return null; hit.tz = b.tz }
  if (b.d !== undefined) { if (!DEVICES.has(b.d)) return null; hit.d = b.d }
  return hit
}

const blank = (host, day) => ({
  host, day, views: 0, profileViews: 0, eventViews: 0, visitors: 0, clicks: 0, picks: 0, timeSum: 0, timeCount: 0,
  events: {}, links: {}, sources: {}, devices: {}, zones: {}, tags: {}
})

const FIELDS = ['views', 'profileViews', 'eventViews', 'visitors', 'clicks', 'picks', 'timeSum', 'timeCount', 'events', 'links', 'sources', 'devices', 'zones', 'tags']

function apply(doc, hit, first) {
  const ev = (slug) => {
    const k = enc(slug)
    if (!doc.events[k]) {
      if (Object.keys(doc.events).length >= LIMIT.events) return null
      doc.events[k] = { views: 0, clicks: 0, picks: 0 }
    }
    return doc.events[k]
  }
  const tagged = () => {
    if (!hit.g) return null
    const k = enc(hit.g)
    if (!doc.tags[k]) {
      if (Object.keys(doc.tags).length >= LIMIT.tags) return null
      doc.tags[k] = { views: 0, visitors: 0, scans: 0, picks: 0 }
    }
    return doc.tags[k]
  }
  if (hit.k === 'view') {
    doc.views++
    if (hit.p === 'event' || (!hit.p && hit.e)) {
      doc.eventViews++
      const e = hit.e && ev(hit.e)
      if (e) e.views++
    } else doc.profileViews++
    if (first) {
      doc.visitors++
      bump(doc.sources, hit.ref || 'direct', 1, LIMIT.sources)
      if (hit.d) bump(doc.devices, hit.d, 1, 3)
      if (hit.tz) bump(doc.zones, hit.tz, 1, LIMIT.zones)
    }
    const g = tagged()
    if (g) {
      g.views++
      if (first) {
        g.visitors++
        if (hit.w === 'qr') g.scans++
      }
    }
  } else if (hit.k === 'click') {
    doc.clicks++
    if (hit.t && hit.t.kind === 'event') { const e = ev(hit.t.key); if (e) e.clicks++ }
    if (hit.t && hit.t.kind === 'link') bump(doc.links, hit.t.key, 1, LIMIT.links)
  } else if (hit.k === 'pick') {
    doc.picks++
    const e = hit.e && ev(hit.e)
    if (e) e.picks++
    const g = tagged()
    if (g) g.picks++
  } else if (hit.k === 'leave' && hit.ms >= 500) {
    doc.timeSum += hit.ms
    doc.timeCount++
  }
  return doc
}

// The host's day for an instant.
const dayOf = (host, ms) => ymd(ms + offsetAt(host.tzTable, ms) * MIN)

// POST /api/hit. Always answers 204: a beacon has no one to tell.
export async function hit(request, env, now) {
  let raw = ''
  try { raw = await request.text() } catch { return }
  const h = parse(raw)
  if (!h) return
  const host = hostByHandle(env, h.h)
  if (!host) return
  const me = member(env)
  if (me && me.id === host.member) return
  // Only real slugs become keys.
  const slugs = new Set(eventsOf(env, host.id).map((e) => e.slug))
  if (h.e && !slugs.has(h.e)) delete h.e
  if (h.t && h.t.kind === 'event' && !slugs.has(h.t.key)) return
  const day = dayOf(host, now)
  if (count(env, `sc:${host.id}:${day}`) > HOST_CAP) return
  if (count(env, `sp:${h.v}:${day}`) > VISITOR_CAP) return
  let first = false
  if (h.k === 'view') {
    const seen = `sv:${host.id}:${day}:${h.v}`
    if (!kv(env).get(seen)) { kv(env).set(seen, 1, 36 * HOUR); first = true }
  }
  ds(env).transaction((tx) => {
    const doc = tx.find('stats', { host: host.id, day }, { limit: 1 })[0]
    const next = apply(doc ? { ...blank(host.id, day), ...doc } : blank(host.id, day), h, first)
    const set = {}
    for (const f of FIELDS) set[f] = next[f]
    if (doc) tx.update('stats', { id: doc.id }, { $set: set })
    else tx.insert('stats', { host: host.id, day, ...set })
  })
}

/* ---- Reading ------------------------------------------------------------------ */

const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)

function sum(docs) {
  const t = { views: 0, profileViews: 0, eventViews: 0, visitors: 0, clicks: 0, picks: 0, timeSum: 0, timeCount: 0 }
  const maps = { sources: {}, devices: {}, zones: {}, links: {}, events: {}, tags: {} }
  for (const d of docs) {
    for (const k of Object.keys(t)) t[k] += Number(d[k]) || 0
    for (const m of ['sources', 'devices', 'zones', 'links']) for (const [k, n] of Object.entries(d[m] || {})) { const key = k === 'other' ? 'other' : dec(k); maps[m][key] = (maps[m][key] || 0) + (Number(n) || 0) }
    for (const [k, e] of Object.entries(d.events || {})) {
      const slug = dec(k)
      const x = maps.events[slug] || (maps.events[slug] = { views: 0, clicks: 0, picks: 0 })
      x.views += Number(e && e.views) || 0
      x.clicks += Number(e && e.clicks) || 0
      x.picks += Number(e && e.picks) || 0
    }
    for (const [k, g] of Object.entries(d.tags || {})) {
      const tag = dec(k)
      const x = maps.tags[tag] || (maps.tags[tag] = { views: 0, visitors: 0, scans: 0, picks: 0 })
      for (const f of ['views', 'visitors', 'scans', 'picks']) x[f] += Number(g && g[f]) || 0
    }
  }
  return { t, maps }
}

const top = (map, n) => Object.entries(map).map(([key, v]) => ({ key, n: v })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)).slice(0, n)

// GET /api/stats?days=7|30|90: this period, the one before it, and each day.
export function statsFor(env, host, days, now) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30
  const to = dayOf(host, now)
  const from = addDays(to, -(days - 1))
  const prevFrom = addDays(from, -days)
  const keys = []
  for (let i = 0; i < days * 2; i++) keys.push(addDays(prevFrom, i))
  const docs = ds(env).find('stats', { host: host.id, day: { $in: keys } }, { limit: 200 })
  const cur = docs.filter((d) => d.day >= from)
  const prev = docs.filter((d) => d.day < from)

  // Bookings and requests made in each period, by the host's day.
  const startAt = toUtc(host.tzTable, Date.parse(prevFrom + 'T00:00:00Z')) ?? Date.parse(prevFrom + 'T00:00:00Z') - 14 * HOUR
  const made = ds(env).find('bookings', { host: host.id, createdAt: { $gte: startAt - DAY } }, { limit: 5000 })
    .map((b) => ({ day: dayOf(host, b.createdAt), slug: b.slug, ref: b.ref || null, booked: !b.rescheduledFrom && b.status !== 'requested' && b.status !== 'declined' && !(b.asked && !b.acceptedAt), asked: !!b.asked }))
    .filter((b) => b.day >= prevFrom && b.day <= to)

  const totals = (list, period) => {
    const { t } = sum(list)
    const inPeriod = made.filter((b) => (period === 'cur' ? b.day >= from : b.day < from))
    return {
      views: t.views, profileViews: t.profileViews, eventViews: t.eventViews, visitors: t.visitors, clicks: t.clicks, picks: t.picks,
      bookings: inPeriod.filter((b) => b.booked).length, requests: inPeriod.filter((b) => b.asked).length,
      timeAvg: t.timeCount ? Math.round(t.timeSum / t.timeCount) : 0
    }
  }

  const byDay = new Map(cur.map((d) => [d.day, d]))
  const series = []
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i)
    const d = byDay.get(day)
    series.push({ day, views: d ? Number(d.views) || 0 : 0, visitors: d ? Number(d.visitors) || 0 : 0, bookings: made.filter((b) => b.day === day && b.booked).length })
  }

  const { maps } = sum(cur)
  const events = eventsOf(env, host.id).map((e) => {
    const x = maps.events[e.slug] || { views: 0, clicks: 0, picks: 0 }
    return { slug: e.slug, title: e.title, color: e.color || 'blue', views: x.views, clicks: x.clicks, picks: x.picks, bookings: made.filter((b) => b.day >= from && b.slug === e.slug && b.booked).length }
  })

  // Every saved link, even when nothing came through it yet, then the 20
  // busiest tags nobody saved (hand-made links), most bookings first.
  const zero = { views: 0, visitors: 0, scans: 0, picks: 0 }
  const tagRow = (tag, label, slug) => {
    const x = maps.tags[tag] || zero
    const mine = made.filter((b) => b.day >= from && b.ref === tag)
    return { tag, label, slug, views: x.views, visitors: x.visitors, scans: x.scans, picks: x.picks, bookings: mine.filter((b) => b.booked).length, requests: mine.filter((b) => b.asked).length }
  }
  const saved = Array.isArray(host.tags) ? host.tags : []
  const known = new Set(saved.map((x) => x.tag))
  const others = [...new Set([...Object.keys(maps.tags), ...made.filter((b) => b.day >= from && b.ref).map((b) => b.ref)])]
    .filter((tag) => !known.has(tag))
    .map((tag) => tagRow(tag, null, null))
    .sort((a, b) => b.visitors - a.visitors || b.bookings - a.bookings || a.tag.localeCompare(b.tag))
    .slice(0, 20)
  const tags = [...saved.map((x) => tagRow(x.tag, x.label, x.slug || null)), ...others]
    .sort((a, b) => b.bookings - a.bookings || b.visitors - a.visitors || a.tag.localeCompare(b.tag))

  return {
    days, from, to,
    totals: totals(cur, 'cur'),
    previous: totals(prev, 'prev'),
    series,
    sources: top(maps.sources, 8),
    devices: top(maps.devices, 4),
    zones: top(maps.zones, 10),
    links: top(maps.links, 24),
    events,
    tags
  }
}
