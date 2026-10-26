// Texts and conversations. Every text to one number is one `messages` row
// (a text to three people is three rows sharing a `group`, which is the id
// SMSGate knows it by). Replies are rows too, with dir 'in'. A `threads`
// row per number keeps the conversation list cheap to read: its name, last
// text and unread count.

import { HttpError, DAY, now, iso, text, sha256 } from './lib.js'
import { normalizePhone, formatPhone, segments, similarityKey, signals, fillTemplate, optKeyword } from './sms.js'
import * as gateway from './gateway.js'
import { requirePhone, credentials, notify } from './phone.js'
import { check } from './guard.js'

const ds = (env) => env.holm.app.ds
const MAX_PARTS = 8
const OPEN = ['scheduled', 'queued', 'sent']

/* ---- Sending --------------------------------------------------------- */

// input: { to: number | number[], body } or { to, template: { id, vars } },
// plus optional sim (1–3), scheduleAt (ISO time or ms) and, from the page
// only, personal: true once the person has confirmed a text that reads
// like a business message is a personal one.
export async function send(env, ownerId, input, { source, key = null }) {
  const phone = requirePhone(env, ownerId)

  const raw = Array.isArray(input.to) ? input.to : [input.to]
  if (!raw.length || raw.every(v => !String(v ?? '').trim())) throw new HttpError(400, 'no_numbers', 'Add at least one number.')
  const bad = raw.filter(v => !normalizePhone(v))
  if (bad.length) throw new HttpError(400, 'bad_number', `Not a phone number: ${bad.slice(0, 3).join(', ')}`, { numbers: bad })
  const numbers = [...new Set(raw.map(normalizePhone))]

  if (key && key.allow && key.allow.length) {
    const outside = numbers.filter(n => !key.allow.includes(n))
    if (outside.length) throw new HttpError(403, 'not_allowed', `This API key can only text ${key.allow.map(formatPhone).join(', ')}.`, { numbers: outside })
  }

  const blocked = ds(env).find('optouts', { ownerId, number: { $in: numbers } }, { limit: 20 }).map(o => o.number)
  if (blocked.length) {
    throw new HttpError(409, 'opted_out', `${blocked.map(formatPhone).join(', ')} asked you to stop texting. Remove them from your opt-out list only if they ask to hear from you again.`, { numbers: blocked })
  }

  let body = ''
  let template = null
  if (input.template) {
    template = ds(env).findOne('templates', { id: String(input.template.id || ''), ownerId })
    if (!template) throw new HttpError(404, 'no_template', 'No such template.')
    const filled = fillTemplate(template.body, input.template.vars)
    if (Object.keys(filled.errors).length) throw new HttpError(400, 'template_vars', 'Some blanks need fixing.', { blanks: filled.errors })
    body = filled.text
  } else {
    body = String(input.body ?? '').trim()
  }
  if (!body) throw new HttpError(400, 'empty', 'Write a message first.')
  const size = segments(body)
  if (size.parts > MAX_PARTS) throw new HttpError(400, 'too_long', `That's ${size.parts} SMS. Keep a text to ${MAX_PARTS} or fewer.`)

  const sig = signals(body)
  if (sig.business && !(source === 'web' && input.personal === true)) {
    throw new HttpError(422, 'needs_dlt',
      sig.otp
        ? 'This looks like a one-time code. In India, OTPs from an app or business must come from a DLT-registered sender, not a personal SIM.'
        : 'This reads like a promotion. In India, marketing texts must come from a DLT-registered sender, not a personal SIM.',
      { otp: sig.otp, promo: sig.promo })
  }

  let scheduleAt = null
  if (input.scheduleAt != null && input.scheduleAt !== '') {
    scheduleAt = typeof input.scheduleAt === 'number' ? input.scheduleAt : Date.parse(input.scheduleAt)
    if (!Number.isFinite(scheduleAt) || scheduleAt < now() + 60000 || scheduleAt > now() + 30 * DAY) {
      throw new HttpError(400, 'schedule', 'Schedule a text between a minute and 30 days from now.')
    }
  }
  const sim = input.sim != null && input.sim !== '' ? Number(input.sim) : phone.defaultSim || null
  if (sim !== null && !(phone.sims || []).some(s => s.slot === sim)) throw new HttpError(400, 'sim', 'That phone has no such SIM.')

  const similarText = template ? `template:${template.id}` : similarityKey(body)
  const similar = similarText ? (await sha256(similarText)).slice(0, 20) : null
  check(env, ownerId, numbers, similar)

  const group = gateway.newMessageId()
  const result = gateway.send(env, await credentials(env, phone), { id: group, text: body, numbers, sim, scheduleAt, deviceId: phone.kind === 'demo' ? null : phone.deviceId })
  const at = now()
  const rows = result.recipients.map(r => {
    const row = {
      ownerId, group, dir: 'out', number: r.number, body, parts: size.parts, encoding: size.encoding,
      state: r.state, error: r.error, sim, source, keyId: key ? key.id : null,
      templateId: template ? template.id : null, similar, at, scheduleAt, sentAt: null, deliveredAt: null,
      demo: phone.kind === 'demo', answered: false
    }
    row.id = ds(env).insert('messages', row)
    touchThread(env, ownerId, r.number, row, { count: 1 })
    return row
  })
  if (template) ds(env).update('templates', { id: template.id }, { $inc: { uses: 1 } })
  return { id: group, parts: size.parts, encoding: size.encoding, messages: rows.map(publicMessage) }
}

/* ---- Conversations --------------------------------------------------- */

function touchThread(env, ownerId, number, row, { unread = 0, count = 0 } = {}) {
  const thread = ds(env).findOne('threads', { ownerId, number })
  const last = { lastId: row.id, lastBody: row.body, lastDir: row.dir, lastState: row.state, lastAt: row.at }
  if (thread) {
    if (row.at >= (thread.lastAt || 0)) ds(env).update('threads', { id: thread.id }, { $set: last, $inc: { unread, count } })
    else ds(env).update('threads', { id: thread.id }, { $inc: { unread, count } })
  } else {
    ds(env).insert('threads', { ownerId, number, name: null, unread, count, ...last })
  }
}

export function publicMessage(m) {
  return {
    id: m.id, group: m.group, dir: m.dir, number: m.number, body: m.body, parts: m.parts, encoding: m.encoding,
    state: m.state, error: m.error || null, sim: m.sim || null, source: m.source,
    at: iso(m.at), scheduleAt: iso(m.scheduleAt), sentAt: iso(m.sentAt), deliveredAt: iso(m.deliveredAt)
  }
}

const publicThread = (t, blocked) => ({
  number: t.number, name: t.name || null, unread: t.unread || 0, count: t.count || 0,
  last: { body: t.lastBody, dir: t.lastDir, state: t.lastState, at: iso(t.lastAt) },
  optedOut: blocked.has(t.number)
})

export function threads(env, ownerId) {
  const blocked = new Set(ds(env).find('optouts', { ownerId }, { limit: 1000 }).map(o => o.number))
  return ds(env).find('threads', { ownerId }, { limit: 500 })
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    .map(t => publicThread(t, blocked))
}

// One conversation, oldest first, 60 texts at a time; `before` pages back.
export function thread(env, ownerId, number, before) {
  const phone = normalizePhone(number)
  if (!phone) throw new HttpError(400, 'bad_number', 'Not a phone number.')
  const query = { ownerId, number: phone }
  if (before) query.at = { $lt: Date.parse(before) }
  const rows = ds(env).find('messages', query, { limit: 61, order: 'desc' })
  const more = rows.length > 60
  const list = rows.slice(0, 60).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
  const row = ds(env).findOne('threads', { ownerId, number: phone })
  if (row && row.unread) ds(env).update('threads', { id: row.id }, { $set: { unread: 0 } })
  const optedOut = Boolean(ds(env).findOne('optouts', { ownerId, number: phone }))
  return { number: phone, name: (row && row.name) || null, optedOut, more, messages: list.map(publicMessage) }
}

export function rename(env, ownerId, number, name) {
  const phone = normalizePhone(number)
  if (!phone) throw new HttpError(400, 'bad_number', 'Not a phone number.')
  const row = ds(env).findOne('threads', { ownerId, number: phone })
  const value = text(name, 40) || null
  if (row) ds(env).update('threads', { id: row.id }, { $set: { name: value } })
  else ds(env).insert('threads', { ownerId, number: phone, name: value, unread: 0, count: 0, lastAt: 0 })
  return { number: phone, name: value }
}

export function forget(env, ownerId, number) {
  const phone = normalizePhone(number)
  if (!phone) throw new HttpError(400, 'bad_number', 'Not a phone number.')
  ds(env).delete('messages', { ownerId, number: phone })
  ds(env).delete('threads', { ownerId, number: phone })
}

// Recent texts, newest first (for the API).
export function recent(env, ownerId, limit) {
  return ds(env).find('messages', { ownerId }, { limit: Math.min(Math.max(Number(limit) || 20, 1), 100), order: 'desc' }).map(publicMessage)
}

// One text by its group id, with each number's state (for the API).
export function group(env, ownerId, id) {
  const rows = ds(env).find('messages', { ownerId, group: String(id) }, { limit: 20 })
  if (!rows.length) throw new HttpError(404, 'not_found', 'No such text.')
  const first = rows[0]
  return {
    id: first.group, body: first.body, parts: first.parts, encoding: first.encoding, source: first.source,
    at: iso(first.at), scheduleAt: iso(first.scheduleAt),
    recipients: rows.map(r => ({ number: r.number, state: r.state, error: r.error || null, sentAt: iso(r.sentAt), deliveredAt: iso(r.deliveredAt) }))
  }
}

export function replies(env, ownerId, since) {
  const query = { ownerId, dir: 'in' }
  const from = Date.parse(since || '')
  if (Number.isFinite(from)) query.at = { $gt: from }
  return ds(env).find('messages', query, { limit: 100, order: 'desc' }).map(publicMessage)
}

/* ---- Receipts and replies -------------------------------------------- */

function applyState(env, row, state, error, at) {
  if (!gateway.later(state, row.state)) return false
  const patch = { state, error: error || null }
  if (state === 'sent' && !row.sentAt) patch.sentAt = at
  if (state === 'delivered') {
    patch.deliveredAt = at
    if (!row.sentAt) patch.sentAt = at
  }
  ds(env).update('messages', { id: row.id }, { $set: patch })
  const thread = ds(env).findOne('threads', { ownerId: row.ownerId, number: row.number })
  if (thread && thread.lastId === row.id) ds(env).update('threads', { id: thread.id }, { $set: { lastState: state } })
  return true
}

// A receipt from the phone: { group, number, state, error, at }. Returns
// { found, number } where number is set if the conversation changed.
export function receipt(env, ownerId, { group, number, state, error, at }) {
  const rows = ds(env).find('messages', { ownerId, group: String(group || '') }, { limit: 20 })
  const row = rows.find(r => gateway.samePhone(r.number, number)) || (rows.length === 1 ? rows[0] : null)
  if (!row) return { found: false, number: null }
  return { found: true, number: applyState(env, row, state, error, at || now()) ? row.number : null }
}

// A text that arrived on the phone. A reply that is only STOP (or a word
// like it) puts the sender on the member's opt-out list; START takes them
// off again.
export function incoming(env, ownerId, { from, body, at, sim }) {
  const number = normalizePhone(from)
  if (!number) return null
  const row = {
    ownerId, group: null, dir: 'in', number, body: String(body || '').slice(0, 2000), parts: null, encoding: null,
    state: 'received', error: null, sim: sim || null, source: 'phone', keyId: null, templateId: null, similar: null,
    at: at || now(), scheduleAt: null, sentAt: null, deliveredAt: null, demo: false, answered: true
  }
  row.id = ds(env).insert('messages', row)
  touchThread(env, ownerId, number, row, { unread: 1, count: 1 })
  const word = optKeyword(row.body)
  if (word === 'stop' && !ds(env).findOne('optouts', { ownerId, number })) {
    ds(env).insert('optouts', { ownerId, number, reason: 'reply', at: row.at })
  }
  if (word === 'start') ds(env).delete('optouts', { ownerId, number, reason: 'reply' })
  return number
}

/* ---- Catching up ----------------------------------------------------- */

// Bring open texts up to date: the demo phone moves them along by the
// clock (and answers some); a real phone is asked for the state of up to
// four texts per call. With live receipts on, only texts still open after
// two minutes are asked about, in case a webhook went astray. Returns the
// numbers whose conversations changed.
export async function refresh(env, ownerId, number) {
  const phone = requirePhone(env, ownerId)
  const query = { ownerId, dir: 'out', state: { $in: OPEN }, at: { $gte: now() - 2 * DAY } }
  if (number) query.number = normalizePhone(number)
  const rows = ds(env).find('messages', query, { limit: 50, order: 'desc' })
  const changed = new Set()
  const t = now()

  if (phone.kind === 'demo') {
    for (const row of rows) {
      const next = gateway.demoState(row.number, row.at, row.scheduleAt, t)
      const start = row.scheduleAt || row.at
      if (applyState(env, row, next.state, next.error, next.state === 'delivered' ? start + 5000 : start + 2000)) changed.add(row.number)
    }
    // Answer delivered texts a few seconds later, once each.
    const waiting = ds(env).find('messages', { ownerId, dir: 'out', demo: true, answered: false, state: 'delivered' }, { limit: 20 })
    for (const row of waiting) {
      const start = row.scheduleAt || row.at
      if (t - start < 8000) continue
      ds(env).update('messages', { id: row.id }, { $set: { answered: true } })
      if (ds(env).findOne('optouts', { ownerId, number: row.number })) continue
      incoming(env, ownerId, { from: row.number, body: gateway.demoReply(row.number, row.body), at: start + 8000 })
      changed.add(row.number)
    }
    return [...changed]
  }

  const due = phone.live ? rows.filter(r => r.at < t - 120000 && (!r.scheduleAt || r.scheduleAt < t - 120000)) : rows
  const groups = [...new Set(due.map(r => r.group))].slice(0, 4)
  if (!groups.length) return []
  const creds = await credentials(env, phone)
  for (const id of groups) {
    const mine = rows.filter(r => r.group === id)
    const state = gateway.status(env, creds, id, mine.map(r => r.number))
    for (const r of state.recipients) {
      const row = mine.find(m => m.number === r.number)
      if (row && applyState(env, row, r.state, r.error, t)) changed.add(row.number)
    }
  }
  return [...changed]
}

// Cancel a text that hasn't left the phone yet, such as a scheduled one.
export async function cancel(env, ownerId, id) {
  const row = ds(env).findOne('messages', { id: String(id), ownerId })
  if (!row || row.dir !== 'out') throw new HttpError(404, 'not_found', 'No such text.')
  if (!['scheduled', 'queued'].includes(row.state)) throw new HttpError(409, 'too_late', 'That text has already left the phone.')
  const phone = requirePhone(env, ownerId)
  gateway.cancel(env, await credentials(env, phone), row.group)
  for (const r of ds(env).find('messages', { ownerId, group: row.group }, { limit: 20 })) applyState(env, r, 'cancelled', null, now())
  notify(env, ownerId, { type: 'update', numbers: [row.number] })
  return publicMessage(ds(env).findOne('messages', { id: row.id }))
}
