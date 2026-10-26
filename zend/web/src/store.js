// What the page knows, and how it stays current. Views listen with on() and
// redraw what they show: 'me', 'state', 'threads', 'thread' (a conversation
// changed: { number }), 'templates'.

import * as api from './api.js'

export const store = {
  me: null,        // { member, admin, channel, loginURL, logoutURL }
  state: null,     // { phone, vault, declaration, usage, limits, counts }
  threads: null,   // the conversation list
  templates: null,
  open: new Map(), // conversations loaded in full, by number
  viewing: null    // the number of the conversation on screen
}

const listeners = new Set()
export function on(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function emit(event) {
  for (const fn of [...listeners]) {
    try { fn(event) } catch (error) { console.error(error) }
  }
}

export async function loadMe() {
  try {
    store.me = await api.get('/api/me')
  } catch {
    store.me = { member: null, loginURL: '/auth/login', logoutURL: null }
  }
  emit({ type: 'me' })
  return store.me
}

export async function loadState() {
  store.state = await api.get('/api/state')
  emit({ type: 'state' })
  return store.state
}

export async function loadThreads() {
  store.threads = (await api.get('/api/threads')).threads
  emit({ type: 'threads' })
  if (store.threads.some(waiting)) watch()
  return store.threads
}

export async function loadThread(number, before = null) {
  const data = await api.get(`/api/threads/${encodeURIComponent(number)}${before ? `?before=${encodeURIComponent(before)}` : ''}`)
  const known = store.open.get(data.number)
  if (before && known) {
    const ids = new Set(known.messages.map(m => m.id))
    known.messages = [...data.messages.filter(m => !ids.has(m.id)), ...known.messages]
    known.more = data.more
  } else {
    store.open.set(data.number, data)
  }
  // Opening a conversation reads it.
  const row = store.threads && store.threads.find(t => t.number === data.number)
  if (row && row.unread) { row.unread = 0; emit({ type: 'threads' }) }
  emit({ type: 'thread', number: data.number })
  if (data.messages.some(m => m.dir === 'out' && OPEN.includes(m.state))) watch()
  return store.open.get(data.number)
}

export async function loadTemplates() {
  store.templates = (await api.get('/api/templates')).templates
  emit({ type: 'templates' })
  return store.templates
}

export const unread = () => (store.threads || []).reduce((n, t) => n + (t.unread || 0), 0)

// A text just sent: put it in its conversation and the list at once, before
// the server says anything more.
export function addSent(result, body) {
  for (const m of result.messages) {
    const thread = store.open.get(m.number)
    if (thread) thread.messages.push(m)
    let row = store.threads && store.threads.find(t => t.number === m.number)
    if (!row && store.threads) {
      row = { number: m.number, name: null, unread: 0, count: 0, last: null, optedOut: false }
      store.threads.unshift(row)
    }
    if (row) {
      row.last = { body: m.body, dir: 'out', state: m.state, at: m.at }
      row.count = (row.count || 0) + 1
    }
  }
  if (store.threads) store.threads.sort((a, b) => Date.parse((b.last && b.last.at) || 0) - Date.parse((a.last && a.last.at) || 0))
  if (store.state && result.usage) store.state.usage = result.usage
  emit({ type: 'threads' })
  for (const number of new Set(result.messages.map(m => m.number))) emit({ type: 'thread', number, sent: result.messages.map(m => m.id) })
  watch()
}

/* ---- Keeping up ------------------------------------------------------------ */

const OPEN = ['scheduled', 'queued', 'sent']
const waiting = (t) => t.last && t.last.dir === 'out' && OPEN.includes(t.last.state) && Date.now() - Date.parse(t.last.at) < 2 * 86400000

// The demo phone moves texts along only when asked, and a real phone
// without live receipts has to be asked for news; so while a text is on its
// way, ask every few seconds for a couple of minutes.
let until = 0
let timer = null

export function watch(ms = 120000) {
  until = Math.max(until, Date.now() + ms)
  schedule()
}

const polling = () => {
  const phone = store.state && store.state.phone
  return phone && (phone.kind === 'demo' || !phone.live)
}

function schedule(delay = 1800) {
  if (timer || !polling()) return
  timer = setTimeout(tick, delay)
}

async function tick() {
  timer = null
  if (Date.now() > until) return
  if (!document.hidden) {
    try {
      const { changed } = await api.post('/api/messages/refresh')
      if (changed.length) await changes(changed)
    } catch {}
  }
  schedule(2400)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() < until) schedule(200)
})

// Some conversations changed (receipts, replies): reload them and the list.
let pending = new Set()
let flushing = null
export function changes(numbers) {
  for (const n of numbers) pending.add(n)
  if (!flushing) {
    flushing = (async () => {
      await new Promise(resolve => setTimeout(resolve, 60))
      const list = [...pending]
      pending = new Set()
      flushing = null
      const before = new Map((store.threads || []).map(t => [t.number, t.last && t.last.at]))
      // Only the conversation on screen is reloaded (which also reads it);
      // the others are dropped and load again when opened.
      for (const n of list) if (n !== store.viewing) store.open.delete(n)
      await Promise.all([loadThreads().catch(() => {}), list.includes(store.viewing) ? refreshThread(store.viewing) : null])
      const row = store.viewing && store.threads && store.threads.find(t => t.number === store.viewing)
      if (row && row.unread) { row.unread = 0; emit({ type: 'threads' }) }
      const arrived = (store.threads || []).filter(t => t.last && t.last.dir === 'in' && t.last.at !== before.get(t.number)).map(t => t.number)
      emit({ type: 'changed', numbers: list, arrived })
    })()
  }
  return flushing
}

// Reload a conversation without marking it read unless it's on screen.
async function refreshThread(number) {
  const data = await api.get(`/api/threads/${encodeURIComponent(number)}`).catch(() => null)
  if (!data) return
  const known = store.open.get(number)
  if (known) {
    const fresh = new Map(data.messages.map(m => [m.id, m]))
    const older = known.messages.filter(m => !fresh.has(m.id) && Date.parse(m.at) < Date.parse((data.messages[0] || {}).at || 0))
    known.messages = [...older, ...data.messages]
    known.name = data.name
    known.optedOut = data.optedOut
  } else {
    store.open.set(number, data)
  }
  emit({ type: 'thread', number })
}

/* ---- Live updates ---------------------------------------------------------- */

// The node's /_ws socket: the server announces on the member's own channel
// (a name with a random secret only they are given) whenever a receipt or a
// reply arrives. Reconnects with a growing pause.
let socket = null
let wait = 1000

export function connect(channel) {
  if (!channel || socket) return
  const open = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${scheme}://${location.host}/_ws`)
    socket.addEventListener('open', () => {
      wait = 1000
      socket.send(JSON.stringify({ type: 'subscribe', channel }))
    })
    socket.addEventListener('message', (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!line) continue
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
        if (message.type === 'subscribed' && store.state && store.state.phone) loadThreads().catch(() => {})
        if (message.type === 'message' && message.channel === channel) {
          const data = message.data || {}
          if (data.type === 'update') changes(data.numbers || [])
        }
      }
    })
    socket.addEventListener('close', () => {
      socket = null
      setTimeout(open, wait)
      wait = Math.min(wait * 2, 30000)
    })
  }
  open()
}
