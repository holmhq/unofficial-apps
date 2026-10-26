// Invites: only admins invite. A link is single-use, lasts 14 days and may be tied to an
// email address; accepting it makes the person a writer (or admin) and gives them a blog.
import { one, rows, mutate } from './lib/store.js';
import { reject, text, randomId, sha256 } from './lib/util.js';
import { blogByHandle, createPersonBlog } from './blogs.js';
import { siteSettings } from './settings.js';

const DAYS_14 = 14 * 86400000;

export async function createInvite(env, ctx, input, origin) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins invite people.');
  const role = input.role === 'admin' ? 'admin' : 'writer';
  const email = text(input.email, 200, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject(400, 'invalid_input', 'That email address looks wrong.');
  const personas = Array.isArray(input.personas) ? input.personas.map((h) => String(h).replace(/^@/, '').toLowerCase()).filter((h) => blogByHandle(env, h)).slice(0, 20) : [];
  const code = randomId(22);
  const now = Date.now();
  env.holm.app.ds.insert('invites', {
    codeHash: await sha256(code), email: email ? email.toLowerCase() : null, role, personas, note: text(input.note, 200, 'Note') || '',
    createdBy: ctx.member.id, createdByName: ctx.member.name || '', createdAt: now, expiresAt: now + DAYS_14, usedBy: null, usedAt: null, revoked: false,
  });
  const link = `${origin}/join/${code}`;
  let emailed = null;
  if (email && input.send_email !== false) {
    const site = siteSettings(env);
    try {
      const result = env.holm.email.send({
        to: email,
        subject: `${ctx.member.name || 'Your team'} invited you to write on ${site.name}`,
        body: `${ctx.member.name || 'Someone on the team'} invited you to write on ${site.name}.\n\nOpen this link to pick your handle and start writing:\n${link}\n\nThe link works once and expires in 14 days.`,
      });
      emailed = result && result.ok ? { ok: true } : { ok: false, code: result && result.code, message: result && result.message };
    } catch (error) {
      emailed = { ok: false, code: 'EMAIL_FAILED', message: String(error && error.message || error).slice(0, 200) };
    }
  }
  return { link, role, email: email || null, expires_at: new Date(now + DAYS_14).toISOString(), emailed };
}

async function find(env, code) {
  if (!/^[a-z0-9]{10,40}$/.test(code || '')) return null;
  return one(env, 'invites', { codeHash: await sha256(code) });
}

function mask(email) {
  if (!email) return null;
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export async function previewInvite(env, ctx, code) {
  const invite = await find(env, code);
  const site = siteSettings(env);
  if (!invite || invite.revoked) return { valid: false, reason: 'This invite link is not valid.', site: site.name };
  if (invite.usedBy) return { valid: false, reason: invite.usedBy === (ctx.member && ctx.member.id) ? 'You already joined with this link.' : 'This invite was already used.', site: site.name, used: true };
  if (invite.expiresAt < Date.now()) return { valid: false, reason: 'This invite has expired. Ask for a new one.', site: site.name };
  return { valid: true, site: site.name, role: invite.role, invited_by: invite.createdByName, email: mask(invite.email), personas: invite.personas || [] };
}

export async function acceptInvite(env, ctx, code, input) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  const invite = await find(env, code);
  if (!invite || invite.revoked) reject(404, 'not_found', 'This invite link is not valid.');
  if (invite.usedBy && invite.usedBy !== ctx.member.id) reject(409, 'used', 'This invite was already used.');
  if (invite.expiresAt < Date.now()) reject(410, 'expired', 'This invite has expired. Ask for a new one.');
  if (invite.email && (ctx.member.email || '').toLowerCase() !== invite.email) {
    reject(403, 'wrong_account', `This invite is for ${mask(invite.email)}. Sign in with that address.`);
  }
  mutate(env, 'invites', invite.id, (current) => (current.usedBy ? null : { $set: { usedBy: ctx.member.id, usedAt: Date.now() } }));
  const role = ctx.admin ? 'admin' : invite.role;
  env.holm.app.ds.update('people', { id: ctx.person.id }, { $set: { role } });
  ctx.person.role = role;
  ctx.writer = true;
  ctx.admin = ctx.admin || role === 'admin';
  let blog = ctx.person.handle ? blogByHandle(env, ctx.person.handle) : null;
  if (!blog && input && input.handle) blog = createPersonBlog(env, ctx, input);
  for (const handle of invite.personas || []) {
    const persona = blogByHandle(env, handle);
    if (persona && persona.kind === 'persona' && !(persona.writers || []).includes(ctx.member.id)) {
      env.holm.app.ds.update('blogs', { id: persona.id }, { $set: { writers: [...(persona.writers || []), ctx.member.id] } });
    }
  }
  return { role, handle: blog ? blog.handle : null };
}

export function listInvites(env, ctx) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins see invites.');
  return rows(env, 'invites', {}, 300).filter((i) => !i.revoked).map((i) => ({
    id: i.id, email: i.email, role: i.role, personas: i.personas || [], invited_by: i.createdByName,
    created_at: new Date(i.createdAt).toISOString(), expires_at: new Date(i.expiresAt).toISOString(),
    used: !!i.usedBy, used_at: i.usedAt ? new Date(i.usedAt).toISOString() : null, expired: i.expiresAt < Date.now(),
  }));
}

export function revokeInvite(env, ctx, id) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins revoke invites.');
  mutate(env, 'invites', id, () => ({ $set: { revoked: true } }));
  return { revoked: true };
}
