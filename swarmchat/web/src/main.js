// SwarmChat's web app: the public page for people who haven't started, and the tool pages behind sign-in
// (workspaces, a swarm's agents and links, invites, the app admin). The viewer is its own page at /s/<swarm>.
import {
  $, accountMenu, closePop, h, loadMe, onMe, openFeedback, palette, registerWorker, session, setTheme, signIn, signOut, themeMode, mcpSheet, store,
} from './kit.js'

const panel = $('#panel')
const root = document.documentElement
let current = null // the page on screen: { key, el, leave() }
let pages = null
let landing = null

/* ---------- Where we are ---------- */
function routeOf(path = location.pathname) {
  let m
  if (path === '/' || path === '') return { name: 'home' }
  if ((m = /^\/w\/(w[0-9a-f]{12})\/?$/.exec(path))) return { name: 'workspace', id: m[1] }
  if ((m = /^\/s\/(s[0-9a-f]{14})\/manage\/?$/.exec(path))) return { name: 'swarm', id: m[1] }
  if ((m = /^\/i\/([0-9a-f]{32})\/?$/.exec(path))) return { name: 'invite', token: m[1] }
  if (path === '/admin' || path === '/admin/') return { name: 'admin' }
  return { name: 'missing' }
}
const hasConsole = (me) => !!(me.signed_in && ((me.workspaces || []).length || me.creator || me.admin))
const usesLanding = (r, me) => r.name === 'home' && !hasConsole(me)

export function go(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path)
  render()
}
window.addEventListener('popstate', () => render())

// Links inside the app move without a reload; modified clicks open as usual.
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null
  if (!a || a.target || a.hasAttribute('download') || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || /^\/(s\/s[0-9a-f]{14}\/?$|_|auth|v1|api|mcp)/.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return
  e.preventDefault()
  go(url.pathname + url.search)
})

/* ---------- The sidebar: places, not controls. Workspaces and their swarms, and Admin ---------- */
const side = $('#side')
function drawSide() {
  const me = session.me
  const r = routeOf()
  side.replaceChildren()
  const nav = h('nav.side-nav', { 'aria-label': 'Places' })
  nav.append(h('a.side-item' + (r.name === 'home' ? '.is-on' : ''), { href: '/', html: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg><span>Workspaces</span>' }))
  const kept = store.get('c:swarms') || {}
  for (const w of me.workspaces || []) {
    const on = r.name === 'workspace' && r.id === w.id
    const within = r.name === 'swarm' && (kept[w.id] || []).some((s) => s.id === r.id)
    nav.append(h('a.side-item.is-ws' + (on ? '.is-on' : within ? '.is-within' : ''), { href: `/w/${w.id}` }, h('span.side-dot', { 'aria-hidden': 'true' }, (w.name || '?').trim().charAt(0).toUpperCase()), h('span', w.name)))
    for (const s of kept[w.id] || []) {
      const son = r.name === 'swarm' && r.id === s.id
      nav.append(h('a.side-item.is-swarm' + (son ? '.is-on' : ''), { href: `/s/${s.id}/manage` }, h('span', s.name)))
    }
  }
  if (me.admin) nav.append(h('hr'), h('a.side-item' + (r.name === 'admin' ? '.is-on' : ''), { href: '/admin', html: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/></svg><span>Admin</span>' }))
  side.append(nav)
}
// A swarm's own page adds it under its workspace, so the sidebar marks where you are even before the workspace's page
// has listed its swarms in this browser.
export function rememberSwarm(workspace, swarm) {
  const kept = store.get('c:swarms') || {}
  const list = kept[workspace] || []
  const at = list.findIndex((s) => s.id === swarm.id)
  if (at >= 0 && list[at].name === swarm.name) { drawSide(); return }
  if (at >= 0) list[at] = { id: swarm.id, name: swarm.name }; else list.push({ id: swarm.id, name: swarm.name })
  kept[workspace] = list
  store.set('c:swarms', kept)
  drawSide()
}
export function rememberSwarms(workspace, swarms) {
  const kept = store.get('c:swarms') || {}
  const next = swarms.map((s) => ({ id: s.id, name: s.name }))
  if (JSON.stringify(kept[workspace] || []) === JSON.stringify(next)) return
  kept[workspace] = next
  store.set('c:swarms', kept)
  drawSide()
}
function setSide(open) {
  root.classList.toggle('side-open', open)
  $('#sideBtn').setAttribute('aria-expanded', String(open))
}
$('#sideBtn').addEventListener('click', () => {
  const desk = matchMedia('(min-width: 960px)').matches
  if (desk) { const hidden = !root.classList.contains('side-hidden'); root.classList.toggle('side-hidden', hidden); store.setRaw('side', hidden ? 'hidden' : 'shown') } else setSide(!root.classList.contains('side-open'))
})
$('#sideScrim').addEventListener('click', () => setSide(false))
side.addEventListener('click', (e) => { if (e.target.closest('a')) setSide(false) })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('side-open')) setSide(false) })
if (store.raw('side') === 'hidden') root.classList.add('side-hidden')

/* ---------- Drawing the page for the address ---------- */
async function render() {
  closePop()
  const me = session.me
  const r = routeOf()
  const console = !usesLanding(r, me)
  root.classList.toggle('is-console', console)
  if (!console) {
    if (current) { current.leave && current.leave(); current.el.remove(); current = null }
    $('#landing').hidden = false
    document.title = 'SwarmChat'
    landing = landing || await import('./landing.js')
    landing.startLanding()
    return
  }
  $('#landing').hidden = true
  drawSide()
  pages = pages || await import('./pages.js')
  const key = JSON.stringify(r)
  if (current && current.key === key) { current.refresh && current.refresh(); return }
  if (current) { current.leave && current.leave(); current.el.remove() }
  const el = h('div.page')
  $('#console').append(el)
  panel.scrollTop = 0
  current = { key, el, ...(pages.show(r, el, { go, rememberSwarms, rememberSwarm }) || {}) }
}

/* ---------- The account menu and ⌘K ---------- */
accountMenu($('#avatarBtn'), (me) => [
  hasConsole(me) ? { label: 'Workspaces', icon: 'grid', run: () => go('/') } : null,
  me.admin ? { label: 'Admin', icon: 'shield', run: () => go('/admin') } : null,
  !hasConsole(me) ? { label: 'Connect an Agent', icon: 'plug', run: () => landing && landing.goConnect() } : null,
])
palette(() => {
  const me = session.me
  const r = routeOf()
  const here = current && current.commands ? current.commands() : []
  return [
    ...(usesLanding(r, me) && landing ? landing.landingCommands() : []),
    ...here,
    hasConsole(me) && r.name !== 'home' ? { label: 'Workspaces', icon: 'grid', run: () => go('/'), also: 'home' } : null,
    ...(me.workspaces || []).map((w) => ({ label: w.name, icon: 'users', run: () => go(`/w/${w.id}`), also: 'workspace', note: 'Workspace' })),
    me.admin ? { label: 'Admin', icon: 'shield', run: () => go('/admin'), also: 'caps invites creators' } : null,
    me.signed_in ? { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet(), also: 'claude chatgpt tools connector', keepFocus: true } : null,
    { label: 'Download swarmchat.mjs', icon: 'down', href: '/swarmchat.mjs', also: 'client cli node bun' },
    { label: 'Server Health', icon: 'radio', href: '/v1/health', also: 'status version limits', blank: true, note: 'Opens a Tab' },
    { label: 'Original SwarmChat', icon: 'link', href: 'https://github.com/Pranjal2041/swarmchat', also: 'upstream github source python', blank: true, note: 'Opens a Tab' },
    { label: 'Send Feedback', icon: 'chat', run: openFeedback },
    { label: 'Light Theme', icon: 'sun', run: () => setTheme('light'), also: 'appearance' },
    { label: 'Dark Theme', icon: 'moon', run: () => setTheme('dark'), also: 'appearance' },
    { label: 'Automatic Theme', icon: 'auto', run: () => setTheme('auto'), also: 'appearance system device' },
    me.signed_in ? { label: 'Sign Out', icon: 'out', run: signOut, also: 'log out' } : { label: 'Sign In', icon: 'in', run: signIn, also: 'log in account' },
  ]
})

$('.bar').addEventListener('click', (e) => { if (e.target.closest('[data-go-connect]') && landing) landing.goConnect() })

/* ---------- Start ---------- */
if (themeMode() !== 'auto') setTheme(themeMode())
onMe((me) => {
  const r = routeOf()
  if (usesLanding(r, me) === !root.classList.contains('is-console')) {
    if (!root.classList.contains('is-console') && landing) landing.drawCta(me)
    else drawSide()
    if (current && current.onMe) current.onMe(me)
  } else render()
})
render()
loadMe()
registerWorker()
export { panel }
