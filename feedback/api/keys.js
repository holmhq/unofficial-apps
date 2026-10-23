// API keys: a signed-in owner makes them in the app, then scripts and agents
// send one as a bearer token to do anything the owner can. Only a SHA-256
// hash is stored; the key itself is shown once.
import { ds, now, iso, text, reject, random, member, profile, requireMember } from './lib.js'

const MAX_KEYS = 10

export async function sha256(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function header(request, name) {
  const headers = request.headers || {}
  for (const key in headers) {
    if (key.toLowerCase() === name) return String(Array.isArray(headers[key]) ? headers[key][0] : headers[key])
  }
  return null
}

// Who is asking, as an owner: a bearer key if one is sent, else the signed-in
// member. Returns { id, name, avatar }.
export async function owner(request) {
  const auth = header(request, 'authorization')
  if (auth == null) return profile(requireMember())
  const match = /^Bearer\s+(fb_[a-z0-9]{32})\s*$/.exec(auth)
  const record = match ? ds().findOne('apikeys', { hash: await sha256(match[1]) }) : null
  if (!record) reject(401, 'unauthorized', 'Missing or invalid API key.')
  if (!record.lastUsedAt || now() - record.lastUsedAt > 60000) ds().update('apikeys', { id: record.id }, { $set: { lastUsedAt: now() } })
  return { id: record.ownerId, name: record.ownerName, avatar: record.ownerAvatar }
}

const keyDTO = doc => ({ id: doc.id, name: doc.name, prefix: doc.prefix, createdAt: iso(doc.createdAt), lastUsedAt: iso(doc.lastUsedAt) })

// Managing keys always needs the person, signed in; a key can't make keys.
export function listKeys() {
  const user = requireMember()
  return ds().find('apikeys', { ownerId: user.id }, { limit: MAX_KEYS, orderBy: 'createdAt', order: 'desc' }).map(keyDTO)
}

export async function createKey(input) {
  const user = requireMember()
  if (ds().count('apikeys', { ownerId: user.id }) >= MAX_KEYS) reject(409, 'too_many', `You can have up to ${MAX_KEYS} keys.`)
  const who = profile(member())
  const key = 'fb_' + random(32)
  const doc = {
    id: random(16), ownerId: user.id, ownerName: who.name, ownerAvatar: who.avatar,
    name: text(input.name, 60) || 'API key', prefix: key.slice(0, 9),
    hash: await sha256(key), createdAt: now(), lastUsedAt: null
  }
  ds().insert('apikeys', doc)
  return { key, record: keyDTO(doc) }
}

export function deleteKey(id) {
  const user = requireMember()
  if (!ds().findOne('apikeys', { id: String(id), ownerId: user.id })) reject(404, 'not_found', 'Key not found.')
  ds().delete('apikeys', { id: String(id), ownerId: user.id })
}
