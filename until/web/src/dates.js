// Calendar days as 'YYYY-MM-DD' strings, in the visitor's own time zone. A
// tracker is a run of `count` days from `startDate`; its last day is the one
// it counts down to.

export const MAX_DAYS = 36525 // about a hundred years
export const ICONS = ['CalendarDays', 'Flag', 'Gift', 'Heart', 'Hourglass', 'Mountain', 'Plane', 'Rocket', 'Sparkles', 'Sprout', 'SunMedium', 'Waves']
const DAY_MS = 86_400_000

export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

export const dayString = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const today = () => dayString(new Date())

// Whole days from a to b; daylight saving never makes it fractional.
export function daysBetween(a, b) {
  const da = parseDay(a), db = parseDay(b)
  return da && db ? Math.round((db - da) / DAY_MS) : 0
}

export function addDays(day, n) {
  const date = parseDay(day)
  if (!date || !Number.isInteger(n)) return null
  date.setDate(date.getDate() + n)
  return dayString(date)
}

export function validCount(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= MAX_DAYS ? n : 0
}

// The number of days from start to end, both included, or 0 if that isn't a range.
export function countBetween(start, end) {
  if (!parseDay(start) || !parseDay(end)) return 0
  return validCount(daysBetween(start, end) + 1)
}

export const endOf = t => addDays(t.startDate, t.count - 1)

const anyDay = value => parseDay(value) ? value : (value && !Number.isNaN(new Date(value).getTime()) ? dayString(new Date(value)) : null)

// Any stored or imported tracker, made whole: a start, a length, a target
// and ratings that fall inside it.
export function normalize(x) {
  const startDate = anyDay(x?.startDate) || anyDay(x?.createdAt) || anyDay(x?.targetDate) || today()
  let count = validCount(x?.count)
  if (!count && parseDay(x?.targetDate)) count = Math.max(1, Math.min(MAX_DAYS, daysBetween(startDate, x.targetDate) + 1))
  count ||= 1
  const t = {
    id: x?.id || localId(),
    title: x?.title || '',
    subtitle: x?.subtitle || '',
    icon: ICONS.includes(x?.icon) ? x.icon : randomIcon(),
    startDate,
    count,
    createdAt: x?.createdAt || null,
    updatedAt: x?.updatedAt || null
  }
  t.targetDate = endOf(t)
  t.sourceLocalId = x?.sourceLocalId || t.id
  t.ratings = {}
  for (const [day, raw] of Object.entries(x?.ratings || {})) {
    const stars = Number(raw)
    if (Number.isInteger(stars) && stars >= 1 && stars <= 5 && daysBetween(startDate, day) >= 0 && daysBetween(day, t.targetDate) >= 0) t.ratings[day] = stars
  }
  return t
}

export const localId = () => `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export function randomIcon(except) {
  const pool = ICONS.filter(name => name !== except)
  return pool[Math.floor(Math.random() * pool.length)]
}

// 'running' from its first day to its last, then 'past'; 'upcoming' before.
export function phase(t, day = today()) {
  if (daysBetween(day, t.startDate) > 0) return 'upcoming'
  if (daysBetween(t.targetDate, day) > 0) return 'past'
  return 'running'
}

// Running trackers first, then upcoming, by start date; then past ones, the
// most recently finished first.
export function sortTrackers(items) {
  const rank = { running: 0, upcoming: 1, past: 2 }
  return items.map(normalize).sort((a, b) => {
    const pa = phase(a), pb = phase(b)
    if (pa !== pb) return rank[pa] - rank[pb]
    if (pa === 'past' && a.targetDate !== b.targetDate) return b.targetDate.localeCompare(a.targetDate)
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
    return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id)
  })
}

// The big number on a card: days left, 0 on the last day, days since after
// it, and a dash before it starts.
export function bigNumber(t) {
  if (phase(t) === 'upcoming') return '–'
  return Math.abs(daysBetween(today(), t.targetDate))
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function caption(t) {
  const toStart = daysBetween(today(), t.startDate)
  if (toStart > 0) return `${plural(toStart, 'day')} to start`
  const left = daysBetween(today(), t.targetDate)
  if (left === 0) return 'Today'
  return left > 0 ? `${plural(left, 'day')} left` : `${plural(-left, 'day')} ago`
}

export function formatDay(day) {
  const date = parseDay(day)
  return date ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date) : ''
}

export function formatRange(start, end) {
  const a = parseDay(start), b = parseDay(end)
  if (!a || !b) return ''
  const sameYear = a.getFullYear() === b.getFullYear()
  const first = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(a)
  const last = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(b)
  return `${first} – ${last}`
}

