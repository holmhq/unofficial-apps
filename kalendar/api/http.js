// Kalendar's HTTP side: the JSON API the page uses, calendar files, and the
// page itself, with a host's name in the title and social card of /@handle.
//
//   GET    /api/me                         who's signed in, their host profile, sign-in/out URLs
//   GET    /api/handle?h=                  is this link free?
//   POST   /api/host                       become a host { handle, name, tz, tzLabel, tzTable, weekly }
//   PATCH  /api/host                       change profile, hours, days, zone, notify, rotateFeed
//   GET    /api/events                     my event types
//   POST   /api/events                     add one
//   PATCH  /api/events/:id                 change one
//   DELETE /api/events/:id                 remove one
//   GET    /api/bookings?view=             upcoming | past | cancelled
//   POST   /api/bookings/:id/cancel        cancel as the host { reason }
//   GET    /api/u/:handle                  a host's public page
//   GET    /api/u/:handle/:slug            one event type, for booking
//   GET    /api/u/:handle/:slug/slots      open times { from, to, skip?, t? }
//   GET    /api/b/:id?t=                   a booking, from the link in its email
//   GET    /b/:id/calendar?t=              that booking as a calendar file (?h= the host's copy)
//   GET    /feed/:secret.ics               the host's private calendar feed
//
// Booking and cancelling with an emailed link are named operations
// (contract.json: bookings.create, bookings.cancel) behind Holm's challenge
// and rate limits; see ops.js.
import { json, errorResponse, readJSON, reject, requireMember, member, rememberOrigin, esc, displayName } from './lib.js'
import { hostOf, hostByHandle, handleFree, createHost, updateHost, privateHost, publicHost } from './hosts.js'
import { eventsOf, eventDTO, createEvent, updateEvent, deleteEvent } from './events.js'
import { openSlots, bookingPage, bookingForInvitee, inviteIcs, hostIcs, listForHost, cancelByHost, counts, feedFor } from './bookings.js'
import { icsResponse } from './ics.js'

const match = (path, re) => {
  const m = re.exec(path)
  return m ? m.slice(1).map(decodeURIComponent) : null
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      rememberOrigin(env, url)
      if (path.startsWith('/api/')) return await api(request, env, url)
      if (request.method === 'GET' || request.method === 'HEAD') {
        let m = match(path, /^\/b\/([a-z0-9-]{6,40})\/calendar$/)
        if (m) {
          const body = url.searchParams.has('h')
            ? await hostIcs(env, m[0], url.searchParams.get('h'), url.origin, url.host)
            : await inviteIcs(env, m[0], url.searchParams.get('t'), url.origin, url.host)
          return icsResponse(body, 'kalendar.ics')
        }
        // Emails sent before 0.1.1 link here.
        m = match(path, /^\/b\/([a-z0-9-]{6,40})\/invite\.ics$/)
        if (m) return icsResponse(await inviteIcs(env, m[0], url.searchParams.get('t'), url.origin, url.host), 'kalendar.ics')
        m = match(path, /^\/feed\/([a-z0-9]{32})\.ics$/)
        if (m) {
          const body = feedFor(env, m[0], url.origin, url.host, Date.now())
          return body ? icsResponse(body, 'kalendar.ics') : new Response('Not found', { status: 404 })
        }
        m = match(path, /^\/@([A-Za-z0-9._-]{1,30})(?:\/([a-z0-9-]{1,40}))?\/?$/)
        if (m) return await hostPage(request, env, m[0], m[1])
      }
      return env.holm.web.fetch(request)
    } catch (error) {
      if (path.startsWith('/api/')) return errorResponse(env, error)
      if (error && error.public) return new Response(error.message, { status: error.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      env.holm.log.error(`${request.method} ${path}: ${error && (error.stack || error.message) || error}`)
      return new Response('Something went wrong. Try again in a moment.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
  }
}

async function api(request, env, url) {
  const { auth } = env.holm
  const path = url.pathname
  const method = request.method
  const route = `${method} ${path}`
  const now = Date.now()
  const base = url.origin

  if (route === 'GET /api/me') {
    const m = member(env)
    const next = url.searchParams.get('next') || '/'
    const host = m ? hostOf(env, m.id) : null
    return json({
      member: m ? { id: m.id, name: displayName(m), email: m.email || null, picture: m.picture || null } : null,
      host: host ? privateHost(env, host, base) : null,
      counts: host ? counts(env, host, now) : null,
      admin: m ? auth.isAppAdmin() : false,
      loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
      logoutURL: auth.getLogoutURL()
    })
  }

  // Public pages.
  let p = match(path, /^\/api\/u\/([^/]+)$/)
  if (p && method === 'GET') {
    const host = hostByHandle(env, p[0])
    if (!host) reject(404, 'not_found', 'There’s no one at that link yet.')
    const events = eventsOf(env, host.id).filter((e) => e.active !== false).map((e) => eventDTO(e, { hostName: host.name }))
    return json({ host: publicHost(host), events })
  }
  p = match(path, /^\/api\/u\/([^/]+)\/([^/]+)$/)
  if (p && method === 'GET') return json(bookingPage(env, p[0], p[1]))
  p = match(path, /^\/api\/u\/([^/]+)\/([^/]+)\/slots$/)
  if (p && method === 'GET') {
    let skip = null
    const id = url.searchParams.get('skip')
    if (id) {
      const b = await bookingForInvitee(env, id, url.searchParams.get('t'), base)
      if (b.status === 'confirmed') skip = b.id
    }
    return json(openSlots(env, p[0], p[1], url.searchParams.get('from'), url.searchParams.get('to'), now, skip), 200, { 'Cache-Control': 'no-store' })
  }
  p = match(path, /^\/api\/b\/([a-z0-9-]{6,40})$/)
  if (p && method === 'GET') return json(await bookingForInvitee(env, p[0], url.searchParams.get('t'), base))

  // A host's own pages.
  const m = requireMember(env)
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readJSON(request) : {}
  if (route === 'GET /api/handle') return json(handleFree(env, url.searchParams.get('h'), m.id))
  if (route === 'POST /api/host') {
    const host = createHost(env, m, body, now)
    return json({ host: privateHost(env, host, base) }, 201)
  }

  const host = hostOf(env, m.id)
  if (!host) reject(409, 'no_host', 'Choose your link first.')
  if (route === 'PATCH /api/host') return json({ host: privateHost(env, updateHost(env, m, host, body, now), base) })

  if (route === 'GET /api/events') return json({ events: eventsOf(env, host.id).map((e) => eventDTO(e, { mine: true })) })
  if (route === 'POST /api/events') return json({ event: eventDTO(createEvent(env, host, body), { mine: true }) }, 201)
  p = match(path, /^\/api\/events\/([^/]+)$/)
  if (p && method === 'PATCH') return json({ event: eventDTO(updateEvent(env, host, p[0], body), { mine: true }) })
  if (p && method === 'DELETE') {
    deleteEvent(env, host, p[0])
    return json({ ok: true })
  }

  if (route === 'GET /api/bookings') {
    const view = ['past', 'cancelled'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'upcoming'
    return json({ view, bookings: listForHost(env, host, view, now) })
  }
  p = match(path, /^\/api\/bookings\/([^/]+)\/cancel$/)
  if (p && method === 'POST') return json(await cancelByHost(env, host, p[0], body, now, base))

  reject(404, 'not_found', 'No such route.')
}

// The page for /@handle and /@handle/slug, with the host's name and the
// event in its title and social card.
async function hostPage(request, env, handle, slug) {
  const response = await env.holm.web.fetch(request)
  const type = response.headers.get('content-type') || ''
  if (!type.includes('text/html')) return response
  const host = hostByHandle(env, handle)
  if (!host) return response
  const event = slug ? eventsOf(env, host.id).find((e) => e.slug === slug && e.active !== false) : null
  const title = event ? `${event.title} with ${host.name}` : `Book time with ${host.name}`
  const description = (event && event.description) || host.bio || `Pick a time that works for you${event ? ` · ${event.duration} min` : ''}. No sign-up needed.`
  let html = await response.text()
  const t = esc(title)
  const d = esc(description.replace(/\s+/g, ' ').slice(0, 200))
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${t} · Kalendar</title>`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):title" content=")[^"]*(")/g, `$1${t}$2`)
    .replace(/(<meta (?:property|name)="(?:og|twitter):image:alt" content=")[^"]*(")/g, `$1${t}$2`)
    .replace(/(<meta (?:property|name)="(?:og:|twitter:)?description" content=")[^"]*(")/g, `$1${d}$2`)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('Cache-Control', 'no-cache')
  return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers })
}
