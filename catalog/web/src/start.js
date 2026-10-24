// /start: the guide for someone with no Holm node yet, written for a reader
// who hands the work to a coding agent rather than typing commands. It says
// what Holm is, shows the conversation one prompt starts, gives a prompt for
// each place Holm can run (with what the agent will ask), and lists what
// Holm gives an app. The agent's own instructions are /llms.txt; the commands
// follow https://holmhq.com/llms-full.txt.
import { el, icon, store, node, command, tabbed, ADDRESS, REPO } from './lib.js'

const HOLM = 'https://holmhq.com'
const REFERENCE = 'https://holmhq.com/llms-full.txt'
const LICENSE = 'https://license.holmhq.com/v1/'
const INSTALLER = 'https://holmhq.com/install.sh'
const llms = () => location.origin + '/llms.txt'
// The Holm Usage License's id and digest, as section 4.2 of the reference
// prints them. Passing it is the person's own acceptance, after reading it.
const HULA = 'holm-usage-license-v1@sha256:898163f1d2592ae95c7b722b8b89c9de371bbfe22f96259b030049cd6b250d3e'

const you = value => ({ you: value })
const plain = parts => parts.map(part => typeof part === 'string' ? part : part.you).join('')
const code = text => el('code', {}, text)
const external = (href, ...children) => el('a', { href, rel: 'noopener', target: '_blank' }, ...children)

// Line icons on a 24-unit grid, drawn for this page.
const GLYPHS = {
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  spark: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  page: 'M4 4h16v16H4zM4 9h16M8 13h8M8 16h5',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0',
  data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',
  plug: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  ask: 'M4 4h16v12H9l-5 4zM12 13v.01M10 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2',
  out: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'
}

function glyph(name) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'glyph')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', GLYPHS[name])
  svg.append(path)
  return svg
}

// The page's own links scroll to a section without changing the address,
// which would make the store draw the page again.
const jump = id => event => {
  event.preventDefault()
  const target = document.getElementById(id)
  if (target) target.scrollIntoView({ block: 'start' })
}

// What the reader has chosen: the app to start with and where Holm runs.
// Parts of the page that depend on them redraw through refills.
let first = store.get('first-app', 'pastebin')
let way = store.get('setup-way', 'computer')
let refills = []
const refill = fn => { refills.push(fn); fn() }

const FALLBACK = { path: 'pastebin', title: 'pastebin' }
const chosen = apps => apps.find(app => app.path === first) || apps.find(app => app.path === 'pastebin') || apps[0] || FALLBACK

const domain = () => node.domain || 'example.com'
const peerName = () => node.peer || 'home'
const host = app => app.path + '.' + domain()

// The prompts, one per place Holm can run. The reader's own values are marked.
const PROMPTS = {
  computer: app => [
    'Set up Holm on this computer and install ', app.path, ' for me. Follow ', llms(), ', and use ', REFERENCE,
    ' for every Holm command. Show me the licence and wait for my answer before accepting it.'
  ],
  server: app => [
    'Put Holm on my Linux server for ', you(domain()), ' and install ', app.path, ' at ', you(host(app)), '. Follow ', llms(),
    ', and use ', REFERENCE, ' for every Holm command. Ask me how to reach the server, tell me which DNS records to create, ',
    'and wait for my answer before accepting the licence. Call the server ', you(peerName()), ' on this computer.'
  ],
  node: app => [
    'Install ', app.path, ' on my Holm node ', you('@' + peerName()), ' at ', you(host(app)), '. Follow ', llms(),
    ', and use ', REFERENCE, ' for every Holm command, then tell me anything its README leaves for me to do.'
  ]
}

// The hero's picture: a Hairline figure (vendor/hairline, MIT), drawn with
// Hairline's create skill. The kernel and the figure are classic scripts; the
// figure hands itself to globalThis.hairline, and this mounts it the way
// Hairline's own page does.
let loading = null
function hairline() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      globalThis.hairline = resolve
      const script = src => new Promise((done, fail) => document.head.append(el('script', { src, onload: done, onerror: fail })))
      script('/vendor/hairline/kernel.js').then(() => script('/src/belt.js')).catch(reject)
    })
    loading.catch(() => { loading = null })
  }
  return loading
}

function belt(apps) {
  const stage = el('div', { class: 'belt-stage', 'data-apps': apps.map(app => app.path).join(',') })
  const label = el('span', { class: 'belt-read', 'aria-hidden': 'true' })
  const figure = el('figure', { class: 'belt' }, stage, label,
    el('figcaption', {}, 'From the store, through a fingerprint check, into your node. Point at a crate to slow the belt and read it.'))
  hairline().then(def => {
    if (!stage.isConnected) return
    HL.inject(document)
    stage.setAttribute('data-hairline', def.name)
    stage.setAttribute('role', 'img')
    stage.setAttribute('aria-label', def.means)
    const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, stage)
    let text = ''
    const read = {
      get textContent() { return text },
      set textContent(value) { text = String(value ?? ''); label.textContent = text === 'rest' ? '' : text }
    }
    const handle = def.mount({ stage, svg, read }, def.range[1])
    // The store swaps pages in place: stop the belt once this one is gone.
    const main = document.getElementById('main')
    const gone = new MutationObserver(() => {
      if (stage.isConnected) return
      gone.disconnect()
      handle.destroy()
    })
    gone.observe(main, { childList: true })
  }).catch(() => figure.remove())
  return figure
}

function copyButton(apps) {
  const button = el('button', { type: 'button', class: 'button primary large' }, 'Copy the prompt')
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(plain(PROMPTS.computer(chosen(apps))))
      button.textContent = 'Copied. Paste it into your agent'
    } catch {
      document.getElementById('setup')?.scrollIntoView({ block: 'start' })
    }
    setTimeout(() => { button.textContent = 'Copy the prompt' }, 2400)
  })
  return button
}

function hero(apps) {
  const note = el('p', { class: 'hero-note' })
  refill(() => note.replaceChildren('It sets up Holm on this computer and installs ', chosen(apps).path, '. ',
    el('a', { href: '#setup', onclick: jump('setup') }, 'Pick another app, or a server'), '.'))
  return el('section', { class: 'guide-hero' },
    el('div', {},
      el('p', { class: 'eyebrow' }, 'Get started'),
      el('h1', {}, 'Run every app here on a server you own.'),
      el('p', { class: 'lede' }, 'These apps run on ', external(HOLM, 'Holm'),
        ', one program and one file that host your apps. You won’t need a terminal: a coding agent sets it up from one prompt.'),
      el('div', { class: 'cta' },
        copyButton(apps),
        el('a', { class: 'button large', href: HOLM, rel: 'noopener', target: '_blank' }, 'Visit holmhq.com', glyph('out'))),
      note),
    belt(apps))
}

const reason = (name, title, text) => el('li', {}, glyph(name), el('h3', {}, title), el('p', {}, text))

function why() {
  return el('ul', { class: 'why' },
    reason('download', 'Any app here, for the asking', 'Ask your agent for one by name. Holm checks the release against its published fingerprint before it goes live.'),
    reason('spark', 'Any app you can describe', 'Your agent builds it as plain files and puts it on your node. Every app here began that way.'),
    reason('file', 'Yours to keep', 'Apps, accounts and data live in one file on a machine you choose, simple to back up.'))
}

// What one prompt starts: the conversation, with the chosen app.
function chat(apps) {
  const transcript = el('ol', { class: 'chat-turns' })
  const live = app => el('span', { class: 'chat-app' }, app.symbol ? icon(app, 'xs') : null, el('strong', {}, `${app.path}.holm.localhost:4698`))
  refill(() => {
    const app = chosen(apps)
    const next = apps[(apps.indexOf(app) + 1) % apps.length]
    const turn = (who, ...text) => el('li', { class: 'turn from-' + who }, el('span', { class: 'who' }, who === 'you' ? 'You' : 'Agent'), el('p', {}, ...text))
    const turns = [
      turn('you', plain(PROMPTS.computer(app))),
      turn('agent', 'Installed the holm command. Before I create your node, here is the Holm Usage License. Do you accept it?'),
      turn('you', 'Yes, I accept.'),
      turn('agent', 'Your node is running, and ', app.path, ' is live at ', live(app), '.')
    ]
    if (next && next !== app) turns.push(turn('you', `Add ${next.path} too.`), turn('agent', 'Done: ', live(next), '.'))
    transcript.replaceChildren(...turns)
  })
  return el('section', { class: 'guide-section how' },
    el('div', {},
      el('h2', {}, 'One prompt, then answers'),
      el('p', { class: 'section-lede' }, 'Paste the prompt into Claude Code, Codex or another coding agent. It does the work, and stops only for what is yours to decide.')),
    el('figure', { class: 'chat' },
      el('figcaption', {}, el('span', { class: 'live', 'aria-hidden': 'true' }), 'Your coding agent'),
      transcript))
}

// What the agent will stop to ask, for each place.
const ASKS = {
  computer: () => [['To accept the ', external(LICENSE, 'Holm Usage License')], 'To keep your node’s password', 'Whether to set up sign-in'],
  server: () => ['How to reach the server', 'To create a few DNS records', ['To accept the ', external(LICENSE, 'licence')], 'To keep the admin password'],
  node: () => ['Only what the app’s README leaves to you']
}

// The commands behind each prompt, for anyone who wants to check them.
const COMMANDS = {
  computer: app => [
    command([
      ['curl -fsSL ', INSTALLER, ' \\'],
      ['  | bash -s -- --mode cli'],
      ['holm license show'],
      ['HULA_CONSENT=', HULA],
      ['holm server init --username ', you('you'), ' \\'],
      ['  --password ', you("'a-strong-password'"), ' \\'],
      ['  --domain holm.localhost \\'],
      ['  --accept-license "$HULA_CONSENT"'],
      ['holm start --runtime-mode manual'],
      ['holm @local app install \\'],
      ['  ', ADDRESS, '/', app.path, ' \\'],
      ['  --host ', app.path, '.holm.localhost']
    ], { label: 'setup commands' })
  ],
  server: app => [
    command([
      ['HULA_CONSENT=', HULA],
      ['curl -fsSL ', INSTALLER, ' \\'],
      ['  | bash -s -- --mode server \\'],
      ['  --domain ', you(domain()), ' \\'],
      ['  --email ', you('you@' + domain()), ' \\'],
      ['  --accept-license "$HULA_CONSENT"']
    ], { label: 'server install commands', kind: 'On the server' }),
    command([
      ['holm peer add ', you(peerName()), ' \\'],
      ['  --url https://admin.', you(domain()), ' \\'],
      ['  --token ', you('<the key it printed>')],
      ['holm @', you(peerName()), ' app install \\'],
      ['  ', ADDRESS, '/', app.path, ' \\'],
      ['  --host ', you(host(app))]
    ], { label: 'peer and install commands', kind: 'This computer' })
  ],
  node: app => [
    command([
      ['holm @', you(peerName()), ' app install \\'],
      ['  ', ADDRESS, '/', app.path, ' \\'],
      ['  --host ', you(host(app))]
    ], { label: 'install command' })
  ]
}

// One place's panel: the prompt, what the agent will ask, and the commands folded away.
function hand(key, apps, withNode) {
  const body = el('div', { class: 'hand' })
  const fill = () => {
    const app = chosen(apps)
    body.replaceChildren(
      command([PROMPTS[key](app)], { label: 'prompt', kind: 'Prompt for your agent', prose: true }),
      el('div', { class: 'asks' }, el('h3', {}, 'It will ask you'),
        el('ul', {}, ASKS[key]().map(item => el('li', {}, glyph('ask'), el('span', {}, item))))),
      el('details', { class: 'under' },
        el('summary', {}, 'The commands it runs'),
        el('p', {}, 'Your agent takes these from Holm’s ', external(REFERENCE, 'reference'), ' and ',
          external(llms(), 'llms.txt'), ', and fills in your answers.'),
        COMMANDS[key](app)))
  }
  fill()
  if (!withNode) return [body]
  const form = el('form', { class: 'node', autocomplete: 'off', onsubmit: event => event.preventDefault() },
    el('label', {}, el('span', {}, 'Domain'), el('input', { name: 'domain', placeholder: 'example.com', spellcheck: 'false', inputmode: 'url', value: node.domain })),
    el('label', {}, el('span', {}, 'Peer name'), el('input', { name: 'peer', placeholder: 'home', spellcheck: 'false', value: node.peer })))
  form.addEventListener('input', () => {
    node.domain = form.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/\s].*$/, '')
    node.peer = form.peer.value.trim().replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '')
    store.set('node', node)
    fill()
  })
  return [form, body]
}

function picker(apps) {
  if (apps.length < 2) return null
  const buttons = apps.map(app => el('button', {
    type: 'button',
    onclick: () => {
      first = app.path
      store.set('first-app', first)
      refills.forEach(fn => fn())
    }
  }, icon(app, 'xs'), app.title))
  refill(() => buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(apps[i] === chosen(apps)))))
  return el('div', { class: 'picker', role: 'group', 'aria-label': 'App to start with' }, buttons)
}

function setup(apps) {
  const tabs = tabbed({
    id: 'setup', label: 'Where Holm runs', current: way,
    onChoose: key => { way = key; store.set('setup-way', key) },
    ways: {
      computer: { label: 'This computer', render: () => hand('computer', apps, false) },
      server: { label: 'A server', render: () => hand('server', apps, true) },
      node: { label: 'I have Holm', render: () => hand('node', apps, true) }
    }
  })
  // A new app redraws the open panel; the picker refills itself.
  refills.push(() => tabs.repaint())
  const chooser = picker(apps)
  return el('section', { class: 'guide-section', id: 'setup' },
    el('h2', {}, 'Hand it to your agent'),
    el('p', { class: 'section-lede' }, 'Pick an app and where it runs, then copy the prompt.'),
    chooser && el('p', { class: 'choose' }, 'Start with'), chooser,
    el('p', { class: 'choose' }, 'Run it on'),
    tabs.bar, tabs.panel)
}

function build() {
  return el('section', { class: 'guide-section' },
    el('h2', {}, 'Build your own'),
    el('p', { class: 'section-lede' }, 'Every app here began as a few sentences to a coding agent. Say what you want and point it at Holm’s reference; ',
      'each app’s page in ', el('a', { href: '/', 'data-link': true }, 'this store'), ' shows the prompt that built it.'),
    command([[
      'Build a Holm app called guestbook: signed-in visitors leave a short message and see everyone’s, newest first, updating live. Use ',
      REFERENCE, ' as your only Holm reference, then deploy it to my local node at guestbook.holm.localhost.'
    ]], { label: 'example prompt', kind: 'Example prompt', prose: true }))
}

const CAPABILITIES = [
  ['page', 'Pages', 'Static files, clean addresses, single-page apps'],
  ['code', 'Server code', 'Standard fetch handlers, no build step'],
  ['person', 'Sign-in', 'Google, GitHub, Discord or Microsoft'],
  ['data', 'Storage', 'Keys, documents and files, per member too'],
  ['bolt', 'Realtime', 'Live updates over one WebSocket'],
  ['mail', 'Email', 'Through the provider you set up'],
  ['spark', 'AI', 'Your provider, within a budget'],
  ['shield', 'Bot protection', 'Rate limits and proof-of-work'],
  ['plug', 'Agent access', 'ChatGPT and Claude, over MCP'],
  ['phone', 'Installable', 'Every icon and card from one symbol'],
  ['lock', 'HTTPS and domains', 'Certificates fetched for you'],
  ['archive', 'Backups', 'Snapshots of a running node']
]

function capabilities() {
  return el('section', { class: 'guide-section' },
    el('h2', {}, 'Everything an app needs'),
    el('p', { class: 'section-lede' }, 'Holm is the whole back end, so your agent writes only the app’s own files.'),
    el('ul', { class: 'caps' }, CAPABILITIES.map(([name, title, text]) => el('li', {}, glyph(name), el('h3', {}, title), el('p', {}, text)))),
    el('p', { class: 'aside' }, 'And analytics, logs, outbound rules and more: section 24 of the ', external(REFERENCE, 'reference'), ' has the full list.'))
}

function closing() {
  return el('section', { class: 'closing' },
    el('h2', {}, 'Holm is free, and in beta.'),
    el('p', {}, 'Free for personal, internal and commercial use under the Holm Usage License. Expect changes before 1.0.'),
    el('div', { class: 'cta' },
      el('a', { class: 'button large', href: HOLM, rel: 'noopener', target: '_blank' }, 'Visit holmhq.com', glyph('out')),
      external(REFERENCE, 'Holm’s reference'),
      external(llms(), 'Instructions for agents'),
      external(LICENSE, 'The licence')),
    el('p', { class: 'small' }, 'The apps in this store are unofficial examples, not supported products. ',
      el('a', { href: '/', 'data-link': true }, 'Browse them'), ', or read their source on ', external(REPO, 'GitHub'), '.'))
}

export function startPage(index, show, back) {
  document.title = 'Get started with Holm – Unofficial Holm apps'
  const apps = index ? index.apps.filter(app => !app.hidden) : []
  refills = []
  show(back, hero(apps), why(), chat(apps), setup(apps), build(), capabilities(), closing())
  // A link to a section, such as /start#setup, lands on it.
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }))
  }
}

export const isStart = () => /^\/start\/?$/.test(location.pathname)
