// Nobody here: a page that doesn't exist, or a link nobody has taken yet.
import { h, ic } from '../ui.js'
import { state, topBar, go, signIn, holmFooter } from '../shell.js'

function shell(...kids) {
  return { el: h('div.app.public', topBar(), h('div.panel', h('main.empty-page', ...kids), holmFooter())) }
}

export function missing() {
  return shell(
    h('div.empty-icon', ic('calendarX', 30, 1.8)),
    h('h1', 'Nothing here'),
    h('p', 'Check the address. The page may have moved.'),
    h('button.btn.primary', { type: 'button', onclick: () => go('/') }, 'Go to Kalendar'))
}

export function missingHost(handle, error) {
  if (error && error.status && error.status !== 404) {
    return shell(h('div.empty-icon', ic('circleAlert', 30, 1.8)), h('h1', 'Can’t load this page'), h('p', error.message), h('button.btn.primary', { type: 'button', onclick: () => location.reload() }, 'Try again'))
  }
  const taken = error && /offer/.test(error.message || '')
  const me = state.me || {}
  return shell(
    h('div.empty-icon', ic(taken ? 'calendarOff' : 'user', 30, 1.8)),
    h('h1', taken ? 'Not offered any more' : `No one at @${handle} yet`),
    h('p', taken ? error.message : 'This link is free. It could be yours.'),
    taken
      ? h('button.btn.primary', { type: 'button', onclick: () => go(`/@${handle}`) }, 'See what else is open')
      : me.host ? h('button.btn.primary', { type: 'button', onclick: () => go('/') }, 'Back to your bookings') : h('button.btn.primary', { type: 'button', onclick: () => (me.member ? go('/') : signIn()) }, `Claim @${handle}`))
}
