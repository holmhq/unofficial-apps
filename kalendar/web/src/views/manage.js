// A booking, from the link in its email: see it, add it to a calendar,
// move it or cancel it. The link's token is the only key.
import { h, ic, avatar, fill, sheet, haptic } from '../ui.js'
import * as api from '../api.js'
import { topBar, go, link, holmFooter, failure } from '../shell.js'
import { sound } from '../sound.js'
import * as t from '../time.js'
import { here, zoneName, gmt, offsetIn } from '../zones.js'
import { colorOf, placeLine, metaRow, calendarButtons, doneMark } from './common.js'

export async function manage(id) {
  const token = new URLSearchParams(location.search).get('t') || ''
  let b
  try {
    b = await api.get(`/api/b/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`)
  } catch (error) {
    return {
      el: h('div.app.public', topBar(), h('div.panel', h('main.empty-page',
        h('div.empty-icon', ic('calendarX', 30, 1.8)), h('h1', 'Booking not found'), h('p', error.message),
        h('button.btn.primary', { type: 'button', onclick: () => go('/') }, 'Go to Kalendar')), holmFooter()))
    }
  }
  const zone = (() => { try { return localStorage.getItem('kalendar:zone') || here() } catch { return here() } })()
  const body = h('main.manage')
  const el = h('div.app.public', topBar({ left: link(`/@${b.host.handle}`, { class: 'top-host' }, ic('chevronLeft', 20, 2.2), h('span', b.host.name)) }), h('div.panel', body, holmFooter()))

  function draw() {
    const live = b.status === 'confirmed'
    const past = b.end < Date.now()
    const where = placeLine(b.location, b.host.name, { revealed: true, phone: b.phone })
    const status = !live ? (b.rescheduledTo ? ['Moved', 'moved'] : ['Cancelled', 'off']) : past ? ['Done', 'past'] : ['Confirmed', 'ok']
    fill(body,
      h('div.ticket.big' + (live ? '' : '.dim'), { style: { '--event': colorOf(b.event.color) } },
        h('span.status.' + status[1], status[0]),
        h('div.ticket-head', avatar({ key: b.host.handle, name: b.host.name, picture: b.host.picture, size: 44 }), h('div', h('b', b.event.title), h('span', `with ${b.host.name}`))),
        h('ul.meta' + (live ? '' : '.struck'),
          metaRow('calendar', t.fullDate(b.start, zone)),
          metaRow('clock', t.range(b.start, b.end, zone), `${zoneName(zone, b.start)} · ${gmt(offsetIn(zone, b.start))}`),
          where && live ? metaRow(where.icon, where.text, where.sub, where.href) : null,
          metaRow('user', b.name, b.email))),
      live && !past ? [
        h('p.cal-label', 'Add to your calendar'),
        calendarButtons(b.links),
        h('div.manage-actions',
          h('a.btn.block', { href: b.links.reschedule, onclick: (e) => { e.preventDefault(); location.href = b.links.reschedule } }, ic('repeat', 18, 2), 'Reschedule'),
          h('button.btn.block.danger', { type: 'button', onclick: cancel }, ic('calendarX', 18, 2), 'Cancel booking'))
      ] : null,
      !live ? h('div.manage-note',
        h('p', b.rescheduledTo ? 'This booking moved to a new time. The newest email has the details.' : b.cancelledBy === 'host' ? `${b.host.name} cancelled this booking.` : 'You cancelled this booking.'),
        b.reason ? h('blockquote', b.reason) : null,
        link(`/@${b.host.handle}/${b.event.slug}`, { class: 'btn primary' }, 'Book another time')) : null)
  }

  async function cancel() {
    haptic()
    const reason = h('textarea.input', { rows: '3', maxlength: '500', placeholder: `A note for ${b.host.name} (optional)` })
    const ok = await sheet({
      title: '', label: 'Cancel this booking', cancel: null, plain: true,
      body: (close) => [
        h('div.confirm-head', doneMark('off'), h('b', 'Cancel this booking?'), h('p', `${t.fullDate(b.start, zone)}, ${t.range(b.start, b.end, zone)}. ${b.host.name} will get an email.`)),
        reason,
        h('div.confirm-actions',
          h('button.btn.large.block.danger-solid', { type: 'button', onclick: () => close(true) }, 'Cancel booking'),
          h('button.btn.large.block', { type: 'button', onclick: () => close(false) }, 'Keep it'))
      ]
    })
    if (!ok) return
    try {
      await api.op('bookings.cancel', { id: b.id, token, reason: reason.value.trim() })
      b = { ...b, status: 'cancelled', cancelledBy: 'invitee', reason: reason.value.trim() }
      sound.remove()
      draw()
    } catch (error) {
      failure(error)
    }
  }

  draw()
  return { el, clock: draw }
}
