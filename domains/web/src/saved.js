// Names you starred. Kept in this browser; when you're signed in, also on the server, so
// every device you sign in on has the same list. The first time a device signs in, what it
// had is added to the account's list; after that the account's list is the one.
//
// item: { domain, at, status?, price?, checked? }

import * as api from './api.js'

const KEY = 'domains:saved'
let items = read()
let account = null
let timer = null
const listeners = new Set()

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch {}
  for (const fn of listeners) fn(items)
  if (account) {
    clearTimeout(timer)
    timer = setTimeout(push, 500)
  }
}

async function push() {
  try { await api.call('PUT', '/api/saved', { items }) } catch {}
}

export const list = () => items
export const count = () => items.length
export const has = (domain) => items.some((i) => i.domain === domain)
export const get = (domain) => items.find((i) => i.domain === domain) || null
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn) }

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
