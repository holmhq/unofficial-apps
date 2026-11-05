// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"). Each one sends a request to the
// app's own /api/ routes for the signed-in person, so the same checks apply (only the organiser
// can settle, edit or delete; people change only their own times) and every open plan page
// updates live, as it would for a change made in overlap itself.
//
// Times are wall-clock times in the plan's own time zone, written 24-hour as "09:30". The
// server has no Intl, so it can't convert zones; each answer names the zone.

import app from './main.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 405: 'APP_INVALID_INPUT', 409: 'APP_CONFLICT', 429: 'APP_RATE_LIMITED' }

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
  if (!env.holm.auth.getMember()) fail(401, 'Sign in to overlap first.')
  const init = { method, headers: { accept: 'application/json' } }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await app.fetch(new Request((origin(env) || 'https://overlap.invalid') + path, init), env)
  if (res.status === 204) return null
  let data = {}
  try { data = await res.json() } catch {}
  if (!res.ok) fail(res.status, data.error || 'overlap couldn’t do that.')
  return data
}

// A plan by its id or its link (…/p/<id>).
function planId(value) {
  const m = /([a-z2-9]{10})\/?$/.exec(String(value || '').trim())
  if (!m) fail(400, 'Say which plan: its id from plans_list, or its link.')
  return m[1]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const weekday = day => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]
const link = (env, slug) => (origin(env) ? `${origin(env)}/p/${slug}` : undefined)

function minutesOf(text, what) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim())
  if (!m || +m[1] > 24 || +m[2] > 59 || +m[1] * 60 + +m[2] > 1440) fail(400, `${what} is a 24-hour time like 09:30.`)
  return +m[1] * 60 + +m[2]
}

const rowsOf = plan => (plan.end - plan.start) / plan.step

// Runs of time where the same people are free, best first (web/js/time.js bestTimes).
function bestTimes(plan, people, limit) {
  const rows = rowsOf(plan)
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

const span = (plan, day, from, to) => ({
  date: plan.days[day], weekday: weekday(plan.days[day]),
  from: clock(plan.start + from * plan.step), to: clock(plan.start + to * plan.step)
})

// A person's free slots as time ranges, date by date.
function freeRanges(plan, slots) {
  const rows = rowsOf(plan)
  const out = {}
  plan.days.forEach((day, d) => {
    const ranges = []
    let begin = -1
    for (let r = 0; r <= rows; r++) {
      const free = r < rows && slots[d * rows + r] === '1'
      if (free && begin < 0) begin = r
      if (!free && begin >= 0) { ranges.push(`${clock(plan.start + begin * plan.step)}–${clock(plan.start + r * plan.step)}`); begin = -1 }
    }
    if (ranges.length) out[day] = ranges
  })
  return out
}

function planBrief(env, plan, extra = {}) {
  const f = plan.final
  return {
    id: plan.slug,
    name: plan.title,
    note: plan.note || undefined,
    organiser: plan.mine ? 'you' : plan.ownerName,
    dates: plan.days.map(day => `${weekday(day)} ${day}`),
    hours: `${clock(plan.start)}–${clock(plan.end)}`,
    slot_minutes: plan.step,
    zone: plan.tz,
    ...extra,
    settled: f ? span(plan, f.day, f.from, f.to) : undefined,
    link: link(env, plan.slug)
  }
}

const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)

export async function plansList(input, env) {
  const data = await call(env, 'GET', '/api/plans')
  const brief = plan => planBrief(env, plan, { answered: plan.people })
  return { yours: data.owned.map(brief), answered: data.joined.map(brief) }
}

async function readPlan(env, value) {
  return call(env, 'GET', `/api/plans/${planId(value)}`)
}

export async function plansGet(input, env) {
  const { plan, people } = await readPlan(env, input.plan)
  const name = id => people.find(p => p.id === id)?.name
  const best = bestTimes(plan, people, count(input.limit, 1, 20, 5)).map(run => ({
    ...span(plan, run.day, run.from, run.to),
    free: run.who.map(name),
    missing: people.filter(p => !run.who.includes(p.id)).map(p => p.name)
  }))
  return {
    plan: planBrief(env, plan, { answered: people.length, open_now: plan.watching || undefined }),
    best_times: best,
    people: people.map(p => ({ name: p.name, you: p.me || undefined, id: p.id, free: freeRanges(plan, p.slots) }))
  }
}

export async function plansCreate(input, env) {
  const body = {
    title: input.name, note: input.note || '', days: input.dates, tz: input.zone || 'UTC',
    step: input.slot_minutes || 30, start: minutesOf(input.from, 'from'), end: minutesOf(input.to, 'to')
  }
  const { plan } = await call(env, 'POST', '/api/plans', body)
  return { plan: planBrief(env, plan, { answered: 0 }), share: 'Send the link to everyone; they add their times there, no account needed.' }
}

// The person's own times: join the plan if they haven't, then set, add or clear ranges.
export async function timesSet(input, env) {
  const id = planId(input.plan)
  const { plan, people } = await call(env, 'GET', `/api/plans/${id}`)
  const rows = rowsOf(plan)
  const total = plan.days.length * rows
  const mode = input.mode || 'replace'
  let me = people.find(p => p.me)
  const slots = (mode === 'replace' || !me ? '0'.repeat(total) : me.slots).split('')
  for (const range of input.free || []) {
    const from = minutesOf(range.from, 'from'), to = minutesOf(range.to, 'to')
    if (from >= to) fail(400, `${range.from}–${range.to} ends before it starts.`)
    const days = range.date ? [plan.days.indexOf(range.date)] : plan.days.map((_, d) => d)
    if (days[0] < 0) fail(400, `${range.date} isn’t one of this plan’s dates: ${plan.days.join(', ')}.`)
    for (const d of days) {
      for (let r = 0; r < rows; r++) {
        const begins = plan.start + r * plan.step
        if (begins >= from && begins + plan.step <= to) slots[d * rows + r] = mode === 'remove' ? '0' : '1'
      }
    }
  }
  if (!me) me = (await call(env, 'POST', `/api/plans/${id}/people`, input.name ? { name: input.name } : {})).person
  const body = { slots: slots.join('') }
  if (input.name && input.name !== me.name) body.name = input.name
  const { person } = await call(env, 'PUT', `/api/plans/${id}/people/${me.id}`, body)
  return { plan: plan.title, zone: plan.tz, you: person.name, free: freeRanges(plan, person.slots), link: link(env, id) }
}

export async function plansSettle(input, env) {
  const id = planId(input.plan)
  let final = null
  if (!input.reopen) {
    const { plan } = await call(env, 'GET', `/api/plans/${id}`)
    const day = plan.days.indexOf(input.date)
    if (day < 0) fail(400, `Pick one of this plan’s dates: ${plan.days.join(', ')}.`)
    const from = (minutesOf(input.from, 'from') - plan.start) / plan.step
    const to = (minutesOf(input.to, 'to') - plan.start) / plan.step
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > rowsOf(plan) || from >= to) {
      fail(400, `Pick a time between ${clock(plan.start)} and ${clock(plan.end)}, on ${plan.step}-minute steps.`)
    }
    final = { day, from, to }
  }
  const { plan } = await call(env, 'PATCH', `/api/plans/${id}`, { final })
  return { plan: planBrief(env, plan) }
}

export async function plansUpdate(input, env) {
  const body = {}
  if (input.name !== undefined) body.title = input.name
  if (input.note !== undefined) body.note = input.note
  if (!Object.keys(body).length) fail(400, 'Give a new name or note.')
  const { plan } = await call(env, 'PATCH', `/api/plans/${planId(input.plan)}`, body)
  return { plan: planBrief(env, plan) }
}

export async function peopleRemove(input, env) {
  const id = planId(input.plan)
  const { people } = await call(env, 'GET', `/api/plans/${id}`)
  const wanted = String(input.person || '').trim()
  let person = people.find(p => p.id === wanted)
  if (!person) {
    const named = people.filter(p => p.name.toLowerCase() === wanted.toLowerCase())
    if (named.length > 1) fail(409, `${named.length} people are called ${wanted}; give the id from plans_get.`)
    person = named[0]
  }
  if (!person) fail(404, `Nobody called ${wanted} has answered this plan.`)
  await call(env, 'DELETE', `/api/plans/${id}/people/${person.id}`)
  return { removed: person.name }
}

export async function plansDelete(input, env) {
  const id = planId(input.plan)
  const { plan } = await call(env, 'GET', `/api/plans/${id}`)
  await call(env, 'DELETE', `/api/plans/${id}`)
  return { deleted: plan.title }
}
