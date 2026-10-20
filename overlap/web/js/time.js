// Dates and times. A plan's grid is drawn in the plan's own time zone; the
// browser converts to the viewer's zone for hints, links and calendar files.

export const viewerZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

export function zones() {
  try { return Intl.supportedValuesOf('timeZone') } catch { return [viewerZone(), 'UTC'] }
}

const parts = day => day.split('-').map(Number)
const noonUTC = day => { const [y, m, d] = parts(day); return new Date(Date.UTC(y, m - 1, d, 12)) }

export const isoDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const fmt = (options, zone = 'UTC') => new Intl.DateTimeFormat(undefined, { timeZone: zone, ...options })
const weekdayShort = fmt({ weekday: 'short' })
const weekdayLong = fmt({ weekday: 'long' })
const monthShort = fmt({ month: 'short' })
const dayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const dayMedium = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const clock = fmt({ hour: 'numeric', minute: '2-digit' })

export const dayParts = day => {
  const date = noonUTC(day)
  return { weekday: weekdayShort.format(date), weekdayLong: weekdayLong.format(date), day: date.getUTCDate(), month: monthShort.format(date) }
}
export const dayLabel = day => dayMedium.format(noonUTC(day))
export const dayLabelLong = day => dayLong.format(noonUTC(day))

// Minutes after midnight as the viewer's locale writes a time: 9:00 or 9:00 AM.
export const minutes = m => clock.format(new Date(Date.UTC(2000, 0, 1, 0, m)))
export const hourLabel = m => {
  const text = minutes(m)
  return text.replace(/:00(?=\D|$)/, '')
}

// The zone's offset from UTC, in milliseconds, at an instant.
function offsetAt(ms, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms
}

// A wall-clock time on a day in a zone, as a UTC instant.
export function instant(day, mins, zone) {
  const [y, m, d] = parts(day)
  const wall = Date.UTC(y, m - 1, d, 0, mins)
  let t = wall - offsetAt(wall, zone)
  t = wall - offsetAt(t, zone)
  return t
}

export function localHint(day, mins, zone, viewer = viewerZone()) {
  if (zone === viewer) return ''
  const t = new Date(instant(day, mins, zone))
  const text = fmt({ hour: 'numeric', minute: '2-digit' }, viewer).format(t)
  const sameDay = fmt({ day: 'numeric' }, viewer).format(t) === String(parts(day)[2])
  return sameDay ? text : `${text}, ${fmt({ weekday: 'short' }, viewer).format(t)}`
}

export function zoneDifference(day, zone, viewer = viewerZone()) {
  if (zone === viewer) return null
  const t = instant(day, 12 * 60, zone)
  const diff = (offsetAt(t, viewer) - offsetAt(t, zone)) / 60000
  if (!diff) return null
  const sign = diff > 0 ? '+' : '−'
  const h = Math.floor(Math.abs(diff) / 60), m = Math.abs(diff) % 60
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''} h`
}

export const zoneName = zone => zone.replace(/_/g, ' ').split('/').pop()

// Runs of time where the same people are free, best first.
export function bestTimes(plan, people, limit = 5) {
  const rows = (plan.end - plan.start) / plan.step
  const found = []
  if (!people.length) return found
  for (let d = 0; d < plan.days.length; d++) {
    let run = null
    for (let r = 0; r <= rows; r++) {
      const who = r < rows ? people.filter(p => p.slots[d * rows + r] === '1').map(p => p.id) : []
      const key = who.join(',')
      if (run && run.key === key) { run.to = r + 1; continue }
      if (run && run.who.length) found.push(run)
      run = { key, who, day: d, from: r, to: r + 1 }
    }
  }
  return found
    .sort((a, b) => b.who.length - a.who.length || (b.to - b.from) - (a.to - a.from) || a.day - b.day || a.from - b.from)
    .slice(0, limit)
}

export const rangeLabel = (plan, run) =>
  `${minutes(plan.start + run.from * plan.step)} – ${minutes(plan.start + run.to * plan.step)}`

// A calendar file for the settled time, in UTC so every app reads it right.
export function calendarFile(plan, final, url) {
  const day = plan.days[final.day]
  const begin = instant(day, plan.start + final.from * plan.step, plan.tz)
  const end = instant(day, plan.start + final.to * plan.step, plan.tz)
  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const text = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//overlap//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${plan.slug}-${final.day}-${final.from}@${location.host}`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(begin)}`, `DTEND:${stamp(end)}`, `SUMMARY:${text(plan.title)}`,
    `DESCRIPTION:${text([plan.note, url].filter(Boolean).join('\n\n'))}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR'
  ]
  return { body: lines.join('\r\n') + '\r\n', begin, end, stamp }
}

export function googleLink(plan, final, url) {
  const { begin, end, stamp } = calendarFile(plan, final, url)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: plan.title, dates: `${stamp(begin)}/${stamp(end)}`, details: [plan.note, url].filter(Boolean).join('\n\n') })
  return `https://calendar.google.com/calendar/render?${q}`
}
