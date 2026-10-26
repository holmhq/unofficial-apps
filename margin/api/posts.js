// Posts: metadata in `posts` (small, listable), Markdown and its HTML in `bodies`, and
// every address a post has had in `slugs`, so an old link redirects to the current one.
import { byId, claim, one, rows, touch } from './lib/store.js';
import { reject, text, longText, slugify, dates, bool } from './lib/util.js';
import { render } from './markdown.js';
import { mediaInfo } from './media.js';
import { blogByHandle, blogDTO, canWriteAs, resolveAs } from './blogs.js';
import { homeHandle } from './settings.js';

export const MAX_MARKDOWN = 60000;

export function postPath(post, settings) {
  return homeHandle(settings) === post.blog ? `/${post.slug}` : `/@${post.blog}/${post.slug}`;
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

export function coverURL(post) {
  if (!post.cover) return null;
  return /^https:/.test(post.cover) ? post.cover : `/media/${post.cover}`;
}

export function canEdit(env, ctx, post) {
  if (!ctx.member) return false;
  if (ctx.admin) return true;
  return canWriteAs(ctx, blogByHandle(env, post.blog));
}

export function postById(env, id) { return byId(env, 'posts', id); }
export function bodyOf(env, post) { return post.bodyId ? byId(env, 'bodies', post.bodyId) : null; }

// Claim a free slug in this blog for this post: "intro", then "intro-2", "intro-3"…
function claimSlug(env, blog, base, postId) {
  const root = slugify(base) || 'post';
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

export function createPost(env, ctx, input, origin) {
  const blog = resolveAs(env, ctx, input.as);
  const title = text(input.title, 160, 'Title', true);
  const md = longText(input.markdown ?? input.body ?? '', MAX_MARKDOWN, 'Text') || '';
  const now = Date.now();
  const rendered = renderBody(env, md, origin);
  const bodyId = env.holm.app.ds.insert('bodies', { md, html: rendered.html, cards: rendered.cards, updatedAt: now });
  const status = input.status === 'published' ? 'published' : 'draft';
  let publishedAt = null;
  if (status === 'published') publishedAt = ctx.admin && input.published_at ? Date.parse(input.published_at) || now : now;
  const id = env.holm.app.ds.insert('posts', {
    blog: blog.handle, writer: ctx.member.id, lastEditor: ctx.member.id, bodyId,
    title, subtitle: text(input.subtitle, 280, 'Subtitle') || '', description: text(input.description, 300, 'Description') || '',
    slug: null, customSlug: !!input.slug, cover: cover(input.cover) || null, coverAlt: text(input.cover_alt, 200, 'Cover description') || '',
    tags: tags(input.tags) || [], status, publishedAt, updatedAt: now, featured: ctx.admin && bool(input.featured),
    excerpt: rendered.excerpt, words: rendered.words, minutes: rendered.minutes,
    claps: 0, clappers: 0, comments: 0, pending: 0,
  });
  const slug = claimSlug(env, blog.handle, input.slug || title, id);
  env.holm.app.ds.update('posts', { id }, { $set: { slug } });
  env.holm.app.ds.update('bodies', { id: bodyId }, { $set: { postId: id } });
  if (status === 'published') touch(env);
  return postById(env, id);
}

export function updatePost(env, ctx, id, input, origin) {
  const post = postById(env, id);
  if (!post) reject(404, 'not_found', 'No such post.');
  if (!canEdit(env, ctx, post)) reject(403, 'forbidden', "You can't edit this post.");
  const set = { lastEditor: ctx.member.id };
  const now = Date.now();
  let blog = post.blog;
  if (input.as !== undefined && input.as !== null && String(input.as).replace(/^@/, '') !== post.blog) {
    blog = resolveAs(env, ctx, input.as).handle;
    set.blog = blog;
  }
  if (input.title !== undefined) set.title = text(input.title, 160, 'Title', true);
  if (input.subtitle !== undefined) set.subtitle = text(input.subtitle, 280, 'Subtitle') || '';
  if (input.description !== undefined) set.description = text(input.description, 300, 'Description') || '';
  if (input.cover !== undefined) set.cover = cover(input.cover);
  if (input.cover_alt !== undefined) set.coverAlt = text(input.cover_alt, 200, 'Cover description') || '';
  if (input.tags !== undefined) set.tags = tags(input.tags);
  if (input.featured !== undefined) {
    if (!ctx.admin) reject(403, 'forbidden', 'Only admins feature posts.');
    set.featured = bool(input.featured);
  }
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
  let slug = post.slug;
  if (input.slug !== undefined && input.slug !== null && slugify(input.slug) !== post.slug) {
    slug = claimSlug(env, blog, input.slug, post.id);
    set.customSlug = true;
    if (!wasPublished) releaseSlug(env, post.blog, post.slug, post.id);
  } else if (blog !== post.blog) {
    slug = claimSlug(env, blog, post.slug, post.id);
    if (!wasPublished) releaseSlug(env, post.blog, post.slug, post.id);
  } else if (!wasPublished && !post.customSlug && set.title && slugify(set.title) !== post.slug.replace(/-\d+$/, '')) {
    const next = claimSlug(env, blog, set.title, post.id);
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
    if (!ctx.admin) reject(403, 'forbidden', 'Only admins set the publish date.');
    const at = Date.parse(input.published_at);
    if (!at) reject(400, 'invalid_input', 'published_at is an ISO date.');
    set.publishedAt = at;
  }
  env.holm.app.ds.update('posts', { id: post.id }, { $set: set });
  const next = postById(env, post.id);
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
  touch(env);
  return { deleted: true };
}

// All published posts, newest first. Metadata only, so a few thousand fit one request.
export function published(env, ctx) {
  if (ctx.cache.has('published')) return ctx.cache.get('published');
  const list = rows(env, 'posts', { status: 'published' }, 3000)
    .filter((p) => p.publishedAt && p.publishedAt <= Date.now() + 60000)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  ctx.cache.set('published', list);
  return list;
}

export function postsOf(env, ctx, handle, status) {
  const query = { blog: handle };
  if (status && status !== 'all') query.status = status;
  return rows(env, 'posts', query, 2000).sort((a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt));
}

export function findByPath(env, handle, slug) {
  const row = one(env, 'slugs', { blog: handle, slug });
  if (!row) return null;
  return postById(env, row.postId);
}

function blogCached(env, ctx, handle) {
  const key = 'b:' + handle;
  if (!ctx.cache.has(key)) ctx.cache.set(key, blogByHandle(env, handle));
  return ctx.cache.get(key);
}

// 12345 -> "12,345". (Holm's engine reads toLocaleString's locale as a radix.)
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// What a theme sees for a post in any list.
export function cardDTO(env, ctx, post, settings) {
  const blog = blogCached(env, ctx, post.blog);
  const d = dates(post.publishedAt || post.updatedAt);
  const u = dates(post.updatedAt);
  const coverUrl = coverURL(post);
  let coverInfo = null;
  if (coverUrl) {
    const info = /^\/media\//.test(coverUrl) ? mediaInfo(env, post.cover) : null;
    coverInfo = { url: coverUrl, alt: post.coverAlt || '', width: info ? info.width : 0, height: info ? info.height : 0 };
  }
  return {
    id: post.id,
    url: postPath(post, settings),
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle || '',
    description: post.description || post.subtitle || post.excerpt || '',
    excerpt: post.excerpt || '',
    cover: coverInfo,
    has_cover: !!coverInfo,
    date: d.long, date_short: d.short, date_iso: d.iso, year: d.year,
    updated: u.long, updated_iso: u.iso,
    reading_time: `${post.minutes || 1} min read`,
    minutes: post.minutes || 1,
    words: post.words || 0,
    tags: (post.tags || []).map((t, i) => ({ name: t, url: `/tag/${t}`, first: i === 0 })),
    has_tags: !!(post.tags && post.tags.length),
    blog: blog ? blogDTO(blog, settings) : { handle: post.blog, name: post.blog, url: `/@${post.blog}`, avatar: `/a/${post.blog}.svg` },
    claps: post.claps || 0,
    comments: post.comments || 0,
    claps_label: `${thousands(post.claps || 0)} clap${post.claps === 1 ? '' : 's'}`,
    comments_label: `${post.comments || 0} response${post.comments === 1 ? '' : 's'}`,
    featured: !!post.featured,
    draft: post.status !== 'published',
  };
}

// Editor and MCP view: everything, including the Markdown.
export function editorDTO(env, ctx, post, settings) {
  const body = bodyOf(env, post);
  return {
    ...cardDTO(env, ctx, post, settings),
    status: post.status,
    as: post.blog,
    markdown: body ? body.md : '',
    cover_id: post.cover && !/^https:/.test(post.cover) ? post.cover : null,
    cover_url: coverURL(post),
    published_at: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
    updated_at: new Date(post.updatedAt).toISOString(),
    pending_comments: post.pending || 0,
    custom_slug: !!post.customSlug,
  };
}
