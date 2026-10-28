// Workspaces: a team's decks and library. Membership (`members`) ties an account to a
// workspace with a role: owner, admin (manages the team and invites) or editor (makes and
// edits decks). Decks are private to their workspace until someone shares one.
// Invites are links: single use, 14 days, optionally tied to an email address.
import { one, rows, mutate } from './lib/store.js';
import { reject, text, randomId, sha256 } from './lib/util.js';
import { requireMember } from './people.js';

export const ROLES = ['owner', 'admin', 'editor'];
const MAX_OWNED = 5;
const DAYS_14 = 14 * 86400000;
export const WID = /^[a-z0-9]{10}$/;

export function workspaceById(env, wid) {
  if (typeof wid !== 'string' || !WID.test(wid)) return null;
  return one(env, 'workspaces', { wid });
}

export function membershipOf(env, wid, account) {
  if (!wid || !account) return null;
  return one(env, 'members', { wid, account });
}

const RANK = { owner: 3, admin: 2, editor: 1 };

// The workspace and the caller's role there, or a 404 that does not tell a stranger it exists.
export function access(env, ctx, wid, need = 'editor') {
  requireMember(ctx);
  const ws = workspaceById(env, wid);
  const m = ws ? membershipOf(env, wid, ctx.member.id) : null;
  if (!ws || !m) reject(404, 'not_found', 'No such workspace. me_get lists yours.');
  if (RANK[m.role] < RANK[need]) reject(403, 'forbidden', need === 'owner' ? `Only ${ws.name}'s owners can do that.` : `Only ${ws.name}'s owners and admins can do that.`);
  return { ws, role: m.role, membership: m };
}

export const logoURL = (ws) => (ws.logo ? `/media/${ws.logo}` : null);

export function wsDTO(ws, role) {
  return {
    id: ws.wid, name: ws.name, logo: logoURL(ws), initial: (ws.name || '?').trim().charAt(0).toUpperCase(),
    role: role || null, can_manage: role === 'owner' || role === 'admin',
  };
}

export function myWorkspaces(env, ctx) {
  if (!ctx.member) return [];
  return rows(env, 'members', { account: ctx.member.id }, 100).map((m) => {
    const ws = workspaceById(env, m.wid);
    return ws ? { ...wsDTO(ws, m.role), joined: m.joinedAt || 0 } : null;
  }).filter(Boolean).sort((a, b) => a.joined - b.joined);
}

function card(member) {
  return { name: member.name || '', picture: member.picture || '', email: member.email || '' };
}

export function addMember(env, wid, member, role) {
  const existing = membershipOf(env, wid, member.id);
  if (existing) {
    if (RANK[role] > RANK[existing.role]) env.holm.app.ds.update('members', { id: existing.id }, { $set: { role } });
    return existing;
  }
  const doc = { wid, account: member.id, role, ...card(member), joinedAt: Date.now() };
  doc.id = env.holm.app.ds.insert('members', doc);
  return doc;
}

// Keep the team list's names and pictures current: once a day, or when they change.
export function refreshMember(env, member) {
  const now = Date.now();
  const mine = rows(env, 'members', { account: member.id }, 100);
  for (const m of mine) {
    const c = card(member);
    if (m.name === c.name && m.picture === c.picture && m.email === c.email && now - (m.seenAt || 0) < 86400000) continue;
    env.holm.app.ds.update('members', { id: m.id }, { $set: { ...c, seenAt: now } });
  }
}

export function createWorkspace(env, ctx, input) {
  requireMember(ctx);
  const name = text(input.name, 60, 'Name', true);
  const owned = rows(env, 'members', { account: ctx.member.id, role: 'owner' }, 50).length;
  if (owned >= MAX_OWNED) reject(409, 'too_many', `You can own ${MAX_OWNED} workspaces.`);
  const doc = { wid: randomId(10), name, logo: null, chan: randomId(20), createdBy: ctx.member.id, createdAt: Date.now() };
  env.holm.app.ds.insert('workspaces', doc);
  addMember(env, doc.wid, ctx.member, 'owner');
  return doc;
}

export function updateWorkspace(env, ctx, wid, input, hasMedia) {
  const { ws, role } = access(env, ctx, wid, 'admin');
  const set = {};
  if (input.name !== undefined) set.name = text(input.name, 60, 'Name', true);
  if (input.logo !== undefined) {
    if (input.logo === null || input.logo === '') set.logo = null;
    else {
      const m = /^(?:\/media\/)?([a-z0-9]{6,20})(?:\.[a-z0-9]{2,5})?$/.exec(String(input.logo).trim());
      if (!m || !hasMedia(m[1])) reject(400, 'invalid_input', "A logo is a picture from this workspace's library.");
      set.logo = m[1];
    }
  }
  const next = mutate(env, 'workspaces', ws.id, () => (Object.keys(set).length ? { $set: set } : null));
  broadcast(env, next, { type: 'workspace' });
  return wsDTO(next, role);
}

// Workspace changes (decks added, renamed, shared, deleted) ping one secret channel, so
// every open library refreshes.
export function broadcast(env, ws, data) {
  try { env.holm.realtime.broadcast('ws-' + ws.chan, data); } catch (error) { console.warn('realtime', String(error && error.message || error).slice(0, 200)); }
}

export function teamList(env, ctx, wid) {
  const { ws, role } = access(env, ctx, wid, 'editor');
  const manage = role === 'owner' || role === 'admin';
  const members = rows(env, 'members', { wid }, 500).map((m) => ({
    account: m.account, role: m.role, name: m.name || 'Member', picture: m.picture || '',
    email: manage ? m.email || '' : '', you: m.account === ctx.member.id, joined_at: new Date(m.joinedAt || 0).toISOString(),
  })).sort((a, b) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name));
  return { workspace: wsDTO(ws, role), members, invites: manage ? listInvites(env, wid) : [] };
}

export function setRole(env, ctx, wid, account, role) {
  const { ws, role: mine } = access(env, ctx, wid, 'admin');
  if (!ROLES.includes(role) && role !== 'remove') reject(400, 'invalid_input', 'Role is owner, admin, editor or remove.');
  const m = membershipOf(env, wid, account);
  if (!m) reject(404, 'not_found', 'No such member.');
  if ((role === 'owner' || m.role === 'owner') && mine !== 'owner') reject(403, 'forbidden', 'Only owners add or remove owners.');
  if (m.role === 'owner' && role !== 'owner' && rows(env, 'members', { wid, role: 'owner' }, 50).length <= 1) {
    reject(409, 'last_owner', 'A workspace needs an owner. Make someone else an owner first.');
  }
  if (role === 'remove') env.holm.app.ds.delete('members', { id: m.id });
  else env.holm.app.ds.update('members', { id: m.id }, { $set: { role } });
  broadcast(env, ws, { type: 'team' });
  return role === 'remove' ? { removed: true } : { account, role };
}

export function leave(env, ctx, wid) {
  const { ws, membership } = access(env, ctx, wid, 'editor');
  if (membership.role === 'owner' && rows(env, 'members', { wid, role: 'owner' }, 50).length <= 1) {
    reject(409, 'last_owner', 'Make someone else an owner before you leave.');
  }
  env.holm.app.ds.delete('members', { id: membership.id });
  broadcast(env, ws, { type: 'team' });
  return { left: true };
}

// ---------- invites ----------

export async function createInvite(env, ctx, wid, input, origin) {
  const { ws } = access(env, ctx, wid, 'admin');
  const role = input.role === 'admin' ? 'admin' : 'editor';
  const email = text(input.email, 200, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject(400, 'invalid_input', 'That email address looks wrong.');
  if (rows(env, 'invites', { wid }, 300).filter((i) => !i.revoked && !i.usedBy && i.expiresAt > Date.now()).length >= 50) {
    reject(409, 'too_many', 'This workspace has 50 open invites. Revoke some first.');
  }
  const code = randomId(22);
  const now = Date.now();
  const id = env.holm.app.ds.insert('invites', {
    wid, codeHash: await sha256(code), email: email ? email.toLowerCase() : null, role,
    createdBy: ctx.member.id, createdByName: ctx.member.name || '', createdAt: now, expiresAt: now + DAYS_14,
    usedBy: null, usedAt: null, revoked: false,
  });
  const link = `${origin}/join/${code}`;
  let emailed = null;
  if (email && input.send_email) {
    try {
      const who = ctx.member.name || 'Someone on the team';
      const result = env.holm.email.send({
        to: email,
        subject: `${who} invited you to ${ws.name} on Deck`,
        body: `${who} invited you to make decks with ${ws.name}, on Deck.\n\nOpen this link to join:\n${link}\n\nIt works once and expires in 14 days.`,
      });
      emailed = result && result.ok ? { ok: true } : { ok: false, code: result && result.code, message: result && result.message };
    } catch (error) {
      emailed = { ok: false, code: 'EMAIL_FAILED', message: String(error && error.message || error).slice(0, 200) };
    }
  }
  return { id, link, role, email: email || null, expires_at: new Date(now + DAYS_14).toISOString(), emailed };
}

async function findInvite(env, code) {
  if (!/^[a-z0-9]{10,40}$/.test(code || '')) return null;
  return one(env, 'invites', { codeHash: await sha256(code) });
}

function mask(email) {
  if (!email) return null;
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export async function previewInvite(env, ctx, code) {
  const invite = await findInvite(env, code);
  const ws = invite ? workspaceById(env, invite.wid) : null;
  if (!invite || invite.revoked || !ws) return { valid: false, reason: 'This invite link is not valid.' };
  const base = { workspace: ws.name, logo: logoURL(ws), initial: wsDTO(ws).initial, invited_by: invite.createdByName || '' };
  const mine = ctx.member && membershipOf(env, ws.wid, ctx.member.id);
  if (mine) return { ...base, valid: false, member: true, id: ws.wid, reason: `You're already on ${ws.name}.` };
  if (invite.usedBy) return { ...base, valid: false, reason: 'This invite was already used.' };
  if (invite.expiresAt < Date.now()) return { ...base, valid: false, reason: 'This invite has expired. Ask for a new one.' };
  return { ...base, valid: true, role: invite.role, email: mask(invite.email) };
}

export async function acceptInvite(env, ctx, code) {
  requireMember(ctx);
  const invite = await findInvite(env, code);
  const ws = invite ? workspaceById(env, invite.wid) : null;
  if (!invite || invite.revoked || !ws) reject(404, 'not_found', 'This invite link is not valid.');
  if (membershipOf(env, ws.wid, ctx.member.id)) return { workspace: ws.wid };
  if (invite.usedBy && invite.usedBy !== ctx.member.id) reject(409, 'used', 'This invite was already used.');
  if (invite.expiresAt < Date.now()) reject(410, 'expired', 'This invite has expired. Ask for a new one.');
  if (invite.email && (ctx.member.email || '').toLowerCase() !== invite.email) {
    reject(403, 'wrong_account', `This invite is for ${mask(invite.email)}. Sign in with that address.`);
  }
  const claimed = mutate(env, 'invites', invite.id, (cur) => (cur.usedBy ? null : { $set: { usedBy: ctx.member.id, usedAt: Date.now() } }));
  if (claimed.usedBy !== ctx.member.id) reject(409, 'used', 'This invite was already used.');
  addMember(env, ws.wid, ctx.member, invite.role);
  broadcast(env, ws, { type: 'team' });
  return { workspace: ws.wid };
}

function listInvites(env, wid) {
  const now = Date.now();
  return rows(env, 'invites', { wid }, 300).filter((i) => !i.revoked && !i.usedBy && i.expiresAt > now).map((i) => ({
    id: i.id, email: i.email, role: i.role, invited_by: i.createdByName,
    created_at: new Date(i.createdAt).toISOString(), expires_at: new Date(i.expiresAt).toISOString(),
  }));
}

export function revokeInvite(env, ctx, wid, id) {
  access(env, ctx, wid, 'admin');
  const invite = typeof id === 'string' ? env.holm.app.ds.findOne('invites', id) : null;
  if (!invite || invite.wid !== wid) reject(404, 'not_found', 'No such invite.');
  env.holm.app.ds.update('invites', { id }, { $set: { revoked: true } });
  return { revoked: true };
}
