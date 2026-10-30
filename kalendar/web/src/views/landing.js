// Signed out at /: what Kalendar is, a booking card to look at, and a
// field to claim your link, which carries on into sign-in.
import { h, ic, fill, avatar, nope, segmented, reduced } from '../ui.js'
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
// where it meets the host's. Where motion is welcome it plays out: a pointer
// drops the meeting in, drags it to another day and books it, then paints
// times to ask for. It rests while it's out of sight.
//
// The card itself is flat, as on a booking page. The depth is a real 3D
// scene around it: a rig in perspective that carries the card's edge and its
// shadow behind it, and the pointer and the result hovering in front. The
// rig stands up as the card scrolls to the middle of the screen and turns a
// little toward the mouse, so the layers part as it moves.
function demo() {
  const zone = here()
  const today = t.wall(Date.now(), zone).key
  const open = [[[540, 720], [810, 1020]], [[600, 720], [840, 990]], [[540, 690], [780, 1020]], [[570, 720]], [[540, 720], [840, 1020]], [[600, 780], [870, 1020]]]
  const tracks = open.map((_, i) => {
    const key = t.nextKey(today, i + 1)
    const noon = Date.parse(key + 'T12:00:00Z')
    return { key, label: i === 0 ? 'Tomorrow' : t.weekday(noon, 'UTC', 'short'), sub: `${t.shortMonth(noon, 'UTC')} ${Number(key.slice(8))}` }
  })
  const shadeOf = (key) => open[tracks.findIndex((x) => x.key === key)] || []
  const still = reduced()
  const painted = still ? { [tracks[3].key]: [[660, 780]] } : {}
  let clip = still ? { key: tracks[1].key, start: 630, end: 660, mode: 'open' } : null
  const tl = timeline({
    tracks,
    mode: 'clip',
    ppm: .9,
    corner: h('span.tl-zone', city(zone)),
    layers: (tr) => {
      const shade = shadeOf(tr.key)
      return { shade, glow: painted[tr.key] ? intersect(painted[tr.key], shade) : [] }
    },
    strips: { kind: 'guest', get: (key) => painted[key] || [], set() {}, editable: false },
    clip: { get: () => clip, place: () => null, set() {} }
  })
  requestAnimationFrame(() => tl.scrollToMinute(500))

  const barTime = h('b.num')
  const barDay = h('span')
  const go = h('span.btn.primary', 'Next', ic('arrowRight', 17, 2.4))
  const bar = h('div.pick-bar.still', h('div.bar-text', barTime, barDay), go)
  function paintBar() {
    if (clip) {
      const when = t.instant(clip.key, clip.start, zone)
      barTime.textContent = t.range(when, when + 1800000, zone)
      barDay.textContent = `${t.weekday(when, zone)}, ${t.monthDay(when, zone)}`
      fill(go, 'Next', ic('arrowRight', 17, 2.4))
    } else {
      const key = Object.keys(painted)[0]
      const span = key && painted[key][0]
      if (span) {
        const a = t.instant(key, span[0], zone)
        barTime.textContent = t.range(a, t.instant(key, span[1], zone), zone)
        barDay.textContent = `${t.weekday(a, zone)} · Avery picks a time`
        fill(go, 'Ask', ic('send', 16, 2.4))
      } else {
        barTime.textContent = 'Pick a time'
        barDay.textContent = 'Tap Avery’s free time'
        fill(go, 'Next', ic('arrowRight', 17, 2.4))
      }
    }
  }
  paintBar()

  let setMode = () => {}
  const seg = segmented([{ value: 'clip', label: 'Pick a time' }, { value: 'strips', label: 'Suggest times' }], 'clip', (v) => setMode(v), { label: 'How to choose' })
  // The result is a sheet that rises off the card, over a veil that blurs
  // the card beneath it.
  const veil = h('div.demo-veil')
  const done = h('div.demo-done')
  const lifted = h('div.demo-float', h('div.demo-done-shade'), done)
  // The pointer hovers above the card and comes down onto it to press,
  // with its shadow on the card closing in as it lands.
  const touch = matchMedia('(pointer: coarse)').matches
  const arrow = (paint) => touch ? '' : `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.6-4.4 2.9 6.6 2.8-1.2-2.9-6.5 6.3-.3Z" ${paint}/></svg>`
  const pointer = h('div.demo-pointer' + (touch ? '.touch' : ''),
    h('span.pointer-ring'),
    h('span.pointer-shade', { html: arrow('fill="#000"') }),
    h('span.pointer-hand', { html: arrow('fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"') }))
  const pick = h('section.book-pick',
    h('div.pick-head', h('div.mode-wrap', seg)),
    h('div.tl-wrap', tl.el),
    bar,
    veil)
  const card = h('div.book-card.demo-card', { style: { '--event': '#007aff' } },
    h('aside.book-info',
      h('span.host-line', avatar({ key: 'ac', name: 'Avery Chen', size: 28 }), h('span', 'Avery Chen')),
      h('h1.event-title', 'Intro call'),
      h('ul.meta', h('li', ic('clock', 18, 1.9), h('div', h('span', '30 min'))), h('li', ic('video', 18, 1.9), h('div', h('span', 'Video call'), h('small', 'The link comes with your invite')))),
      h('div.legend', h('span', h('i.key.shade'), 'Avery is free'), h('span', h('i.key.mine'), 'Your times'), h('span', h('i.key.glow'), 'Both free'))),
    pick)
  // Behind the card, thin plates make its edge and a blur its shadow.
  const edge = [5, 4, 3, 2, 1].map((i) => h('div.demo-edge', { style: { transform: `translateZ(${-i * 2.4}px)` } }))
  const rig = h('div.demo-rig', h('div.demo-shadow'), ...edge, card, pointer, lifted)
  const el = h('div.demo', { 'aria-hidden': 'true', inert: true }, rig)
  if (still) return el

  /* ---- The reel ------------------------------------------------------------------ */

  setMode = (v) => tl.setMode(v)
  const redraw = (...keys) => { for (const k of new Set(keys.filter(Boolean))) tl.redrawTrack(k) }
  function setClip(key, start) {
    const was = clip && clip.key
    clip = key ? { key, start, end: start + 30, mode: 'open' } : null
    redraw(was, key)
    paintBar()
  }
  function setPaint(key, span) {
    const was = Object.keys(painted)[0]
    for (const k of Object.keys(painted)) delete painted[k]
    if (key) painted[key] = [span]
    redraw(was, key)
    paintBar()
  }
  // Snap to the half hour inside Avery's free time, as the real strip does.
  const snapOpen = (key, m) => {
    const at = Math.round(m / 30) * 30
    const span = shadeOf(key).find(([a, b]) => at >= a && at + 30 <= b)
    return span ? at : null
  }

  // Where a minute of a day, or a control, sits on the card, which is where
  // the pointer's layer starts too. Measured through offsets, not the
  // screen, so the rig's turn doesn't skew it.
  function spot(node) {
    let x = node.offsetWidth / 2
    let y = node.offsetHeight / 2
    for (let n = node; n && n !== card; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop }
    for (let p = node.parentElement; p && p !== card; p = p.parentElement) { x -= p.scrollLeft; y -= p.scrollTop }
    return { x, y }
  }
  function at(key, minute) {
    const lane = tl.lane(key)
    const c = spot(lane)
    return { x: c.x - lane.offsetWidth / 2 + (minute / 1440) * lane.offsetWidth, y: c.y }
  }
  let here0 = { x: 0, y: 0 }
  function place(p, ms = 0) {
    here0 = p
    pointer.style.transition = `transform ${ms}ms cubic-bezier(.45, 0, .2, 1), opacity .3s`
    pointer.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
  }

  // Time that stops while the card is out of sight or the tab is hidden, and
  // ends once the page is gone.
  let seen = false
  const watch = new IntersectionObserver(([e]) => { seen = e.isIntersecting })
  watch.observe(card)
  const awake = () => seen && !document.hidden
  const gone = () => !el.isConnected && started
  let started = false
  async function wait(ms) {
    let left = ms
    while (left > 0) {
      if (gone()) throw new Error('gone')
      const step = Math.min(left, 100)
      await new Promise((r) => setTimeout(r, step))
      if (awake()) left -= step
    }
  }
  // The rig's turn: upright when the card is in the middle of the screen,
  // lying back below it and tipping forward past it, plus a few degrees
  // toward the mouse and a lean while a result floats above the card.
  let mouse = null
  let lean = 0
  const turn = { x: 0, y: 0, lean: 0 }
  const quit = new AbortController()
  if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY } }, { passive: true, signal: quit.signal })
  const clamp = (v) => Math.max(-1, Math.min(1, v))
  let shown = false
  let last = ''
  ;(function frame() {
    if (el.isConnected) shown = true
    else if (shown) { quit.abort(); return }
    if (awake()) {
      const r = el.getBoundingClientRect()
      const mid = clamp((r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2))
      const ax = mouse ? clamp((mouse.x - r.left - r.width / 2) / (innerWidth / 2)) : 0
      const ay = mouse ? clamp((mouse.y - r.top - r.height / 2) / (innerHeight / 2)) : 0
      turn.x += (ax - turn.x) * .06
      turn.y += (ay - turn.y) * .06
      turn.lean += (lean - turn.lean) * .05
      const rx = (mid > 0 ? 18 * mid : 6 * mid) - 4 * turn.y + 4 * turn.lean
      const ry = 7 * turn.x - 6 * turn.lean
      const next = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
      if (next !== last) rig.style.transform = last = next
    }
    requestAnimationFrame(frame)
  })()

  // The day and minute under a point of the card.
  function under(p) {
    let best = null
    for (const tr of tracks) {
      const q = at(tr.key, 0)
      if (!best || Math.abs(q.y - p.y) < best.d) best = { key: tr.key, d: Math.abs(q.y - p.y), x0: q.x }
    }
    return { key: best.key, minute: ((p.x - best.x0) / tl.lane(best.key).offsetWidth) * 1440 }
  }
  // Glide the pointer through the points of a path, easing in and out,
  // telling `each` the day and minute it's over.
  async function drag(path, ms, each) {
    const legs = [here0, ...path.map(([key, m]) => at(key, m))]
    let done = 0
    let last = performance.now()
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r))
      if (gone()) throw new Error('gone')
      const now = performance.now()
      if (awake()) done += now - last
      last = now
      const k = Math.min(1, done / ms)
      const f = (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) * (legs.length - 1)
      const i = Math.min(legs.length - 2, Math.floor(f))
      const u = f - i
      const p = { x: legs[i].x + (legs[i + 1].x - legs[i].x) * u, y: legs[i].y + (legs[i + 1].y - legs[i].y) * u }
      place(p)
      const o = under(p)
      each(o.key, o.minute)
      if (k >= 1) return
    }
  }
  const press = async () => { pointer.classList.add('down'); await wait(200); pointer.classList.remove('down') }
  const segTo = (v) => seg.querySelector(`button:nth-of-type(${v === 'clip' ? 1 : 2})`).click()

  function finale(kind) {
    fill(done,
      h('div.done-mark' + (kind === 'ask' ? '.wait' : ''), { html: kind === 'ask'
        ? '<svg viewBox="0 0 76 76"><circle class="ring" cx="38" cy="38" r="38"/><path class="tick" d="M25 39l9 9 18-20"/></svg>'
        : '<svg viewBox="0 0 76 76"><circle class="ring" cx="38" cy="38" r="38"/><path class="tick" d="M24 39l9.5 9.5L53 29"/></svg>' }),
      h('b', kind === 'ask' ? 'Request sent' : 'You’re booked'),
      h('span', kind === 'ask' ? 'Avery picks a time in what you painted.' : 'An invite is on its way to you and Avery.'),
      kind === 'ask' ? null : h('div.demo-cals', h('span', 'Google'), h('span', 'Apple'), h('span', 'Outlook')))
    lifted.style.left = pick.offsetLeft + 'px'
    result(true)
  }
  function result(on) {
    lifted.classList.toggle('show', on)
    veil.classList.toggle('show', on)
    lean = on ? 1 : 0
  }

  async function reel() {
    started = true
    const [a, b, , d] = tracks.map((x) => x.key)
    for (;;) {
      // Start clean, with the pointer resting below the card.
      result(false)
      if (tl.mode !== 'clip') segTo('clip')
      setPaint(null)
      setClip(null)
      pointer.classList.remove('show')
      place({ x: card.offsetWidth * .62, y: card.offsetHeight + 30 })
      await wait(1200)

      // Tap Avery's free time tomorrow: the meeting drops in.
      pointer.classList.add('show')
      place(at(a, 615), 900)
      await wait(1000)
      pointer.classList.add('down')
      await wait(140)
      setClip(a, 600)
      await wait(300)

      // Drag it to Sunday, late morning; it snaps to open times as it goes.
      await drag([[a, 600], [b, 660]], 1300, (key, m) => {
        const s = snapOpen(key, m - 15)
        if (s !== null && (!clip || clip.key !== key || clip.start !== s)) setClip(key, s)
      })
      setClip(b, 660)
      pointer.classList.remove('down')
      await wait(500)

      // Next, then booked.
      const nextAt = spot(go)
      place(nextAt, 800)
      await wait(900)
      await press()
      go.classList.add('pressed')
      await wait(200)
      go.classList.remove('pressed')
      finale('book')
      pointer.classList.remove('show')
      await wait(2600)
      result(false)
      await wait(350)

      // Suggest times: paint when you're free, even past Avery's hours.
      setClip(null)
      pointer.classList.add('show')
      place(spot(seg.querySelector('button:nth-of-type(2)')), 900)
      await wait(950)
      await press()
      segTo('strips')
      await wait(500)
      place(at(d, 660), 900)
      await wait(1000)
      pointer.classList.add('down')
      await wait(260)
      await drag([[d, 780]], 1400, (key, m) => {
        const z = Math.max(675, Math.round(m / 15) * 15)
        const now = painted[d] && painted[d][0]
        if (!now || now[1] !== z) setPaint(d, [660, z])
      })
      setPaint(d, [660, 780])
      pointer.classList.remove('down')
      await wait(700)

      // Ask.
      place(spot(go), 800)
      await wait(900)
      await press()
      finale('ask')
      pointer.classList.remove('show')
      await wait(2600)
    }
  }
  // Begin once the card has been laid out and seen.
  const begin = () => {
    if (!el.isConnected || !seen || !card.offsetWidth) { setTimeout(begin, 300); return }
    reel().catch(() => watch.disconnect())
  }
  setTimeout(begin, 900)
  return el
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
