// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"). Every tool but pastes_open
// reaches only the caller's own pastes, through the same handlers as the app's API, so an
// owner's read never burns a one-time paste. pastes_open reads a link someone shared, as
// opening it in pastebin would: it counts a view, and burns a one-time paste only when asked.

import { bind, holm } from './_holm.js'
import { ds, state, getPaste, sweep, member, iso, DEFAULT_ORIGIN } from './lib.js'
import { create, owned, publicRead } from './pastes.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 405: 'APP_INVALID_INPUT', 409: 'APP_CONFLICT', 410: 'APP_GONE', 413: 'APP_TOO_LARGE', 503: 'APP_UNAVAILABLE' }

function fail(status, message) {
  throw Object.assign(new Error(message), { status, public: true })
}

async function op(env, run) {
  bind(env.holm)
  try {
    const user = member()
    if (!user) fail(401, 'Sign in to pastebin first.')
    return await run(user)
  } catch (error) {
    if (error && error.public) {
      const out = new Error(error.message)
      out.code = CODES[error.status] || 'APP_INVALID_INPUT'
      out.status = error.status
      out.public = true
      throw out
    }
    throw error
  }
}

const base = () => holm.app.kv.get('site:origin') || DEFAULT_ORIGIN
// The original-format request the app's handlers take, as if it came from pastebin itself.
const request = (method, path, body) => ({ method, path, origin: base(), query: {}, headers: {}, body, files: {} })
const link = (slug) => base() + '/p/' + slug

// A paste's id, or its link (…/p/<id>, …/raw/<id>).
function slugOf(value) {
  const raw = String(value || '').trim()
  const found = /(?:\/(?:p|raw)\/)?([A-Za-z0-9]{12})\/?(?:[?#].*)?$/.exec(raw)
  if (!found) fail(400, 'Give the paste’s id or its link.')
  return found[1]
}

const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)
const KINDS = { image: 'image', video: 'video', audio: 'audio', pdf: 'pdf', text: 'text' }

function files(doc, slug) {
  const list = doc.files || []
  return list.length ? list.map((f, i) => ({ name: f.name, kind: KINDS[f.kind] || 'file', size: f.size, url: base() + '/api/p/' + slug + '/files/' + i })) : undefined
}

// One of the caller's pastes, without its text.
function brief(doc) {
  const status = state(doc)
  const live = status === 'live'
  const first = live ? String(doc.content || '').split('\n').find((line) => line.trim()) : ''
  return {
    id: doc.slug,
    title: doc.title || undefined,
    first_line: !doc.title && first ? first.trim().slice(0, 100) : undefined,
    language: doc.language || undefined,
    state: status,
    characters: live && doc.content ? doc.content.length : undefined,
    lines: live ? doc.lines || undefined : undefined,
    files: (doc.files || []).length || undefined,
    one_time: doc.burnAfterRead || undefined,
    with_your_name: doc.showAuthor || undefined,
    views: doc.views || undefined,
    created: iso(doc.createdAt),
    expires: doc.expiresAt == null ? 'never' : iso(doc.expiresAt),
    link: live ? link(doc.slug) : undefined
  }
}

// Text in parts, so a long paste fits an answer: pass next_offset as offset to read on.
function part(content, input) {
  const text = String(content || '')
  const offset = count(input.offset, 0, text.length, 0)
  const length = count(input.length, 2000, 60000, 30000)
  const end = Math.min(text.length, offset + length)
  return { text: text.slice(offset, end), characters: text.length, next_offset: end < text.length ? end : undefined }
}

export function pastesList(input, env) {
  return op(env, (user) => {
    const options = { page: true, limit: count(input.limit, 1, 100, 30), orderBy: 'createdAt', order: 'desc' }
    if (input.before) options.cursor = String(input.before)
    const page = ds().find('pastes', { ownerId: user.id }, options)
    let rows = page.rows.map(brief)
    if (input.live_only) rows = rows.filter((p) => p.state === 'live')
    return { pastes: rows, before: page.cursor || undefined }
  })
}

export function pastesRead(input, env) {
  return op(env, (user) => {
    const doc = getPaste(slugOf(input.id), user)
    const status = state(doc)
    if (status !== 'live') return { ...brief(doc), note: 'This paste is ' + status + ', so its text is gone.' }
    return { ...brief(doc), ...part(doc.content, input), attachments: files(doc, doc.slug) }
  })
}

export function pastesCreate(input, env) {
  return op(env, async () => {
    sweep()
    const out = await create(request('POST', '/api/pastes', {
      content: input.text, title: input.title, language: input.language, expires_in: input.expires || 'never',
      burn_after_read: !!input.one_time, show_author: !!input.with_your_name
    }))
    const paste = out.body.paste
    return { id: paste.slug, link: paste.url, raw_link: paste.raw_url || undefined, expires: paste.expiresAt || 'never', one_time: paste.burnAfterRead || undefined }
  })
}

export function pastesUpdate(input, env) {
  return op(env, async (user) => {
    sweep()
    const slug = slugOf(input.id)
    const changes = {}
    if (input.title !== undefined) changes.title = input.title
    if (input.with_your_name !== undefined) changes.show_author = input.with_your_name
    if (input.expires !== undefined) changes.expires_in = input.expires
    if (!Object.keys(changes).length) fail(400, 'Say what to change: title, expires or with_your_name.')
    await owned(request('PATCH', '/api/pastes/' + slug, changes), slug)
    return brief(getPaste(slug, user))
  })
}

export function pastesRevoke(input, env) {
  return op(env, async (user) => {
    sweep()
    const slug = slugOf(input.id)
    await owned(request('POST', '/api/pastes/' + slug + '/revoke', {}), slug, 'revoke')
    return brief(getPaste(slug, user))
  })
}

export function pastesDelete(input, env) {
  return op(env, async () => {
    sweep()
    const slug = slugOf(input.id)
    await owned(request('DELETE', '/api/pastes/' + slug, {}), slug)
    return { deleted: slug }
  })
}

export function pastesOpen(input, env) {
  return op(env, (user) => {
    sweep()
    const slug = slugOf(input.link)
    const doc = getPaste(slug)
    const mine = doc.ownerId === user.id
    if (doc.burnAfterRead && !mine && state(doc) === 'live' && !input.burn) {
      return { id: slug, one_time: true, sealed: true, note: 'This is a one-time paste: opening it shows it once, then deletes it for everyone. Ask the person first, then call again with burn true.' }
    }
    const paste = publicRead(request('POST', '/api/p/' + slug + '/open', {}), slug, true).body.paste
    // A one-time paste's text is gone once it's open, so it all comes back at once.
    const text = doc.burnAfterRead && !mine ? { text: paste.content || '', characters: (paste.content || '').length } : part(paste.content, input)
    return {
      id: slug,
      title: paste.title || undefined,
      language: paste.language || undefined,
      by: paste.author ? paste.author.name : undefined,
      yours: mine || undefined,
      one_time: paste.burnAfterRead || undefined,
      expires: paste.expiresAt || 'never',
      ...text,
      attachments: paste.files.length ? paste.files.map((f) => ({ name: f.name, kind: f.kind, size: f.size, url: f.url })) : undefined
    }
  })
}
