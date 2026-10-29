// Profile and link: your name, what you do, where you are, a welcome note,
// your website and profiles, your link, email notifications, and the
// private calendar feed of your bookings.
import { h, ic, fill, sheet, toggle, nope, copyText, confirm } from '../ui.js'
import * as api from '../api.js'
import { state, failure, prettyURL } from '../shell.js'
import { sound } from '../sound.js'
import { siteOf } from './profile.js'

const withScheme = (v) => (/^https?:\/\//i.test(v) ? v : v ? 'https://' + v.replace(/^\/+/, '') : v)

export async function profileSheet() {
  const host = state.me.host
  const name = h('input.input', { value: host.name, maxlength: '80', autocomplete: 'name' })
  const handle = h('input.handle-input', { value: host.handle, maxlength: '30', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Your link' })
  const status = h('p.handle-status', { 'aria-live': 'polite' })
  const bio = h('textarea.input', { rows: '3', maxlength: '600', placeholder: 'A line or two people see on your page' })
  bio.value = host.bio || ''
  const role = h('input.input', { value: host.role || '', maxlength: '80', placeholder: 'Product designer', autocomplete: 'organization-title' })
  const company = h('input.input', { value: host.company || '', maxlength: '80', placeholder: 'Northwind', autocomplete: 'organization' })
  const place = h('input.input', { value: host.place || '', maxlength: '80', placeholder: 'Lisbon' })
  const website = h('input.input', { value: host.website || '', maxlength: '200', type: 'url', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', placeholder: 'yourname.com' })
  const linkList = h('div.link-list')
  const links = [...(host.links || [])]
  function linkRow(value, i) {
    const input = h('input.input', { value, maxlength: '200', type: 'url', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', placeholder: 'linkedin.com/in/you', 'aria-label': `Link ${i + 1}` })
    const icon = h('span.link-icon')
    const paint = () => fill(icon, ic(siteOf(withScheme(input.value)).icon, 17, 2))
    input.addEventListener('input', () => { links[i] = input.value; paint() })
    paint()
    return h('div.link-row', icon, input, h('button.icon-btn.small', { type: 'button', 'aria-label': 'Remove this link', onclick: () => { links.splice(i, 1); drawLinks(); sound.remove() } }, ic('x', 16, 2.2)))
  }
  function drawLinks() {
    fill(linkList, links.map(linkRow), links.length < 8 ? h('button.row-btn.add', { type: 'button', onclick: () => { links.push(''); drawLinks(); sound.pop(); linkList.querySelectorAll('input')[links.length - 1].focus() } }, ic('plus', 18, 2.2), h('span.grow', 'Add a profile link')) : null)
  }
  drawLinks()
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
        const r = await api.patch('/api/host', {
          name: name.value.trim(), handle: handle.value.trim().replace(/^@/, ''), bio: bio.value.trim(), notify,
          role: role.value.trim(), company: company.value.trim(), place: place.value.trim(),
          website: website.value.trim() ? withScheme(website.value.trim()) : '',
          links: links.map((x) => x.trim()).filter(Boolean).map(withScheme)
        })
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
      h('div.field-pair', h('label.field', h('span.field-label', 'What you do'), role), h('label.field', h('span.field-label', 'Company'), company)),
      h('label.field', h('span.field-label', 'Where you are'), place, h('span.field-hint', 'Shown with your local time. Leave it empty to use your time zone’s city.')),
      h('label.field', h('span.field-label', 'Welcome note'), bio),
      h('label.field', h('span.field-label', 'Website'), website),
      h('div.field', h('span.field-label', 'Profiles'), linkList),
      h('div.field', h('span.field-label', 'Link'), h('label.handle-field', h('span.handle-prefix', `${location.host}/@`), handle), status),
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
