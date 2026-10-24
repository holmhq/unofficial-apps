// /start: the guide for someone with no Holm node yet. What Holm is, why a
// node puts every app here one command away, three ways to set one up, and
// what Holm gives an app. Every command follows https://holmhq.com/llms-full.txt.
import { el, icon, store, node, command, tabbed, ADDRESS, REPO } from './lib.js'

const HOLM = 'https://holmhq.com'
const REFERENCE = 'https://holmhq.com/llms-full.txt'
const LICENSE = 'https://license.holmhq.com/v1/'
const INSTALLER = 'https://holmhq.com/install.sh'
// The Holm Usage License's id and digest, as section 4.2 of the reference
// prints them. Passing it is the reader's own acceptance, after reading it.
const HULA = 'holm-usage-license-v1@sha256:898163f1d2592ae95c7b722b8b89c9de371bbfe22f96259b030049cd6b250d3e'

const you = value => ({ you: value })
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
  plus: 'M12 5v14M5 12h14',
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

// The hero's picture: a node holding every app in this store, and room for one more.
function nodeArt(apps) {
  return el('figure', { class: 'node-art' },
    el('figcaption', { class: 'node-bar' }, el('span', { class: 'live', 'aria-hidden': 'true' }), 'Your node'),
    el('ul', {},
      apps.map(app => el('li', {}, icon(app, 'm'), el('span', {}, app.title))),
      el('li', { class: 'yours' }, el('span', { class: 'icon icon-m' }, glyph('plus')), el('span', {}, 'Yours next'))),
    el('p', { class: 'node-file' }, glyph('file'), 'Everything in one file: ', code('~/.holm/data.db')))
}

function hero(apps) {
  return el('section', { class: 'guide-hero' },
    el('div', {},
      el('p', { class: 'eyebrow' }, 'Get started'),
      el('h1', {}, 'Run every app here on a server you own.'),
      el('p', { class: 'lede' }, 'These apps run on ', external(HOLM, 'Holm'),
        ': one program and one database file that host websites and apps, with sign-in, storage, realtime, email and AI built in. ',
        'Set up a node in about ten minutes. After that, any app in this store is one command away, and so is any app you can describe.'),
      el('div', { class: 'cta' },
        el('a', { class: 'button primary large', href: '#setup', onclick: jump('setup') }, 'Set up Holm'),
        el('a', { class: 'button large', href: HOLM, rel: 'noopener', target: '_blank' }, 'Visit holmhq.com', glyph('out')))),
    nodeArt(apps))
}

const reason = (name, title, ...text) => el('li', {},
  el('span', { class: 'badge' }, glyph(name)),
  el('h3', {}, title),
  el('p', {}, ...text))

function why() {
  return el('section', { class: 'guide-section' },
    el('h2', {}, 'What a node gives you'),
    el('ul', { class: 'why' },
      reason('download', 'Any app here, in one command',
        code('holm app install'), ' fetches an app’s release from this repository, checks it against the fingerprint published with it, and puts it live. A newer version installs over it and keeps its data.'),
      reason('spark', 'Any app you can describe',
        'Tell a coding agent what you want. With Holm’s public reference it writes a folder of plain files, and one command puts it online. Every app in this store began as a short prompt.'),
      reason('file', 'Yours to keep',
        'Apps, accounts and data live in one SQLite file on a machine you choose. Back it up while it runs, and check the copy restores.')))
}

const step = (title, ...body) => el('li', { class: 'step' }, el('h3', {}, title), ...body)

// The app the reader installs first on a local node; they can pick another.
let first = store.get('first-app', 'pastebin')

function firstApp(apps) {
  const choice = apps.find(app => app.path === first) || apps.find(app => app.path === 'pastebin') || apps[0] || { path: 'pastebin', title: 'pastebin' }
  const target = el('div')
  const fill = app => {
    const url = `http://${app.path}.holm.localhost:4698/`
    target.replaceChildren(
      command([
        ['holm @local app install \\'],
        ['  ', ADDRESS, '/', app.path, ' \\'],
        ['  --host ', app.path, '.holm.localhost']
      ], { label: 'app install command', kind: 'Second terminal' }),
      el('p', {}, 'Then open ', external(url, url.replace(/\/$/, '')), '. Chrome, Firefox and Edge find ',
        code('*.localhost'), ' addresses with no setup.'))
  }
  const picker = apps.length > 1 && el('div', { class: 'picker', role: 'group', 'aria-label': 'App to install' },
    apps.map(app => el('button', {
      type: 'button', 'aria-pressed': String(app === choice),
      onclick: event => {
        first = app.path
        store.set('first-app', first)
        for (const button of picker.children) button.setAttribute('aria-pressed', String(button === event.currentTarget))
        fill(app)
      }
    }, icon(app, 'xs'), app.title)))
  fill(choice)
  return [picker, target]
}

function onThisComputer(apps) {
  return [el('ol', { class: 'steps' },
    step('Install the holm command',
      command([
        ['curl -fsSL ', INSTALLER, ' \\'],
        ['  | bash -s -- --mode cli'],
        ['export PATH="$HOME/.local/bin:$PATH"'],
        ['holm --version']
      ], { label: 'install commands' }),
      el('p', {}, 'Linux or macOS, on Intel or Arm. The installer pins a release and checks its checksum. ',
        external(INSTALLER, 'Read the script'), ' first if you like.')),
    step('Read the licence, then create a node',
      command([
        ['holm license show'],
        ['HULA_CONSENT=', HULA],
        ['holm server init \\'],
        ['  --username ', you('you'), ' \\'],
        ['  --password ', you("'a-strong-password'"), ' \\'],
        ['  --domain holm.localhost \\'],
        ['  --accept-license "$HULA_CONSENT"']
      ], { label: 'licence and init commands' }),
      el('p', {}, 'Holm is free for personal, internal and commercial use under the ', external(LICENSE, 'Holm Usage License'),
        '. Passing ', code('--accept-license'), ' is your acceptance, so read it first. The node lives in ', code('~/.holm/data.db'), '.')),
    step('Start it',
      command([['holm start --runtime-mode manual']], { label: 'start command' }),
      el('p', {}, 'It runs in this terminal until you press Ctrl-C, and registers itself as the ', code('local'),
        ' peer, so the next commands need no token.')),
    step('Install an app',
      el('p', { class: 'lead-in' }, 'In a second terminal. Pick one:'),
      ...firstApp(apps),
      el('p', {}, 'Most of these apps ask people to sign in. A new node has no sign-in method yet: add Google, GitHub, Discord or Microsoft with ',
        code('holm auth provider'), ', as section 13 of the ', external(REFERENCE, 'reference'), ' shows. Each app’s README lists anything else it needs.')))]
}

function onAServer() {
  const steps = el('ol', { class: 'steps' })
  const fill = () => {
    const domain = node.domain || 'example.com'
    const peer = node.peer || 'home'
    steps.replaceChildren(
      step('Point your domain at the server',
        el('p', {}, 'On a Linux server, open the firewall for web traffic and add DNS records for ', code('admin.' + domain),
          ' and for each app’s address, such as ', code('pastebin.' + domain), '.')),
      step('Install Holm as a service',
        command([
          ['HULA_CONSENT=', HULA],
          ['curl -fsSL ', INSTALLER, ' \\'],
          ['  | bash -s -- --mode server \\'],
          ['  --domain ', you(domain), ' \\'],
          ['  --email ', you('you@' + domain), ' \\'],
          ['  --accept-license "$HULA_CONSENT"']
        ], { label: 'server install commands', kind: 'On the server' }),
        el('p', {}, 'Read the ', external(LICENSE, 'licence'), ' first. With ', code('--email'),
          ', Holm fetches HTTPS certificates itself. The install prints an admin password and a one-time command for your computer: keep both private.')),
      step('Install apps from your computer',
        command([
          ['holm peer add ', you(peer), ' \\'],
          ['  --url https://admin.', you(domain), ' \\'],
          ['  --token ', you('<the key it printed>')],
          ['holm @', you(peer), ' app install \\'],
          ['  ', ADDRESS, '/pastebin \\'],
          ['  --host pastebin.', you(domain)]
        ], { label: 'peer and install commands', kind: 'Your computer' }),
        el('p', {}, 'Use the exact ', code('peer add'), ' line the install printed. On a computer that has never run Holm, install the ',
          code('holm'), ' command first and add ', code('--accept-license "$HULA_CONSENT"'), ' to that line.')))
  }
  const form = el('form', { class: 'node', autocomplete: 'off', onsubmit: event => event.preventDefault() },
    el('label', {}, el('span', {}, 'Domain'), el('input', { name: 'domain', placeholder: 'example.com', spellcheck: 'false', inputmode: 'url', value: node.domain })),
    el('label', {}, el('span', {}, 'Peer name'), el('input', { name: 'peer', placeholder: 'home', spellcheck: 'false', value: node.peer })),
    el('p', {}, 'Type yours and the commands follow. The store’s Get sheets remember them too.'))
  form.addEventListener('input', () => {
    node.domain = form.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/\s].*$/, '')
    node.peer = form.peer.value.trim().replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '')
    store.set('node', node)
    fill()
  })
  fill()
  return [form, steps]
}

function withAnAgent(apps) {
  const app = apps.find(app => app.path === first) || { path: 'pastebin', title: 'pastebin' }
  return [
    command([[
      'Set up Holm on this computer, using ', REFERENCE, ' as your only Holm reference. Install the holm command, ',
      'show me the licence and wait for me to accept it, then start a local node. Install ', app.title, ' from ',
      ADDRESS, ' and give me its address.'
    ]], { label: 'agent prompt', kind: 'Agent prompt', prose: true }),
    el('p', {}, 'Paste it into Claude Code, Codex, pi or another coding agent on your computer. It takes the same steps, and waits for you before accepting the licence.'),
    el('p', {}, 'Or clone ', external(REPO, 'this repository'), ' and type ', code('/open'),
      ' in your agent: it checks your machine, helps you install Holm and offers to run an app.')
  ]
}

let way = store.get('setup-way', 'computer')

function setup(apps) {
  const tabs = tabbed({
    id: 'setup', label: 'Where Holm runs', current: way,
    onChoose: key => { way = key; store.set('setup-way', key) },
    ways: {
      computer: { label: 'This computer', render: () => onThisComputer(apps) },
      server: { label: 'A server', render: () => onAServer() },
      agent: { label: 'An agent', render: () => withAnAgent(apps) }
    }
  })
  return el('section', { class: 'guide-section', id: 'setup' },
    el('h2', {}, 'Set up Holm'),
    el('p', { class: 'section-lede' }, 'Start on your own computer: a local node is private, free and safe to try things on. Put one on a server when you want the world to see it.'),
    tabs.bar, tabs.panel)
}

const flowStep = (title, ...text) => el('li', {}, el('h3', {}, title), el('p', {}, ...text))

function build() {
  return el('section', { class: 'guide-section' },
    el('h2', {}, 'Build your own'),
    el('p', { class: 'section-lede' }, 'Every app here began as a few sentences to a coding agent. Yours can too: say what you want, and point the agent at Holm’s reference.'),
    el('ol', { class: 'flow' },
      flowStep('Describe it', 'What it does and who it’s for, the way you’d tell a person.'),
      flowStep('The agent writes it', 'A small folder: ', code('holm.json'), ', pages in ', code('web/'), ' and server code in ', code('api/main.js'), '. No build step.'),
      flowStep('Deploy it', code('holm app deploy'), ' puts it on your node. Deploy again to update it; its data stays.')),
    command([[
      'Build a Holm app called guestbook: signed-in visitors leave a short message and see everyone’s, newest first, updating live. Use ',
      REFERENCE, ' as your only Holm reference, then deploy it to my local node at guestbook.holm.localhost.'
    ]], { label: 'example prompt', kind: 'Example prompt', prose: true }),
    el('p', { class: 'aside' }, 'Each app’s page in ', el('a', { href: '/', 'data-link': true }, 'this store'),
      ' shows the prompt that built it, under Built from a prompt.'))
}

const CAPABILITIES = [
  ['page', 'Pages', 'Files served as they are, with clean addresses, single-page routing and your own 404 page.', 'web/'],
  ['code', 'Server code', 'JavaScript on the server with the standard Request and Response. No Node.js, no build step.', 'fetch(request, env)'],
  ['person', 'Sign-in', 'Holm’s own sign-in pages, with Google, GitHub, Discord or Microsoft. Your app just asks who is there.', 'env.holm.auth'],
  ['data', 'Storage', 'Keys with expiry and counters, JSON documents and files: shared by the app, or private to each member.', 'kv · ds · s3'],
  ['bolt', 'Realtime', 'Send updates from the server, and every open page gets them over one WebSocket.', 'env.holm.realtime'],
  ['mail', 'Email', 'Send mail from your app through the provider you set up, within the node’s policy.', 'env.holm.email'],
  ['spark', 'AI', 'Call the AI provider you configure, within a budget the node keeps.', 'env.holm.ai'],
  ['shield', 'Bot protection', 'Rate limits and proof-of-work challenges turn bots away from sign-ups and forms before your code runs.', 'limits'],
  ['plug', 'Agent access', 'ChatGPT and Claude can use an app’s public operations through the MCP address Holm serves for it.', '/_holm/mcp'],
  ['phone', 'Installable', 'One symbol becomes every icon, the web manifest and the link preview card.', 'holm app identity'],
  ['lock', 'HTTPS and domains', 'Holm fetches certificates itself, and any number of addresses can point to one app.', 'holm host'],
  ['archive', 'Backups', 'Back up a running node from your laptop, verify the copy, and check that it restores.', 'holm db artifact']
]

function capabilities() {
  return el('section', { class: 'guide-section' },
    el('h2', {}, 'Everything an app needs'),
    el('p', { class: 'section-lede' }, 'Holm is the whole back end, so an app is just its own files. These come with every node.'),
    el('ul', { class: 'caps' }, CAPABILITIES.map(([name, title, text, api]) => el('li', {},
      glyph(name), el('h3', {}, title), el('p', {}, text), code(api)))),
    el('p', { class: 'aside' }, 'And more: analytics and logs for every app, outbound hosts you allow one by one, a scan shield, and one command for all your nodes. ',
      'The full list is in section 24 of the ', external(REFERENCE, 'reference'), '.'))
}

function closing() {
  return el('section', { class: 'closing' },
    el('h2', {}, 'Holm is free, and in beta.'),
    el('p', {}, 'Every release before 1.0 is free for personal, internal and commercial use under the Holm Usage License. ',
      'Expect changes until then, and check your version before you follow a guide.'),
    el('div', { class: 'cta' },
      el('a', { class: 'button large', href: HOLM, rel: 'noopener', target: '_blank' }, 'Visit holmhq.com', glyph('out')),
      external(REFERENCE, 'Read the reference'),
      external(LICENSE, 'Read the licence')),
    el('p', { class: 'small' }, 'The apps in this store are unofficial examples, not supported products. ',
      el('a', { href: '/', 'data-link': true }, 'Browse them'), '.'))
}

export function startPage(index, show, back) {
  document.title = 'Get started with Holm – Unofficial Holm apps'
  const apps = index ? index.apps.filter(app => !app.hidden) : []
  show(back, hero(apps), why(), setup(apps), build(), capabilities(), closing())
  // A link to a section, such as /start#setup, lands on it.
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }))
  }
}

export const isStart = () => /^\/start\/?$/.test(location.pathname)
