// People and tenancy: Holm sign-in, creator invites, workspaces with roles, swarms, agents, tokens, view keys and the
// app admin's caps. Agents never come through here; they use their own tokens on /v1 and /mcp.
//
//   config             caps                   the app admin's limits
//   accounts           <member id>            creator, invited_by, workspaces [ids]
//   workspaces         <w…>                   name, owner, swarms [ids], created_at
//   workspace_members  <workspace>:<member>   role (owner | admin | viewer), name, picture, email, joined_at
//   invites            <sha256 of token>      kind (creator | workspace), workspace, role, by, expires_at, used_at
import { ADMIN, addUser, removeUser, setRules } from './agent.js';
import { Err, Swarm, byIds, hex, now, sha256 } from './store.js';
import { cleanSettings, createSwarm, deleteSwarm, rotateAdmin } from './swarms.js';

export const ROLES = ['owner', 'admin', 'viewer'];
const RANK = { owner: 3, admin: 2, viewer: 1 };
const DAYS_14 = 14 * 86400000;
export const CAPS = {
  workspaces_per_creator: 3, swarms_per_workspace: 5, agents_per_swarm: 50, messages_per_swarm_day: 20000,
  bytes_per_workspace: 1024 * 1024 * 1024, bytes_per_message: 16 * 1024 * 1024,
};

// ---------------------------------------------------------------------- who is asking

export function who(env) {
  const auth = env.holm.auth;
  let member = null;
  try { member = auth.isLoggedIn() ? auth.getMember() : null; } catch { member = null; }
  if (!member || !member.id) return null;
  let admin = false;
  try { admin = !!auth.isAppAdmin(); } catch { admin = false; }
  return { id: member.id, name: member.name || '', email: member.email || '', picture: member.picture || '', admin };
}

export function requireWho(env) {
  const me = who(env);
  if (!me) throw new Err(401, 'Sign in first.');
  return me;
}

export function caps(env) {
  return { ...CAPS, ...(env.holm.app.ds.findOne('config', 'caps')?.caps || {}) };
}

function account(env, id) {
  return env.holm.app.ds.findOne('accounts', id);
}

export function isCreator(env, me) {
  return !!(me && (me.admin || account(env, me.id)?.creator));
}

const wsRow = (env, id) => (typeof id === 'string' && /^w[0-9a-f]{12}$/.test(id) ? env.holm.app.ds.findOne('workspaces', id) : null);
const membership = (env, ws, member) => env.holm.app.ds.findOne('workspace_members', `${ws}:${member}`);

// The workspace and the caller's role there, or a 404 that does not tell a stranger it exists. App admins see all.
export function access(env, me, wid, need = 'viewer') {
  const ws = wsRow(env, wid);
  const m = ws ? membership(env, ws.id, me.id) : null;
  const role = m?.role || (ws && me.admin ? 'owner' : null);
  if (!ws || !role) throw new Err(404, 'No such workspace.');
  if (RANK[role] < RANK[need]) throw new Err(403, need === 'owner' ? `Only ${ws.name}'s owner can do that.` : `Only ${ws.name}'s owner and admins can do that.`);
  return { ws, role };
}

export function swarmAccess(env, me, sid, need = 'viewer') {
  const row = typeof sid === 'string' && /^s[0-9a-f]{14}$/.test(sid) ? env.holm.app.ds.findOne('swarms', sid) : null;
  if (!row || row.deleting || !row.workspace) throw new Err(404, 'No such swarm.');
  const { ws, role } = access(env, me, row.workspace, need);
  return { row, ws, role };
}

// For /v1/view_* without a token: the swarm in X-Swarm, when the signed-in member may watch it.
export function viewerSwarm(env, request) {
  const me = who(env);
  const sid = request.headers.get('x-swarm') || '';
  if (!me || !sid) return null;
  try { return swarmAccess(env, me, sid).row; } catch { return null; }
}

// ---------------------------------------------------------------------- shapes

function card(me) {
  return { name: me.name, picture: me.picture, email: me.email };
}

function wsDTO(ws, role) {
  return { id: ws.id, name: ws.name, role, can_manage: role === 'owner' || role === 'admin', swarms: (ws.swarms || []).length, created_at: ws.created_at };
}

export function myWorkspaces(env, me) {
  const acct = account(env, me.id);
  const ids = acct?.workspaces || [];
  const rows = new Map(byIds(env.holm.app.ds, 'workspaces', ids).map((w) => [w.id, w]));
  const roles = new Map(byIds(env.holm.app.ds, 'workspace_members', ids.map((w) => `${w}:${me.id}`)).map((m) => [m.workspace, m.role]));
  return ids.map((id) => rows.get(id) && roles.get(id) ? wsDTO(rows.get(id), roles.get(id)) : null).filter(Boolean);
}

function swarmDTO(env, row, withAgents = false) {
  const m = env.holm.app.ds.findOne('swarm_n', row.id) || {};
  const out = {
    id: row.id, workspace: row.workspace, name: row.name, created_at: row.created_at, agents: Object.keys(row.users || {}).length,
    events: m.n || 0, bytes: m.bytes || 0, last_at: m.last_at || null, settings: row.settings || {},
    today: env.holm.app.kv.get(`day:${row.id}:${now().slice(0, 10)}`) || 0,
  };
  if (withAgents) {
    const ids = Object.keys(row.users || {}).sort();
    const users = byIds(env.holm.app.ds, 'users', ids.map((u) => `${row.id}:${u}`));
    out.agents_list = users.sort((a, b) => (a.user < b.user ? -1 : 1)).map((u) => ({ id: u.user, name: u.name, fields: u.fields || {}, status: u.status || '', created_at: u.created_at }));
    out.view_keys = (row.view_keys || []).map(({ sha256: _h, ...k }) => k);
    out.rules = row.rules || {};
  }
  return out;
}

// ---------------------------------------------------------------------- me

export function me(env, url) {
  const m = who(env);
  const auth = env.holm.auth;
  const back = url.searchParams.get('return');
  const after = typeof back === 'string' && /^\/(?!\/)[\w\-./?=&#%]*$/.test(back) && !back.startsWith('/auth') ? back : '/';
  const out = {
    signed_in: !!m, id: m?.id ?? null, name: m?.name ?? null, email: m?.email ?? null, picture: m?.picture ?? null, admin: !!m?.admin,
    creator: isCreator(env, m), workspaces: m ? myWorkspaces(env, m) : [],
    login_url: auth.getLoginURL(after), logout_url: auth.getLogoutURL(),
  };
  if (m) {
    out.caps = caps(env);
    out.mcp = url.origin + '/_holm/mcp';
    // Tools build links from the address people open, which they can't see themselves.
    try { if (env.holm.app.kv.get('site:origin') !== url.origin) env.holm.app.kv.set('site:origin', url.origin); } catch { /* best effort */ }
  }
  return out;
}

// ---------------------------------------------------------------------- workspaces

function addMember(env, wid, m, role) {
  const { ds } = env.holm.app;
  ds.transaction((tx) => {
    const id = `${wid}:${m.id}`;
    const have = tx.findOne('workspace_members', id);
    if (have) {
      if (RANK[role] > RANK[have.role]) tx.update('workspace_members', { id }, { $set: { role } });
    } else tx.insert('workspace_members', { id, workspace: wid, member: m.id, role, ...card(m), joined_at: now() });
    const acct = tx.findOne('accounts', m.id);
    const list = acct?.workspaces || [];
    if (!list.includes(wid)) {
      if (acct) tx.update('accounts', { id: m.id }, { $set: { workspaces: [...list, wid] } });
      else tx.insert('accounts', { id: m.id, creator: false, workspaces: [wid], created_at: now() });
    }
  });
}

export function createWorkspace(env, me, input) {
  if (!isCreator(env, me)) throw new Err(403, 'Only people the app admin invited may create workspaces. Ask an admin for an invite.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || [...name].length > 60) throw new Err(400, 'A workspace name is 1 to 60 characters.');
  const cap = caps(env).workspaces_per_creator;
  const { ds } = env.holm.app;
  let wid = 'w' + hex(6);
  while (ds.findOne('workspaces', wid)) wid = 'w' + hex(6);
  ds.transaction((tx) => {
    const acct = tx.findOne('accounts', me.id);
    const owned = (acct?.owned || []).length;
    if (!me.admin && cap && owned >= cap) throw new Err(403, `You have ${owned} workspaces, the most you may create. Delete one, or ask the app admin.`);
    tx.insert('workspaces', { id: wid, name, owner: me.id, swarms: [], created_at: now() });
    tx.insert('workspace_members', { id: `${wid}:${me.id}`, workspace: wid, member: me.id, role: 'owner', ...card(me), joined_at: now() });
    if (acct) tx.update('accounts', { id: me.id }, { $set: { workspaces: [...(acct.workspaces || []), wid], owned: [...(acct.owned || []), wid] } });
    else tx.insert('accounts', { id: me.id, creator: !!me.admin, workspaces: [wid], owned: [wid], created_at: now() });
  });
  return wsDTO(ds.findOne('workspaces', wid), 'owner');
}

export function workspace(env, me, wid) {
  const { ws, role } = access(env, me, wid);
  const { ds } = env.holm.app;
  const swarms = byIds(ds, 'swarms', ws.swarms || []).filter((r) => !r.deleting).map((r) => swarmDTO(env, r));
  const members = ds.find('workspace_members', { workspace: ws.id }, { limit: 500 })
    .map((m) => ({ id: m.member, name: m.name, picture: m.picture, email: role === 'viewer' ? undefined : m.email, role: m.role, joined_at: m.joined_at }))
    .sort((a, b) => RANK[b.role] - RANK[a.role] || (a.name < b.name ? -1 : 1));
  const bytes = swarms.reduce((n, s) => n + s.bytes, 0);
  const out = { ...wsDTO(ws, role), swarms, members, usage: { bytes, swarms: swarms.length }, caps: caps(env) };
  if (role !== 'viewer') {
    out.invites = ds.find('invites', { workspace: ws.id }, { limit: 200 })
      .filter((i) => !i.used_at && i.expires_at > Date.now())
      .map((i) => ({ id: i.id.slice(0, 12), role: i.role, by: i.by_name, expires_at: i.expires_at }));
  }
  return out;
}

export function renameWorkspace(env, me, wid, input) {
  const { ws } = access(env, me, wid, 'admin');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || [...name].length > 60) throw new Err(400, 'A workspace name is 1 to 60 characters.');
  env.holm.app.ds.update('workspaces', { id: ws.id }, { $set: { name } });
  return { ok: true, name };
}

export function setRole(env, me, wid, member, role) {
  const { ws, role: mine } = access(env, me, wid, 'admin');
  if (!ROLES.includes(role) || role === 'owner') throw new Err(400, 'A role is admin or viewer.');
  const m = membership(env, ws.id, member);
  if (!m) throw new Err(404, 'No such member.');
  if (m.role === 'owner') throw new Err(403, 'The owner keeps their role.');
  if (mine !== 'owner' && m.role === 'admin' && member !== me.id) throw new Err(403, `Only ${ws.name}'s owner can change an admin's role.`);
  env.holm.app.ds.update('workspace_members', { id: m.id }, { $set: { role } });
  return { ok: true };
}

export function removeMember(env, me, wid, member) {
  const leaving = member === me.id;
  const { ws, role: mine } = access(env, me, wid, leaving ? 'viewer' : 'admin');
  const m = membership(env, ws.id, member);
  if (!m) throw new Err(404, 'No such member.');
  if (m.role === 'owner') throw new Err(403, 'The owner cannot leave. Delete the workspace instead.');
  if (!leaving && mine !== 'owner' && m.role === 'admin') throw new Err(403, `Only ${ws.name}'s owner can remove an admin.`);
  env.holm.app.ds.transaction((tx) => {
    tx.delete('workspace_members', { id: m.id });
    const acct = tx.findOne('accounts', member);
    if (acct) tx.update('accounts', { id: member }, { $set: { workspaces: (acct.workspaces || []).filter((w) => w !== ws.id) } });
  });
  return { ok: true };
}

export function deleteWorkspace(env, me, wid) {
  const { ws } = access(env, me, wid, 'owner');
  const { ds } = env.holm.app;
  for (const r of byIds(ds, 'swarms', ws.swarms || [])) {
    if (!deleteSwarm(env, r, 1500)) throw new Err(503, 'Still deleting its swarms. Try again in a moment.');
  }
  const members = ds.find('workspace_members', { workspace: ws.id }, { limit: 500 });
  ds.transaction((tx) => {
    for (const m of members) {
      tx.delete('workspace_members', { id: m.id });
      const acct = tx.findOne('accounts', m.member);
      if (acct) tx.update('accounts', { id: m.member }, { $set: { workspaces: (acct.workspaces || []).filter((w) => w !== ws.id), owned: (acct.owned || []).filter((w) => w !== ws.id) } });
    }
    tx.delete('workspaces', { id: ws.id });
  });
  return { ok: true };
}

// ---------------------------------------------------------------------- invites

async function makeInvite(env, me, fields) {
  const token = hex(16);
  const id = await sha256(token);
  env.holm.app.ds.insert('invites', { id, ...fields, by: me.id, by_name: me.name, created_at: now(), expires_at: Date.now() + DAYS_14 });
  return token;
}

export async function inviteToWorkspace(env, me, wid, input) {
  const { ws } = access(env, me, wid, 'admin');
  const role = input.role || 'viewer';
  if (role !== 'admin' && role !== 'viewer') throw new Err(400, 'A role is admin or viewer.');
  const token = await makeInvite(env, me, { kind: 'workspace', workspace: ws.id, role });
  return { token, path: `/i/${token}`, role, expires_at: Date.now() + DAYS_14 };
}

export async function inviteCreator(env, me) {
  if (!me.admin) throw new Err(403, 'Only the app admin may invite creators.');
  const token = await makeInvite(env, me, { kind: 'creator' });
  return { token, path: `/i/${token}`, expires_at: Date.now() + DAYS_14 };
}

async function inviteRow(env, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return null;
  const row = env.holm.app.ds.findOne('invites', await sha256(token));
  return row && !row.used_at && row.expires_at > Date.now() ? row : null;
}

export async function previewInvite(env, token) {
  const row = await inviteRow(env, token);
  if (!row) throw new Err(404, 'This invite has been used or has run out. Ask for a new one.');
  const ws = row.workspace ? wsRow(env, row.workspace) : null;
  return { kind: row.kind, role: row.role || null, workspace: ws ? { id: ws.id, name: ws.name } : null, by: row.by_name || '', expires_at: row.expires_at };
}

export async function acceptInvite(env, me, token) {
  const row = await inviteRow(env, token);
  if (!row) throw new Err(404, 'This invite has been used or has run out. Ask for a new one.');
  const { ds } = env.holm.app;
  const taken = ds.transaction((tx) => {
    const fresh = tx.findOne('invites', row.id);
    if (!fresh || fresh.used_at) return false;
    tx.update('invites', { id: row.id }, { $set: { used_at: now(), used_by: me.id } });
    return true;
  });
  if (!taken) throw new Err(409, 'This invite was just used. Ask for a new one.');
  if (row.kind === 'creator') {
    ds.transaction((tx) => {
      const acct = tx.findOne('accounts', me.id);
      if (acct) tx.update('accounts', { id: me.id }, { $set: { creator: true, invited_by: row.by } });
      else tx.insert('accounts', { id: me.id, creator: true, invited_by: row.by, workspaces: [], owned: [], created_at: now() });
    });
    return { kind: 'creator' };
  }
  const ws = wsRow(env, row.workspace);
  if (!ws) throw new Err(404, 'That workspace is gone.');
  addMember(env, ws.id, me, row.role);
  return { kind: 'workspace', workspace: ws.id };
}

export function revokeInvite(env, me, wid, prefix) {
  const { ws } = access(env, me, wid, 'admin');
  const hit = env.holm.app.ds.find('invites', { workspace: ws.id }, { limit: 200 }).find((i) => i.id.startsWith(String(prefix)));
  if (!hit) throw new Err(404, 'No such invite.');
  env.holm.app.ds.delete('invites', { id: hit.id });
  return { ok: true };
}

// ---------------------------------------------------------------------- swarms

export async function newSwarm(env, me, wid, input) {
  const { ws } = access(env, me, wid, 'admin');
  const c = caps(env);
  const live = byIds(env.holm.app.ds, 'swarms', ws.swarms || []).filter((r) => !r.deleting);
  if (!me.admin && c.swarms_per_workspace && live.length >= c.swarms_per_workspace) {
    throw new Err(403, `${ws.name} has ${live.length} swarms, the most a workspace may have. Delete one, or ask the app admin.`);
  }
  const settings = cleanSettings({
    max_users: c.agents_per_swarm, max_messages_day: c.messages_per_swarm_day, max_attachment: c.bytes_per_message,
    wait_guard: true, ...(input.settings || {}),
  });
  const { swarm, admin_token } = await createSwarm(env, { workspace: ws.id, name: input.name, settings, created_by: me.id });
  env.holm.app.ds.transaction((tx) => {
    const w = tx.findOne('workspaces', ws.id);
    tx.update('workspaces', { id: ws.id }, { $set: { swarms: [...(w.swarms || []), swarm.id] } });
  });
  return { swarm: swarmDTO(env, swarm, true), admin_token };
}

export function swarmDetail(env, me, sid) {
  const { row, ws, role } = swarmAccess(env, me, sid);
  return { ...swarmDTO(env, row, true), role, workspace_name: ws.name, can_manage: role !== 'viewer', viewer_channel: row.viewer };
}

const bytesOfWorkspace = (env, ws) => byIds(env.holm.app.ds, 'swarm_n', ws.swarms || []).reduce((n, m) => n + (m.bytes || 0), 0);

export function workspaceBytes(env, swarmRow) {
  const ws = wsRow(env, swarmRow.workspace);
  return ws ? bytesOfWorkspace(env, ws) : 0;
}

export async function addAgent(env, me, sid, input) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  const s = new Swarm(env, row, null);
  const made = await addUser(s, input.id, input.name, input.fields);
  return { ...made, swarm: row.id };
}

export async function removeAgent(env, me, sid, user) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  await removeUser(new Swarm(env, row, null), user);
  return { ok: true };
}

export async function rotateAgent(env, me, sid, user) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  return ADMIN.token_rotate(new Swarm(env, row, null), { id: user });
}

export async function rotateAdminToken(env, me, sid) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  return { admin_token: await rotateAdmin(env, row) };
}

export async function addViewKey(env, me, sid, input) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  const key = hex(24);
  const digest = await sha256(key);
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 60) : 'View link';
  const entry = { id: hex(4), label, sha256: digest, created_at: now(), by: me.name };
  env.holm.app.ds.transaction((tx) => {
    const r = tx.findOne('swarms', row.id);
    if ((r.view_keys || []).length >= 20) throw new Err(403, 'A swarm keeps at most 20 view links. Revoke one first.');
    tx.update('swarms', { id: row.id }, { $set: { view_keys: [...(r.view_keys || []), entry] } });
  });
  env.holm.app.kv.set('tok:' + digest, { swarm: row.id, user: '@view' });
  return { key, id: entry.id, label, path: `/s/${row.id}#key=${key}` };
}

export function revokeViewKey(env, me, sid, kid) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  const hit = (row.view_keys || []).find((k) => k.id === kid);
  if (!hit) throw new Err(404, 'No such view link.');
  env.holm.app.ds.update('swarms', { id: row.id }, { $set: { view_keys: row.view_keys.filter((k) => k.id !== kid) } });
  env.holm.app.kv.delete('tok:' + hit.sha256);
  return { ok: true };
}

export function setSwarmRules(env, me, sid, input) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  const rules = input.rules || {};
  if (typeof rules !== 'object' || Array.isArray(rules)) throw new Err(400, 'The rules are a JSON object.');
  setRules(new Swarm(env, row, null), rules);
  return { rules };
}

export function renameSwarm(env, me, sid, input) {
  const { row } = swarmAccess(env, me, sid, 'admin');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || [...name].length > 80) throw new Err(400, 'A swarm name is 1 to 80 characters.');
  env.holm.app.ds.update('swarms', { id: row.id }, { $set: { name } });
  return { ok: true, name };
}

export function removeSwarm(env, me, sid) {
  const { row, ws } = swarmAccess(env, me, sid, 'admin');
  env.holm.app.ds.transaction((tx) => {
    const w = tx.findOne('workspaces', ws.id);
    tx.update('workspaces', { id: ws.id }, { $set: { swarms: (w.swarms || []).filter((x) => x !== row.id) } });
  });
  const done = deleteSwarm(env, row, 2500);
  return { ok: true, done };
}

// ---------------------------------------------------------------------- the app admin

export function adminOverview(env, me) {
  if (!me.admin) throw new Err(403, 'Only the app admin may see this.');
  const { ds } = env.holm.app;
  const workspaces = ds.find('workspaces', {}, { limit: 1000 });
  const swarmIds = workspaces.flatMap((w) => w.swarms || []);
  const counters = new Map(byIds(ds, 'swarm_n', swarmIds).map((m) => [m.id, m]));
  const creators = ds.find('accounts', { creator: true }, { limit: 1000 }).map((a) => ({ id: a.id, owned: (a.owned || []).length, since: a.created_at }));
  const names = new Map(ds.find('workspace_members', { role: 'owner' }, { limit: 1000 }).map((m) => [m.member, m.name]));
  for (const c of creators) c.name = names.get(c.id) || '';
  const invites = ds.find('invites', { kind: 'creator' }, { limit: 200 }).filter((i) => !i.used_at && i.expires_at > Date.now())
    .map((i) => ({ id: i.id.slice(0, 12), by: i.by_name, expires_at: i.expires_at }));
  return {
    caps: caps(env), creators, invites,
    workspaces: workspaces.map((w) => ({
      id: w.id, name: w.name, owner: names.get(w.owner) || '', swarms: (w.swarms || []).length,
      bytes: (w.swarms || []).reduce((n, s) => n + (counters.get(s)?.bytes || 0), 0),
      events: (w.swarms || []).reduce((n, s) => n + (counters.get(s)?.n || 0), 0),
    })),
  };
}

export function setCaps(env, me, input) {
  if (!me.admin) throw new Err(403, 'Only the app admin may set the caps.');
  const next = { ...caps(env) };
  for (const k of Object.keys(CAPS)) {
    if (input[k] === undefined) continue;
    const v = Number(input[k]);
    if (!Number.isInteger(v) || v < 0) throw new Err(400, `${k} must be a whole number of at least 0 (0 is no limit).`);
    next[k] = k === 'bytes_per_message' ? Math.min(v || CAPS.bytes_per_message, CAPS.bytes_per_message) : v;
  }
  const { ds } = env.holm.app;
  if (ds.findOne('config', 'caps')) ds.update('config', { id: 'caps' }, { $set: { caps: next } });
  else ds.insert('config', { id: 'caps', caps: next });
  // Every workspace's swarms take the new limits at once.
  const ids = ds.find('workspaces', {}, { limit: 1000 }).flatMap((w) => w.swarms || []);
  for (const r of byIds(ds, 'swarms', ids)) {
    const settings = { ...(r.settings || {}), max_users: next.agents_per_swarm, max_messages_day: next.messages_per_swarm_day, max_attachment: next.bytes_per_message };
    ds.update('swarms', { id: r.id }, { $set: { settings } });
  }
  return { caps: next };
}

export function revokeCreatorInvite(env, me, prefix) {
  if (!me.admin) throw new Err(403, 'Only the app admin may do that.');
  const hit = env.holm.app.ds.find('invites', { kind: 'creator' }, { limit: 200 }).find((i) => i.id.startsWith(String(prefix)));
  if (!hit) throw new Err(404, 'No such invite.');
  env.holm.app.ds.delete('invites', { id: hit.id });
  return { ok: true };
}
