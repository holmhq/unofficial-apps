// What the page knows, and how it stays current. Views listen for events
// ('state', 'threads', 'changed') and redraw what they show.

import * as api from './api.js'

export const store = {
  me: null,       // { member, admin, channel, loginURL, logoutURL }
  state: null,    // { phone, usage, limits, counts, vault, declaration }
  threads: null,  // conversation list
  templates: null
}

const listeners = new Set()
export function on(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function emit(event) {
  for (const fn of [...listeners]) fn(event)
}

export async function loadState() {
  store.state = await api.get('/api/state')
  emit({ type: 'state' })
  return store.state
}

export async function loadThreads() {
  store.threads = (await api.get('/api/threads')).threads
  emit({ type: 'threads' })
  if (store.threads.some(isOpen)) watch()
  return store.threads
}

export async function loadTemplates() {
  store.templates = (await api.get('/api/templates')).templates
  emit({ type: 'templates' })
  return store.templates
}

const OPEN = ['scheduled', 'queued', 'sent']
const isOpen = (t) => t.last && t.last.dir === 'out' && OPEN.includes(t.last.state) && Date.now() - Date.parse(t.last.at) < 2 * 86400000

// Catching up. The demo phone moves its texts along only when asked, and a
// real phone without live receipts is asked for news; so while something
// is on its way, ask every few seconds for a couple of minutes.
let until = 0
let timer = null

export function watch(ms = 120000) {
  until = Math.max(until, Date.now() + ms)
  schedule()
}

function polling() {
  const phone = store.state && store.state.phone
  return phone && (phone.kind === 'demo' || !phone.live)
}

function schedule() {
  if (timer || !polling()) return
  timer = setTimeout(tick, 2500)
}

async function tick() {
  timer = null
  if (Date.now() > until) return
  if (!document.hidden) {
    try {
      const { changed } = await api.post('/api/messages/refresh')
      if (changed.length) emit({ type: 'changed', numbers: changed })
    } catch {}
  }
  schedule()
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() < until) schedule()
})
