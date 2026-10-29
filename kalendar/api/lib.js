// Small helpers shared by every module: errors, responses, text checks, ids.

export const MIN = 60000
export const HOUR = 3600000
export const DAY = 86400000

export function reject(status, code, message, details) {
  throw Object.assign(new Error(message), { status, code, public: true, details })
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  })
}

export function errorResponse(env, error) {
  if (!error || !error.public) env.holm.log.error('request failed: ' + String(error && (error.stack || error.message) || error).slice(0, 800))
  const status = error && error.public ? error.status : 500
  const body = { error: { code: error && error.public ? error.code : 'server_error', message: error && error.public ? error.message : 'Something went wrong on our side. Try again.' } }
  if (error && error.public && error.details) body.error.details = error.details
  return json(body, status)
}

export async function readJSON(request, max = 200000) {
  let raw
  try { raw = await request.text() } catch { reject(400, 'invalid_json', 'Send valid JSON.') }
  if (raw.length > max) reject(413, 'too_large', 'That request is too large.')
  let value
  try { value = raw.trim() ? JSON.parse(raw) : {} } catch { reject(400, 'invalid_json', 'Send valid JSON.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_json', 'Send a JSON object.')
  return value
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

// Trimmed single-line text, or '' when optional and empty.
export function text(value, max, label, required = false) {
  if (value === undefined || value === null) value = ''
  if (typeof value !== 'string') reject(400, 'invalid_input', `${label} must be text.`)
  const out = value.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  if (required && !out) reject(400, 'invalid_input', `${label} is required.`)
  if (out.length > max) reject(400, 'invalid_input', `${label} can be ${max} characters at most.`)
  return out
}

// Multi-line text keeps its line breaks.
export function longText(value, max, label) {
  if (value === undefined || value === null) value = ''
  if (typeof value !== 'string') reject(400, 'invalid_input', `${label} must be text.`)
  const out = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/\n{3,}/g, '\n\n').trim()
  if (out.length > max) reject(400, 'invalid_input', `${label} can be ${max} characters at most.`)
  return out
}

export function int(value, label, min, max) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) reject(400, 'invalid_input', `${label} must be a whole number from ${min} to ${max}.`)
  return n
}

export const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/

export function email(value, label = 'Email') {
  const out = text(value, 200, label, true).toLowerCase()
  if (!EMAIL.test(out)) reject(400, 'invalid_email', 'That email address doesn’t look right.')
  return out
}

// A tag names where a visit came from, as in /@handle?ref=sundown-2026:
// lowercase letters and digits, with dots, dashes or underscores inside,
// up to 40 characters.
export const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/

export function cleanTag(value) {
  if (typeof value !== 'string') return null
  const tag = value.trim().toLowerCase()
  return TAG.test(tag) ? tag : null
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'
export function randomId(length = 12) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)))
  let out = ''
  for (const byte of new Uint8Array(digest)) out += byte.toString(16).padStart(2, '0')
  return out
}

// A keyed hash (HMAC-SHA-256), as 32 hex characters.
export async function hmac(key, value) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(value)))
  let out = ''
  for (const byte of new Uint8Array(sig).slice(0, 16)) out += byte.toString(16).padStart(2, '0')
  return out
}

export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch])

// The address people reach this app at, remembered from the last real request.
export function origin(env) {
  return env.holm.app.kv.get('site:origin') || ''
}

export function rememberOrigin(env, url) {
  if (/^(127\.|localhost)/.test(url.host)) return
  if (env.holm.app.kv.get('site:origin') !== url.origin) env.holm.app.kv.set('site:origin', url.origin)
}

export function member(env) {
  return env.holm.auth.isLoggedIn() ? env.holm.auth.getMember() : null
}

export function requireMember(env) {
  const m = member(env)
  if (!m) reject(401, 'sign_in', 'Sign in first.')
  return m
}

export const displayName = (m) => (m && (m.name || (m.email ? m.email.split('@')[0] : ''))) || 'Someone'
