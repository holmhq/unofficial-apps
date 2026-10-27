// Named operations (contract.json): the tools Claude and other assistants use through
// Holm's MCP endpoint at /_holm/mcp. Each checks the caller's rights itself, inside the
// workspace named by its `workspace` input (or the post it touches).
import { reject, int } from './lib/util.js';
import { context, requireMember, requireJoined, requireWriter, requireWsAdmin, requireAdmin } from './people.js';
import { marginSettings } from './settings.js';
import { blogByHandle, ownDTO, myIdentities, writableBlogs, createPersona, updateBlog, deletePersona } from './blogs.js';
import { createPost, updatePost, deletePost, postById, editorDTO, cardDTO, canEdit, postsOf, published, wsCached } from './posts.js';
import { listForPost, createComment, moderate, inbox } from './comments.js';
import { listMine, storeMedia, createUploadLink, requireUploader } from './media.js';
import { createInvite, listInvites, revokeInvite } from './invites.js';
import { listThemes, loadTheme, validate, saveTheme, themeFiles, settingValues, cleanSetting } from './themes.js';
import { postAtPath } from './pages.js';
import { workspaceBySlug, useWorkspace, createWorkspace, updateWorkspace, myWorkspaces, wsDTO, canCreateWorkspace, teamList, setRole, leave } from './workspaces.js';

// ---------- named operations (MCP tools) ----------

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 410: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT', 415: 'APP_INVALID_INPUT', 422: 'APP_INVALID', 429: 'APP_RATE_LIMITED' };
const fail = (error) => { if (error && error.public) error.code = CODES[error.status] || 'APP_INVALID_INPUT'; throw error; };

function scoped(env, input, readOnly) {
  const ctx = context(env, { readOnly });
  if (input && input.workspace) {
    const ws = workspaceBySlug(env, String(input.workspace).trim().toLowerCase().replace(/^\//, ''));
    if (!ws) reject(404, 'not_found', `There is no workspace ${input.workspace}. Call me_get for yours.`);
    useWorkspace(env, ctx, ws);
  }
  return ctx;
}
function op(env, input, run, readOnly = false) {
  try { return run(scoped(env, input, readOnly)); } catch (error) { return fail(error); }
}
function onPost(env, ctx, id) {
  const post = postById(env, id);
  if (!post) reject(404, 'not_found', 'No such post.');
  useWorkspace(env, ctx, wsCached(env, ctx, post.ws));
  return post;
}
const origin = (env) => env.holm.app.kv.get('site:origin') || '';
const absolute = (env, path) => (origin(env) ? origin(env) + path : path);

// Who you are: shared by /api/me (Studio, pages) and me_get (Claude).
export function me(env, ctx) {
  const margin = marginSettings(env);
  const ws = ctx.ws;
  return {
    signed_in: !!ctx.member,
    name: ctx.member ? ctx.member.name || '' : null,
    picture: ctx.member ? ctx.member.picture || '' : null,
    member_id: ctx.member ? ctx.member.id : null,
    admin: ctx.admin,
    handle: ctx.person ? ctx.person.handle || null : null,
    needs_handle: !!(ctx.member && ctx.person && !ctx.person.handle),
    identities: myIdentities(env, ctx).map((b) => ownDTO(b)),
    workspaces: myWorkspaces(env, ctx),
    margin: { name: margin.name, signups: margin.signups, can_create: canCreateWorkspace(env, ctx), url: origin(env) },
    workspace: ws ? { ...wsDTO(ws), role: ctx.wsRole, admin: ctx.wsAdmin, writer: ctx.writer, cover: ws.cover, moderation: ws.moderation, theme: ws.theme } : null,
    writer: ctx.writer,
    role: ctx.wsRole,
    blogs: writableBlogs(env, ctx).map((b) => ownDTO(b, ws ? ws.slug : null)),
    site: { name: ws ? ws.name : margin.name, url: origin(env) },
  };
}

export function opMe(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const out = me(env, ctx);
    out.guide = out.needs_handle
      ? 'This person has not picked a name on Margin yet. Ask them for a handle and do that in Studio first; you cannot pick it for them.'
      : out.workspaces.length
        ? 'Pass `workspace` (an address from workspaces) to the other tools. Write posts in Markdown with posts_create (draft unless asked to publish) and share the preview link. Check comments_inbox for comments that need approval or a reply; answer only ordinary ones and ask about anything sensitive. Use `as` for one of their names; never reveal which names belong to the same person. Their names: personas_create, personas_update, personas_delete. Owners and admins run the workspace with workspace_get, workspace_update, themes_activate, team_list, team_update, invites_create and invites_revoke; confirm removals first.'
        : 'They are not on a workspace yet. Offer to start one with workspaces_create (ask for its name), or they can open an invite link. They can comment on any post meanwhile.';
    return out;
  }, true);
}

export function opIdentitiesList(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const counts = new Map();
    for (const p of published(env, ctx, null)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
    return { identities: myIdentities(env, ctx).map((b) => ({ ...ownDTO(b), url: absolute(env, `/@${b.handle}`), posts: counts.get(b.handle) || 0 })) };
  }, true);
}

export function opWorkspacesCreate(input, env) {
  return op(env, input, (ctx) => {
    requireJoined(ctx);
    const ws = createWorkspace(env, ctx, input);
    return { ...wsDTO(ws), url: absolute(env, `/${ws.slug}`), studio_url: absolute(env, `/studio/${ws.slug}`), role: 'owner' };
  });
}

export function opPostsList(input, env) {
  return op(env, input, (ctx) => {
    requireWriter(ctx);
    let list;
    if (input.as) {
      const blog = blogByHandle(env, String(input.as).replace(/^@/, '').toLowerCase());
      const mine = blog && (blog.ownerId === ctx.member.id || (blog.kind === 'workspace' && blog.ws === ctx.ws.slug && ctx.wsAdmin));
      if (!mine && !ctx.wsAdmin) reject(404, 'not_found', `You can't see @${input.as}'s drafts.`);
      list = postsOf(env, ctx, blog ? blog.handle : '-', input.status, ctx.ws.slug);
    } else if (ctx.wsAdmin) list = postsOf(env, ctx, null, input.status, ctx.ws.slug);
    else list = myIdentities(env, ctx).flatMap((b) => postsOf(env, ctx, b.handle, input.status, ctx.ws.slug));
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const limit = int(input.limit, 30, 1, 100);
    return {
      posts: list.slice(0, limit).map((p) => {
        const card = cardDTO(env, ctx, p);
        return { id: p.id, title: p.title, status: p.status, as: p.blog, url: absolute(env, card.url), preview_url: absolute(env, `/studio/preview/${p.id}`), date: card.date, tags: p.tags, claps: p.claps || 0, comments: p.comments || 0, pending_comments: p.pending || 0, words: p.words || 0 };
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
    post = m ? postById(env, m[1]) : postAtPath(env, path);
  } else reject(400, 'invalid_input', 'Pass id or url.');
  if (!post) reject(404, 'not_found', 'No such post.');
  useWorkspace(env, ctx, wsCached(env, ctx, post.ws));
  if (post.status !== 'published' && !canEdit(env, ctx, post)) reject(404, 'not_found', 'No such post.');
  return post;
}

export function opPostsGet(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const post = findPost(env, ctx, input);
    const dto = editorDTO(env, ctx, post);
    return { ...dto, url: absolute(env, dto.url), preview_url: absolute(env, `/studio/preview/${post.id}`), can_edit: canEdit(env, ctx, post) };
  }, true);
}

function postResult(env, ctx, post) {
  const dto = editorDTO(env, ctx, post);
  return {
    id: post.id, title: post.title, status: post.status, workspace: post.ws, as: post.blog, slug: post.slug,
    url: absolute(env, dto.url), preview_url: absolute(env, `/studio/preview/${post.id}`), edit_url: absolute(env, `/studio/write/${post.id}`),
    words: post.words, reading_time: dto.reading_time, excerpt: post.excerpt, drawing: dto.drawing,
  };
}

export function opPostsCreate(input, env) {
  return op(env, input, (ctx) => { requireWriter(ctx); return postResult(env, ctx, createPost(env, ctx, input, origin(env))); });
}
export function opPostsUpdate(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); onPost(env, ctx, input.id); return postResult(env, ctx, updatePost(env, ctx, input.id, input, origin(env))); });
}
export function opPostsDelete(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); onPost(env, ctx, input.id); return deletePost(env, ctx, input.id); });
}
export function opInbox(input, env) {
  return op(env, input, (ctx) => { requireWriter(ctx); return inbox(env, ctx, input); }, true);
}
export function opCommentsList(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); onPost(env, ctx, input.post_id); return listForPost(env, ctx, input.post_id); }, true);
}
export function opCommentsReply(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const parent = env.holm.app.ds.findOne('comments', input.comment_id);
    if (!parent || parent.status === 'deleted') reject(404, 'not_found', 'No such comment.');
    onPost(env, ctx, parent.postId);
    const args = { body: input.body, parent_id: parent.id };
    if (input.as) args.as = input.as;
    return createComment(env, ctx, parent.postId, args, 'mcp');
  });
}
export function opCommentsCreate(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    onPost(env, ctx, input.post_id);
    const args = { body: input.body, quote: input.quote, parent_id: input.parent_id, sample: input.sample };
    if (input.as) args.as = input.as;
    return createComment(env, ctx, input.post_id, args, 'mcp');
  });
}
export function opCommentsModerate(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); return moderate(env, ctx, input.comment_id, input.action); });
}
export function opPersonasCreate(input, env) {
  return op(env, input, (ctx) => { requireJoined(ctx); return ownDTO(createPersona(env, ctx, input)); });
}
export function opPersonasUpdate(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const blog = blogByHandle(env, String(input.handle).replace(/^@/, '').toLowerCase());
    if (!blog) reject(404, 'not_found', `There is no @${input.handle}.`);
    if (blog.kind === 'workspace') useWorkspace(env, ctx, workspaceBySlug(env, blog.ws));
    return ownDTO(updateBlog(env, ctx, blog, input));
  });
}
export function opPersonasDelete(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const blog = blogByHandle(env, String(input.handle).replace(/^@/, '').toLowerCase());
    if (!blog) reject(404, 'not_found', `There is no @${input.handle}.`);
    deletePersona(env, ctx, blog);
    return { deleted: true, handle: blog.handle };
  });
}
export function opMediaUpload(input, env) {
  return op(env, input, (ctx) => {
    requireUploader(ctx);
    let bytes;
    if (typeof input.svg === 'string' && input.svg.trim()) bytes = new TextEncoder().encode(input.svg).buffer;
    else if (typeof input.data === 'string' && input.data.trim()) bytes = fromBase64(input.data);
    else reject(400, 'invalid_input', 'Send svg (a drawing as text) or data (a small file in base64). For larger files and video, use media_link.');
    const out = storeMedia(env, { id: ctx.member.id }, bytes, { name: input.name, alt: input.alt, via: 'claude' });
    delete out.docId;
    return out;
  });
}
function fromBase64(value) {
  let bin;
  try { bin = atob(value.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')); } catch { reject(400, 'invalid_input', 'data is not valid base64.'); }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
export async function opMediaUploadLink(input, env) {
  try { return await createUploadLink(env, scoped(env, input, false), origin(env)); } catch (error) { return fail(error); }
}
export function opMediaList(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); return { media: listMine(env, ctx, int(input.limit, 40, 1, 100)) }; }, true);
}
export function opWorkspaceUpdate(input, env) {
  return op(env, input, (ctx) => {
    requireWsAdmin(ctx);
    const { workspace, ...change } = input;
    const ws = updateWorkspace(env, ctx, change);
    return { ...wsDTO(ws), home: ws.home, moderation: ws.moderation, cover: ws.cover, theme: ws.theme, url: absolute(env, `/${ws.slug}`) };
  });
}
export function opWorkspaceGet(input, env) {
  return op(env, input, (ctx) => {
    requireWsAdmin(ctx);
    const ws = ctx.ws;
    return {
      ...wsDTO(ws), role: ctx.wsRole, description: ws.description || '', home: ws.home, moderation: ws.moderation,
      cover: ws.cover, theme: ws.theme, nav: ws.nav || [], featured: ws.featured || [], url: absolute(env, `/${ws.slug}`),
    };
  }, true);
}
export function opWorkspaceLeave(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); if (!ctx.ws) reject(400, 'invalid_input', 'Say which workspace to leave.'); return leave(env, ctx); });
}
export function opTeamList(input, env) {
  return op(env, input, (ctx) => { requireWsAdmin(ctx); return { members: teamList(env, ctx), invites: listInvites(env, ctx) }; }, true);
}
export function opTeamUpdate(input, env) {
  return op(env, input, (ctx) => { requireWsAdmin(ctx); return setRole(env, ctx, String(input.account || ''), input.role); });
}
export function opInvitesRevoke(input, env) {
  return op(env, input, (ctx) => { requireWsAdmin(ctx); return revokeInvite(env, ctx, String(input.id || '')); });
}
export function opThemesList(input, env) {
  return op(env, input, (ctx) => { requireWsAdmin(ctx); return { active: ctx.ws.theme, themes: listThemes(env) }; }, true);
}
export function opThemesReference(input, env) {
  return op(env, input, (ctx) => { requireMember(ctx); return { reference: env.holm.private.read('reference.md') }; }, true);
}
export async function opThemesGet(input, env) {
  try {
    const ctx = scoped(env, input, true);
    requireMember(ctx);
    return await themeFiles(env, input.id, origin(env));
  } catch (error) { return fail(error); }
}
export function opThemesValidate(input, env) {
  return op(env, input, (ctx) => {
    requireMember(ctx);
    const r = validate(input.files);
    return { ok: r.ok, errors: r.errors, warnings: r.warnings, id: r.manifest ? r.manifest.id : null };
  }, true);
}
export function opThemesSave(input, env) {
  return op(env, input, (ctx) => {
    requireAdmin(ctx);
    const r = validate(input.files);
    if (!r.ok) return { ok: false, saved: false, errors: r.errors, warnings: r.warnings };
    const saved = saveTheme(env, ctx, input.files);
    return { ok: true, saved: true, id: saved.id, warnings: saved.warnings };
  });
}
export function opThemesActivate(input, env) {
  return op(env, input, (ctx) => { requireWsAdmin(ctx); return activateTheme(env, ctx, input.id, input.settings); });
}
export function opInvitesCreate(input, env) {
  let ctx;
  try { ctx = scoped(env, input, false); requireWsAdmin(ctx); } catch (error) { return fail(error); }
  return createInvite(env, ctx, input, origin(env)).catch(fail);
}

// A workspace picks a theme and its settings.
export function activateTheme(env, ctx, id, values) {
  const theme = loadTheme(env, ctx, id);
  if (!theme || theme.id !== id) reject(404, 'not_found', `There is no theme "${id}".`);
  const all = { ...(ctx.ws.themeSettings || {}) };
  if (values && typeof values === 'object') {
    const current = { ...(all[id] || {}) };
    for (const s of theme.settings) if (values[s.key] !== undefined) current[s.key] = cleanSetting(s, values[s.key]);
    all[id] = current;
  }
  updateWorkspace(env, ctx, { theme: id, themeSettings: all });
  return { active: id, workspace: ctx.ws.slug, settings: settingValues(theme, all[id]) };
}
