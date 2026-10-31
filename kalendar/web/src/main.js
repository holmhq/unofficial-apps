// Kalendar's page: one shell, a page per address.
//
//   /                 signed out: what Kalendar is; first time: choose your link; then your bookings
//   /events, /hours   your event types and your hours
//   /insights         who opens your page, where from, and who books
//   /profile          what your page says about you, your link, email and feed
//   /@handle          someone's page: the kinds of meeting they offer
//   /@handle/slug     pick a day and a time, then book
//   /b/:id?t=         a booking, from its email: add it to a calendar, move or cancel it
//
// It opens like an app on a phone: the service worker keeps every file of
// this version, the page draws from what this browser saw last (store.js),
// and the server's answers fill in behind it without the page blinking.
import { fill, reduced } from './ui.js'
import { state, loadMe, setRenderer } from './shell.js'
import * as theme from './theme.js'

const root = document.getElementById('root')
let current = null

const PAGES = {
  book: () => import('./views/book.js'),
  profile: () => import('./views/profile.js'),
  manage: () => import('./views/manage.js'),
  landing: () => import('./views/landing.js'),
  onboard: () => import('./views/onboard.js'),
  dash: () => import('./views/dash.js'),
  missing: () => import('./views/missing.js')
}

const TABS = { '/': 'bookings', '/events': 'events', '/hours': 'hours', '/insights': 'insights', '/profile': 'profile' }
const isPublic = (path) => !(path in TABS)

async function view(path) {
  let m
  if ((m = /^\/@([^/]+)\/([^/]+)\/?$/.exec(path))) return (await PAGES.book()).book(decodeURIComponent(m[1]), decodeURIComponent(m[2]))
  if ((m = /^\/@([^/]+)\/?$/.exec(path))) return (await PAGES.profile()).profile(decodeURIComponent(m[1]))
  if ((m = /^\/b\/([a-z0-9-]+)\/?$/.exec(path))) return (await PAGES.manage()).manage(m[1])
  const tab = TABS[path]
  if (tab && !state.me.member) return (await PAGES.landing()).landing()
  if (tab && !state.me.host) return (await PAGES.onboard()).onboard()
  if (tab) return (await PAGES.dash()).dash(tab)
  return (await PAGES.missing()).missing()
}

async function render(dir = 'none') {
  const path = location.pathname
  // Moving between dashboard tabs keeps the shell and swaps the panel.
  if (current && current.tabs && current.tabs(path)) return
  if (current && current.leave) current.leave()
  const next = await view(path)
  current = next
  // A page wears its host's colour: the host's own tabs theirs, a host's
  // page and its booking pages that host's; every other page red.
  const swap = () => { theme.setAccent(next.accent, { scope: theme.scopeOf(path) }); fill(root, next.el) }
  if (dir !== 'none' && document.startViewTransition && !reduced()) {
    document.documentElement.dataset.vt = dir
    const t = document.startViewTransition(swap)
    t.finished.finally(() => { delete document.documentElement.dataset.vt })
    await t.updateCallbackDone
  } else swap()
  if (next.ready) next.ready()
}

setRenderer(render)

addEventListener('popstate', (event) => {
  if (current && current.pop && current.pop(event.state)) return
  render('back')
})

// Tell the page when the clock style changes.
addEventListener('kalendar:clock', () => { if (current && current.clock) current.clock() })

theme.apply()

// A public page never waits for sign-in; a host's page draws from the last
// answer when there is one. Either way the server's answer follows, and the
// page changes only if who's signed in did.
const path = location.pathname
const asking = loadMe()
if (!state.me && !isPublic(path)) await asking
if (!state.me) state.me = { member: null, host: null, loginURL: '/auth/login', logoutURL: null }
await render()
asking.then((changed) => {
  if (changed && !isPublic(location.pathname)) render()
  else if (current && current.me) current.me()
})

// Load every page's code while the browser is idle, so moving around never
// waits on the network, and a new version can't mix with this one.
const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 1200))
idle(() => { for (const load of Object.values(PAGES)) load().catch(() => {}) })

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname.endsWith('localhost'))) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
