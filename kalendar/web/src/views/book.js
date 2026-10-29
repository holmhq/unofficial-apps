// Booking: the host's free time lies on a strip of days, time running left
// to right. Tap a shaded span and the meeting drops in, the length of the
// event; drag it along the day or to another. Dropped outside the shading it
// becomes a request. "Suggest times" lets a guest paint when they're free
// instead, Overlap-style: where it meets the host's free time it glows, and
// the host settles on a time inside what they painted. No account either way.
import { h, fill, ic, avatar, toast, haptic, nope, reduced, wide, segmented } from '../ui.js'
import * as api from '../api.js'
import { state, topBar, go, link, failure, holmFooter, signIn } from '../shell.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { here, zoneName, gmt, offsetIn, city } from '../zones.js'
import { zonePicker } from './zone-picker.js'
import { colorOf, placeLine, metaRow, calendarButtons, doneMark, field } from './common.js'
import { missingHost } from './missing.js'
import { timeline, merge, intersect, span, short } from '../timeline.js'
import * as track from '../track.js'

const ZONE_KEY = 'kalendar:zone'
const ME_KEY = 'kalendar:invitee'
const DAY = 1440
const MIN = 60000
const SNAP = 20
const enc = encodeURIComponent

const savedZone = () => { try { return localStorage.getItem(ZONE_KEY) } catch { return null } }
const remembered = () => { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null') || {} } catch { return {} } }

export async function book(handle, slug) {
  const params = new URLSearchParams(location.search)
  const moving = params.get('reschedule') && params.get('t') ? { id: params.get('reschedule'), token: params.get('t') } : null
  let page
  let old = null
  try {
    ;[page, old] = await Promise.all([
      api.get(`/api/u/${enc(handle)}/${enc(slug)}`),
      moving ? api.get(`/api/b/${enc(moving.id)}?t=${enc(moving.token)}`).catch(() => null) : null
    ])
  } catch (error) {
    return missingHost(handle, error)
  }
  const { host, event } = page
  if (old && old.status !== 'confirmed') old = null
  const first = host.name.split(' ')[0]
  const dur = event.duration
  const asks = !old && event.requests !== false
  const visit = track.page(host.handle, { event: event.slug })

  const s = {
    zone: savedZone() || here(),
    step: 'pick',
    mode: 'clip',
    slots: [],
    byDay: new Map(),
    loadedTo: 0,
    until: Date.now() + 60 * 86400000,
    days: wide() ? 28 : 21,
    loading: null,
    clip: null,
    paint: [],
    request: null,
    busy: false
  }

  /* ---- Structure ----------------------------------------------------------- */

  const color = colorOf(event.color)
  const place = placeLine(event.location, host.name)
  const info = h('aside.book-info',
    link(`/@${host.handle}`, { class: 'host-line' }, avatar({ key: host.handle, name: host.name, picture: host.picture, size: 28 }), h('span', host.name)),
    h('h1.event-title', event.title),
    h('ul.meta',
      metaRow('clock', t.minutesLabel(dur)),
      place ? metaRow(place.icon, place.text, place.sub) : null),
    event.description ? h('p.event-desc', event.description) : null,
    old ? h('div.moving', ic('repeat', 16, 2), h('div', h('b', 'Moving your booking'), h('span', `${t.fullDate(old.start, s.zone)}, ${t.range(old.start, old.end, s.zone)}`))) : null,
    h('div.legend.only-wide',
      h('span', h('i.key.shade'), `${first} is free`),
      asks ? h('span', h('i.key.mine'), 'Your times') : null,
      asks ? h('span', h('i.key.glow'), 'Both free') : null))

  const zoneBtn = h('button.zone-btn', { type: 'button', onclick: pickZone })
  const clockSeg = h('div.clock-seg', { role: 'group', 'aria-label': 'Clock' },
    h('button', { type: 'button', 'data-v': '12', onclick: () => setClock(false) }, 'am/pm'),
    h('button', { type: 'button', 'data-v': '24', onclick: () => setClock(true) }, '24h'))
  const modeSeg = asks ? segmented([{ value: 'clip', label: 'Pick a time' }, { value: 'strips', label: 'Suggest times' }], 'clip', setMode, { label: 'How to choose' }) : null
  const hint = h('p.pick-hint')
  const bar = h('div.pick-bar', { 'aria-live': 'polite' })

  const tl = timeline({
    label: `Times for ${event.title}`,
    className: 'guest',
    tracks: [],
    mode: 'clip',
    clipLength: dur,
    keyStep: 15,
    corner: h('span.tl-zone', city(s.zone)),
    layers: (tr) => {
      const shade = windows(tr.key)
      const out = { shade }
      if (old) {
        const w = t.wall(old.start, s.zone)
        if (w.key === tr.key) out.mark = [[w.min, w.min + dur]]
      }
      if (s.mode === 'strips') out.glow = intersect(stripsOn(tr.key), shade).filter(([a, b]) => b - a >= Math.min(dur, 30))
      return out
    },
    now: () => { const w = t.wall(Date.now(), s.zone); return { key: w.key, minute: w.min } },
    clip: {
      get: () => {
        if (!s.clip) return null
        const w = t.wall(s.clip.ms, s.zone)
        return { key: w.key, start: w.min, end: w.min + dur, mode: s.clip.mode }
      },
      set: (c) => { setClip(c) },
      place: placeClip
    },
    clipAria: (c) => `${c.mode === 'ask' ? 'Ask for' : 'Meeting at'} ${span(c.start, c.end)}. Arrow keys move it, Enter continues.`,
    strips: {
      kind: 'guest',
      step: 15,
      min: Math.max(15, Math.ceil(dur / 15) * 15),
      max: 4,
      get: stripsOn,
      set: (key, ranges, { live }) => setStrips(key, ranges, live)
    },
    stripLabel: (a, b, kind, w) => (w > 150 ? span(a, b) : w > 84 ? `${short(a)}–${short(b)}` : w > 44 ? short(a) : ''),
    onTap: (key, minute) => {
      if (s.mode !== 'clip') return
      const c = placeClip(key, Math.round(minute - dur / 2))
      if (!c) { sound.error(); return }
      setClip(c)
      tl.redrawTrack(key)
      sound.pick()
      haptic(8)
      afterClip()
    },
    onLive: paintBar,
    onChange: () => { if (s.mode === 'clip') afterClip(); else paintBar() },
    onEnter: () => toDetails(),
    onSelect: paintBar
  })

  const pick = h('section.book-pick', { 'aria-label': 'Pick a time' },
    h('div.pick-head',
      modeSeg ? null : h('h2.step-title.only-wide', old ? 'Pick a new time' : 'Pick a time'),
      modeSeg ? h('div.mode-wrap', modeSeg) : null,
      h('div.zone-line', zoneBtn, clockSeg)),
    hint,
    h('div.tl-wrap', tl.el),
    bar)

  const details = h('section.book-details', { 'aria-label': 'Your details' })
  const done = h('section.book-done', { 'aria-live': 'polite' })

  const card = h('div.book-card', { style: { '--event': color } }, info, pick, details, done)
  const root = h('main.book', { 'data-step': 'pick' }, card,
    h('div.book-foot', h('span', 'Booking with ', h('b', 'Kalendar')), h('span.dot', '·'), state.me && state.me.host ? link('/', {}, 'Your dashboard') : h('a', { href: '#', onclick: (e) => { e.preventDefault(); state.me && state.me.member ? go('/') : signIn() } }, 'Get your own link')))
  const panel = h('div.panel.book-panel.picking', root, holmFooter())
  const el = h('div.app.public', topBar({ left: link(`/@${host.handle}`, { class: 'top-host', 'aria-label': `${host.name}’s page` }, ic('chevronLeft', 20, 2.2), h('span', host.name)) }), panel)
  swipeBack(card)

  /* ---- Open times ------------------------------------------------------------- */

  async function load(to) {
    if (s.loadedTo >= to || s.loadedTo >= s.until) return
    if (s.loading) return s.loading
    const from = Math.max(s.loadedTo, Date.now() - 3600000)
    const end = Math.min(from + 44 * 86400000, Math.max(to, from + 21 * 86400000))
    const skip = old ? `&skip=${enc(old.id)}&t=${enc(moving.token)}` : ''
    tl.el.classList.add('loading')
    s.loading = api.get(`/api/u/${enc(host.handle)}/${enc(event.slug)}/slots?from=${from}&to=${end}${skip}`).then((r) => {
      s.until = r.until
      s.loadedTo = end
      s.slots = [...new Set([...s.slots, ...r.slots])].sort((a, b) => a - b)
      group()
    }).finally(() => { s.loading = null; tl.el.classList.remove('loading') })
    return s.loading
  }

  function group() {
    s.byDay = new Map()
    for (const ms of s.slots) {
      const w = t.wall(ms, s.zone)
      if (!s.byDay.has(w.key)) s.byDay.set(w.key, [])
      s.byDay.get(w.key).push(w.min)
    }
  }

  const startsOn = (key) => s.byDay.get(key) || []
  const windows = (key) => merge(startsOn(key).map((m) => [m, Math.min(DAY, m + dur)]))

  function tracks() {
    const today = t.wall(Date.now(), s.zone).key
    const last = t.wall(s.until, s.zone).key
    const out = []
    for (let key = today, i = 0; i < s.days && key <= last; key = t.nextKey(key), i++) {
      const noon = Date.parse(key + 'T12:00:00Z')
      const rel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : null
      const n = startsOn(key).length
      out.push({ key, today: i === 0, dim: !n, label: rel || t.weekday(noon, 'UTC', 'short'), sub: `${t.shortMonth(noon, 'UTC')} ${Number(key.slice(8))}` })
    }
    return out
  }

  const lastTrackEnd = () => {
    const list = tracks()
    return list.length ? t.instant(t.nextKey(list[list.length - 1].key), 0, s.zone) : Date.now()
  }

  async function more() {
    const last = t.wall(s.until, s.zone).key
    const list = tracks()
    if (!list.length || list[list.length - 1].key >= last) return
    s.days += 14
    await load(lastTrackEnd()).catch(failure)
    tl.setTracks(tracks())
  }

  tl.el.addEventListener('scroll', () => {
    if (tl.el.scrollTop + tl.el.clientHeight > tl.el.scrollHeight - 160) more()
  }, { passive: true })

  /* ---- The clip ------------------------------------------------------------------ */

  // Near an open start it snaps there; elsewhere it's a request, if allowed.
  function placeClip(key, start, { dir = 0 } = {}) {
    const list = startsOn(key)
    const cur = s.clip ? t.wall(s.clip.ms, s.zone) : null
    if (dir && cur && cur.key === key) {
      const next = dir > 0 ? list.find((m) => m > cur.min) : [...list].reverse().find((m) => m < cur.min)
      if (next != null && (!asks || Math.abs(next - start) <= 15 || s.clip.mode === 'open')) return { key, start: next, end: next + dur, mode: 'open' }
    }
    let nearest = null
    for (const m of list) if (nearest === null || Math.abs(m - start) < Math.abs(nearest - start)) nearest = m
    const open = nearest !== null ? { key, start: nearest, end: nearest + dur, mode: 'open' } : null
    if (open && Math.abs(nearest - start) <= SNAP) return open
    if (!asks) return open
    const m = Math.max(0, Math.min(DAY - dur, Math.round(start / 15) * 15))
    const ms = t.instant(key, m, s.zone)
    if (ms < Date.now() + 30 * MIN || ms > s.until) return open
    return { key, start: m, end: m + dur, mode: 'ask' }
  }

  function setClip(c) {
    if (!c) { s.clip = null; return }
    s.clip = { ms: t.instant(c.key, c.start, s.zone), mode: c.mode }
  }

  function afterClip() {
    if (s.clip) visit.pick()
    paintBar()
  }

  /* ---- Painted times ---------------------------------------------------------------- */

  function stripsOn(key) {
    const lo = t.instant(key, 0, s.zone)
    const hi = t.instant(t.nextKey(key), 0, s.zone)
    return s.paint.filter(([a, b]) => b > lo && a < hi).map(([a, b]) => [t.wall(Math.max(a, lo), s.zone).min, b >= hi ? DAY : t.wall(b, s.zone).min])
  }

  function setStrips(key, ranges, live) {
    const lo = t.instant(key, 0, s.zone)
    const hi = t.instant(t.nextKey(key), 0, s.zone)
    const floor = Date.now() + 30 * MIN
    let mine = ranges.map(([a, b]) => [t.instant(key, a, s.zone), b >= DAY ? hi : t.instant(key, b, s.zone)])
    if (!live) mine = mine.map(([a, b]) => [Math.max(a, Math.ceil(floor / (15 * MIN)) * 15 * MIN), Math.min(b, s.until)]).filter(([a, b]) => b - a >= dur * MIN)
    s.paint = merge([...s.paint.filter(([a, b]) => !(b > lo && a < hi)), ...mine])
    if (!live) {
      if (s.paint.length > 12) { s.paint = s.paint.slice(0, 12); toast('Up to 12 times.', { kind: 'info' }) }
      tl.redrawTrack(key)
    }
  }

  // The earliest open start that fits inside something painted.
  function bestMatch() {
    for (const ms of s.slots) if (s.paint.some(([a, b]) => ms >= a && ms + dur * MIN <= b)) return ms
    return null
  }

  /* ---- The bar under the strip ---------------------------------------------------------- */

  function soonest() {
    const ms = s.slots.find((x) => x > Date.now())
    if (ms == null) return null
    return h('button.soon', { type: 'button', onclick: () => jumpTo(ms) },
      h('small', 'Soonest'), h('b.num', `${t.relativeDay(ms, s.zone) || t.shortDay(ms, s.zone)}, ${t.clock(ms, s.zone)}`))
  }

  function jumpTo(ms, mode = 'open') {
    if (s.mode !== 'clip') { setMode('clip'); modeSeg && modeSeg.querySelectorAll('button')[0].click() }
    const prev = s.clip && t.wall(s.clip.ms, s.zone).key
    s.clip = { ms, mode }
    const w = t.wall(ms, s.zone)
    if (prev && prev !== w.key) tl.redrawTrack(prev)
    tl.redrawTrack(w.key)
    tl.reveal(w.key, w.min, { center: true })
    sound.pick()
    haptic(8)
    afterClip()
    requestAnimationFrame(() => { const c = tl.lane(w.key) && tl.lane(w.key).querySelector('.tl-clip'); c && c.focus({ preventScroll: true }) })
  }

  function paintBar() {
    if (s.mode === 'clip') {
      fill(hint, asks ? `Tap a shaded time to pick it. Tap anywhere else to ask ${first} for that time instead.` : 'Tap a shaded time to pick it, then drag to fine-tune.')
      if (!s.clip) {
        const soon = soonest()
        fill(bar, h('div.bar-text', h('b', 'Pick a time'), h('span', s.slots.length || s.loading ? `Shaded is when ${first} is free.` : `${first} has nothing open right now.`)), soon)
        return
      }
      const end = s.clip.ms + dur * MIN
      const ask = s.clip.mode === 'ask'
      fill(bar,
        h('div.bar-text', h('b.num', t.range(s.clip.ms, end, s.zone)), h('span', `${t.relativeDay(s.clip.ms, s.zone) || t.weekday(s.clip.ms, s.zone)}, ${t.monthDay(s.clip.ms, s.zone)}${ask ? ` · not in ${first}’s hours` : ` · ${city(s.zone)}`}`)),
        h('button.btn' + (ask ? '.tinted' : '.primary'), { type: 'button', onclick: toDetails }, ask ? `Ask ${first}` : 'Next', ic('arrowRight', 17, 2.4)))
      return
    }
    fill(hint, `${wide() ? 'Drag' : 'Hold, then drag'} along a day to paint when you’re free; drag the ends to trim. Where it meets ${first}’s free time it glows.`)
    const n = s.paint.length
    if (!n) { fill(bar, h('div.bar-text', h('b', 'Suggest times'), h('span', `${first} picks one that works and emails you.`))); return }
    const best = bestMatch()
    fill(bar,
      h('div.bar-text', h('b', `${n} ${n === 1 ? 'time' : 'times'} painted`),
        best
          ? h('span', `${first} is free in ${n === 1 ? 'part of it' : 'some'}: `, h('button.inline-link', { type: 'button', onclick: () => jumpTo(best) }, `book ${t.relativeDay(best, s.zone) ? '' : t.weekday(best, s.zone, 'short') + ' '}${t.clock(best, s.zone)}`))
          : h('span', `${first} will pick a time in ${n === 1 ? 'it' : 'them'}`)),
      h('button.btn.primary', { type: 'button', onclick: () => toDetails() }, 'Send', ic('arrowRight', 17, 2.4)))
  }

  function setMode(mode) {
    if (mode === s.mode) return
    s.mode = mode
    tl.setMode(mode)
    sound.tap()
    paintBar()
  }

  /* ---- Steps ----------------------------------------------------------------- */

  function setStep(step, { push = true, dir = 'forward' } = {}) {
    if (s.step === step) return
    const change = () => {
      s.step = step
      root.dataset.step = step
      panel.classList.toggle('picking', step === 'pick')
      if (step === 'details') drawDetails()
      panel.scrollTop = 0
    }
    if (push) history.pushState({ page: location.pathname + location.search, step }, '', location.href)
    if (step !== 'done') sound.push()
    if (document.startViewTransition && !reduced()) {
      document.documentElement.dataset.vt = dir
      const vt = document.startViewTransition(change)
      vt.finished.finally(() => { delete document.documentElement.dataset.vt })
    } else change()
  }

  function toDetails() {
    if (s.mode === 'clip') {
      if (!s.clip) return
      s.request = s.clip.mode === 'ask' ? [[s.clip.ms, s.clip.ms + dur * MIN]] : null
    } else {
      if (!s.paint.length) { sound.error(); return }
      s.request = s.paint.map((r) => r.slice())
    }
    api.prepare('bookings.create')
    setStep('details')
  }

  /* ---- Details --------------------------------------------------------------- */

  function rangeList(ranges) {
    return h('ul.range-list', ranges.map(([a, b]) => h('li', h('b', `${t.relativeDay(a, s.zone) || t.weekday(a, s.zone, 'short')}, ${t.monthDay(a, s.zone)}`), h('span.num', t.range(a, b, s.zone)))))
  }

  function drawDetails() {
    const me = state.me && state.me.member
    const last = remembered()
    const asking = !!s.request
    const name = h('input.input', { name: 'name', autocomplete: 'name', required: true, maxlength: '80', value: (old && old.name) || (me && me.name) || last.name || '', placeholder: 'Jane Appleseed' })
    const email = h('input.input', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: '200', value: (old && old.email) || (me && me.email) || last.email || '', placeholder: 'jane@example.com' })
    const phone = h('input.input', { name: 'phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '32', value: (old && old.phone) || last.phone || '', placeholder: '+1 555 010 0199' })
    const notes = h('textarea.input', { name: 'notes', rows: '3', maxlength: '1000', placeholder: asking ? `What you’d like to talk about, and anything ${first} should know about these times` : 'Anything that helps prepare' })
    const f = {
      name: field({ label: 'Name', input: name }),
      email: field({ label: 'Email', input: email, hint: asking ? `${first}’s answer comes here.` : 'Your invite goes here.' }),
      phone: event.location.kind === 'phone' ? field({ label: 'Phone number', input: phone, hint: `${host.name} will call you on it.` }) : null,
      notes: field({ label: 'Notes', input: notes, hint: `Only ${host.name} sees these.` })
    }
    const label = old ? 'Move booking' : asking ? `Send to ${first}` : 'Book it'
    const submit = h('button.btn.primary.large.block', { type: 'submit' }, h('span', label))
    const summary = asking
      ? h('div.summary', h('span.event-chip', { style: { '--event': color } }), h('div', h('b', `${event.title} · ${t.minutesLabel(dur)}`), h('span', `${s.request.length === 1 ? 'The time you’re asking for' : `${s.request.length} times you’re free`}, ${city(s.zone)}`), rangeList(s.request)), h('button.link-btn', { type: 'button', onclick: () => history.back() }, 'Change'))
      : h('div.summary', h('span.event-chip', { style: { '--event': color } }), h('div', h('b', event.title), h('span', t.fullDate(s.clip.ms, s.zone)), h('span.num', `${t.range(s.clip.ms, s.clip.ms + dur * MIN, s.zone)} · ${city(s.zone)}`)), h('button.link-btn', { type: 'button', onclick: () => history.back() }, 'Change'))
    const form = h('form.details-form', { novalidate: true },
      h('div.details-head',
        h('button.back-btn', { type: 'button', 'aria-label': 'Back to the times', onclick: () => history.back() }, ic('chevronLeft', 22, 2.2)),
        h('h2.step-title', old ? 'Confirm the new time' : asking ? `Ask ${first}` : 'Almost there')),
      summary,
      f.name, f.email, f.phone, f.notes,
      submit,
      h('p.fine', asking ? `${first} picks a time that works, or says no. You’ll get an email either way, and no account is needed.` : 'No account needed. You’ll get an email with a calendar invite and a link to change or cancel.'))
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      confirm({ f, inputs: { name, email, phone, notes }, submit, label })
    })
    fill(details, form)
    if (wide()) requestAnimationFrame(() => (name.value ? (email.value ? notes : email) : name).focus({ preventScroll: true }))
  }

  async function confirm({ f, inputs, submit, label }) {
    if (s.busy) return
    let bad = null
    const check = (box, ok, message) => { box.setError(ok ? '' : message); if (!ok && !bad) bad = box }
    check(f.name, inputs.name.value.trim().length > 0, 'Add your name.')
    check(f.email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inputs.email.value.trim()), 'That email doesn’t look right.')
    if (f.phone) check(f.phone, /^\+?[0-9][0-9 ().-]{5,30}$/.test(inputs.phone.value.trim()), 'Add a number they can call.')
    if (bad) {
      nope(bad)
      sound.error()
      bad.querySelector('input, textarea').focus()
      return
    }
    s.busy = true
    submit.classList.add('busy')
    fill(submit, h('span.spin'), h('span', old ? 'Moving…' : s.request ? 'Sending…' : 'Booking…'))
    const at = s.request ? s.request[0][0] : s.clip.ms
    const input = {
      handle: host.handle, event: event.slug,
      name: inputs.name.value.trim(), email: inputs.email.value.trim(), notes: inputs.notes.value.trim(),
      tz: s.zone, tzLabel: zoneName(s.zone, at), offset: offsetIn(s.zone, at), h24: t.clock24()
    }
    if (s.request) { input.request = true; input.ranges = s.request } else input.start = s.clip.ms
    if (f.phone) input.phone = inputs.phone.value.trim()
    if (old) input.reschedule = moving
    try { localStorage.setItem(ME_KEY, JSON.stringify({ name: input.name, email: input.email, phone: input.phone || '' })) } catch {}
    try {
      const result = await api.op('bookings.create', input, { challenge: true, key: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) })
      s.busy = false
      showDone(result)
    } catch (error) {
      s.busy = false
      submit.classList.remove('busy')
      fill(submit, h('span', label))
      if (error.status === 409 && error.code !== 'already_asked' && !s.request) {
        // Someone took it first: back to the strip, without it.
        toast(error.message, { kind: 'bad' })
        sound.error()
        s.slots = []
        s.loadedTo = 0
        s.clip = null
        await load(lastTrackEnd()).catch(() => {})
        tl.setTracks(tracks())
        paintBar()
        history.back()
        return
      }
      if (/email/i.test(error.message)) { f.email.setError(error.message); nope(f.email) }
      failure(error)
    }
  }

  /* ---- Done ------------------------------------------------------------------- */

  function showDone(result) {
    const b = result.booking
    const asked = result.requested || b.status === 'requested'
    const where = placeLine(b.location, host.name, { revealed: true, phone: b.phone })
    const emailed = result.emailed && result.emailed.invitee
    const ranges = b.ranges && b.ranges.length ? b.ranges : s.request
    fill(done,
      doneMark(asked ? 'wait' : 'good'),
      h('h1.done-title', old ? 'Booking moved' : asked ? 'Request sent' : 'You’re booked'),
      h('p.done-lead', asked
        ? [`${first} will pick a time from what you sent. `, emailed ? ['You’ll hear back at ', h('b', b.email), '.'] : 'We couldn’t send your copy by email just now.']
        : emailed ? ['An invite is on its way to ', h('b', b.email), '.'] : 'Add it to your calendar below. We couldn’t send the email just now.'),
      h('div.ticket', { style: { '--event': color } },
        h('div.ticket-head', avatar({ key: host.handle, name: host.name, picture: host.picture, size: 40 }), h('div', h('b', b.event.title), h('span', `with ${host.name}`)), h('span.event-chip', { style: { '--event': color } })),
        asked
          ? rangeList(ranges)
          : h('ul.meta',
            metaRow('calendar', t.fullDate(b.start, s.zone)),
            metaRow('clock', t.range(b.start, b.end, s.zone), `${zoneName(s.zone, b.start)} · ${gmt(offsetIn(s.zone, b.start))}`),
            where ? metaRow(where.icon, where.text, where.sub, where.href) : null)),
      asked ? null : h('p.cal-label', 'Add to your calendar'),
      asked ? null : calendarButtons(b.links),
      h('div.done-links',
        asked ? null : h('a', { href: b.links.reschedule, onclick: (e) => { e.preventDefault(); location.href = b.links.reschedule } }, 'Reschedule'),
        asked ? null : h('span.dot', '·'),
        h('a', { href: b.links.manage, onclick: (e) => { e.preventDefault(); go(new URL(b.links.manage).pathname + new URL(b.links.manage).search) } }, asked ? 'Withdraw the request' : 'Cancel')),
      !(state.me && state.me.host) ? h('div.promo', ic('sparkles', 18, 2), h('div', h('b', 'Want a page like this?'), h('span', 'Share one link and let people book you.')), h('button.btn.small.tinted', { type: 'button', onclick: () => (state.me && state.me.member ? go('/') : signIn()) }, 'Get yours')) : null)
    // Replace the steps in history: Back from here shouldn't book again.
    history.replaceState({ page: location.pathname, step: 'done' }, '', `/@${host.handle}/${event.slug}`)
    setStep('done', { push: false })
    if (asked) sound.sent(); else sound.booked()
    haptic(14)
  }

  /* ---- Zone and clock ---------------------------------------------------------- */

  function paintZone() {
    fill(zoneBtn, ic('globe', 16, 2), h('span', wide() ? zoneName(s.zone, Date.now(), 'longGeneric') : city(s.zone)), h('span.zone-time.num', t.clock(Date.now(), s.zone)), ic('chevronDown', 15, 2.2))
    for (const b of clockSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.v === '24') === t.clock24()))
    const corner = tl.el.querySelector('.tl-zone')
    if (corner) corner.textContent = city(s.zone)
  }

  async function pickZone() {
    const zone = await zonePicker(s.zone)
    if (!zone || zone === s.zone) return
    s.zone = zone
    try { localStorage.setItem(ZONE_KEY, zone) } catch {}
    group()
    paintZone()
    tl.setTracks(tracks())
    tl.redraw()
    paintBar()
  }

  function setClock(v) {
    if (v === t.clock24()) return
    t.setClock24(v)
    sound.tap()
    redrawClocks()
  }

  function redrawClocks() {
    paintZone()
    tl.redraw()
    paintBar()
    if (s.step === 'details') drawDetails()
  }

  // Phone: swipe from the left edge goes back a step.
  function swipeBack(target) {
    let start = null
    target.addEventListener('touchstart', (e) => {
      const x = e.touches[0].clientX
      start = x < 24 && s.step === 'details' ? { x, y: e.touches[0].clientY } : null
    }, { passive: true })
    target.addEventListener('touchend', (e) => {
      if (!start) return
      const dx = e.changedTouches[0].clientX - start.x
      const dy = Math.abs(e.changedTouches[0].clientY - start.y)
      start = null
      if (dx > 70 && dy < 60) history.back()
    }, { passive: true })
  }

  /* ---- Start ------------------------------------------------------------------- */

  history.replaceState({ page: location.pathname + location.search, step: 'pick' }, '', location.href)
  paintZone()
  paintBar()
  tl.setTracks(tracks())
  tl.scrollToMinute(8 * 60)
  const opening = load(Date.now() + 30 * 86400000).then(() => {
    tl.setTracks(tracks())
    // Open the strip at the soonest open time, so hours that cross midnight
    // in the guest's zone don't start it at 12 AM.
    const firstOpen = s.slots.find((x) => x > Date.now())
    const w = firstOpen ? t.wall(firstOpen, s.zone) : null
    tl.scrollToMinute(Math.max(0, (w ? w.min : 8 * 60) - 45))
    if (old && w) tl.reveal(t.wall(old.start, s.zone).key, t.wall(old.start, s.zone).min, { smooth: false })
    paintBar()
  }, failure)

  return {
    el,
    ready: () => opening,
    clock: redrawClocks,
    leave: () => { visit.leave(); tl.destroy() },
    // Back and Forward move between the steps on this page.
    pop(st) {
      if (!st || !st.step || st.page !== location.pathname + location.search || s.step === 'done') return false
      const step = st.step === 'time' ? 'pick' : st.step
      if (step === 'details' && !s.clip && !s.paint.length) return false
      const order = ['pick', 'details', 'done']
      setStep(step, { push: false, dir: order.indexOf(step) < order.indexOf(s.step) ? 'back' : 'forward' })
      return true
    }
  }
}
