// Booking: pick a day, then a time, then say who you are. No account.
// On a wide screen the host and event sit on the left, the month in the
// middle, and the day's times slide in on the right. On a phone each step
// is its own screen, pushed in from the right, with Back and swipe-back.
import { h, fill, ic, avatar, toast, haptic, nope, reduced, wide } from '../ui.js'
import * as api from '../api.js'
import { state, topBar, go, link, failure, holmFooter, signIn } from '../shell.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { here, zoneName, gmt, offsetIn, city } from '../zones.js'
import { zonePicker } from './zone-picker.js'
import { colorOf, placeLine, metaRow, calendarButtons, doneMark, field } from './common.js'
import { missingHost } from './missing.js'

const ZONE_KEY = 'kalendar:zone'
const ME_KEY = 'kalendar:invitee'
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

  const s = {
    zone: savedZone() || here(),
    year: 0, month: 0,
    months: new Map(),
    day: null, slot: null,
    step: 'day',
    until: Infinity,
    busy: false
  }
  const now = new Date()
  {
    const k = t.dayKey(now.getTime(), s.zone).split('-').map(Number)
    s.year = k[0]
    s.month = k[1] - 1
  }
  const first = t.weekStart()

  /* ---- Structure ---------------------------------------------------- */

  const color = colorOf(event.color)
  const place = placeLine(event.location, host.name)
  const chosen = h('div.chosen', { hidden: true })
  const info = h('aside.book-info',
    link(`/@${host.handle}`, { class: 'host-line' }, avatar({ key: host.handle, name: host.name, picture: host.picture, size: 28 }), h('span', host.name)),
    h('h1.event-title', event.title),
    h('ul.meta',
      metaRow('clock', t.minutesLabel(event.duration)),
      place ? metaRow(place.icon, place.text, place.sub) : null),
    event.description ? h('p.event-desc', event.description) : null,
    old ? h('div.moving', ic('repeat', 16, 2), h('div', h('b', 'Moving your booking'), h('span', `${t.fullDate(old.start, s.zone)}, ${t.range(old.start, old.end, s.zone)}`))) : null,
    chosen)

  const monthTitle = h('h3.month-title', { id: 'month-title', 'aria-live': 'polite' })
  const prev = h('button.round-btn', { type: 'button', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, ic('chevronLeft', 20, 2.2))
  const next = h('button.round-btn', { type: 'button', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, ic('chevronRight', 20, 2.2))
  const grid = h('div.grid', { role: 'grid', 'aria-labelledby': 'month-title' })
  const note = h('div.month-note', { hidden: true })
  const zoneBtn = h('button.zone-btn', { type: 'button', onclick: pickZone })
  const clockSeg = h('div.clock-seg', { role: 'group', 'aria-label': 'Clock' },
    h('button', { type: 'button', 'data-v': '12', onclick: () => setClock(false) }, 'am/pm'),
    h('button', { type: 'button', 'data-v': '24', onclick: () => setClock(true) }, '24h'))
  const pick = h('section.book-pick', { 'aria-label': 'Pick a day' },
    h('h2.step-title', 'Pick a day'),
    h('div.month-head', monthTitle, h('div.month-nav', prev, next)),
    h('div.weekdays', { 'aria-hidden': 'true' }, t.weekLetters(first, 'short').map((d) => h('span', d.slice(0, 3)))),
    h('div.grid-wrap', grid, note),
    h('div.zone-line', zoneBtn, clockSeg))

  const timesTitle = h('h2.times-title')
  const timesList = h('div.times', { role: 'listbox', 'aria-label': 'Times' })
  const dayPrev = h('button.round-btn.small', { type: 'button', 'aria-label': 'Previous day with times', onclick: () => stepDay(-1) }, ic('chevronLeft', 18, 2.2))
  const dayNext = h('button.round-btn.small', { type: 'button', 'aria-label': 'Next day with times', onclick: () => stepDay(1) }, ic('chevronRight', 18, 2.2))
  const times = h('section.book-times', { 'aria-label': 'Pick a time' },
    h('div.times-head', h('button.back-btn.only-narrow', { type: 'button', 'aria-label': 'Back to the calendar', onclick: () => history.back() }, ic('chevronLeft', 22, 2.2)), timesTitle, h('div.day-nav.only-narrow', dayPrev, dayNext)),
    h('p.times-zone.only-narrow'),
    timesList)

  const details = h('section.book-details', { 'aria-label': 'Your details' })
  const done = h('section.book-done', { 'aria-live': 'polite' })

  const card = h('div.book-card', { style: { '--event': color } }, info, pick, times, details, done)
  const root = h('main.book', { 'data-step': 'day' }, card, h('div.book-foot', h('span', 'Booking with ', h('b', 'Kalendar')), h('span.dot', '·'), state.me && state.me.host ? link('/', {}, 'Your dashboard') : h('a', { href: '#', onclick: (e) => { e.preventDefault(); state.me && state.me.member ? go('/') : signIn() } }, 'Get your own link')))
  const panel = h('div.panel.book-panel', root, holmFooter())
  const el = h('div.app.public', topBar({ left: link(`/@${host.handle}`, { class: 'top-host', 'aria-label': `${host.name}’s page` }, ic('chevronLeft', 20, 2.2), h('span', host.name)) }), panel)
  swipeBack(card)

  /* ---- Months and slots ------------------------------------------------- */

  const mkey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`

  function loadMonth(y, m) {
    const key = mkey(y, m)
    if (s.months.has(key)) return s.months.get(key).promise
    const from = Date.UTC(y, m, 1) - 15 * 3600000
    const to = Date.UTC(y, m + 1, 1) + 15 * 3600000
    const entry = { status: 'loading', slots: [], byDay: new Map() }
    const skip = old ? `&skip=${enc(old.id)}&t=${enc(moving.token)}` : ''
    entry.promise = api.get(`/api/u/${enc(host.handle)}/${enc(event.slug)}/slots?from=${from}&to=${to}${skip}`).then((r) => {
      entry.status = 'ready'
      entry.slots = r.slots
      s.until = r.until
      group(entry, key)
      return entry
    }, (error) => {
      entry.status = 'error'
      s.months.delete(key)
      throw error
    })
    s.months.set(key, entry)
    return entry.promise
  }

  function group(entry, key) {
    entry.byDay = new Map()
    for (const ms of entry.slots) {
      const d = t.dayKey(ms, s.zone)
      if (!d.startsWith(key)) continue
      if (!entry.byDay.has(d)) entry.byDay.set(d, [])
      entry.byDay.get(d).push(ms)
    }
  }

  const monthEntry = () => s.months.get(mkey(s.year, s.month))
  const slotsOn = (day) => {
    const e = s.months.get(day.slice(0, 7))
    return e && e.byDay.get(day) || []
  }

  /* ---- Drawing the month ---------------------------------------------- */

  function drawMonth(dir = 0) {
    const entry = monthEntry()
    monthTitle.replaceChildren(h('b', t.monthName(s.year, s.month)), ' ', h('span', String(s.year)))
    const today = t.dayKey(Date.now(), s.zone)
    const thisMonth = today.slice(0, 7)
    prev.disabled = mkey(s.year, s.month) <= thisMonth
    next.disabled = Date.UTC(s.year, s.month + 1, 1) - 14 * 3600000 > s.until
    const lead = (new Date(Date.UTC(s.year, s.month, 1)).getUTCDay() - first + 7) % 7
    const days = new Date(Date.UTC(s.year, s.month + 1, 0)).getUTCDate()
    const ready = entry && entry.status === 'ready'
    const cells = []
    for (let i = 0; i < lead; i++) cells.push(h('span.cell.blank', { 'aria-hidden': 'true' }))
    let open = 0
    for (let d = 1; d <= days; d++) {
      const key = t.keyOf(s.year, s.month, d)
      const count = ready ? (entry.byDay.get(key) || []).length : 0
      if (count) open++
      const label = `${t.fullDate(Date.UTC(s.year, s.month, d, 12), 'UTC')}${count ? `, ${count} ${count === 1 ? 'time' : 'times'}` : ', no times'}`
      const b = h('button.cell' + (count ? '.open' : '') + (key === today ? '.today' : '') + (key === s.day ? '.on' : '') + (key < today ? '.past' : ''), {
        type: 'button', 'data-day': key, 'aria-label': label, 'aria-pressed': String(key === s.day), disabled: !count, tabindex: key === (s.day || firstOpenKey(entry) || today) ? '0' : '-1',
        style: { '--i': String(d) }
      }, h('span', String(d)))
      b.addEventListener('click', () => chooseDay(key))
      cells.push(b)
    }
    grid.classList.toggle('loading', !ready)
    const swap = () => fill(grid, cells)
    if (dir && !reduced()) {
      grid.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }], { duration: 120, easing: 'ease-in' }).finished.then(() => {
        swap()
        grid.animate([{ opacity: 0, transform: `translateX(${dir * 22}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' })
      })
    } else swap()
    // A month with nothing open says so and offers the next open day.
    note.hidden = !ready || open > 0
    if (ready && !open) {
      fill(note, h('p', h('b', `No open times in ${t.monthName(s.year, s.month)}`)), h('button.pill-btn', { type: 'button', onclick: findNext }, 'Next open day', ic('arrowRight', 16, 2.2)))
      if (next.disabled) fill(note, h('p', h('b', 'Nothing open right now'), h('span', `${host.name} has no open times for this. Check back later.`)))
    }
  }

  function firstOpenKey(entry) {
    if (!entry || entry.status !== 'ready') return null
    return [...entry.byDay.keys()].sort()[0] || null
  }

  async function showMonth(y, m, dir = 0) {
    s.year = y
    s.month = m
    drawMonth(dir)
    try {
      await loadMonth(y, m)
      if (s.year === y && s.month === m) drawMonth()
      // Fetch the next month quietly so the arrow answers at once.
      const n = m === 11 ? [y + 1, 0] : [y, m + 1]
      if (Date.UTC(n[0], n[1], 1) < s.until) loadMonth(n[0], n[1]).catch(() => {})
    } catch (error) {
      failure(error)
    }
  }

  function shiftMonth(by) {
    let m = s.month + by
    let y = s.year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    sound.flip()
    showMonth(y, m, by)
  }

  async function findNext() {
    let y = s.year
    let m = s.month
    for (let i = 0; i < 13; i++) {
      m++
      if (m > 11) { m = 0; y++ }
      if (Date.UTC(y, m, 1) - 14 * 3600000 > s.until) break
      const entry = await loadMonth(y, m).catch(() => null)
      const key = firstOpenKey(entry)
      if (key) {
        await showMonth(y, m, 1)
        chooseDay(key)
        return
      }
    }
    toast('Nothing open further ahead.', { kind: 'info' })
  }

  /* ---- Days and times ----------------------------------------------------- */

  function chooseDay(key, { push = true } = {}) {
    const list = slotsOn(key)
    if (!list.length) return
    const changed = s.day !== key
    s.day = key
    s.slot = null
    sound.tap()
    haptic(6)
    for (const c of grid.querySelectorAll('.cell')) {
      const on = c.dataset.day === key
      c.classList.toggle('on', on)
      c.setAttribute('aria-pressed', String(on))
      c.tabIndex = on ? 0 : -1
    }
    drawTimes(changed)
    root.classList.add('has-day')
    paintChosen()
    if (!wide() && push) setStep('time')
  }

  function stepDay(by) {
    const keys = [...s.months.values()].flatMap((e) => [...e.byDay.keys()]).sort()
    const i = keys.indexOf(s.day)
    const key = keys[i + by]
    if (!key) { nope(by < 0 ? dayPrev : dayNext); return }
    const [y, m] = key.split('-').map(Number)
    if (y !== s.year || m - 1 !== s.month) showMonth(y, m - 1, by)
    chooseDay(key, { push: false })
  }

  function drawTimes(animate) {
    if (!s.day) return
    const list = slotsOn(s.day)
    const noon = Date.parse(s.day + 'T12:00:00Z')
    timesTitle.replaceChildren(h('b', t.weekday(noon, 'UTC')), ' ', h('span', t.monthDay(noon, 'UTC')))
    times.querySelector('.times-zone').textContent = `${event.title} · ${t.minutesLabel(event.duration)} · ${zoneName(s.zone)}`
    const keys = [...s.months.values()].flatMap((e) => [...e.byDay.keys()]).sort()
    dayPrev.disabled = keys.indexOf(s.day) <= 0
    dayNext.disabled = keys.indexOf(s.day) >= keys.length - 1
    fill(timesList, list.map((ms, i) => slotButton(ms, i)))
    timesList.scrollTop = 0
    if (animate && !reduced()) {
      timesList.classList.remove('enter')
      void timesList.offsetWidth
      timesList.classList.add('enter')
    }
  }

  function slotButton(ms, i) {
    const { main, period } = t.clockParts(ms, s.zone)
    const on = s.slot === ms
    const label = h('button.slot-time', { type: 'button', role: 'option', 'aria-selected': String(on), onclick: () => chooseSlot(ms) },
      h('span.num', main), period ? h('small', period) : null)
    const nextBtn = h('button.slot-next', { type: 'button', tabindex: on ? '0' : '-1', 'aria-hidden': String(!on), onclick: () => toDetails() }, 'Next')
    return h('div.slot' + (on ? '.on' : ''), { 'data-ms': String(ms), style: { '--i': String(Math.min(i, 14)) } }, label, nextBtn)
  }

  function chooseSlot(ms) {
    if (s.slot === ms) { toDetails(); return }
    s.slot = ms
    sound.pick()
    haptic(8)
    for (const row of timesList.querySelectorAll('.slot')) {
      const on = Number(row.dataset.ms) === ms
      row.classList.toggle('on', on)
      row.querySelector('.slot-time').setAttribute('aria-selected', String(on))
      const n = row.querySelector('.slot-next')
      n.tabIndex = on ? 0 : -1
      n.setAttribute('aria-hidden', String(!on))
    }
    paintChosen()
  }

  function paintChosen() {
    if (!s.slot) { chosen.hidden = true; return }
    const end = s.slot + event.duration * 60000
    fill(chosen, ic('calendarCheck', 18, 2), h('div', h('b', t.range(s.slot, end, s.zone)), h('span', t.fullDate(s.slot, s.zone))))
    chosen.hidden = false
  }

  /* ---- Steps ----------------------------------------------------------------- */

  function setStep(step, { push = true, dir = 'forward' } = {}) {
    if (s.step === step) return
    const change = () => {
      s.step = step
      root.dataset.step = step
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
    if (!s.slot) return
    api.prepare('bookings.create')
    setStep('details')
  }

  /* ---- Details --------------------------------------------------------------- */

  function drawDetails() {
    const me = state.me && state.me.member
    const last = remembered()
    const name = h('input.input', { name: 'name', autocomplete: 'name', required: true, maxlength: '80', value: (old && old.name) || (me && me.name) || last.name || '', placeholder: 'Jane Appleseed' })
    const email = h('input.input', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: '200', value: (old && old.email) || (me && me.email) || last.email || '', placeholder: 'jane@example.com' })
    const phone = h('input.input', { name: 'phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '32', value: (old && old.phone) || last.phone || '', placeholder: '+1 555 010 0199' })
    const notes = h('textarea.input', { name: 'notes', rows: '3', maxlength: '1000', placeholder: 'Anything that helps prepare' })
    const f = {
      name: field({ label: 'Name', input: name }),
      email: field({ label: 'Email', input: email, hint: 'Your invite goes here.' }),
      phone: event.location.kind === 'phone' ? field({ label: 'Phone number', input: phone, hint: `${host.name} will call you on it.` }) : null,
      notes: field({ label: 'Notes', input: notes, hint: `Only ${host.name} sees these.` })
    }
    const submit = h('button.btn.primary.large.block', { type: 'submit' }, h('span', old ? 'Move booking' : 'Book it'))
    const end = s.slot + event.duration * 60000
    const form = h('form.details-form', { novalidate: true },
      h('div.details-head',
        h('button.back-btn', { type: 'button', 'aria-label': 'Back to times', onclick: () => history.back() }, ic('chevronLeft', 22, 2.2)),
        h('h2.step-title', old ? 'Confirm the new time' : 'Almost there')),
      h('div.summary', { style: { '--event': color } },
        h('span.summary-bar'),
        h('div', h('b', event.title), h('span', `${t.fullDate(s.slot, s.zone)}`), h('span.num', `${t.range(s.slot, end, s.zone)} · ${city(s.zone)}`)),
        h('button.link-btn', { type: 'button', onclick: () => history.back() }, 'Change')),
      f.name, f.email, f.phone, f.notes,
      submit,
      h('p.fine', 'No account needed. You’ll get an email with a calendar invite and a link to change or cancel.'))
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      confirm({ form, f, inputs: { name, email, phone, notes }, submit })
    })
    fill(details, form)
    if (wide()) requestAnimationFrame(() => (name.value ? (email.value ? notes : email) : name).focus({ preventScroll: true }))
  }

  async function confirm({ f, inputs, submit }) {
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
    fill(submit, h('span.spin'), h('span', old ? 'Moving…' : 'Booking…'))
    const input = {
      handle: host.handle, event: event.slug, start: s.slot,
      name: inputs.name.value.trim(), email: inputs.email.value.trim(), notes: inputs.notes.value.trim(),
      tz: s.zone, tzLabel: zoneName(s.zone, s.slot), offset: offsetIn(s.zone, s.slot), h24: t.clock24()
    }
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
      fill(submit, h('span', old ? 'Move booking' : 'Book it'))
      if (error.status === 409) {
        // Someone took it first: back to the times, without it.
        toast(error.message, { kind: 'bad' })
        sound.error()
        s.months.clear()
        s.slot = null
        await loadMonth(s.year, s.month).catch(() => {})
        drawMonth()
        if (s.day && slotsOn(s.day).length) drawTimes(true)
        else { s.day = null; root.classList.remove('has-day') }
        paintChosen()
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
    const where = placeLine(b.location, host.name, { revealed: true, phone: b.phone })
    const emailed = result.emailed && result.emailed.invitee
    fill(done,
      doneMark('good'),
      h('h1.done-title', old ? 'Booking moved' : 'You’re booked'),
      h('p.done-lead', emailed ? ['An invite is on its way to ', h('b', b.email), '.'] : 'Add it to your calendar below. We couldn’t send the email just now.'),
      h('div.ticket', { style: { '--event': color } },
        h('div.ticket-head', avatar({ key: host.handle, name: host.name, picture: host.picture, size: 40 }), h('div', h('b', b.event.title), h('span', `with ${host.name}`))),
        h('ul.meta',
          metaRow('calendar', t.fullDate(b.start, s.zone)),
          metaRow('clock', t.range(b.start, b.end, s.zone), `${zoneName(s.zone, b.start)} · ${gmt(offsetIn(s.zone, b.start))}`),
          where ? metaRow(where.icon, where.text, where.sub, where.href) : null)),
      h('p.cal-label', 'Add to your calendar'),
      calendarButtons(b.links),
      h('div.done-links',
        h('a', { href: b.links.reschedule, onclick: (e) => { e.preventDefault(); location.href = b.links.reschedule } }, 'Reschedule'),
        h('span.dot', '·'),
        h('a', { href: b.links.manage, onclick: (e) => { e.preventDefault(); go(new URL(b.links.manage).pathname + new URL(b.links.manage).search) } }, 'Cancel')),
      !(state.me && state.me.host) ? h('div.promo', ic('sparkles', 18, 2), h('div', h('b', 'Want a page like this?'), h('span', 'Share one link and let people book you.')), h('button.btn.small.tinted', { type: 'button', onclick: () => (state.me && state.me.member ? go('/') : signIn()) }, 'Get yours')) : null)
    // Replace the steps in history: Back from here shouldn't rebook.
    history.replaceState({ page: location.pathname, step: 'done' }, '', `/@${host.handle}/${event.slug}`)
    setStep('done', { push: false })
    sound.booked()
    haptic(14)
  }

  /* ---- Zone and clock ---------------------------------------------------------- */

  function paintZone() {
    fill(zoneBtn, ic('globe', 16, 2), h('span', zoneName(s.zone, Date.now(), 'longGeneric')), h('span.zone-time.num', t.clock(Date.now(), s.zone)), ic('chevronDown', 15, 2.2))
    for (const b of clockSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.v === '24') === t.clock24()))
  }

  async function pickZone() {
    const zone = await zonePicker(s.zone)
    if (!zone || zone === s.zone) return
    s.zone = zone
    try { localStorage.setItem(ZONE_KEY, zone) } catch {}
    for (const [key, entry] of s.months) if (entry.status === 'ready') group(entry, key)
    paintZone()
    if (s.day && !slotsOn(s.day).length) { s.day = null; s.slot = null; root.classList.remove('has-day') }
    drawMonth()
    drawTimes(true)
    paintChosen()
  }

  function setClock(v) {
    if (v === t.clock24()) return
    t.setClock24(v)
    sound.tap()
    redrawClocks()
  }

  function redrawClocks() {
    paintZone()
    drawTimes(false)
    paintChosen()
    if (s.step === 'details') drawDetails()
  }

  /* ---- Keyboard in the month ----------------------------------------------------- */

  grid.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.cell')
    if (!cell) return
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(e.key in moves)) return
    e.preventDefault()
    const cells = [...grid.querySelectorAll('.cell:not(.blank)')]
    let i = cells.indexOf(cell) + moves[e.key]
    while (cells[i] && cells[i].disabled) i += Math.sign(moves[e.key])
    if (cells[i]) { cells[i].tabIndex = 0; cell.tabIndex = -1; cells[i].focus() } else if (!(moves[e.key] < 0 ? prev : next).disabled) shiftMonth(Math.sign(moves[e.key]))
  })

  // Swipe the month sideways on a touch screen.
  let sx = null
  grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX }, { passive: true })
  grid.addEventListener('touchend', (e) => {
    if (sx === null) return
    const dx = e.changedTouches[0].clientX - sx
    sx = null
    if (Math.abs(dx) > 60) { const btn = dx < 0 ? next : prev; if (!btn.disabled) shiftMonth(dx < 0 ? 1 : -1) }
  }, { passive: true })

  // Phone: swipe from the left edge goes back a step.
  function swipeBack(target) {
    let start = null
    target.addEventListener('touchstart', (e) => {
      const x = e.touches[0].clientX
      start = x < 24 && s.step !== 'day' && s.step !== 'done' ? { x, y: e.touches[0].clientY } : null
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

  history.replaceState({ page: location.pathname + location.search, step: 'day' }, '', location.href)
  paintZone()
  const opening = showMonth(s.year, s.month).then(() => {
    const entry = monthEntry()
    if (entry && entry.status === 'ready' && !entry.byDay.size && !next.disabled) findNextQuietly()
  })
  async function findNextQuietly() {
    let y = s.year
    let m = s.month + 1
    if (m > 11) { m = 0; y++ }
    if (Date.UTC(y, m, 1) - 14 * 3600000 > s.until) return
    const entry = await loadMonth(y, m).catch(() => null)
    if (entry && entry.byDay.size) showMonth(y, m, 1)
  }

  return {
    el,
    ready: () => opening,
    clock: redrawClocks,
    // Back and Forward move between the steps on this page.
    pop(st) {
      if (!st || !st.step || st.page !== location.pathname + location.search || s.step === 'done') return false
      const step = st.step === 'time' && wide() ? 'day' : st.step
      if (step === 'details' && !s.slot) return false
      const order = ['day', 'time', 'details', 'done']
      setStep(step, { push: false, dir: order.indexOf(step) < order.indexOf(s.step) ? 'back' : 'forward' })
      return true
    }
  }
}
