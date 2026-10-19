// API keys: create (shown once), list, revoke, and copy-ready examples.

import { h, icon, api, ago, fullDate, copyText, confirmDialog, toast, spinner } from '../lib.js'
import { highlight } from '../code.js'

export function mountKeys(main, ctx) {
  let destroyed = false
  const origin = location.origin

  if (!ctx.me()) {
    main.replaceChildren(h('section.page.page-narrow', h('div.empty',
      h('h2', 'Sign in to manage API keys'),
      h('p', 'Keys let scripts and command-line tools create pastes as you.'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => ctx.signIn().catch(() => {}) }, 'Sign in'))))
    return { destroy() {} }
  }

  const reveal = h('div')
  const list = h('div.list')
  const nameInput = h('input.input', { type: 'text', placeholder: 'What will use this key? For example, laptop CLI', maxlength: '60', 'aria-label': 'Key name' })
  const createBtn = h('button.btn.btn-primary', { type: 'submit' }, icon('key'), 'Create key')
  const form = h('form.create-key', { onsubmit: e => { e.preventDefault(); create() } }, nameInput, createBtn)

  main.replaceChildren(spinner())
  load()

  async function load() {
    try {
      const { keys } = await api('GET', '/api/keys')
      if (destroyed) return
      renderList(keys || [])
      main.replaceChildren(h('section.page.page-narrow',
        h('header.page-head', h('h1', 'API keys'),
          h('p', 'A key can create, list and revoke your pastes, and nothing else. Revoke a key and anything using it stops working at once.')),
        reveal,
        form,
        list,
        examples()))
    } catch (err) {
      if (destroyed) return
      if (err.status === 401) { ctx.setMe(null); ctx.navigate('/keys', true); return }
      main.replaceChildren(h('section.page.page-narrow', h('div.empty', h('h2', 'Couldn’t load your keys'), h('p', err.message))))
    }
  }

  function renderList(keys) {
    if (!keys.length) {
      list.replaceChildren(h('div.empty', h('p', { style: { margin: 0 } }, 'No keys yet. Name your first one above.')))
      return
    }
    list.replaceChildren(...keys.map(k => {
      const node = h('div.row',
        h('span.file-ico', icon('key')),
        h('div.row-main',
          h('span.row-title', k.name || 'Unnamed key'),
          h('div.row-sub',
            h('span.inline-code', (k.prefix || 'pb_') + '…'),
            h('span', { title: fullDate(k.createdAt) }, 'Created ' + ago(k.createdAt)),
            h('span', k.lastUsedAt ? 'Last used ' + ago(k.lastUsedAt) : 'Never used'))),
        h('div.row-actions',
          h('button.btn.btn-danger.btn-sm', { type: 'button', onclick: () => revoke(k, node) }, icon('ban'), 'Revoke')))
      return node
    }))
  }

  async function create() {
    const name = nameInput.value.trim()
    if (!name) { nameInput.focus(); toast('Give the key a name first', 'error'); return }
    createBtn.disabled = true
    try {
      const res = await api('POST', '/api/keys', { name })
      nameInput.value = ''
      reveal.replaceChildren(h('div.key-new', { role: 'status' },
        h('p', h('strong', 'Copy your new key now. '), 'It won’t be shown again.'),
        h('div.link-row',
          h('input.link-field', { value: res.key, readonly: true, 'aria-label': 'New API key', onfocus: e => e.target.select() }),
          h('button.btn.btn-primary', { type: 'button', onclick: () => copyText(res.key, 'Key copied') }, icon('copy'), 'Copy key'))))
      const { keys } = await api('GET', '/api/keys')
      renderList(keys || [])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      createBtn.disabled = false
    }
  }

  async function revoke(k, node) {
    const ok = await confirmDialog({
      title: 'Revoke “' + (k.name || 'this key') + '”?',
      body: 'Anything using this key loses access right away. Pastes it created stay as they are.',
      confirm: 'Revoke key', danger: true,
    })
    if (!ok) return
    try {
      await api('DELETE', '/api/keys/' + encodeURIComponent(k.id))
      node.remove()
      if (!list.querySelector('.row')) renderList([])
      toast('Key revoked')
    } catch (err) { toast(err.message, 'error') }
  }

  function snippet(label, code) {
    const pre = h('pre')
    pre.innerHTML = highlight(code, 'bash')
    return h('div.sheet.snippet',
      h('div.sheet-bar', h('span.lang-tag', label), h('span.grow'),
        h('button.btn.btn-quiet.btn-sm', { type: 'button', 'aria-label': 'Copy ' + label, onclick: () => copyText(code) }, icon('copy'), h('span.lbl', 'Copy'))),
      pre)
  }

  function examples() {
    return h('div',
      h('h2.section-title', 'Create pastes from anywhere'),
      h('p.prose', 'Send the key as a bearer token. Every option in the app works here too: ',
        h('code', 'expires_in'), ' (', h('code', '10m'), ', ', h('code', '1h'), ', ', h('code', '1d'), ', ', h('code', '7d'), ', ', h('code', '30d'), ' or ', h('code', 'never'), '), ',
        h('code', 'burn_after_read'), ' and ', h('code', 'show_author'), '. The reply includes the link.'),
      snippet('Text', 'curl ' + origin + '/api/pastes \\\n  -H "Authorization: Bearer $PB_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"content": "hello", "expires_in": "1d", "burn_after_read": true}\''),
      snippet('A file', 'curl ' + origin + '/api/pastes \\\n  -H "Authorization: Bearer $PB_KEY" \\\n  -F file=@photo.jpg -F expires_in=7d'),
      snippet('A text file, highlighted', 'curl ' + origin + '/api/pastes \\\n  -H "Authorization: Bearer $PB_KEY" \\\n  -F "content=<main.go" -F language=go -F title=main.go'),
      h('h2.section-title', 'The pb command'),
      h('p.prose', h('code', 'pb'), ' wraps the same API. Save the key once with ', h('code', 'pb login'), ', then paste from files, pipes or the clipboard.'),
      snippet('Shell', 'pb login pb_your_key\npb new notes.md -e 1d\ncat secret.txt | pb new --burn\npb new --file screenshot.png --show-me\npb ls\npb revoke <slug>'))
  }

  return { destroy() { destroyed = true } }
}
