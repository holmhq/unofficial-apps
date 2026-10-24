// The install sheet: what "Get" opens. The reader's node and chosen way are
// remembered, and every command is written for their node.
import { $, el, store, icon, track, node, command, tabbed, REPO, ADDRESS } from './lib.js'

// Parts that come from the reader's node are marked, so it's clear what
// changed when they type.
const you = value => ({ you: value })
const peer = () => node.peer ? [you('@' + node.peer), ' '] : []
const hostName = app => app.path + '.' + (node.domain || 'example.com')
const host = app => [you(hostName(app))]
const external = (href, ...children) => el('a', { href, rel: 'noopener', target: '_blank' }, ...children)
const readme = app => `${REPO}/blob/${encodeURI(app.tag)}/${app.path}/README.md`
const setup = app => el('p', {}, 'Then follow its ', external(readme(app), 'README'),
  ' for any setup it needs, such as sign-in branding or an outbound host to allow.')

const WAYS = {
  install: {
    label: 'One command',
    render: app => [
      command([
        ['holm ', ...peer(), 'app install \\'],
        ['  ', ADDRESS, '/', app.path, '@v', app.version, ' \\'],
        ['  --host ', ...host(app)]
      ], { label: 'install command', onCopy: () => track(app.path, 'copy') }),
      el('p', {}, 'Holm fetches the ', el('code', {}, app.tag), ' release, checks it against this repository’s index and puts it live at ',
        el('strong', {}, 'https://' + hostName(app)), '. A newer version installs the same way, over this one, and keeps its data. Needs Holm 0.250 or newer.'),
      setup(app)
    ]
  },
  source: {
    label: 'From source',
    render: app => [
      command([
        ['git clone --depth 1 \\'],
        ['  --branch ', app.tag, ' \\'],
        ['  ', REPO],
        ['cd unofficial-apps'],
        ['holm ', ...peer(), 'app deploy ', app.path, ' --spec-v1 \\'],
        ['  --host ', ...host(app)]
      ], { label: 'install commands', onCopy: () => track(app.path, 'copy') }),
      el('p', {}, 'Read the code first, then deploy it to ', el('strong', {}, 'https://' + hostName(app)),
        '. To update, deploy a newer release the same way with ', el('code', {}, '--force'), '; its data stays.'),
      setup(app)
    ]
  },
  agent: {
    label: 'Ask an agent',
    render: app => [
      command([[
        'Install ', app.title, ' ', app.version, ' on my Holm node: run `holm ', ...peer(), 'app install ',
        ADDRESS, '/', app.path, '@v', app.version, ' --host ', ...host(app), '`, then follow ', readme(app),
        ' for any setup. Use https://holmhq.com/llms-full.txt as your only Holm reference.'
      ]], { label: 'agent prompt', kind: 'Agent prompt', prose: true, onCopy: () => track(app.path, 'copy') }),
      el('p', {}, 'Paste it into Claude Code, Codex, pi or any coding agent on a machine with the ',
        el('code', {}, 'holm'), ' command.')
    ]
  }
}

let way = store.get('install-way', 'install')

function render(dialog, app) {
  const ways = Object.fromEntries(Object.entries(WAYS).map(([key, value]) => [key, { label: value.label, render: () => value.render(app) }]))
  const tabs = tabbed({ id: 'way', label: 'Ways to install', ways, current: way, onChoose: key => { way = key; store.set('install-way', key) } })

  const form = el('form', { class: 'node', autocomplete: 'off', onsubmit: event => event.preventDefault() },
    el('label', {}, el('span', {}, 'Peer'), el('input', { name: 'peer', placeholder: 'default', spellcheck: 'false', value: node.peer })),
    el('label', {}, el('span', {}, 'Domain'), el('input', { name: 'domain', placeholder: 'example.com', spellcheck: 'false', inputmode: 'url', value: node.domain })),
    el('p', {}, 'Your node, as the ', el('code', {}, 'holm'), ' command knows it. No node yet? ',
      el('a', { href: '/start', 'data-link': true, onclick: () => dialog.close() }, 'Set one up in ten minutes'), '.'))
  form.addEventListener('input', () => {
    node.peer = form.peer.value.trim().replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '')
    node.domain = form.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/\s].*$/, '')
    store.set('node', node)
    tabs.repaint()
  })

  // The dialog itself has no padding, so only a click outside this lands on it.
  dialog.replaceChildren(el('div', { class: 'sheet-inner' },
    el('header', { class: 'sheet-head' },
      icon(app, 's'),
      el('div', {},
        el('h2', { id: 'install-title' }, 'Install ', app.title),
        el('p', {}, 'Version ', app.version)),
      el('button', { type: 'button', class: 'done', onclick: () => dialog.close() }, 'Done')),
    form, tabs.bar, tabs.panel))
}

export function openInstall(app) {
  track(app.path, 'get')
  const dialog = $('#install')
  render(dialog, app)
  // showModal focuses Done; focusing a field would open a phone's keyboard
  // over the sheet before the reader has seen it.
  dialog.showModal()
}

// A click on the backdrop closes the sheet.
$('#install').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close()
})
