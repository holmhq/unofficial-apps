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
    const first = b.host.name.split(' ')[0]
    if (b.status === 'requested' || b.status === 'declined' || (b.status === 'cancelled' && (b.requested || (b.asked && !b.acceptedAt)))) return drawRequest(first)
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
          metaRow('user', b.name, b.email),
          b.guests && b.guests.length ? metaRow('mail', b.guests.join(', '), b.guests.length === 1 ? 'Guest' : `${b.guests.length} guests`) : null)),
      live && !past ? [
        h('p.cal-label', 'Add to your calendar'),
        calendarButtons(b.links),
        h('div.manage-actions',
          h('a.btn.block', { href: b.links.reschedule, onclick: (e) => { e.preventDefault(); location.href = b.links.reschedule } }, ic('repeat', 18, 2), 'Reschedule'),
          h('button.btn.block.danger', { type: 'button', onclick: cancel }, ic('calendarX', 18, 2), 'Cancel booking'))
      ] : null,
      !live ? h('div.manage-note',
        h('p', b.rescheduledTo ? 'This booking moved to a new time. The newest email has the details.' : b.cancelledBy === 'host' ? `${b.host.name} cancelled this booking.` : 'You cancelled this booking.'),
        b.reason ? h('p.quote', b.reason) : null,
        link(`/@${b.host.handle}/${b.event.slug}`, { class: 'btn primary' }, 'Book another time')) : null)
  }

  // A request: the times the guest sent, waiting for the host to pick one.
  function drawRequest(first) {
    const waiting = b.status === 'requested'
    const status = waiting ? ['Waiting for ' + first, 'wait'] : b.status === 'declined' ? ['Not this time', 'off'] : ['Withdrawn', 'past']
    const ranges = b.ranges && b.ranges.length ? b.ranges : [[b.start, b.end]]
    fill(body,
      h('div.ticket.big' + (waiting ? '' : '.dim'), { style: { '--event': colorOf(b.event.color) } },
        h('span.status.' + status[1], status[0]),
        h('div.ticket-head', avatar({ key: b.host.handle, name: b.host.name, picture: b.host.picture, size: 44 }), h('div', h('b', b.event.title), h('span', `with ${b.host.name}`))),
        h('p.ticket-lead', ranges.length === 1 ? 'The time you asked for' : 'The times you said you’re free'),
        h('ul.range-list' + (waiting ? '' : '.struck'), ranges.map(([a, z]) => h('li', h('b', `${t.relativeDay(a, zone) || t.weekday(a, zone, 'short')}, ${t.monthDay(a, zone)}`), h('span.num', t.range(a, z, zone))))),
        h('ul.meta', metaRow('user', b.name, b.email))),
      waiting
        ? [h('p.manage-hint', `${first} picks a time in these and you get an email with the invite. Nothing to do until then.`),
            h('div.manage-actions', h('button.btn.block.danger', { type: 'button', onclick: cancel }, ic('x', 18, 2.2), 'Withdraw request'))]
        : h('div.manage-note',
          h('p', b.status === 'declined' ? `${first} can’t make these times.` : 'You withdrew this request.'),
          b.reason ? h('p.quote', b.reason) : null,
          link(`/@${b.host.handle}/${b.event.slug}`, { class: 'btn primary' }, 'Pick another time')))
  }

  async function cancel() {
    haptic()
    const reason = h('textarea.input', { rows: '3', maxlength: '500', placeholder: `A note for ${b.host.name} (optional)` })
    const ok = await sheet({
      title: '', label: 'Cancel this booking', cancel: null, plain: true,
      body: (close) => [
        b.status === 'requested'
          ? h('div.confirm-head', doneMark('off'), h('b', 'Withdraw your request?'), h('p', `${b.host.name} will get an email and won’t pick a time.`))
          : h('div.confirm-head', doneMark('off'), h('b', 'Cancel this booking?'), h('p', `${t.fullDate(b.start, zone)}, ${t.range(b.start, b.end, zone)}. ${b.host.name} will get an email.`)),
        reason,
        h('div.confirm-actions',
          h('button.btn.large.block.danger-solid', { type: 'button', onclick: () => close(true) }, b.status === 'requested' ? 'Withdraw' : 'Cancel booking'),
          h('button.btn.large.block', { type: 'button', onclick: () => close(false) }, 'Keep it'))
      ]
    })
    if (!ok) return
    try {
      const r = await api.op('bookings.cancel', { id: b.id, token, reason: reason.value.trim() })
      if (r && r.emailed && r.emailed.waiting) api.flush(b.id, r.emailed.waiting)
      b = { ...b, requested: b.status === 'requested', status: 'cancelled', cancelledBy: 'invitee', reason: reason.value.trim() }
      sound.remove()
      draw()
    } catch (error) {
      failure(error)
    }
  }

  draw()
  return { el, accent: b.host.theme, clock: draw }
}
