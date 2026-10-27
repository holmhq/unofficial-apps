// Adding or changing an event type: name, link, length, where, colour and
// the booking rules. Resolves with the saved event, { deleted }, or nothing.
import { h, ic, sheet, confirm, nope, haptic, toast } from '../ui.js'
import * as api from '../api.js'
import { failure } from '../shell.js'
import { sound } from '../sound.js'
import { COLORS, LOCATIONS } from './common.js'
import * as t from '../time.js'

const slugify = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

function chips(options, value, onchange, label) {
  const box = h('div.chips', { role: 'radiogroup', 'aria-label': label })
  const paint = () => { for (const b of box.children) { const on = b.dataset.v === String(value); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)) } }
  for (const o of options) {
    box.append(h('button.chip', { type: 'button', role: 'radio', 'data-v': String(o.value), onclick: () => { value = o.value; paint(); sound.tap(); haptic(4); onchange(o.value) } }, o.icon ? ic(o.icon, 15, 2.1) : null, o.label))
  }
  paint()
  return box
}

function select(options, value, label) {
  return h('select.select', { 'aria-label': label }, options.map(([v, text]) => h('option', { value: String(v), selected: v === value }, text)))
}

const PRESET = [15, 30, 45, 60, 90]
const HINTS = {
  none: 'You’ll sort out where when you meet.',
  video: 'Paste your Zoom, Meet or Teams link. Leave it empty to send one later.',
  phone: 'Guests give their number when they book; you call them.',
  place: 'The address, shown on the booking page.',
  custom: 'Say how or where you’ll meet.'
}

export function eventSheet(event, host) {
  const e = event || { title: '', slug: '', duration: 30, step: 0, notice: 240, window: 60, before: 0, after: 0, location: { kind: 'none', value: '' }, description: '', color: 'blue', active: true }
  const v = { kind: e.location.kind, color: e.color, length: PRESET.includes(e.duration) ? e.duration : 'other' }
  let slugTouched = !!event

  const title = h('input.input', { value: e.title, maxlength: '80', placeholder: 'Intro call', autofocus: !event })
  const slug = h('input.slug-input', { value: e.slug, maxlength: '40', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Link' })
  title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value) })
  slug.addEventListener('input', () => { slugTouched = true })

  const minutes = h('input.input.small-input.num', { type: 'number', min: '5', max: '720', step: '5', value: PRESET.includes(e.duration) ? '' : String(e.duration), placeholder: 'min', 'aria-label': 'Minutes', hidden: PRESET.includes(e.duration) })
  const lengths = chips([...PRESET.map((n) => ({ value: n, label: t.minutesLabel(n) })), { value: 'other', label: 'Other' }], v.length, (x) => {
    v.length = x
    minutes.hidden = x !== 'other'
    if (x === 'other') minutes.focus()
  }, 'Length')
  const durationRow = h('div.duration-row', lengths, minutes)

  const place = h('input.input', { value: e.location.value || '', maxlength: '300' })
  const hint = h('span.field-hint')
  const paintPlace = () => {
    place.hidden = v.kind === 'none' || v.kind === 'phone'
    place.placeholder = v.kind === 'video' ? 'https://meet.example.com/your-room' : v.kind === 'place' ? '1 Main Street, Springfield' : 'We’ll meet at…'
    place.type = v.kind === 'video' ? 'url' : 'text'
    hint.textContent = HINTS[v.kind]
  }
  const kinds = chips(Object.entries(LOCATIONS).map(([k, x]) => ({ value: k, label: x.label, icon: x.icon })), v.kind, (k) => { v.kind = k; paintPlace(); if (!place.hidden) place.focus() }, 'Where')
  paintPlace()

  const desc = h('textarea.input', { rows: '3', maxlength: '1000', placeholder: 'What it’s for, or how to prepare' })
  desc.value = e.description || ''

  const swatches = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Colour' })
  for (const [name, hex] of Object.entries(COLORS)) {
    const b = h('button.swatch', { type: 'button', role: 'radio', 'aria-label': name, 'aria-checked': String(v.color === name), style: { '--c': hex }, onclick: () => {
      v.color = name
      sound.tap()
      for (const x of swatches.children) x.setAttribute('aria-checked', String(x === b))
    } })
    swatches.append(b)
  }

  const notice = select([[0, 'No notice'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [720, '12 hours'], [1440, '1 day'], [2880, '2 days'], [10080, '1 week']], e.notice, 'Notice needed')
  const ahead = select([[7, '1 week'], [14, '2 weeks'], [30, '30 days'], [60, '60 days'], [90, '90 days'], [180, '6 months'], [365, '1 year']], e.window, 'How far ahead')
  const step = select([[0, 'Automatic'], [10, 'Every 10 min'], [15, 'Every 15 min'], [20, 'Every 20 min'], [30, 'Every 30 min'], [60, 'Every hour']], e.step || 0, 'Start times')
  const gap = [[0, 'None'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour']]
  const before = select(gap, e.before || 0, 'Free time before')
  const after = select(gap, e.after || 0, 'Free time after')
  const rule = (label, control) => h('label.rule', h('span', label), control)

  async function save(close, done) {
    const name = title.value.trim()
    const duration = v.length === 'other' ? Number(minutes.value) : v.length
    const where = place.value.trim()
    if (!name) { nope(title); sound.error(); title.focus(); return }
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) { nope(durationRow); sound.error(); toast('Pick a length from 5 minutes to 12 hours.', { kind: 'bad' }); return }
    if ((v.kind === 'place' || v.kind === 'custom') && !where) { nope(place); sound.error(); place.focus(); return }
    if (v.kind === 'video' && where && !/^https:\/\//i.test(where)) { nope(place); sound.error(); toast('A video link starts with https://', { kind: 'bad' }); return }
    done.classList.add('busy')
    try {
      const body = {
        title: name, slug: slugify(slug.value) || slugify(name), duration, step: Number(step.value), notice: Number(notice.value), window: Number(ahead.value),
        before: Number(before.value), after: Number(after.value), location: { kind: v.kind, value: where }, description: desc.value.trim(), color: v.color
      }
      const r = event ? await api.patch(`/api/events/${event.id}`, body) : await api.post('/api/events', body)
      sound.pop()
      close(r.event)
    } catch (error) {
      done.classList.remove('busy')
      failure(error)
    }
  }

  let done = null
  const promise = sheet({
    title: event ? 'Edit event type' : 'New event type',
    done: event ? 'Save' : 'Add',
    wide: true,
    onDone: (close) => save(close, done),
    body: (close) => [
      h('label.field', h('span.field-label', 'Name'), title),
      h('label.field', h('span.field-label', 'Link'), h('div.slug-field', h('span', `/@${host.handle}/`), slug)),
      h('div.field', h('span.field-label', 'Length'), durationRow),
      h('div.field', h('span.field-label', 'Where'), kinds, place, hint),
      h('label.field', h('span.field-label', 'Description'), desc),
      h('div.field', h('span.field-label', 'Colour'), swatches),
      h('div.field', h('span.field-label', 'Booking rules'),
        h('div.group.rules',
          rule('Notice needed', notice),
          rule('How far ahead', ahead),
          rule('Start times', step),
          rule('Free time before', before),
          rule('Free time after', after))),
      event ? h('button.btn.block.danger', { type: 'button', onclick: async () => {
        const ok = await confirm({ title: `Delete “${event.title}”?`, text: 'Its link stops working. Bookings already made stay.', action: 'Delete' })
        if (!ok) return
        try { await api.del(`/api/events/${event.id}`); sound.remove(); close({ deleted: true }) } catch (error) { failure(error) }
      } }, ic('trash2', 17, 2), 'Delete event type') : null
    ]
  })
  done = [...document.querySelectorAll('.layer .sheet-head .r')].pop()
  return promise
}
