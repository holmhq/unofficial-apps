// The composer under a conversation and a new text: write, see how much of
// an SMS it takes, fill in a template, send later, pick a SIM, then send.
// Drafts are kept per conversation in this browser.

import { h, fill, ic, sheet, segmented, toast, nope, when, HOUR, MIN, wide, haptic } from './ui.js'
import { store, loadTemplates } from './store.js'
import { sound } from './sound.js'
import { segments, signals, parseTemplate, fillTemplate, checkValue, VAR_TYPES, VAR_MAX, ist, nextIstHour, isIndian } from './sms.js'

const MAX_PARTS = 8
const RING = 2 * Math.PI * 9

// numbers(): who it goes to. send(payload) posts it and resolves or throws;
// the composer clears at once and puts the text back if sending fails.
export function composer({ numbers, send, draftKey = null, placeholder = 'Text Message' }) {
  const st = { template: null, scheduleAt: null, sim: null, personal: false, busy: false }
  const area = h('textarea', { rows: 1, placeholder, 'aria-label': 'Message', enterkeyhint: 'send', autocomplete: 'off', spellcheck: 'true', maxlength: '1600' })
  const ring = h('span.ring.idle', { 'aria-hidden': 'true', html: `<svg width="22" height="22" viewBox="0 0 22 22"><circle class="r0" cx="11" cy="11" r="9"/><circle class="r1" cx="11" cy="11" r="9" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><i class="num"></i>` })
  const sendBtn = h('button.send', { type: 'submit', 'aria-label': 'Send' }, ic('up', 19, 2.6))
  const field = h('label.field', area, ring, sendBtn)
  const plus = h('button.plus', { type: 'button', 'aria-label': 'Templates, send later and SIM', 'aria-expanded': 'false', onclick: more }, ic('plus', 21, 2.2))
  const callout = h('div')
  const attach = h('div.attach')
  const meta = h('div.compose-meta.num', { 'aria-live': 'polite' })
  const row = h('div.compose-row', plus, field)
  const form = h('form.composer', { onsubmit: submit }, callout, attach, row, meta)
  let blockedBar = null

  if (draftKey) {
    try { area.value = localStorage.getItem('zend:draft:' + draftKey) || '' } catch {}
  }

  area.addEventListener('input', () => {
    if (st.template && area.value !== st.template.text) st.template = null
    st.personal = false
    grow()
    update()
    saveDraft()
  })
  area.addEventListener('keydown', (event) => {
    // Enter sends with a keyboard; Shift+Enter (and Enter on a phone) adds a line.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  field.addEventListener('click', (event) => { if (event.target === field) area.focus() })

  function saveDraft() {
    if (!draftKey) return
    try {
      if (area.value.trim()) localStorage.setItem('zend:draft:' + draftKey, area.value)
      else localStorage.removeItem('zend:draft:' + draftKey)
    } catch {}
  }

  function grow() {
    area.style.height = '32px'
    area.style.height = Math.min(area.scrollHeight, 172) + 'px'
  }

  const phone = () => store.state && store.state.phone

  function blocked() {
    const list = numbers()
    return list.length === 1 && (store.threads || []).some(t => t.number === list[0] && t.optedOut)
  }

  function update() {
    const isBlocked = blocked()
    if (isBlocked && !blockedBar) {
      blockedBar = h('div.blocked-bar', ic('ban', 20, 1.9), h('span.grow', 'They replied STOP, so Zend won’t text this number.'),
        h('button.btn.small.tinted', { type: 'button', onclick: () => form.dispatchEvent(new CustomEvent('allow')) }, 'Allow again'))
      row.replaceWith(blockedBar)
      meta.hidden = true
      callout.replaceChildren()
      attach.replaceChildren()
      return
    }
    if (!isBlocked && blockedBar) { blockedBar.replaceWith(row); blockedBar = null; meta.hidden = false }
    if (isBlocked) return

    const text = area.value
    const size = segments(text.trim() ? text : '')
    const sig = signals(text)
    const within = size.parts ? size.units - (size.parts - 1) * size.perPart : 0
    ring.classList.toggle('idle', !size.parts)
    ring.classList.toggle('warn', size.parts > 1 && size.parts <= MAX_PARTS)
    ring.classList.toggle('bad', size.parts > MAX_PARTS)
    ring.querySelector('.r1').setAttribute('stroke-dashoffset', String(RING - RING * Math.min(1, within / size.perPart)))
    ring.querySelector('i').textContent = size.parts > 1 ? Math.min(size.parts, 99) : ''
    const held = (sig.business && !st.personal) || size.parts > MAX_PARTS || !numbers().length
    field.classList.toggle('ready', Boolean(text.trim()))
    field.classList.toggle('held', held)
    sendBtn.setAttribute('aria-label', st.scheduleAt ? 'Schedule' : 'Send')

    // A text that reads like business needs a word from the person first.
    if (sig.business && !st.personal) {
      const kind = sig.otp ? 'otp' : 'promo'
      if (callout.dataset.kind !== kind) {
        callout.dataset.kind = kind
        fill(callout, h('div.callout', { role: 'status' },
          ic('hand', 22, 1.8),
          h('div.grow',
            h('b', sig.otp ? 'This looks like a one-time code' : 'This reads like a promotion'),
            h('p', 'In India, offers, OTPs and alerts from a business must come from a registered sender. From your own SIM, send only personal texts.'),
            h('div.acts', h('button.btn.small.dark', { type: 'button', onclick: () => { st.personal = true; callout.dataset.kind = ''; update(); area.focus() } }, 'It’s personal')))))
      }
    } else if (callout.firstChild) {
      callout.dataset.kind = ''
      callout.replaceChildren()
    }

    // What's attached: a template, a time, or the offer to wait for morning.
    const pills = []
    if (st.template) pills.push(h('span.pill', ic('templates', 15, 2), st.template.name, h('button.x', { type: 'button', 'aria-label': 'Stop using this template', onclick: () => { st.template = null; update() } }, ic('x', 14, 2.4))))
    if (st.scheduleAt) {
      pills.push(h('span.pill', ic('clock', 15, 2), 'Sends ' + when(st.scheduleAt), h('button.x', { type: 'button', 'aria-label': 'Send now instead', onclick: () => { st.scheduleAt = null; update() } }, ic('x', 14, 2.4))))
    } else {
      const hour = ist(Date.now()).hour
      if ((hour >= 22 || hour < 7) && text.trim() && numbers().some(isIndian)) {
        pills.push(h('button.pill.offer', { type: 'button', onclick: () => { st.scheduleAt = nextIstHour(Date.now(), 8); update(); haptic(6) } }, ic('moon', 15, 2), 'It’s late there. Send at 8 AM?'))
      }
    }
    const key = pills.map(p => p.textContent).join('|')
    if (attach.dataset.key !== key) { attach.dataset.key = key; fill(attach, pills) }

    // The line under the field: the SIM, and how many SMS this takes.
    const p = phone()
    if (!p) { fill(meta, ''); return }
    const sim = st.sim || p.defaultSim
    const simName = sim ? `SIM ${sim}${carrier(p, sim) ? ` · ${carrier(p, sim)}` : ''}` : (p.kind === 'demo' ? 'Demo phone' : p.name)
    const parts = size.parts > MAX_PARTS
      ? h('span', { style: { color: 'var(--red-text)' } }, `Too long: ${size.parts} SMS, at most ${MAX_PARTS}`)
      : size.parts ? `${size.parts} SMS · ${size.left} left${size.encoding === 'Unicode' ? ' · Unicode' : ''}` : null
    fill(meta, p.sims && p.sims.length > 1 ? h('button', { type: 'button', onclick: pickSim, title: 'Change SIM' }, simName) : simName, parts ? ' · ' : null, parts)
  }

  async function submit(event) {
    event.preventDefault()
    if (st.busy || blocked()) return
    const text = area.value.trim()
    if (!text) return
    if (field.classList.contains('held')) {
      sound.error()
      nope(field)
      if (!numbers().length) toast('Add who it goes to first.', { kind: 'bad' })
      else if (callout.firstChild) callout.firstChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }], { duration: 260 })
      return
    }
    const payload = st.template
      ? { template: { id: st.template.id, vars: st.template.vars } }
      : { body: text }
    Object.assign(payload, { sim: st.sim, personal: st.personal, scheduleAt: st.scheduleAt ? new Date(st.scheduleAt).toISOString() : null })
    const before = { value: area.value, template: st.template, scheduleAt: st.scheduleAt, personal: st.personal }
    const from = field.getBoundingClientRect()
    area.value = ''
    st.template = null
    st.scheduleAt = null
    st.personal = false
    grow()
    update()
    saveDraft()
    sound.send()
    haptic(10)
    st.busy = true
    try {
      await send(payload, { text, from })
    } catch (error) {
      // Put it back so nothing is lost.
      area.value = before.value
      st.template = before.template
      st.scheduleAt = before.scheduleAt
      st.personal = before.personal
      grow()
      update()
      saveDraft()
      sound.error()
      if (error.code === 'needs_dlt') { st.personal = false; update() }
      toast(error.message, { kind: 'bad', ms: 6000 })
    } finally {
      st.busy = false
    }
  }

  async function more() {
    plus.setAttribute('aria-expanded', 'true')
    const p = phone()
    const choice = await sheet({
      title: 'Add to this text',
      cancel: null,
      done: 'Done',
      plain: true,
      body: (close) => [
        h('div.group.icons',
          h('button.item', { type: 'button', onclick: () => close('template') }, h('span.sq.indigo', ic('templates', 17, 2)), h('span.t', 'Use a template', h('small', 'A saved text with blanks to fill')), ic('next', 18, 2)),
          h('button.item', { type: 'button', onclick: () => close('later') }, h('span.sq.orange', ic('clock', 17, 2)), h('span.t', st.scheduleAt ? 'Change the time' : 'Send later', h('small', st.scheduleAt ? 'Sends ' + when(st.scheduleAt) : 'Your phone holds it until then')), ic('next', 18, 2))),
        p && p.sims && p.sims.length > 1 ? h('div.section', h('div.section-head', h('h2', 'Send from')),
          segmented([{ value: null, label: 'Phone’s choice' }, ...p.sims.map(s => ({ value: s.slot, label: `SIM ${s.slot}` }))], st.sim, (v) => { st.sim = v; update() }, { label: 'SIM' }),
          h('p.section-foot', p.sims.map(s => `SIM ${s.slot}: ${s.carrier || 'unknown carrier'}`).join(' · '))) : null
      ]
    })
    plus.setAttribute('aria-expanded', 'false')
    if (choice === 'template') pickTemplate()
    else if (choice === 'later') pickTime()
  }

  async function pickSim() {
    const p = phone()
    const order = [null, ...p.sims.map(s => s.slot)]
    st.sim = order[(order.indexOf(st.sim) + 1) % order.length]
    haptic(5)
    update()
  }

  async function pickTime() {
    const tomorrow = (hour) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d.getTime() }
    const tonight = () => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.getTime() }
    const options = [
      ['In an hour', Date.now() + HOUR],
      tonight() > Date.now() + HOUR ? ['This evening', tonight()] : null,
      ['Tomorrow morning', tomorrow(8)],
      ['Tomorrow evening', tomorrow(18)]
    ].filter(Boolean)
    const local = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * MIN).toISOString().slice(0, 16)
    const input = h('input.input', { type: 'datetime-local', 'aria-label': 'Date and time', value: local(st.scheduleAt || tomorrow(9)), min: local(Date.now() + 2 * MIN), max: local(Date.now() + 29 * 86400000) })
    const picked = await sheet({
      title: 'Send later',
      done: 'Schedule',
      onDone: (close) => close(new Date(input.value).getTime()),
      body: (close) => [
        h('div.group', options.map(([name, at]) => h('button.item', { type: 'button', onclick: () => close(at) }, h('span.t', name), h('span.value.num', when(at).replace(/^today at |^tomorrow at /, ''))))),
        h('div.section', h('div.section-head', h('h2', 'Pick a time')), h('div.group', input),
          h('p.section-foot', 'Your phone holds the text and sends it then, even with Zend closed. Keep the phone on and online.'))
      ]
    })
    if (picked === undefined || picked === null) return
    if (!Number.isFinite(picked) || picked < Date.now() + MIN) { toast('Pick a time at least a minute from now.', { kind: 'bad' }); return }
    if (picked > Date.now() + 30 * 86400000) { toast('Pick a time within 30 days.', { kind: 'bad' }); return }
    st.scheduleAt = picked
    update()
    area.focus({ preventScroll: true })
  }

  async function pickTemplate() {
    let list = store.templates
    if (!list) list = await loadTemplates().catch(() => [])
    const chosen = await sheet({
      title: 'Templates',
      body: (close) => list.length
        ? [h('div.group', list.map(t => h('button.item', { type: 'button', onclick: () => close(t) }, h('span.t', h('span', { style: { 'font-weight': '600' } }, t.name), h('small', blanks(t.body))), ic('next', 18, 2))))]
        : [h('div.empty', { style: { padding: '24px 8px' } }, h('span.glyph', ic('templates', 32, 1.6)), h('h2', 'No templates yet'), h('p', 'Save texts you send often, with blanks to fill in each time.'),
          h('a.btn.primary', { href: '/templates', 'data-link': '', onclick: () => close() }, 'Make a template'))]
    })
    if (!chosen) return
    const filled = await fillIn(chosen)
    if (!filled) return
    area.value = filled.text
    st.template = { id: chosen.id, name: chosen.name, vars: filled.vars, text: filled.text }
    grow()
    update()
    saveDraft()
    area.focus({ preventScroll: true })
  }

  requestAnimationFrame(() => { grow(); update() })
  return {
    el: form,
    focus: () => area.focus({ preventScroll: true }),
    refresh: update,
    set: (text) => { area.value = text; grow(); update() },
    onAllow: (fn) => form.addEventListener('allow', fn)
  }
}

const carrier = (p, slot) => { const s = (p.sims || []).find(x => x.slot === slot); return s && s.carrier }

// A template's text with each blank drawn as a small pill.
export function blanks(body) {
  return parseTemplate(body).parts.map(p => (p.text != null ? p.text : h('span.blank', VAR_TYPES[p.type].toLowerCase())))
}

// Fill a template's blanks in place, in the sentence itself.
function fillIn(t) {
  const { parts, vars } = parseTemplate(t.body)
  if (!vars.length) return Promise.resolve({ vars: [], text: t.body })
  const inputs = []
  const preview = h('p.section-foot', { style: { margin: '0 4px' } })
  const sentence = h('p', { style: { margin: 0, 'font-size': '17px', 'line-height': '2.3', 'letter-spacing': '-.012em' } }, parts.map(p => {
    if (p.text != null) return p.text
    const numeric = p.type === 'numeric' || p.type === 'cbn'
    const input = h('input.input', {
      type: p.type === 'email' ? 'email' : 'text', inputmode: numeric ? 'numeric' : null, maxlength: String(VAR_MAX),
      placeholder: VAR_TYPES[p.type].toLowerCase(), 'aria-label': VAR_TYPES[p.type], autocomplete: 'off',
      style: { display: 'inline-block', width: numeric ? '96px' : '160px', height: '36px', padding: '0 10px', margin: '0 3px', 'vertical-align': 'baseline', 'font-size': '16px', background: 'var(--accent-soft)' }
    })
    input.addEventListener('input', refresh)
    inputs.push({ input, type: p.type })
    return input
  }))
  function refresh() {
    const filled = fillTemplate(t.body, inputs.map(i => i.input.value))
    const size = segments(filled.text)
    preview.textContent = `${size.parts} SMS. Each blank holds up to ${VAR_MAX} characters.`
  }
  refresh()
  setTimeout(() => inputs[0] && inputs[0].input.focus({ preventScroll: true }), wide() ? 60 : 480)
  return sheet({
    title: t.name,
    done: 'Use',
    onDone: (close) => {
      const values = inputs.map(i => i.input.value.trim())
      const bad = inputs.findIndex((i, k) => checkValue(i.type, values[k]))
      if (bad >= 0) {
        sound.error()
        nope(inputs[bad].input)
        inputs[bad].input.focus()
        toast(checkValue(inputs[bad].type, values[bad]), { kind: 'bad' })
        return
      }
      close({ vars: values, text: fillTemplate(t.body, values).text })
    },
    body: () => [h('div.group', { style: { padding: '12px 16px' } }, sentence), preview]
  })
}
