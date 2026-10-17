import { ds, now, iso, ok, reject, header, random, sha256, member, cookieOwner, body, text, absolute } from './lib.js'

export async function owner(request) {
  const auth = header(request, 'Authorization')
  if (auth == null) return cookieOwner()
  const match = auth.match(/^Bearer\s+(pb_[A-Za-z0-9]{32})\s*$/i)
  const record = match ? ds().findOne('apikeys', { hash: await sha256(match[1]) }) : null
  if (!record) reject(401, 'unauthorized', 'Missing or invalid API key.')
  if (!record.lastUsedAt || now() - record.lastUsedAt >= 60000) {
    ds().update('apikeys', { id: record.id }, { $set: { lastUsedAt: now() } }, { ifRevision: record._rev })
  }
  return { id: record.ownerId }
}
function keyDTO(record) {
  return { id: record.id, name: record.name, prefix: record.prefix, createdAt: iso(record.createdAt), lastUsedAt: iso(record.lastUsedAt) }
}
export function me(request) {
  const value = member()
  if (!value) return ok({ authenticated: false, member: null })
  const profile = { memberId: value.id, name: value.name || value.email || 'Member', avatar: value.picture || '/auth/avatar?seed=' + encodeURIComponent(value.id) }
  const found = ds().findOne('profiles', { id: value.id })
  if (found) ds().update('profiles', { id: value.id }, { $set: profile })
  else ds().insert('profiles', Object.assign({ id: value.id }, profile))
  return ok({ authenticated: true, member: { id: value.id, name: profile.name, email: value.email || '', avatar: absolute(request, profile.avatar) } })
}
export async function keys(request, id) {
  const user = cookieOwner()
  if (request.method === 'GET' && !id) {
    return ok({ keys: ds().find('apikeys', { ownerId: user.id }, { orderBy: 'createdAt', order: 'desc' }).map(keyDTO) })
  }
  if (request.method === 'POST' && !id) {
    const name = text(body(request).name, 120, 'Key name') || 'CLI'
    const key = 'pb_' + random(32)
    const record = { id: random(16), ownerId: user.id, name, prefix: key.slice(0, 11), hash: await sha256(key), createdAt: now(), lastUsedAt: null }
    ds().insert('apikeys', record)
    return ok({ key, record: keyDTO(record) }, 201)
  }
  if (request.method === 'DELETE' && id) {
    const record = ds().findOne('apikeys', { id, ownerId: user.id })
    if (!record) reject(404, 'not_found', 'API key not found.')
    ds().delete('apikeys', { id: record.id })
    return ok()
  }
  reject(405, 'method_not_allowed', 'Method not allowed.')
}
