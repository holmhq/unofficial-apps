import { readIndex, readScreenshot, REF } from './index.js'

function json(status, body, cache = 'no-store') {
  return { status, body, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } }
}
const fail = (status, code, message) => json(status, { ok: false, error: { code, message } })

export default async function handler(request) {
  const method = String(request.method || 'GET').toUpperCase()
  const path = String(request.path || '/').replace(/\/+$/, '')
  const query = request.query || {}
  if (path !== '/api/index' && path !== '/api/file') return fail(404, 'not_found', 'Route not found.')
  if (method !== 'GET') return fail(405, 'method_not_allowed', 'Use GET.')
  const ref = String(query.ref || 'main')
  if (!REF.test(ref)) return fail(400, 'invalid_ref', 'A ref is a branch, tag or commit made of letters, digits, ".", "_", "-" and "/".')
  try {
    if (path === '/api/index') return json(200, { ok: true, ...readIndex(ref) }, 'public, max-age=60')
    const shot = readScreenshot(ref, String(query.app || ''), String(query.path || ''))
    return {
      status: 200,
      body: shot.data,
      headers: { 'Content-Type': shot.type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }
    }
  } catch (error) {
    const status = error.status === 404 ? 404 : 502
    const reason = error.public ? error.message : 'The repository could not be read' + (error.code ? ` (${error.code})` : '')
    return fail(status, status === 404 ? 'not_found' : 'unavailable', reason.replace(/\.?$/, '.'))
  }
}
