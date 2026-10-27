// Signed out at /: what Kalendar is, a booking card to look at, and a
// field to claim your link, which carries on into sign-in.
import { h, ic, avatar, nope } from '../ui.js'
import { state, topBar, holmFooter } from '../shell.js'
import { mark } from '../icons.js'
import { sound } from '../sound.js'
import * as t from '../time.js'

function claimURL(handle) {
  const next = '/' + (handle ? '?handle=' + encodeURIComponent(handle) : '')
  try {
    const u = new URL(state.me.loginURL, location.origin)
    u.searchParams.set('redirect', next)
    return u.pathname + u.search
  } catch {
    return '/auth/login?redirect=' + encodeURIComponent(next)
  }
}

// A booking card drawn with the real pieces, for looking at only.
function demo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const first = t.weekStart()
  const lead = (new Date(y, m, 1).getDay() - first + 7) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const today = now.getDate()
  const open = []
  for (let d = today + 1; d <= days && open.length < 12; d++) {
    const wd = new Date(y, m, d).getDay()
    if (wd !== 0 && wd !== 6) open.push(d)
  }
  const chosen = open[Math.min(2, open.length - 1)]
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(h('span.cell.blank'))
  for (let d = 1; d <= days; d++) cells.push(h('span.cell' + (open.includes(d) ? '.open' : '') + (d === chosen ? '.on' : '') + (d === today ? '.today' : ''), h('span', String(d))))
  const at = (hh, mm) => new Date(y, m, chosen || 1, hh, mm).getTime()
  const slots = [[9, 0], [9, 30], [10, 0], [10, 30], [13, 30], [14, 0], [15, 30]].map(([hh, mm], i) => {
    const { main, period } = t.clockParts(at(hh, mm), Intl.DateTimeFormat().resolvedOptions().timeZone)
    return h('div.slot' + (i === 3 ? '.on' : ''), h('span.slot-time', h('span.num', main), period ? h('small', period) : null), h('span.slot-next', 'Next'))
  })
  const dayMs = at(12, 0)
  return h('div.demo', { 'aria-hidden': 'true', inert: true },
    h('div.book-card.demo-card', { style: { '--event': '#007aff' } },
      h('aside.book-info',
        h('span.host-line', avatar({ key: 'ac', name: 'Avery Chen', size: 28 }), h('span', 'Avery Chen')),
        h('h1.event-title', 'Intro call'),
        h('ul.meta', h('li', ic('clock', 18, 1.9), h('div', h('span', '30 min'))), h('li', ic('video', 18, 1.9), h('div', h('span', 'Video call'), h('small', 'The link comes with your invite'))))),
      h('section.book-pick',
        h('div.month-head', h('h3.month-title', h('b', t.monthName(y, m)), ' ', h('span', String(y))), h('div.month-nav', h('span.round-btn', ic('chevronLeft', 18, 2.2)), h('span.round-btn', ic('chevronRight', 18, 2.2)))),
        h('div.weekdays', t.weekLetters(first, 'short').map((d) => h('span', d.slice(0, 3)))),
        h('div.grid', cells)),
      h('section.book-times',
        h('div.times-head', h('h2.times-title', h('b', t.weekday(dayMs)), ' ', h('span', t.monthDay(dayMs)))),
        h('div.times', slots))))
}

export function landing() {
  const params = new URLSearchParams(location.search)
  const input = h('input.claim-input', { type: 'text', placeholder: 'yourname', 'aria-label': 'Your link', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '30', value: params.get('handle') || '' })
  const form = h('form.claim', { onsubmit: (e) => {
    e.preventDefault()
    const v = input.value.trim().replace(/^@/, '').toLowerCase()
    if (v && !/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(v)) { nope(form); sound.error(); input.focus(); return }
    location.href = claimURL(v)
  } },
  h('span.claim-prefix', `${location.host}/@`), input,
  h('button.claim-go', { type: 'submit', 'aria-label': 'Claim this link' }, ic('arrowRight', 20, 2.4)))

  const feature = (icon, title, text) => h('div.feature', h('span.feature-icon', ic(icon, 20, 2)), h('b', title), h('p', text))
  const el = h('div.app.public', topBar(),
    h('div.panel',
      h('main.landing',
        h('section.hero',
          h('span.hero-mark', mark(30)),
          h('h1', h('span', 'Let people book you.'), h('span.soft', 'No back-and-forth.')),
          h('p.lead', 'Share one link. People pick a time that suits you both, with no account to make, and you each get a calendar invite.'),
          form,
          h('p.claim-note', 'Free. Sign in, pick your hours, share the link.')),
        demo(),
        h('section.features',
          feature('link', 'One link', 'A page for you, and one for each kind of meeting you offer.'),
          feature('mail', 'Invites that land', 'Emails with Google, Apple and Outlook buttons, and a link to change or cancel.'),
          feature('globe', 'Every time zone', 'Your hours stay yours. Guests see times in theirs, clock changes included.'),
          feature('calendarCheck', 'Never double-booked', 'A taken time disappears for everyone. Buffers and notice keep your day sane.'))),
      holmFooter()))
  return { el, ready: () => { if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true }) } }
}
