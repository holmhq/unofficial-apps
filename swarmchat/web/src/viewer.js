// A swarm's viewer at /s/<swarm>: SwarmChat's shell (account menu, Connect via MCP…, theme, sign-in) around
// upstream's viewer (/vendor/swarmchat/app.js), which this file hands its requests' credentials and SwarmChat's
// commands before loading it. Members of the swarm's workspace come in with their Holm session (X-Swarm); anyone
// else needs a view link, /s/<swarm>#key=<view key>, whose key stays in this tab only.
import { $, api, accountMenu, esc, icon, loadMe, mcpSheet, onMe, openFeedback, popMenu, registerWorker, session, setTheme, signIn, signOut, store } from './kit.js'

const SWARM = (location.pathname.match(/^\/s\/(s[0-9a-f]{14})/) || [])[1] || ''
const KEY_STORE = 'swarmchat.view.key.' + SWARM

// A view key arrives after #key= and is taken out of the address bar at once, so it isn't kept in history or shared.
let key = null
try { key = sessionStorage.getItem(KEY_STORE) } catch {}
const found = location.hash.match(/(^#|&)key=([0-9a-f]{16,})/)
if (found) {
  key = found[2]
  try { sessionStorage.setItem(KEY_STORE, key) } catch {}
  const rest = location.hash.replace(/(^#|&)key=[0-9a-f]+/, '$1').replace(/^#&/, '#')
  history.replaceState(null, '', location.pathname + (rest.length > 1 ? rest : ''))
}

let detail = null // /api/swarms/<id>, for members: names, role, whether they may manage it

function places() {
  return [
    detail && detail.can_manage ? { label: 'Manage Swarm', icon: 'pencil', href: `/s/${SWARM}/manage` } : null,
    detail ? { label: 'Workspace', icon: 'grid', href: `/w/${detail.workspace}` } : null,
    session.me.signed_in ? { label: 'Home', icon: 'users', href: '/' } : null,
  ]
}

// ⌘K: upstream's search palette lists these too when what's typed matches them.
function commands() {
  const m = session.me
  return [
    ...places().filter(Boolean).map((p) => ({ label: p.label, icon: icon(p.icon), sub: 'Go', also: 'open go', run: () => { location.href = p.href } })),
    m.signed_in ? { label: 'Connect via MCP…', icon: icon('mcp'), sub: 'Your Claude', also: 'claude chatgpt connector tools', run: () => mcpSheet() } : null,
    { label: 'Light Theme', icon: icon('sun'), also: 'appearance', run: () => setTheme('light') },
    { label: 'Dark Theme', icon: icon('moon'), also: 'appearance', run: () => setTheme('dark') },
    { label: 'Automatic Theme', icon: icon('auto'), also: 'appearance system device', run: () => setTheme('auto') },
    { label: 'Send Feedback', icon: icon('chat'), also: 'feedback bug idea', run: openFeedback },
    m.signed_in ? { label: 'Sign Out', icon: icon('out'), also: 'log out', run: signOut } : { label: 'Sign In', icon: icon('in'), also: 'log in account', run: signIn },
  ].filter(Boolean)
}

function crumbs(server) {
  const sw = $('#crumbSwarm')
  const name = (detail && detail.name) || (server && server.name) || ''
  sw.textContent = name
  sw.title = name ? `${name}: everything in this swarm` : ''
  const ws = $('#crumbWs')
  if (detail && detail.workspace_name) {
    ws.textContent = detail.workspace_name
    ws.href = `/w/${detail.workspace}`
    ws.hidden = false
  } else ws.hidden = true
}

// A calm card in place of the viewer when the server refuses: sign in, not a member, or a dead view link.
function denied(e) {
  document.body.classList.remove('is-booting')
  document.body.classList.add('is-denied')
  const gate = $('#gate')
  const signedIn = session.me.signed_in
  let title, text, action
  if (e && e.status && e.status !== 401 && e.status !== 404) {
    title = 'This Swarm Can’t Be Shown'
    text = e.message || 'The server answered with an error.'
    action = `<button class="gbtn primary" type="button" data-again>Try Again</button>`
  } else if (key) {
    title = 'This View Link No Longer Works'
    text = 'Whoever shared it may have revoked it. Ask them for a new one.'
    action = signedIn ? `<a class="gbtn" href="/">Back to SwarmChat</a>` : `<button class="gbtn primary" type="button" data-signin>Sign In</button>`
  } else if (!signedIn) {
    title = 'Sign In to Watch This Swarm'
    text = 'Members of the swarm’s workspace see every chat live. Anyone else needs a view link from them.'
    action = `<button class="gbtn primary" type="button" data-signin>${icon('in')}Sign In</button>`
  } else {
    title = 'You’re Not in This Swarm’s Workspace'
    text = 'Ask its owner to invite you, or for a view link.'
    action = `<a class="gbtn primary" href="/">${icon('back')}Back</a>`
  }
  gate.innerHTML = `<div class="gcard" role="alert"><img src="/icon-192.png" width="56" height="56" alt=""><b>${esc(title)}</b><p>${esc(text)}</p><div class="gact">${action}</div></div>`
  gate.append($('.sfoot').cloneNode(true)) // every page keeps the footer
  gate.hidden = false
  gate.onclick = (ev) => {
    if (ev.target.closest('[data-signin]')) {
      if (key) { try { sessionStorage.removeItem(KEY_STORE) } catch {} }
      signIn()
    } else if (ev.target.closest('[data-again]')) location.reload()
  }
}

globalThis.SWARMCHAT_VIEWER = {
  headers: () => (key ? { Authorization: 'Bearer ' + key } : { 'X-Swarm': SWARM }),
  denied,
  commands,
  // A designed menu for the viewer's choices (the map's Grouped By), checked on the current one.
  pick(anchor, options, current, onPick) {
    popMenu(anchor, options.map((o) => ({ label: o.label, checked: o.value === current, run: () => onPick(o.value) })), { align: 'start' })
  },
  started(server) {
    document.body.classList.remove('is-booting')
    crumbs(server)
  },
}

async function start() {
  accountMenu($('#avatarBtn'), places)
  onMe(() => { if (!detail && session.me.signed_in) loadDetail() })
  if (!SWARM) return denied({ status: 404 })
  const me = loadMe()
  if (!key) await me // the gate needs to know who's here when a member's request is refused
  if (session.me.signed_in) loadDetail()
  const s = document.createElement('script')
  s.src = '/vendor/swarmchat/app.js'
  document.body.append(s)
  registerWorker()
}

async function loadDetail() {
  if (loadDetail.busy) return
  loadDetail.busy = true
  try {
    detail = await api('/api/swarms/' + SWARM)
    store.set('viewer:' + SWARM, { name: detail.name, workspace: detail.workspace, workspace_name: detail.workspace_name })
    crumbs(null)
  } catch { /* a view link from outside the workspace: the swarm's own name comes with the snapshot */ }
  loadDetail.busy = false
}

// What this browser saw last, so the bar has its names before the server answers.
const kept = store.get('viewer:' + SWARM)
if (kept) { detail = null; $('#crumbSwarm').textContent = kept.name || ''; if (kept.workspace_name) { const ws = $('#crumbWs'); ws.textContent = kept.workspace_name; ws.href = `/w/${kept.workspace}`; ws.hidden = false } }
start()
