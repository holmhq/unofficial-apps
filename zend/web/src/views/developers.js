// API: keys for your own scripts, and how to use them. A key is shown once;
// the server keeps only its hash.

import { h, fill, ic, sheet, confirm, toast, collapsing, copyText, listWhen, segmented, nope } from '../ui.js'
import { store, loadState } from '../store.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { sound } from '../sound.js'
import { accountButton, go } from '../main.js'
import * as api from '../api.js'

export function developers() {
  const keys = h('div')
  const origin = location.origin
  const samples = {
    curl: [
      ['c', '# Send a text\n'],
      ['', `curl ${origin}/api/v1/messages \\\n  -H "Authorization: Bearer `], ['k', '$ZEND_KEY'], ['', '" \\\n  -H "Idempotency-Key: '], ['s', 'disk-alert-0412'], ['', '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"to": "'], ['s', '+919845011223'], ['', '", "body": "'], ['s', 'nas-01: disk 91% full'], ['', '"}\'']
    ],
    JavaScript: [
      ['', `await fetch('${origin}/api/v1/messages', {\n  method: 'POST',\n  headers: {\n    authorization: \`Bearer \${process.env.`], ['k', 'ZEND_KEY'], ['', '}`,\n    \'content-type\': \'application/json\'\n  },\n  body: JSON.stringify({ to: '], ['s', "'+919845011223'"], ['', ', body: '], ['s', "'nas-01: disk 91% full'"], ['', ' })\n})']
    ],
    Python: [
      ['', 'import os, requests\n\nrequests.post(\n    '], ['s', `"${origin}/api/v1/messages"`], ['', ',\n    headers={"Authorization": f"Bearer {os.environ[\'' ], ['k', 'ZEND_KEY'], ['', '\']}"},\n    json={"to": '], ['s', '"+919845011223"'], ['', ', "body": '], ['s', '"nas-01: disk 91% full"'], ['', '},\n)']
    ]
  }
  const code = h('pre.code', { tabindex: '0', 'aria-label': 'Example request' })
  let lang = 'curl'
  const drawCode = () => fill(code, samples[lang].map(([cls, text]) => (cls ? h('span.' + cls, text) : text)))
  drawCode()
  const copyBtn = h('button.btn.small.tinted', { type: 'button', onclick: () => copyText(code.textContent, 'Example copied') }, ic('copy', 15, 2.2), 'Copy')

  const panel = h('div.panel.page-wrap',
    h('div.page.fade-in',
      h('h1.large-title', 'API'),
      h('p.lede', 'Text from your own scripts, such as a server that texts you when its disk fills up. A key follows every limit and rule this page does, and can be held to a few numbers.'),
      keys,
      h('div.section',
        h('div.section-head', h('h2', 'Send a text'), copyBtn),
        h('div', { style: { 'margin-bottom': '10px' } }, segmented(Object.keys(samples).map(l => ({ value: l, label: l })), lang, (v) => { lang = v; drawCode() }, { label: 'Language' })),
        code,
        h('p.section-foot', 'The same Idempotency-Key within 24 hours returns the first answer instead of texting twice. Texts that read like an OTP or an offer are refused with needs_dlt.')),
      h('div.section',
        h('div.section-head', h('h2', 'Endpoints')),
        h('div.group', [
          ['POST', '/api/v1/messages', 'Send to up to 10 numbers: to, body or template, sim, scheduleAt'],
          ['GET', '/api/v1/messages/:id', 'Where each number’s copy has got to'],
          ['GET', '/api/v1/messages', 'Recent texts, newest first'],
          ['GET', '/api/v1/replies', 'Texts people sent you (?since=)'],
          ['GET', '/api/v1/templates', 'Your templates and their blanks']
        ].map(([verb, path, what]) => h('div.item', { style: { 'align-items': 'flex-start' } },
          h('code', { style: { 'font-family': 'var(--mono)', 'font-size': '11.5px', 'font-weight': '700', width: '38px', 'margin-top': '3px', color: verb === 'POST' ? 'var(--accent-text)' : 'var(--ink-2)' } }, verb),
          h('span.t', h('code', { style: { 'font-family': 'var(--mono)', 'font-size': '14px' } }, path), h('small', what))))))))
  const bar = h('header.bar.grouped', h('span.small-title', 'API'), h('span.right', accountButton()))
  collapsing(bar, panel)

  async function draw() {
    try {
      const { keys: list } = await api.get('/api/keys')
      const phone = store.state && store.state.phone
      fill(keys, h('div.section',
        h('div.section-head', h('h2', 'Your keys'), phone ? h('button.btn.small.tinted', { type: 'button', onclick: () => create(draw) }, ic('plus', 15, 2.4), 'New key') : null),
        list.length
          ? h('div.group.icons', list.map(k => h('div.item',
            h('span.sq.gray', ic('key', 16, 2.2)),
            h('span.t', h('span', { style: { 'font-weight': '600' } }, k.name),
              h('small.num', `${k.prefix}… · ${k.allow.length ? 'only ' + k.allow.map(formatPhone).join(', ') : 'any number'}`),
              h('small.num', k.lastUsedAt ? `Used ${listWhen(k.lastUsedAt).toLowerCase()} · ${k.sends} ${k.sends === 1 ? 'text' : 'texts'}` : 'Not used yet')),
            h('button.icon-btn', { type: 'button', 'aria-label': `Delete ${k.name}`, style: { color: 'var(--red-text)' }, onclick: async () => {
              if (!await confirm({ title: `Delete “${k.name}”?`, text: 'Scripts using it stop working at once.', action: 'Delete key' })) return
              try { await api.del(`/api/keys/${encodeURIComponent(k.id)}`); toast('Key deleted'); draw() } catch (error) { toast(error.message, { kind: 'bad' }) }
            } }, ic('trash', 19, 1.9)))))
          : h('div.group', h('div.item', h('span.t.muted', phone ? 'No keys yet. Make one for each script, so you can stop one without the others.' : 'Connect a phone before making a key.'),
            phone ? null : h('button.btn.small.tinted', { type: 'button', onclick: () => go('/phone') }, 'Connect')))))
    } catch (error) {
      fill(keys, h('div.group', h('div.item.muted', error.message)))
    }
  }
  draw()
  if (!store.state) loadState().catch(() => {})
  return { el: h('div', { style: { display: 'contents' } }, bar, panel) }
}

async function create(redraw) {
  const name = h('input.input', { type: 'text', placeholder: 'Home server alerts', maxlength: '60', 'aria-label': 'Name', autocomplete: 'off', autofocus: true })
  const allow = h('input.input', { type: 'text', inputmode: 'tel', placeholder: 'Any number', 'aria-label': 'Only these numbers', autocomplete: 'off' })
  const made = await sheet({
    title: 'New API key',
    done: 'Create',
    onDone: async (close) => {
      const numbers = allow.value.split(/[,;\s]+(?=[+\d])/).map(s => s.trim()).filter(Boolean)
      const bad = numbers.find(n => !normalizePhone(n))
      if (bad) { sound.error(); nope(allow); toast(`“${bad}” isn’t a phone number.`, { kind: 'bad' }); return }
      try {
        close(await api.post('/api/keys', { name: name.value, allow: numbers }))
      } catch (error) {
        sound.error()
        toast(error.message, { kind: 'bad' })
      }
    },
    body: () => [
      h('div.section', h('div.section-head', h('h2', 'Name')), h('div.group', name), h('p.section-foot', 'What the script is, so you know which key to delete if you stop using it.')),
      h('div.section', h('div.section-head', h('h2', 'Only these numbers')), h('div.group', allow), h('p.section-foot', 'Optional. A key held to a few numbers can’t text anyone else, even if it leaks. Separate numbers with commas.'))
    ]
  })
  if (!made) return
  redraw()
  sheet({
    title: 'Your new key',
    cancel: null,
    done: 'Done',
    body: () => [
      h('div', { style: { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '8px', 'text-align': 'center' } },
        h('span.sq.green', { style: { width: '52px', height: '52px', 'border-radius': '14px' } }, ic('key', 26, 2)),
        h('b', { style: { 'font-size': '19px', 'margin-top': '6px' } }, made.record.name),
        h('p.muted', { style: { margin: 0, 'font-size': '15px', 'line-height': '1.5' } }, 'Copy it now. This is the only time it’s shown; Zend keeps only a fingerprint of it.')),
      h('div.keybox.selectable', h('span.grow', made.key), h('button.btn.small.primary', { type: 'button', onclick: () => copyText(made.key, 'Key copied') }, ic('copy', 15, 2.2), 'Copy'))
    ]
  })
}
