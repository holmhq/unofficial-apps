// Signed out at /: what Kalendar is, a booking card to look at, and a
// field to claim your link, which carries on into sign-in.
import { h, ic, avatar, nope, segmented } from '../ui.js'
import { state, topBar, holmFooter } from '../shell.js'
import { mark } from '../icons.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { here, city } from '../zones.js'
import { timeline, intersect } from '../timeline.js'

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

// A booking card drawn with the real pieces, for looking at only: the host's
// free time shaded, a meeting dropped in, and a guest's painted time glowing
// where it meets the host's.
function demo() {
  const zone = here()
  const today = t.wall(Date.now(), zone).key
  const open = [[[540, 720], [810, 1020]], [[600, 720], [840, 990]], [[540, 690], [780, 1020]], [[570, 720]], [[540, 720], [840, 1020]], [[600, 780], [870, 1020]]]
  const tracks = open.map((_, i) => {
    const key = t.nextKey(today, i + 1)
    const noon = Date.parse(key + 'T12:00:00Z')
    return { key, label: i === 0 ? 'Tomorrow' : t.weekday(noon, 'UTC', 'short'), sub: `${t.shortMonth(noon, 'UTC')} ${Number(key.slice(8))}` }
  })
  const painted = { [tracks[3].key]: [[660, 780]] }
  const tl = timeline({
    tracks,
    mode: 'clip',
    ppm: .9,
    corner: h('span.tl-zone', city(zone)),
    layers: (tr) => {
      const shade = open[tracks.indexOf(tr)]
      return { shade, glow: painted[tr.key] ? intersect(painted[tr.key], shade) : [] }
    },
    strips: { kind: 'guest', get: (key) => painted[key] || [], set() {}, editable: false },
    clip: { get: () => ({ key: tracks[1].key, start: 630, end: 660, mode: 'open' }), place: () => null, set() {} }
  })
  requestAnimationFrame(() => tl.scrollToMinute(500))
  const when = t.instant(tracks[1].key, 630, zone)
  return h('div.demo', { 'aria-hidden': 'true', inert: true },
    h('div.book-card.demo-card', { style: { '--event': '#007aff' } },
      h('aside.book-info',
        h('span.host-line', avatar({ key: 'ac', name: 'Avery Chen', size: 28 }), h('span', 'Avery Chen')),
        h('h1.event-title', 'Intro call'),
        h('ul.meta', h('li', ic('clock', 18, 1.9), h('div', h('span', '30 min'))), h('li', ic('video', 18, 1.9), h('div', h('span', 'Video call'), h('small', 'The link comes with your invite')))),
        h('div.legend', h('span', h('i.key.shade'), 'Avery is free'), h('span', h('i.key.mine'), 'Your times'), h('span', h('i.key.glow'), 'Both free'))),
      h('section.book-pick',
        h('div.pick-head', h('div.mode-wrap', segmented([{ value: 'clip', label: 'Pick a time' }, { value: 'strips', label: 'Suggest times' }], 'clip', () => {}, { label: 'How to choose' }))),
        h('div.tl-wrap', tl.el),
        h('div.pick-bar', h('div.bar-text', h('b.num', t.range(when, when + 1800000, zone)), h('span', `${t.weekday(when, zone)}, ${t.monthDay(when, zone)}`)), h('span.btn.primary', 'Next', ic('arrowRight', 17, 2.4))))))
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
          h('p.lead', 'Share one link. People drop a meeting into your free time, or paint when suits them, with no account to make. You both get a calendar invite.'),
          form,
          h('p.claim-note', 'Free. Sign in, pick your hours, share the link.')),
        demo(),
        h('section.features',
          feature('link', 'One link', 'A page for you, and one for each kind of meeting you offer.'),
          feature('mail', 'Invites that land', 'Emails with Google, Apple and Outlook buttons, and a link to change or cancel.'),
          feature('globe', 'Every time zone', 'Your hours stay yours. Guests see times in theirs, clock changes included.'),
          feature('calendarCheck', 'Never double-booked', 'A taken time disappears for everyone. Buffers and notice keep your day sane.'),
          feature('sparkles', 'Times you’d rather', 'Guests can paint when they’re free, even outside your hours. You pick a time that works.'),
          feature('chartColumn', 'Who’s looking', 'Visits, where they came from and who booked, without cookies.'))),
      holmFooter()))
  return { el, ready: () => { if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true }) } }
}
