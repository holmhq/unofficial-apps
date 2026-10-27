// Kalendar's page: one shell, a page per address.
//
//   /                 signed out: what Kalendar is; first time: choose your link; then your bookings
//   /events, /hours   your event types and your hours
//   /@handle          someone's page: the kinds of meeting they offer
//   /@handle/slug     pick a day and a time, then book
//   /b/:id?t=         a booking, from its email: add it to a calendar, move or cancel it
import { fill, h, reduced } from './ui.js'
import { state, loadMe, setRenderer } from './shell.js'
import * as theme from './theme.js'

const root = document.getElementById('root')
let current = null

async function view(path) {
  let m
  if ((m = /^\/@([^/]+)\/([^/]+)\/?$/.exec(path))) return (await import('./views/book.js')).book(decodeURIComponent(m[1]), decodeURIComponent(m[2]))
  if ((m = /^\/@([^/]+)\/?$/.exec(path))) return (await import('./views/profile.js')).profile(decodeURIComponent(m[1]))
  if ((m = /^\/b\/([a-z0-9-]+)\/?$/.exec(path))) return (await import('./views/manage.js')).manage(m[1])
  const tab = { '/': 'bookings', '/events': 'events', '/hours': 'hours' }[path]
  if (tab && !state.me.member) return (await import('./views/landing.js')).landing()
  if (tab && !state.me.host) return (await import('./views/onboard.js')).onboard()
  if (tab) return (await import('./views/dash.js')).dash(tab)
  return (await import('./views/missing.js')).missing()
}

async function render(dir = 'none') {
  const path = location.pathname
  // Moving between dashboard tabs keeps the shell and swaps the panel.
  if (current && current.tabs && current.tabs(path)) return
  if (current && current.leave) current.leave()
  const next = await view(path)
  current = next
  const swap = () => fill(root, next.el)
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

// Tell the page when the clock style or the host's profile changes.
addEventListener('kalendar:clock', () => { if (current && current.clock) current.clock() })
addEventListener('kalendar:host', () => { if (current && current.refresh) current.refresh() })

theme.apply()
await loadMe()
await render()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
