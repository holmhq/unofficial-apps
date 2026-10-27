// Sample content: two fictional teams in their own workspaces, their writers, posts and
// a little discussion (some of it across workspaces), so a new Margin's landing page has
// something to show. Margin's admins load it from Studio and can remove it in one step.
// Each request does a couple of seconds of work and says whether it's done, so loading
// and removing stay inside Holm's request budget; callers repeat until done.
import { reject, randomId } from './lib/util.js';
import { touch, rows } from './lib/store.js';
import { blogByHandle, claimHandle } from './blogs.js';
import { createPost, deletePost } from './posts.js';
import { createComment } from './comments.js';
import { marginSettings, updateMargin } from './settings.js';
import { WS_DEFAULTS, workspaceBySlug, useWorkspace } from './workspaces.js';
import { WORKSPACES, PEOPLE, POSTS, COMMENTS } from './samples/content.js';

const DAY = 86400000;
const BUDGET = 2000;

async function mediaFrom(env, ctx, origin, path, mime, width, height, optional) {
  const res = await env.holm.web.fetch(new Request(origin + path));
  if (!res.ok) {
    if (optional) return null;
    reject(500, 'sample_missing', `Sample file ${path} is missing.`);
  }
  const bytes = await res.arrayBuffer();
  const id = randomId(14);
  env.holm.app.s3.put(`media/${id}`, bytes, mime);
  env.holm.app.ds.insert('media', { mediaId: id, mime, size: bytes.byteLength, name: path.split('/').pop(), width, height, alt: '', owner: ctx.member.id, createdAt: Date.now(), sample: true });
  return id;
}

const ordered = () => [...POSTS].sort((a, b) => b.days - a.days);
const TASKS = [
  ...PEOPLE.map((p) => ['person', p.handle]),
  ...WORKSPACES.map((w) => ['workspace', w.slug]),
  ...ordered().map((p) => ['post', p.key]),
  ...COMMENTS.map((c, i) => ['comment', i]),
];

async function run(env, ctx, origin, job, [kind, key]) {
  const now = job.now;
  if (kind === 'person') {
    const p = PEOPLE.find((x) => x.handle === key);
    if (blogByHandle(env, p.handle)) return;
    const avatar = await mediaFrom(env, ctx, origin, `/samples/avatar-${p.avatar}.jpg`, 'image/jpeg', 320, 320);
    claimHandle(env, p.handle, { kind: 'person', ownerId: null, name: p.name, bio: p.bio, avatar, picture: '', sample: true });
  } else if (kind === 'workspace') {
    const w = WORKSPACES.find((x) => x.slug === key);
    if (workspaceBySlug(env, w.slug)) return;
    const logo = await mediaFrom(env, ctx, origin, `/samples/${w.logo}`, 'image/png', 192, 192);
    if (!blogByHandle(env, w.slug)) claimHandle(env, w.slug, { kind: 'workspace', ws: w.slug, ownerId: null, name: w.name, bio: w.tagline, avatar: logo, picture: '', sample: true });
    env.holm.app.ds.insert('workspaces', {
      ...WS_DEFAULTS, slug: w.slug, name: w.name, tagline: w.tagline, description: w.description, logo, theme: w.theme,
      home: w.home, moderation: w.moderation, cover: w.cover, themeSettings: w.themeSettings || {}, createdBy: ctx.member.id, createdAt: Date.now(), sample: true,
    });
    for (const h of w.team) env.holm.app.ds.insert('members', { ws: w.slug, account: `sample:${h}`, role: h === w.owner ? 'owner' : 'writer', identities: [h], joinedAt: Date.now(), sample: true });
  } else if (kind === 'post') {
    const post = POSTS.find((x) => x.key === key);
    // Write as the samples: Margin's admin may act for sample names in their workspaces.
    useWorkspace(env, ctx, workspaceBySlug(env, post.ws));
    ctx.writer = true;
    const png = await mediaFrom(env, ctx, origin, `/samples/drawn/${post.key}.png`, 'image/png', 1280, 720, true);
    const created = createPost(env, ctx, {
      as: post.as, title: post.title, subtitle: post.subtitle, markdown: post.markdown, tags: post.tags,
      drawing: post.drawing, cover_png: png, status: 'published', featured: !!post.featured,
      published_at: new Date(now - post.days * DAY - 3600000 * 3).toISOString(),
    }, origin);
    env.holm.app.ds.update('posts', { id: created.id }, { $set: { claps: post.claps || 0, clappers: Math.round((post.claps || 0) / 6), sample: true } });
    job.ids[post.key] = created.id;
  } else if (kind === 'comment') {
    const c = COMMENTS[key];
    const input = { body: c.body, as: c.as };
    if (c.quote) input.quote = { exact: c.quote };
    if (c.reply !== undefined) input.parent_id = job.made[c.reply];
    job.made[key] = createComment(env, ctx, job.ids[c.post], input).id;
  }
}

export async function loadSamples(env, ctx, origin) {
  if (!ctx.admin) reject(403, 'forbidden', "Only Margin's admins load sample content.");
  if (env.holm.app.kv.get('samples')) reject(409, 'loaded', 'Sample content is already here. Remove it first to load it again.');
  const start = Date.now();
  let job = env.holm.app.kv.get('samples:job');
  if (!job) {
    if (rows(env, 'posts', { sample: true }, 5).length) reject(409, 'loaded', 'Some sample content is already here. Remove it first to load it again.');
    for (const h of [...PEOPLE.map((p) => p.handle), ...WORKSPACES.map((w) => w.slug)]) {
      if (blogByHandle(env, h)) reject(409, 'taken', `${h} already exists, so the samples can't use it.`);
    }
    job = { step: 0, now: Date.now(), ids: {}, made: [] };
  }
  while (job.step < TASKS.length && Date.now() - start < BUDGET) {
    await run(env, ctx, origin, job, TASKS[job.step]);
    job.step++;
    env.holm.app.kv.set('samples:job', job);
  }
  useWorkspace(env, ctx, null);
  if (job.step < TASKS.length) return { done: false, progress: job.step / TASKS.length, message: `Adding the samples… ${Math.round((job.step / TASKS.length) * 100)}%` };
  env.holm.app.kv.delete('samples:job');
  if (!(marginSettings(env).examples || []).length) updateMargin(env, { examples: WORKSPACES.map((w) => w.slug) });
  env.holm.app.kv.set('samples', { at: Date.now() });
  touch(env);
  return { done: true, message: `Added ${WORKSPACES.length} workspaces, ${PEOPLE.length} people, ${POSTS.length} posts and ${COMMENTS.length} comments.`, posts: POSTS.length };
}

// Everything the samples made is marked `sample`, so removal finds it even after an
// interrupted load.
export function removeSamples(env, ctx) {
  if (!ctx.admin) reject(403, 'forbidden', "Only Margin's admins remove sample content.");
  const start = Date.now();
  const ds = env.holm.app.ds;
  const out = () => ({ done: false, message: 'Removing the samples…' });
  for (const p of rows(env, 'posts', { sample: true }, 200)) {
    if (Date.now() - start > BUDGET) return out();
    try { deletePost(env, ctx, p.id); } catch { /* already gone */ }
  }
  for (const collection of ['members', 'workspaces', 'blogs']) {
    for (const row of rows(env, collection, { sample: true }, 500)) {
      if (Date.now() - start > BUDGET) return out();
      ds.delete(collection, { id: row.id });
    }
  }
  for (const row of rows(env, 'media', { sample: true }, 500)) {
    if (Date.now() - start > BUDGET) return out();
    env.holm.app.s3.delete(`media/${row.mediaId}`);
    ds.delete('media', { id: row.id });
  }
  env.holm.app.kv.delete('samples');
  env.holm.app.kv.delete('samples:job');
  const margin = marginSettings(env);
  const slugs = WORKSPACES.map((w) => w.slug);
  const change = {};
  if ((margin.examples || []).some((s) => slugs.includes(s))) change.examples = margin.examples.filter((s) => !slugs.includes(s));
  if (slugs.includes(margin.home.replace(/^ws:/, '')) || PEOPLE.some((p) => margin.home === '@' + p.handle)) change.home = 'landing';
  if (Object.keys(change).length) updateMargin(env, change);
  touch(env);
  return { done: true, message: 'Removed the sample content.' };
}
