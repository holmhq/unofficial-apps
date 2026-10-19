// API keys: for scripts and agents that set up and triage projects for you.
import { el, api, ago, copyButton } from './lib.js'
import { show } from './app.js'

export async function keysPage() {
  document.title = 'API keys – feedback'
  const list = el('ul', { class: 'projects keys' }, el('li', { class: 'muted' }, 'Loading…'))
  const fresh = el('div')
  const name = el('input', { name: 'name', placeholder: 'My agent', maxlength: '60', autocomplete: 'off', 'aria-label': 'Key name' })
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true })

  const paint = keys => list.replaceChildren(...(keys.length ? keys.map(key => el('li', { class: 'key-row' },
    el('div', {},
      el('strong', {}, key.name), ' ', el('code', {}, key.prefix + '…'),
      el('div', { class: 'muted' }, 'Made ', ago(key.createdAt), key.lastUsedAt ? `, last used ${ago(key.lastUsedAt)}` : ', never used')),
    el('button', { type: 'button', class: 'button danger', onclick: async () => {
      if (!confirm(`Delete “${key.name}”? Anything using it stops working.`)) return
      try { await api('DELETE', '/api/keys/' + key.id); load() } catch (problem) { alert(problem.message) }
    } }, 'Delete'))) : [el('li', { class: 'muted' }, 'No keys yet.')]))
  const load = async () => {
    try { paint((await api('GET', '/api/keys')).keys) } catch (problem) { list.replaceChildren(el('li', { class: 'form-error' }, problem.message)) }
  }

  const create = el('form', { class: 'new-project', onsubmit: async event => {
    event.preventDefault()
    error.hidden = true
    try {
      const { key } = await api('POST', '/api/keys', { name: name.value })
      name.value = ''
      fresh.replaceChildren(el('div', { class: 'new-key' },
        el('p', {}, el('strong', {}, 'Your new key. '), 'Copy it now; it won’t be shown again.'),
        el('pre', {}, el('code', {}, key)),
        copyButton(key, 'Copy key')))
      load()
    } catch (problem) { error.textContent = problem.message; error.hidden = false }
  } }, name, el('button', { type: 'submit', class: 'button primary' }, 'Make a key'))

  show(
    el('section', { class: 'page-head' },
      el('h1', {}, 'API keys'),
      el('p', { class: 'lede' }, 'A key lets a script or a coding agent do anything you can with your projects: make one for a new site, read its snippet, and sort what arrives. Send it as ',
        el('code', {}, 'Authorization: Bearer fb_…'), '.')),
    create, error, fresh, list,
    el('section', { class: 'api-help' },
      el('h2', {}, 'Try it'),
      el('pre', {}, el('code', {}, [
        `curl ${location.origin}/api/projects \\`,
        '  -H "Authorization: Bearer $FEEDBACK_KEY" \\',
        `  -H 'Content-Type: application/json' \\`,
        `  -d '{"name":"My site","origins":["https://example.com"]}'`
      ].join('\n'))),
      el('p', { class: 'muted' }, 'The reply includes the project’s ', el('code', {}, 'snippet'), ' to paste into the site. ',
        el('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/feedback#api', rel: 'noopener', target: '_blank' }, 'Every route'), '.')))
  load()
}
