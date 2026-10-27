// First time signed in: choose your link, say roughly when you're free,
// and you're live. Two event types are ready to go.
import { h, ic, fill, avatar, nope, copyText, haptic, reduced } from '../ui.js'
import * as api from '../api.js'
import { state, topBar, holmFooter, failure, go, prettyURL, pageURL, share, loadMe } from '../shell.js'
import { sound } from '../sound.js'
import { here, zoneName, zonePayload, city } from '../zones.js'
import { zonePicker } from './zone-picker.js'
import { doneMark } from './common.js'

const PRESETS = [
  { id: 'work', title: 'Weekdays, 9 to 5', sub: 'Monday to Friday', weekly: [[], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], [[540, 1020]], []] },
  { id: 'late', title: 'Weekdays, 10 to 6', sub: 'A later start', weekly: [[], [[600, 1080]], [[600, 1080]], [[600, 1080]], [[600, 1080]], [[600, 1080]], []] },
  { id: 'split', title: 'Mornings and evenings', sub: 'Weekdays 8–11 and 5–8', weekly: [[], [[480, 660], [1020, 1200]], [[480, 660], [1020, 1200]], [[480, 660], [1020, 1200]], [[480, 660], [1020, 1200]], [[480, 660], [1020, 1200]], []] },
  { id: 'all', title: 'Every day, 9 to 9', sub: 'Weekends too', weekly: Array.from({ length: 7 }, () => [[540, 1260]]) }
]

function suggest(member) {
  const params = new URLSearchParams(location.search)
  const asked = (params.get('handle') || '').toLowerCase()
  if (asked) return asked
  const base = (member.email ? member.email.split('@')[0] : member.name || '').toLowerCase()
  return base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24)
}

export function onboard() {
  const m = state.me.member
  const s = { step: 1, handle: suggest(m), name: m.name || '', zone: here(), preset: 'work', free: null, checking: 0 }
  const stage = h('div.onboard-stage')
  const dots = h('div.dots', { 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('span', { 'data-i': String(i) })))
  const el = h('div.app.public', topBar(), h('div.panel', h('main.onboard', dots, stage), holmFooter()))

  function show(step, dir = 1) {
    s.step = step
    for (const d of dots.children) d.classList.toggle('on', Number(d.dataset.i) <= step)
    const next = [null, linkStep, hoursStep, doneStep][step]()
    if (reduced()) { fill(stage, next); return }
    const out = stage.firstElementChild
    if (out) {
      out.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 24}px)` }], { duration: 160, easing: 'ease-in' }).finished.then(() => {
        fill(stage, next)
        next.animate([{ opacity: 0, transform: `translateX(${dir * 32}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' })
        focusFirst(next)
      })
    } else { fill(stage, next); focusFirst(next) }
  }
  const focusFirst = (node) => { const i = node.querySelector('input'); if (i && matchMedia('(pointer: fine)').matches) i.focus({ preventScroll: true }) }

  /* ---- 1. Your link ----------------------------------------------------- */

  function linkStep() {
    const status = h('p.handle-status', { 'aria-live': 'polite' })
    const input = h('input.handle-input', { type: 'text', value: s.handle, maxlength: '30', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your link' })
    const name = h('input.input', { type: 'text', value: s.name, maxlength: '80', autocomplete: 'name', placeholder: 'Your name' })
    const go2 = h('button.btn.primary.large.block', { type: 'submit' }, 'Continue')
    let timer = null
    const check = () => {
      const v = input.value.trim().replace(/^@/, '').toLowerCase()
      s.handle = v
      s.free = null
      clearTimeout(timer)
      if (!v) { fill(status); go2.disabled = true; return }
      fill(status, h('span.spin.small'), 'Checking…')
      status.className = 'handle-status'
      const ticket = ++s.checking
      timer = setTimeout(async () => {
        try {
          const r = await api.get('/api/handle?h=' + encodeURIComponent(v))
          if (ticket !== s.checking) return
          s.free = r.free
          status.className = 'handle-status ' + (r.free ? 'good' : 'bad')
          fill(status, ic(r.free ? 'circleCheck' : 'circleAlert', 16, 2.2), r.free ? `${prettyURL(r.handle)} is yours to take` : r.reason)
          go2.disabled = !r.free
        } catch (error) { if (ticket === s.checking) fill(status, error.message) }
      }, 280)
    }
    input.addEventListener('input', check)
    check()
    const form = h('form.onboard-card', { onsubmit: (e) => {
      e.preventDefault()
      s.name = name.value.trim()
      if (!s.free) { nope(form.querySelector('.handle-field')); sound.error(); return }
      if (!s.name) { nope(name); sound.error(); name.focus(); return }
      sound.push()
      show(2, 1)
    } },
    avatar({ key: m.id, name: m.name, picture: m.picture, size: 64, cls: '.big' }),
    h('h1', 'Choose your link'),
    h('p.sub', 'It’s what you’ll share. People open it and pick a time.'),
    h('label.handle-field', h('span.handle-prefix', `${location.host}/@`), input),
    status,
    h('label.field', h('span.field-label', 'Your name, as people will see it'), name),
    go2)
    return form
  }

  /* ---- 2. Your hours ---------------------------------------------------- */

  function hoursStep() {
    const zoneBtn = h('button.zone-btn.wide', { type: 'button' })
    const paintZone = () => fill(zoneBtn, ic('globe', 17, 2), h('span.grow', h('b', city(s.zone)), h('small', zoneName(s.zone, Date.now(), 'longGeneric'))), ic('chevronRight', 16, 2.2))
    zoneBtn.addEventListener('click', async () => { const z = await zonePicker(s.zone); if (z) { s.zone = z; paintZone() } })
    paintZone()
    const options = PRESETS.map((p) => {
      const b = h('button.preset' + (p.id === s.preset ? '.on' : ''), { type: 'button', 'aria-pressed': String(p.id === s.preset), onclick: () => {
        s.preset = p.id
        sound.tap()
        haptic(6)
        for (const o of b.parentNode.children) { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)) }
      } }, h('span.radio'), h('div', h('b', p.title), h('small', p.sub)))
      return b
    })
    const start = h('button.btn.primary.large.block', { type: 'submit' }, 'Create my page')
    const form = h('form.onboard-card', { onsubmit: async (e) => {
      e.preventDefault()
      start.classList.add('busy')
      fill(start, h('span.spin'), 'Setting up…')
      try {
        const preset = PRESETS.find((p) => p.id === s.preset)
        await api.post('/api/host', { handle: s.handle, name: s.name, weekly: preset.weekly, ...zonePayload(s.zone) })
        await loadMe()
        sound.booked()
        show(3, 1)
      } catch (error) {
        start.classList.remove('busy')
        fill(start, 'Create my page')
        failure(error)
        if (error.code === 'handle_taken' || error.code === 'invalid_handle') show(1, -1)
      }
    } },
    h('button.back-btn', { type: 'button', 'aria-label': 'Back', onclick: () => show(1, -1) }, ic('chevronLeft', 22, 2.2)),
    h('div.onboard-icon', ic('clock', 28, 1.9)),
    h('h1', 'When are you free?'),
    h('p.sub', 'A starting point. You can fine-tune each day later.'),
    zoneBtn,
    h('div.presets', options),
    start)
    return form
  }

  /* ---- 3. Done ------------------------------------------------------------ */

  function doneStep() {
    const host = state.me.host
    return h('div.onboard-card.done',
      doneMark('good'),
      h('h1', 'You’re live'),
      h('p.sub', 'Share your link anywhere: email, chat, your bio.'),
      h('div.link-card',
        h('span.link-text', prettyURL(host.handle)),
        h('div.link-actions',
          h('button.btn.small.tinted', { type: 'button', onclick: () => { copyText(pageURL(host.handle), 'Link copied'); sound.pop() } }, ic('copy', 15, 2.2), 'Copy'),
          h('button.btn.small.tinted', { type: 'button', onclick: () => share(host.handle) }, ic('share', 15, 2.2), 'Share'))),
      h('p.fine', 'We made a 15-minute chat and a 30-minute meeting to start you off.'),
      h('button.btn.primary.large.block', { type: 'button', onclick: () => go('/', { replace: true }) }, 'Go to my bookings'),
      h('a.link-btn', { href: pageURL(host.handle), target: '_blank', rel: 'noopener' }, 'See my page', ic('arrowUpRight', 15, 2.2)))
  }

  show(1)
  return { el }
}
