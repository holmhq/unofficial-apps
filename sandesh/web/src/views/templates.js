// Templates: texts sent often, with blanks to fill in. Written the way
// India's DLT system expects, and checked against its rules as you type.

import { h, ic, toast, sheet, confirm, fill } from '../dom.js'
import * as api from '../api.js'
import { store, on, loadTemplates } from '../store.js'
import { renderBlanks } from '../composer.js'
import { checkTemplate, VAR_TYPES, VAR_MAX } from '../sms.js'
import { footer } from '../app.js'

export function templates() {
  const list = h('div', h('div.skeleton'), h('div.skeleton'))
  const page = h('div.page',
    h('div.page-head', h('h2', 'Templates'), h('button.btn.primary', { type: 'button', onclick: () => edit(null) }, ic('plus', 18), 'New template')),
    h('p.lede', 'Texts you send often, with blanks to fill in each time. They follow the rules India’s DLT system sets for business templates, so a template is ready to register if your use ever becomes a business one.'),
    list,
    h('div.section', { style: { marginTop: '28px' } },
      h('h3', 'Blanks you can use'),
      h('ul.checks', Object.entries(VAR_TYPES).filter(([k]) => k !== 'urlott').map(([key, name]) =>
        h('li.note', ic('info', 18), h('span', h('code.mono', `{#${key}#}`), ` ${name}, up to ${VAR_MAX} characters`))))),
    footer('phone-only'))
  const el = h('div.panel', page)

  function draw() {
    const items = store.templates
    if (!items) return
    if (!items.length) {
      fill(list, h('div.box.empty',
        ic('fileText', 40),
        h('h3', 'No templates yet'),
        h('p', 'Try one like “Hi {#var#}, running {#numeric#} minutes late. Start without me!”'),
        h('button.btn.primary', { type: 'button', onclick: () => edit(null) }, ic('plus', 18), 'New template')))
      return
    }
    fill(list, h('ul.list', items.map(t => h('li.tap', { onclick: () => edit(t) },
      h('div.grow',
        h('div.spread', h('b', t.name), t.check.ready ? h('span.ready', ic('check', 14), 'DLT-ready') : h('span.tag.amber', issueCount(t.check))),
        h('div.tpl-body', { style: { marginTop: '6px' } }, renderBlanks(t.body)),
        h('div.sub', { style: { marginTop: '6px' } }, t.uses ? `Used ${t.uses} ${t.uses === 1 ? 'time' : 'times'}` : 'Not used yet'))))))
  }

  const off = on((event) => { if (event.type === 'templates') draw() })
  loadTemplates().catch(error => fill(list, h('p.muted', error.message)))

  return { el, destroy: off }
}

function issueCount(check) {
  const n = check.issues.filter(i => i.level === 'warn' || i.level === 'error').length
  return n === 1 ? '1 thing to fix' : `${n} things to fix`
}

// Open the editor for template `t` (null for a new one). After a refused
// save it reopens with what was typed, so nothing is lost.
async function edit(t) {
  const existing = Boolean(t && t.id)
  const name = h('input.input', { value: t ? t.name : '', maxLength: 60, placeholder: 'Running late', autocomplete: 'off' })
  const body = h('textarea.area', { maxLength: 1000, placeholder: 'Hi {#var#}, running {#numeric#} minutes late. Start without me!' })
  body.value = t ? t.body : ''
  const checks = h('ul.checks')
  const size = h('p.faint')

  const insert = (token) => {
    const start = body.selectionStart ?? body.value.length
    const end = body.selectionEnd ?? body.value.length
    body.value = body.value.slice(0, start) + token + body.value.slice(end)
    body.focus()
    body.selectionStart = body.selectionEnd = start + token.length
    refresh()
  }

  function refresh() {
    const result = checkTemplate(body.value)
    const items = result.issues.map(i => h('li.' + i.level, ic(i.level === 'error' ? 'circleAlert' : i.level === 'warn' ? 'circleAlert' : 'info', 18), h('span', i.text)))
    if (body.value.trim()) {
      if (!result.issues.some(i => i.code === 'too_many_vars')) items.unshift(h('li.ok', ic('check', 18), h('span', `${result.vars.length} of 3 blanks`)))
      if (!result.issues.some(i => i.code === 'fixed_share') && result.vars.length) items.unshift(h('li.ok', ic('check', 18), h('span', `${Math.round(result.share * 100)}% fixed text (30% needed)`)))
      if (result.ready) items.unshift(h('li.ok', ic('shieldCheck', 18), h('span', 'DLT-ready: it meets the rules on blanks and fixed text')))
    }
    fill(checks, ...items)
    size.textContent = result.worst.parts ? `Up to ${result.worst.parts} SMS with every blank full (${result.worst.encoding})` : ''
  }
  body.addEventListener('input', refresh)
  refresh()

  const saved = await sheet(existing ? 'Edit template' : 'New template', (close) => ({
    body: [
      h('label.field', h('span', 'Name'), name),
      h('label.field', h('span', 'Text'), body),
      h('div.blank-tools', [['var', 'Any text'], ['numeric', 'Number'], ['alphanumeric', 'Letters and numbers'], ['url', 'Web address'], ['cbn', 'Call-back number']]
        .map(([key, text]) => h('button.chip', { type: 'button', onclick: () => insert(`{#${key}#}`) }, ic('plus', 14), text))),
      checks,
      size
    ],
    foot: [
      existing ? h('button.btn.quiet.danger', { type: 'button', onclick: () => close('delete') }, ic('trash2', 18), 'Delete') : null,
      h('button.btn.primary', { type: 'button', onclick: () => close('save') }, existing ? 'Save template' : 'Add template')
    ]
  }))

  try {
    if (saved === 'save') {
      const input = { name: name.value, body: body.value }
      if (existing) await api.patch(`/api/templates/${t.id}`, input)
      else await api.post('/api/templates', input)
      toast(existing ? 'Template saved' : 'Template added')
      loadTemplates()
    }
    if (saved === 'delete') {
      if (!await confirm('Delete this template?', `“${t.name}” goes for good. Texts already sent stay.`, { action: 'Delete' })) return
      await api.del(`/api/templates/${t.id}`)
      toast('Template deleted')
      loadTemplates()
    }
  } catch (error) {
    toast(error.message, { error: true, ms: 6000 })
    if (saved === 'save') edit({ ...(t || {}), name: name.value, body: body.value })
  }
}
