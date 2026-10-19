// The install sheet: what "Get" opens. The reader's node and chosen way are
// remembered, and every command is written for their node.
import { $, el, store, icon, track, REPO, ALIAS } from './lib.js'

const node = Object.assign({ peer: '', domain: '' }, store.get('node', {}))
const WAY_IDS = ['terminal', 'agent', 'install']
let way = WAY_IDS.includes(store.get('way')) ? store.get('way') : 'terminal'

// Parts that come from the reader's node are marked, so it's clear what
// changed when they type.
const you = value => ({ you: value })
const peer = () => node.peer ? [you('@' + node.peer), ' '] : []
const hostName = app => app.path + '.' + (node.domain || 'example.com')
const host = app => [you(hostName(app))]
const plain = parts => parts.map(part => typeof part === 'string' ? part : part.you).join('')

// Shell commands keep their line breaks (long ones continue with a
// backslash); a prompt is one paragraph that wraps.
function block(app, lines, label, kind = 'Terminal') {
  const code = el('code', {}, lines.map(line =>
    el('span', { class: 'line' }, line.map(part => typeof part === 'string' ? part : el('span', { class: 'you' }, part.you)))))
  const copy = el('button', { type: 'button', class: 'copy', 'aria-label': 'Copy ' + label }, 'Copy')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lines.map(plain).join('\n'))
      copy.textContent = 'Copied'
      track(app.path, 'copy')
    } catch {
      copy.textContent = 'Select and copy'
    }
    setTimeout(() => { copy.textContent = 'Copy' }, 1600)
  })
  return el('div', { class: 'command' + (kind === 'Terminal' ? '' : ' prose') },
    el('div', { class: 'bar' }, el('span', {}, kind), copy),
    el('pre', {}, code))
}

const WAYS = {
  terminal: {
    label: 'Terminal',
    ready: true,
    render: app => [
      block(app, [
        ['git clone --depth 1 \\'],
        ['  --branch ', app.tag, ' \\'],
        ['  ', REPO],
        ['cd unofficial-apps'],
        ['holm ', ...peer(), 'app deploy ', app.path, ' \\'],
        ['  --host ', ...host(app), ' \\'],
        ['  --spa --no-build']
      ], 'install commands'),
      el('p', {}, 'Your copy will be at ', el('strong', {}, 'https://' + hostName(app)),
        '. To update it later, run the same commands with the new release and ', el('code', {}, '--force'), '; its data stays.')
    ]
  },
  agent: {
    label: 'Ask an agent',
    ready: true,
    render: app => [
      block(app, [[
        'Install ', app.title, ' ', app.version, ' on my Holm node from ', REPO, ': clone the ',
        app.tag, ' tag and deploy its ', app.path, ' folder with `holm ', ...peer(), 'app deploy ', app.path,
        ' --host ', ...host(app), ' --spa --no-build`. Then follow its README.md for any setup. ',
        'Use https://holmhq.com/llm.txt as your only Holm reference.'
      ]], 'agent prompt', 'Agent prompt'),
      el('p', {}, 'Paste it into Claude Code, Codex, pi or any coding agent on a machine with the ',
        el('code', {}, 'holm'), ' CLI.')
    ]
  },
  install: {
    label: 'holm app install',
    ready: false,
    render: app => [
      block(app, [
        ['holm ', ...peer(), 'app repo add ', ALIAS, ' ', REPO],
        ['holm ', ...peer(), 'app install ', ALIAS, '/', app.path, '@v', app.version, ' \\'],
        ['  --host ', ...host(app)]
      ], 'holm app install commands'),
      el('p', {}, 'Not in Holm yet. The first line trusts this repository, once, as the node’s owner; after that, ',
        'any app here installs by name and version.')
    ]
  }
}

function panel(app) {
  const current = WAYS[way]
  return [
    el('p', { class: 'readiness ' + (current.ready ? 'ready' : 'planned') }, current.ready ? 'Works today' : 'Coming to Holm'),
    ...current.render(app)
  ]
}

function render(dialog, app) {
  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Ways to install' })
  const body = el('div', { class: 'panel', role: 'tabpanel', id: 'install-panel' })
  const paint = () => {
    tabs.replaceChildren(...WAY_IDS.map(id => el('button', {
      type: 'button', role: 'tab', id: 'way-' + id, 'aria-controls': 'install-panel',
      'aria-selected': String(id === way), tabindex: id === way ? '0' : '-1',
      onclick: () => choose(id)
    }, WAYS[id].label)))
    body.setAttribute('aria-labelledby', 'way-' + way)
    body.replaceChildren(...panel(app))
  }
  const choose = id => {
    way = id
    store.set('way', way)
    paint()
    document.getElementById('way-' + id).focus()
  }
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const at = WAY_IDS.indexOf(way)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? WAY_IDS.length - 1
      : (at + (event.key === 'ArrowRight' ? 1 : -1) + WAY_IDS.length) % WAY_IDS.length
    choose(WAY_IDS[next])
  })

  const form = el('form', { class: 'node', autocomplete: 'off', onsubmit: event => event.preventDefault() },
    el('label', {}, el('span', {}, 'Peer'), el('input', { name: 'peer', placeholder: 'default', spellcheck: 'false', value: node.peer })),
    el('label', {}, el('span', {}, 'Domain'), el('input', { name: 'domain', placeholder: 'example.com', spellcheck: 'false', inputmode: 'url', value: node.domain })),
    el('p', {}, 'Your node, as the ', el('code', {}, 'holm'), ' CLI knows it.'))
  form.addEventListener('input', () => {
    node.peer = form.peer.value.trim().replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '')
    node.domain = form.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/\s].*$/, '')
    store.set('node', node)
    body.replaceChildren(...panel(app))
  })

  // The dialog itself has no padding, so only a click outside this lands on it.
  dialog.replaceChildren(el('div', { class: 'sheet-inner' },
    el('header', { class: 'sheet-head' },
      icon(app, 's'),
      el('div', {},
        el('h2', { id: 'install-title' }, 'Install ', app.title),
        el('p', {}, 'Version ', app.version)),
      el('button', { type: 'button', class: 'done', onclick: () => dialog.close() }, 'Done')),
    form, tabs, body))
  paint()
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
