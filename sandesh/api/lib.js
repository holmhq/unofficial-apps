// Small helpers shared by Sandesh's server modules.

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
})

// Errors use one shape everywhere: { error: { code, message, details? } }.
export const failure = (error) => json({
  error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
}, error.status)

export const DAY = 86400000
export const now = () => Date.now()
export const iso = (ms) => (ms ? new Date(ms).toISOString() : null)

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

// A random id or token of `length` characters from an unambiguous alphabet.
export function random(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 31]
  return out
}

export async function sha256(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function readJSON(request) {
  try {
    const body = await request.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch {}
  throw new HttpError(400, 'invalid_json', 'Send a JSON object.')
}

export const text = (value, max) => String(value ?? '').trim().slice(0, max)

// The signed-in member, or a 401.
export function requireMember(env) {
  const member = env.holm.auth.getMember()
  if (!member) throw new HttpError(401, 'sign_in', 'Sign in first.')
  return member
}

export function displayName(member) {
  return member.name || (member.email ? member.email.split('@')[0] : 'You')
}
