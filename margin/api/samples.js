// Sample content: a fictional team, its personas, posts and a little discussion, so a new
// site (or a screenshot) has something to show. Admins load it from Studio and can remove
// it again in one step.
import { reject, randomId } from './lib/util.js';
import { touch } from './lib/store.js';
import { blogByHandle } from './blogs.js';
import { createPost, deletePost } from './posts.js';
import { createComment } from './comments.js';
import { siteSettings, updateSettings, DEFAULTS } from './settings.js';
import { SITE, PEOPLE, POSTS, COMMENTS } from './samples/content.js';

const DAY = 86400000;

async function mediaFrom(env, ctx, origin, path, width, height) {
  const res = await env.holm.web.fetch(new Request(origin + path));
  if (!res.ok) reject(500, 'sample_missing', `Sample file ${path} is missing.`);
  const bytes = await res.arrayBuffer();
  const id = randomId(14);
  env.holm.app.s3.put(`media/${id}`, bytes, 'image/jpeg');
  env.holm.app.ds.insert('media', { mediaId: id, mime: 'image/jpeg', size: bytes.byteLength, name: path.split('/').pop(), width, height, alt: '', owner: ctx.member.id, createdAt: Date.now(), sample: true });
  return id;
}

export async function loadSamples(env, ctx, origin) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins load sample content.');
  if (env.holm.app.kv.get('samples')) reject(409, 'loaded', 'Sample content is already here. Remove it first to load it again.');
  for (const p of PEOPLE) if (blogByHandle(env, p.handle)) reject(409, 'taken', `@${p.handle} already exists, so the samples can't use it.`);
  const record = { blogs: [], posts: [], media: [] };
  const avatars = {};
  for (const p of PEOPLE) {
    const id = await mediaFrom(env, ctx, origin, `/samples/avatar-${p.avatar}.jpg`, 320, 320);
    record.media.push(id);
    avatars[p.handle] = id;
  }
  for (const p of PEOPLE) {
    const id = env.holm.app.ds.insert('blogs', {
      handle: p.handle, kind: 'persona', memberId: null, name: p.name, bio: p.bio, avatar: avatars[p.handle], picture: '',
      moderation: null, writers: [], createdBy: ctx.member.id, createdAt: Date.now(), sample: true,
    });
    record.blogs.push(id);
  }
  const covers = {};
  const now = Date.now();
  const ids = {};
  for (const post of [...POSTS].sort((a, b) => b.days - a.days)) {
    if (!covers[post.cover]) {
      covers[post.cover] = await mediaFrom(env, ctx, origin, `/samples/cover-${post.cover}.jpg`, 1600, 1000);
      record.media.push(covers[post.cover]);
    }
    const created = createPost(env, ctx, {
      as: post.as, title: post.title, subtitle: post.subtitle, markdown: post.markdown, tags: post.tags,
      cover: covers[post.cover], status: 'published', featured: !!post.featured,
      published_at: new Date(now - post.days * DAY - 3600000 * 3).toISOString(),
    }, origin);
    env.holm.app.ds.update('posts', { id: created.id }, { $set: { claps: post.claps || 0, clappers: Math.round((post.claps || 0) / 6), sample: true } });
    ids[post.key] = created.id;
    record.posts.push(created.id);
  }
  const made = [];
  for (const c of COMMENTS) {
    const input = { body: c.body, as: c.as };
    if (c.quote) input.quote = { exact: c.quote };
    if (c.reply !== undefined) input.parent_id = made[c.reply];
    const saved = createComment(env, ctx, ids[c.post], input);
    made.push(saved.id);
  }
  const settings = siteSettings(env);
  if (settings.name === DEFAULTS.name && settings.tagline === DEFAULTS.tagline) updateSettings(env, SITE);
  env.holm.app.kv.set('samples', record);
  touch(env);
  return { message: `Added ${PEOPLE.length} personas, ${record.posts.length} posts and ${COMMENTS.length} comments.`, posts: record.posts.length };
}

export function removeSamples(env, ctx) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins remove sample content.');
  const record = env.holm.app.kv.get('samples');
  if (!record) reject(404, 'not_found', 'There is no sample content to remove.');
  for (const id of record.posts || []) {
    try { deletePost(env, ctx, id); } catch { /* already gone */ }
  }
  for (const id of record.blogs || []) env.holm.app.ds.delete('blogs', { id });
  for (const id of record.media || []) {
    env.holm.app.s3.delete(`media/${id}`);
    const row = env.holm.app.ds.find('media', { mediaId: id }, { limit: 1 })[0];
    if (row) env.holm.app.ds.delete('media', { id: row.id });
  }
  env.holm.app.kv.delete('samples');
  const settings = siteSettings(env);
  if (settings.name === SITE.name && settings.tagline === SITE.tagline) updateSettings(env, { name: DEFAULTS.name, tagline: DEFAULTS.tagline, description: DEFAULTS.description });
  if (PEOPLE.some((p) => settings.home === '@' + p.handle)) updateSettings(env, { home: 'landing' });
  touch(env);
  return { removed: (record.posts || []).length };
}
