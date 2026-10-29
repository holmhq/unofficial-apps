// Open times for one kind of meeting: the host's weekly hours (or a day's
// own hours), stepped through in the host's time zone, minus anything too
// soon, too far ahead, or overlapping another booking and its buffers.
// Plain numbers only, so a month of slots costs almost nothing.
import { MIN, DAY } from './lib.js'
import { offsetAt, toUtc, ymd } from './tz.js'

// host: { weekly: [[ [startMin, endMin], ... ] x7, Sunday first], paused: [weekday, ...],
//         overrides: { 'YYYY-MM-DD': ranges }, tzTable }
// A paused weekday keeps its hours but offers nothing, unless that date has
// hours of its own.
// event: { duration, step, notice, window, before, after } in minutes (window in days)
// busy: [[start, end], ...] instants already taken
export function slotsFor(host, event, busy, from, to, now) {
  const table = host.tzTable
  const earliest = now + event.notice * MIN
  const latest = now + event.window * DAY
  const lo = Math.max(from, earliest)
  const hi = Math.min(to, latest)
  const out = []
  if (hi <= lo) return out
  const duration = event.duration * MIN
  const step = Math.max(5, event.step || event.duration) * MIN
  const before = (event.before || 0) * MIN
  const after = (event.after || 0) * MIN
  const taken = busy.slice().sort((a, b) => a[0] - b[0])
  const firstDay = Math.floor((lo + offsetAt(table, lo) * MIN) / DAY) * DAY - DAY
  const lastDay = Math.floor((hi + offsetAt(table, hi) * MIN) / DAY) * DAY + DAY
  for (let day = firstDay; day <= lastDay; day += DAY) {
    const key = ymd(day)
    const weekday = new Date(day).getUTCDay()
    const ranges = host.overrides && Object.prototype.hasOwnProperty.call(host.overrides, key)
      ? host.overrides[key]
      : Array.isArray(host.paused) && host.paused.includes(weekday)
        ? []
        : (host.weekly && host.weekly[weekday]) || []
    for (const range of ranges) {
      const end = day + range[1] * MIN
      for (let local = day + range[0] * MIN; local + duration <= end; local += step) {
        const start = toUtc(table, local)
        if (start === null || start < lo || start >= hi) continue
        // A meeting that crosses a clock change keeps its real length.
        const a = start - before
        const b = start + duration + after
        let clash = false
        for (let i = 0; i < taken.length; i++) {
          if (taken[i][0] >= b) break
          if (taken[i][1] > a) { clash = true; break }
        }
        if (!clash) out.push(start)
      }
    }
  }
  out.sort((x, y) => x - y)
  return out.filter((t, i) => i === 0 || t !== out[i - 1])
}
