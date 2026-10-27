// The host's side: bookings, event types and hours. A tab bar on a phone,
// a sidebar with your link on a wide screen. Changes save as you make them.
import { h, ic, fill, avatar, sheet, menu, segmented, toggle, toast, haptic, copyText, flip, nope, collapsing, reduced } from '../ui.js'
import * as api from '../api.js'
import { state, topBar, go, failure, prettyURL, pageURL, share } from '../shell.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { zonePayload, city, gmt, offsetIn } from '../zones.js'
import { zonePicker } from './zone-picker.js'
import { colorOf, LOCATIONS, placeLine, metaRow } from './common.js'
import { eventSheet } from './event-sheet.js'

const TABS = [
  { id: 'bookings', path: '/', label: 'Bookings', icon: 'calendarCheck' },
  { id: 'events', path: '/events', label: 'Event types', short: 'Events', icon: 'layers' },
  { id: 'hours', path: '/hours', label: 'Availability', short: 'Hours', icon: 'clock' }
]

export function dash(tab) {
  const host = () => state.me.host
  const s = { tab, view: 'upcoming', lists: new Map(), events: null, saving: null }
  const main = h('div.panel.dash-main')
  const navButtons = new Map()
  const tabButtons = new Map()
  const linkText = h('span.link-text')
  const side = h('nav.side', { 'aria-label': 'Kalendar' },
    h('div.side-link',
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
    const b = h('button.tab', { type: 'button', onclick: () => switchTo(x.id) }, h('span.tab-icon', ic(x.icon, 23, 1.9)), h('span', x.short || x.label))
    tabButtons.set(x.id, b)
    return b
  }))
  const shareBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Share your link', onclick: () => share(host().handle) }, ic('share', 19, 2))
  const bar = topBar({ right: [shareBtn] })
  const el = h('div.app.dash', bar, h('div.dash-body', side, main), tabbar)
  collapsing(bar, main)

  function paintLink() { fill(linkText, `${location.host}/`, h('wbr'), `@${host().handle}`) }

  function switchTo(id) {
    if (id === s.tab) { main.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return }
    haptic(5)
    sound.tap()
    go(TABS.find((x) => x.id === id).path)
  }

  function show(id, animate = true) {
    s.tab = id
    el.dataset.tab = id
    for (const [k, b] of navButtons) b.classList.toggle('on', k === id)
    for (const [k, b] of tabButtons) { b.classList.toggle('on', k === id); b.setAttribute('aria-current', k === id ? 'page' : 'false') }
    const title = TABS.find((x) => x.id === id).label
    document.title = `${title} · Kalendar`
    bar.querySelector('.top-title') || bar.insertBefore(h('div.top-title.small-title'), bar.querySelector('.top-r'))
    bar.querySelector('.top-title').textContent = title
    const content = { bookings: bookingsTab, events: eventsTab, hours: hoursTab }[id]()
    fill(main, content)
    main.scrollTop = 0
    if (animate && !reduced()) content.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  function badge(n) {
    const b = navButtons.get('bookings').querySelector('.badge')
    b.hidden = !n
    b.textContent = String(n)
  }

  /* ---- Bookings ----------------------------------------------------------- */

  function bookingsTab() {
    const list = h('div.booking-list')
    const seg = segmented([
      { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'cancelled', label: 'Cancelled' }
    ], s.view, (v) => { s.view = v; sound.tap(); load(list, true) }, { label: 'Which bookings' })
    const box = h('section.tab-page',
      h('h1.large-title', 'Bookings'),
      h('div.mobile-link.only-narrow',
        h('div.grow', h('small', 'Your link'), h('span.link-text', prettyURL(host().handle))),
        h('button.icon-btn.tinted', { type: 'button', 'aria-label': 'Copy your link', onclick: () => { copyText(pageURL(host().handle), 'Link copied'); sound.pop() } }, ic('copy', 18, 2))),
      h('div.seg-wrap', seg),
      list)
    load(list, false)
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
      if (view === 'upcoming') badge(r.bookings.filter((b) => b.start < Date.now() + 86400000).length)
      if (s.view === view && s.tab === 'bookings') draw(list, r.bookings, view, animate && !cached)
    } catch (error) {
      if (!cached) fill(list, h('div.empty', ic('circleAlert', 26, 1.8), h('b', 'Can’t load bookings'), h('p', error.message), h('button.btn.small', { type: 'button', onclick: () => load(list, true) }, 'Try again')))
    }
  }

  const skeleton = () => h('div.skeleton', [0, 1, 2].map(() => h('div.sk-row', h('span'), h('span'), h('span'))))

  function draw(list, bookings, view, animate) {
    if (!bookings.length) {
      const copy = {
        upcoming: ['calendarCheck', 'No bookings yet', 'Share your link. New bookings show up here, and in your email.'],
        past: ['calendar', 'Nothing in the past', 'Meetings you’ve had will be listed here.'],
        cancelled: ['calendarX', 'Nothing cancelled', 'Good news.']
      }[view]
      fill(list, h('div.empty', h('span.empty-icon', ic(copy[0], 28, 1.8)), h('b', copy[1]), h('p', copy[2]),
        view === 'upcoming' ? h('button.btn.small.tinted', { type: 'button', onclick: () => share(host().handle) }, ic('share', 15, 2.2), 'Share your link') : null))
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
      h('div.next-main', avatar({ key: b.email, name: b.name, size: 44 }), h('div', h('b.trunc', b.name), h('span.trunc', `${b.event.title}${place ? ' · ' + place.text : ''}`))))
  }

  function row(b, i) {
    const zone = host().tz
    const start = t.clockParts(b.start, zone)
    const now = Date.now()
    const live = b.status === 'confirmed' && b.start <= now && b.end > now
    const place = placeLine(b.location, host().name, { revealed: true, phone: b.phone })
    return h('button.booking-row' + (b.status === 'cancelled' ? '.off' : ''), { type: 'button', style: { '--event': colorOf(b.event.color), '--i': String(Math.min(i, 10)) }, onclick: () => bookingSheet(b) },
      h('span.when', h('b.num', start.main, start.period ? h('small', start.period) : null), h('span.num', t.clock(b.end, zone))),
      h('span.bar'),
      h('span.who', h('b.trunc', b.name), h('span.trunc', b.event.title, place ? ` · ${place.text}` : '')),
      live ? h('span.live', 'Now') : b.rescheduledFrom && b.status === 'confirmed' ? h('span.tag', 'Moved') : null,
      ic('chevronRight', 17, 2.2))
  }

  async function bookingSheet(b) {
    haptic()
    const zone = host().tz
    const theirs = b.tz && b.tz !== zone ? `${t.clock(b.start, b.tz)} for them · ${city(b.tz)}` : null
    const place = placeLine(b.location, host().name, { revealed: true, phone: b.phone })
    const cancelled = b.status === 'cancelled'
    const result = await sheet({
      title: b.event.title,
      cancel: 'Close',
      body: (close) => [
        h('div.person',
          avatar({ key: b.email, name: b.name, size: 64, cls: '.big' }),
          h('b', b.name),
          h('a', { href: `mailto:${b.email}` }, b.email),
          cancelled ? h('span.status.off', b.rescheduledTo ? 'Moved' : b.cancelledBy === 'host' ? 'You cancelled' : 'They cancelled') : null),
        h('ul.meta.card' + (cancelled ? '.struck' : ''), { style: { '--event': colorOf(b.event.color) } },
          metaRow('calendar', t.fullDate(b.start, zone)),
          metaRow('clock', t.range(b.start, b.end, zone), theirs),
          place ? metaRow(place.icon, place.text, place.sub, place.href) : null,
          b.phone && b.location.kind !== 'phone' ? metaRow('phone', b.phone, null, `tel:${b.phone}`) : null),
        b.notes ? h('div.notes', h('small', 'Notes'), h('p', b.notes)) : null,
        b.reason ? h('div.notes', h('small', 'Why it was cancelled'), h('p', b.reason)) : null,
        h('div.sheet-actions',
          h('a.btn.block', { href: `mailto:${b.email}?subject=${encodeURIComponent(b.event.title)}` }, ic('mail', 18, 2), `Email ${b.name.split(' ')[0]}`),
          !cancelled && b.end > Date.now() ? h('button.btn.block.danger', { type: 'button', onclick: () => close('cancel') }, ic('calendarX', 18, 2), 'Cancel booking') : null),
        h('p.fine', `Booked ${t.shortDay(b.createdAt, zone)} at ${t.clock(b.createdAt, zone)}`)
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
        h('span.ev-stripe'),
        h('b', e.title),
        h('span.ev-meta', h('span', ic('clock', 14, 2.1), t.minutesLabel(e.duration)), e.location.kind !== 'none' ? h('span', ic(loc.icon, 14, 2.1), e.location.kind === 'place' || e.location.kind === 'custom' ? e.location.value : loc.label) : null),
        h('span.ev-url.trunc', `/@${host().handle}/${e.slug}`)),
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
    const dayRows = h('div.group.days')
    const offList = h('div.group.offs')

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

    const OPTIONS = Array.from({ length: 97 }, (_, i) => i * 15)
    const label = (min) => (min === 1440 ? 'Midnight' : t.minuteClock(min))
    function timeSelect(value, min, max, onchange, aria) {
      const sel = h('select.time-select.num', { 'aria-label': aria }, OPTIONS.filter((m) => m >= min && m <= max).map((m) => h('option', { value: String(m), selected: m === value }, label(m))))
      sel.addEventListener('change', () => { onchange(Number(sel.value)); sound.tap() })
      return sel
    }

    function drawDay(d) {
      const ranges = weekly[d]
      const name = t.weekday(Date.UTC(2023, 0, 1 + d), 'UTC')
      const on = ranges.length > 0
      const sw = toggle(on, (v) => {
        weekly[d] = v ? [[540, 1020]] : []
        sound.toggle(v)
        haptic(5)
        redrawDay(d)
        saveWeekly()
      }, `${name} available`)
      const rangesBox = h('div.ranges',
        on ? ranges.map((r, i) => h('div.range',
          timeSelect(r[0], 0, r[1] - 15, (v) => { r[0] = v; saveWeekly() }, `${name} from`),
          h('span.dash-sep', '–'),
          timeSelect(r[1], r[0] + 15, 1440, (v) => { r[1] = v; saveWeekly() }, `${name} until`),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Remove these hours', onclick: () => { ranges.splice(i, 1); sound.remove(); redrawDay(d); saveWeekly() } }, ic('x', 16, 2.2)))) : h('span.unavailable', 'Unavailable'),
        on ? h('div.range-tools',
          ranges.length < 6 && ranges[ranges.length - 1][1] <= 1380 ? h('button.link-btn', { type: 'button', onclick: () => { const last = ranges[ranges.length - 1]; ranges.push([last[1] + 60 > 1425 ? last[1] : last[1] + 60, Math.min(1440, last[1] + 120)]); sound.pop(); redrawDay(d); saveWeekly() } }, ic('plus', 15, 2.2), 'Add hours') : null,
          h('button.link-btn', { type: 'button', onclick: (ev) => copyMenu(ev.currentTarget, d) }, ic('copy', 14, 2.2), 'Copy to…')) : null)
      return h('div.day-row' + (on ? '' : '.off'), { 'data-day': String(d) }, h('b.day-name', name), rangesBox, sw)
    }
    function redrawDay(d) {
      const old = dayRows.querySelector(`[data-day="${d}"]`)
      old.replaceWith(drawDay(d))
    }
    function copyMenu(anchor, d) {
      menu(anchor, [
        { label: 'Copy to weekdays', icon: 'calendar', onclick: () => copyTo(d, [1, 2, 3, 4, 5]) },
        { label: 'Copy to every day', icon: 'calendarDays', onclick: () => copyTo(d, [0, 1, 2, 3, 4, 5, 6]) }
      ], { align: 'start' })
    }
    function copyTo(d, targets) {
      for (const x of targets) if (x !== d) { weekly[x] = weekly[d].map((r) => r.slice()); redrawDay(x) }
      sound.pop()
      saveWeekly()
    }
    fill(dayRows, days.map(drawDay))

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
      } catch (error) { failure(error) }
    }

    return h('section.tab-page',
      h('div.title-row', h('h1.large-title', 'Availability'), saved),
      h('p.page-sub', 'When people can book you. Times are in your zone; guests see theirs.'),
      h('h2.group-title', 'Time zone'),
      h('div.group', zoneRow),
      h('h2.group-title', 'Weekly hours'),
      dayRows,
      h('h2.group-title', 'Days off'),
      offList)
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
  // The badge on Bookings counts the next 24 hours.
  api.get('/api/bookings?view=upcoming').then((r) => { s.lists.set('upcoming', r.bookings); badge(r.bookings.filter((b) => b.start < Date.now() + 86400000).length) }).catch(() => {})

  return {
    el,
    tabs(path) {
      const x = TABS.find((y) => y.path === path)
      if (!x) return false
      if (x.id !== s.tab) show(x.id)
      return true
    },
    leave() { document.removeEventListener('visibilitychange', onVisible) },
    clock() { show(s.tab, false) },
    refresh() { paintLink(); show(s.tab, false) }
  }
}
