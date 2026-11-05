// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"). Each one sends a request to the
// app's own /api/ routes as the signed-in person, so it reaches only that person's trackers,
// with the same checks as the page.
//
// Days are 'YYYY-MM-DD' in the person's own time zone, which the server can't know: every tool
// takes `today`, and without it uses today's date in UTC.

import app from './main.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT' }
const ICONS = ['CalendarDays', 'Flag', 'Gift', 'Heart', 'Hourglass', 'Mountain', 'Plane', 'Rocket', 'Sparkles', 'Sprout', 'SunMedium', 'Waves']
const DAY_MS = 86_400_000
const MAX_RATINGS = 400

function fail(status, message) {
  const error = new Error(message)
  error.code = CODES[status] || 'APP_INVALID_INPUT'
  error.status = status
  error.public = true
  throw error
}

const origin = env => env.holm.app.kv.get('site:origin') || ''

// One request to the app's own API, as the signed-in person.
async function call(env, method, path, body) {
  if (!env.holm.auth.getMember()) fail(401, 'Sign in to Until first.')
  const init = { method, headers: { accept: 'application/json' } }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await app.fetch(new Request((origin(env) || 'https://until.invalid') + path, init), env)
  let data = {}
  try { data = await res.json() } catch {}
  if (!res.ok) fail(res.status, data.error || 'Until couldn’t do that.')
  return data
}

/* ---- Days ---- */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isDay = day => typeof day === 'string' && DAY.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
const between = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function dayOf(value, what) {
  if (value === undefined || value === null || value === '') return undefined
  const day = String(value).trim()
  if (!isDay(day)) fail(400, `${what} is a date written YYYY-MM-DD.`)
  return day
}

const todayOf = input => dayOf(input.today, 'today') || new Date().toISOString().slice(0, 10)

/* ---- Trackers ---- */

function phase(t, today) {
  if (between(today, t.startDate) > 0) return 'upcoming'
  if (between(t.targetDate, today) > 0) return 'past'
  return 'running'
}

// What the card says: days to start, days left (0 on the last day), or days since it ended.
function caption(t, today) {
  const toStart = between(today, t.startDate)
  if (toStart > 0) return `${plural(toStart, 'day')} to start`
  const left = between(today, t.targetDate)
  if (left === 0) return 'Today is the last day'
  return left > 0 ? `${plural(left, 'day')} left` : `Ended ${plural(-left, 'day')} ago`
}

function brief(t, today) {
  const status = phase(t, today)
  const stars = Object.values(t.ratings || {})
  const out = {
    id: t.id,
    title: t.title,
    subtitle: t.subtitle || undefined,
    icon: t.icon,
    start: t.startDate,
    end: t.targetDate,
    days: t.count,
    status,
    says: caption(t, today),
  }
  if (status === 'running') {
    out.day = between(t.startDate, today) + 1
    out.days_left = between(today, t.targetDate)
  } else if (status === 'upcoming') {
    out.days_to_start = between(today, t.startDate)
  } else {
    out.days_since_end = between(t.targetDate, today)
  }
  if (t.ratings && t.ratings[today]) out.today_stars = t.ratings[today]
  if (stars.length) {
    out.rated_days = stars.length
    out.average_stars = Math.round(stars.reduce((a, b) => a + b, 0) / stars.length * 10) / 10
  }
  return out
}

// Running first, then upcoming by start, then past ones, the most recently ended first.
function sorted(list, today) {
  const rank = { running: 0, upcoming: 1, past: 2 }
  return list.slice().sort((a, b) => {
    const pa = phase(a, today), pb = phase(b, today)
    if (pa !== pb) return rank[pa] - rank[pb]
    if (pa === 'past' && a.targetDate !== b.targetDate) return b.targetDate.localeCompare(a.targetDate)
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  })
}

async function all(env) {
  return (await call(env, 'GET', '/api/countdowns')).countdowns || []
}

// A tracker by its id, or by its title when only one tracker has it.
async function find(env, value) {
  const want = String(value || '').trim()
  if (!want) fail(400, 'Say which tracker: its id or its title from trackers_list.')
  const list = await all(env)
  const byId = list.find(t => t.id === want)
  if (byId) return byId
  const named = list.filter(t => t.title.toLowerCase() === want.toLowerCase())
  if (named.length > 1) fail(409, `More than one tracker is called “${want}”. Use its id from trackers_list.`)
  if (!named.length) fail(404, 'No tracker by that name. Use trackers_list to find it.')
  return named[0]
}

const EMPTY = 'No trackers in this account. Trackers made while signed out stay in that browser until the person signs in to Until there and moves them to their account.'

export async function trackersList(input, env) {
  const today = todayOf(input)
  let list = sorted(await all(env), today)
  const total = list.length
  if (input.status) list = list.filter(t => phase(t, today) === input.status)
  const limit = Number.isInteger(input.limit) ? Math.max(1, Math.min(500, input.limit)) : 100
  return {
    today,
    trackers: list.slice(0, limit).map(t => brief(t, today)),
    more: list.length > limit ? list.length - limit : undefined,
    note: total ? undefined : EMPTY,
    open: origin(env) || undefined,
  }
}

export async function trackersGet(input, env) {
  const today = todayOf(input)
  const t = await find(env, input.tracker)
  const days = Object.keys(t.ratings || {}).sort()
  const shown = days.slice(-MAX_RATINGS)
  const counts = [1, 2, 3, 4, 5].map(n => days.filter(d => t.ratings[d] === n).length)
  const lived = phase(t, today) === 'upcoming' ? 0 : Math.min(t.count, between(t.startDate, today) + 1)
  return {
    today,
    ...brief(t, today),
    ratings: shown.map(day => ({ day, stars: t.ratings[day] })),
    older_ratings: days.length > shown.length ? days.length - shown.length : undefined,
    stars_count: days.length ? { 1: counts[0], 2: counts[1], 3: counts[2], 4: counts[3], 5: counts[4] } : undefined,
    unrated_days_so_far: lived ? Math.max(0, lived - days.filter(d => d <= today).length) : undefined,
    created: t.createdAt || undefined,
    updated: t.updatedAt || undefined,
  }
}

// The length, from `days` or from an `end` date, for a tracker starting on `start`.
function length(start, input) {
  const end = dayOf(input.end, 'end')
  if (input.days !== undefined && end) fail(400, 'Give days or end, not both.')
  if (end) {
    const n = between(start, end) + 1
    if (n < 1) fail(400, 'The end comes before the start.')
    return { count: n }
  }
  if (input.days !== undefined) return { count: input.days }
  return {}
}

export async function trackersCreate(input, env) {
  const today = todayOf(input)
  const start = dayOf(input.start, 'start') || today
  const { count } = length(start, input)
  if (!count) fail(400, 'Say how long it runs: a number of days, or an end date.')
  const { countdown } = await call(env, 'POST', '/api/countdowns', {
    title: input.title,
    subtitle: input.subtitle || '',
    icon: ICONS.includes(input.icon) ? input.icon : ICONS[Math.floor(Math.random() * ICONS.length)],
    startDate: start,
    count,
  })
  return { created: brief(countdown, today), open: origin(env) || undefined }
}

export async function trackersUpdate(input, env) {
  const today = todayOf(input)
  const t = await find(env, input.tracker)
  const changes = {}
  if (typeof input.title === 'string') changes.title = input.title
  if (typeof input.subtitle === 'string') changes.subtitle = input.subtitle
  if (typeof input.icon === 'string') changes.icon = input.icon
  const start = dayOf(input.start, 'start')
  if (start) changes.startDate = start
  // A new start alone keeps the length; days or an end date set it.
  const end = dayOf(input.end, 'end')
  if (input.days !== undefined && end) fail(400, 'Give days or end, not both.')
  if (input.days !== undefined) changes.count = input.days
  if (end) changes.targetDate = end
  if (!Object.keys(changes).length) fail(400, 'Say what to change: title, subtitle, icon, start, days or end.')
  const { countdown } = await call(env, 'PATCH', `/api/countdowns/${encodeURIComponent(t.id)}`, changes)
  const dropped = Object.keys(t.ratings || {}).length - Object.keys(countdown.ratings || {}).length
  return {
    updated: brief(countdown, today),
    dropped_ratings: dropped > 0 ? dropped : undefined,
  }
}

export async function daysRate(input, env) {
  const today = todayOf(input)
  const day = dayOf(input.day, 'day') || today
  if (between(today, day) > 0) fail(400, `${day} hasn’t come yet. Rate a day once it’s here.`)
  const t = await find(env, input.tracker)
  if (between(t.startDate, day) < 0) fail(400, `${t.title} starts on ${t.startDate}, after ${day}.`)
  if (between(day, t.targetDate) < 0) fail(400, `${t.title} ended on ${t.targetDate}, before ${day}.`)
  const stars = input.stars
  const { countdown } = await call(env, 'PATCH', `/api/countdowns/${encodeURIComponent(t.id)}`, { rate: { day, stars } })
  return {
    tracker: brief(countdown, today),
    day,
    day_number: between(t.startDate, day) + 1,
    stars: stars || undefined,
    cleared: stars === 0 || undefined,
  }
}

export async function trackersDelete(input, env) {
  const t = await find(env, input.tracker)
  await call(env, 'DELETE', `/api/countdowns/${encodeURIComponent(t.id)}`)
  return { deleted: t.title, start: t.startDate, end: t.targetDate, rated_days: Object.keys(t.ratings || {}).length || undefined }
}
