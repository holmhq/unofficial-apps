// Profile and link: your name, your link, a welcome note, email
// notifications, and the private calendar feed of your bookings.
import { h, ic, fill, sheet, toggle, nope, copyText, confirm } from '../ui.js'
import * as api from '../api.js'
import { state, failure, prettyURL } from '../shell.js'
import { sound } from '../sound.js'

export async function profileSheet() {
  const host = state.me.host
  const name = h('input.input', { value: host.name, maxlength: '80', autocomplete: 'name' })
  const handle = h('input.handle-input', { value: host.handle, maxlength: '30', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Your link' })
  const status = h('p.handle-status', { 'aria-live': 'polite' })
  const bio = h('textarea.input', { rows: '3', maxlength: '400', placeholder: 'A line people see on your page' })
  bio.value = host.bio || ''
  let notify = host.notify
  let free = true
  let ticket = 0
  let timer = null
  handle.addEventListener('input', () => {
    const v = handle.value.trim().replace(/^@/, '').toLowerCase()
    clearTimeout(timer)
    if (v === host.handle) { free = true; fill(status); return }
    free = false
    const mine = ++ticket
    fill(status, h('span.spin.small'), 'Checking…')
    status.className = 'handle-status'
    timer = setTimeout(async () => {
      try {
        const r = await api.get('/api/handle?h=' + encodeURIComponent(v))
        if (mine !== ticket) return
        free = r.free
        status.className = 'handle-status ' + (r.free ? 'good' : 'bad')
        fill(status, ic(r.free ? 'circleCheck' : 'circleAlert', 16, 2.2), r.free ? `${prettyURL(r.handle)} is free. Your old link will stop working.` : r.reason)
      } catch (error) { if (mine === ticket) fill(status, error.message) }
    }, 280)
  })
  const feedBox = h('code.feed-url')
  const paintFeed = () => { feedBox.textContent = state.me.host.feed }
  paintFeed()

  let doneBtn = null
  const promise = sheet({
    title: 'Profile and link',
    done: 'Save',
    onDone: async (close) => {
      if (!free) { nope(handle.parentNode); sound.error(); return }
      if (!name.value.trim()) { nope(name); sound.error(); return }
      doneBtn && doneBtn.classList.add('busy')
      try {
        const r = await api.patch('/api/host', { name: name.value.trim(), handle: handle.value.trim().replace(/^@/, ''), bio: bio.value.trim(), notify })
        state.me.host = r.host
        sound.pop()
        dispatchEvent(new Event('kalendar:host'))
        close(true)
      } catch (error) {
        doneBtn && doneBtn.classList.remove('busy')
        failure(error)
      }
    },
    body: () => [
      h('label.field', h('span.field-label', 'Name'), name),
      h('div.field', h('span.field-label', 'Link'), h('label.handle-field', h('span.handle-prefix', `${location.host}/@`), handle), status),
      h('label.field', h('span.field-label', 'Welcome note'), bio),
      h('div.field', h('span.field-label', 'Email'),
        h('div.group', h('label.rule', h('span', h('b', 'Email me about bookings'), h('small', host.email || 'Your sign-in has no email address')), toggle(notify, (v) => { notify = v; sound.toggle(v) }, 'Email me about bookings')))),
      h('div.field', h('span.field-label', 'Calendar feed'),
        h('p.field-hint', 'Subscribe to this private link in Apple Calendar, Google Calendar or Outlook to see every booking there. Anyone with it can read your bookings.'),
        feedBox,
        h('div.link-actions',
          h('button.btn.small.tinted', { type: 'button', onclick: () => { copyText(state.me.host.feed, 'Feed link copied'); sound.pop() } }, ic('copy', 15, 2.2), 'Copy'),
          h('a.btn.small.tinted', { href: state.me.host.feed.replace(/^https?:/, 'webcal:') }, ic('calendarPlus', 15, 2.2), 'Subscribe'),
          h('button.btn.small', { type: 'button', onclick: async () => {
            if (!await confirm({ title: 'Make a new feed link?', text: 'The old link stops working, so calendars using it stop updating.', action: 'New link' })) return
            try { const r = await api.patch('/api/host', { rotateFeed: true }); state.me.host = r.host; paintFeed(); sound.pop() } catch (error) { failure(error) }
          } }, ic('refreshCw', 15, 2.2), 'New link')))
    ]
  })
  doneBtn = [...document.querySelectorAll('.layer .sheet-head .r')].pop()
  return promise
}
