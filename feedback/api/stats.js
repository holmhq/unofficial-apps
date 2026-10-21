// Light analytics: a counter per project, day and event in shared KV. No
// cookies and no visitor identifiers, so it counts events, not people.
import { ds, kv, now, reject, kindOf } from './lib.js'

// Scans and emails are the page visits that came from a QR code or an email.
export const METRICS = ['visits', 'scans', 'emails', 'opens', 'sent', 'votes', 'comments']
const RANGES = [7, 30, 90]
const KEEP_DAYS = 400
const DAY = 86400000

const dayOf = time => new Date(time).toISOString().slice(0, 10)

// Counting must never break the request it rides on.
export function statsFactory(env, { prune = true } = {}) {
  const ds = () => env.holm.app.ds
  const kv = () => env.holm.app.kv

function count(projectId, metric) {
  try { kv().increment(`stat:${projectId}:${dayOf(now())}:${metric}`, 1) } catch (error) { console.warn('stat', String(error)) }
}

function removeProjectStats(projectId) {
  for (const entry of kv().list(`stat:${projectId}:`) || []) kv().delete(entry.key)
}

function range(input) {
  const days = Number(input) || 30
  if (!RANGES.includes(days)) reject(400, 'invalid_range', 'Pick 7, 30 or 90 days.')
  const today = Date.parse(dayOf(now()))
  return Array.from({ length: days }, (_, i) => dayOf(today - (days - 1 - i) * DAY))
}

const zeros = days => Object.fromEntries(METRICS.map(metric => [metric, days.map(() => 0)]))
const sum = list => list.reduce((total, n) => total + n, 0)
const totalsOf = daily => Object.fromEntries(METRICS.map(metric => [metric, sum(daily[metric])]))

// One project's daily series. Counters older than a year or so are dropped
// as they're read.
function series(projectId, days) {
  const daily = zeros(days)
  const index = new Map(days.map((day, i) => [day, i]))
  const cutoff = dayOf(now() - KEEP_DAYS * DAY)
  for (const entry of kv().list(`stat:${projectId}:`) || []) {
    const [, , day, metric] = entry.key.split(':')
    if (day < cutoff) { if (prune) kv().delete(entry.key); continue }
    if (index.has(day) && daily[metric]) daily[metric][index.get(day)] = Number(entry.value) || 0
  }
  return daily
}

// Every project the owner has, side by side.
function accountStats(user, input) {
  const days = range(input)
  const projects = ds().find('projects', { ownerId: user.id }, { limit: 20, orderBy: 'createdAt', order: 'desc' }).map(doc => {
    const daily = series(doc.id, days)
    return { id: doc.id, name: doc.name, color: doc.color, daily, totals: totalsOf(daily) }
  })
  const daily = zeros(days)
  for (const project of projects) for (const metric of METRICS) project.daily[metric].forEach((n, i) => { daily[metric][i] += n })
  return { days, daily, totals: totalsOf(daily), projects }
}

// One project the caller owns, plus where its feedback came from and what
// kind it was.
function projectStats(project, input) {
  const days = range(input)
  const daily = series(project.id, days)
  const since = Date.parse(days[0])
  const items = ds().find('items', { project: project.id, createdAt: { $gte: since } }, { limit: 1000 })
  const pages = new Map()
  const kinds = { issue: 0, idea: 0, question: 0, praise: 0, problem: 0 }
  // How many people gave one star, two, and so on.
  const ratings = [0, 0, 0, 0, 0]
  for (const item of items) {
    const page = item.source === 'page' ? 'Feedback page' : (item.page || '').replace(/^https?:\/\//, '') || 'Unknown page'
    pages.set(page, (pages.get(page) || 0) + 1)
    if (kindOf(item.kind) in kinds) kinds[kindOf(item.kind)] += 1
    if (item.rating >= 1 && item.rating <= 5) ratings[item.rating - 1] += 1
  }
  const top = [...pages].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([page, count]) => ({ page, count }))
  return { days, daily, totals: totalsOf(daily), pages: top, kinds, ratings }
}
  return { count, removeProjectStats, accountStats, projectStats }
}

const legacyStats = () => statsFactory({ holm: { app: { ds: ds(), kv: kv() } } })
export const count = (...args) => legacyStats().count(...args)
export const removeProjectStats = (...args) => legacyStats().removeProjectStats(...args)
export const accountStats = (...args) => legacyStats().accountStats(...args)
export const projectStats = (...args) => legacyStats().projectStats(...args)
