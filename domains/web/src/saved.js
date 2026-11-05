// Names you starred. Kept in this browser; when you're signed in, also on the server, so
// every device you sign in on has the same list. The first time a device signs in, what it
// had is added to the account's list; after that the account's list is the one. Claude can
// change it too (the MCP tools), so the page takes the account's list again whenever it
// comes back into view with nothing of its own still to send.
//
// item: { domain, at, status?, price?, checked? }

import * as api from './api.js'

const KEY = 'domains:saved'
let items = read()
let account = null
let timer = null
let dirty = false
let edits = 0 // so a change made while a send is out keeps the page from taking the account's copy
let seen = 0 // the account list's `updated` this page last had
const listeners = new Set()
const elsewhere = new Set()

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch {}
  for (const fn of listeners) fn(items)
  if (account) {
    dirty = true
    edits++
    clearTimeout(timer)
    timer = setTimeout(push, 500)
  }
}

async function push() {
  const at = edits
  try { const doc = await api.call('PUT', '/api/saved', { items }); seen = doc.updated || seen; if (edits === at) dirty = false } catch {}
}

// Back in view: the account's list, if it changed somewhere else meanwhile.
let lastLook = 0
async function refresh() {
  if (!account || dirty || Date.now() - lastLook < 2000) return
  lastLook = Date.now()
  let remote
  try { remote = await api.get('/api/saved') } catch { return }
  if (dirty || !remote.updated || remote.updated === seen) return
  seen = remote.updated
  items = remote.items || []
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch {}
  for (const fn of listeners) fn(items)
  for (const fn of elsewhere) fn()
}
addEventListener('focus', refresh)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh() })

export const list = () => items
export const count = () => items.length
export const has = (domain) => items.some((i) => i.domain === domain)
export const get = (domain) => items.find((i) => i.domain === domain) || null
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Called when the account's copy changed somewhere else and this page took it.
export function onRemote(fn) { elsewhere.add(fn) }

export function add(domain, { status, price, premium } = {}) {
  if (has(domain)) return
  items = [{ domain, at: Date.now(), ...(status ? { status } : {}), ...(typeof price === 'number' ? { price } : {}), ...(premium ? { premium: true } : {}), checked: Date.now() }, ...items]
  write()
}

export function remove(domain) {
  items = items.filter((i) => i.domain !== domain)
  write()
}

export function update(domain, patch) {
  let changed = false
  items = items.map((i) => {
    if (i.domain !== domain) return i
    changed = true
    return { ...i, ...patch }
  })
  if (changed) write()
}

export function toggle(domain, info) {
  if (has(domain)) { remove(domain); return false }
  add(domain, info)
  return true
}

// Join the account's list once signed in.
export async function connect(me) {
  if (!me || !me.signed_in) return
  let remote
  try { remote = await api.get('/api/saved') } catch { return }
  account = me.email || me.name || 'you'
  seen = remote.updated || 0
  const flag = 'domains:saved:joined:' + account
  let joined = false
  try { joined = localStorage.getItem(flag) === '1' } catch {}
  if (joined) items = remote.items || []
  else {
    const map = new Map((remote.items || []).map((i) => [i.domain, i]))
    for (const i of items) if (!map.has(i.domain)) map.set(i.domain, i)
    items = [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0))
    try { localStorage.setItem(flag, '1') } catch {}
    if (items.length !== (remote.items || []).length) push()
  }
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch {}
  for (const fn of listeners) fn(items)
}
