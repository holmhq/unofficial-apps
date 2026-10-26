// API keys let a member's own scripts text from their phone: a server that
// texts them when it goes down, a reminder to family. A key is shown once;
// only its SHA-256 hash is kept. Each key can be held to a short list of
// numbers, so a key that leaks can't text anyone else. Keys follow every
// limit the page does, and refuse texts that read like OTPs or promotions.

import { HttpError, now, iso, random, sha256, text } from './lib.js'
import { normalizePhone } from './sms.js'

const ds = (env) => env.holm.app.ds
const MAX_KEYS = 10

const keyDTO = (doc) => ({
  id: doc.id, name: doc.name, prefix: doc.prefix, allow: doc.allow || [],
  createdAt: iso(doc.createdAt), lastUsedAt: iso(doc.lastUsedAt), sends: doc.sends || 0
})

export function list(env, ownerId) {
  return ds(env).find('apikeys', { ownerId }, { limit: MAX_KEYS, order: 'desc' }).map(keyDTO)
}

export async function create(env, ownerId, input) {
  if (ds(env).count('apikeys', { ownerId }) >= MAX_KEYS) throw new HttpError(409, 'too_many', `You can have up to ${MAX_KEYS} keys.`)
  if (!ds(env).findOne('phones', { ownerId })) throw new HttpError(409, 'no_phone', 'Connect your phone before making a key.')
  const allow = []
  for (const value of Array.isArray(input.allow) ? input.allow : []) {
    if (!String(value ?? '').trim()) continue
    const number = normalizePhone(value)
    if (!number) throw new HttpError(400, 'bad_number', `Not a phone number: ${value}`)
    if (!allow.includes(number)) allow.push(number)
  }
  if (allow.length > 10) throw new HttpError(400, 'too_many_numbers', 'Hold a key to at most 10 numbers.')
  const key = 'sd_' + random(32)
  const doc = {
    ownerId, name: text(input.name, 60) || 'API key', prefix: key.slice(0, 8),
    hash: await sha256(key), allow, createdAt: now(), lastUsedAt: null, sends: 0
  }
  doc.id = ds(env).insert('apikeys', doc)
  return { key, record: keyDTO(doc) }
}

export function remove(env, ownerId, id) {
  if (!ds(env).findOne('apikeys', { id: String(id), ownerId })) throw new HttpError(404, 'not_found', 'No such key.')
  ds(env).delete('apikeys', { id: String(id), ownerId })
}

// The key in an Authorization: Bearer header, or a 401.
export async function authenticate(env, request) {
  const match = /^Bearer\s+(sd_[a-z0-9]{32})\s*$/.exec(request.headers.get('authorization') || '')
  const record = match ? ds(env).findOne('apikeys', { hash: await sha256(match[1]) }) : null
  if (!record) throw new HttpError(401, 'unauthorized', 'Send a valid API key as "Authorization: Bearer sd_…".')
  if (!record.lastUsedAt || now() - record.lastUsedAt > 60000) {
    ds(env).update('apikeys', { id: record.id }, { $set: { lastUsedAt: now() } })
  }
  return record
}

export function counted(env, record, n) {
  ds(env).update('apikeys', { id: record.id }, { $inc: { sends: n } })
}
