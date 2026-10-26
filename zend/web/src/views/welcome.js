// The signed-out page: what Zend is, a conversation playing on a phone, and
// sign-in. The account button is the same round avatar as when signed in.

import { h, fill, ic, avatar, clock, collapsing } from '../ui.js'
import { mark, ticks } from '../icons.js'
import { store } from '../store.js'
import { footNote } from '../main.js'
import * as api from '../api.js'

export function welcome() {
  const screen = h('div.msgs')
  const signIn = async (next = '/') => {
    let url = store.me && store.me.loginURL
    if (next !== '/') {
      try { url = (await api.get('/api/me?next=' + encodeURIComponent(next))).loginURL } catch {}
    }
    location.href = url || '/auth/login'
  }
  const bar = h('header.bar',
      h('span.brand', h('span.mark', mark(19)), 'Zend'),
      h('span.right', h('button.avatar-btn', { type: 'button', 'aria-label': 'Sign in', onclick: () => signIn() }, h('span.avatar.ghost', ic('user', 18, 2)))))
  const panel = h('div.panel',
      h('section.hero',
        h('div',
          h('h1', 'Text from your own phone. ', h('em', 'Anywhere.')),
          h('p.lede', 'Zend sends SMS through the Android phone in your pocket, from any browser or your own scripts. People see your number, and their replies come back here.'),
          h('div.acts',
            h('button.btn.primary.large', { type: 'button', onclick: () => signIn() }, 'Get started'),
            h('button.btn.large', { type: 'button', onclick: () => signIn('/phone?demo') }, 'Try a demo phone')),
          h('p.fine', 'Free. Texts go out on your own SIM and plan.')),
        h('div.device', { 'aria-hidden': 'true' },
          h('div.screen',
            h('div.screen-head', avatar({ key: 'mom', name: 'Mom' }), h('b', 'Mom')),
            screen))),
      h('section.features',
        feature('green', 'phone', 'Your number, your plan', 'Texts leave from your own SIM through the free SMS Gateway app. Nothing new to pay for, no new number to share.'),
        feature('blue', 'check', 'Delivered, not just sent', 'One tick when your phone sends a text, two when it arrives. Replies show up the moment they come in.'),
        feature('indigo', 'code', 'Texts from your scripts', 'Give a script its own key, held to a few numbers, and get a text when your server needs you.'),
        feature('orange', 'shield', 'Personal, by the rules', 'Zend checks texts that read like offers or codes, stays under bulk limits and honours every STOP.')),
      h('section.how',
        h('div', h('h2', 'Three steps to your first text'), h('p.lede', { style: { padding: 0 } }, 'Or start with a demo phone and connect yours later.')),
        h('div.group', h('ol.steps',
          h('li', h('b', 'Sign in'), h('p', 'With the sign-in this Holm server offers.')),
          h('li', h('b', 'Connect your phone'), h('p', 'Install SMS Gateway for Android, turn on Cloud server and paste the username and password it shows.')),
          h('li', h('b', 'Write'), h('p', 'From any browser, or from a script with an API key.'))))),
      footNote())
  collapsing(bar, panel)
  const el = h('div.welcome', bar, panel)
  play(screen)
  return { el }
}

function feature(color, icon, title, text) {
  return h('div.feature', h('span.sq.' + color, ic(icon, 19, 2.1)), h('b', title), h('p', text))
}

// A short conversation that plays, rests, and starts again.
function play(screen) {
  const script = [
    ['out', 'Landed! Getting a cab now.'],
    ['in', 'Safe travels. Call me when you’re home?'],
    ['out', 'Will do. Is the spare key under the plant?'],
    ['in', 'Yes, left side.']
  ]
  let timers = []
  const later = (fn, ms) => timers.push(setTimeout(() => { if (screen.isConnected) fn() }, ms))
  function bubble(dir, text, joined, animate) {
    const meta = h('span.meta', h('span', clock(Date.now())), dir === 'out' ? ticks(animate ? 'queued' : 'delivered') : null)
    const spacer = h('span.spacer', { 'aria-hidden': 'true' }, h('span', clock(Date.now())), dir === 'out' ? ticks('sent') : null)
    return h('div.msg.last.' + dir + (animate ? '.enter-' + dir : '') + (joined ? '' : '.first'), h('div.bubble', h('span.text', text), spacer, meta))
  }
  function run(first) {
    timers.forEach(clearTimeout)
    timers = []
    fill(screen)
    // Open on the first exchange, so the phone is never empty.
    if (first) screen.append(bubble(...script[0], false, false), bubble(...script[1], false, false))
    let t = 300
    script.forEach(([dir, text], i) => {
      if (first && i < 2) return
      later(() => {
        const prev = screen.lastElementChild
        const joined = prev && prev.classList.contains(dir)
        if (joined) prev.classList.remove('last')
        const msg = bubble(dir, text, joined, true)
        screen.append(msg)
        if (dir === 'out') {
          const tk = msg.querySelector('.meta .ticks')
          later(() => { const s = ticks('sent'); s.classList.add('drawing'); tk.replaceWith(s); requestAnimationFrame(() => requestAnimationFrame(() => s.classList.remove('drawing'))) ; later(() => s.classList.add('delivered'), 900) }, 700)
        }
      }, t)
      t += dir === 'out' ? 2300 : 1700
    })
    later(() => run(false), t + 4000)
  }
  run(true)
}
