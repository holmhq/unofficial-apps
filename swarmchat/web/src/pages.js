// The tool pages behind sign-in: your workspaces, one workspace (its swarms, members and invites), one swarm (its
// agents, tokens, view links, rules and export), an invite, and the app admin. Each draws at once from this
// browser's copy, then from the server's answer when it differs.
import {
  $, ApiError, ago, api, bytes, confirm, copyField, esc, fill, formSheet, h, ic, icon, num, popMenu, segmented, session, sheet, signIn, store, toast, loadMe,
} from './kit.js'
import { WAYS_FOR } from './ways.js'

const ROLE = { owner: 'Owner', admin: 'Admin', viewer: 'Viewer' }

// ---------------------------------------------------------------------- shared pieces

function crumbs(...items) {
  return h('nav.crumbs', { 'aria-label': 'Where you are' }, items.map((it, i) => [i ? h('span.crumb-sep', { 'aria-hidden': 'true' }, '/') : null, it.href ? h('a', { href: it.href }, it.label) : h('span', it.label)]))
}
function titleRow(title, { pill = null, actions = [] } = {}) {
  return h('div.title-row', h('h1', title), pill ? h('span.pill', pill) : null, h('div.title-actions', actions))
}
function stats(items) {
  return h('div.stats', items.map((s) => h('div.stat', h('span.stat-label', s.label), h('b.stat-value', s.value), s.of ? h('small.stat-of', s.of) : null)))
}
function card(title, { action = null, note = null } = {}, ...body) {
  return h('section.card', h('div.card-head', h('h2', title), note ? h('small.card-note', note) : null, h('div.card-actions', action)), ...body)
}
const btn = (label, { icon: name = null, kind = '', run, title = null, disabled = false } = {}) => h('button.btn.small' + (kind ? '.' + kind : ''), { type: 'button', title, disabled, onclick: run, html: (name ? icon(name) : '') + `<span>${esc(label)}</span>` })
const iconBtn = (name, label, run) => h('button.icon-btn', { type: 'button', 'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: run, html: icon(name) })
function empty(glyph, title, text, action = null) {
  return h('div.empty', h('span.empty-ic', ic(glyph)), h('b', title), text ? h('p', text) : null, action)
}
function loading() { return h('div.loading', { role: 'status' }, h('span.spinner', { 'aria-hidden': 'true' }), 'Loading…') }
function failed(e, retry) {
  return empty('x', e.status === 404 ? 'Not Found' : 'Couldn’t Load This', e.status === 404 ? 'It may have been deleted, or you may not have access.' : e.message, retry && e.status !== 404 ? btn('Try Again', { icon: 'refresh', run: retry }) : h('a.btn.small', { href: '/' }, 'Workspaces'))
}

// Draws from this browser's copy first, then from the server; redraws only when the answer differs.
function cached(key, el, load, draw) {
  let last = store.get('c:' + key)
  let alive = true
  const paint = (data) => { if (alive) fill(el, draw(data, refresh)) }
  async function refresh() {
    try {
      const fresh = await load()
      if (!alive) return
      if (JSON.stringify(fresh) !== JSON.stringify(last)) { last = fresh; store.set('c:' + key, fresh); paint(fresh) }
    } catch (e) {
      if (!alive) return
      if (e.status === 401) { store.del('c:' + key); fill(el, signedOut()); return }
      if (!last || e.status === 404) { store.del('c:' + key); last = null; fill(el, failed(e, refresh)) } else toast(e.message, { bad: true })
    }
  }
  if (last) paint(last); else fill(el, loading())
  refresh()
  return { refresh, leave: () => { alive = false }, data: () => last }
}

function signedOut() {
  return empty('in', 'Sign In First', 'This page is for the people in a workspace.', h('button.btn.primary', { type: 'button', onclick: signIn, html: icon('in') + 'Sign In' }))
}

const face = (m) => (m.picture ? h('span.av', h('img', { src: m.picture, alt: '' })) : h('span.av', { 'aria-hidden': 'true' }, (String(m.name || m.email || '?').trim().charAt(0) || '?').toUpperCase()))
// An agent's colour: up to eight agents get eight colours made to be told apart, in the order of their ids. Past
// eight, a hue from the id, skipping oranges, yellows and greens, which belong to the app (the same rule as the viewer's).
const IDENTITY = ['#2f9e44', '#3b5bdb', '#7048e8', '#1098ad', '#d6336c', '#9c36b5', '#e03131', '#5c677d']
function agentColor(id, ids) {
  const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  const i = sorted.indexOf(id)
  if (ids.length <= IDENTITY.length && i >= 0) return IDENTITY[i]
  let hh = 2166136261
  for (let k = 0; k < id.length; k++) hh = Math.imul(hh ^ id.charCodeAt(k), 16777619)
  const hue = (hh >>> 0) % 225
  return `oklch(0.58 0.14 ${hue < 30 ? hue : hue + 135})`
}
const agentFace = (a, ids) => h('span.av.is-agent', { style: { background: agentColor(a.id, ids) }, 'aria-hidden': 'true' }, String(a.name || a.id).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || '?')

// ---------------------------------------------------------------------- pages

export function show(r, el, nav) {
  switch (r.name) {
    case 'home': return home(el, nav)
    case 'workspace': return workspace(el, nav, r.id)
    case 'swarm': return swarm(el, nav, r.id)
    case 'invite': return invite(el, nav, r.token)
    case 'admin': return admin(el, nav)
    default:
      document.title = 'Not Found · SwarmChat'
      fill(el, empty('search', 'Nothing Here', 'This address doesn’t open anything in SwarmChat.', h('a.btn.small', { href: '/' }, 'Go Home')))
      return {}
  }
}

// ---------------------------------------------------------------------- your workspaces

function home(el, nav) {
  document.title = 'Workspaces · SwarmChat'
  const draw = () => {
    const me = session.me
    const ws = me.workspaces || []
    const create = () => newWorkspace(nav)
    if (!ws.length) {
      return h('div.welcome',
        h('span.welcome-art', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 120 80" width="120" height="80"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="60" cy="40" r="26" stroke-dasharray="3 5"/><circle cx="60" cy="14" r="6"/><circle cx="83" cy="53" r="6"/><circle cx="37" cy="53" r="6"/><path d="M60 20v12M78 50l-10-6M42 50l10-6"/></g><circle cx="60" cy="40" r="7" fill="currentColor"/></svg>' }),
        h('h1', me.creator || me.admin ? 'Make Your First Workspace' : 'No Workspaces Yet'),
        h('p.lede', me.creator || me.admin
          ? 'A workspace holds your team’s swarms. Make one, add a swarm, then give each agent its own token. You watch every chat live.'
          : 'Someone in a workspace can invite you, or ask whoever runs this SwarmChat for an invite to make your own.'),
        me.creator || me.admin ? h('div.welcome-actions', h('button.btn.primary', { type: 'button', onclick: create, html: icon('plus') + 'New Workspace' })) : null,
        me.admin ? h('p.welcome-note', 'You run this SwarmChat. ', h('a', { href: '/admin' }, 'Invite creators from Admin'), '.') : null)
    }
    return [
      titleRow('Workspaces', { actions: [me.creator || me.admin ? btn('New Workspace', { icon: 'plus', kind: 'primary', run: create }) : null] }),
      h('div.tiles', ws.map((w) => h('a.tile', { href: `/w/${w.id}` },
        h('span.tile-mark', { 'aria-hidden': 'true' }, (w.name || '?').trim().charAt(0).toUpperCase()),
        h('span.tile-body', h('b', w.name), h('small', `${w.swarms === 1 ? '1 swarm' : num(w.swarms) + ' swarms'} · ${ROLE[w.role] || w.role}`)),
        ic('next', 'i tile-go')))),
      me.admin ? h('p.page-note', 'You run this SwarmChat. ', h('a', { href: '/admin' }, 'Admin'), ' holds the caps and creator invites.') : null,
    ]
  }
  fill(el, draw())
  return { onMe: () => fill(el, draw()), commands: () => (session.me.creator || session.me.admin ? [{ label: 'New Workspace', icon: 'plus', run: () => newWorkspace(nav), keepFocus: true }] : []) }
}

async function newWorkspace(nav) {
  const made = await formSheet({
    title: 'New Workspace', action: 'Create',
    fields: [{ name: 'name', label: 'Name', placeholder: 'Research Lab', maxlength: 60 }],
    submit: (v) => api('/api/workspaces', { method: 'POST', body: { name: v.name } }),
  })
  if (!made) return
  await loadMe()
  nav.go(`/w/${made.workspace.id}`)
}

// ---------------------------------------------------------------------- one workspace

function workspace(el, nav, id) {
  document.title = 'Workspace · SwarmChat'
  const view = cached('w:' + id, el, () => api(`/api/workspaces/${id}`), (w, refresh) => {
    document.title = `${w.name} · SwarmChat`
    nav.rememberSwarms(w.id, w.swarms)
    const manage = w.can_manage
    const agents = w.swarms.reduce((n, s) => n + s.agents, 0)
    const more = (e) => popMenu(e.currentTarget, [
      manage ? { label: 'Rename', icon: 'pencil', run: () => renameWorkspace(w, refresh) } : null,
      w.role !== 'owner' ? { label: 'Leave Workspace', icon: 'out', danger: true, run: () => leave(w, nav) } : null,
      w.role === 'owner' ? { label: 'Delete Workspace', icon: 'trash', danger: true, run: () => deleteWorkspace(w, nav) } : null,
    ])
    return [
      crumbs({ label: 'Workspaces', href: '/' }, { label: w.name }),
      titleRow(w.name, { pill: ROLE[w.role], actions: [
        manage ? btn('Invite', { icon: 'mail', run: () => inviteSheet(w, refresh) }) : null,
        manage ? btn('New Swarm', { icon: 'plus', kind: 'primary', run: () => newSwarm(w, nav) }) : null,
        iconBtn('dots', 'More', more)] }),
      stats([
        { label: 'Swarms', value: num(w.swarms.length), of: w.caps.swarms_per_workspace ? `of ${num(w.caps.swarms_per_workspace)}` : null },
        { label: 'Agents', value: num(agents) },
        { label: 'Files', value: bytes(w.usage.bytes), of: w.caps.bytes_per_workspace ? `of ${mib(w.caps.bytes_per_workspace)}` : null },
        { label: 'Members', value: num(w.members.length) },
      ]),
      card('Swarms', {}, w.swarms.length
        ? h('div.rows', w.swarms.map((s) => h('div.row',
          h('span.row-ic', ic('chat')),
          h('a.row-main', { href: `/s/${s.id}/manage` }, h('b', s.name), h('small', `${s.agents === 1 ? '1 agent' : num(s.agents) + ' agents'} · ${num(s.today)} today${s.last_at ? ' · active ' + ago(s.last_at) : ''}`)),
          h('div.row-actions', h('a.btn.small.tinted', { href: `/s/${s.id}`, 'aria-label': `Watch ${s.name}`, title: 'Watch', html: icon('eye') + '<span>Watch</span>' })))))
        : empty('chat', manage ? 'Make a Swarm' : 'No Swarms Yet', manage ? 'A swarm is one team of agents: its channels, direct messages and threads. Add its agents next, each with its own token.' : 'An admin of this workspace can make one.', manage ? btn('New Swarm', { icon: 'plus', kind: 'primary', run: () => newSwarm(w, nav) }) : null)),
      card('Members', {}, h('div.rows', w.members.map((m) => h('div.row',
        face(m),
        h('div.row-main', h('b', m.name || m.email || 'Someone'), m.email ? h('small', m.email) : null),
        h('span.pill.is-quiet', ROLE[m.role]),
        manage && m.role !== 'owner' ? iconBtn('dots', `Change ${m.name || 'member'}`, (e) => popMenu(e.currentTarget, [
          { label: 'Admin', checked: m.role === 'admin', run: () => setRole(w, m, 'admin', refresh) },
          { label: 'Viewer', checked: m.role === 'viewer', run: () => setRole(w, m, 'viewer', refresh) },
          'sep',
          { label: 'Remove', icon: 'trash', danger: true, run: () => removeMember(w, m, refresh) },
        ])) : h('span.icon-gap'))))),
      manage && w.invites && w.invites.length ? card('Invites', { note: 'Each link works once, for 14 days.' }, h('div.rows', w.invites.map((i) => h('div.row',
        h('span.row-ic', ic('mail')),
        h('div.row-main', h('b', `${ROLE[i.role]} Invite`), h('small', `By ${i.by || 'someone'} · expires ${ago(i.expires_at)}`)),
        btn('Revoke', { run: () => revokeInvite(w, i, refresh) }))))) : null,
    ]
  })
  return {
    leave: view.leave,
    refresh: view.refresh,
    commands: () => {
      const w = view.data()
      if (!w || !w.can_manage) return []
      return [{ label: 'New Swarm', icon: 'plus', run: () => newSwarm(w, nav), keepFocus: true }, { label: 'Invite to Workspace', icon: 'mail', run: () => inviteSheet(w, view.refresh), keepFocus: true }]
    },
  }
}

async function renameWorkspace(w, refresh) {
  const ok = await formSheet({ title: 'Rename Workspace', action: 'Save', fields: [{ name: 'name', label: 'Name', value: w.name, maxlength: 60 }],
    submit: (v) => api(`/api/workspaces/${w.id}`, { method: 'PATCH', body: { name: v.name } }) })
  if (ok) { await loadMe(); refresh() }
}
async function leave(w, nav) {
  if (!await confirm({ title: `Leave ${w.name}?`, text: 'You’ll need a new invite to come back.', action: 'Leave' })) return
  try { await api(`/api/workspaces/${w.id}/members/${encodeURIComponent(session.me.id || 'me')}`, { method: 'DELETE' }) } catch (e) { toast(e.message, { bad: true }); return }
  await loadMe()
  nav.go('/')
}
async function deleteWorkspace(w, nav) {
  if (!await confirm({ title: `Delete ${w.name}?`, text: `Its ${w.swarms.length === 1 ? 'swarm' : w.swarms.length + ' swarms'}, every agent, message and file go too. This can’t be undone.`, action: 'Delete Workspace' })) return
  for (let tries = 0; tries < 30; tries++) {
    try { await api(`/api/workspaces/${w.id}`, { method: 'DELETE' }); break } catch (e) {
      if (e.status !== 503) { toast(e.message, { bad: true }); return }
    }
  }
  store.del('c:w:' + w.id)
  await loadMe()
  nav.go('/')
  toast(`${w.name} is deleted.`)
}
async function setRole(w, m, role, refresh) {
  try { await api(`/api/workspaces/${w.id}/members/${encodeURIComponent(m.id)}`, { method: 'PATCH', body: { role } }); refresh() } catch (e) { toast(e.message, { bad: true }) }
}
async function removeMember(w, m, refresh) {
  if (!await confirm({ title: `Remove ${m.name || 'this member'}?`, text: `They lose access to ${w.name} and its swarms.`, action: 'Remove' })) return
  try { await api(`/api/workspaces/${w.id}/members/${encodeURIComponent(m.id)}`, { method: 'DELETE' }); refresh() } catch (e) { toast(e.message, { bad: true }) }
}
async function revokeInvite(w, i, refresh) {
  try { await api(`/api/workspaces/${w.id}/invites/${i.id}`, { method: 'DELETE' }); refresh() } catch (e) { toast(e.message, { bad: true }) }
}

function inviteSheet(w, refresh) {
  let role = 'viewer'
  return sheet({
    title: 'Invite', cancel: null, done: 'Done', onClose: () => refresh(),
    body: () => {
      const out = h('div.sheet-stack')
      const make = async () => {
        try {
          const r = await api(`/api/workspaces/${w.id}/invites`, { method: 'POST', body: { role } })
          fill(out, h('div.sheet-label', `${ROLE[r.role]} Link`), copyField(location.origin + r.path), h('p.sheet-note', 'Send it to one person. It works once, for 14 days.'))
        } catch (e) { fill(out, h('p.form-err', e.message)) }
      }
      return h('div.sheet-stack',
        h('p.sheet-note', `Anyone with the link joins ${w.name} once they sign in.`),
        h('div.sheet-label', 'Role'),
        segmented([{ value: 'viewer', label: 'Viewer' }, { value: 'admin', label: 'Admin' }], role, (v) => { role = v }, { label: 'Role' }),
        h('small.field-hint', 'Viewers watch every swarm. Admins also add swarms, agents and people.'),
        h('div', btn('Make Link', { icon: 'link', kind: 'primary', run: make })),
        out)
    },
  })
}

async function newSwarm(w, nav) {
  const made = await formSheet({
    title: 'New Swarm', action: 'Create',
    fields: [{ name: 'name', label: 'Name', placeholder: 'Benchmark Run 12', maxlength: 80, hint: 'One team of agents: its channels, direct messages and threads.' }],
    submit: (v) => api(`/api/workspaces/${w.id}/swarms`, { method: 'POST', body: { name: v.name } }),
  })
  if (!made) return
  store.set('c:s:' + made.swarm.id, { ...made.swarm, role: w.role, workspace_name: w.name, can_manage: true })
  nav.go(`/s/${made.swarm.id}/manage`)
  showSecret({ title: 'Swarm Admin Token', token: made.admin_token, note: 'For scripts and SwarmChat’s own admin commands (swarmchat admin …). It’s shown once.', swarm: made.swarm.id, admin: true })
}

// ---------------------------------------------------------------------- one swarm

function swarm(el, nav, id) {
  document.title = 'Swarm · SwarmChat'
  const view = cached('s:' + id, el, () => api(`/api/swarms/${id}`), (s, refresh) => {
    document.title = `${s.name} · SwarmChat`
    if (s.workspace) nav.rememberSwarm(s.workspace, s)
    const manage = s.can_manage
    const list = s.agents_list || []
    const ids = list.map((a) => a.id)
    const cap = s.settings.max_users
    const day = s.settings.max_messages_day
    const more = (e) => popMenu(e.currentTarget, [
      manage ? { label: 'Rename', icon: 'pencil', run: () => renameSwarm(s, refresh) } : null,
      manage ? { label: 'Rules…', icon: 'shield', run: () => rulesSheet(s, refresh) } : null,
      manage ? { label: 'New Admin Token', icon: 'key', run: () => newAdminToken(s) } : null,
      manage ? { label: 'Export', icon: 'down', run: () => exportIt(s) } : null,
      manage ? 'sep' : null,
      manage ? { label: 'Delete Swarm', icon: 'trash', danger: true, run: () => deleteSwarm(s, nav) } : null,
      !manage ? { label: 'Watch', icon: 'eye', href: `/s/${s.id}` } : null,
    ])
    return [
      crumbs({ label: 'Workspaces', href: '/' }, { label: s.workspace_name || 'Workspace', href: `/w/${s.workspace}` }, { label: s.name }),
      titleRow(s.name, { actions: [
        manage ? btn('Add Agent', { icon: 'plus', run: () => addAgent(s, refresh) }) : null,
        h('a.btn.small.primary', { href: `/s/${s.id}`, html: icon('eye') + '<span>Watch</span>' }),
        iconBtn('dots', 'More', more)] }),
      stats([
        { label: 'Agents', value: num(s.agents), of: cap ? `of ${num(cap)}` : null },
        { label: 'Today', value: num(s.today), of: day ? `of ${num(day)} messages` : 'messages' },
        { label: 'Files', value: bytes(s.bytes) },
        { label: 'Last Active', value: s.last_at ? ago(s.last_at) : 'Not Yet' },
      ]),
      card('Agents', { note: list.length ? 'Each agent has its own token.' : null }, list.length
        ? h('div.rows', list.map((a) => h('div.row',
          agentFace(a, ids),
          h('div.row-main', h('b', a.name, a.name !== a.id ? h('span.row-id', a.id) : null), h('small', [Object.entries(a.fields || {}).map(([k, v]) => `${k}: ${v}`).join(' · '), a.status].filter(Boolean).join(' — ') || `Added ${ago(a.created_at)}`)),
          manage ? iconBtn('dots', `Change ${a.name}`, (e) => popMenu(e.currentTarget, [
            { label: 'Connect…', icon: 'plug', run: () => connectSheet(s, a) },
            { label: 'New Token', icon: 'key', run: () => rotateAgent(s, a) },
            'sep',
            { label: 'Remove', icon: 'trash', danger: true, run: () => removeAgent(s, a, refresh) },
          ])) : h('span.icon-gap'))))
        : empty('bot', manage ? 'Add Your First Agent' : 'No Agents Yet', manage ? 'Each agent gets its own token, shown once, and joins from any machine: Claude Code, Node, Python or curl.' : 'An admin of this workspace can add them.', manage ? btn('Add Agent', { icon: 'plus', kind: 'primary', run: () => addAgent(s, refresh) }) : null)),
      manage ? card('View Links', { note: 'Read-only links for people without an account.', action: btn('New Link', { icon: 'link', run: () => newViewLink(s, refresh) }) },
        (s.view_keys || []).length
          ? h('div.rows', s.view_keys.map((k) => h('div.row',
            h('span.row-ic', ic('eye')),
            h('div.row-main', h('b', k.label), h('small', `Made ${ago(k.created_at)}${k.by ? ' by ' + k.by : ''}`)),
            btn('Revoke', { run: () => revokeViewLink(s, k, refresh) }))))
          : h('p.card-empty', 'None yet. A view link shows everything in this swarm, and nothing more, to whoever has it.')) : null,
    ]
  })
  return {
    leave: view.leave, refresh: view.refresh,
    commands: () => {
      const s = view.data()
      if (!s) return []
      return [
        { label: 'Watch This Swarm', icon: 'eye', href: `/s/${s.id}`, also: 'viewer chat map board replay' },
        s.can_manage ? { label: 'Add Agent', icon: 'plus', run: () => addAgent(s, view.refresh), keepFocus: true } : null,
        s.can_manage ? { label: 'Export Swarm', icon: 'down', run: () => exportIt(s), also: 'download zip' } : null,
      ]
    },
  }
}

async function renameSwarm(s, refresh) {
  const ok = await formSheet({ title: 'Rename Swarm', action: 'Save', fields: [{ name: 'name', label: 'Name', value: s.name, maxlength: 80 }],
    submit: (v) => api(`/api/swarms/${s.id}`, { method: 'PATCH', body: { name: v.name } }) })
  if (ok) refresh()
}

async function addAgent(s, refresh) {
  const made = await formSheet({
    title: 'Add Agent', action: 'Add',
    fields: [
      { name: 'id', label: 'Id', placeholder: 'scout', maxlength: 40, hint: 'Lower case: a-z, 0-9, dots, dashes and underscores. Others write @scout to mention it.' },
      { name: 'name', label: 'Name', placeholder: 'Scout', maxlength: 80 },
      { name: 'role', label: 'Role', placeholder: 'researcher (optional)', maxlength: 80 },
    ],
    submit: (v) => api(`/api/swarms/${s.id}/agents`, { method: 'POST', body: { id: v.id, name: v.name || v.id, fields: v.role ? { role: v.role } : {} } }),
  })
  if (!made) return
  refresh()
  showSecret({ title: `${made.user.name}’s Token`, token: made.token, swarm: s.id, agent: made.user })
}

async function rotateAgent(s, a) {
  if (!await confirm({ title: `New Token for ${a.name}?`, text: 'Its old token stops working at once, wherever it’s set.', action: 'Make New Token', danger: false })) return
  try {
    const r = await api(`/api/swarms/${s.id}/agents/${encodeURIComponent(a.id)}/token`, { method: 'POST' })
    showSecret({ title: `${a.name}’s New Token`, token: r.token, swarm: s.id, agent: a })
  } catch (e) { toast(e.message, { bad: true }) }
}

async function removeAgent(s, a, refresh) {
  if (!await confirm({ title: `Remove ${a.name}?`, text: 'It leaves every channel and its token stops working. Its messages stay, and its id can’t be used again.', action: 'Remove Agent' })) return
  try { await api(`/api/swarms/${s.id}/agents/${encodeURIComponent(a.id)}`, { method: 'DELETE' }); refresh() } catch (e) { toast(e.message, { bad: true }) }
}

async function newAdminToken(s) {
  if (!await confirm({ title: 'New Admin Token?', text: 'The swarm’s old admin token stops working at once.', action: 'Make New Token', danger: false })) return
  try {
    const r = await api(`/api/swarms/${s.id}/admin-token`, { method: 'POST' })
    showSecret({ title: 'Swarm Admin Token', token: r.admin_token, note: 'For scripts and SwarmChat’s own admin commands. It’s shown once.', swarm: s.id, admin: true })
  } catch (e) { toast(e.message, { bad: true }) }
}

async function newViewLink(s, refresh) {
  const made = await formSheet({ title: 'New View Link', action: 'Make Link', fields: [{ name: 'label', label: 'Label', placeholder: 'For the review team', maxlength: 60 }],
    submit: (v) => api(`/api/swarms/${s.id}/view-keys`, { method: 'POST', body: { label: v.label } }) })
  if (!made) return
  refresh()
  sheet({ title: 'View Link', cancel: null, done: 'Done', body: () => h('div.sheet-stack', copyField(location.origin + made.path), h('p.sheet-note', 'Anyone with it watches this swarm, read-only, without signing in. It’s shown once; revoke it here any time.')) })
}

async function revokeViewLink(s, k, refresh) {
  if (!await confirm({ title: `Revoke “${k.label}”?`, text: 'Anyone using it loses the view at once.', action: 'Revoke' })) return
  try { await api(`/api/swarms/${s.id}/view-keys/${k.id}`, { method: 'DELETE' }); refresh() } catch (e) { toast(e.message, { bad: true }) }
}

async function rulesSheet(s, refresh) {
  const ok = await formSheet({
    title: 'Rules', action: 'Save',
    fields: [{ name: 'rules', label: 'Rules (JSON)', type: 'textarea', value: JSON.stringify(s.rules || {}, null, 2), hint: 'SwarmChat’s rules: admins, channel_creators, contacts, posters, history, allow. {} leaves the swarm open.' }],
    submit: (v) => {
      let rules
      try { rules = v.rules ? JSON.parse(v.rules) : {} } catch { throw new ApiError(400, 'That isn’t valid JSON.') }
      return api(`/api/swarms/${s.id}/rules`, { method: 'PUT', body: { rules } })
    },
  })
  if (ok) { refresh(); toast('Rules saved.') }
}

async function exportIt(s) {
  toast('Exporting…')
  try {
    const { exportSwarm } = await import('./export.js')
    const out = await exportSwarm(s.id, (text) => toast(text))
    const url = URL.createObjectURL(out.blob)
    const a = h('a', { href: url, download: out.name })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    toast(`Exported ${out.chats === 1 ? '1 chat' : num(out.chats) + ' chats'}. Unzip it and open with swarmchat view --data.`)
  } catch (e) { toast(e.message || 'Export failed.', { bad: true }) }
}

async function deleteSwarm(s, nav) {
  if (!await confirm({ title: `Delete ${s.name}?`, text: 'Every agent, message and file in it goes. This can’t be undone.', action: 'Delete Swarm' })) return
  try { await api(`/api/swarms/${s.id}`, { method: 'DELETE' }) } catch (e) { toast(e.message, { bad: true }); return }
  store.del('c:s:' + s.id)
  nav.go(`/w/${s.workspace}`)
  toast(`${s.name} is deleted.`)
}

// A token, shown once, with how each kind of agent uses it.
function showSecret({ title, token, note = null, swarm, agent = null, admin = false }) {
  return sheet({
    title, cancel: null, done: 'Done', wide: true,
    body: () => h('div.sheet-stack',
      h('div.sheet-label', admin ? 'Admin Token' : 'Agent Token'),
      copyField(token),
      h('p.sheet-note.is-warn', note || 'Copy it now: it’s shown once. If it leaks, make a new one from the agent’s menu.'),
      agent ? waysBlock(token, agent) : waysAdmin(token)),
  })
}

function connectSheet(s, a) {
  return sheet({
    title: `Connect ${a.name}`, cancel: null, done: 'Done', wide: true,
    body: () => h('div.sheet-stack', h('p.sheet-note', 'Use the token you saved when you added it, or make a new one from its menu.'), waysBlock('their-token', a)),
  })
}

function waysBlock(token, agent) {
  const ways = WAYS_FOR(location.origin, token, agent)
  const panes = ways.map((w) => h('div.way-pane', { 'data-k': w.k }, h('div.cmds', w.cmds.map(([v, html]) => copyField(v, html))), h('p.sheet-note', w.note)))
  const showWay = (v) => panes.forEach((p) => { const on = p.dataset.k === v; p.classList.toggle('is-on', on); p.inert = !on })
  const first = store.raw('way') && ways.some((w) => w.k === store.raw('way')) ? store.raw('way') : 'claude'
  showWay(first)
  return h('div.sheet-stack', segmented(ways.map((w) => ({ value: w.k, label: w.label })), first, (v) => { showWay(v); store.setRaw('way', v) }, { label: 'How the agent connects' }), h('div.way-panes', panes))
}

function waysAdmin(token) {
  return h('div.sheet-stack',
    h('div.sheet-label', 'With SwarmChat’s Command Line'),
    copyField(`SWARMCHAT_SERVER=${location.origin} SWARMCHAT_TOKEN=${token} swarmchat admin policy-show`),
    copyField(`SWARMCHAT_SERVER=${location.origin} SWARMCHAT_TOKEN=${token} node swarmchat.mjs export ./swarm-backup`))
}

// ---------------------------------------------------------------------- an invite

function invite(el, nav, token) {
  document.title = 'Invite · SwarmChat'
  let alive = true
  const draw = (p, err) => {
    if (!alive) return
    if (err) { fill(el, h('div.invite', empty('mail', 'This Invite Can’t Be Used', err.message, h('a.btn.small', { href: '/' }, 'Go Home')))); return }
    const me = session.me
    const what = p.kind === 'creator' ? 'to make workspaces on this SwarmChat' : `to ${p.workspace?.name || 'a workspace'} as ${p.role === 'admin' ? 'an admin' : 'a viewer'}`
    const accept = async (b) => {
      b.disabled = true
      try {
        const r = await api(`/api/invites/${token}/accept`, { method: 'POST' })
        await loadMe()
        nav.go(r.kind === 'workspace' ? `/w/${r.workspace}` : '/', { replace: true })
        toast(r.kind === 'workspace' ? 'You’re in.' : 'You can make workspaces now.')
      } catch (e) { b.disabled = false; toast(e.message, { bad: true }) }
    }
    fill(el, h('div.invite', h('div.invite-card',
      h('img', { src: '/icon-192.png', alt: '', width: 64, height: 64 }),
      h('h1', p.kind === 'creator' ? 'You’re Invited to SwarmChat' : `Join ${p.workspace?.name || 'a Workspace'}`),
      h('p.lede', `${p.by || 'Someone'} invited you ${what}.`),
      me.signed_in
        ? h('button.btn.primary', { type: 'button', onclick: (e) => accept(e.currentTarget), html: icon('check') + 'Accept Invite' })
        : h('button.btn.primary', { type: 'button', onclick: signIn, html: icon('in') + 'Sign In to Accept' }),
      h('small.invite-note', `It works once, and expires ${ago(p.expires_at)}.`))))
  }
  fill(el, loading())
  api(`/api/invites/${token}`).then((p) => draw(p), (e) => draw(null, e))
  return { leave: () => { alive = false }, onMe: () => api(`/api/invites/${token}`).then((p) => draw(p), (e) => draw(null, e)) }
}

// ---------------------------------------------------------------------- the app admin

const CAP_ROWS = [
  ['workspaces_per_creator', 'Workspaces a Creator Makes', 'n'],
  ['swarms_per_workspace', 'Swarms a Workspace Holds', 'n'],
  ['agents_per_swarm', 'Agents a Swarm Holds', 'n'],
  ['messages_per_swarm_day', 'Messages a Swarm Sends a Day', 'n'],
  ['bytes_per_workspace', 'Files a Workspace Keeps (MB)', 'mb'],
  ['bytes_per_message', 'Files on One Message (MB)', 'mb'],
]

// Sizes the admin sets, in binary megabytes: 16 MB, 1 GB.
const mib = (n) => (n >= 1073741824 ? `${+(n / 1073741824).toFixed(2)} GB` : `${Math.round(n / 1048576)} MB`)

function admin(el, nav) {
  document.title = 'Admin · SwarmChat'
  const view = cached('admin', el, () => api('/api/admin'), (a, refresh) => {
    const swarms = a.workspaces.reduce((n, w) => n + w.swarms, 0)
    const stored = a.workspaces.reduce((n, w) => n + w.bytes, 0)
    return [
      crumbs({ label: 'Workspaces', href: '/' }, { label: 'Admin' }),
      titleRow('Admin', { actions: [btn('Invite a Creator', { icon: 'mail', kind: 'primary', run: () => creatorInvite(refresh) })] }),
      stats([
        { label: 'Workspaces', value: num(a.workspaces.length) },
        { label: 'Creators', value: num(a.creators.length) },
        { label: 'Swarms', value: num(swarms) },
        { label: 'Files', value: bytes(stored) },
      ]),
      card('Caps', { note: '0 is no limit. They apply to every workspace at once.', action: btn('Change', { icon: 'pencil', run: () => capsSheet(a.caps, refresh) }) },
        h('div.rows', CAP_ROWS.map(([k, label, kind]) => h('div.row.is-kv', h('span.row-main', label), h('b.row-value', a.caps[k] ? (kind === 'mb' ? mib(a.caps[k]) : num(a.caps[k])) : 'No Limit'))))),
      card('Creator Invites', { note: 'Creators make workspaces. Each link works once, for 14 days.' }, a.invites.length
        ? h('div.rows', a.invites.map((i) => h('div.row', h('span.row-ic', ic('mail')), h('div.row-main', h('b', 'Creator Invite'), h('small', `By ${i.by || 'you'} · expires ${ago(i.expires_at)}`)),
          btn('Revoke', { run: async () => { try { await api(`/api/admin/invites/${i.id}`, { method: 'DELETE' }); refresh() } catch (e) { toast(e.message, { bad: true }) } } }))))
        : h('p.card-empty', 'None waiting. Invite someone to let them make workspaces.')),
      card('Workspaces', {}, a.workspaces.length
        ? h('div.rows', a.workspaces.map((w) => h('a.row', { href: `/w/${w.id}` }, h('span.row-ic', ic('users')),
          h('span.row-main', h('b', w.name), h('small', `${w.owner || 'Owner'} · ${w.swarms === 1 ? '1 swarm' : num(w.swarms) + ' swarms'} · ${num(w.events)} events`)),
          h('b.row-value', bytes(w.bytes)))))
        : h('p.card-empty', 'No workspaces yet.')),
    ]
  })
  return { leave: view.leave, refresh: view.refresh, commands: () => [{ label: 'Invite a Creator', icon: 'mail', run: () => creatorInvite(view.refresh), keepFocus: true }] }
}

async function creatorInvite(refresh) {
  try {
    const r = await api('/api/admin/invites', { method: 'POST' })
    refresh()
    sheet({ title: 'Creator Invite', cancel: null, done: 'Done', body: () => h('div.sheet-stack', copyField(location.origin + r.path), h('p.sheet-note', 'Send it to one person. Once they sign in and accept, they can make workspaces. It works once, for 14 days.')) })
  } catch (e) { toast(e.message, { bad: true }) }
}

async function capsSheet(caps, refresh) {
  const ok = await formSheet({
    title: 'Caps', action: 'Save',
    fields: CAP_ROWS.map(([k, label, kind]) => ({ name: k, label, type: 'number', value: String(kind === 'mb' ? Math.round((caps[k] || 0) / 1048576) : caps[k] || 0) })),
    submit: (v) => {
      const body = {}
      for (const [k, , kind] of CAP_ROWS) body[k] = kind === 'mb' ? Math.round(Number(v[k] || 0) * 1048576) : Math.round(Number(v[k] || 0))
      return api('/api/admin/caps', { method: 'PUT', body })
    },
  })
  if (ok) { refresh(); toast('Caps saved.') }
}

export { $ }
