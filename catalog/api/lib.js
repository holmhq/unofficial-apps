import { holm } from "./_holm.js";
// Responses, request checks and who is asking.
export function json(status, body, cache = 'no-store') {
  return { status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } }
}
export const ok = (body = {}, status = 200, cache) => json(status, { ok: true, ...body }, cache)
export const fail = (status, code, message) => json(status, { ok: false, error: { code, message } })
export function reject(status, code, message) {
  throw Object.assign(new Error(message), { status, code, public: true })
}

export const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''

export function body(request) {
  const value = request.body
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_body', 'Send a JSON object.')
  return value
}

// A signed-in person; anonymous guests don't count.
export function member() {
  const value = holm.auth.getMember()
  return value && value.id && !holm.auth.isAnonymous() ? value : null
}

// The store's admins are the node's owner and admins, and this app's.
export function isAdmin() {
  if (!member()) return false
  return holm.auth.isNodeOwner() || holm.auth.isNodeAdmin() || holm.auth.isAppOwner() || holm.auth.isAppAdmin()
}

export function requireMember() {
  const value = member()
  if (!value) reject(401, 'unauthorized', 'Sign in first.')
  return value
}

export function requireAdmin() {
  if (!isAdmin()) reject(403, 'forbidden', 'Only the node’s owner and admins can do this.')
  return member()
}

export function profile(value) {
  return {
    id: value.id,
    name: text(value.name, 80) || text((value.email || '').split('@')[0], 80) || 'Member',
    avatar: value.picture || '/auth/avatar?seed=' + encodeURIComponent(value.id)
  }
}
