// The composer under a conversation and on a new text: write, see how many
// SMS it takes, fill a template, pick a SIM, schedule, send.

import { h, ic, toast, sheet, when, fill } from './dom.js'
import * as api from './api.js'
import { store, loadTemplates, loadState, watch } from './store.js'
import { segments, signals, parseTemplate, fillTemplate, checkValue, VAR_TYPES, VAR_MAX, ist, nextIstHour, isIndian } from './sms.js'

const MAX_PARTS = 8

// numbers(): the numbers to send to. onSent(result) runs after a send.
export function composer({ numbers, onSent, placeholder = 'Write a text' }) {
  let template = null      // { id, body, vars, text } while the text is a filled template
  let scheduleAt = null
  let sim = null
  let personal = false
  let busy = false

  const area = h('textarea', { rows: 1, placeholder, 'aria-label': 'Message', enterkeyhint: 'send', maxlength: 1600 })
  const send = h('button.send', { type: 'submit', 'aria-label': 'Send', disabled: true }, ic('sendHorizontal', 22))
  const meter = h('div.meter', { 'aria-live': 'polite' })
  const notice = h('div.notice', { hidden: true })
  const tools = h('div.tools')
  const form = h('form.composer', { onsubmit: submit }, notice, tools, h('div.write', area, send), meter)

  area.addEventListener('input', () => {
    if (template && area.value !== template.text) template = null
    personal = false
    grow()
    update()
  })
  area.addEventListener('keydown', (event) => {
    // Enter sends on a computer; Shift+Enter (and Enter on a phone) adds a line.
    if (event.key === 'Enter' && !event.shiftKey && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  function grow() {
    area.style.height = 'auto'
    area.style.height = Math.min(area.scrollHeight + 2, 168) + 'px'
  }

  function update() {
    const text = area.value.trim()
    const size = segments(area.value)
    const sig = signals(text)
    fill(meter, 
      h('span', template ? `Template: ${template.name}` : ''),
      size.units === 0
        ? h('span', '')
        : size.parts > MAX_PARTS
          ? h('span.err', { style: { color: 'var(--red)' } }, `Too long: ${size.parts} SMS (${MAX_PARTS} at most)`)
          : h('span', { title: size.culprit ? `Unicode because of “${size.culprit}”` : '' },
            size.encoding === 'Unicode' ? h('span.uni', 'Unicode: ') : '',
            `${size.parts} SMS, ${size.left} characters left`)
    )
    if (sig.business) {
      const box = h('input', { type: 'checkbox', checked: personal, onchange: (e) => { personal = e.target.checked; ready() } })
      fill(notice, 
        h('b', sig.otp ? 'This looks like a one-time code.' : 'This reads like a promotion.'),
        h('span', 'In India, business texts (offers, OTPs, alerts) must come from a DLT-registered sender. From your own SIM, send only personal texts.'),
        h('label.check', box, h('span', "It's a personal message"))
      )
      notice.hidden = false
    } else {
      notice.hidden = true
    }
    drawTools()
    ready()
  }

  function ready() {
    const text = area.value.trim()
    const size = segments(text)
    const sig = signals(text)
    send.disabled = busy || !text || size.parts > MAX_PARTS || (sig.business && !personal) || !numbers().length
  }

  function drawTools() {
    const phone = store.state && store.state.phone
    const sims = (phone && phone.sims) || []
    const chips = [h('button.chip' + (template ? '.on' : ''), { type: 'button', onclick: pickTemplate }, ic('fileText', 16), 'Template')]
    if (scheduleAt) {
      chips.push(h('button.chip.on', { type: 'button', onclick: pickTime, title: 'Change' }, ic('calendarClock', 16), when(new Date(scheduleAt).toISOString()),
        h('span.x', { role: 'button', 'aria-label': 'Send now instead', onclick: (e) => { e.stopPropagation(); scheduleAt = null; update() } }, ic('x', 15))))
    } else {
      chips.push(h('button.chip', { type: 'button', onclick: pickTime }, ic('clock3', 16), 'Later'))
      const hour = ist(Date.now()).hour
      if ((hour >= 22 || hour < 7) && numbers().some(isIndian)) {
        chips.push(h('button.chip.warn', { type: 'button', onclick: () => { scheduleAt = nextIstHour(Date.now(), 8); update() } }, ic('moon', 16), "It's late in India. Send at 8 am?"))
      }
    }
    if (sims.length > 1) {
      const current = sim || (phone && phone.defaultSim) || null
      const name = (slot) => {
        const s = sims.find(x => x.slot === slot)
        return s ? `SIM ${s.slot}${s.carrier ? ` (${s.carrier})` : ''}` : 'Default SIM'
      }
      chips.push(h('button.chip', {
        type: 'button',
        title: 'Switch SIM',
        onclick: () => {
          const slots = [null, ...sims.map(s => s.slot)]
          sim = slots[(slots.indexOf(sim) + 1) % slots.length]
          drawTools()
        }
      }, ic('smartphone', 16), sim ? name(sim) : current ? name(current) : 'Default SIM'))
    }
    fill(tools, ...chips)
  }

  async function submit(event) {
    event.preventDefault()
    if (send.disabled) return
    busy = true
    ready()
    const body = template
      ? { template: { id: template.id, vars: template.vars } }
      : { body: area.value.trim() }
    try {
      const result = await api.post('/api/messages', {
        to: numbers(), ...body, sim, personal,
        scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : null
      })
      area.value = ''
      template = null
      scheduleAt = null
      personal = false
      grow()
      if (store.state) store.state.usage = result.usage
      watch()
      onSent(result)
    } catch (error) {
      toast(error.message, { error: true, ms: 6000 })
      if (error.code === 'no_phone') loadState()
    } finally {
      busy = false
      update()
    }
  }

  async function pickTime() {
    const now = Date.now()
    const tomorrow = (hour) => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(hour, 0, 0, 0)
      return d.getTime()
    }
    const options = [
      ['In an hour', now + 3600000],
      ['Tomorrow, 8 am', tomorrow(8)],
      ['Tomorrow, 10 am', tomorrow(10)]
    ]
    const local = (ms) => {
      const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
      return d.toISOString().slice(0, 16)
    }
    const input = h('input.input', { type: 'datetime-local', min: local(now + 120000), value: local(scheduleAt || tomorrow(9)) })
    const picked = await sheet('Send later', (close) => ({
      body: [
        h('p.muted', "Your phone holds the text and sends it at the time you pick, even if this page is closed. Keep the phone on and online."),
        h('div.stack', options.map(([name, at]) => h('button.btn', { type: 'button', onclick: () => close(at) }, ic('clock3', 18), name, h('span.faint', when(new Date(at).toISOString()))))),
        h('label.field', h('span', 'Or pick a time'), input)
      ],
      foot: [
        scheduleAt ? h('button.btn.quiet', { type: 'button', onclick: () => close(null) }, 'Send now instead') : null,
        h('button.btn.primary', { type: 'button', onclick: () => close(new Date(input.value).getTime()) }, 'Schedule')
      ]
    }))
    if (picked === undefined) return
    if (picked !== null && (!Number.isFinite(picked) || picked < Date.now() + 60000)) {
      toast('Pick a time at least a minute from now.', { error: true })
      return
    }
    scheduleAt = picked
    update()
  }

  async function pickTemplate() {
    const list = store.templates || await loadTemplates().catch(() => [])
    const chosen = await sheet('Use a template', (close) => ({
      body: list.length
        ? h('ul.list', list.map(t => h('li.tap', { onclick: () => close(t) },
          h('div.grow', h('b', t.name), h('div.tpl-body', renderBlanks(t.body))), ic('chevronRight'))))
        : h('div.empty', h('h3', 'No templates yet'), h('p', 'Save texts you send often, with blanks to fill in each time.'),
          h('a.btn.primary', { href: '/templates', 'data-link': '', onclick: () => close() }, ic('plus', 18), 'Make a template'))
    }))
    if (!chosen) return
    const filled = await fillSheet(chosen)
    if (!filled) return
    template = { id: chosen.id, name: chosen.name, vars: filled.vars, text: filled.text }
    area.value = filled.text
    grow()
    update()
    area.focus()
  }

  update()
  return {
    el: form,
    focus: () => area.focus(),
    refresh: update
  }
}

// Template text with each blank drawn as a dotted fill-in line.
export function renderBlanks(body) {
  return parseTemplate(body).parts.map(p => (p.text != null ? p.text : h('span.blank', VAR_TYPES[p.type])))
}

// Fill a template's blanks in place, as a sentence with gaps.
function fillSheet(t) {
  const { parts, vars } = parseTemplate(t.body)
  if (!vars.length) return Promise.resolve({ vars: [], text: t.body })
  const inputs = []
  const preview = h('p.faint')
  const sentence = h('p.fill-text', parts.map(p => {
    if (p.text != null) return p.text
    const input = h('input' + (p.type === 'numeric' ? '.short' : ''), {
      type: p.type === 'numeric' ? 'text' : p.type === 'email' ? 'email' : 'text',
      inputMode: p.type === 'numeric' || p.type === 'cbn' ? 'numeric' : undefined,
      maxLength: VAR_MAX,
      placeholder: VAR_TYPES[p.type],
      'aria-label': VAR_TYPES[p.type],
      oninput: refresh
    })
    inputs.push({ input, type: p.type })
    return input
  }))
  function refresh() {
    for (const { input, type } of inputs) input.classList.toggle('bad', Boolean(input.value) && Boolean(checkValue(type, input.value.trim())))
    const filled = fillTemplate(t.body, inputs.map(i => i.input.value))
    const size = segments(filled.text)
    preview.textContent = `${size.parts} SMS. Each blank holds up to ${VAR_MAX} characters.`
  }
  refresh()
  setTimeout(() => inputs[0] && inputs[0].input.focus(), 50)
  return sheet(t.name, (close) => ({
    body: [h('div.fill', sentence, preview)],
    foot: [h('button.btn.primary', {
      type: 'button',
      onclick: () => {
        const values = inputs.map(i => i.input.value.trim())
        const filled = fillTemplate(t.body, values)
        const first = Object.keys(filled.errors)[0]
        if (first != null) {
          inputs[first].input.classList.add('bad')
          inputs[first].input.focus()
          toast(filled.errors[first], { error: true })
          return
        }
        close({ vars: values, text: filled.text })
      }
    }, 'Use this text')]
  }))
}
