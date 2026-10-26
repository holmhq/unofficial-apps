// Blogs: one per writer ("person") plus personas — shared identities such as @team that
// admins create and may hand to writers. A blog's handle is its address: /@handle.
import { claim, one, rows, mutate, touch } from './lib/store.js';
import { reject, text, longText, escapeHTML } from './lib/util.js';
import { setHandle } from './people.js';
import { MODERATION, homeHandle } from './settings.js';

export const HANDLE = /^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/;
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'apps', 'assets', 'auth', 'blog', 'blogs', 'feed', 'feeds', 'help', 'home',
  'join', 'latest', 'login', 'logout', 'margin', 'me', 'media', 'new', 'null', 'p', 'post', 'posts', 'root', 'rss',
  'search', 'settings', 'signin', 'sitemap', 'static', 'studio', 'support', 'system', 't', 'tag', 'tags',
  'undefined', 'write', 'www', 'about', 'a', 'cards',
]);

export function handle(value) {
  const out = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE.test(out)) reject(400, 'invalid_handle', 'A handle is 2–30 lowercase letters, digits, - or _, starting with a letter.');
  if (RESERVED.has(out)) reject(409, 'taken', `@${out} is reserved. Pick another.`);
  return out;
}

export function blogByHandle(env, value) {
  if (!value || !HANDLE.test(value)) return null;
  return one(env, 'blogs', { handle: value });
}

export function allBlogs(env) { return rows(env, 'blogs', {}, 2000); }

export function blogURL(blog, settings) {
  return homeHandle(settings) === blog.handle ? '/' : `/@${blog.handle}`;
}

// Same seed, same colour, so a persona looks the same everywhere.
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

export function blogDTO(blog, settings) {
  return {
    handle: blog.handle,
    name: blog.name,
    bio: blog.bio || '',
    kind: blog.kind,
    is_persona: blog.kind === 'persona',
    url: blogURL(blog, settings),
    feed_url: `/@${blog.handle}/feed.xml`,
    avatar: avatarURL(blog),
    initials: initials(blog.name),
    color: swatch(blog.handle),
    moderation: blog.moderation || settings.moderation,
  };
}

export function canWriteAs(ctx, blog) {
  if (!ctx.member || !blog) return false;
  if (ctx.admin) return true;
  if (!ctx.writer) return false;
  if (blog.kind === 'person') return blog.memberId === ctx.member.id;
  return Array.isArray(blog.writers) && blog.writers.includes(ctx.member.id);
}

export function writableBlogs(env, ctx) {
  if (!ctx.writer) return [];
  return allBlogs(env).filter((b) => canWriteAs(ctx, b) && (b.kind === 'persona' || b.memberId === ctx.member.id || ctx.admin));
}

// The blog a writer posts as: the named one if allowed, else their own.
export function resolveAs(env, ctx, as) {
  if (as) {
    const blog = blogByHandle(env, String(as).replace(/^@/, '').toLowerCase());
    if (!blog) reject(404, 'not_found', `There is no blog @${as}.`);
    if (!canWriteAs(ctx, blog)) reject(403, 'persona_forbidden', `You can't write as @${blog.handle}.`);
    return blog;
  }
  const own = ctx.person && ctx.person.handle ? blogByHandle(env, ctx.person.handle) : null;
  if (!own) reject(409, 'no_blog', 'Pick your handle in Studio first, or write as a persona with "as".');
  return own;
}

export function createPersonBlog(env, ctx, input) {
  if (ctx.person.handle) reject(409, 'has_blog', `You already write as @${ctx.person.handle}.`);
  const value = handle(input.handle);
  const name = text(input.name, 60, 'Name') || ctx.member.name || value;
  const { doc, created } = claim(env, 'blogs', { handle: value }, {
    handle: value, kind: 'person', memberId: ctx.member.id, name, bio: longText(input.bio, 280, 'Bio') || '',
    avatar: null, picture: ctx.member.picture || '', moderation: null, writers: [], createdBy: ctx.member.id, createdAt: Date.now(),
  });
  if (!created) reject(409, 'taken', `@${value} is taken. Pick another.`);
  setHandle(env, ctx.member.id, value);
  touch(env);
  return doc;
}

export function createPersona(env, ctx, input) {
  const value = handle(input.handle);
  const name = text(input.name, 60, 'Name', true);
  const writers = Array.isArray(input.writers) ? input.writers.filter((w) => typeof w === 'string').slice(0, 200) : [];
  const { doc, created } = claim(env, 'blogs', { handle: value }, {
    handle: value, kind: 'persona', memberId: null, name, bio: longText(input.bio, 280, 'Bio') || '',
    avatar: typeof input.avatar === 'string' ? input.avatar : null, picture: '', moderation: null, writers,
    createdBy: ctx.member.id, createdAt: Date.now(),
  });
  if (!created) reject(409, 'taken', `@${value} is taken. Pick another.`);
  touch(env);
  return doc;
}

export function updateBlog(env, ctx, blog, input) {
  if (!canWriteAs(ctx, blog)) reject(403, 'forbidden', `You can't edit @${blog.handle}.`);
  const set = {};
  if (input.name !== undefined) set.name = text(input.name, 60, 'Name', true);
  if (input.bio !== undefined) set.bio = longText(input.bio, 280, 'Bio') || '';
  if (input.avatar !== undefined) set.avatar = input.avatar ? text(input.avatar, 40, 'Avatar') : null;
  if (input.moderation !== undefined) {
    if (input.moderation !== null && !MODERATION.includes(input.moderation)) reject(400, 'invalid_input', 'Moderation is off, outsiders or all.');
    set.moderation = input.moderation;
  }
  if (input.writers !== undefined) {
    if (!ctx.admin) reject(403, 'forbidden', 'Only admins choose who writes as a persona.');
    if (blog.kind !== 'persona') reject(400, 'invalid_input', 'Only personas have writers.');
    if (!Array.isArray(input.writers)) reject(400, 'invalid_input', 'Writers is a list of member ids.');
    set.writers = input.writers.filter((w) => typeof w === 'string').slice(0, 200);
  }
  if (!Object.keys(set).length) return blog;
  const doc = mutate(env, 'blogs', blog.id, () => ({ $set: set }));
  touch(env);
  return doc;
}

export function deletePersona(env, ctx, blog) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins remove personas.');
  if (blog.kind !== 'persona') reject(400, 'invalid_input', 'Only personas can be removed here.');
  const posts = env.holm.app.ds.count('posts', { blog: blog.handle });
  if (posts) reject(409, 'has_posts', `@${blog.handle} has ${posts} post${posts === 1 ? '' : 's'}. Move or delete them first.`);
  env.holm.app.ds.delete('blogs', { id: blog.id });
  touch(env);
}
