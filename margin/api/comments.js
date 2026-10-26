// Comments: whole-post responses and notes on a quoted passage, one level of replies.
// Each blog chooses moderation: off, outsiders (people not on the team) or all.
// Sample comments (from personas, for screenshots) are seen only by the team.
import { byId, rows, bump, touch } from './lib/store.js';
import { reject, longText, text, bool } from './lib/util.js';
import { renderComment } from './markdown.js';
import { blogByHandle, blogDTO, resolveAs, writableBlogs, avatarURL } from './blogs.js';
import { memberCard } from './people.js';
import { postById, canEdit, cardDTO } from './posts.js';
import { siteSettings } from './settings.js';

const MAX_BODY = 4000;

function quote(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') reject(400, 'invalid_input', 'quote is { exact, prefix, suffix }.');
  const exact = longText(value.exact, 600, 'Quoted text', true).replace(/\s+/g, ' ');
  return {
    exact,
    prefix: (text(value.prefix, 120, 'Quote prefix') || '').slice(-60),
    suffix: (text(value.suffix, 120, 'Quote suffix') || '').slice(0, 60),
  };
}

function moderationFor(env, post, settings) {
  const blog = blogByHandle(env, post.blog);
  return (blog && blog.moderation) || settings.moderation || 'outsiders';
}

function visible(ctx, comment, moderator) {
  if (comment.status === 'approved') return !comment.sample || ctx.writer;
  if (comment.status === 'pending') return moderator || (ctx.member && comment.memberId === ctx.member.id);
  return moderator && comment.status !== 'deleted';
}

export function commentDTO(env, ctx, comment, post, settings, moderator) {
  let author;
  if (comment.as) {
    const blog = blogByHandle(env, comment.as);
    author = blog ? { name: blog.name, avatar: avatarURL(blog), url: blogDTO(blog, settings).url, handle: blog.handle, team: true, persona: blog.kind === 'persona' }
      : { name: '@' + comment.as, avatar: `/a/${comment.as}.svg`, url: null, handle: comment.as, team: true, persona: true };
  } else {
    const card = memberCard(env, ctx, comment.memberId);
    author = { name: card.name, avatar: card.picture || null, url: card.handle ? `/@${card.handle}` : null, handle: card.handle, team: card.team, persona: false };
  }
  author.is_author = comment.as ? comment.as === post.blog : false;
  // Written as a persona, it reads as the persona's, even to the person who wrote it.
  const mine = !!(ctx.member && comment.memberId === ctx.member.id && (!comment.as || (ctx.person && comment.as === ctx.person.handle)));
  const own = !!(ctx.member && comment.memberId === ctx.member.id);
  return {
    id: comment.id,
    post_id: comment.postId,
    parent_id: comment.parentId || null,
    quote: comment.quote || null,
    body: comment.body,
    body_html: renderComment(comment.body),
    author,
    status: comment.status,
    sample: !!comment.sample,
    via: comment.via || 'web',
    mine,
    can_delete: own || moderator,
    created_at: new Date(comment._createdAt || comment.createdAt).toISOString(),
    edited_at: comment.editedAt ? new Date(comment.editedAt).toISOString() : null,
  };
}

export function listForPost(env, ctx, postId) {
  const post = postById(env, postId);
  if (!post || (post.status !== 'published' && !canEdit(env, ctx, post))) reject(404, 'not_found', 'No such post.');
  const settings = siteSettings(env);
  const moderator = canEdit(env, ctx, post);
  const all = rows(env, 'comments', { postId: post.id }, 3000);
  const shown = all.filter((c) => visible(ctx, c, moderator)).sort((a, b) => (a._createdAt || 0) - (b._createdAt || 0));
  return {
    comments: shown.map((c) => commentDTO(env, ctx, c, post, settings, moderator)),
    can_moderate: moderator,
    moderation: moderationFor(env, post, settings),
    count: post.comments || 0,
    pending: moderator ? post.pending || 0 : 0,
  };
}

// Server-rendered list for pages without JavaScript: approved, not samples.
export function publicComments(env, ctx, post, settings) {
  return rows(env, 'comments', { postId: post.id, status: 'approved' }, 1000)
    .filter((c) => !c.sample)
    .sort((a, b) => (a._createdAt || 0) - (b._createdAt || 0))
    .map((c) => commentDTO(env, ctx, c, post, settings, false));
}

function rateLimit(env, ctx) {
  const key = `rl:c:${ctx.member.id}:${Math.floor(Date.now() / 600000)}`;
  const n = env.holm.app.kv.increment(key);
  if (n === 1) env.holm.app.kv.set(key, 1, 700000);
  if (n > 40 && !ctx.admin) reject(429, 'rate_limited', 'That is a lot of comments at once. Wait a few minutes.');
}

export function createComment(env, ctx, postId, input, via = 'web') {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in to comment.');
  const post = postById(env, postId);
  if (!post || (post.status !== 'published' && !canEdit(env, ctx, post))) reject(404, 'not_found', 'No such post.');
  const settings = siteSettings(env);
  const body = longText(input.body ?? input.text ?? input.markdown, MAX_BODY, 'Comment', true);
  rateLimit(env, ctx);
  let parentId = null;
  if (input.parent_id) {
    const parent = byId(env, 'comments', input.parent_id);
    if (!parent || parent.postId !== post.id) reject(404, 'not_found', 'The comment you reply to is gone.');
    parentId = parent.parentId || parent.id;
  }
  let as = null;
  if (input.as) as = resolveAs(env, ctx, input.as).handle;
  // Writers who can edit the post answer as its blog unless they choose otherwise.
  if (!as && input.as === undefined && canEdit(env, ctx, post) && ctx.writer) {
    const blog = blogByHandle(env, post.blog);
    if (blog && (blog.kind === 'persona' || blog.memberId === ctx.member.id)) as = post.blog;
  }
  const sample = bool(input.sample);
  if (sample && !ctx.writer) reject(403, 'forbidden', 'Only the team adds sample comments.');
  const moderator = canEdit(env, ctx, post);
  const mode = moderationFor(env, post, settings);
  let status = 'approved';
  if (!sample && !moderator) {
    if (mode === 'all' || (mode === 'outsiders' && !ctx.writer)) status = 'pending';
  }
  const doc = {
    postId: post.id, parentId, memberId: ctx.member.id, as, quote: parentId ? null : quote(input.quote),
    body, status, sample, via, createdAt: Date.now(), editedAt: null,
  };
  const id = env.holm.app.ds.insert('comments', doc);
  if (status === 'approved' && !sample) bump(env, 'posts', post.id, 'comments', 1);
  if (status === 'pending') bump(env, 'posts', post.id, 'pending', 1);
  if (status === 'approved' && !sample) touch(env);
  try { env.holm.realtime.broadcast(`post:${post.id}`, { type: 'comment', id }); } catch { /* realtime is a nicety */ }
  const saved = byId(env, 'comments', id);
  return commentDTO(env, ctx, saved, post, settings, moderator);
}

export function moderate(env, ctx, commentId, action) {
  const comment = byId(env, 'comments', commentId);
  if (!comment || comment.status === 'deleted') reject(404, 'not_found', 'No such comment.');
  const post = postById(env, comment.postId);
  if (!post) reject(404, 'not_found', 'No such post.');
  const moderator = canEdit(env, ctx, post);
  const mine = ctx.member && comment.memberId === ctx.member.id;
  if (action === 'delete') {
    if (!moderator && !mine) reject(403, 'forbidden', "You can't delete this comment.");
  } else if (!moderator) reject(403, 'forbidden', 'Only the blog\'s writers and admins moderate.');
  const next = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'delete' ? 'deleted' : null;
  if (!next) reject(400, 'invalid_input', 'Action is approve, reject or delete.');
  if (next === comment.status) return { id: comment.id, status: next };
  env.holm.app.ds.update('comments', { id: comment.id }, { $set: { status: next, moderatedBy: ctx.member.id, moderatedAt: Date.now() } });
  if (!comment.sample) {
    if (comment.status === 'approved') bump(env, 'posts', post.id, 'comments', -1);
    if (next === 'approved') bump(env, 'posts', post.id, 'comments', 1);
  }
  if (comment.status === 'pending') bump(env, 'posts', post.id, 'pending', -1);
  if (action === 'delete') {
    // Replies go with their parent.
    for (const reply of rows(env, 'comments', { parentId: comment.id }, 500)) {
      if (reply.status === 'deleted') continue;
      env.holm.app.ds.update('comments', { id: reply.id }, { $set: { status: 'deleted' } });
      if (reply.status === 'approved' && !reply.sample) bump(env, 'posts', post.id, 'comments', -1);
      if (reply.status === 'pending') bump(env, 'posts', post.id, 'pending', -1);
    }
  }
  touch(env);
  return { id: comment.id, status: next };
}

export function editComment(env, ctx, commentId, body) {
  const comment = byId(env, 'comments', commentId);
  if (!comment || comment.status === 'deleted') reject(404, 'not_found', 'No such comment.');
  if (!ctx.member || comment.memberId !== ctx.member.id) reject(403, 'forbidden', 'You can only edit your own comments.');
  const value = longText(body, MAX_BODY, 'Comment', true);
  env.holm.app.ds.update('comments', { id: comment.id }, { $set: { body: value, editedAt: Date.now() } });
  touch(env);
  const post = postById(env, comment.postId);
  return commentDTO(env, ctx, byId(env, 'comments', comment.id), post, siteSettings(env), canEdit(env, ctx, post));
}

// What needs the writer: comments waiting for approval, and threads the blog hasn't answered.
export function inbox(env, ctx, options = {}) {
  if (!ctx.writer) reject(403, 'forbidden', 'Only writers have an inbox.');
  const settings = siteSettings(env);
  const handles = new Set(writableBlogs(env, ctx).map((b) => b.handle));
  const postCache = new Map();
  const postOf = (id) => {
    if (!postCache.has(id)) postCache.set(id, postById(env, id));
    return postCache.get(id);
  };
  const mine = (c) => {
    const post = postOf(c.postId);
    return post && (ctx.admin || handles.has(post.blog)) ? post : null;
  };
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const recent = rows(env, 'comments', {}, 1500).filter((c) => c.status !== 'deleted' && c.status !== 'rejected');
  const pending = [];
  const threads = new Map();
  for (const c of recent) {
    const post = mine(c);
    if (!post) continue;
    if (c.status === 'pending') pending.push(c);
    const root = c.parentId || c.id;
    if (!threads.has(root)) threads.set(root, []);
    threads.get(root).push(c);
  }
  const answeredBy = (c) => c.as && handles.has(c.as) || (ctx.member && c.memberId === ctx.member.id);
  const unanswered = [];
  for (const list of threads.values()) {
    list.sort((a, b) => (a._createdAt || 0) - (b._createdAt || 0));
    const last = list[list.length - 1];
    if (last.status === 'approved' && !last.sample && !answeredBy(last)) unanswered.push(last);
  }
  const shape = (c) => {
    const post = postOf(c.postId);
    const dto = commentDTO(env, ctx, c, post, settings, true);
    const parent = c.parentId ? byId(env, 'comments', c.parentId) : null;
    return {
      ...dto,
      post: { id: post.id, title: post.title, url: cardDTO(env, ctx, post, settings).url, blog: post.blog },
      thread_quote: parent ? parent.quote || null : c.quote || null,
      in_reply_to: parent ? { id: parent.id, body: parent.body.slice(0, 400) } : null,
    };
  };
  const status = options.status || 'all';
  const out = {};
  if (status === 'all' || status === 'pending') out.pending = pending.slice(0, limit).map(shape);
  if (status === 'all' || status === 'unanswered') out.unanswered = unanswered.slice(0, limit).map(shape);
  if (status === 'recent') out.recent = recent.filter((c) => mine(c)).slice(0, limit).map(shape);
  out.pending_count = pending.length;
  out.unanswered_count = unanswered.length;
  return out;
}

export function clearSamples(env, ctx, postId) {
  if (!ctx.admin) reject(403, 'forbidden', 'Only admins clear sample comments.');
  const query = postId ? { postId, sample: true } : { sample: true };
  let removed = 0;
  for (const c of rows(env, 'comments', query, 5000)) {
    env.holm.app.ds.delete('comments', { id: c.id });
    removed++;
  }
  touch(env);
  return { removed };
}
