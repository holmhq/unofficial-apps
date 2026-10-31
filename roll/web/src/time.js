// Times in Roll are the photo's own wall clock: when the camera says 16:40 on 1 November,
// the photo is kept as 16:40 on 1 November whatever time zone you look from, the way a
// printed date on a print stays put. They are stored as milliseconds read as UTC, so every
// format here uses timeZone 'UTC'.

const UTC = { timeZone: 'UTC' }
const fmt = (options) => new Intl.DateTimeFormat(undefined, { ...UTC, ...options })
const F = {
  weekdayDay: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  weekdayDayYear: fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
  longDay: fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  shortMonthYear: fmt({ month: 'short', year: 'numeric' }),
  dayMonth: fmt({ month: 'short', day: 'numeric' }),
  dayMonthYear: fmt({ month: 'short', day: 'numeric', year: 'numeric' }),
  time: fmt({ hour: 'numeric', minute: '2-digit' }),
  month: fmt({ month: 'long' }),
  weekday: fmt({ weekday: 'long' })
}

// Today on this device's clock, as a wall-clock day key.
export function todayWall(now = Date.now()) {
  return now - new Date(now).getTimezoneOffset() * 60000
}

export const dayKey = (t) => new Date(t).toISOString().slice(0, 10)
export const monthKey = (t) => new Date(t).toISOString().slice(0, 7)
export const yearOf = (t) => new Date(t).getUTCFullYear()

export function dayLabel(t, now = todayWall()) {
  const key = dayKey(t)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - 86400000)) return 'Yesterday'
  return yearOf(t) === yearOf(now) ? F.weekdayDay.format(t) : F.weekdayDayYear.format(t)
}

export function shortDay(t, now = todayWall()) {
  const key = dayKey(t)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - 86400000)) return 'Yesterday'
  return yearOf(t) === yearOf(now) ? F.dayMonth.format(t) : F.dayMonthYear.format(t)
}

export const longDay = (t) => F.longDay.format(t)
export const monthYear = (t) => F.monthYear.format(t)
export const shortMonthYear = (t) => F.shortMonthYear.format(t)
export const clock = (t) => F.time.format(t)
export const monthName = (t) => F.month.format(t)
export const weekdayName = (t) => F.weekday.format(t)

// "Oct 30 – Nov 2, 2025", "Jun 14 – 18, 2025", "Mar 9, 2024".
export function range(a, b) {
  if (a > b) [a, b] = [b, a]
  if (dayKey(a) === dayKey(b)) return F.dayMonthYear.format(a)
  try { return new Intl.DateTimeFormat(undefined, { ...UTC, month: 'short', day: 'numeric', year: 'numeric' }).formatRange(a, b) } catch {}
  return F.dayMonth.format(a) + ' – ' + F.dayMonthYear.format(b)
}

// "GMT−7" from "-07:00".
export function zone(offset) {
  if (!offset) return ''
  const m = /^([+-])(\d\d):(\d\d)$/.exec(offset)
  if (!m) return ''
  const h = String(Number(m[2]))
  return 'GMT' + (m[1] === '-' ? '−' : '+') + h + (m[3] !== '00' ? ':' + m[3] : '')
}

export function yearsAgo(n) {
  return n === 1 ? '1 year ago' : `${n} years ago`
}

export function bytes(n) {
  if (!n) return '0 MB'
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0) + ' MB'
  return (n / 1073741824).toFixed(n < 10 * 1073741824 ? 1 : 0) + ' GB'
}

export function count(n, one, many = one + 's') {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
