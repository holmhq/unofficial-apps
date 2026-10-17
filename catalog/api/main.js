import { readIndex, REF } from './index.js'

function json(status, body, cache = 'no-store') {
  return { status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } }
}
const fail = (status, code, message) => json(status, { ok: false, error: { code, message } })

export default async function handler(request) {
  const method = String(request.method || 'GET').toUpperCase()
  const path = String(request.path || '/').replace(/\/+$/, '')
  if (path !== '/api/index') return fail(404, 'not_found', 'Route not found.')
  if (method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.')
  const ref = String((request.query && request.query.ref) || 'main')
  if (!REF.test(ref)) return fail(400, 'invalid_ref', 'A ref is a branch, tag or commit made of letters, digits, ".", "_", "-" and "/".')
  try {
    return json(200, { ok: true, ...readIndex(ref) }, 'public, max-age=60')
  } catch (error) {
    const reason = error.public ? error.message : 'index.json could not be read' + (error.code ? ` (${error.code})` : '')
    return fail(502, 'index_unavailable', reason + '.')
  }
}
