import { fail, sweep, FILE_HEADERS } from './lib.js'
import { me, keys } from './keys.js'
import { create, list, owned, publicRead, raw, file } from './pastes.js'

export default async function handler(request) {
  try {
    const method = String(request.method || 'GET').toUpperCase()
    request.method = method
    const parts = String(request.path || '/').replace(/\/+$/, '').split('/').filter(Boolean)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) sweep()
    if (parts[0] === 'raw' && parts.length === 2 && method === 'GET') return raw(request, parts[1])
    if (parts[0] !== 'api') return fail(404, 'not_found', 'Route not found.')
    if (parts[1] === 'me' && parts.length === 2 && method === 'GET') return me(request)
    if (parts[1] === 'keys' && parts.length <= 3) return await keys(request, parts[2])
    if (parts[1] === 'pastes') {
      if (parts.length === 2 && method === 'POST') return await create(request)
      if (parts.length === 2 && method === 'GET') return await list(request)
      if (parts.length === 3 || parts.length === 4 && parts[3] === 'revoke') return await owned(request, parts[2], parts[3])
    }
    if (parts[1] === 'p' && parts[2]) {
      if (parts.length === 3 && method === 'GET') return publicRead(request, parts[2])
      if (parts.length === 4 && parts[3] === 'open' && method === 'POST') return publicRead(request, parts[2], true)
      if (parts.length === 4 && parts[3] === 'raw' && method === 'GET') return raw(request, parts[2])
      if (parts.length === 5 && parts[3] === 'files' && method === 'GET') return file(request, parts[2], parts[4])
    }
    return fail(404, 'not_found', 'Route not found.')
  } catch (error) {
    const status = Number(error.status) || 500
    const response = fail(status, status === 500 ? 'internal_error' : error.code || 'request_failed', error.public ? error.message : 'Request could not be completed.')
    if (/^\/raw\//.test(request.path) || /^\/api\/p\/[^/]+\/(?:raw|files(?:\/|$))/.test(request.path)) Object.assign(response.headers, FILE_HEADERS)
    return response
  }
}
