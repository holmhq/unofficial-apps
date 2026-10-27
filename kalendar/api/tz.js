// Time zones without Intl. Holm's server has no Intl, so the host's browser
// works out their zone's UTC offsets for the next year or so and sends them
// as a table of changes: [[utcMs, offsetMinutes], ...], oldest first. Here
// that table turns wall-clock times into instants and back, and dates and
// times are written out by hand in English.
import { MIN, DAY, reject } from './lib.js'

// The offset (minutes east of UTC) in force at an instant.
export function offsetAt(table, utc) {
  if (!table || !table.length) return 0
  let lo = 0
  let hi = table.length - 1
  if (utc < table[0][0]) return table[0][1]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (table[mid][0] <= utc) lo = mid
    else hi = mid - 1
  }
  return table[lo][1]
}

// A wall-clock time, written as if it were UTC, to the instant it names; null
// when the clocks skip over it. When they repeat it, the first one wins.
export function toUtc(table, local) {
  const early = offsetAt(table, local - 14 * 60 * MIN)
  const late = offsetAt(table, local + 14 * 60 * MIN)
  for (const offset of early >= late ? [early, late] : [late, early]) {
    const utc = local - offset * MIN
    if (offsetAt(table, utc) === offset) return utc
  }
  return null
}

export const toLocal = (table, utc) => utc + offsetAt(table, utc) * MIN

// A table from a browser: bounded, sorted, whole minutes, real offsets.
export function cleanTable(value) {
  if (!Array.isArray(value) || !value.length || value.length > 600) reject(400, 'invalid_input', 'Send your time zone’s offsets.')
  let last = -Infinity
  return value.map((row) => {
    if (!Array.isArray(row) || row.length !== 2) reject(400, 'invalid_input', 'Send your time zone’s offsets.')
    const [at, offset] = row.map(Number)
    if (!Number.isFinite(at) || !Number.isInteger(offset) || offset < -840 || offset > 840 || at <= last) reject(400, 'invalid_input', 'Send your time zone’s offsets.')
    last = at
    return [Math.round(at), offset]
  })
}

export function cleanZone(value) {
  const zone = String(value || '')
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone) || zone.length > 64) reject(400, 'invalid_input', 'Pick a time zone.')
  return zone
}

// "India Standard Time": letters and spaces only, since it goes into emails.
export function cleanZoneLabel(value, zone) {
  const label = String(value || '').replace(/\s+/g, ' ').trim()
  if (/^[A-Za-z][A-Za-z .'()-]{1,60}$/.test(label)) return label
  const c = zone.split('/').pop().replace(/_/g, ' ')
  return ({ Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Kiev: 'Kyiv' }[c] || c) + ' time'
}

/* ---- Writing dates out ---------------------------------------------------- */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function parts(utc, offset) {
  const d = new Date(utc + offset * MIN)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() }
}

const pad = (n) => String(n).padStart(2, '0')

export function clock(p, h24) {
  if (h24) return `${pad(p.hour)}:${pad(p.minute)}`
  const h = p.hour % 12 || 12
  return `${h}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`
}

// "3:00 – 3:30 PM", or "11:30 AM – 12:15 PM" across noon.
export function clockRange(start, end, offset, h24) {
  const a = parts(start, offset)
  const b = parts(end, offset)
  if (h24) return `${clock(a, true)} – ${clock(b, true)}`
  const sameHalf = (a.hour < 12) === (b.hour < 12) && a.day === b.day
  const first = clock(a, false)
  return `${sameHalf ? first.replace(/ [AP]M$/, '') : first} – ${clock(b, false)}`
}

export const weekdayName = (p) => DAYS[p.weekday]
export const monthName = (p) => MONTHS[p.month]
export const longDate = (p) => `${DAYS[p.weekday]}, ${MONTHS[p.month]} ${p.day}, ${p.year}`
export const shortDate = (p) => `${DAYS[p.weekday].slice(0, 3)}, ${MONTHS[p.month].slice(0, 3)} ${p.day}`

export function gmt(offset) {
  if (!offset) return 'GMT'
  const sign = offset > 0 ? '+' : '−'
  const abs = Math.abs(offset)
  const m = abs % 60
  return `GMT${sign}${Math.floor(abs / 60)}${m ? ':' + pad(m) : ''}`
}

// "2025-11-04" for the day a local time falls on.
export const ymd = (local) => new Date(Math.floor(local / DAY) * DAY).toISOString().slice(0, 10)
