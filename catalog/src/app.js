// The catalog: read the repository index, then show each app with every way
// to install it on the reader's own node.
const REPO = 'https://github.com/holmhq/unofficial-apps'
const ALIAS = 'unofficial'
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('catalog.' + key)) ?? fallback } catch { return fallback } },
  set(key, value) { try { localStorage.setItem('catalog.' + key, JSON.stringify(value)) } catch {} }
}

const node = Object.assign({ peer: '', domain: '' }, store.get('node', {}))
let way = store.get('way', 'clone')
let index = null
const ref = new URLSearchParams(location.search).get('ref') || 'main'

const $ = (selector, root = document) => root.querySelector(selector)
function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (key === 'class') element.className = value
    else if (key.startsWith('on')) element.addEventListener(key.slice(2), value)
    else element.setAttribute(key, value === true ? '' : value)
  }
  element.append(...children.flat(Infinity).filter(child => child != null && child !== false))
  return element
}

// Parts of a command that come from the reader's own settings are marked, so
// it's clear what changed when they type.
const you = value => ({ you: value })
const peer = () => node.peer ? [you('@' + node.peer), ' '] : []
const host = app => [you(app.path + '.' + (node.domain || 'example.com'))]
const plain = parts => parts.map(part => typeof part === 'string' ? part : part.you).join('')

// A copyable block. Shell commands keep their line breaks (long ones continue
// with a backslash); a prompt is one paragraph that wraps.
function commandBlock(lines, label, kind = 'Terminal') {
  const code = el('code', {}, lines.map(line =>
    el('span', { class: 'line' }, line.map(part => typeof part === 'string' ? part : el('span', { class: 'you' }, part.you)))))
  const copy = el('button', { type: 'button', class: 'copy', 'aria-label': 'Copy ' + label }, 'Copy')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lines.map(plain).join('\n'))
      copy.textContent = 'Copied'
    } catch {
      copy.textContent = 'Select and copy'
    }
    setTimeout(() => { copy.textContent = 'Copy' }, 1600)
  })
  return el('div', { class: 'command' + (kind === 'Terminal' ? '' : ' prose') },
    el('div', { class: 'bar' }, el('span', {}, kind), copy),
    el('pre', {}, code))
}

const WAYS = [
  {
    id: 'clone',
    label: 'Clone and deploy',
    ready: true,
    render: app => [
      commandBlock([
        ['git clone --depth 1 --branch ', app.tag, ' \\'],
        ['  ', REPO],
        ['node unofficial-apps/scripts/index.mjs --check'],
        ['holm ', ...peer(), 'app deploy unofficial-apps/', app.path, ' \\'],
        ['  --host ', ...host(app), ' --spa --no-build']
      ], app.title + ' clone and deploy commands'),
      el('p', {}, 'The check needs Node. It confirms the folder still has fingerprint ',
        el('code', { class: 'hash' }, app.h1), ' before you deploy it. Add ', el('code', {}, '--force'), ' to replace an earlier copy.')
    ]
  },
  {
    id: 'install',
    label: 'holm app install',
    ready: false,
    render: app => [
      commandBlock([
        ['holm ', ...peer(), 'app install ', ALIAS, '/', app.path, '@v', app.version, ' \\'],
        ['  --host ', ...host(app)]
      ], app.title + ' install command'),
      el('p', {}, 'Not in Holm yet. Once it is, Holm resolves ', el('code', {}, app.tag),
        ' to a commit, refuses the folder unless it matches ', el('code', { class: 'hash' }, app.h1),
        ', and records both. The repository has to be trusted first.')
    ]
  },
  {
    id: 'agent',
    label: 'Ask an agent',
    ready: true,
    render: app => {
      const prompt = [[
        'Install ', app.title, ' ', app.version, ' on my Holm node from github.com/holmhq/unofficial-apps. ',
        'Clone tag ', app.tag, ', run `node scripts/index.mjs --check`, and confirm the ', app.path,
        ' fingerprint is ', app.h1, '. Then deploy the ', app.path, ' folder with `holm ', ...peer(),
        'app deploy ', app.path, ' --host ', ...host(app), ' --spa --no-build` and follow its README.md ',
        'for any setup. Use https://holmhq.com/llm.txt as your only Holm reference.'
      ]]
      return [
        commandBlock(prompt, app.title + ' agent prompt', 'Agent prompt'),
        el('p', {}, 'Paste it into Claude Code, Codex, pi or any coding agent on a machine with the ',
          el('code', {}, 'holm'), ' CLI. To have it built from scratch instead, give it the app’s ',
          el('a', { href: `${REPO}/blob/main/${app.path}/PROMPT.md`, rel: 'noopener', target: '_blank' }, 'PROMPT.md'), '.')
      ]
    }
  }
]

// A ring of 32 ticks, one per byte of the fingerprint. Different files draw a
// different seal.
function seal(app) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  let bytes = []
  try { bytes = Array.from(atob(app.h1.slice(3)), c => c.charCodeAt(0)) } catch {}
  bytes.forEach((byte, i) => {
    const angle = (i / bytes.length) * Math.PI * 2 - Math.PI / 2
    const r1 = 31, r2 = 35 + (byte / 255) * 12
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', (50 + Math.cos(angle) * r1).toFixed(2))
    line.setAttribute('y1', (50 + Math.sin(angle) * r1).toFixed(2))
    line.setAttribute('x2', (50 + Math.cos(angle) * r2).toFixed(2))
    line.setAttribute('y2', (50 + Math.sin(angle) * r2).toFixed(2))
    line.setAttribute('pathLength', '1')
    line.style.setProperty('--i', i)
    svg.append(line)
  })
  const disc = document.createElementNS(ns, 'circle')
  disc.setAttribute('cx', 50); disc.setAttribute('cy', 50); disc.setAttribute('r', 25)
  disc.setAttribute('class', 'disc')
  const letter = document.createElementNS(ns, 'text')
  letter.setAttribute('x', 50); letter.setAttribute('y', 50)
  letter.textContent = (app.title || app.path).trim().charAt(0).toLowerCase()
  svg.append(disc, letter)
  return svg
}

function renderInstall(article, app) {
  const tabs = $('.tabs', article)
  const panel = $('.panel', article)
  tabs.replaceChildren(...WAYS.map(option => el('button', {
    type: 'button', role: 'tab', id: `tab-${app.path}-${option.id}`,
    'aria-selected': String(option.id === way), tabindex: option.id === way ? '0' : '-1',
    'aria-controls': `panel-${app.path}`,
    onclick: () => choose(option.id, app.path)
  }, option.label)))
  const current = WAYS.find(option => option.id === way) || WAYS[0]
  panel.id = `panel-${app.path}`
  panel.setAttribute('aria-labelledby', `tab-${app.path}-${current.id}`)
  panel.replaceChildren(
    el('p', { class: 'readiness ' + (current.ready ? 'ready' : 'planned') }, current.ready ? 'Works today' : 'Coming to Holm'),
    ...current.render(app)
  )
}

// The install method is the reader's choice, like their node, so it applies to
// every app at once.
function choose(id, focusPath) {
  way = id
  store.set('way', way)
  renderApps()
  if (focusPath) document.getElementById(`tab-${focusPath}-${id}`)?.focus()
}

function renderApps() {
  const section = $('#apps')
  if (!index) return
  if (!index.apps.length) {
    section.replaceChildren(el('p', { class: 'status' }, 'This repository has no apps listed yet.'))
    return
  }
  const template = $('#app-template')
  const notes = []
  if (ref !== 'main') notes.push(el('p', { class: 'status' }, 'Showing the index at ', el('code', {}, ref), '. ', el('a', { href: '/' }, 'Show main')))
  if (index.stale) notes.push(el('p', { class: 'status' }, 'GitHub didn’t answer just now, so this is the copy read at ',
    new Date(index.fetchedAt).toLocaleString(), '.'))
  section.replaceChildren(...notes, ...index.apps.map(app => {
    const article = template.content.firstElementChild.cloneNode(true)
    article.id = app.path
    if (app.themeColor) article.style.setProperty('--seal', app.themeColor)
    $('.seal', article).append(seal(app))
    $('.title', article).textContent = app.title || app.name
    $('.version', article).textContent = 'v' + app.version
    $('.description', article).textContent = app.description
    $('.links', article).append(...[
      app.demo && el('a', { href: app.demo, rel: 'noopener', target: '_blank' }, 'Open the live copy'),
      el('a', { href: `${REPO}/tree/${encodeURI(app.tag)}/${app.path}`, rel: 'noopener', target: '_blank' }, 'Source at ' + app.tag),
      el('a', { href: `${REPO}/blob/main/${app.path}/README.md`, rel: 'noopener', target: '_blank' }, 'README')
    ].filter(Boolean))
    $('.h1', article).textContent = app.h1
    $('.files', article).textContent = app.files == null ? '' : `${app.files} files`
    renderInstall(article, app)
    return article
  }))
}

function renderTrust() {
  $('#trust-command').replaceChildren(commandBlock([['holm ', ...peer(), 'app repo add ', ALIAS, ' \\'], ['  ', REPO]], 'trust command'))
}

function renderAll() {
  renderTrust()
  renderApps()
}

function setupNode() {
  const form = $('#node')
  form.peer.value = node.peer
  form.domain.value = node.domain
  form.addEventListener('submit', event => event.preventDefault())
  form.addEventListener('input', () => {
    node.peer = form.peer.value.trim().replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '')
    node.domain = form.domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/\s].*$/, '')
    store.set('node', node)
    renderAll()
  })
}

// Arrow keys move between the install tabs, as in any tab list.
document.addEventListener('keydown', event => {
  const tab = event.target.closest?.('[role="tab"]')
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const ids = WAYS.map(option => option.id)
  const at = ids.indexOf(way)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1
    : (at + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  choose(ids[next], tab.id.slice(4, tab.id.lastIndexOf('-')))
})

async function load() {
  const section = $('#apps')
  try {
    const response = await fetch('/api/index?ref=' + encodeURIComponent(ref))
    const body = await response.json()
    if (!body.ok) throw new Error(body.error?.message || 'The index could not be read.')
    index = Object.assign(body.index, { stale: body.stale, fetchedAt: body.fetchedAt })
    // The seals draw in once, when the list first arrives.
    section.classList.add('reveal')
    setTimeout(() => section.classList.remove('reveal'), 1200)
    renderApps()
  } catch (error) {
    section.replaceChildren(el('div', { class: 'status error' },
      el('p', {}, 'The app list didn’t load. ', String(error.message).replace(/\.?$/, '.')),
      el('p', {}, el('button', { type: 'button', class: 'quiet', onclick: () => { section.replaceChildren(el('p', { class: 'status' }, 'Reading the index…')); load() } }, 'Try again'),
        ' or read ', el('a', { href: `${REPO}/blob/main/index.json`, rel: 'noopener', target: '_blank' }, 'index.json on GitHub'), '.')
    ))
  }
}

setupNode()
renderTrust()
load()
