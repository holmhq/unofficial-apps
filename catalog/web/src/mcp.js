// Connect via MCP: the pill beside Get on an app's page, and the sheet it
// opens, as each app's own account menu has it (COOKBOOK.md, "Connect via
// MCP"). The tools come from the app's api/contract.json, through the index.
// Two tabs on the address pick the server: the Demo, the copy this
// repository runs, which anyone can try at once when a signed-in person may
// use its tools; or Your node, for the reader's own install.
import { $, el, icon, node } from './lib.js'

const ns = 'http://www.w3.org/2000/svg'
const MARK = 'M15.228,3.596C14.355,2.745 12.942,2.745 12.068,3.596L3.642,11.859C3.351,12.142 2.881,12.142 2.589,11.859C2.45,11.723 2.371,11.537 2.371,11.342C2.371,11.148 2.45,10.962 2.589,10.826L11.015,2.563C12.472,1.146 14.825,1.146 16.281,2.563C17.107,3.366 17.501,4.52 17.335,5.661C18.49,5.497 19.659,5.879 20.494,6.694L20.538,6.738C21.235,7.416 21.629,8.348 21.629,9.32C21.629,10.293 21.235,11.225 20.538,11.903L12.917,19.375C12.871,19.421 12.845,19.483 12.845,19.548C12.845,19.611 12.871,19.674 12.917,19.719L14.482,21.254C14.622,21.39 14.7,21.577 14.7,21.771C14.7,21.965 14.622,22.152 14.482,22.287C14.191,22.571 13.721,22.571 13.429,22.287L11.864,20.753C11.539,20.437 11.355,20.002 11.355,19.548C11.355,19.093 11.539,18.658 11.864,18.342L19.485,10.869C19.903,10.462 20.139,9.902 20.139,9.319C20.139,8.736 19.903,8.177 19.485,7.77L19.441,7.727C18.568,6.877 17.158,6.876 16.284,7.725L10.006,13.882L9.918,13.968C9.627,14.252 9.156,14.252 8.865,13.968C8.725,13.833 8.647,13.646 8.647,13.452C8.647,13.258 8.725,13.071 8.865,12.935L15.231,6.692C15.647,6.285 15.882,5.727 15.882,5.145C15.882,4.562 15.647,4.003 15.228,3.596ZM14.175,5.661C14.314,5.526 14.393,5.339 14.393,5.145C14.393,4.951 14.314,4.764 14.175,4.629C13.884,4.345 13.413,4.345 13.121,4.629L6.89,10.74C6.193,11.418 5.799,12.35 5.799,13.322C5.799,14.295 6.193,15.227 6.89,15.904C8.346,17.322 10.699,17.322 12.156,15.904L18.388,9.793C18.527,9.657 18.606,9.471 18.606,9.277C18.606,9.082 18.527,8.896 18.388,8.76C18.097,8.477 17.626,8.477 17.334,8.76L11.103,14.872C10.229,15.722 8.816,15.722 7.943,14.872C7.524,14.465 7.289,13.905 7.289,13.322C7.289,12.739 7.524,12.18 7.943,11.773L14.175,5.661Z'
const RISK = { read: 'Reads', write: 'Changes', destructive: 'Deletes' }

function svg(className, inner) {
  const image = document.createElementNS(ns, 'svg')
  image.setAttribute('viewBox', '0 0 24 24')
  image.setAttribute('aria-hidden', 'true')
  image.setAttribute('class', className)
  image.innerHTML = inner
  return image
}

// The MCP mark: shelf/tools/mcp.svg, filled with the text colour.
export const mark = () => svg('mark', `<path d="${MARK}"/>`)

export const tools = app => app.mcp || []
const canTry = app => Boolean(app.demo) && tools(app).some(tool => tool.auth === 'user')
const demoHost = app => app.demo.replace(/^https:\/\//, '').replace(/\/.*$/, '')

// The pill beside Get, when the app has tools.
export function mcpPill(app) {
  const count = tools(app).length
  if (!count) return null
  return el('button', { type: 'button', class: 'mcp-pill', 'aria-label': `Connect ${app.title} via MCP: ${count} tools`, onclick: () => openMcp(app) },
    mark(), 'MCP', el('small', {}, `· ${count} tools`))
}

// In a row's meta line: the mark and MCP, for an app that has tools.
export const mcpTag = app => tools(app).length > 0 &&
  el('span', { class: 'mcp-tag', title: `${tools(app).length} MCP tools` }, mark(), 'MCP')

// Anything to copy is one field that copies on a click, as Shelf's copyField:
// the value on one line, and a copy icon that turns into a tick.
function copyField(parts, label) {
  const value = parts.map(part => typeof part === 'string' ? part : part.you).join('')
  const text = el('code', { class: 'copy-value' }, parts.map(part => typeof part === 'string' ? part : el('span', { class: 'you' }, part.you)))
  const word = el('span', { class: 'copy-word', 'aria-live': 'polite' }, 'Copy')
  let timer
  const copy = async () => {
    clearTimeout(timer)
    try {
      await navigator.clipboard.writeText(value)
      field.classList.add('is-copied')
      word.textContent = 'Copied'
    } catch {
      getSelection().selectAllChildren(text)
      field.classList.add('is-stuck')
      word.textContent = 'Copy it by hand'
    }
    timer = setTimeout(() => { field.classList.remove('is-copied', 'is-stuck'); word.textContent = 'Copy' }, 1600)
  }
  const field = el('div', {
    class: 'copy-field', role: 'button', tabindex: '0', 'aria-label': 'Copy ' + label,
    onclick: copy,
    onkeydown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy() } }
  }, text, el('span', { class: 'copy-cue' }, word, el('span', { class: 'ic' },
    svg('clip', '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    svg('tick', '<path d="M5 12.5l4.5 4.5L19 7.5"/>'))))
  // A value too long for the line scrolls sideways under a fade.
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  return field
}

const address = (app, demo) => demo
  ? ['https://' + demoHost(app) + '/_holm/mcp']
  : ['https://' + app.path + '.', { you: node.domain || 'example.com' }, '/_holm/mcp']

const step = (n, title, text) => el('li', {}, el('span', { class: 'n' }, String(n)), el('div', {}, el('b', {}, title), el('small', {}, text)))

// The app's icon joined to the MCP mark by five dots, which wave from one to
// the other while the sheet is open.
const bridge = app => el('div', { class: 'bridge', 'aria-hidden': 'true' },
  icon(app, 'bridge'),
  el('span', { class: 'dots' }, [1, 2, 3, 4, 5].map(() => el('i'))),
  el('span', { class: 'tile' }, mark()))

function render(dialog, app) {
  const demo = { on: canTry(app) }
  const field = el('div', { class: 'addr-field' })
  const command = el('div')
  const note = el('p', { class: 'addr-note' })

  const groups = ['read', 'write', 'destructive'].map(risk => {
    const list = tools(app).filter(tool => tool.risk === risk)
    return list.length > 0 && el('div', { class: 'group is-' + risk },
      el('b', {}, RISK[risk], el('span', {}, String(list.length))),
      el('small', {}, list.map(tool => tool.summary).join(' · ')))
  })
  // Holm lets "member" tools run only for the node's owner and admins.
  const onlyAdmins = tools(app).every(tool => tool.auth === 'member')
  const panes = {
    claude: el('ol', { class: 'steps' },
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', `Name it ${app.title} and paste the address.`),
      step(3, 'Connect and sign in', 'Sign in when asked; a new email makes you an account. Claude sees only what you can.')),
    chatgpt: el('ol', { class: 'steps' },
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', `Name it ${app.title}, paste the address and choose OAuth.`),
      step(3, 'Connect and sign in', `Sign in when asked, then pick ${app.title} from + in a chat.`)),
    code: el('div', {}, command,
      el('p', { class: 'pane-note' }, 'Run it in a terminal, then type ', el('code', {}, '/mcp'), ' in Claude Code and sign in.')),
    tools: el('div', { class: 'groups' }, groups,
      onlyAdmins && el('p', { class: 'pane-note' }, 'For now only the node’s owner and admins can connect; Holm doesn’t yet let other members use these tools.'))
  }
  const LABELS = { claude: 'Claude', chatgpt: 'ChatGPT', code: 'Claude Code', tools: 'Tools' }
  const keys = Object.keys(panes)
  const bar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Where to connect' })
  // Every pane shares one grid cell, so the sheet is as tall as the tallest
  // and never changes height between tabs.
  const stack = el('div', { class: 'panes' }, keys.map(key => {
    panes[key].setAttribute('role', 'tabpanel')
    panes[key].id = 'mcp-pane-' + key
    panes[key].setAttribute('aria-labelledby', 'mcp-tab-' + key)
    return panes[key]
  }))
  let at = 'claude'
  const choose = (key, focus) => {
    at = key
    for (const name of keys) {
      panes[name].classList.toggle('is-on', name === key)
      panes[name].inert = name !== key
    }
    for (const tab of bar.children) {
      const on = tab.dataset.key === key
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      if (on && focus) tab.focus()
    }
  }
  bar.append(...keys.map(key => el('button', {
    type: 'button', role: 'tab', id: 'mcp-tab-' + key, 'aria-controls': 'mcp-pane-' + key, 'data-key': key,
    onclick: () => choose(key)
  }, LABELS[key])))
  bar.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const i = keys.indexOf(at)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
      : (i + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length
    choose(keys[next], true)
  })
  choose('claude')

  // The tabs on the address: Demo or Your node. Switching swaps only the
  // address, the note under it and the command, so nothing moves.
  const pick = (value, ...label) => el('button', { type: 'button', 'data-value': value, onclick: () => set(value === 'demo') }, ...label)
  const switcher = demo.on && el('div', { class: 'target', role: 'group', 'aria-label': 'Which server' },
    pick('demo', el('span', { class: 'live-dot', 'aria-hidden': 'true' }), 'Demo'),
    pick('node', 'Your node'))
  function set(on) {
    demo.on = on
    field.replaceChildren(copyField(address(app, on), 'connector address'))
    command.replaceChildren(copyField(['claude mcp add --transport http ' + app.path + ' ', ...address(app, on)], 'Claude Code command'))
    note.replaceChildren(...(on
      ? [el('b', {}, 'Try it now'), ` on ${demoHost(app)}. Sign in when Claude asks; a new email makes you an account there.`]
      : ['For ', app.title, ' on your own node, once it’s installed. ', el('b', {}, 'Get'), ' sets the domain.']))
    if (switcher) for (const button of switcher.children) button.setAttribute('aria-pressed', String((button.dataset.value === 'demo') === on))
  }
  set(demo.on)

  // The dialog itself has no padding, so only a click outside this lands on it.
  dialog.replaceChildren(el('div', { class: 'sheet-inner' },
    el('header', { class: 'sheet-head' },
      el('div', {}, el('h2', { id: 'mcp-title' }, 'Connect via MCP')),
      el('button', { type: 'button', class: 'done', onclick: () => dialog.close() }, 'Done')),
    bridge(app),
    el('div', { class: 'addr-box' }, el('div', { class: 'addr-head' }, el('p', { class: 'addr-label' }, 'Connector address'), switcher), field),
    note, bar, stack))
}

export function openMcp(app) {
  const dialog = $('#mcp')
  render(dialog, app)
  dialog.showModal()
}

// A click on the backdrop closes the sheet.
$('#mcp').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close()
})
