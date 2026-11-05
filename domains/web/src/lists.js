// Lists: names collected under a name of your choosing ("for a friend", "side project"),
// with a note for whoever you share one with. Kept in this browser; when you're signed in,
// also on the account, so every device has them and a list can be shared by link. The first
// time a device signs in, its lists join the account's; after that the account's are the
// ones. Claude can change them too (the MCP tools), so the page takes the account's lists
// again whenever it comes back into view with nothing of its own still to send.
//
// list: { id, name, note, items: [item], shared, slug?, at }
// item: { domain, at, status?, price?, premium?, checked? }

import * as api from './api.js'

const KEY = 'domains:lists'
let lists = read()
let account = null
let timer = null
let pushing = null
let dirty = false
let edits = 0 // so a change made while a send is out keeps the page from taking the account's copy
let seen = 0 // the account lists' `updated` this page last had
const listeners = new Set()
const elsewhere = new Set()

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function keep() {
  try { localStorage.setItem(KEY, JSON.stringify(lists)) } catch {}
  for (const fn of listeners) fn(lists)
}

function write() {
  keep()
  if (account) { dirty = true; edits++; clearTimeout(timer); timer = setTimeout(push, 500) }
}

// Back in view: the account's lists, if they changed somewhere else meanwhile.
let lastLook = 0
async function refresh() {
  if (!account || dirty || Date.now() - lastLook < 2000) return
  lastLook = Date.now()
  let remote
  try { remote = await api.get('/api/lists') } catch { return }
  if (dirty || !remote.updated || remote.updated === seen) return
  seen = remote.updated
  lists = remote.lists || []
  keep()
  for (const fn of elsewhere) fn()
}
addEventListener('focus', refresh)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh() })

// Send the lists; the server answers with share slugs, which come back into ours.
async function push() {
  clearTimeout(timer)
  const at = edits
  const run = (async () => {
    const doc = await api.call('PUT', '/api/lists', { lists })
    seen = doc.updated || seen
    if (edits === at) dirty = false
    const slugs = new Map((doc.lists || []).map((l) => [l.id, l.slug]))
    lists = lists.map((l) => (slugs.has(l.id) ? { ...l, slug: slugs.get(l.id) || undefined } : l))
    keep()
    return doc
  })()
  pushing = run.catch(() => null)
  return run
}

export const all = () => lists
export const get = (id) => lists.find((l) => l.id === id) || null
export const signedIn = () => !!account
export const has = (id, domain) => { const l = get(id); return !!l && l.items.some((i) => i.domain === domain) }
export const containing = (domain) => lists.filter((l) => l.items.some((i) => i.domain === domain))
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Called when the account's copy changed somewhere else and this page took it.
export function onRemote(fn) { elsewhere.add(fn) }

const slugify = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'list'

export function create(name, firstDomain = null, info = {}) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!name) return null
  const id = slugify(name) + '-' + Math.random().toString(36).slice(2, 7)
  const list = { id, name, note: '', items: [], shared: false, at: Date.now() }
  if (firstDomain) list.items.push(item(firstDomain, info))
  lists = [...lists, list]
  write()
  return list
}

function item(domain, { status, price, premium } = {}) {
  return { domain, at: Date.now(), ...(status ? { status } : {}), ...(typeof price === 'number' ? { price } : {}), ...(premium ? { premium: true } : {}), checked: Date.now() }
}

function change(id, fn) {
  let changed = false
  lists = lists.map((l) => { if (l.id !== id) return l; changed = true; return fn(l) })
  if (changed) write()
}

export function add(id, domain, info) {
  if (has(id, domain)) return false
  change(id, (l) => ({ ...l, items: [item(domain, info), ...l.items] }))
  return true
}
export function removeItem(id, domain) { change(id, (l) => ({ ...l, items: l.items.filter((i) => i.domain !== domain) })) }
export function toggle(id, domain, info) { if (has(id, domain)) { removeItem(id, domain); return false } add(id, domain, info); return true }
export function rename(id, name) { name = String(name || '').trim().slice(0, 40); if (name) change(id, (l) => ({ ...l, name })) }
export function setNote(id, note) { change(id, (l) => ({ ...l, note: String(note || '').slice(0, 280) })) }
export function remove(id) { lists = lists.filter((l) => l.id !== id); write() }
export function update(domain, patch) {
  let changed = false
  lists = lists.map((l) => {
    if (!l.items.some((i) => i.domain === domain)) return l
    changed = true
    return { ...l, items: l.items.map((i) => (i.domain === domain ? { ...i, ...patch } : i)) }
  })
  if (changed) write()
}

// Share a list: it needs the account, so the server can open it for someone else.
export async function share(id) {
  if (!account) throw new api.ApiError(401, 'unauthorized', 'Sign in to share a list.')
  change(id, (l) => ({ ...l, shared: true }))
  await push()
  const l = get(id)
  if (!l || !l.slug) throw new api.ApiError(500, 'no_link', 'Couldn’t make a link. Try again.')
  return l.slug
}
export async function unshare(id) {
  change(id, (l) => ({ ...l, shared: false, slug: undefined }))
  if (account) await push()
}
export const linkFor = (l) => (l && l.slug ? `${location.origin}/s/${l.slug}` : '')

// Join the account's lists once signed in.
export async function connect(me) {
  if (!me || !me.signed_in) return
  let remote
  try { remote = await api.get('/api/lists') } catch { return }
  account = me.email || me.name || 'you'
  seen = remote.updated || 0
  const flag = 'domains:lists:joined:' + account
  let joined = false
  try { joined = localStorage.getItem(flag) === '1' } catch {}
  if (joined) lists = remote.lists || []
  else {
    const map = new Map((remote.lists || []).map((l) => [l.id, l]))
    for (const l of lists) if (!map.has(l.id)) map.set(l.id, l)
    lists = [...map.values()].sort((a, b) => (a.at || 0) - (b.at || 0))
    try { localStorage.setItem(flag, '1') } catch {}
    if (lists.length !== (remote.lists || []).length) push().catch(() => {})
  }
  keep()
}

export const settled = () => pushing || Promise.resolve()
