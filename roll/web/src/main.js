// Roll's page: one shell, a page per address.
//
//   /s/<link>   a shared album, for anyone with the link
//   signed out  what Roll is, and Sign in
//   signed in   the library and everything around it (views/app.js); ?photo=<id> on any
//               of its addresses opens that photo, for links from Claude
//
// Someone who was signed in here last time sees their library at once, drawn from this
// browser's copy, while the server is asked whether anything changed.

import { fill } from './ui.js'
import * as theme from './theme.js'
import { state, loadMe, cachedMe, setRenderer } from './shell.js'
import { lib, load, forget, lookAgain } from './store.js'

const root = document.getElementById('root')
const early = globalThis.__roll || {}
let appView = null

async function render() {
  const share = /^\/s\/([A-Za-z0-9]{6,32})\/?$/.exec(location.pathname)
  if (share) {
    const { sharedPage } = await import('./views/shared.js')
    appView = null
    fill(root, sharedPage(share[1]).el)
    return
  }
  if (!state.me || !state.me.signed_in) {
    const { landing } = await import('./views/landing.js')
    appView = null
    fill(root, landing().el)
    return
  }
  if (!appView) {
    const { createApp } = await import('./views/app.js')
    appView = createApp()
    fill(root, appView.el)
  }
  appView.show()
}

setRenderer(render)
addEventListener('popstate', () => render())
theme.apply()

const shared = /^\/s\//.test(location.pathname)
const kept = cachedMe()
if (kept && kept.signed_in && !shared) {
  state.me = kept
  lib.me = kept
  const loading = load(early.library).catch(() => load())
  await render()
  const me = await loadMe(early.me)
  if (!me.signed_in || me.id !== kept.id) {
    forget()
    location.reload()
  }
  loading.catch(() => {})
} else {
  await loadMe(early.me || undefined)
  if (state.me.signed_in && !shared) load().catch(() => {})
  await render()
}

// Changes made elsewhere (another device, or Claude) show when the page comes back.
addEventListener('focus', lookAgain)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lookAgain() })

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
