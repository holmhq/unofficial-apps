// Named operations (contract.json): the tools Claude and other assistants use through
// Holm's MCP endpoint at /_holm/mcp. Each checks the caller's role itself.
import { json, errorResponse, readJSON, reject, sameOrigin, int } from './lib/util.js';
import { context, requireMember, requireWriter, requireAdmin, teamList, setRole } from './people.js';
import { siteSettings, updateSettings } from './settings.js';
import { allBlogs, blogByHandle, blogDTO, canWriteAs, writableBlogs, createPersonBlog, createPersona, updateBlog, deletePersona } from './blogs.js';
import { createPost, updatePost, deletePost, postById, editorDTO, cardDTO, canEdit, postsOf, published } from './posts.js';
import { listForPost, createComment, moderate, editComment, inbox, clearSamples } from './comments.js';
import { clap, myClaps } from './claps.js';
import { upload, serve, listMine } from './media.js';
import { createInvite, previewInvite, acceptInvite, listInvites, revokeInvite } from './invites.js';
import { listThemes, loadTheme, validate, saveTheme, deleteTheme, themeFiles, serveAsset, settingValues, cleanSetting } from './themes.js';
import { page, errorPage, postAtPath, cards } from './pages.js';
import { loadSamples } from './samples.js';

// ---------- named operations (MCP tools) ----------

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 410: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT', 422: 'APP_INVALID', 429: 'APP_RATE_LIMITED' };
function op(env, run, readOnly = false) {
  try {
    return run(context(env, { readOnly }));
  } catch (error) {
    if (error && error.public) error.code = CODES[error.status] || 'APP_INVALID_INPUT';
    throw error;
  }
}
const origin = (env) => env.holm.app.kv.get('site:origin') || '';
const absolute = (env, path) => (origin(env) ? origin(env) + path : path);

export function me(env, ctx) {
  const settings = siteSettings(env);
  const blogs = writableBlogs(env, ctx).map((b) => ({ ...blogDTO(b, settings), own: b.kind === 'person' && b.memberId === (ctx.member && ctx.member.id) }));
  return {
    signed_in: !!ctx.member,
    name: ctx.member ? ctx.member.name || '' : null,
    picture: ctx.member ? ctx.member.picture || '' : null,
    member_id: ctx.member ? ctx.member.id : null,
    role: ctx.role,
    admin: ctx.admin,
    writer: ctx.writer,
    handle: ctx.person ? ctx.person.handle || null : null,
    needs_handle: !!(ctx.writer && ctx.person && !ctx.person.handle),
    blogs,
    site: { name: settings.name, tagline: settings.tagline, url: origin(env), home: settings.home, theme: settings.theme },
  };
}

export function opMe(input, env) {
  return op(env, (ctx) => {
    requireMember(ctx);
    const out = me(env, ctx);
    out.guide = ctx.writer
      ? 'Write posts in Markdown with posts.create (draft unless asked to publish) and share the preview link. Check comments.inbox for comments that need approval or a reply; answer only ordinary ones and ask the writer about anything sensitive.'
      : 'You can read posts and comment. Only invited writers publish; an admin can invite you.';
    return out;
  }, true);
}

export function opPostsList(input, env) {
  return op(env, (ctx) => {
    requireWriter(ctx);
    const settings = siteSettings(env);
    let list;
    if (input.as) {
      const blog = blogByHandle(env, String(input.as).replace(/^@/, '').toLowerCase());
      if (!blog || !canWriteAs(ctx, blog)) reject(404, 'not_found', `You can't see @${input.as}'s posts.`);
      list = postsOf(env, ctx, blog.handle, input.status);
    } else {
      const handles = ctx.admin ? allBlogs(env).map((b) => b.handle) : writableBlogs(env, ctx).map((b) => b.handle);
      list = handles.flatMap((h) => postsOf(env, ctx, h, input.status)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    const limit = int(input.limit, 30, 1, 100);
    return {
      posts: list.slice(0, limit).map((p) => {
        const card = cardDTO(env, ctx, p, settings);
        return { id: p.id, title: p.title, status: p.status, blog: p.blog, url: absolute(env, card.url), preview_url: absolute(env, `/studio/preview/${p.id}`), date: card.date, tags: p.tags, claps: p.claps || 0, comments: p.comments || 0, pending_comments: p.pending || 0, words: p.words || 0 };
      }),
      total: list.length,
    };
  }, true);
}

function findPost(env, ctx, input) {
  let post = null;
  if (input.id) post = postById(env, input.id);
  else if (input.url) {
    let path = String(input.url);
    try { path = new URL(path, 'http://x.invalid').pathname.replace(/\/+$/, ''); } catch { /* keep */ }
    const m = /^\/studio\/(?:write|preview)\/([A-Za-z0-9_-]+)$/.exec(path);
    post = m ? postById(env, m[1]) : postAtPath(env, siteSettings(env), path);
  } else reject(400, 'invalid_input', 'Pass id or url.');
  if (!post || (post.status !== 'published' && !canEdit(env, ctx, post))) reject(404, 'not_found', 'No such post.');
  return post;
}

export function opPostsGet(input, env) {
  return op(env, (ctx) => {
    requireMember(ctx);
    const post = findPost(env, ctx, input);
    const dto = editorDTO(env, ctx, post, siteSettings(env));
    return { ...dto, url: absolute(env, dto.url), preview_url: absolute(env, `/studio/preview/${post.id}`), can_edit: canEdit(env, ctx, post) };
  }, true);
}

function postResult(env, ctx, post) {
  const dto = editorDTO(env, ctx, post, siteSettings(env));
  return {
    id: post.id, title: post.title, status: post.status, blog: post.blog, slug: post.slug,
    url: absolute(env, dto.url), preview_url: absolute(env, `/studio/preview/${post.id}`), edit_url: absolute(env, `/studio/write/${post.id}`),
    words: post.words, reading_time: dto.reading_time, excerpt: post.excerpt,
  };
}

export function opPostsCreate(input, env) {
  return op(env, (ctx) => { requireWriter(ctx); return postResult(env, ctx, createPost(env, ctx, input, origin(env))); });
}
export function opPostsUpdate(input, env) {
  return op(env, (ctx) => { requireWriter(ctx); return postResult(env, ctx, updatePost(env, ctx, input.id, input, origin(env))); });
}
export function opPostsDelete(input, env) {
  return op(env, (ctx) => { requireWriter(ctx); return deletePost(env, ctx, input.id); });
}
export function opInbox(input, env) {
  return op(env, (ctx) => { requireWriter(ctx); return inbox(env, ctx, input); }, true);
}
export function opCommentsList(input, env) {
  return op(env, (ctx) => { requireMember(ctx); return listForPost(env, ctx, input.post_id); }, true);
}
export function opCommentsReply(input, env) {
  return op(env, (ctx) => {
    requireMember(ctx);
    const parent = env.holm.app.ds.findOne('comments', input.comment_id);
    if (!parent || parent.status === 'deleted') reject(404, 'not_found', 'No such comment.');
    const args = { body: input.body, parent_id: parent.id };
    if (input.as) args.as = input.as;
    return createComment(env, ctx, parent.postId, args, 'mcp');
  });
}
export function opCommentsCreate(input, env) {
  return op(env, (ctx) => {
    requireMember(ctx);
    const args = { body: input.body, quote: input.quote, parent_id: input.parent_id, sample: input.sample };
    if (input.as) args.as = input.as;
    return createComment(env, ctx, input.post_id, args, 'mcp');
  });
}
export function opCommentsModerate(input, env) {
  return op(env, (ctx) => { requireMember(ctx); return moderate(env, ctx, input.comment_id, input.action); });
}
export function opBlogsList(input, env) {
  return op(env, (ctx) => {
    requireMember(ctx);
    const settings = siteSettings(env);
    const counts = new Map();
    for (const p of published(env, ctx)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
    return { blogs: allBlogs(env).map((b) => ({ ...blogDTO(b, settings), url: absolute(env, blogDTO(b, settings).url), posts: counts.get(b.handle) || 0, can_write: canWriteAs(ctx, b), writers: ctx.admin && b.kind === 'persona' ? b.writers || [] : undefined })) };
  }, true);
}
export function opPersonasCreate(input, env) {
  return op(env, (ctx) => { requireAdmin(ctx); return blogDTO(createPersona(env, ctx, input), siteSettings(env)); });
}
export function opPersonasUpdate(input, env) {
  return op(env, (ctx) => {
    requireWriter(ctx);
    const blog = blogByHandle(env, String(input.handle).replace(/^@/, '').toLowerCase());
    if (!blog) reject(404, 'not_found', `There is no blog @${input.handle}.`);
    const change = { ...input };
    if (change.moderation === 'site') change.moderation = null;
    return blogDTO(updateBlog(env, ctx, blog, change), siteSettings(env));
  });
}
export function opMediaList(input, env) {
  return op(env, (ctx) => { requireWriter(ctx); return { media: listMine(env, ctx, int(input.limit, 40, 1, 100)) }; }, true);
}
export function opSiteUpdate(input, env) {
  return op(env, (ctx) => { requireAdmin(ctx); return updateSettings(env, input); });
}
export function opThemesList(input, env) {
  return op(env, (ctx) => { requireAdmin(ctx); return { active: siteSettings(env).theme, themes: listThemes(env) }; }, true);
}
export function opThemesReference(input, env) {
  return op(env, (ctx) => { requireMember(ctx); return { reference: env.holm.private.read('reference.md') }; }, true);
}
export async function opThemesGet(input, env) {
  const ctx = context(env, { readOnly: true });
  try {
    requireAdmin(ctx);
    return await themeFiles(env, input.id, origin(env));
  } catch (error) {
    if (error && error.public) error.code = CODES[error.status] || 'APP_INVALID_INPUT';
    throw error;
  }
}
export function opThemesValidate(input, env) {
  return op(env, (ctx) => {
    requireAdmin(ctx);
    const r = validate(input.files);
    return { ok: r.ok, errors: r.errors, warnings: r.warnings, id: r.manifest ? r.manifest.id : null };
  }, true);
}
export function opThemesSave(input, env) {
  return op(env, (ctx) => {
    requireAdmin(ctx);
    const r = validate(input.files);
    if (!r.ok) return { ok: false, saved: false, errors: r.errors, warnings: r.warnings };
    const saved = saveTheme(env, ctx, input.files);
    if (input.activate) updateSettings(env, { theme: saved.id });
    return { ok: true, saved: true, id: saved.id, active: !!input.activate, warnings: saved.warnings, preview_url: absolute(env, `/?theme=${saved.id}`) };
  });
}
export function opThemesActivate(input, env) {
  return op(env, (ctx) => {
    requireAdmin(ctx);
    return activateTheme(env, ctx, input.id, input.settings);
  });
}
export function opInvitesCreate(input, env) {
  const ctx = context(env);
  return createInvite(env, ctx, input, origin(env)).catch((error) => {
    if (error && error.public) error.code = CODES[error.status] || 'APP_INVALID_INPUT';
    throw error;
  });
}

export function activateTheme(env, ctx, id, values) {
  const theme = loadTheme(env, ctx, id);
  if (!theme || theme.id !== id) reject(404, 'not_found', `There is no theme "${id}".`);
  const settings = siteSettings(env);
  const all = { ...(settings.themeSettings || {}) };
  if (values && typeof values === 'object') {
    const current = { ...(all[id] || {}) };
    for (const s of theme.settings) if (values[s.key] !== undefined) current[s.key] = cleanSetting(s, values[s.key]);
    all[id] = current;
  }
  updateSettings(env, { theme: id, themeSettings: all });
  return { active: id, settings: settingValues(theme, all[id]) };
}

