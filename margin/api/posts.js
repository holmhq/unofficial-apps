// Posts: metadata in `posts` (small, listable), Markdown and its HTML in `bodies`, and
// every address a post has had in `slugs`, so an old link redirects to the current one.
// A post belongs to one workspace and is written as one identity: /<ws>/@<handle>/<slug>,
// or /<ws>/<slug> when the workspace writes as itself. Without a photo, a post gets a
// drawn cover in its workspace's style.
import { byId, claim, one, rows, touch, mutate } from './lib/store.js';
import { reject, text, longText, slugify, dates, bool } from './lib/util.js';
import { render } from './markdown.js';
import { mediaInfo } from './media.js';
import { blogByHandle, blogDTO, resolveAs } from './blogs.js';
import { roleIn, addIdentity, workspaceBySlug, wsDTO } from './workspaces.js';
import { MOTIFS, LOOKS, TONES, normalize as normalizeDrawing } from './covers.js';

export const MAX_MARKDOWN = 60000;
const VOICE_RESERVED = new Set(['latest', 'tag', 'feed', 'about']);

export function postPath(post) {
  return post.blog === post.ws ? `/${post.ws}/${post.slug}` : `/${post.ws}/@${post.blog}/${post.slug}`;
}

function tags(value) {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  for (const raw of list) {
    const tag = slugify(String(raw || ''), 30);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  if (out.length > 8) reject(400, 'invalid_input', 'Use 8 tags at most.');
  return out;
}

function cover(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const v = String(value).trim();
  if (/^[a-z0-9]{6,20}$/.test(v)) return v;
  const m = v.match(/^\/media\/([a-z0-9]{6,20})(?:\.[a-z0-9]{2,5})?$/);
  if (m) return m[1];
  if (/^https:\/\/[^\s"'<>]{4,500}$/.test(v)) return v;
  reject(400, 'invalid_input', 'Cover is an uploaded media id or an https image address.');
}

function mediaId(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const m = String(value).match(/^(?:\/media\/)?([a-z0-9]{6,20})(?:\.[a-z0-9]{2,5})?$/);
  if (!m) reject(400, 'invalid_input', 'That is not an uploaded media id.');
  return m[1];
}

// A drawing: a motif name, or { motif, look, tone, seed }. Look and tone left out follow
// the workspace's style.
function drawing(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === false || value === 'none') return null;
  const v = typeof value === 'string' ? { motif: value } : value;
  if (!v || typeof v !== 'object' || !MOTIFS.includes(v.motif)) reject(400, 'invalid_input', `A drawing is one of ${MOTIFS.join(', ')}.`);
  const out = { motif: v.motif, seed: Number.isInteger(v.seed) && v.seed >= 0 && v.seed < 10000 ? v.seed : Math.floor(Math.random() * 10000) };
  if (LOOKS.includes(v.look)) out.look = v.look;
  if (TONES[v.tone]) out.tone = v.tone;
  return out;
}

function hash(value) {
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// The drawing a post shows: its own, or one picked from its id, in its workspace's style.
export function drawingFor(post, ws) {
  const own = post.drawn || {};
  const style = (ws && ws.cover) || { look: 'paper', tone: 'lilac' };
  return normalizeDrawing({
    motif: own.motif || MOTIFS[hash(post.id) % MOTIFS.length],
    look: own.look || style.look,
    tone: own.tone || style.tone,
    seed: Number.isInteger(own.seed) ? own.seed : hash(post.id + 's') % 10000,
  });
}

export const drawingURL = (d) => `/c/${d.motif}-${d.look}-${d.tone}-${d.seed}.svg`;

// A saved image of the drawing counts only while it still shows that drawing; a new
// workspace style or a new drawing makes it stale until Studio saves another.
function stampImage(env, id) {
  const post = postById(env, id);
  if (!post || !post.coverPng) return;
  const d = drawingFor(post, workspaceBySlug(env, post.ws));
  env.holm.app.ds.update('posts', { id }, { $set: { coverPngFor: drawingURL(d) } });
}

export function coverURL(post) {
  if (!post.cover) return null;
  return /^https:/.test(post.cover) ? post.cover : `/media/${post.cover}`;
}

export function canEdit(env, ctx, post) {
  if (!ctx.member || !post) return false;
  if (ctx.admin) return true;
  const role = roleIn(env, ctx, post.ws);
  if (!role) return false;
  if (role === 'owner' || role === 'admin') return true;
  const blog = blogByHandle(env, post.blog);
  return !!blog && blog.kind !== 'workspace' && blog.ownerId === ctx.member.id;
}

export function postById(env, id) { return byId(env, 'posts', id); }
export function bodyOf(env, post) { return post.bodyId ? byId(env, 'bodies', post.bodyId) : null; }

// Claim a free slug for this identity: "intro", then "intro-2", "intro-3"…
function claimSlug(env, blog, base, postId, voice) {
  let root = slugify(base) || 'post';
  if (voice && VOICE_RESERVED.has(root)) root += '-post';
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const { doc } = claim(env, 'slugs', { blog, slug }, { blog, slug, postId, createdAt: Date.now() });
    if (doc.postId === postId) return slug;
  }
  reject(409, 'conflict', 'Could not find a free address for this post.');
}

function releaseSlug(env, blog, slug, postId) {
  const row = one(env, 'slugs', { blog, slug });
  if (row && row.postId === postId) env.holm.app.ds.delete('slugs', { id: row.id });
}

function renderBody(env, md, origin) {
  return render(md, { origin, media: (id) => mediaInfo(env, id) });
}

// Featuring a post means pinning it on its workspace's curated home.
function setFeatured(env, ctx, post, on) {
  const ws = workspaceBySlug(env, post.ws);
  if (!ws || !(ctx.admin || ['owner', 'admin'].includes(roleIn(env, ctx, post.ws)))) reject(403, 'forbidden', 'Only owners and admins feature posts.');
  const doc = one(env, 'workspaces', { slug: post.ws });
  mutate(env, 'workspaces', doc.id, (cur) => {
    const list = (cur.featured || []).filter((id) => id !== post.id);
    if (on) list.unshift(post.id);
    return { $set: { featured: list.slice(0, 12) } };
  });
}

export function createPost(env, ctx, input, origin) {
  if (!ctx.ws || !ctx.writer) reject(403, 'forbidden', 'Join the workspace to write there.');
  const blog = resolveAs(env, ctx, input.as);
  if (blog.kind === 'workspace' && blog.ws !== ctx.ws.slug) reject(403, 'persona_forbidden', `@${blog.handle} writes only in its own workspace.`);
  const title = text(input.title, 160, 'Title', true);
  const md = longText(input.markdown ?? input.body ?? '', MAX_MARKDOWN, 'Text') || '';
  const now = Date.now();
  const rendered = renderBody(env, md, origin);
  const bodyId = env.holm.app.ds.insert('bodies', { md, html: rendered.html, cards: rendered.cards, updatedAt: now });
  const status = input.status === 'published' ? 'published' : 'draft';
  let publishedAt = null;
  if (status === 'published') publishedAt = ctx.admin && input.published_at ? Date.parse(input.published_at) || now : now;
  const id = env.holm.app.ds.insert('posts', {
    ws: ctx.ws.slug, blog: blog.handle, writer: ctx.member.id, lastEditor: ctx.member.id, bodyId,
    title, subtitle: text(input.subtitle, 280, 'Subtitle') || '', description: text(input.description, 300, 'Description') || '',
    slug: null, customSlug: !!input.slug, cover: cover(input.cover) || null, coverAlt: text(input.cover_alt, 200, 'Cover description') || '',
    drawn: drawing(input.drawing ?? input.cover_drawing) || null, coverPng: mediaId(input.cover_png) || null,
    tags: tags(input.tags) || [], status, publishedAt, updatedAt: now,
    excerpt: rendered.excerpt, words: rendered.words, minutes: rendered.minutes,
    claps: 0, clappers: 0, comments: 0, pending: 0,
  });
  const slug = claimSlug(env, blog.handle, input.slug || title, id, blog.kind === 'workspace');
  env.holm.app.ds.update('posts', { id }, { $set: { slug } });
  env.holm.app.ds.update('bodies', { id: bodyId }, { $set: { postId: id } });
  stampImage(env, id);
  if (blog.kind !== 'workspace') addIdentity(env, ctx.ws.slug, ctx.member.id, blog.handle);
  const post = postById(env, id);
  if (bool(input.featured)) setFeatured(env, ctx, post, true);
  if (status === 'published') touch(env);
  return post;
}

export function updatePost(env, ctx, id, input, origin) {
  const post = postById(env, id);
  if (!post) reject(404, 'not_found', 'No such post.');
  if (!canEdit(env, ctx, post)) reject(403, 'forbidden', "You can't edit this post.");
  const set = { lastEditor: ctx.member.id };
  const now = Date.now();
  let blog = post.blog;
  if (input.as !== undefined && input.as !== null && String(input.as).replace(/^@/, '') !== post.blog) {
    const next = resolveAs(env, ctx, input.as);
    if (next.kind === 'workspace' && next.ws !== post.ws) reject(403, 'persona_forbidden', `@${next.handle} writes only in its own workspace.`);
    blog = next.handle;
    set.blog = blog;
    if (next.kind !== 'workspace') addIdentity(env, post.ws, ctx.member.id, next.handle);
  }
  if (input.title !== undefined) set.title = text(input.title, 160, 'Title', true);
  if (input.subtitle !== undefined) set.subtitle = text(input.subtitle, 280, 'Subtitle') || '';
  if (input.description !== undefined) set.description = text(input.description, 300, 'Description') || '';
  if (input.cover !== undefined) set.cover = cover(input.cover);
  if (input.cover_alt !== undefined) set.coverAlt = text(input.cover_alt, 200, 'Cover description') || '';
  if ((input.drawing ?? input.cover_drawing) !== undefined) { set.drawn = drawing(input.drawing ?? input.cover_drawing); set.coverPng = null; }
  if (input.cover_png !== undefined) set.coverPng = mediaId(input.cover_png);
  if (input.tags !== undefined) set.tags = tags(input.tags);
  const md = input.markdown ?? input.body;
  if (md !== undefined) {
    const value = longText(md, MAX_MARKDOWN, 'Text') || '';
    const body = bodyOf(env, post);
    if (!body || body.md !== value) {
      const rendered = renderBody(env, value, origin);
      if (body) env.holm.app.ds.update('bodies', { id: body.id }, { $set: { md: value, html: rendered.html, cards: rendered.cards, updatedAt: now } });
      else set.bodyId = env.holm.app.ds.insert('bodies', { postId: post.id, md: value, html: rendered.html, cards: rendered.cards, updatedAt: now });
      Object.assign(set, { excerpt: rendered.excerpt, words: rendered.words, minutes: rendered.minutes, updatedAt: now });
    }
  }
  // Address: drafts follow their title until first published; after that only on request.
  const wasPublished = !!post.publishedAt;
  const voice = blog === post.ws;
  let slug = post.slug;
  if (input.slug !== undefined && input.slug !== null && slugify(input.slug) !== post.slug) {
    slug = claimSlug(env, blog, input.slug, post.id, voice);
    set.customSlug = true;
    if (!wasPublished) releaseSlug(env, post.blog, post.slug, post.id);
  } else if (blog !== post.blog) {
    slug = claimSlug(env, blog, post.slug, post.id, voice);
    if (!wasPublished) releaseSlug(env, post.blog, post.slug, post.id);
  } else if (!wasPublished && !post.customSlug && set.title && slugify(set.title) !== post.slug.replace(/-\d+$/, '')) {
    const next = claimSlug(env, blog, set.title, post.id, voice);
    if (next !== post.slug) releaseSlug(env, post.blog, post.slug, post.id);
    slug = next;
  }
  set.slug = slug;
  if (input.status !== undefined) {
    if (!['draft', 'published'].includes(input.status)) reject(400, 'invalid_input', 'Status is draft or published.');
    set.status = input.status;
    if (input.status === 'published' && !post.publishedAt) set.publishedAt = now;
  }
  if (input.published_at !== undefined && input.published_at) {
    if (!ctx.admin) reject(403, 'forbidden', "Only Margin's admins set the publish date.");
    const at = Date.parse(input.published_at);
    if (!at) reject(400, 'invalid_input', 'published_at is an ISO date.');
    set.publishedAt = at;
  }
  env.holm.app.ds.update('posts', { id: post.id }, { $set: set });
  if (set.coverPng) stampImage(env, post.id);
  const next = postById(env, post.id);
  if (input.featured !== undefined) setFeatured(env, ctx, next, bool(input.featured));
  if (post.status === 'published' || next.status === 'published') touch(env);
  return next;
}

export function deletePost(env, ctx, id) {
  const post = postById(env, id);
  if (!post) reject(404, 'not_found', 'No such post.');
  if (!canEdit(env, ctx, post)) reject(403, 'forbidden', "You can't delete this post.");
  const ds = env.holm.app.ds;
  if (post.bodyId) ds.delete('bodies', { id: post.bodyId });
  for (const row of ds.find('slugs', { postId: post.id }, { limit: 100 })) ds.delete('slugs', { id: row.id });
  for (const row of rows(env, 'comments', { postId: post.id }, 5000)) ds.delete('comments', { id: row.id });
  for (const row of rows(env, 'claps', { postId: post.id }, 5000)) ds.delete('claps', { id: row.id });
  ds.delete('posts', { id: post.id });
  const wsDoc = one(env, 'workspaces', { slug: post.ws });
  if (wsDoc && (wsDoc.featured || []).includes(post.id)) ds.update('workspaces', { id: wsDoc.id }, { $set: { featured: wsDoc.featured.filter((x) => x !== post.id) } });
  touch(env);
  return { deleted: true };
}

const live = (p) => p.publishedAt && p.publishedAt <= Date.now() + 60000;
const newest = (a, b) => b.publishedAt - a.publishedAt;

// Published posts, newest first: in one workspace, or across Margin (suspended
// workspaces left out). Metadata only, so a few thousand fit one request.
export function published(env, ctx, ws) {
  const key = 'published:' + (ws || '*');
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  let list;
  if (ws) list = rows(env, 'posts', { ws, status: 'published' }, 3000).filter(live).sort(newest);
  else {
    const hidden = new Set(rows(env, 'workspaces', { suspended: true }, 500).map((w) => w.slug));
    list = rows(env, 'posts', { status: 'published' }, 4000).filter((p) => live(p) && !hidden.has(p.ws)).sort(newest);
  }
  ctx.cache.set(key, list);
  return list;
}

export function postsOf(env, ctx, handle, status, ws) {
  const query = {};
  if (handle) query.blog = handle;
  if (ws) query.ws = ws;
  if (status && status !== 'all') query.status = status;
  return rows(env, 'posts', query, 2000).sort((a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt));
}

export function findByPath(env, handle, slug) {
  const row = one(env, 'slugs', { blog: handle, slug });
  if (!row) return null;
  return postById(env, row.postId);
}

function cached(ctx, key, load) {
  if (!ctx.cache.has(key)) ctx.cache.set(key, load());
  return ctx.cache.get(key);
}
export const wsCached = (env, ctx, slug) => cached(ctx, 'ws:' + slug, () => workspaceBySlug(env, slug));

// 12345 -> "12,345". (Holm's engine reads toLocaleString's locale as a radix.)
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function coverDTO(env, ctx, post) {
  const photo = coverURL(post);
  if (photo) {
    const info = /^\/media\//.test(photo) ? mediaInfo(env, post.cover) : null;
    return { url: photo, alt: post.coverAlt || '', width: info ? info.width : 0, height: info ? info.height : 0, drawn: false, image: photo };
  }
  const ws = wsCached(env, ctx, post.ws);
  const d = drawingFor(post, ws);
  // Lists crop covers to their own shapes, so their drawings leave out the corner labels.
  const fresh = post.coverPng && post.coverPngFor === drawingURL(d);
  return { url: `${drawingURL(d)}?labels=0`, full_url: drawingURL(d), alt: post.coverAlt || '', width: 1280, height: 720, drawn: true, drawing: d, image: fresh ? `/media/${post.coverPng}` : null, stale_image: !!post.coverPng && !fresh };
}

// What a theme sees for a post in any list.
export function cardDTO(env, ctx, post) {
  const blog = cached(ctx, 'b:' + post.blog, () => blogByHandle(env, post.blog));
  const ws = wsCached(env, ctx, post.ws);
  const d = dates(post.publishedAt || post.updatedAt);
  const u = dates(post.updatedAt);
  const coverInfo = coverDTO(env, ctx, post);
  return {
    id: post.id,
    url: postPath(post),
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle || '',
    description: post.description || post.subtitle || post.excerpt || '',
    excerpt: post.excerpt || '',
    cover: coverInfo,
    has_cover: true,
    date: d.long, date_short: d.short, date_iso: d.iso, year: d.year,
    updated: u.long, updated_iso: u.iso,
    reading_time: `${post.minutes || 1} min read`,
    minutes: post.minutes || 1,
    words: post.words || 0,
    tags: (post.tags || []).map((t, i) => ({ name: t, url: `/${post.ws}/tag/${t}`, first: i === 0 })),
    has_tags: !!(post.tags && post.tags.length),
    blog: blog ? blogDTO(blog, post.ws) : { handle: post.blog, name: post.blog, url: `/@${post.blog}`, avatar: `/a/${post.blog}.svg` },
    workspace: ws ? wsDTO(ws) : { slug: post.ws, name: post.ws, url: `/${post.ws}` },
    claps: post.claps || 0,
    comments: post.comments || 0,
    claps_label: `${thousands(post.claps || 0)} clap${post.claps === 1 ? '' : 's'}`,
    comments_label: `${post.comments || 0} response${post.comments === 1 ? '' : 's'}`,
    featured: !!(ws && (ws.featured || []).includes(post.id)),
    draft: post.status !== 'published',
  };
}

// Editor and MCP view: everything, including the Markdown.
export function editorDTO(env, ctx, post) {
  const body = bodyOf(env, post);
  const card = cardDTO(env, ctx, post);
  return {
    ...card,
    ws: post.ws,
    status: post.status,
    as: post.blog,
    markdown: body ? body.md : '',
    cover_id: post.cover && !/^https:/.test(post.cover) ? post.cover : null,
    cover_url: coverURL(post),
    drawing: card.cover.drawn ? card.cover.drawing : null,
    own_drawing: post.drawn || null,
    cover_png: post.coverPng || null,
    published_at: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
    updated_at: new Date(post.updatedAt).toISOString(),
    pending_comments: post.pending || 0,
    custom_slug: !!post.customSlug,
  };
}
