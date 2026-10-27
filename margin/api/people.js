// Who is asking. Everyone who signs in gets an account (`people`, private to Margin): their
// sign-in name, picture and email, and the handle of their main name once they pick one.
// Margin's admins are the node's app admins. What someone may do inside a workspace comes
// from their membership there (workspaces.js), set on the context with useWorkspace().
import { claim, one, byId, rows } from './lib/store.js';
import { reject } from './lib/util.js';

const DAY = 86400000;

// readOnly: for read operations, which may not write storage; a first-time visitor is
// then an account-to-be until their next write.
export function context(env, options = {}) {
  const auth = env.holm.auth;
  let member = null;
  try { member = auth.isLoggedIn() ? auth.getMember() : null; } catch { member = null; }
  const ctx = {
    env, member: member && member.id ? member : null, person: null, admin: false,
    ws: null, membership: null, writer: false, wsAdmin: false, cache: new Map(),
  };
  if (!ctx.member) return ctx;
  ctx.person = options.readOnly
    ? one(env, 'people', { memberId: ctx.member.id }) || { memberId: ctx.member.id, name: ctx.member.name || '', picture: ctx.member.picture || '', handle: null }
    : ensurePerson(env, ctx.member);
  try { ctx.admin = !!auth.isAppAdmin(); } catch { ctx.admin = false; }
  return ctx;
}

function ensurePerson(env, member) {
  const now = Date.now();
  const { doc, created } = claim(env, 'people', { memberId: member.id }, {
    memberId: member.id, name: member.name || '', picture: member.picture || '', email: member.email || '',
    handle: null, joinedAt: now, seenAt: now, v2: true,
  });
  if (created) return doc;
  // Margin 0.1.0 tied a main name to its account by memberId; 0.2.0 uses ownerId.
  if (doc.handle && !doc.v2) {
    const blog = one(env, 'blogs', { handle: doc.handle });
    if (blog && !blog.ownerId && blog.memberId === member.id) env.holm.app.ds.update('blogs', { id: blog.id }, { $set: { ownerId: member.id } });
    env.holm.app.ds.update('people', { id: doc.id }, { $set: { v2: true } });
  }
  const stale = now - (doc.seenAt || 0) > DAY;
  const changed = (member.name || '') !== doc.name || (member.picture || '') !== doc.picture || (member.email || '') !== (doc.email || '');
  if (!stale && !changed) return doc;
  env.holm.app.ds.update('people', { id: doc.id }, { $set: { name: member.name || doc.name, picture: member.picture || '', email: member.email || doc.email || '', seenAt: now } });
  return { ...doc, name: member.name || doc.name, picture: member.picture || '', email: member.email || doc.email || '', seenAt: now };
}

export function requireMember(ctx) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  return ctx;
}
export function requireJoined(ctx) {
  requireMember(ctx);
  if (!ctx.person || !ctx.person.handle) reject(409, 'needs_handle', 'Pick your name on Margin first.');
  return ctx;
}
export function requireWriter(ctx) {
  requireMember(ctx);
  if (!ctx.ws) reject(400, 'invalid_input', 'Say which workspace (its address, such as "lumen").');
  if (!ctx.writer) reject(403, 'forbidden', `Only people on ${ctx.ws.name} can do that. Ask its owner for an invite.`);
  return ctx;
}
// Margin's admins manage any workspace without being on it.
export function requireWsAdmin(ctx) {
  requireMember(ctx);
  if (!ctx.ws) reject(400, 'invalid_input', 'Say which workspace (its address, such as "lumen").');
  if (!ctx.wsAdmin) reject(403, 'forbidden', `Only ${ctx.ws.name}'s owners and admins can do that.`);
  return ctx;
}
export function requireAdmin(ctx) {
  requireMember(ctx);
  if (!ctx.admin) reject(403, 'forbidden', "Only Margin's admins can do that.");
  return ctx;
}

export function personByMember(env, memberId) {
  return memberId ? one(env, 'people', { memberId }) : null;
}
export function personById(env, id) { return byId(env, 'people', id); }

export function setHandle(env, memberId, handle) {
  const person = personByMember(env, memberId);
  if (!person) reject(404, 'not_found', 'No such account.');
  env.holm.app.ds.update('people', { id: person.id }, { $set: { handle } });
}

// Display identity for someone who comments before picking a name: their sign-in name
// and picture, nothing more.
export function memberCard(env, ctx, memberId) {
  if (!memberId) return null;
  const key = 'm:' + memberId;
  if (ctx && ctx.cache.has(key)) return ctx.cache.get(key);
  const person = personByMember(env, memberId);
  const card = person ? { name: person.name || 'Reader', picture: person.picture || '' } : { name: 'Reader', picture: '' };
  if (ctx) ctx.cache.set(key, card);
  return card;
}

export function peopleCount(env) { return rows(env, 'people', {}, 5000).length; }
