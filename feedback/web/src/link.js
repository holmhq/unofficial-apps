// An inbox link's page: opened once from the link, then locked after five
// idle minutes. A bar under the header empties while nobody is there and
// fills again at any touch, key, scroll or pointer move; the clock beside
// the avatar says how long is left. Locking clears the page and leaves it.
import { $, el, api, glyph, link } from './lib.js'
import { show } from './app.js'

const KEY = 'feedback.link'
const IDLE = 5 * 60000
// The server counts each call as someone being there; while they are, the
// page says so at most this often (the server waits that much longer).
const BEAT = 30000
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'focusin']

let deadline = 0
let ends = Infinity
let timer = null
let locked = false
let bar = null
let clock = null

// This tab's link: its project's id while open, 'locked' once locked.
export function remembered() {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}
function remember(value) {
  try { sessionStorage.setItem(KEY, value) } catch {}
}

// From /v/<token>: the token leaves the address bar at once, then the link
// is spent. Link previews don't run scripts, so they never spend it.
export async function openLink(token) {
  history.replaceState(null, '', '/v')
  const opened = await api('POST', '/api/link/open', { token })
  link.project = opened.project
  remember(opened.project)
  history.replaceState(null, '', `/projects/${opened.project}`)
}

// The server forgot this tab's session (it locked while the tab was closed).
export function forget() {
  link.project = null
  remember('locked')
}

export function startLink(state) {
  link.project = state.project
  link.onLocked = lock
  if (timer) return
  ends = Date.now() + state.endsInMs
  deadline = Date.now() + IDLE
  bar = el('span')
  clock = el('time')
  document.body.prepend(el('div', { class: 'link-bar', 'aria-hidden': 'true' }, bar))
  $('#account').before(el('div', { class: 'link-clock', title: 'This inbox locks after five minutes without activity' },
    glyph('lock', 'glyph line'), el('span', {}, el('span', { class: 'link-words' }, 'Locks in '), clock),
    el('button', { type: 'button', onclick: lock }, 'Lock')))
  for (const type of ACTIVITY) addEventListener(type, activity, { capture: true, passive: true })
  // A hidden tab's timers slow down; catch up as soon as it's seen again.
  document.addEventListener('visibilitychange', tick)
  addEventListener('pageshow', tick)
  timer = setInterval(tick, 1000)
  tick()
}

function activity() {
  if (locked || tick()) return
  const at = Date.now()
  deadline = at + IDLE
  if (at - link.sentAt >= BEAT) api('POST', '/api/link/ping').catch(() => {})
  paint(Math.min(deadline, ends) - at)
}

// Locks if time is up, and says so.
function tick() {
  if (locked) return true
  const left = Math.min(deadline, ends) - Date.now()
  if (left <= 0) {
    lock()
    return true
  }
  paint(left)
  return false
}

function paint(left) {
  bar.style.transform = `scaleX(${Math.min(1, left / IDLE)})`
  const seconds = Math.ceil(left / 1000)
  clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  document.body.classList.toggle('link-soon', left <= 60000)
}

// Nothing of the inbox stays: the session ends, the page empties, and the
// page leaves for /v in place, so Back doesn't return to it.
export function lock() {
  if (locked) return
  locked = true
  clearInterval(timer)
  try { navigator.sendBeacon('/api/link/close') } catch {}
  forget()
  $('#main').replaceChildren()
  location.replace('/v')
}

export function lockedPage(message) {
  document.title = 'Inbox locked – feedback'
  show(el('section', { class: 'page-head locked' },
    glyph('lock', 'glyph line'),
    el('h1', {}, 'Inbox locked'),
    el('p', { class: 'lede' }, message || 'It locks after five minutes without activity, or when you lock it. To see it again, open it from your app.')))
}
