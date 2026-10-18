// Responses, request checks and who is asking.
export function json(status, body, headers = {}) {
  return { status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }
}
export const ok = (body = {}, status = 200) => json(status, { ok: true, ...body })
export const fail = (status, code, message) => json(status, { ok: false, error: { code, message } })
export function reject(status, code, message) {
  throw Object.assign(new Error(message), { status, code, public: true })
}

export const ds = () => holm.app.ds
export const kv = () => holm.app.kv
export const now = () => Date.now()
export const iso = value => value == null ? null : new Date(value).toISOString()

// Text from a request: control characters become spaces (newlines survive
// where asked), trimmed and capped.
export function text(value, max, lines = false) {
  if (value == null) return ''
  if (typeof value !== 'string') reject(400, 'invalid_field', 'Expected text.')
  const cleaned = value.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim()
  return cleaned.slice(0, max)
}

export function body(request) {
  const value = request.body
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_body', 'Send a JSON object.')
  return value
}

export function random(length) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (out.length < length && byte < 256 - (256 % alphabet.length)) out += alphabet[byte % alphabet.length]
    }
  }
  return out
}

// A signed-in person; anonymous guests don't count.
export function member() {
  const value = holm.auth.getMember()
  return value && value.id && !holm.auth.isAnonymous() ? value : null
}

export function requireMember() {
  const value = member()
  if (!value) reject(401, 'unauthorized', 'Sign in first.')
  return value
}

export function profile(value) {
  return {
    id: value.id,
    name: text(value.name, 80) || text((value.email || '').split('@')[0], 80) || 'Member',
    avatar: value.picture || '/auth/avatar?seed=' + encodeURIComponent(value.id)
  }
}
