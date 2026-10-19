import { holm } from "./_holm.js";
// The store's own state: settings, light counters and reviews.
import { reject, text, profile } from './lib.js'

const ds = () => holm.app.ds
const kv = () => holm.app.kv
const DAY = 86400000
const COLOR = /^#[0-9a-fA-F]{6}$/

// Settings: the site's tint and the apps an admin has hidden from the store.
const DEFAULTS = { tint: '#0e7c66', hidden: [] }

export function settings() {
  return Object.assign({}, DEFAULTS, kv().get('settings') || {})
}

export function saveSettings(input) {
  const next = settings()
  if ('tint' in input) {
    if (!COLOR.test(input.tint || '')) reject(400, 'invalid_tint', 'A tint is a colour like #0e7c66.')
    next.tint = input.tint.toLowerCase()
  }
  if ('hidden' in input) {
    if (!Array.isArray(input.hidden) || input.hidden.some(path => !/^[a-z0-9-]{1,64}$/.test(path))) {
      reject(400, 'invalid_hidden', 'Hidden apps are a list of app folder names.')
    }
    next.hidden = [...new Set(input.hidden)].sort()
  }
  kv().set('settings', next)
  return next
}

// Counters: per app, per day, for page views, Get taps and copied commands.
// Nothing about who; each day's counter expires after 40 days.
export const KINDS = ['view', 'get', 'copy']
const day = time => new Date(time).toISOString().slice(0, 10)

export function count(app, kind) {
  const key = `stats:${day(Date.now())}:${app}:${kind}`
  if (kv().increment(key, 1) === 1) kv().set(key, 1, 40 * DAY)
}

export function stats() {
  const today = Date.parse(day(Date.now()))
  const empty = () => ({ view: 0, get: 0, copy: 0 })
  const out = {}
  for (const { key, value } of kv().list('stats:')) {
    const [, date, app, kind] = key.split(':')
    const age = (today - Date.parse(date)) / DAY
    if (!(age >= 0 && age < 30) || !KINDS.includes(kind)) continue
    const row = out[app] || (out[app] = { week: empty(), month: empty() })
    row.month[kind] += Number(value) || 0
    if (age < 7) row.week[kind] += Number(value) || 0
  }
  return out
}

// Reviews: one per person per app. A new or edited review waits for an
// admin's approval before anyone else sees it.
const iso = time => new Date(time).toISOString()

function publicReview(doc) {
  return { id: doc.id, name: doc.name, avatar: doc.avatar, rating: doc.rating, title: doc.title, body: doc.body, date: iso(doc.updatedAt) }
}
const ownReview = doc => ({ ...publicReview(doc), status: doc.status })
const adminReview = doc => ({ ...publicReview(doc), app: doc.app, status: doc.status })

export function ratings() {
  const out = {}
  for (const doc of ds().find('reviews', { status: 'approved' }, { limit: 2000 })) {
    const row = out[doc.app] || (out[doc.app] = { total: 0, count: 0 })
    row.total += doc.rating
    row.count += 1
  }
  for (const app in out) out[app] = { average: Math.round(out[app].total / out[app].count * 10) / 10, count: out[app].count }
  return out
}

export function reviewsFor(app, viewer) {
  const approved = ds().find('reviews', { app, status: 'approved' }, { limit: 200, orderBy: 'updatedAt', order: 'desc' })
  const mine = viewer ? ds().findOne('reviews', { app, memberId: viewer.id }) : null
  return { reviews: approved.map(publicReview), mine: mine ? ownReview(mine) : null }
}

export function saveReview(app, viewer, input) {
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) reject(400, 'invalid_rating', 'Choose one to five stars.')
  const title = text(input.title, 80)
  const words = text(input.body, 2000)
  if (!title && !words) reject(400, 'invalid_review', 'Write a title or a few words.')
  const who = profile(viewer)
  const fields = { rating, title, body: words, name: who.name, avatar: who.avatar, status: 'pending', updatedAt: Date.now() }
  const existing = ds().findOne('reviews', { app, memberId: viewer.id })
  if (existing) ds().update('reviews', { id: existing.id }, { $set: fields })
  else ds().insert('reviews', { app, memberId: viewer.id, createdAt: Date.now(), ...fields })
  return ownReview(ds().findOne('reviews', { app, memberId: viewer.id }))
}

export function deleteOwnReview(app, viewer) {
  ds().delete('reviews', { app, memberId: viewer.id })
}

export function allReviews() {
  return ds().find('reviews', {}, { limit: 500, orderBy: 'updatedAt', order: 'desc' }).map(adminReview)
}

export function moderate(id, status) {
  if (!['approved', 'rejected', 'pending'].includes(status)) reject(400, 'invalid_status', 'Approve or reject the review.')
  if (!ds().findOne('reviews', { id })) reject(404, 'not_found', 'Review not found.')
  ds().update('reviews', { id }, { $set: { status } })
  return adminReview(ds().findOne('reviews', { id }))
}

export function removeReview(id) {
  ds().delete('reviews', { id })
}
