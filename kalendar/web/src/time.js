// Dates and times for people, in the zone they're looking from, with the
// browser's own words for days and months. 12- or 24-hour is remembered.
import { here } from './zones.js'

const KEY = 'kalendar:h24'
const cache = new Map()
let h24 = null
try { const v = localStorage.getItem(KEY); if (v) h24 = v === 'on' } catch {}
if (h24 === null) {
  try { h24 = ['h23', 'h24'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle) } catch { h24 = false }
}

export const clock24 = () => h24
export function setClock24(value) {
  h24 = value
  cache.clear()
  try { localStorage.setItem(KEY, value ? 'on' : 'off') } catch {}
}

function f(zone, options) {
  const key = zone + JSON.stringify(options) + h24
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(undefined, { timeZone: zone, ...options }))
  return cache.get(key)
}

const hourOpts = () => ({ hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' })

export const clock = (ms, zone = here()) => f(zone, hourOpts()).format(ms)

// "3:00 – 3:30 PM" where the browser writes it that way.
export function range(start, end, zone = here()) {
  try { return f(zone, hourOpts()).formatRange(start, end) } catch { return `${clock(start, zone)} – ${clock(end, zone)}` }
}

// Split "3:00 PM" into "3:00" and "PM", for a lighter "PM".
export function clockParts(ms, zone = here()) {
  const parts = f(zone, hourOpts()).formatToParts(ms)
  const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim()
  const period = (parts.find((p) => p.type === 'dayPeriod') || {}).value || ''
  return { main, period }
}

export const longDay = (ms, zone = here()) => f(zone, { weekday: 'long', month: 'long', day: 'numeric' }).format(ms)
export const fullDate = (ms, zone = here()) => f(zone, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(ms)
export const shortDay = (ms, zone = here()) => f(zone, { weekday: 'short', month: 'short', day: 'numeric' }).format(ms)
export const weekday = (ms, zone = here(), style = 'long') => f(zone, { weekday: style }).format(ms)
export const monthDay = (ms, zone = here()) => f(zone, { month: 'long', day: 'numeric' }).format(ms)
export const monthName = (year, month) => new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(year, month, 1))
export const shortMonth = (ms, zone = here()) => f(zone, { month: 'short' }).format(ms)

// "2025-11-04": the day an instant falls on in a zone.
export function dayKey(ms, zone = here()) {
  const p = {}
  for (const x of f(zone, { year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' }).formatToParts(ms)) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}

export const keyOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Monday or Sunday first, as the reader's region does it.
export function weekStart() {
  try {
    const loc = new Intl.Locale(navigator.language || 'en-US')
    const info = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo
    if (info && info.firstDay) return info.firstDay % 7
  } catch {}
  return /^en-(US|CA)|^(ja|ko|zh-TW|he|pt-BR)/.test(navigator.language || '') ? 0 : 1
}

// Narrow weekday letters, starting on `first` (0 = Sunday).
export function weekLetters(first, style = 'narrow') {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2023, 0, 1 + ((first + i) % 7))))
}

export function relativeDay(ms, zone = here()) {
  const today = dayKey(Date.now(), zone)
  const key = dayKey(ms, zone)
  if (key === today) return 'Today'
  if (key === dayKey(Date.now() + 86400000, zone)) return 'Tomorrow'
  if (key === dayKey(Date.now() - 86400000, zone)) return 'Yesterday'
  return null
}

export function minutesLabel(n) {
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const m = n % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// A minute of the day as a clock: 540 → "9:00 AM".
export function minuteClock(min) {
  return f('UTC', hourOpts()).format(Date.UTC(2020, 0, 1, 0, min))
}
