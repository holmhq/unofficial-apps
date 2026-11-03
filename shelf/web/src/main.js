// Shelf's page: one shell, a page per address.
//
//   /q/<link>   a highlight someone shared, for anyone with the link
//   /add?url=   saving a link from the bookmark button or a phone's share sheet
//   signed out  what Shelf is, and Sign in
//   signed in   the reading list and everything around it (views/app.js)
//
// Someone who was signed in here last time sees their shelf at once, drawn from this
// browser's copy, while the server is asked whether anything changed.

import { fill } from './ui.js'
import * as theme from './theme.js'
import { state, loadMe, cachedMe, setRenderer } from './shell.js'
import { lib, load, forget, listen } from './store.js'

const root = document.getElementById('root')
const early = globalThis.__shelf || {}
let appView = null

async function render() {
  const shared = /^\/q\/([A-Za-z0-9]{8,32})\/?$/.exec(location.pathname)
  if (shared) {
    const { quotePage } = await import('./views/quote.js')
    appView = null
    fill(root, quotePage(shared[1]).el)
    return
  }
  if (location.pathname === '/add') {
    const { addPage } = await import('./views/add.js')
    appView = null
    fill(root, addPage().el)
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

const kept = cachedMe()
if (kept && kept.signed_in) {
  state.me = kept
  lib.me = kept
  const loading = load(early.library).catch(() => load().catch(() => {}))
  await render()
  const me = await loadMe(early.me)
  if (!me.signed_in || me.id !== kept.id) {
    forget()
    location.reload()
  } else listen(me.channel)
  loading.catch(() => {})
} else {
  await loadMe(early.me || undefined)
  if (state.me.signed_in) { load().catch(() => {}); listen(state.me.channel) }
  await render()
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname.endsWith('localhost'))) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
