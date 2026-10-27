// Time zones, worked out with the browser's Intl. Kalendar's server has no
// time-zone data, so a host's page sends it a table of their zone's UTC
// offsets for the next 15 months: [[utcMs, offsetMinutes], ...], one row per
// change. The server turns weekly hours into real times with it.

const HOUR = 3600000
const DAY = 86400000
const parts = new Map()

function formatter(zone) {
  if (!parts.has(zone)) parts.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }))
  return parts.get(zone)
}

// Minutes east of UTC in `zone` at instant `ms`.
export function offsetIn(zone, ms) {
  const p = {}
  for (const { type, value } of formatter(zone).formatToParts(new Date(ms))) p[type] = Number(value)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second)
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000)
}

export function offsetTable(zone, from = Date.now() - 2 * DAY, to = Date.now() + 460 * DAY) {
  const table = [[from, offsetIn(zone, from)]]
  let prev = table[0][1]
  for (let t = from + 6 * HOUR; t <= to; t += 6 * HOUR) {
    const o = offsetIn(zone, t)
    if (o === prev) continue
    // Find the minute it changed.
    let lo = t - 6 * HOUR
    let hi = t
    while (hi - lo > 60000) {
      const mid = lo + Math.floor((hi - lo) / 120000) * 60000
      if (offsetIn(zone, mid) === prev) lo = mid
      else hi = mid
    }
    table.push([hi, o])
    prev = o
  }
  return { table, end: to }
}

export const here = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

// "India Standard Time", "Pacific Daylight Time".
export function zoneName(zone, ms = Date.now(), style = 'long') {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: style }).formatToParts(new Date(ms))
    return (p.find((x) => x.type === 'timeZoneName') || {}).value || zone
  } catch { return zone }
}

export function gmt(offset) {
  if (!offset) return 'GMT'
  const abs = Math.abs(offset)
  return `GMT${offset > 0 ? '+' : '−'}${Math.floor(abs / 60)}${abs % 60 ? ':' + String(abs % 60).padStart(2, '0') : ''}`
}

// "Kolkata", "New York", "Buenos Aires". Some browsers still use old names.
const RENAMED = { Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Kiev: 'Kyiv', Rangoon: 'Yangon', Katmandu: 'Kathmandu', Godthab: 'Nuuk', Ulaanbaatar: 'Ulaanbaatar' }
export const city = (zone) => { const c = zone.split('/').pop().replace(/_/g, ' '); return RENAMED[c] || c }

let all = null
export function zones() {
  if (all) return all
  let list = []
  try { list = Intl.supportedValuesOf('timeZone') } catch {}
  if (!list.includes('UTC')) list.push('UTC')
  const now = Date.now()
  all = list.map((zone) => ({ zone, city: city(zone), region: zone.includes('/') ? zone.split('/')[0].replace(/_/g, ' ') : '', offset: offsetIn(zone, now), name: zoneName(zone, now) }))
    .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city))
  return all
}

// What the host's zone means for the server: name, label and offsets.
export function zonePayload(zone) {
  const { table, end } = offsetTable(zone)
  const name = zoneName(zone, Date.now(), 'longGeneric')
  return { tz: zone, tzLabel: /^[A-Za-z .'()-]+$/.test(name) ? name : city(zone) + ' time', tzTable: table, tableEnd: end }
}
