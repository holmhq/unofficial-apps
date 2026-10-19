import { readIndex, readScreenshot, REF } from './index.js'
import { ok, fail, reject, body, member, isAdmin, requireMember, requireAdmin, profile } from './lib.js'
import { settings, saveSettings, KINDS, count, stats, ratings, reviewsFor, saveReview, deleteOwnReview, allReviews, moderate, removeReview } from './store.js'

const APP = /^[a-z0-9][a-z0-9-]{0,63}$/

// The repository's apps as this viewer may see them: hidden ones only for
// admins, and each with its approved rating.
function visibleIndex(ref, admin) {
  const result = readIndex(ref)
  const hidden = settings().hidden
  const scores = ratings()
  const apps = result.index.apps
    .filter(app => admin || !hidden.includes(app.path))
    .map(app => ({ ...app, hidden: hidden.includes(app.path), rating: scores[app.path] || null }))
  return { ...result, index: { ...result.index, apps } }
}

function knownApp(path, admin) {
  const listed = APP.test(path || '') && readIndex('main').index.apps.some(app => app.path === path)
  if (!listed || (!admin && settings().hidden.includes(path))) reject(404, 'not_found', 'No such app in this store.')
  return path
}

function route(request, method, parts) {
  const query = request.query || {}
  const admin = isAdmin()

  if (parts[1] === 'me' && parts.length === 2 && method === 'GET') {
    const value = member()
    return ok({ authenticated: !!value, member: value ? { ...profile(value), email: value.email || '' } : null, admin })
  }

  if (parts[1] === 'index' && parts.length === 2 && method === 'GET') {
    const ref = String(query.ref || 'main')
    if (!REF.test(ref)) reject(400, 'invalid_ref', 'A ref is a branch, tag or commit made of letters, digits, ".", "_", "-" and "/".')
    return ok({ ...visibleIndex(ref, admin), settings: { tint: settings().tint } }, 200, 'private, max-age=30')
  }

  if (parts[1] === 'file' && parts.length === 2 && method === 'GET') {
    const ref = String(query.ref || 'main')
    if (!REF.test(ref)) reject(400, 'invalid_ref', 'Unknown ref.')
    const app = String(query.app || '')
    if (!admin && settings().hidden.includes(app)) reject(404, 'not_found', 'No such screenshot in the index.')
    const shot = readScreenshot(ref, app, String(query.path || ''))
    return { status: 200, body: shot.data, headers: { 'Content-Type': shot.type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } }
  }

  if (parts[1] === 'events' && parts.length === 2 && method === 'POST') {
    const input = body(request)
    if (!KINDS.includes(input.kind)) reject(400, 'invalid_kind', 'Kind is view, get or copy.')
    const app = knownApp(input.app, admin)
    // An admin trying their own store shouldn't inflate its numbers.
    if (!admin) count(app, input.kind)
    return ok({}, 202)
  }

  if (parts[1] === 'reviews' && parts.length === 3) {
    const app = knownApp(parts[2], admin)
    if (method === 'GET') return ok(reviewsFor(app, member()))
    if (method === 'PUT') return ok({ mine: saveReview(app, requireMember(), body(request)) })
    if (method === 'DELETE') { deleteOwnReview(app, requireMember()); return ok({ mine: null }) }
  }

  if (parts[1] === 'admin') {
    requireAdmin()
    if (parts.length === 2 && method === 'GET') {
      return ok({ apps: visibleIndex('main', true).index.apps, stats: stats(), reviews: allReviews(), settings: settings() })
    }
    if (parts[2] === 'settings' && parts.length === 3 && method === 'PUT') return ok({ settings: saveSettings(body(request)) })
    if (parts[2] === 'reviews' && parts.length === 4) {
      if (method === 'POST') return ok({ review: moderate(parts[3], body(request).status) })
      if (method === 'DELETE') { removeReview(parts[3]); return ok({}) }
    }
  }

  reject(404, 'not_found', 'Route not found.')
}

export default async function handler(request) {
  const method = String(request.method || 'GET').toUpperCase()
  const parts = String(request.path || '/').replace(/\/+$/, '').split('/').filter(Boolean)
  try {
    if (parts[0] !== 'api') reject(404, 'not_found', 'Route not found.')
    return route(request, method, parts)
  } catch (error) {
    if (error.public) return fail(error.status || 502, error.code || 'unavailable', String(error.message).replace(/\.?$/, '.'))
    if (/^NET_/.test(error.code || '')) return fail(502, 'unavailable', `The repository could not be read (${error.code}).`)
    return fail(500, 'internal_error', 'The request could not be completed.')
  }
}
