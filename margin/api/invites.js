// Invites: a workspace's owners and admins invite people to write there. A link is
// single-use, lasts 14 days and may be tied to an email address. Accepting it makes the
// person a writer (or admin) of the workspace; someone new picks their name on Margin in
// the same step, even when sign-ups are closed.
import { one, rows, mutate } from './lib/store.js';
import { reject, text, randomId, sha256 } from './lib/util.js';
import { blogByHandle, createPersonBlog, canWriteAs } from './blogs.js';
import { addMember, workspaceBySlug, useWorkspace } from './workspaces.js';

const DAYS_14 = 14 * 86400000;

export async function createInvite(env, ctx, input, origin) {
  if (!ctx.ws || !ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins invite people.');
  const role = input.role === 'admin' ? 'admin' : 'writer';
  const email = text(input.email, 200, 'Email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject(400, 'invalid_input', 'That email address looks wrong.');
  const code = randomId(22);
  const now = Date.now();
  env.holm.app.ds.insert('invites', {
    ws: ctx.ws.slug, codeHash: await sha256(code), email: email ? email.toLowerCase() : null, role, note: text(input.note, 200, 'Note') || '',
    createdBy: ctx.member.id, createdByName: ctx.member.name || '', createdAt: now, expiresAt: now + DAYS_14, usedBy: null, usedAt: null, revoked: false,
  });
  const link = `${origin}/join/${code}`;
  let emailed = null;
  if (email && input.send_email !== false) {
    try {
      const result = env.holm.email.send({
        to: email,
        subject: `${ctx.member.name || 'Your team'} invited you to write on ${ctx.ws.name}`,
        body: `${ctx.member.name || 'Someone on the team'} invited you to write on ${ctx.ws.name}, on Margin.\n\nOpen this link to pick your name and start writing:\n${link}\n\nThe link works once and expires in 14 days.`,
      });
      emailed = result && result.ok ? { ok: true } : { ok: false, code: result && result.code, message: result && result.message };
    } catch (error) {
      emailed = { ok: false, code: 'EMAIL_FAILED', message: String(error && error.message || error).slice(0, 200) };
    }
  }
  return { link, role, workspace: ctx.ws.slug, email: email || null, expires_at: new Date(now + DAYS_14).toISOString(), emailed };
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
  const ws = invite ? workspaceBySlug(env, invite.ws) : null;
  const name = ws ? ws.name : 'Margin';
  if (!invite || invite.revoked || !ws || ws.suspended) return { valid: false, reason: 'This invite link is not valid.', workspace: name };
  if (invite.usedBy) return { valid: false, reason: invite.usedBy === (ctx.member && ctx.member.id) ? 'You already joined with this link.' : 'This invite was already used.', workspace: name, slug: ws.slug, used: true };
  if (invite.expiresAt < Date.now()) return { valid: false, reason: 'This invite has expired. Ask for a new one.', workspace: name };
  return { valid: true, workspace: name, slug: ws.slug, logo: ws.logo ? `/media/${ws.logo}` : null, role: invite.role, invited_by: invite.createdByName, email: mask(invite.email) };
}

export async function acceptInvite(env, ctx, code, input) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  const invite = await find(env, code);
  const ws = invite ? workspaceBySlug(env, invite.ws) : null;
  if (!invite || invite.revoked || !ws || ws.suspended) reject(404, 'not_found', 'This invite link is not valid.');
  if (invite.usedBy && invite.usedBy !== ctx.member.id) reject(409, 'used', 'This invite was already used.');
  if (invite.expiresAt < Date.now()) reject(410, 'expired', 'This invite has expired. Ask for a new one.');
  if (invite.email && (ctx.member.email || '').toLowerCase() !== invite.email) {
    reject(403, 'wrong_account', `This invite is for ${mask(invite.email)}. Sign in with that address.`);
  }
  if (!ctx.person.handle) {
    if (!input || !input.handle) reject(409, 'needs_handle', 'Pick your name on Margin to join.');
    createPersonBlog(env, ctx, input, { invited: true });
  }
  // Join under the name they chose, if it's theirs; else their main name.
  let name = ctx.person.handle;
  if (input && input.as) {
    const blog = blogByHandle(env, String(input.as).replace(/^@/, '').toLowerCase());
    if (blog && blog.kind !== 'workspace' && canWriteAs(ctx, blog)) name = blog.handle;
  }
  mutate(env, 'invites', invite.id, (current) => (current.usedBy ? null : { $set: { usedBy: ctx.member.id, usedAt: Date.now() } }));
  addMember(env, ws.slug, ctx.member.id, invite.role, [name]);
  useWorkspace(env, ctx, ws);
  return { workspace: ws.slug, role: ctx.wsRole, handle: name };
}

export function listInvites(env, ctx) {
  if (!ctx.ws || !ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins see invites.');
  return rows(env, 'invites', { ws: ctx.ws.slug }, 300).filter((i) => !i.revoked).map((i) => ({
    id: i.id, email: i.email, role: i.role, invited_by: i.createdByName,
    created_at: new Date(i.createdAt).toISOString(), expires_at: new Date(i.expiresAt).toISOString(),
    used: !!i.usedBy, used_at: i.usedAt ? new Date(i.usedAt).toISOString() : null, expired: i.expiresAt < Date.now(),
  }));
}

export function revokeInvite(env, ctx, id) {
  const invite = env.holm.app.ds.findOne('invites', id);
  if (!invite || !ctx.ws || invite.ws !== ctx.ws.slug || !ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins revoke invites.');
  mutate(env, 'invites', id, () => ({ $set: { revoked: true } }));
  return { revoked: true };
}
