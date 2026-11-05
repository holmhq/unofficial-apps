// Texts drafted through Zend's MCP tools. A tool can't send a text: sending
// calls out to the phone with its sealed sign-in, which named operations
// can't do. That suits a text, which goes out on the person's own number
// and can't be taken back. So a tool leaves a draft here, the open Zend
// page shows it at once, and the person checks it and taps Send. The send
// goes through POST /api/messages like any other, with every limit and
// check, and takes the draft with it. Drafts left unsent go after a day.

import { HttpError, DAY, now, iso } from './lib.js'
import { normalizePhone, formatPhone, segments, signals } from './sms.js'
import { requirePhone, notify } from './phone.js'

const ds = (env) => env.holm.app.ds
export const MAX_WAITING = 20
const MAX_TO = 10
const MAX_PARTS = 8
const LIFE = DAY

export const publicDraft = (d) => ({
  id: d.id, to: d.to, body: d.body, sim: d.sim || null, scheduleAt: iso(d.scheduleAt),
  business: d.business || null, at: iso(d.at), expiresAt: iso(d.expiresAt)
})

// The person's drafts that haven't expired, newest first. Reads only, so a
// tool that only reads can list them.
export function waiting(env, ownerId) {
  return ds(env).find('drafts', { ownerId, expiresAt: { $gt: now() } }, { limit: MAX_WAITING + 10 })
    .sort((a, b) => b.at - a.at)
}

function sweep(env, ownerId) {
  for (const d of ds(env).find('drafts', { ownerId, expiresAt: { $lte: now() } }, { limit: 50 })) ds(env).delete('drafts', { id: d.id, ownerId })
}

// Who a draft goes to: numbers in any usual form, or names the person gave
// their conversations. Returns the numbers, or says which ones it couldn't read.
export function resolve(env, ownerId, values) {
  const list = (Array.isArray(values) ? values : [values]).map(v => String(v ?? '').trim()).filter(Boolean)
  if (!list.length) throw new HttpError(400, 'no_numbers', 'Say who it goes to: a number, or the name of a conversation.')
  let named = null
  const numbers = []
  const unknown = []
  const unclear = []
  for (const value of list) {
    const number = normalizePhone(value)
    if (number) { numbers.push(number); continue }
    named = named || ds(env).find('threads', { ownerId }, { limit: 500 }).filter(t => t.name)
    const hits = named.filter(t => t.name.toLowerCase() === value.toLowerCase())
    if (hits.length === 1) numbers.push(hits[0].number)
    else if (hits.length > 1) unclear.push(value)
    else unknown.push(value)
  }
  if (unclear.length) throw new HttpError(409, 'ambiguous', `More than one conversation is called ${unclear.map(v => `“${v}”`).join(', ')}. Use the number instead.`)
  if (unknown.length) throw new HttpError(400, 'bad_number', `Not a phone number, or the name of a conversation: ${unknown.slice(0, 3).join(', ')}. Numbers outside India start with + and the country code.`)
  return [...new Set(numbers)]
}

export function create(env, ownerId, input) {
  sweep(env, ownerId)
  const phone = requirePhone(env, ownerId)
  if (waiting(env, ownerId).length >= MAX_WAITING) {
    throw new HttpError(409, 'too_many', `${MAX_WAITING} drafts are already waiting. Ask the person to send or discard some in Zend first.`)
  }
  const to = resolve(env, ownerId, input.to)
  if (to.length > MAX_TO) throw new HttpError(400, 'too_many_numbers', `A text goes to at most ${MAX_TO} people. More than that is a bulk message.`)
  const blocked = ds(env).find('optouts', { ownerId, number: { $in: to } }, { limit: 20 }).map(o => o.number)
  if (blocked.length) {
    throw new HttpError(409, 'opted_out', `${blocked.map(formatPhone).join(', ')} ${blocked.length > 1 ? 'are' : 'is'} on the person’s opt-out list, so Zend won’t draft a text to them.`)
  }
  const body = String(input.body ?? '').trim()
  if (!body) throw new HttpError(400, 'empty', 'Write the text first.')
  const size = segments(body)
  if (size.parts > MAX_PARTS) throw new HttpError(400, 'too_long', `That’s ${size.parts} SMS. Keep a text to ${MAX_PARTS} or fewer.`)
  const sim = input.sim == null ? null : Number(input.sim)
  if (sim !== null && !(phone.sims || []).some(s => s.slot === sim)) throw new HttpError(400, 'sim', 'That phone has no such SIM.')
  let scheduleAt = null
  if (input.scheduleAt) {
    scheduleAt = Date.parse(input.scheduleAt)
    if (!Number.isFinite(scheduleAt) || scheduleAt < now() + 5 * 60000 || scheduleAt > now() + 30 * DAY) {
      throw new HttpError(400, 'schedule', 'Schedule a text between five minutes and 30 days from now.')
    }
  }
  const sig = signals(body)
  const at = now()
  const doc = { ownerId, to, body, sim, scheduleAt, business: sig.business ? (sig.otp ? 'otp' : 'promo') : null, at, expiresAt: at + LIFE }
  doc.id = ds(env).insert('drafts', doc)
  notify(env, ownerId, { type: 'drafts' })
  return { draft: doc, parts: size.parts, encoding: size.encoding }
}

export function discard(env, ownerId, id) {
  const doc = ds(env).findOne('drafts', { id: String(id), ownerId })
  if (!doc || doc.expiresAt <= now()) throw new HttpError(404, 'not_found', 'No such draft. It may have been sent, discarded or left to expire.')
  ds(env).delete('drafts', { id: doc.id, ownerId })
  notify(env, ownerId, { type: 'drafts' })
  return doc
}

// After the person sent it from Zend.
export function consume(env, ownerId, id) {
  if (!ds(env).findOne('drafts', { id: String(id), ownerId })) return
  ds(env).delete('drafts', { id: String(id), ownerId })
  notify(env, ownerId, { type: 'drafts' })
}
