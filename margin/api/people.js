// Who is asking: the signed-in member, their place on the team, and what they may do.
//   admin  — the app's Holm admins, plus anyone invited as admin
//   writer — invited; owns one blog and may write as personas they were given
//   reader — anyone else who signs in; may comment and clap
import { claim, byId, one, rows, mutate } from './lib/store.js';
import { reject } from './lib/util.js';

const DAY = 86400000;

// readOnly: for read operations, which may not write storage; a first-time visitor is
// then a reader until their next write.
export function context(env, options = {}) {
  const auth = env.holm.auth;
  let member = null;
  try { member = auth.isLoggedIn() ? auth.getMember() : null; } catch { member = null; }
  const ctx = { env, member: member && member.id ? member : null, person: null, role: 'visitor', admin: false, writer: false, cache: new Map() };
  if (!ctx.member) return ctx;
  const person = options.readOnly
    ? one(env, 'people', { memberId: ctx.member.id }) || { memberId: ctx.member.id, name: ctx.member.name || '', picture: ctx.member.picture || '', role: 'reader', handle: null }
    : ensurePerson(env, ctx.member);
  let appAdmin = false;
  try { appAdmin = auth.isAppAdmin(); } catch { appAdmin = false; }
  ctx.person = person;
  ctx.admin = appAdmin || person.role === 'admin';
  ctx.writer = ctx.admin || person.role === 'writer';
  ctx.role = ctx.admin ? 'admin' : person.role;
  return ctx;
}

function ensurePerson(env, member) {
  const now = Date.now();
  const { doc, created } = claim(env, 'people', { memberId: member.id }, {
    memberId: member.id, name: member.name || '', picture: member.picture || '', email: member.email || '',
    role: 'reader', handle: null, joinedAt: now, seenAt: now,
  });
  if (created) return doc;
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
export function requireWriter(ctx) {
  requireMember(ctx);
  if (!ctx.writer) reject(403, 'forbidden', 'Only writers on this team can do that. Ask an admin for an invite.');
  return ctx;
}
export function requireAdmin(ctx) {
  requireMember(ctx);
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins can do that.');
  return ctx;
}

export function personByMember(env, memberId) {
  return memberId ? one(env, 'people', { memberId }) : null;
}

// Display identity for a member who has no blog: their sign-in name and picture.
export function memberCard(env, ctx, memberId) {
  if (!memberId) return null;
  const key = 'm:' + memberId;
  if (ctx && ctx.cache.has(key)) return ctx.cache.get(key);
  const person = personByMember(env, memberId);
  const card = person ? { name: person.name || 'Reader', picture: person.picture || '', handle: person.handle || null, team: person.role !== 'reader' } : { name: 'Reader', picture: '', handle: null, team: false };
  if (ctx) ctx.cache.set(key, card);
  return card;
}

export function teamList(env) {
  return rows(env, 'people', {}, 2000)
    .filter((p) => p.role === 'admin' || p.role === 'writer')
    .map((p) => ({ memberId: p.memberId, name: p.name, picture: p.picture, email: p.email || '', role: p.role, handle: p.handle, joinedAt: p.joinedAt }));
}

export function setRole(env, ctx, memberId, role) {
  if (!['admin', 'writer', 'reader'].includes(role)) reject(400, 'invalid_input', 'Role is admin, writer or reader.');
  const person = personByMember(env, memberId);
  if (!person) reject(404, 'not_found', 'No such member.');
  if (memberId === ctx.member.id && role !== 'admin') reject(400, 'invalid_input', "You can't remove your own admin role.");
  return mutate(env, 'people', person.id, () => ({ $set: { role } }));
}

export function setHandle(env, memberId, handle) {
  const person = personByMember(env, memberId);
  if (!person) reject(404, 'not_found', 'No such member.');
  env.holm.app.ds.update('people', { id: person.id }, { $set: { handle } });
}

export function personById(env, id) { return byId(env, 'people', id); }
