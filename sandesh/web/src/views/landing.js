// The page for visitors who aren't signed in.

import { h, ic, reveal } from '../dom.js'
import { store } from '../store.js'
import { postmark } from '../postmark.js'
import { rules } from './phone.js'
import { footer } from '../app.js'

const SAMPLE = 'Reached home safe. Dinner on Sunday? Amma is making biryani 🙂'

export function landing() {
  const typed = h('span')
  const caret = h('span.caret')
  const stamp = h('div.stamp', { style: { '--tilt': '-11deg', opacity: 0 } })
  const envelope = h('div.envelope', { 'aria-hidden': 'true' },
    h('div.ticket', ic('sendHorizontal', 26)),
    h('p.to-line', 'To ', h('b', 'Ravi'), ', +91 98765 43210'),
    h('p.typed', typed, caret),
    stamp)

  const page = h('div.landing',
    h('section.hero',
      h('div',
        h('h1', 'Text from your own phone, wherever you are.'),
        h('p', 'Sandesh sends SMS through the Android phone in your pocket: from this browser, or from your own scripts with an API key. People see your number, replies come back here, and India’s SMS rules are built in.'),
        h('div.inline',
          h('a.btn.primary', { href: store.me ? store.me.loginURL : '/auth/login' }, ic('logIn', 18), 'Sign in to start'),
          h('button.btn.quiet', { type: 'button', onclick: () => reveal(page.querySelector('#how')) }, 'How it works'))),
      envelope),
    h('section.how', { id: 'how' },
      h('div.side-note', h('h2', 'How it works'), h('p', 'Your phone does the sending, so texts go out on your own SIM and plan, and nobody else holds your number.')),
      h('ol.steps',
        h('li', h('h3', 'Install SMS Gateway for Android'), h('p', 'A free, open-source app from sms-gate.app that lets your phone send texts for you.')),
        h('li', h('h3', 'Connect it here'), h('p', 'Paste the username and password it shows. Sandesh keeps them encrypted and never shows them again.')),
        h('li', h('h3', 'Text from anywhere'), h('p', 'Write from this page on any computer or phone, schedule texts, fill templates, and watch each one get stamped as it’s delivered.')))),
    h('section.rules-wrap',
      h('div.side-note', h('h2', 'India’s rules, built in'), h('p', 'A personal SIM is for personal texts. Sandesh keeps you there: it holds back texts that read like offers or OTPs, stops at TRAI’s bulk limits, and honours every STOP.')),
      rules()),
    h('section.dev',
      h('div.side-note', h('h2', 'From your scripts'), h('p', 'Make an API key, hold it to your own number if you like, and let your server text you when something needs you.')),
      h('pre.code', h('span.k', 'curl'), ` ${location.origin}/api/v1/messages \\\n  -H "Authorization: Bearer sd_…" \\\n  -H "Content-Type: application/json" \\\n  -d `, h('span.s', `'{"to": "+919876543210", "body": "web-1 is down"}'`))),
    footer())
  const el = h('div.panel', page)

  // One moment of motion: the text types itself, then the postmark lands.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const chars = [...SAMPLE]
  let i = 0
  let timer = null
  const finish = () => {
    typed.textContent = SAMPLE
    caret.classList.add('done')
    stamp.innerHTML = postmark('delivered', new Date().toISOString(), 'landing')
    stamp.style.opacity = ''
    if (!reduce) stamp.classList.add('thump')
  }
  if (reduce) finish()
  else {
    timer = setInterval(() => {
      typed.textContent = chars.slice(0, ++i).join('')
      if (i >= chars.length) {
        clearInterval(timer)
        timer = setTimeout(finish, 700)
      }
    }, 45)
  }

  return { el, destroy: () => { clearInterval(timer); clearTimeout(timer) } }
}
