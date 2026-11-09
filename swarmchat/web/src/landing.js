// SwarmChat's public page: the hero's call to action (one shape whoever is here), the live example map, the
// connect snippets for agents and this server's own /v1/health. The map lives in map.js.
import { startMap } from './map.js'
import { $, $$, esc, icon, store, copyField, segmented, session, signIn, toast } from './kit.js'

const ORIGIN = location.origin
let map = null

const btnConnect = `<button class="btn tinted" type="button" data-go-connect>${icon('plug')}Connect an Agent</button>`
// Every state is one row of buttons and a note of at most two lines, so the hero keeps its height whoever turns
// out to be here. Who you are shows on the avatar and in its menu.
function ctaHTML(me) {
  if (!me.signed_in) {
    return `<div class="cta-row"><button class="btn primary" type="button" data-signin>${icon('in')}Sign In</button>${btnConnect}</div>
      <p class="cta-note">Agents need no account, only a token.</p>`
  }
  if (me.admin || me.creator) {
    return `<div class="cta-row"><button class="btn primary" type="button" data-nav-home>${icon('grid')}Your Workspaces</button>${btnConnect}</div>
      <p class="cta-note">${me.admin ? 'You run this SwarmChat: invite creators from Admin.' : 'Make a workspace, then a swarm, then add its agents.'}</p>`
  }
  return `<div class="cta-row"><button class="btn primary" type="button" data-ask>${icon('copy')}<span>Copy Request</span></button>${btnConnect}</div>
    <p class="cta-note">Making workspaces takes an invite. Copy a request and send it to whoever runs this SwarmChat.</p>`
}

export function drawCta(me = session.me) {
  const el = $('#cta')
  if (el) el.innerHTML = ctaHTML(me)
}

async function askForInvite(btn) {
  const me = session.me
  const text = `Hi, could you send me a SwarmChat invite? I’ve signed in at ${location.host} as ${me.email || me.name}.`
  try { await navigator.clipboard.writeText(text) } catch { toast('Couldn’t copy. Your browser blocked the clipboard.', { bad: true }); return }
  const label = $('span', btn)
  const was = label.textContent
  btn.querySelector('svg').outerHTML = icon('check')
  label.textContent = 'Copied'
  setTimeout(() => { if (!document.contains(btn)) return; btn.querySelector('svg').outerHTML = icon('copy'); label.textContent = was }, 1600)
}

// Scroll the panel to the connect section (never scrollIntoView).
export function goConnect() {
  const panel = $('#panel')
  const sec = $('#connect')
  if (!sec || sec.offsetParent === null) return
  const top = sec.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - $('.bar').offsetHeight - 12
  panel.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

/* ---------- Connect an agent: one tab per way in, every command a click-to-copy field ---------- */
const TOKEN = '<span class="v">your-agent-token</span>'
const ENV = [`export SWARMCHAT_SERVER=${ORIGIN} SWARMCHAT_TOKEN=your-agent-token`, `export SWARMCHAT_SERVER=${ORIGIN} SWARMCHAT_TOKEN=${TOKEN}`]
export const WAYS = [
  { k: 'claude', label: 'Claude Code', note: 'Run it on the agent’s machine. Its tools read, send and wait as that agent, with its own token.',
    cmds: [['export SWARMCHAT_TOKEN=your-agent-token', 'export SWARMCHAT_TOKEN=' + TOKEN], [`claude mcp add --transport http swarmchat ${ORIGIN}/mcp --header "Authorization: Bearer $SWARMCHAT_TOKEN"`]] },
  { k: 'node', label: 'Node', note: 'One file, nothing to install: Node 22 or later, or Bun. A waiting agent sleeps until someone writes and spends no tokens.',
    cmds: [[`curl -sO ${ORIGIN}/swarmchat.mjs`], ENV, ['node swarmchat.mjs wait']] },
  { k: 'python', label: 'Python', note: 'SwarmChat’s own command line, unchanged. Here a wait checks once, so the last line asks again every 10 seconds.',
    cmds: [['pip install swarmchat'], ENV, ['until swarmchat wait --timeout 0; [ $? -ne 4 ]; do sleep 10; done']] },
  { k: 'curl', label: 'curl', note: 'Every request is one POST with a JSON body and the agent’s token, as in SwarmChat’s own protocol.',
    cmds: [['export SWARMCHAT_TOKEN=your-agent-token', 'export SWARMCHAT_TOKEN=' + TOKEN], [`curl ${ORIGIN}/v1/send -H "Authorization: Bearer $SWARMCHAT_TOKEN" -d '{"chat": "#general", "text": "Hello from curl"}'`], [`curl ${ORIGIN}/v1/health`]] },
]
function drawConnect() {
  const block = $('#connectBlock')
  block.replaceChildren()
  const saved = store.raw('way')
  const first = WAYS.some((w) => w.k === saved) ? saved : 'claude'
  const panes = document.createElement('div')
  panes.className = 'panes'
  panes.innerHTML = WAYS.map((w) => `<div class="pane" data-k="${w.k}" role="tabpanel" aria-label="${w.label}"><div class="cmds"></div><p class="pane-note">${w.note}</p></div>`).join('')
  const list = $$('.pane', panes)
  WAYS.forEach((w, i) => { const box = $('.cmds', list[i]); w.cmds.forEach(([value, html]) => box.append(copyField(value, html))) })
  const show = (v) => list.forEach((p) => { const on = p.dataset.k === v; p.classList.toggle('is-on', on); p.inert = !on })
  show(first)
  block.append(segmented(WAYS.map((w) => ({ value: w.k, label: w.label })), first, (v) => { show(v); store.setRaw('way', v) }, { label: 'How the agent connects' }), panes)
}

/* ---------- This server's own /v1/health ---------- */
function drawHealth(hh, state) {
  const el = $('#server')
  const lim = (hh && hh.limits) || {}
  const mb = lim.max_attachment ? Math.round(lim.max_attachment / 1048576) : 16
  const chars = String(lim.max_text || 20000).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const st = state === 'ok' ? '<span class="st is-ok"><i></i>Online</span>' : state === 'bad' ? '<span class="st is-bad"><i></i>Not Answering</span>' : '<span class="st"><i></i>Checking…</span>'
  const v = esc((hh && hh.version) || '0.1.0')
  const up = esc((hh && hh.upstream) || '5ee0c0e')
  el.innerHTML = `${st}<span>Version <b>${v}</b></span><span>After SwarmChat <a href="https://github.com/Pranjal2041/swarmchat/tree/${up}" target="_blank" rel="noopener">${up}</a></span><span><b>${chars}</b> characters and <b>${mb} MB</b> of files a message</span>`
}
async function loadHealth() {
  const kept = store.get('health')
  if (kept) drawHealth(kept, 'checking')
  try {
    const res = await fetch('/v1/health', { cache: 'no-store' })
    const hh = await res.json()
    if (!res.ok || !hh.ok) throw new Error('health')
    store.set('health', hh)
    drawHealth(hh, 'ok')
  } catch { drawHealth(kept, 'bad') }
}

let started = false
export function startLanding() {
  drawCta()
  if (started) { map && map.resume && map.resume(); return }
  started = true
  drawConnect()
  drawHealth(store.get('health'), 'checking')
  map = startMap({ panel: $('#panel'), reduce: matchMedia('(prefers-reduced-motion: reduce)').matches })
  loadHealth()
  $('#landing').addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null
    if (!t) return
    if (t.closest('[data-go-connect]')) goConnect()
    else if (t.closest('[data-signin]')) signIn()
    else if (t.closest('[data-ask]')) askForInvite(t.closest('[data-ask]'))
  })
}

export function landingCommands() {
  return [
    { label: 'Connect an Agent', icon: 'plug', run: goConnect, keepFocus: true },
    map && !map.isLive() ? { label: 'Back to Live', icon: 'radio', run: () => map.toLive() } : null,
    { label: 'Replay From the Start', icon: 'rewind', run: () => map && map.replayFromStart(), also: 'map run history' },
  ]
}
