// API keys: a signed-in owner makes them in the app, then scripts and agents
// send one as a bearer token to do anything the owner can. An agent account's
// key (accounts.js) reaches only its one project, even once someone keeps
// it. Only a SHA-256 hash is stored; the key itself is shown once.
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

async function keyRecord(request) {
  const match = /^Bearer\s+(fb_[a-z0-9]{32})\s*$/.exec(header(request, 'authorization') || '')
  const record = match ? ds().findOne('apikeys', { hash: await sha256(match[1]) }) : null
  if (!record) reject(401, 'unauthorized', 'Missing or invalid API key.')
  return record
}

// Who is asking, as an owner: a bearer key if one is sent, else the signed-in
// member. Returns { id, name, avatar }, and `project` for a key that reaches
// one project only.
export async function owner(request) {
  if (header(request, 'authorization') == null) return profile(requireMember())
  const record = await keyRecord(request)
  if (!record.lastUsedAt || now() - record.lastUsedAt > 60000) {
    ds().update('apikeys', { id: record.id }, { $set: { lastUsedAt: now() } })
    // An agent account is in use while its key is.
    if (record.ownerId.startsWith('acct_')) ds().update('accounts', { id: record.ownerId }, { $set: { lastUsedAt: now() } })
  }
  const user = { id: record.ownerId, name: record.ownerName, avatar: record.ownerAvatar }
  return record.project ? { ...user, project: record.project } : user
}

const keyDTO = doc => ({ id: doc.id, name: doc.name, prefix: doc.prefix, project: doc.project || null, createdAt: iso(doc.createdAt), lastUsedAt: iso(doc.lastUsedAt) })

// Managing keys always needs the person, signed in; a key can't make keys.
export function listKeys() {
  const user = requireMember()
  return ds().find('apikeys', { ownerId: user.id }, { limit: MAX_KEYS, orderBy: 'createdAt', order: 'desc' }).map(keyDTO)
}

// A new key for `who` ({ id, name, avatar }); `project` limits it to one.
export async function issueKey(who, name, project = '') {
  const key = 'fb_' + random(32)
  const doc = {
    id: random(16), ownerId: who.id, ownerName: who.name, ownerAvatar: who.avatar,
    name: text(name, 60) || 'API key', prefix: key.slice(0, 9), project,
    hash: await sha256(key), createdAt: now(), lastUsedAt: null
  }
  ds().insert('apikeys', doc)
  return { key, record: keyDTO(doc) }
}

export async function createKey(input) {
  const user = requireMember()
  if (ds().count('apikeys', { ownerId: user.id }) >= MAX_KEYS) reject(409, 'too_many', `You can have up to ${MAX_KEYS} keys.`)
  return issueKey(profile(member()), input.name)
}

// A key may replace itself (same owner, name and reach); the old one stops
// working at once. It can't make any other key.
export async function rotateKey(request) {
  const record = await keyRecord(request)
  const next = await issueKey({ id: record.ownerId, name: record.ownerName, avatar: record.ownerAvatar }, record.name, record.project || '')
  ds().delete('apikeys', { id: record.id })
  return next
}

export function deleteKey(id) {
  const user = requireMember()
  if (!ds().findOne('apikeys', { id: String(id), ownerId: user.id })) reject(404, 'not_found', 'Key not found.')
  ds().delete('apikeys', { id: String(id), ownerId: user.id })
}
