// Profile: your page as guests see it at the top, then what's on it (your
// name, what you do, where you are, a welcome note, your website and
// profiles), your link, email about bookings and the address it goes to,
// and the private calendar feed of your bookings. Like your hours, it saves
// as you type.
import { h, ic, fill, avatar, toggle, nope, copyText, confirm, toast } from '../ui.js'
import * as api from '../api.js'
import * as store from '../store.js'
import { state, failure, prettyURL, pageURL, share } from '../shell.js'
import * as theme from '../theme.js'
import { sound } from '../sound.js'
import { siteOf } from './profile.js'

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const withScheme = (v) => (/^https?:\/\//i.test(v) ? v : v ? 'https://' + v.replace(/^\/+/, '') : v)

export function profileTab({ onSaved }) {
  const host = () => state.me.host
  const saved = h('span.saved', { 'aria-live': 'polite' })

  /* ---- Saving ------------------------------------------------------------------ */

  let pending = {}
  let timer = null
  let fade = null
  function save(change, wait = 600) {
    Object.assign(pending, change)
    clearTimeout(timer)
    clearTimeout(fade)
    fill(saved, h('span.spin.small'), 'Saving')
    saved.className = 'saved show'
    timer = setTimeout(async () => {
      const body = pending
      pending = {}
      try {
        const r = await api.patch('/api/host', body)
        state.me.host = r.host
        store.keep('me', state.me)
        onSaved(body)
        fill(saved, ic('check', 14, 2.6), 'Saved')
        saved.className = 'saved show good'
        fade = setTimeout(() => { saved.className = 'saved' }, 1600)
      } catch (error) { saved.className = 'saved'; failure(error) }
    }, wait)
  }

  /* ---- Your page, as guests see it ------------------------------------------------ */

  const cardName = h('b.trunc')
  const cardRole = h('span.trunc')
  const cardLink = h('span.page-card-link.trunc')
  const cardFace = h('span.page-card-face')
  function paintCard() {
    const x = host()
    fill(cardFace, avatar({ key: x.handle, name: x.name, picture: x.picture, size: 64 }))
    cardName.textContent = name.value.trim() || x.name
    const line = [role.value.trim(), company.value.trim()].filter(Boolean).join(' · ')
    cardRole.textContent = line || 'Add what you do below'
    cardRole.classList.toggle('muted', !line)
    cardLink.textContent = prettyURL(x.handle)
  }
  const card = h('div.page-card',
    h('a.page-card-top', { href: pageURL(host().handle), target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = pageURL(host().handle) } },
      cardFace,
      h('span.page-card-text', cardName, cardRole, cardLink),
      ic('arrowUpRight', 18, 2.2)),
    h('div.page-card-actions',
      h('button.btn.small.tinted', { type: 'button', onclick: () => { copyText(pageURL(host().handle), 'Link copied'); sound.pop() } }, ic('copy', 15, 2.2), 'Copy link'),
      h('button.btn.small.tinted', { type: 'button', onclick: () => share(host().handle) }, ic('share', 15, 2.2), 'Share'),
      h('a.btn.small.tinted', { href: pageURL(host().handle), target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = pageURL(host().handle) } }, ic('externalLink', 15, 2.2), 'Open')))

  /* ---- Colour -------------------------------------------------------------------------- */

  // The colour of your pages: this dashboard, your page, its booking pages
  // and your emails. It changes here at once, spreading from the swatch.
  const accents = h('div.accents', { role: 'radiogroup', 'aria-label': 'Colour of your pages' })
  const mineOf = () => host().theme || 'red'
  function paintAccents() {
    fill(accents, theme.ACCENTS.map(({ id, name }) => h('button.accent-pick', {
      type: 'button', role: 'radio', 'aria-checked': String(mineOf() === id), 'data-accent': id,
      onclick: (e) => pickAccent(id, e.currentTarget)
    }, h('span.accent-dot', ic('check', 18, 3)), h('span.accent-name', name))))
  }
  function pickAccent(id, button) {
    if (id === mineOf()) return
    const r = button.querySelector('.accent-dot').getBoundingClientRect()
    theme.setAccent(id, { scope: 'me', origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    // Your own page opens in it from now on, here too.
    const handle = host().handle.toLowerCase()
    theme.remember('@' + handle, id)
    store.forget((k) => k === 'u:' + handle || k.startsWith('u:' + handle + '/'))
    state.me.host = { ...host(), theme: id }
    paintAccents()
    sound.pick()
    save({ theme: id }, 0)
  }
  paintAccents()

  /* ---- About you ----------------------------------------------------------------------- */

  const x0 = host()
  const input = (attrs) => h('input.row-input', { maxlength: '80', ...attrs })
  const name = input({ value: x0.name, autocomplete: 'name', 'aria-label': 'Name' })
  const role = input({ value: x0.role || '', placeholder: 'Product designer', autocomplete: 'organization-title', 'aria-label': 'What you do' })
  const company = input({ value: x0.company || '', placeholder: 'Northwind', autocomplete: 'organization', 'aria-label': 'Company' })
  const place = input({ value: x0.place || '', placeholder: 'Lisbon', 'aria-label': 'City' })
  const bio = h('textarea.row-input.note', { rows: '4', maxlength: '600', placeholder: 'A line or two people see on your page', 'aria-label': 'Welcome note' })
  bio.value = x0.bio || ''
  // The note grows with what's written in it.
  const fit = () => { bio.style.height = 'auto'; bio.style.height = bio.scrollHeight + 'px' }
  bio.addEventListener('input', fit)
  const row = (label, control) => h('label.form-row', h('span.form-label', label), control)

  name.addEventListener('input', () => {
    paintCard()
    name.closest('.form-row').classList.remove('bad')
    if (name.value.trim()) save({ name: name.value.trim() })
  })
  name.addEventListener('change', () => {
    if (name.value.trim()) return
    name.value = host().name
    nope(name.closest('.form-row'))
    sound.error()
    paintCard()
  })
  for (const [el, field] of [[role, 'role'], [company, 'company'], [place, 'place'], [bio, 'bio']]) {
    el.addEventListener('input', () => { if (el !== bio && el !== place) paintCard(); save({ [field]: el.value.trim() }) })
  }

  /* ---- Website and profiles -------------------------------------------------------------- */

  const website = h('input.row-input', { value: x0.website || '', maxlength: '200', type: 'url', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', placeholder: 'yourname.com', 'aria-label': 'Website' })
  // Addresses save once you leave the field, so a half-typed one isn't sent.
  website.addEventListener('change', () => save({ website: website.value.trim() ? withScheme(website.value.trim()) : '' }, 0))
  const links = [...(x0.links || [])]
  const linkList = h('div.link-rows')
  const saveLinks = () => save({ links: links.map((v) => v.trim()).filter(Boolean).map(withScheme) }, 0)
  function linkRow(value, i) {
    const field = h('input.row-input', { value, maxlength: '200', type: 'url', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', placeholder: 'linkedin.com/in/you', 'aria-label': `Profile link ${i + 1}` })
    const icon = h('span.link-icon')
    const paint = () => fill(icon, ic(siteOf(withScheme(field.value)).icon, 17, 2))
    field.addEventListener('input', () => { links[i] = field.value; paint() })
    field.addEventListener('change', saveLinks)
    paint()
    return h('div.form-row.link', icon, field,
      h('button.icon-btn.small', { type: 'button', 'aria-label': 'Remove this link', onclick: () => { const had = links[i].trim(); links.splice(i, 1); drawLinks(); sound.remove(); if (had) saveLinks() } }, ic('x', 16, 2.2)))
  }
  function drawLinks() {
    fill(linkList, links.map(linkRow), links.length < 8 ? h('button.row-btn.add', { type: 'button', onclick: () => { links.push(''); drawLinks(); sound.pop(); linkList.querySelectorAll('input')[links.length - 1].focus() } }, ic('plus', 18, 2.2), h('span.grow', 'Add a profile')) : null)
  }
  drawLinks()

  /* ---- Your link ----------------------------------------------------------------------------- */

  const handle = h('input.handle-input', { value: x0.handle, maxlength: '30', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Your link' })
  const status = h('p.group-foot.handle-note', { 'aria-live': 'polite' })
  const change = h('button.btn.small.primary.handle-go', { type: 'button', hidden: true, onclick: changeHandle }, 'Change')
  let ticket = 0
  let check = null
  const wanted = () => handle.value.trim().replace(/^@/, '').toLowerCase()
  const paintStatus = () => fill(status, 'Changing it frees the old one: links to it stop working.')
  paintStatus()
  handle.addEventListener('input', () => {
    const v = wanted()
    clearTimeout(check)
    change.hidden = true
    if (v === host().handle) { status.className = 'group-foot handle-note'; paintStatus(); return }
    const mine = ++ticket
    status.className = 'group-foot handle-note'
    fill(status, h('span.spin.small'), 'Checking…')
    check = setTimeout(async () => {
      try {
        const r = await api.get('/api/handle?h=' + encodeURIComponent(v))
        if (mine !== ticket) return
        status.className = 'group-foot handle-note ' + (r.free ? 'good' : 'bad')
        fill(status, ic(r.free ? 'circleCheck' : 'circleAlert', 15, 2.2), r.free ? `${prettyURL(r.handle)} is free.` : r.reason)
        change.hidden = !r.free
      } catch (error) { if (mine === ticket) fill(status, error.message) }
    }, 280)
  })
  handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !change.hidden) changeHandle() })
  async function changeHandle() {
    const v = wanted()
    if (!await confirm({ title: `Change your link to @${v}?`, text: `${prettyURL(host().handle)} stops working. Anyone with the old link won’t find you there.`, action: 'Change link', danger: false })) return
    change.classList.add('busy')
    try {
      const r = await api.patch('/api/host', { handle: v })
      state.me.host = r.host
      store.keep('me', state.me)
      onSaved({ handle: v })
      handle.value = r.host.handle
      change.hidden = true
      status.className = 'group-foot handle-note good'
      fill(status, ic('circleCheck', 15, 2.2), `Your link is now ${prettyURL(r.host.handle)}`)
      paintCard()
      sound.pop()
    } catch (error) { failure(error) }
    change.classList.remove('busy')
  }

  /* ---- Email and calendar feed ---------------------------------------------------------------- */

  const notify = h('label.rule', h('span', h('b', 'Email me about bookings'), h('small', 'New bookings, moves, cancellations and requests')),
    toggle(x0.notify, (v) => { sound.toggle(v); save({ notify: v }, 0) }, 'Email me about bookings'))

  // Where that email goes: the sign-in address or another one, confirmed
  // from its own inbox first. Guests see it as their invite's organizer.
  const mails = h('div.group.mail-group')
  let adding = false
  const keep = (r) => { state.me.host = r.host; store.keep('me', state.me) }
  function drawMails() {
    const x = host()
    const list = x.addresses || []
    const choice = (address, sub, removable) => h('button.mail-row' + (same(x.sendTo, address) ? '.on' : ''), { type: 'button', 'aria-pressed': String(same(x.sendTo, address)), onclick: () => choose(address) },
      h('span.tick', ic('check', 20, 2.6)),
      h('span.grow', h('b', address), h('small', sub)),
      removable ? h('button.icon-btn.small', { type: 'button', 'aria-label': `Remove ${address}`, onclick: (e) => { e.stopPropagation(); remove(address) } }, ic('x', 16, 2.2)) : null)
    const waiting = (a) => h('div.mail-row',
      h('span.tick'),
      h('span.grow', h('b', a.address), h('small.wait', 'Not confirmed yet')),
      h('button.link-btn', { type: 'button', onclick: (e) => addAddress(a.address, e.currentTarget) }, 'Resend'),
      h('button.icon-btn.small', { type: 'button', 'aria-label': `Remove ${a.address}`, onclick: () => remove(a.address) }, ic('x', 16, 2.2)))
    const rows = [
      x.email ? choice(x.email, 'You sign in with this', false) : h('div.mail-row', h('span.tick'), h('span.grow', h('b', 'No sign-in address'), h('small', 'Add one below to get booking email'))),
      ...list.map((a) => (a.verified ? choice(a.address, 'Confirmed', true) : waiting(a)))
    ]
    if (adding) {
      const input = h('input.row-input', { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: false, placeholder: 'name@example.com', 'aria-label': 'Another email address' })
      const send = h('button.btn.small.tinted', { type: 'submit' }, 'Send link')
      const form = h('form.mail-add', { novalidate: true },
        input, send,
        h('button.icon-btn.small', { type: 'button', 'aria-label': 'Cancel', onclick: () => { adding = false; drawMails() } }, ic('x', 16, 2.2)))
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const v = input.value.trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { nope(form); sound.error(); input.focus(); return }
        addAddress(v, send)
      })
      rows.push(form)
      requestAnimationFrame(() => input.focus())
    } else if (list.length < 4) {
      rows.push(h('button.row-btn.add', { type: 'button', onclick: () => { adding = true; drawMails(); sound.pop() } }, ic('plus', 18, 2.2), h('span.grow', 'Add another address')))
    }
    fill(mails, rows)
  }
  async function choose(address) {
    const x = host()
    if (same(x.sendTo, address)) return
    const was = x.sendTo
    state.me.host = { ...x, sendTo: address }
    drawMails()
    sound.pick()
    try { keep(await api.patch('/api/host', { sendTo: address })) } catch (error) { state.me.host = { ...host(), sendTo: was }; drawMails(); failure(error) }
  }
  async function addAddress(address, button) {
    button.classList.add('busy')
    try {
      keep(await api.post('/api/host/addresses', { address }))
      adding = false
      drawMails()
      sound.sent()
      toast(`Sent. Open the link in ${address}’s inbox to confirm it.`)
    } catch (error) { button.classList.remove('busy'); failure(error) }
  }
  async function remove(address) {
    if (!await confirm({ title: `Remove ${address}?`, text: same(host().sendTo, address) ? 'Booking emails go back to the address you sign in with.' : 'You can add it again later.', action: 'Remove' })) return
    try { keep(await api.del(`/api/host/addresses/${encodeURIComponent(address)}`)); drawMails(); sound.remove() } catch (error) { failure(error) }
  }
  drawMails()
  // Back from the link in the email.
  const confirmed = new URLSearchParams(location.search).get('confirmed')
  if (confirmed !== null) {
    history.replaceState(history.state, '', location.pathname)
    if (confirmed === '0') toast('That link has expired or was already used. Add the address again.', { kind: 'bad' })
    else {
      toast(`${confirmed} is confirmed. Tap it to get booking emails there.`)
      api.get('/api/me').then((r) => { if (r.host) { state.me.host = r.host; store.keep('me', state.me); drawMails() } }).catch(() => {})
    }
  }
  const feedBox = h('code.feed-url')
  const paintFeed = () => { feedBox.textContent = host().feed }
  paintFeed()
  const feed = h('div.group.feed-group',
    h('p.feed-text', 'Subscribe to this private link in Apple Calendar, Google Calendar or Outlook to see every booking there. Anyone with it can read your bookings.'),
    feedBox,
    h('div.link-actions',
      h('button.btn.small.tinted', { type: 'button', onclick: () => { copyText(host().feed, 'Feed link copied'); sound.pop() } }, ic('copy', 15, 2.2), 'Copy'),
      h('a.btn.small.tinted', { href: host().feed.replace(/^https?:/, 'webcal:'), onclick: (e) => { e.currentTarget.href = host().feed.replace(/^https?:/, 'webcal:') } }, ic('calendarPlus', 15, 2.2), 'Subscribe'),
      h('button.btn.small', { type: 'button', onclick: async () => {
        if (!await confirm({ title: 'Make a new feed link?', text: 'The old link stops working, so calendars using it stop updating.', action: 'New link' })) return
        try { const r = await api.patch('/api/host', { rotateFeed: true }); state.me.host = r.host; store.keep('me', state.me); paintFeed(); sound.pop() } catch (error) { failure(error) }
      } }, ic('refreshCw', 15, 2.2), 'New link')))

  paintCard()
  requestAnimationFrame(fit)
  const el = h('section.tab-page.profile-page',
    h('div.title-row', h('h1.large-title', 'Profile'), saved),
    card,
    h('h2.group-title', 'Colour'),
    h('div.group', accents),
    h('p.group-foot', 'Your page, its booking pages, your emails and this dashboard wear it, in light and in dark.'),
    h('h2.group-title', 'About you'),
    h('div.group.form-group', row('Name', name), row('What you do', role), row('Company', company), row('City', place)),
    h('p.group-foot', 'Your city is shown with your local time. Leave it empty to use your time zone’s.'),
    h('h2.group-title', 'Welcome note'),
    h('div.group.form-group', h('div.form-row.note-row', bio)),
    h('h2.group-title', 'Website and profiles'),
    h('div.group.form-group',
      h('label.form-row.link', h('span.link-icon', ic('globe', 17, 2)), website),
      linkList),
    h('h2.group-title', 'Your link'),
    h('div.group.form-group', h('label.form-row.handle-row', h('span.handle-prefix', `${location.host}/@`), handle, change)),
    status,
    h('h2.group-title', 'Email'),
    h('div.group', notify),
    h('h2.group-title', 'Send it to'),
    mails,
    h('p.group-foot', 'Booking emails and calendar invites go to the ticked address, and guests see it as the organizer of their invite.'),
    h('h2.group-title', 'Calendar feed'),
    feed)

  return {
    el,
    // Fill in what changed elsewhere (Claude, another tab), unless it's
    // being typed into here.
    refresh() {
      const x = host()
      for (const [field, key] of [[name, 'name'], [role, 'role'], [company, 'company'], [place, 'place'], [bio, 'bio'], [website, 'website']]) {
        if (document.activeElement !== field && !(key in pending)) field.value = x[key] || ''
      }
      if (document.activeElement !== handle) handle.value = x.handle
      if (!mails.contains(document.activeElement)) drawMails()
      if (!('theme' in pending)) paintAccents()
      paintFeed()
      paintCard()
      fit()
    },
    leave() {
      // Save what's waiting now, rather than lose it.
      if (timer && Object.keys(pending).length) { clearTimeout(timer); api.patch('/api/host', pending).then((r) => { state.me.host = r.host; store.keep('me', state.me) }).catch(() => {}) }
    }
  }
}
