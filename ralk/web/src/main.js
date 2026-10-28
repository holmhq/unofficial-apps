// Ralk's page: one shell, a page per address.
//
//   /           signed out: what Ralk is, with sounds to try; signed in: Live
//   /sounds     the sound for each kind, the volume, the library
//   /voice      the voice, say something, usage
//   /connect    connect Claude, Claude Code or ChatGPT
import { fill, reduced } from './ui.js'
import { state, loadMe, loadCatalog, setRenderer } from './shell.js'
import * as theme from './theme.js'
import * as audio from './audio.js'
import * as inbox from './inbox.js'

const root = document.getElementById('root')
let current = null
const TABS = { '/': 'live', '/sounds': 'sounds', '/voice': 'voice', '/connect': 'connect' }

async function view(path) {
  const tab = TABS[path.replace(/\/+$/, '') || '/']
  if (tab && state.me.signed_in) return (await import('./views/app.js')).app(tab)
  if (tab) return (await import('./views/landing.js')).landing(tab)
  return (await import('./views/landing.js')).missing()
}

async function render(dir = 'none') {
  const path = location.pathname
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
addEventListener('popstate', () => render('back'))

// The first tap or key anywhere arms audio, so sounds can play from then on.
const armOnce = () => { audio.arm().then((ok) => { if (ok) inbox.catchUp() }) }
for (const type of ['pointerdown', 'keydown']) addEventListener(type, armOnce, { capture: true, passive: true })

theme.apply()
await Promise.all([loadMe(), loadCatalog().catch(() => {})])
if (state.me.signed_in) inbox.start()
await render()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
