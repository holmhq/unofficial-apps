// The tools Claude uses through Holm's MCP endpoint (/_holm/mcp), described in contract.json.
// They're open to anyone signed in on the node (auth "user"), and each one only ever sees the
// caller's own saved names and lists, through the same functions as the app's routes.
//
// Named operations can't call out of the app, so no tool can ask a registry whether a name
// is free. names.suggest makes names the way the search page does and says what Domains last
// knew about each; its link opens the search, which checks them live.

import { DOMAIN, MAX_LISTS_EACH, reject, getSaved, putSaved, getLists, putLists } from './http.js'
import { KIND, parse, labels, expand, split } from './gen.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT' }
const MAX_SAVED = 300
const MAX_LIST_ITEMS = 200
// The search page's "Short picks", its first choice of extensions.
const SHORT = ['com', 'io', 'co', 'ai', 'so', 'sh', 'me', 'to', 'app', 'dev', 'xyz', 'net']

function op(env, run) {
  try {
    const member = env.holm.auth.getMember()
    if (!member || !member.id) reject(401, 'unauthorized', 'Sign in to Domains first.')
    return run(member)
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

let catalogCache = null
function catalog(env) {
  if (!catalogCache) {
    const doc = JSON.parse(env.holm.private.read('tlds.json'))
    catalogCache = { updated: doc.updated, currency: doc.currency || 'USD', rows: doc.tlds, byName: new Map(doc.tlds.map((r) => [r.t, r])) }
  }
  return catalogCache
}

const count = (value, min, max, fallback) => (Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback)
const iso = (ms) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined)
const origin = (env) => env.holm.app.kv.get('site:origin') || ''
const link = (env, path) => (origin(env) ? origin(env) + path : undefined)

// "https://www.Zack.io/" -> "zack.io", checked against the extensions Domains knows.
function domainOf(env, raw) {
  const domain = String(raw || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
  if (!DOMAIN.test(domain)) return { domain, reason: 'not a domain name' }
  const cat = catalog(env)
  const { label, tld } = split(domain, (t) => cat.byName.has(t))
  if (!label || !cat.byName.has(tld)) return { domain, reason: 'an extension Domains doesn’t know' }
  return { domain, tld }
}

// What Domains last knew about a name: a registry answer from the last ten minutes, or the
// status it had when the person saved it. Never a fresh check.
function lastKnown(env, mine, domain) {
  let kept = null
  try { kept = JSON.parse(env.holm.app.kv.get('rdap:' + domain) || 'null') } catch {}
  if (kept && kept.status && kept.status !== 'unknown') return { status: kept.status, checked: 'in the last 10 minutes' }
  const item = mine.get(domain)
  if (item && item.status) return { status: item.status, checked: iso(item.checked) }
  return { status: 'unchecked' }
}

function priced(env, domain, item) {
  const cat = catalog(env)
  const row = cat.byName.get(split(domain, (t) => cat.byName.has(t)).tld)
  if (item && item.premium && typeof item.price === 'number') return { first_year: item.price, premium: true }
  return row ? { first_year: row.p, renewal: row.r } : {}
}

function nameBrief(env, item, when = 'saved') {
  const out = { domain: item.domain, [when]: iso(item.at), status: item.status || 'unchecked' }
  if (item.status) out.checked = iso(item.checked)
  Object.assign(out, priced(env, item.domain, item))
  if (item.note) out.note = item.note
  return out
}

function listBrief(env, l, withNames) {
  const out = {
    id: l.id,
    name: l.name,
    note: l.note || undefined,
    names: withNames ? l.items.map((i) => nameBrief(env, i, 'added')) : l.items.length,
    shared: l.shared && l.slug ? link(env, '/s/' + l.slug) || '/s/' + l.slug : undefined,
    updated: iso(l.updated),
    open: link(env, '/lists/' + l.id),
  }
  return out
}

// A list by its id, or by its name when only one list has it.
function findList(doc, value) {
  const want = String(value || '').trim()
  if (!want) reject(400, 'invalid_input', 'Say which list: its id or its name from lists_list.')
  const byId = doc.lists.find((l) => l.id === want)
  if (byId) return byId
  const named = doc.lists.filter((l) => l.name.toLowerCase() === want.toLowerCase())
  if (named.length > 1) reject(409, 'ambiguous', `More than one list is called “${want}”. Use its id from lists_list.`)
  if (!named.length) reject(404, 'not_found', 'No list by that name. Use lists_list to find it.')
  return named[0]
}

// Names to add: valid, known extensions, not already there. Returns what was added and why
// the rest weren't.
function adding(env, items, raw, note) {
  const have = new Set(items.map((i) => i.domain))
  const added = []
  const skipped = []
  for (const value of (raw || []).slice(0, 50)) {
    const d = domainOf(env, value)
    if (d.reason) { skipped.push({ domain: d.domain || String(value), reason: d.reason }); continue }
    if (have.has(d.domain)) { skipped.push({ domain: d.domain, reason: 'already there' }); continue }
    have.add(d.domain)
    added.push({ domain: d.domain, at: Date.now(), ...(note ? { note: String(note).slice(0, 60) } : {}) })
  }
  return { added, skipped }
}

function removing(env, items, raw) {
  const drop = new Set((raw || []).map((v) => domainOf(env, v).domain))
  const removed = items.filter((i) => drop.has(i.domain)).map((i) => i.domain)
  const missing = [...drop].filter((d) => d && !removed.includes(d))
  return { keep: items.filter((i) => !drop.has(i.domain)), removed, missing }
}

/* ---- Names ---- */

export function namesSuggest(input, env) {
  return op(env, (member) => {
    const cat = catalog(env)
    const isTld = (t) => cat.byName.has(t)
    const text = String(input.name || '').slice(0, 60)
    const parsed = parse(text, isTld)
    if (!parsed.words.length) reject(400, 'invalid_input', 'Give a name or a few words to make names from.')
    const asked = (input.extensions || []).map((t) => String(t).toLowerCase().replace(/^\.+/, ''))
    const tlds = asked.length ? asked.filter(isTld) : SHORT.filter(isTld)
    if (!tlds.length) reject(400, 'invalid_input', 'None of those are extensions Domains knows, such as com, io or co.uk.')
    const max = count(input.max_length, 2, 16, 8)
    const list = labels(parsed, { max, kinds: { affix: input.affixes === true }, limit: 30 })
    const hackTlds = input.domain_hacks === false ? [] : cat.rows.filter((r) => !r.t.includes('.') && r.t.length <= 4).map((r) => r.t)
    // What was typed comes first, in each extension; then the rest, shortest first.
    const all = expand(list, tlds, { hackTlds, typed: parsed.typedTld })
    const cells = [...all.filter((c) => c.kind === 'exact'), ...all.filter((c) => c.kind !== 'exact')]
    const limit = count(input.limit, 1, 100, 40)
    const mine = new Map(getSaved(env, member).items.map((i) => [i.domain, i]))
    return {
      names: cells.slice(0, limit).map((c) => ({
        domain: c.domain,
        why: c.why,
        kind: KIND[c.kind] ? KIND[c.kind].name : c.kind,
        ...lastKnown(env, mine, c.domain),
        ...priced(env, c.domain, null),
      })),
      more: cells.length > limit ? cells.length - limit : undefined,
      extensions: tlds,
      unknown_extensions: asked.length && asked.length !== tlds.length ? asked.filter((t) => !isTld(t)) : undefined,
      prices: `${cat.currency} list prices for one year at Namecheap, as of ${cat.updated}; checkout has the final price, and a premium name costs more.`,
      check_live: link(env, '/?q=' + encodeURIComponent(text)),
    }
  })
}

/* ---- Saved names ---- */

export function savedList(input, env) {
  return op(env, (member) => {
    const doc = getSaved(env, member)
    const limit = count(input.limit, 1, MAX_SAVED, 100)
    return { names: doc.items.slice(0, limit).map((i) => nameBrief(env, i)), total: doc.items.length, open: link(env, '/saved') }
  })
}

export function savedUpdate(input, env) {
  return op(env, (member) => {
    if (!(input.add || []).length && !(input.remove || []).length) reject(400, 'invalid_input', 'Give names to add or to remove.')
    const doc = getSaved(env, member)
    const { keep, removed, missing } = removing(env, doc.items, input.remove)
    const { added, skipped } = adding(env, keep, input.add, input.note)
    if (keep.length + added.length > MAX_SAVED) reject(409, 'too_many', `Saved holds up to ${MAX_SAVED} names. Remove some first.`)
    if (added.length || removed.length) putSaved(env, member, [...added, ...keep])
    return {
      added: added.map((i) => i.domain),
      removed,
      not_saved: missing.length ? missing : undefined,
      skipped: skipped.length ? skipped : undefined,
      total: keep.length + added.length,
    }
  })
}

/* ---- Lists ---- */

export function listsList(input, env) {
  return op(env, (member) => {
    const doc = getLists(env, member)
    return { lists: doc.lists.map((l) => listBrief(env, l, false)) }
  })
}

export function listsGet(input, env) {
  return op(env, (member) => listBrief(env, findList(getLists(env, member), input.list), true))
}

const slugify = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'list'

export function listsCreate(input, env) {
  return op(env, (member) => {
    const name = String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!name) reject(400, 'invalid_input', 'Give the list a name.')
    const doc = getLists(env, member)
    if (doc.lists.length >= MAX_LISTS_EACH) reject(409, 'too_many', `You can keep up to ${MAX_LISTS_EACH} lists. Delete one first.`)
    const bytes = crypto.getRandomValues(new Uint8Array(4))
    const id = slugify(name) + '-' + [...bytes].map((b) => (b % 36).toString(36)).join('') + (Date.now() % 36).toString(36)
    const { added, skipped } = adding(env, [], input.names)
    const list = { id, name, note: String(input.note || '').slice(0, 280), items: added, shared: input.share === true, at: Date.now() }
    const saved = putLists(env, member, [...doc.lists, list]).lists.find((l) => l.id === id)
    return { ...listBrief(env, saved, true), skipped: skipped.length ? skipped : undefined }
  })
}

export function listsUpdate(input, env) {
  return op(env, (member) => {
    const doc = getLists(env, member)
    const list = findList(doc, input.list)
    const next = { ...list, items: list.items }
    if (typeof input.name === 'string') {
      const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 40)
      if (!name) reject(400, 'invalid_input', 'A list needs a name.')
      next.name = name
    }
    if (typeof input.note === 'string') next.note = input.note.slice(0, 280)
    const { keep, removed, missing } = removing(env, next.items, input.remove)
    const { added, skipped } = adding(env, keep, input.add)
    if (keep.length + added.length > MAX_LIST_ITEMS) reject(409, 'too_many', `A list holds up to ${MAX_LIST_ITEMS} names.`)
    next.items = [...added, ...keep]
    if (typeof input.share === 'boolean') next.shared = input.share
    const saved = putLists(env, member, doc.lists.map((l) => (l.id === list.id ? next : l))).lists.find((l) => l.id === list.id)
    return {
      ...listBrief(env, saved, true),
      added: added.length ? added.map((i) => i.domain) : undefined,
      removed: removed.length ? removed : undefined,
      not_in_list: missing.length ? missing : undefined,
      skipped: skipped.length ? skipped : undefined,
    }
  })
}

export function listsDelete(input, env) {
  return op(env, (member) => {
    const doc = getLists(env, member)
    const list = findList(doc, input.list)
    putLists(env, member, doc.lists.filter((l) => l.id !== list.id))
    return { deleted: list.name, names: list.items.length, link_stopped: list.shared ? true : undefined }
  })
}
