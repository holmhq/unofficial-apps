// The JSON routes the page calls.
//
//   GET  /api/me      { signed_in, name, email, picture, admin, login_url, logout_url }
//   GET  /api/saved   { items, updated }                     signed in
//   PUT  /api/saved   { items } -> { items, updated }        signed in, replaces the list
//   GET  /api/lists   { lists, updated }                     signed in
//   PUT  /api/lists   { lists } -> { lists, updated }        signed in, replaces them; a list
//                     with shared: true gets a slug, and one that stops sharing loses it
//   GET  /api/share/<slug>  { name, note, items, updated }   anyone with the link
//   POST /api/ideas   { text, max, like?, avoid? } -> { ideas: [{ label, kind, why }], read, cached, note? }
//   POST /api/rdap    { names } -> { results: [{ name, status, registrar?, since?, reason? }] }
//
// Ideas and lookups call out (the AI provider, registries), which Holm allows from routes
// like these and not from named operations.

const MAX_SAVED = 300
const MAX_LISTS = 50
const MAX_LIST_ITEMS = 200
const DOMAIN = /^(?=.{3,80}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]+)+$/

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (error) {
      if (!error.public) console.error('request failed', String(error.stack || error.message || error).slice(0, 600))
      return json({ error: { code: error.public ? error.code : 'internal_error', message: error.public ? error.message : 'Something went wrong. Try again.' } }, error.public ? error.status : 500)
    }
  },
}

async function route(request, env) {
  const url = new URL(request.url)
  const auth = env.holm.auth
  let member = null
  try { member = auth.isLoggedIn() ? auth.getMember() : null } catch { member = null }
  if (member && !member.id) member = null
  const at = request.method + ' ' + url.pathname

  if (at === 'GET /api/me') {
    let admin = false
    try { admin = !!(member && auth.isAppAdmin()) } catch {}
    const back = url.searchParams.get('return') || '/'
    const after = /^\/(?!\/)[\w\-./?=&#%]*$/.test(back) && !back.startsWith('/auth') ? back : '/'
    return json({
      signed_in: !!member,
      name: member ? member.name || '' : null,
      email: member ? member.email || '' : null,
      picture: member ? member.picture || '' : null,
      admin,
      login_url: auth.getLoginURL(after),
      logout_url: auth.getLogoutURL(),
    })
  }

  if (at === 'POST /api/ideas') {
    const body = await readJSON(request)
    if (typeof body.text !== 'string' || !body.text.trim()) reject(400, 'invalid_input', 'Send the text to find ideas for.')
    const { ideas } = await import('./ideas.js')
    const words = (v) => (Array.isArray(v) ? v.map(String).filter((x) => /^[a-z0-9-]{2,30}$/.test(x)).slice(0, 40) : [])
    return json(ideas({ text: body.text.slice(0, 60), max: Number(body.max) || 8, like: words(body.like), avoid: words(body.avoid) }, env))
  }

  if (at === 'POST /api/rdap') {
    const body = await readJSON(request)
    if (!Array.isArray(body.names) || !body.names.length) reject(400, 'invalid_input', 'Send the names to look up.')
    if (body.names.length > 20) reject(400, 'invalid_input', 'At most 20 names at a time.')
    const { rdap } = await import('./rdap.js')
    return json(rdap({ names: body.names.map(String) }, env))
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/share/')) {
    const shared = readShare(env, url.pathname.slice('/api/share/'.length))
    if (!shared) reject(404, 'not_found', 'This link doesn’t open a list any more.')
    const { list } = shared
    return json({ name: list.name, note: list.note || '', items: list.items, updated: list.updated || 0 })
  }

  if (url.pathname === '/api/lists') {
    if (!member) reject(401, 'unauthorized', 'Sign in to keep lists and share them.')
    const kv = env.holm.app.kv
    const key = 'lists:' + member.id
    if (request.method === 'GET') return json(readLists(kv.get(key)))
    if (request.method === 'PUT') {
      const body = await readJSON(request)
      const before = readLists(kv.get(key))
      const lists = cleanLists(body.lists)
      const had = new Map(before.lists.filter((l) => l.slug).map((l) => [l.id, l.slug]))
      for (const l of lists) {
        const old = had.get(l.id)
        if (l.shared) {
          l.slug = old || newSlug(kv)
          kv.set('share:' + l.slug, JSON.stringify({ member: member.id, id: l.id }))
        } else delete l.slug
        had.delete(l.id)
        if (!l.shared && old) kv.delete('share:' + old)
      }
      for (const slug of had.values()) kv.delete('share:' + slug)
      const doc = { lists, updated: Date.now() }
      kv.set(key, JSON.stringify(doc))
      return json(doc)
    }
  }

  if (url.pathname === '/api/saved') {
    if (!member) reject(401, 'unauthorized', 'Sign in to keep names on every device.')
    const kv = env.holm.app.kv
    const key = 'saved:' + member.id
    if (request.method === 'GET') return json(read(kv.get(key)))
    if (request.method === 'PUT') {
      const body = await readJSON(request)
      const items = clean(body.items)
      const doc = { items, updated: Date.now() }
      kv.set(key, JSON.stringify(doc))
      return json(doc)
    }
  }

  reject(404, 'not_found', 'No such route.')
}

function read(raw) {
  try { const doc = JSON.parse(raw); if (doc && Array.isArray(doc.items)) return doc } catch {}
  return { items: [], updated: 0 }
}

// A saved name: the domain, when it was saved, and what we last knew about it.
function clean(items) {
  if (!Array.isArray(items)) reject(400, 'invalid_input', 'Send a list of names.')
  const seen = new Set()
  const out = []
  for (const item of items) {
    const domain = String(item && item.domain || '').toLowerCase()
    if (!DOMAIN.test(domain) || seen.has(domain)) continue
    seen.add(domain)
    const row = { domain, at: Number(item.at) || Date.now() }
    if (['free', 'taken', 'premium', 'maybe', 'unknown'].includes(item.status)) row.status = item.status
    if (typeof item.price === 'number' && isFinite(item.price) && item.price >= 0 && item.price < 1e7) row.price = Math.round(item.price * 100) / 100
    if (typeof item.checked === 'number') row.checked = item.checked
    if (item.premium === true) row.premium = true
    if (typeof item.note === 'string') row.note = item.note.slice(0, 60)
    out.push(row)
    if (out.length >= MAX_SAVED) break
  }
  return out
}

function readLists(raw) {
  try { const doc = JSON.parse(raw); if (doc && Array.isArray(doc.lists)) return doc } catch {}
  return { lists: [], updated: 0 }
}

// A list: an id from the page, a name, a note for whoever it's shared with, its names and
// whether it's shared. Names keep what was last known about them, like saved names.
function cleanLists(lists) {
  if (!Array.isArray(lists)) reject(400, 'invalid_input', 'Send a list of lists.')
  const seen = new Set()
  const out = []
  for (const l of lists.slice(0, MAX_LISTS)) {
    const id = String(l && l.id || '')
    if (!/^[a-z0-9-]{1,48}$/.test(id) || seen.has(id)) continue
    seen.add(id)
    const name = String(l.name || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!name) continue
    out.push({
      id, name,
      note: typeof l.note === 'string' ? l.note.slice(0, 280) : '',
      shared: l.shared === true,
      at: Number(l.at) || Date.now(),
      updated: Date.now(),
      items: clean(Array.isArray(l.items) ? l.items : []).slice(0, MAX_LIST_ITEMS),
    })
  }
  return out
}

// Share links: eight letters and digits, unguessable enough for a list of names.
function newSlug(kv) {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let tries = 0; tries < 5; tries++) {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const slug = [...bytes].map((b) => abc[b % abc.length]).join('')
    if (!kv.get('share:' + slug)) return slug
  }
  reject(500, 'internal_error', 'Couldn’t make a link. Try again.')
}

// The list behind a share link, or null.
export function readShare(env, slug) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(slug || '')) return null
  const kv = env.holm.app.kv
  let ptr = null
  try { ptr = JSON.parse(kv.get('share:' + slug)) } catch {}
  if (!ptr || !ptr.member) return null
  const list = readLists(kv.get('lists:' + ptr.member)).lists.find((l) => l.id === ptr.id && l.shared && l.slug === slug)
  return list ? { list } : null
}

function reject(status, code, message) {
  throw Object.assign(new Error(message), { status, code, public: true })
}

async function readJSON(request) {
  const raw = await request.text()
  if (raw.length > 120000) reject(413, 'too_large', 'That list is too long.')
  try { const v = JSON.parse(raw); if (v && typeof v === 'object' && !Array.isArray(v)) return v } catch {}
  reject(400, 'invalid_json', 'Send a JSON object.')
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
