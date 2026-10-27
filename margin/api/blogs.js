// Identities ("blogs"): every name someone writes or comments under. Three kinds share one
// namespace with workspace addresses, so /lumen and /@lumen can never mean two things:
//   person    — an account's main name, picked when they join
//   persona   — any further name an account keeps; readers can't tell it from a person
//   workspace — a workspace's own voice, written by its owners and admins
// Who owns a person or persona (ownerId) is private: it never leaves this module's DTOs.
import { claim, one, rows, mutate, touch } from './lib/store.js';
import { reject, text, longText, escapeHTML } from './lib/util.js';
import { setHandle } from './people.js';
import { marginSettings } from './settings.js';

export const HANDLE = /^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/;
export const RESERVED = new Set([
  'a', 'about', 'admin', 'administrator', 'api', 'app', 'apps', 'assets', 'auth', 'blog', 'blogs', 'c', 'cards', 'claude',
  'explore', 'feed', 'feeds', 'help', 'holm', 'home', 'join', 'latest', 'llms', 'login', 'logout', 'margin', 'me', 'media',
  'new', 'null', 'p', 'post', 'posts', 'preview', 'robots', 'root', 'rss', 'samples', 'search', 'settings', 'signin',
  'signup', 'sitemap', 'static', 'studio', 'support', 'system', 't', 'tag', 'tags', 'undefined', 'workspace',
  'themes', 'upload', 'uploads', 'v', 'vendor', 'workspaces', 'write', 'www', 'you',
]);
const MAX_PERSONAS = 12;

export function handle(value, label = 'A handle') {
  const out = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE.test(out)) reject(400, 'invalid_handle', `${label} is 2–30 lowercase letters, digits, - or _, starting with a letter.`);
  if (RESERVED.has(out)) reject(409, 'taken', `${out} is reserved. Pick another.`);
  return out;
}

export function blogByHandle(env, value) {
  if (!value || !HANDLE.test(value)) return null;
  return one(env, 'blogs', { handle: value });
}

export function allBlogs(env) { return rows(env, 'blogs', {}, 3000); }

// Claim a handle for a new identity; the first writer wins a race.
export function claimHandle(env, value, doc) {
  const { doc: saved, created } = claim(env, 'blogs', { handle: value }, { ...doc, handle: value, createdAt: Date.now() });
  if (!created) reject(409, 'taken', `${value} is taken. Pick another.`);
  return saved;
}

// Same seed, same colour, so an identity looks the same everywhere.
const SWATCHES = ['#1a7f64', '#0a6ff0', '#c2410c', '#6d28d9', '#be185d', '#0e7490', '#4d7c0f', '#b45309', '#334155', '#9333ea'];
export function swatch(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length];
}
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const out = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return out.toUpperCase();
}

export function avatarURL(blog) {
  if (blog.avatar) return `/media/${blog.avatar}`;
  if (blog.picture) return blog.picture;
  return `/a/${blog.handle}.svg`;
}

export function avatarSVG(blog) {
  const label = escapeHTML(initials(blog ? blog.name : '?'));
  const color = swatch(blog ? blog.handle : '?');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="48" y="50" dy=".35em" text-anchor="middle" font-family="Inter, -apple-system, system-ui, sans-serif" font-size="38" font-weight="600" fill="#fff">${label}</text></svg>`;
}

// The page for an identity: a workspace's voice is its home; anyone else has a page in
// each workspace (/lumen/@maya) and one across Margin (/@maya).
export function blogURL(blog, ws) {
  if (blog.kind === 'workspace') return `/${blog.ws}`;
  return ws ? `/${ws}/@${blog.handle}` : `/@${blog.handle}`;
}

export function blogDTO(blog, ws) {
  const url = blogURL(blog, ws);
  return {
    handle: blog.handle,
    name: blog.name,
    bio: blog.bio || '',
    is_workspace: blog.kind === 'workspace',
    url,
    profile_url: blog.kind === 'workspace' ? url : `/@${blog.handle}`,
    feed_url: blog.kind === 'workspace' ? `/${blog.ws}/feed.xml` : `${url}/feed.xml`,
    avatar: avatarURL(blog),
    initials: initials(blog.name),
    color: swatch(blog.handle),
  };
}

// The owner's own view of an identity, with what readers never see.
export function ownDTO(blog, ws) {
  return { ...blogDTO(blog, ws), kind: blog.kind, own: blog.kind === 'person', persona: blog.kind === 'persona' };
}

export function canWriteAs(ctx, blog) {
  if (!ctx.member || !blog) return false;
  if (blog.kind === 'workspace') return !!(ctx.ws && ctx.ws.slug === blog.ws && ctx.wsAdmin);
  if (blog.sample) return ctx.admin;
  return blog.ownerId === ctx.member.id;
}

// Everything this account writes and comments under, main name first.
export function myIdentities(env, ctx) {
  if (!ctx.member) return [];
  const key = 'ids:' + ctx.member.id;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const list = rows(env, 'blogs', { ownerId: ctx.member.id }, 100)
    .sort((a, b) => (a.kind === 'person' ? -1 : 0) - (b.kind === 'person' ? -1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
  ctx.cache.set(key, list);
  return list;
}

// Who this account can post as in the current workspace.
export function writableBlogs(env, ctx) {
  if (!ctx.writer) return [];
  const list = [...myIdentities(env, ctx)];
  if (ctx.wsAdmin) {
    const voice = blogByHandle(env, ctx.ws.slug);
    if (voice && voice.kind === 'workspace') list.push(voice);
  }
  return list;
}

// The identity someone acts as: the one named, if it's theirs, else their main name.
export function resolveAs(env, ctx, as) {
  if (as) {
    const blog = blogByHandle(env, String(as).replace(/^@/, '').toLowerCase());
    if (!blog) reject(404, 'not_found', `There is no @${as}.`);
    if (!canWriteAs(ctx, blog)) reject(403, 'persona_forbidden', `You can't write as @${blog.handle}.`);
    return blog;
  }
  const own = ctx.person && ctx.person.handle ? blogByHandle(env, ctx.person.handle) : null;
  if (!own) reject(409, 'needs_handle', 'Pick your name on Margin first.');
  return own;
}

// Joining Margin: pick a main name. With sign-ups closed, only an invite (or an admin) can.
export function createPersonBlog(env, ctx, input, options = {}) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  if (ctx.person.handle) reject(409, 'has_blog', `You already write as @${ctx.person.handle}.`);
  if (marginSettings(env).signups === 'invite' && !options.invited && !ctx.admin) reject(403, 'signups_closed', 'Margin is invite-only here. Ask someone on a workspace for an invite.');
  const value = handle(input.handle);
  const name = text(input.name, 60, 'Name') || ctx.member.name || value;
  const doc = claimHandle(env, value, {
    kind: 'person', ownerId: ctx.member.id, name, bio: longText(input.bio, 280, 'Bio') || '',
    avatar: null, picture: ctx.member.picture || '',
  });
  setHandle(env, ctx.member.id, value);
  ctx.person.handle = value;
  ctx.cache.delete('ids:' + ctx.member.id);
  touch(env);
  return doc;
}

export function createPersona(env, ctx, input) {
  if (!ctx.person || !ctx.person.handle) reject(409, 'needs_handle', 'Pick your main name first.');
  const mine = myIdentities(env, ctx).filter((b) => b.kind === 'persona');
  if (mine.length >= MAX_PERSONAS) reject(409, 'too_many', `You can keep ${MAX_PERSONAS} personas.`);
  const value = handle(input.handle);
  const doc = claimHandle(env, value, {
    kind: 'persona', ownerId: ctx.member.id, name: text(input.name, 60, 'Name', true), bio: longText(input.bio, 280, 'Bio') || '',
    avatar: typeof input.avatar === 'string' && /^[a-z0-9]{6,20}$/.test(input.avatar) ? input.avatar : null, picture: '',
  });
  ctx.cache.delete('ids:' + ctx.member.id);
  touch(env);
  return doc;
}

export function canEditIdentity(ctx, blog) {
  if (!ctx.member || !blog) return false;
  if (ctx.admin) return true;
  if (blog.kind === 'workspace') return !!(ctx.ws && ctx.ws.slug === blog.ws && ctx.wsAdmin);
  return blog.ownerId === ctx.member.id;
}

export function updateBlog(env, ctx, blog, input) {
  if (!canEditIdentity(ctx, blog)) reject(403, 'forbidden', `You can't edit @${blog.handle}.`);
  const set = {};
  if (input.name !== undefined) set.name = text(input.name, 60, 'Name', true);
  if (input.bio !== undefined) set.bio = longText(input.bio, 280, 'Bio') || '';
  if (input.avatar !== undefined) set.avatar = input.avatar ? text(input.avatar, 40, 'Avatar') : null;
  if (!Object.keys(set).length) return blog;
  const doc = mutate(env, 'blogs', blog.id, () => ({ $set: set }));
  if (ctx.member) ctx.cache.delete('ids:' + ctx.member.id);
  touch(env);
  return doc;
}

export function deletePersona(env, ctx, blog) {
  if (blog.kind !== 'persona') reject(400, 'invalid_input', 'Only personas can be removed.');
  if (!canEditIdentity(ctx, blog)) reject(403, 'forbidden', `You can't remove @${blog.handle}.`);
  const posts = env.holm.app.ds.count('posts', { blog: blog.handle });
  if (posts) reject(409, 'has_posts', `@${blog.handle} has ${posts} post${posts === 1 ? '' : 's'}. Delete them first.`);
  env.holm.app.ds.delete('blogs', { id: blog.id });
  for (const m of rows(env, 'members', {}, 3000)) {
    if ((m.identities || []).includes(blog.handle)) env.holm.app.ds.update('members', { id: m.id }, { $set: { identities: m.identities.filter((h) => h !== blog.handle) } });
  }
  if (ctx.member) ctx.cache.delete('ids:' + ctx.member.id);
  touch(env);
}
