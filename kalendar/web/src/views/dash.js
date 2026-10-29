// The host's side: bookings and requests, event types, hours and insights. A
// tab bar on a phone, a sidebar with your link on a wide screen. Changes
// save as you make them.
import { h, ic, fill, avatar, sheet, menu, segmented, toggle, toast, haptic, copyText, flip, nope, collapsing, reduced, wide } from '../ui.js'
import * as api from '../api.js'
import { state, topBar, go, failure, prettyURL, pageURL, share } from '../shell.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { zonePayload, city, gmt, offsetIn } from '../zones.js'
import { zonePicker } from './zone-picker.js'
import { colorOf, LOCATIONS, placeLine, metaRow } from './common.js'
import { eventSheet } from './event-sheet.js'
import { timeline, merge, intersect, span } from '../timeline.js'
import { insights } from './insights.js'

const DAY = 1440
const MIN = 60000

const TABS = [
  { id: 'bookings', path: '/', label: 'Bookings', icon: 'calendarCheck' },
  { id: 'events', path: '/events', label: 'Event types', short: 'Events', icon: 'layers' },
  { id: 'hours', path: '/hours', label: 'Availability', short: 'Hours', icon: 'clock' },
  { id: 'insights', path: '/insights', label: 'Insights', icon: 'chartColumn' }
]

export function dash(tab) {
  const host = () => state.me.host
  const params = new URLSearchParams(location.search)
  const s = { tab, view: params.get('r') ? 'requests' : 'upcoming', lists: new Map(), events: null, open: params.get('r'), statsDays: 30 }
  const main = h('div.panel.dash-main')
  const navButtons = new Map()
  const tabButtons = new Map()
  const linkText = h('span.link-text')
  const side = h('nav.side', { 'aria-label': 'Kalendar' },
    h('div.side-link',
      h('button.icon-btn.small.side-edit', { type: 'button', 'aria-label': 'Edit your profile', title: 'Edit your profile', onclick: () => import('./profile-sheet.js').then((v) => v.profileSheet()) }, ic('pencil', 16, 2.2)),
      h('small', 'Your link'),
      linkText,
      h('div.link-actions',
        h('button.btn.small.tinted', { type: 'button', onclick: () => { copyText(pageURL(host().handle), 'Link copied'); sound.pop() } }, ic('copy', 15, 2.2), 'Copy'),
        h('a.btn.small.tinted', { href: pageURL(host().handle), target: '_blank', rel: 'noopener' }, ic('externalLink', 15, 2.2), 'Open'))),
    TABS.map((x) => {
      const b = h('button.side-item', { type: 'button', onclick: () => switchTo(x.id) }, ic(x.icon, 19, 2), h('span.grow', x.label), h('span.badge', { hidden: true }))
      navButtons.set(x.id, b)
      return b
    }))
  const tabbar = h('nav.tabbar', { 'aria-label': 'Sections' }, TABS.map((x) => {
    const b = h('button.tab', { type: 'button', onclick: () => switchTo(x.id) }, h('span.tab-icon', ic(x.icon, 23, 1.9), h('span.tab-dot', { hidden: true })), h('span', x.short || x.label))
    tabButtons.set(x.id, b)
    return b
  }))
  const shareBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Share your link', onclick: () => share(host().handle) }, ic('share', 19, 2))
  const bar = topBar({ right: [shareBtn] })
  const el = h('div.app.dash', bar, h('div.dash-body', side, main), tabbar)
  collapsing(bar, main)

  function paintLink() { fill(linkText, h('span.link-host', `${location.host}/`), h('span.link-handle', `@${host().handle}`)) }

  function switchTo(id) {
    if (id === s.tab) { main.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return }
    haptic(5)
    sound.tap()
    go(TABS.find((x) => x.id === id).path)
  }

  let leaveTab = null
  function show(id, animate = true) {
    if (leaveTab) { leaveTab(); leaveTab = null }
    s.tab = id
    el.dataset.tab = id
    for (const [k, b] of navButtons) b.classList.toggle('on', k === id)
    for (const [k, b] of tabButtons) { b.classList.toggle('on', k === id); b.setAttribute('aria-current', k === id ? 'page' : 'false') }
    const title = TABS.find((x) => x.id === id).label
    document.title = `${title} · Kalendar`
    bar.querySelector('.top-title') || bar.insertBefore(h('div.top-title.small-title'), bar.querySelector('.top-r'))
    bar.querySelector('.top-title').textContent = title
    const content = { bookings: bookingsTab, events: eventsTab, hours: hoursTab, insights: insightsTab }[id]()
    fill(main, content)
    main.scrollTop = 0
    if (animate && !reduced()) content.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  function badges() {
    const c = state.me.counts || {}
    const soon = (s.lists.get('upcoming') || []).filter((b) => b.start < Date.now() + 86400000).length
    const n = soon + (c.requests || 0)
    const b = navButtons.get('bookings').querySelector('.badge')
    b.hidden = !n
    b.textContent = String(n)
    tabButtons.get('bookings').querySelector('.tab-dot').hidden = !(c.requests > 0)
    const seg = main.querySelector('.seg [data-view="requests"]')
    if (seg) { seg.hidden = !c.requests; seg.textContent = String(c.requests || '') }
  }

  /* ---- Bookings ----------------------------------------------------------- */

  function bookingsTab() {
    const list = h('div.booking-list')
    const seg = segmented([
      { value: 'upcoming', label: 'Upcoming' }, { value: 'requests', label: 'Requests' }, { value: 'past', label: 'Past' }, { value: 'cancelled', label: 'Cancelled' }
    ], s.view, (v) => { s.view = v; sound.tap(); load(list, true) }, { label: 'Which bookings' })
    seg.querySelectorAll('button')[1].append(h('span.seg-count', { 'data-view': 'requests', hidden: true }))
    const box = h('section.tab-page',
      h('h1.large-title', 'Bookings'),
      h('div.mobile-link.only-narrow',
        h('div.grow', h('small', 'Your link'), h('span.link-text', prettyURL(host().handle))),
        h('button.icon-btn.tinted', { type: 'button', 'aria-label': 'Copy your link', onclick: () => { copyText(pageURL(host().handle), 'Link copied'); sound.pop() } }, ic('copy', 18, 2))),
      h('div.seg-wrap', seg),
      list)
    load(list, false)
    requestAnimationFrame(badges)
    return box
  }

  async function load(list, animate) {
    const view = s.view
    const cached = s.lists.get(view)
    if (cached) draw(list, cached, view, animate)
    else fill(list, skeleton())
    try {
      const r = await api.get('/api/bookings?view=' + view)
      s.lists.set(view, r.bookings)
      if (view === 'requests') state.me.counts = { ...(state.me.counts || {}), requests: r.bookings.length }
      badges()
      if (s.view === view && s.tab === 'bookings') draw(list, r.bookings, view, animate && !cached)
      if (view === 'requests' && s.open) {
        const b = r.bookings.find((x) => x.id === s.open)
        s.open = null
        history.replaceState(history.state, '', location.pathname)
        if (b) requestSheet(b)
        else toast('That request was already answered or withdrawn.', { kind: 'info' })
      }
    } catch (error) {
      if (!cached) fill(list, h('div.empty', ic('circleAlert', 26, 1.8), h('b', 'Can’t load bookings'), h('p', error.message), h('button.btn.small', { type: 'button', onclick: () => load(list, true) }, 'Try again')))
    }
  }

  const skeleton = () => h('div.skeleton', [0, 1, 2].map(() => h('div.sk-row', h('span'), h('span'), h('span'))))

  function draw(list, bookings, view, animate) {
    if (!bookings.length) {
      const copy = {
        upcoming: ['calendarCheck', 'No bookings yet', 'Share your link. New bookings show up here, and in your email.'],
        requests: ['inbox', 'No requests', 'When someone asks for a time outside your hours, it waits here for you to pick a time.'],
        past: ['calendar', 'Nothing in the past', 'Meetings you’ve had will be listed here.'],
        cancelled: ['calendarX', 'Nothing cancelled', 'Good news.']
      }[view]
      fill(list, h('div.empty', h('span.empty-icon', ic(copy[0], 28, 1.8)), h('b', copy[1]), h('p', copy[2]),
        view === 'upcoming' ? h('button.btn.small.tinted', { type: 'button', onclick: () => share(host().handle) }, ic('share', 15, 2.2), 'Share your link') : null))
      return
    }
    if (view === 'requests') {
      fill(list, h('p.list-note', 'They painted when they’re free. Pick a time in it, or say no.'), h('div.group', bookings.map((b, i) => requestRow(b, i))))
      if (animate && !reduced()) list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 })
      return
    }
    const zone = host().tz
    const groups = new Map()
    for (const b of bookings) {
      const key = t.dayKey(b.start, zone)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(b)
    }
    const out = []
    const now = Date.now()
    const next = view === 'upcoming' ? bookings.find((b) => b.end > now) : null
    if (next) out.push(nextUp(next))
    let i = 0
    for (const [key, items] of groups) {
      const ms = items[0].start
      const rel = t.relativeDay(ms, zone)
      out.push(h('h2.day-head', rel ? [h('b', rel), h('span', t.longDay(ms, zone))] : [h('b', t.weekday(ms, zone)), h('span', t.monthDay(ms, zone) + (key.slice(0, 4) !== String(new Date().getFullYear()) ? ', ' + key.slice(0, 4) : ''))]))
      out.push(h('div.group', items.map((b) => row(b, i++))))
    }
    fill(list, out)
    if (animate && !reduced()) list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 })
  }

  // The next meeting, large, with how long until it starts.
  function nextUp(b) {
    const zone = host().tz
    const now = Date.now()
    const mins = Math.round((b.start - now) / 60000)
    const until = b.start <= now ? 'Happening now' : mins < 60 ? `In ${mins} min` : mins < 1440 ? `In ${Math.round(mins / 60)} h` : `In ${Math.round(mins / 1440)} days`
    const place = placeLine(b.location, host().name, { revealed: true, phone: b.phone })
    return h('button.next-up', { type: 'button', style: { '--event': colorOf(b.event.color) }, onclick: () => bookingSheet(b) },
      h('div.next-top', h('span.next-label', b.start <= now ? h('span.live-dot') : ic('clock', 14, 2.4), until), h('span.next-time.num', `${t.relativeDay(b.start, zone) || t.shortDay(b.start, zone)} · ${t.range(b.start, b.end, zone)}`)),
      h('div.next-main', avatar({ key: b.email, name: b.name, size: 44 }), h('div', h('b.trunc', b.name), h('span.trunc', h('i.ev-dot'), `${b.event.title}${place ? ' · ' + place.text : ''}`))))
  }

  function row(b, i) {
    const zone = host().tz
    const start = t.clockParts(b.start, zone)
    const now = Date.now()
    const live = b.status === 'confirmed' && b.start <= now && b.end > now
    const place = placeLine(b.location, host().name, { revealed: true, phone: b.phone })
    const off = b.status === 'cancelled' || b.status === 'declined'
    return h('button.booking-row' + (off ? '.off' : ''), { type: 'button', style: { '--event': colorOf(b.event.color), '--i': String(Math.min(i, 10)) }, onclick: () => bookingSheet(b) },
      h('span.when', h('b.num', start.main, start.period ? h('small', start.period) : null), h('span.num', t.clock(b.end, zone))),
      h('span.who', h('b.trunc', b.name), h('span.trunc', h('i.ev-dot'), b.event.title, place ? ` · ${place.text}` : '')),
      live ? h('span.live', 'Now') : b.status === 'declined' ? h('span.tag.grey', 'Declined') : b.acceptedAt && b.status === 'confirmed' ? h('span.tag', 'Asked') : b.rescheduledFrom && b.status === 'confirmed' ? h('span.tag', 'Moved') : null,
      ic('chevronRight', 17, 2.2))
  }

  const rangesOf = (b) => (b.ranges && b.ranges.length ? b.ranges : [[b.start, b.end]])

  function requestRow(b, i) {
    const zone = host().tz
    const ranges = rangesOf(b)
    const day = (ms) => t.relativeDay(ms, zone) || t.shortDay(ms, zone)
    const sub = ranges.length === 1
      ? `${day(ranges[0][0])}, ${t.range(ranges[0][0], ranges[0][1], zone)}`
      : `${ranges.length} times · ${day(ranges[0][0])} to ${day(ranges[ranges.length - 1][0])}`
    return h('button.booking-row.req', { type: 'button', style: { '--event': colorOf(b.event.color), '--i': String(Math.min(i, 10)) }, onclick: () => requestSheet(b) },
      avatar({ key: b.email, name: b.name, size: 40 }),
      h('span.who', h('b.trunc', b.name), h('span.trunc', h('i.ev-dot'), `${b.event.title} · ${sub}`)),
      h('span.tag', 'Pick a time'),
      ic('chevronRight', 17, 2.2))
  }

  async function bookingSheet(b) {
    haptic()
    const zone = host().tz
    const theirs = b.tz && b.tz !== zone ? `${t.clock(b.start, b.tz)} for them · ${city(b.tz)}` : null
    const place = placeLine(b.location, host().name, { revealed: true, phone: b.phone })
    const cancelled = b.status === 'cancelled' || b.status === 'declined'
    const result = await sheet({
      title: b.event.title,
      cancel: 'Close',
      body: (close) => [
        h('div.person',
          avatar({ key: b.email, name: b.name, size: 64, cls: '.big' }),
          h('b', b.name),
          h('a', { href: `mailto:${b.email}` }, b.email),
          cancelled ? h('span.status.off', b.status === 'declined' ? 'You said no' : b.rescheduledTo ? 'Moved' : b.cancelledBy === 'host' ? 'You cancelled' : 'They cancelled') : null),
        h('ul.meta.card' + (cancelled ? '.struck' : ''), { style: { '--event': colorOf(b.event.color) } },
          metaRow('calendar', t.fullDate(b.start, zone)),
          metaRow('clock', t.range(b.start, b.end, zone), theirs),
          place ? metaRow(place.icon, place.text, place.sub, place.href) : null,
          b.phone && b.location.kind !== 'phone' ? metaRow('phone', b.phone, null, `tel:${b.phone}`) : null),
        b.notes ? h('div.notes', h('small', 'Notes'), h('p', b.notes)) : null,
        b.reason ? h('div.notes', h('small', b.status === 'declined' ? 'What you told them' : 'Why it was cancelled'), h('p', b.reason)) : null,
        h('div.sheet-actions',
          h('a.btn.block', { href: `mailto:${b.email}?subject=${encodeURIComponent(b.event.title)}` }, ic('mail', 18, 2), `Email ${b.name.split(' ')[0]}`),
          !cancelled && b.end > Date.now() ? h('button.btn.block.danger', { type: 'button', onclick: () => close('cancel') }, ic('calendarX', 18, 2), 'Cancel booking') : null),
        h('p.fine', `${b.acceptedAt ? 'Asked for' : 'Booked'} ${t.shortDay(b.createdAt, zone)} at ${t.clock(b.createdAt, zone)}`)
      ]
    })
    if (result === 'cancel') cancelBooking(b)
  }

  async function cancelBooking(b) {
    const reason = h('textarea.input', { rows: '3', maxlength: '500', placeholder: `A note for ${b.name.split(' ')[0]} (optional)` })
    const ok = await sheet({
      title: '', label: 'Cancel booking', cancel: null, plain: true,
      body: (close) => [
        h('div.confirm-head', h('b', `Cancel with ${b.name}?`), h('p', `${t.fullDate(b.start, host().tz)}, ${t.range(b.start, b.end, host().tz)}. They’ll get an email with a link to book again.`)),
        reason,
        h('div.confirm-actions',
          h('button.btn.large.block.danger-solid', { type: 'button', onclick: () => close(true) }, 'Cancel booking'),
          h('button.btn.large.block', { type: 'button', onclick: () => close(false) }, 'Keep it'))
      ]
    })
    if (!ok) return
    try {
      const r = await api.post(`/api/bookings/${b.id}/cancel`, { reason: reason.value.trim() })
      sound.remove()
      toast(r.emailed ? `Cancelled. ${b.name.split(' ')[0]} has been told.` : 'Cancelled.')
      s.lists.clear()
      if (s.tab === 'bookings') show('bookings', false)
    } catch (error) { failure(error) }
  }

  /* ---- Settling a request ---------------------------------------------------- */

  // Their painted times over your hours and your other meetings. Drag the
  // meeting to where it suits you, inside what they sent, and accept.
  async function requestSheet(b) {
    haptic()
    const zone = host().tz
    const first = b.name.split(' ')[0]
    const dur = b.event.duration
    const ranges = rangesOf(b)
    let upcoming = s.lists.get('upcoming')
    if (!upcoming) {
      try { upcoming = (await api.get('/api/bookings?view=upcoming')).bookings; s.lists.set('upcoming', upcoming) } catch { upcoming = [] }
    }
    const keys = []
    for (const [a, z] of ranges) for (let k = t.wall(a, zone).key; k <= t.wall(z - 1, zone).key; k = t.nextKey(k)) if (!keys.includes(k)) keys.push(k)
    keys.sort()
    const onDay = (list, key) => {
      const lo = t.instant(key, 0, zone)
      const hi = t.instant(t.nextKey(key), 0, zone)
      return list.filter(([a, z]) => z > lo && a < hi).map(([a, z]) => [a <= lo ? 0 : t.wall(a, zone).min, z >= hi ? DAY : t.wall(z, zone).min])
    }
    const theirs = (key) => onDay(ranges, key)
    const hoursOn = (key) => {
      const o = host().overrides && host().overrides[key]
      if (o) return o
      return host().weekly[new Date(key + 'T12:00:00Z').getUTCDay()] || []
    }
    const busyOn = (key) => onDay(upcoming.filter((x) => x.id !== b.id && x.status === 'confirmed').map((x) => [x.start, x.end]), key)
    const free = (key) => {
      const busy = busyOn(key)
      return merge(hoursOn(key)).flatMap(([a, z]) => {
        let parts = [[a, z]]
        for (const [c, d] of busy) parts = parts.flatMap(([p, q]) => (d <= p || c >= q ? [[p, q]] : [[p, Math.max(p, c)], [Math.min(q, d), q]].filter(([x, y]) => y - x > 0)))
        return parts
      })
    }
    const fits = (key, m) => free(key).some(([a, z]) => m >= a && m + dur <= z)
    const clash = (key, m) => busyOn(key).find(([a, z]) => m < z && m + dur > a)

    function placeIn(key, start) {
      const spans = theirs(key).filter(([a, z]) => z - a >= dur)
      if (!spans.length) return null
      let best = null
      for (const [a, z] of spans) {
        const m = Math.max(a, Math.min(z - dur, Math.round(start / 5) * 5))
        if (best === null || Math.abs(m - start) < Math.abs(best - start)) best = m
      }
      if (t.instant(key, best, zone) <= Date.now()) return null
      return { key, start: best, end: best + dur, mode: fits(key, best) ? 'open' : 'ask' }
    }

    // Start where it suits you both, if anywhere does.
    let clip = null
    for (const key of keys) {
      for (const [a, z] of intersect(theirs(key), free(key))) {
        for (let m = Math.ceil(a / 5) * 5; m + dur <= z; m += 5) {
          if (t.instant(key, m, zone) > Date.now()) { clip = { key, start: m, end: m + dur, mode: 'open' }; break }
        }
        if (clip) break
      }
      if (clip) break
    }
    if (!clip) for (const key of keys) { clip = placeIn(key, theirs(key)[0] ? theirs(key)[0][0] : 0); if (clip) break }

    const status = h('p.req-status')
    const accept = h('button.btn.primary.large.block', { type: 'button' })
    const paint = () => {
      if (!clip) {
        fill(status, ic('circleAlert', 16, 2.2), 'Their times have passed.')
        status.className = 'req-status bad'
        accept.disabled = true
        fill(accept, 'Accept')
        return
      }
      const ms = t.instant(clip.key, clip.start, zone)
      const c = clash(clip.key, clip.start)
      status.className = 'req-status ' + (c ? 'bad' : clip.mode === 'open' ? 'good' : 'warn')
      fill(status, ic(c ? 'circleAlert' : clip.mode === 'open' ? 'circleCheck' : 'info', 16, 2.2),
        c ? 'That clashes with another booking.' : clip.mode === 'open' ? 'In your hours, and you’re free.' : 'Outside your hours, but it’s in theirs.')
      accept.disabled = !!c
      const rel = t.relativeDay(ms, zone)
      fill(accept, `Accept ${rel ? rel.toLowerCase() : t.shortDay(ms, zone)}, ${t.clock(ms, zone)}`)
    }

    const tl = timeline({
      label: `Times ${first} sent`,
      className: 'settle',
      tracks: keys.map((key) => {
        const noon = Date.parse(key + 'T12:00:00Z')
        const ms = t.instant(key, 720, zone)
        return { key, label: t.relativeDay(ms, zone) || t.weekday(noon, 'UTC', 'short'), sub: `${t.shortMonth(noon, 'UTC')} ${Number(key.slice(8))}` }
      }),
      mode: 'clip',
      clipLength: dur,
      keyStep: 5,
      corner: h('span.tl-zone', city(zone)),
      glowLabel: 'Both free',
      layers: (tr) => ({ shade: hoursOn(tr.key), busy: busyOn(tr.key), glow: intersect(theirs(tr.key), free(tr.key)).filter(([a, z]) => z - a >= dur) }),
      strips: { kind: 'guest', get: theirs, set() {}, editable: false },
      clip: { get: () => clip, set: (c) => { clip = c }, place: (key, start) => placeIn(key, start) },
      now: () => { const w = t.wall(Date.now(), zone); return { key: w.key, minute: w.min } },
      onTap: (key, minute) => {
        const c = placeIn(key, Math.round(minute - dur / 2))
        if (!c) { sound.error(); return }
        const prev = clip && clip.key
        clip = c
        if (prev && prev !== key) tl.redrawTrack(prev)
        tl.redrawTrack(key)
        sound.pick()
        paint()
      },
      onLive: paint,
      onChange: paint
    })
    tl.el.style.setProperty('--rows', String(keys.length))
    paint()

    const result = await sheet({
      title: 'Request',
      cancel: 'Close',
      wide: true,
      body: (close) => {
        accept.onclick = () => close('accept')
        requestAnimationFrame(() => requestAnimationFrame(() => { if (clip) tl.reveal(clip.key, clip.start + dur / 2, { center: true, smooth: false }); else tl.scrollToMinute(480) }))
        return [
          h('div.person.row',
            avatar({ key: b.email, name: b.name, size: 48 }),
            h('div', h('b', b.name), h('a', { href: `mailto:${b.email}` }, b.email)),
            h('span.req-event', { style: { '--event': colorOf(b.event.color) } }, h('i.ev-dot'), `${b.event.title} · ${t.minutesLabel(dur)}`)),
          b.notes ? h('div.notes', h('small', 'Notes'), h('p', b.notes)) : null,
          h('div.req-legend', h('span', h('i.key.mine'), `${first}’s times`), h('span', h('i.key.shade'), 'Your hours'), h('span', h('i.key.glow'), 'Both free')),
          h('div.req-tl', tl.el),
          status,
          h('div.sheet-actions', accept, h('button.btn.block.danger', { type: 'button', onclick: () => close('decline') }, ic('x', 18, 2.2), 'Say no')),
          h('p.fine', `${first} gets an email with the invite, or with your note if you say no.`)
        ]
      }
    })
    tl.destroy()
    if (result === 'accept' && clip) {
      const ms = t.instant(clip.key, clip.start, zone)
      try {
        const r = await api.post(`/api/bookings/${b.id}/accept`, { start: ms })
        sound.booked()
        toast(r.emailed ? `Booked. ${first} has the invite.` : 'Booked.')
        afterRequest()
      } catch (error) { failure(error) }
    } else if (result === 'decline') declineRequest(b)
  }

  async function declineRequest(b) {
    const first = b.name.split(' ')[0]
    const reason = h('textarea.input', { rows: '3', maxlength: '500', placeholder: `A note for ${first}, like other times that work (optional)` })
    const ok = await sheet({
      title: '', label: 'Say no', cancel: null, plain: true,
      body: (close) => [
        h('div.confirm-head', h('b', `Say no to ${b.name}?`), h('p', 'They’ll get an email with your note and a link to pick another time.')),
        reason,
        h('div.confirm-actions',
          h('button.btn.large.block.danger-solid', { type: 'button', onclick: () => close(true) }, 'Say no'),
          h('button.btn.large.block', { type: 'button', onclick: () => close(false) }, 'Back'))
      ]
    })
    if (!ok) return
    try {
      const r = await api.post(`/api/bookings/${b.id}/decline`, { reason: reason.value.trim() })
      sound.remove()
      toast(r.emailed ? `Done. ${first} has been told.` : 'Done.')
      afterRequest()
    } catch (error) { failure(error) }
  }

  function afterRequest() {
    s.lists.clear()
    api.get('/api/me').then((r) => { state.me.counts = r.counts; badges() }).catch(() => {})
    if (s.tab === 'bookings') show('bookings', false)
  }

  /* ---- Event types ---------------------------------------------------------- */

  function eventsTab() {
    const grid = h('div.event-grid')
    const box = h('section.tab-page',
      h('div.title-row', h('h1.large-title', 'Event types'), h('button.btn.small.primary', { type: 'button', onclick: () => edit(null) }, ic('plus', 16, 2.4), 'New')),
      h('p.page-sub', 'Each has its own link. Turn one off to hide it.'),
      grid)
    loadEvents(grid)
    return box
  }

  async function loadEvents(grid) {
    if (s.events) drawEvents(grid)
    else fill(grid, skeleton())
    try {
      const r = await api.get('/api/events')
      s.events = r.events
      if (s.tab === 'events') drawEvents(grid)
    } catch (error) { failure(error) }
  }

  function drawEvents(grid) {
    if (!s.events.length) {
      fill(grid, h('div.empty', h('span.empty-icon', ic('layers', 28, 1.8)), h('b', 'No event types'), h('p', 'Add one so people have something to book.'), h('button.btn.small.tinted', { type: 'button', onclick: () => edit(null) }, ic('plus', 15, 2.2), 'New event type')))
      return
    }
    flip(grid, () => fill(grid, s.events.map((e) => eventCard(e))))
  }

  function eventCard(e) {
    const loc = LOCATIONS[e.location.kind] || LOCATIONS.none
    const url = `${pageURL(host().handle)}/${e.slug}`
    const card = h('article.ev-card' + (e.active ? '' : '.off'), { 'data-key': e.id, style: { '--event': colorOf(e.color) } },
      h('button.ev-main', { type: 'button', onclick: () => edit(e), 'aria-label': `Edit ${e.title}` },
        h('span.event-tile', ic(e.location.kind === 'none' ? 'calendar' : loc.icon, 20, 2)),
        h('span.ev-text',
          h('b', e.title),
          h('span.ev-meta', h('span', ic('clock', 14, 2.1), t.minutesLabel(e.duration)), e.location.kind !== 'none' ? h('span', ic(loc.icon, 14, 2.1), e.location.kind === 'place' || e.location.kind === 'custom' ? e.location.value : loc.label) : null),
          h('span.ev-url.trunc', `/@${host().handle}/${e.slug}`))),
      h('div.ev-foot',
        h('button.link-btn', { type: 'button', onclick: () => { copyText(url, 'Link copied'); sound.pop() } }, ic('copy', 15, 2.1), 'Copy link'),
        h('a.link-btn', { href: url, target: '_blank', rel: 'noopener' }, ic('externalLink', 15, 2.1), 'View'),
        h('span.grow'),
        toggle(e.active, async (on) => {
          sound.toggle(on)
          card.classList.toggle('off', !on)
          try {
            const r = await api.patch(`/api/events/${e.id}`, { active: on })
            Object.assign(e, r.event)
          } catch (error) { failure(error); card.classList.toggle('off', on) }
        }, e.active ? `${e.title} is on` : `${e.title} is off`)))
    return card
  }

  async function edit(e) {
    const result = await eventSheet(e, host())
    if (!result) return
    const grid = main.querySelector('.event-grid')
    if (result.deleted) s.events = s.events.filter((x) => x.id !== e.id)
    else if (e) s.events = s.events.map((x) => (x.id === result.id ? result : x))
    else s.events = [...(s.events || []), result]
    if (grid) drawEvents(grid)
  }

  /* ---- Hours ------------------------------------------------------------------ */

  // Your week as tracks: paint when you're free, trim the ends, slide a
  // span along, and it saves as you go.
  function hoursTab() {
    const hst = host()
    const weekly = hst.weekly.map((r) => r.map((x) => x.slice()))
    const overrides = { ...hst.overrides }
    const saved = h('span.saved', { 'aria-live': 'polite' })
    const zoneRow = h('button.row-btn', { type: 'button', onclick: changeZone })
    const paintZone = () => fill(zoneRow, ic('globe', 19, 2), h('span.grow', h('b', city(host().tz)), h('small', `${host().tzLabel} · ${gmt(offsetIn(host().tz, Date.now()))}`)), h('span.row-value.num', t.clock(Date.now(), host().tz)), ic('chevronRight', 17, 2.2))
    paintZone()
    const first = t.weekStart()
    const days = Array.from({ length: 7 }, (_, i) => (first + i) % 7)
    const offList = h('div.group.offs')
    const tools = h('div.week-tools')

    let timer = null
    function save(change, label = 'Saved') {
      clearTimeout(timer)
      fill(saved, h('span.spin.small'), 'Saving')
      saved.className = 'saved show'
      timer = setTimeout(async () => {
        try {
          const r = await api.patch('/api/host', change())
          state.me.host = r.host
          fill(saved, ic('check', 14, 2.6), label)
          saved.className = 'saved show good'
          setTimeout(() => { saved.className = 'saved' }, 1600)
        } catch (error) { saved.className = 'saved'; failure(error) }
      }, 450)
    }
    const saveWeekly = () => save(() => ({ weekly }))
    const saveOffs = () => save(() => ({ overrides }))

    const name = (d) => t.weekday(Date.UTC(2023, 0, 1 + d), 'UTC', 'short')
    const longName = (d) => t.weekday(Date.UTC(2023, 0, 1 + d), 'UTC')
    const summary = (d) => {
      const r = weekly[d]
      if (!r.length) return 'Off'
      const total = r.reduce((n, [a, z]) => n + z - a, 0)
      return `${t.minutesLabel(total).replace(' min', 'm').replace(' h', 'h')}`
    }
    const tracks = () => days.map((d) => ({ key: String(d), label: name(d), sub: summary(d), dim: !weekly[d].length }))

    const tl = timeline({
      label: 'Weekly hours',
      className: 'week',
      tracks: tracks(),
      mode: 'strips',
      corner: h('span.tl-zone', city(host().tz)),
      strips: {
        kind: 'host', step: 15, min: 15, max: 6,
        get: (key) => weekly[Number(key)],
        set: (key, ranges, { live }) => {
          weekly[Number(key)] = ranges.map((r) => r.slice())
          if (!live) { refreshLabels(); saveWeekly() }
        }
      },
      onTap: (key, minute) => {
        const d = Number(key)
        const list = weekly[d]
        if (list.length >= 6) { sound.error(); return }
        let a = Math.max(0, Math.min(DAY - 60, Math.floor((minute - 30) / 30) * 30))
        let z = a + 120
        for (const [p, q] of list) { if (a < q && z > p) { if (minute < p) z = p; else a = q } }
        z = Math.min(z, DAY)
        if (z - a < 30) { sound.error(); return }
        weekly[d] = merge([...list, [a, z]])
        tl.redrawTrack(key)
        tl.select({ key, index: weekly[d].findIndex((r) => r[0] <= a && r[1] >= z) })
        sound.pop()
        refreshLabels()
        saveWeekly()
      },
      onSelect: paintTools,
      onChange: () => paintTools(tl.selected)
    })

    function refreshLabels() {
      for (const row of tl.el.querySelectorAll('.tl-row')) {
        const d = Number(row.dataset.key)
        row.classList.toggle('dim', !weekly[d].length)
        const small = row.querySelector('.tl-label small')
        if (small) small.textContent = summary(d)
      }
    }

    function copyTo(d, targets) {
      for (const x of targets) if (x !== d) { weekly[x] = weekly[d].map((r) => r.slice()); tl.redrawTrack(String(x)) }
      refreshLabels()
      sound.pop()
      saveWeekly()
    }

    function preset(fn) {
      for (let d = 0; d < 7; d++) { weekly[d] = fn(d); tl.redrawTrack(String(d)) }
      tl.select(null)
      refreshLabels()
      sound.pop()
      haptic(8)
      saveWeekly()
    }

    function paintTools(sel) {
      if (sel && weekly[Number(sel.key)][sel.index]) {
        const d = Number(sel.key)
        const [a, z] = weekly[d][sel.index]
        fill(tools,
          h('div.sel-info', h('b', longName(d)), h('span.num', span(a, z))),
          h('button.chip-btn', { type: 'button', onclick: (ev) => menu(ev.currentTarget, [
            { label: 'Copy to weekdays', icon: 'calendar', onclick: () => copyTo(d, [1, 2, 3, 4, 5]) },
            { label: 'Copy to every day', icon: 'calendarDays', onclick: () => copyTo(d, [0, 1, 2, 3, 4, 5, 6]) }
          ], { align: 'end' }) }, ic('copy', 15, 2.2), `Copy ${name(d)}`),
          h('button.chip-btn.danger', { type: 'button', onclick: () => tl.removeSelected() }, ic('trash', 15, 2.2), 'Remove'))
        return
      }
      const ws = (from, to) => (d) => (d >= 1 && d <= 5 ? [[from, to]] : [])
      fill(tools,
        h('button.chip-btn', { type: 'button', onclick: () => preset((d) => (d >= 1 && d <= 5 ? [[540, 720], [780, 1020]] : [])) }, '9 to 5, weekdays'),
        h('button.chip-btn', { type: 'button', onclick: () => preset(ws(540, 720)) }, 'Mornings'),
        h('button.chip-btn', { type: 'button', onclick: () => preset(ws(780, 1080)) }, 'Afternoons'),
        h('button.chip-btn', { type: 'button', onclick: () => preset((d) => [[600, 1200]].filter(() => d >= 1)) }, 'Long days'),
        h('button.chip-btn.quiet', { type: 'button', onclick: () => preset(() => []) }, 'Clear'))
    }
    paintTools(null)
    requestAnimationFrame(() => {
      const earliest = Math.min(...weekly.map((r) => (r[0] ? r[0][0] : DAY)))
      tl.scrollToMinute(Math.max(0, (earliest < DAY ? earliest : 540) - 60))
    })
    leaveTab = () => tl.destroy()

    function drawOffs() {
      const keys = Object.keys(overrides).filter((k) => !overrides[k].length).sort()
      fill(offList,
        keys.length ? keys.map((k) => h('div.off-row', { 'data-key': k },
          ic('calendarOff', 18, 2),
          h('span.grow', h('b', t.fullDate(Date.parse(k + 'T12:00:00Z'), 'UTC'))),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Remove this day off', onclick: () => { delete overrides[k]; sound.remove(); drawOffs(); saveOffs() } }, ic('x', 16, 2.2)))) : h('p.group-empty', 'None coming up.'),
        h('button.row-btn.add', { type: 'button', onclick: addOff }, ic('plus', 18, 2.2), h('span.grow', 'Add a day off')))
    }
    async function addOff() {
      const today = t.dayKey(Date.now(), host().tz)
      const input = h('input.input.date-input', { type: 'date', min: today, value: today })
      const ok = await sheet({ title: 'Day off', done: 'Add', body: () => [h('p.sheet-lead', 'Nobody can book you that day, whatever your weekly hours say.'), input], onDone: (close) => { if (input.value) close(true); else nope(input) } })
      if (!ok || !input.value) return
      overrides[input.value] = []
      sound.pop()
      drawOffs()
      saveOffs()
    }
    drawOffs()

    async function changeZone() {
      const z = await zonePicker(host().tz, { title: 'Your time zone' })
      if (!z || z === host().tz) return
      try {
        const r = await api.patch('/api/host', zonePayload(z))
        state.me.host = r.host
        paintZone()
        toast(`Hours now in ${city(z)} time`)
        s.lists.clear()
        const corner = tl.el.querySelector('.tl-zone')
        if (corner) corner.textContent = city(z)
      } catch (error) { failure(error) }
    }

    return h('section.tab-page.hours-page',
      h('div.title-row', h('h1.large-title', 'Availability'), saved),
      h('p.page-sub', wide() ? 'Drag along a day to paint when you’re free. Drag the ends to trim, the middle to slide. Guests see it in their own time.' : 'Hold and drag along a day to paint when you’re free, or tap a day to add two hours. Drag the ends to trim.'),
      h('div.week-card', tools, tl.el),
      h('h2.group-title', 'Time zone'),
      h('div.group', zoneRow),
      h('h2.group-title', 'Days off'),
      offList)
  }

  /* ---- Insights ------------------------------------------------------------------ */

  function insightsTab() {
    const view = insights({ host, days: s.statsDays, onDays: (d) => { s.statsDays = d } })
    leaveTab = view.leave
    return view.el
  }

  /* ---- Start -------------------------------------------------------------------- */

  paintLink()
  show(tab, false)

  // Keep the zone table fresh: it covers about 15 months from when it was made.
  const hst = host()
  if (!hst.tableEnd || hst.tableEnd < Date.now() + 300 * 86400000) {
    api.patch('/api/host', zonePayload(hst.tz)).then((r) => { state.me.host = r.host }).catch(() => {})
  }
  const onVisible = () => { if (!document.hidden && s.tab === 'bookings') { s.lists.clear(); show('bookings', false) } }
  document.addEventListener('visibilitychange', onVisible)
  // The badge on Bookings counts the next 24 hours and any requests waiting.
  api.get('/api/bookings?view=upcoming').then((r) => { s.lists.set('upcoming', r.bookings); badges() }).catch(() => {})

  return {
    el,
    tabs(path) {
      const x = TABS.find((y) => y.path === path)
      if (!x) return false
      if (x.id !== s.tab) show(x.id)
      return true
    },
    leave() { document.removeEventListener('visibilitychange', onVisible); if (leaveTab) leaveTab() },
    clock() { show(s.tab, false) },
    refresh() { paintLink(); show(s.tab, false) }
  }
}
