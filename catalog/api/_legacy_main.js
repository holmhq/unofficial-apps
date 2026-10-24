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

// What a page needs to draw at once: the index as this viewer may see it, the
// store's tint and who is looking. main.js embeds it in every page, so the
// first paint waits on no API call.
export function boot(ref) {
  const admin = isAdmin()
  const value = member()
  const result = visibleIndex(ref, admin)
  return {
    index: result.index,
    settings: { tint: settings().tint },
    viewer: { authenticated: !!value, member: value ? { ...profile(value), email: value.email || '' } : null, admin }
  }
}

const hex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
const matches = async (image, hash) => hash && hex(await crypto.subtle.digest('SHA-256', image.data)).slice(0, 12) === hash

// A screenshot or cover at main under a URL with an extension, which
// Cloudflare keeps at the edge. With ?v= set to the index's hash, and bytes
// that really have that hash, the copy can be cached for a year. A cached
// blob with that hash is that image for good, so it needs no trip to GitHub;
// one that doesn't match is fetched again rather than pinned.
async function media(app, file, v) {
  const path = 'listing/' + file
  let image = readScreenshot('main', app, path, 'cached')
  if (!(image && v && v === image.hash && await matches(image, v))) {
    image = readScreenshot('main', app, path)
    if (v && v === image.hash && !(await matches(image, v))) image = readScreenshot('main', app, path, 'reload')
  }
  const forever = v && v === image.hash && await matches(image, v)
  return {
    status: 200,
    body: image.data,
    headers: {
      'Content-Type': image.type,
      'Cache-Control': forever ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    }
  }
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

  if (parts[1] === 'media' && parts.length === 4 && method === 'GET') {
    const app = parts[2]
    if (!APP.test(app) || !/^[A-Za-z0-9._-]{1,80}\.(png|webp)$/.test(parts[3])) reject(404, 'not_found', 'No such image in the index.')
    if (!admin && settings().hidden.includes(app)) reject(404, 'not_found', 'No such image in the index.')
    return media(app, parts[3], String(query.v || ''))
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
    return await route(request, method, parts)
  } catch (error) {
    if (error.public) return fail(error.status || 502, error.code || 'unavailable', String(error.message).replace(/\.?$/, '.'))
    // Holm's outbound errors carry their code at the start of the message.
    const code = error.code || (/^NET_[A-Z_]+/.exec(String(error.message)) || [''])[0]
    // A page asks for many images at once and the node caps an app's open
    // outbound requests: ask the browser to come back shortly.
    if (code === 'NET_LIMIT') {
      const busy = fail(503, 'busy', 'Busy reading the repository; try again in a moment.')
      busy.headers['Retry-After'] = '1'
      return busy
    }
    if (/^NET_/.test(code)) return fail(502, 'unavailable', `The repository could not be read (${code}).`)
    return fail(500, 'internal_error', 'The request could not be completed.')
  }
}
