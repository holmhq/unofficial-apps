// Templates: texts you send often, with {#var#} blanks to fill in, checked
// against the rules India's DLT system sets for business templates.

import { h, fill, ic, sheet, confirm, toast, collapsing, nope } from '../ui.js'
import { store, on, loadTemplates } from '../store.js'
import { checkTemplate, VAR_TYPES, VAR_MAX, VAR_LIMIT } from '../sms.js'
import { blanks } from '../composer.js'
import { sound } from '../sound.js'
import { accountButton } from '../main.js'
import * as api from '../api.js'

export function templates() {
  const list = h('div')
  const panel = h('div.panel.page-wrap',
    h('div.page.fade-in',
      h('h1.large-title', 'Templates'),
      h('p.lede', 'Texts you send often, with blanks to fill in each time. Zend checks them against the rules for registered business templates, so one is ready if you ever need it.'),
      list,
      h('div.section',
        h('div.section-head', h('h2', 'Blanks')),
        h('div.group', Object.entries(VAR_TYPES).slice(0, 4).map(([type, name]) => h('div.item',
          h('code', { style: { 'font-family': 'var(--mono)', 'font-size': '14px', width: '128px', color: 'var(--accent-text)' } }, `{#${type}#}`),
          h('span.t', name)))),
        h('p.section-foot', `Up to ${VAR_LIMIT} blanks of ${VAR_MAX} characters each, with at least 30% of the text fixed.`))))
  const bar = h('header.bar.grouped',
    h('span.small-title', 'Templates'),
    h('span.right', h('button.icon-btn', { type: 'button', 'aria-label': 'New template', title: 'New template', onclick: () => edit(null) }, ic('plus', 25, 2)), accountButton()))
  collapsing(bar, panel)

  function draw() {
    const items = store.templates
    if (!items) {
      fill(list, h('div.group', Array.from({ length: 3 }, () => h('div.item', h('span.t', h('span.shimmer', { style: { width: '40%', height: '15px' } }), h('span.shimmer', { style: { width: '85%', height: '13px', 'margin-top': '6px' } }))))))
      return
    }
    if (!items.length) {
      fill(list, h('div.group', h('div.empty', { style: { padding: '36px 24px' } },
        h('span.glyph', ic('templates', 32, 1.6)),
        h('h2', 'No templates yet'),
        h('p', 'Save a text like “Running about {#numeric#} minutes late” and fill in the blank when you send it.'),
        h('button.btn.primary', { type: 'button', onclick: () => edit(null) }, ic('plus', 18, 2.2), 'New template'))))
      return
    }
    fill(list, h('div.section',
      h('div.section-head', h('h2', `${items.length} saved`)),
      h('div.group', items.map(t => h('button.item', { type: 'button', onclick: () => edit(t) },
        h('span.t',
          h('span', { style: { 'font-weight': '600' } }, t.name),
          h('small', { style: { 'line-height': '1.7' } }, blanks(t.body)),
          h('span', { style: { display: 'flex', gap: '6px', 'margin-top': '6px' } },
            t.check.ready ? h('span.tag.good', ic('check', 12, 3), 'DLT-ready') : h('span.tag.warn', 'Needs work'),
            t.uses ? h('span.tag.num', `Used ${t.uses} ${t.uses === 1 ? 'time' : 'times'}`) : null)),
        ic('next', 18, 2))))))
  }

  const off = on((event) => { if (event.type === 'templates') draw() })
  draw()
  loadTemplates().catch((error) => toast(error.message, { kind: 'bad' }))
  return { el: h('div', { style: { display: 'contents' } }, bar, panel), destroy: off }
}

async function edit(t) {
  const name = h('input.input', { type: 'text', value: t ? t.name : '', placeholder: 'Running late', maxlength: '60', 'aria-label': 'Name', autocomplete: 'off', autofocus: !t })
  const body = h('textarea.input', { placeholder: 'Running about {#numeric#} minutes late, sorry! See you at {#var#}.', 'aria-label': 'Message', rows: 5 })
  body.value = t ? t.body : ''
  const checks = h('div.group')
  const draw = () => {
    const result = checkTemplate(body.value)
    const items = result.issues.map(i => h('div.item', { style: { 'font-size': '15px', 'align-items': 'flex-start' } },
      h('span', { style: { color: i.level === 'error' ? 'var(--red-text)' : i.level === 'warn' ? 'var(--orange)' : 'var(--ink-2)', 'margin-top': '1px' } }, ic(i.level === 'note' ? 'info' : 'alert', 18, 2)),
      h('span.t', i.text)))
    if (!body.value.trim()) items.length = 0
    if (body.value.trim() && result.ready) items.unshift(h('div.item', { style: { 'font-size': '15px' } }, h('span', { style: { color: 'var(--green)' } }, ic('check', 18, 2.6)), h('span.t', `Ready to register: ${result.vars.length} of ${VAR_LIMIT} blanks, ${Math.round(result.share * 100)}% fixed text`)))
    if (body.value.trim()) items.push(h('div.item', { style: { 'font-size': '15px' } }, h('span.muted', ic('chats', 18, 2)), h('span.t.muted', `Up to ${result.worst.parts} SMS when every blank is full`)))
    fill(checks, items)
    checks.hidden = !items.length
  }
  body.addEventListener('input', draw)
  draw()
  const insert = (code) => {
    const s = body.selectionStart ?? body.value.length
    const e = body.selectionEnd ?? s
    body.value = body.value.slice(0, s) + code + body.value.slice(e)
    body.focus()
    body.setSelectionRange(s + code.length, s + code.length)
    draw()
  }
  await sheet({
    title: t ? 'Edit template' : 'New template',
    done: 'Save',
    onDone: async (close) => {
      const result = checkTemplate(body.value)
      if (!name.value.trim()) { sound.error(); nope(name); name.focus(); return }
      if (!result.ok) { sound.error(); nope(body); toast(result.issues.find(i => i.level === 'error').text, { kind: 'bad' }); return }
      try {
        if (t) await api.patch(`/api/templates/${encodeURIComponent(t.id)}`, { name: name.value, body: body.value })
        else await api.post('/api/templates', { name: name.value, body: body.value })
        close(true)
        toast(t ? 'Template saved' : 'Template added')
        loadTemplates().catch(() => {})
      } catch (error) {
        sound.error()
        toast(error.message, { kind: 'bad' })
      }
    },
    body: (close) => [
      h('div.section', h('div.section-head', h('h2', 'Name')), h('div.group', name)),
      h('div.section', h('div.section-head', h('h2', 'Message')), h('div.group', body),
        h('div', { style: { display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'margin-top': '10px' } },
          [['{#var#}', 'Text'], ['{#numeric#}', 'Number'], ['{#url#}', 'Link']].map(([code, n]) => h('button.btn.small.tinted', { type: 'button', onclick: () => insert(code) }, ic('plus', 15, 2.4), n + ' blank')))),
      checks,
      t ? h('div.group', h('button.item.danger.center', { type: 'button', onclick: async () => {
        if (!await confirm({ title: 'Delete this template?', text: `“${t.name}” is removed. Texts you already sent stay.`, action: 'Delete template' })) return
        try {
          await api.del(`/api/templates/${encodeURIComponent(t.id)}`)
          close(true)
          toast('Template deleted')
          loadTemplates().catch(() => {})
        } catch (error) { toast(error.message, { kind: 'bad' }) }
      } }, 'Delete template')) : null
    ]
  })
}

export { store }
