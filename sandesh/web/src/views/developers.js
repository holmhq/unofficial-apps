// API: keys for the member's own scripts, and how to use them.

import { h, ic, toast, sheet, confirm, ago, fill } from '../dom.js'
import * as api from '../api.js'
import { store } from '../store.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { footer } from '../app.js'

export function developers() {
  const keys = h('div', h('div.skeleton'))
  let fresh = null // a key made just now, shown in the examples until the page is left
  const examples = h('div.stack')
  const page = h('div.page',
    h('div.page-head', h('h2', 'API'), h('button.btn.primary', { type: 'button', onclick: create }, ic('keyRound', 18), 'New key')),
    h('p.lede', 'Text from your own scripts through your phone: a server that texts you when it goes down, a reminder to the family group. Keys follow the same daily limits as this page and refuse texts that read like OTPs or offers, which in India need a DLT-registered sender.'),
    keys,
    h('div.section', { style: { marginTop: '28px' } }, h('h3', 'Send a text'), examples),
    h('div.section', h('h3', 'Endpoints'), endpoints()),
    h('div.section', h('h3', 'When a send is refused'), refusals()),
    footer('phone-only'))
  const el = h('div.panel', page)

  async function load() {
    try {
      const { keys: list } = await api.get('/api/keys')
      draw(list)
    } catch (error) {
      fill(keys, h('p.muted', error.message))
    }
  }

  function draw(list) {
    if (!list.length) {
      fill(keys, h('div.box.empty', ic('keyRound', 40), h('h3', 'No keys yet'),
        h('p', store.state && store.state.phone ? 'Make one for each script, so you can switch one off without touching the rest.' : 'Connect your phone first; a key texts through it.'),
        store.state && store.state.phone
          ? h('button.btn.primary', { type: 'button', onclick: create }, ic('keyRound', 18), 'New key')
          : h('a.btn.primary', { href: '/phone', 'data-link': '' }, 'Connect a phone')))
      return
    }
    fill(keys, h('ul.list', list.map(k => h('li',
      h('span.icon-btn', { style: { background: 'var(--violet-soft)', color: 'var(--violet)' } }, ic('keyRound', 18)),
      h('div.grow',
        h('b', k.name),
        h('div.sub', h('span.mono', k.prefix + '…'), `, ${k.sends} ${k.sends === 1 ? 'text' : 'texts'}, used ${k.lastUsedAt ? ago(Date.parse(k.lastUsedAt)) : 'never'}`),
        k.allow.length ? h('div.sub', 'Only to ' + k.allow.map(formatPhone).join(', ')) : h('div.sub', 'To any number')),
      h('button.icon-btn', { type: 'button', 'aria-label': `Delete ${k.name}`, onclick: () => remove(k) }, ic('trash2', 18))))))
  }

  function drawExamples() {
    const key = fresh || 'sd_your_key'
    const origin = location.origin
    fill(examples, 
      h('pre.code', h('span.k', 'curl'), ` ${origin}/api/v1/messages \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Idempotency-Key: backup-2026-10-26" \\\n  -H "Content-Type: application/json" \\\n  -d `, h('span.s', `'{"to": "+919876543210", "body": "Backup finished at 2:00"}'`)),
      h('p.muted', 'Or fill a saved template: send ', h('code.mono', '{"to": "…", "template": {"id": "…", "vars": ["Asha", "10"]}}'),
        '. Add ', h('code.mono', '"scheduleAt"'), ' (an ISO time) to send later, or ', h('code.mono', '"sim": 2'), ' for the second SIM. ',
        'An Idempotency-Key makes a retry safe: the same key within 24 hours answers again without texting twice.'))
  }

  async function create() {
    if (!(store.state && store.state.phone)) {
      toast('Connect your phone first.', { error: true })
      return
    }
    const name = h('input.input', { maxLength: 60, placeholder: 'Server alerts', autocomplete: 'off' })
    const allow = h('input.input', { placeholder: '98765 43210, 91234 56789', inputMode: 'tel', autocomplete: 'off' })
    setTimeout(() => name.focus(), 50)
    const input = await sheet('New API key', (close) => ({
      body: [
        h('label.field', h('span', 'Name'), name, h('small', 'What uses it, so you know which to switch off.')),
        h('label.field', h('span', 'Only text these numbers (optional)'), allow,
          h('small', 'Up to 10, separated by commas. A key held to your own number can’t text anyone else, even if it leaks.'))
      ],
      foot: [h('button.btn.primary', { type: 'button', onclick: () => close({ name: name.value, allow: allow.value }) }, 'Make key')]
    }))
    if (!input) return
    const numbers = input.allow.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean)
    const bad = numbers.filter(v => !normalizePhone(v))
    if (bad.length) {
      toast(`Not a phone number: ${bad.join(', ')}`, { error: true })
      return
    }
    try {
      const made = await api.post('/api/keys', { name: input.name, allow: numbers })
      fresh = made.key
      drawExamples()
      load()
      reveal(made.key)
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  async function remove(k) {
    if (!await confirm(`Delete “${k.name}”?`, 'Anything using it stops working at once.', { action: 'Delete key' })) return
    try {
      await api.del(`/api/keys/${k.id}`)
      toast('Key deleted')
      load()
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  drawExamples()
  load()
  return { el, destroy() {} }
}

function reveal(key) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key)
      toast('Key copied')
    } catch {
      toast('Select the key and copy it.', { error: true })
    }
  }
  return sheet('Your new key', (close) => ({
    body: [
      h('p.muted', 'Copy it now: Sandesh keeps only a fingerprint of it and can’t show it again.'),
      h('div.secret', h('code', key), h('button.icon-btn', { type: 'button', 'aria-label': 'Copy key', onclick: copy }, ic('copy', 18)))
    ],
    foot: [h('button.btn.primary', { type: 'button', onclick: () => close() }, 'I’ve copied it')]
  }))
}

function endpoints() {
  const rows = [
    ['POST', '/api/v1/messages', 'Send a text to up to 10 numbers. Answers 202 with its id and each number’s state.'],
    ['GET', '/api/v1/messages/:id', 'Where a text has got to: queued, sent, delivered or failed.'],
    ['GET', '/api/v1/messages', 'Your recent texts, newest first (?limit= up to 100).'],
    ['GET', '/api/v1/replies', 'Texts people sent back (?since= an ISO time).'],
    ['GET', '/api/v1/templates', 'Your templates and their blanks.']
  ]
  return h('ul.list', rows.map(([method, path, text]) => h('li', h('div.grow',
    h('div', h('span.tag.violet', method), ' ', h('code.mono', path)),
    h('div.sub', { style: { marginTop: '4px' } }, text)))))
}

function refusals() {
  const rows = [
    ['401', 'unauthorized', 'The key is missing, wrong or deleted.'],
    ['403', 'not_allowed', 'The key is held to other numbers.'],
    ['409', 'opted_out', 'That person replied STOP.'],
    ['422', 'needs_dlt', 'It reads like an OTP or an offer: use a DLT-registered sender.'],
    ['429', 'bulk_limit', 'More than TRAI’s 20 similar texts in 24 hours (100 in 7 days, 300 in 30).'],
    ['429', 'daily_limit', 'Too many texts in 24 hours.'],
    ['429', 'people_limit', 'Too many different people in 24 hours.'],
    ['429', 'slow_down', 'More than 10 texts in a minute.']
  ]
  return h('ul.list', rows.map(([status, code, text]) => h('li', h('div.grow',
    h('div', h('span.tag', status), ' ', h('code.mono', code)),
    h('div.sub', { style: { marginTop: '4px' } }, text)))))
}
