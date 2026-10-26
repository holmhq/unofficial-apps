// Margin's HTTP side: reading pages through the active theme, media and theme assets,
// Studio's shell, and the JSON API that Studio and the reader script use.
import { json, errorResponse, readJSON, reject, sameOrigin, sha256 } from './lib/util.js';
import { context, requireMember, requireWriter, requireAdmin, teamList, setRole } from './people.js';
import { siteSettings, updateSettings } from './settings.js';
import { allBlogs, blogByHandle, blogDTO, canWriteAs, writableBlogs, createPersonBlog, createPersona, updateBlog, deletePersona } from './blogs.js';
import { createPost, updatePost, deletePost, postById, editorDTO, cardDTO, canEdit, postsOf, published } from './posts.js';
import { listForPost, createComment, moderate, editComment, inbox, clearSamples } from './comments.js';
import { clap, myClaps } from './claps.js';
import { upload, serve, listMine } from './media.js';
import { createInvite, previewInvite, acceptInvite, listInvites, revokeInvite } from './invites.js';
import { listThemes, loadTheme, validate, saveTheme, deleteTheme, themeFiles, serveAsset, settingValues } from './themes.js';
import { page, errorPage, cards } from './pages.js';
import { loadSamples, removeSamples } from './samples.js';
import { me, activateTheme } from './ops.js';

const handler = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (env.holm.app.kv.get('site:origin') !== url.origin && !/^(127\.|localhost)/.test(url.host)) env.holm.app.kv.set('site:origin', url.origin);
      if (path.startsWith('/api/')) return await api(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') return env.holm.web.fetch(request);
      let m = /^\/media\/([a-z0-9]+)(?:\.[a-z0-9]{2,5})?$/.exec(path);
      if (m) return serve(env, request, m[1]);
      m = /^\/t\/([a-z0-9.-]+)\/(.+)$/.exec(path);
      if (m) return serveAsset(env, m[1], m[2]);
      if (/^\/(studio(\/(?!preview\/).*)?|join\/[a-z0-9]+)$/.test(path)) return studioShell(request, env, url);
      const ctx = context(env);
      const answer = await page(request, env, ctx);
      if (answer) return answer;
      const fallback = await env.holm.web.fetch(request);
      if (fallback.status === 404 && (request.headers.get('accept') || '').includes('text/html')) return errorPage(env, ctx, request, siteSettings(env), 404);
      return fallback;
    } catch (error) {
      if (path.startsWith('/api/')) return errorResponse(error);
      console.error('page failed', path, String(error && (error.stack || error.message) || error).slice(0, 800));
      return new Response('<!doctype html><meta charset="utf-8"><title>Something went wrong</title><p style="font:16px system-ui;margin:4rem auto;max-width:30rem">Something went wrong. Try again in a moment.</p>', { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  },
};

export default handler;

async function sameSecret(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function studioShell(request, env, url) {
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const shell = await env.holm.web.fetch(new Request(url.origin + '/studio', { headers }));
  const out = new Headers(shell.headers);
  out.delete('content-length');
  out.delete('etag');
  out.set('Cache-Control', 'no-cache');
  return new Response(await shell.text(), { status: shell.status, headers: out });
}

async function api(request, env, url) {
  const method = request.method;
  const parts = url.pathname.slice(5).split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) reject(403, 'forbidden', 'Cross-site requests are not allowed.');
  const ctx = context(env);
  const settings = siteSettings(env);
  const body = async () => (method === 'GET' || method === 'HEAD' ? {} : readJSON(request));
  const [root, id, sub] = parts;
  const o = url.origin;

  if (root === 'me' && !id) {
    if (method === 'GET') {
      const out = me(env, ctx);
      out.login_url = env.holm.auth.getLoginURL(url.searchParams.get('return') || '/');
      out.logout_url = ctx.member ? env.holm.auth.getLogoutURL() : null;
      return json(out);
    }
  }
  if (root === 'me' && id === 'blog' && method === 'POST') {
    requireWriter(ctx);
    return json(blogDTO(createPersonBlog(env, ctx, await body()), settings), 201);
  }

  if (root === 'cards' && method === 'GET') {
    return json({ cards: cards(env, ctx, request) }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  if (root === 'site') {
    if (method === 'GET') { requireAdmin(ctx); return json({ ...settings, url: o }); }
    if (method === 'PATCH') { requireAdmin(ctx); return json(updateSettings(env, await body())); }
  }

  if (root === 'blogs') {
    if (!id && method === 'GET') {
      requireMember(ctx);
      const counts = new Map();
      for (const p of published(env, ctx)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
      return json({ blogs: allBlogs(env).map((b) => ({ ...blogDTO(b, settings), posts: counts.get(b.handle) || 0, can_write: canWriteAs(ctx, b), writers: ctx.admin ? b.writers || [] : undefined, own_moderation: b.moderation || null })) });
    }
    if (!id && method === 'POST') { requireAdmin(ctx); return json(blogDTO(createPersona(env, ctx, await body()), settings), 201); }
    const blog = id ? blogByHandle(env, id) : null;
    if (id && !blog) reject(404, 'not_found', 'No such blog.');
    if (blog && method === 'PATCH') return json(blogDTO(updateBlog(env, ctx, blog, await body()), settings));
    if (blog && method === 'DELETE') { deletePersona(env, ctx, blog); return json({ deleted: true }); }
  }

  if (root === 'posts') {
    if (!id && method === 'GET') {
      requireWriter(ctx);
      const scope = url.searchParams.get('scope') || 'mine';
      const status = url.searchParams.get('status') || 'all';
      const handles = scope === 'all' && ctx.admin ? allBlogs(env).map((b) => b.handle) : writableBlogs(env, ctx).filter((b) => b.kind === 'persona' ? true : b.memberId === ctx.member.id).map((b) => b.handle);
      const list = handles.flatMap((h) => postsOf(env, ctx, h, status)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 300);
      return json({ posts: list.map((p) => ({ ...cardDTO(env, ctx, p, settings), status: p.status, pending: p.pending || 0, updated_at: new Date(p.updatedAt).toISOString() })) });
    }
    if (!id && method === 'POST') { requireWriter(ctx); return json(editorDTO(env, ctx, createPost(env, ctx, await body(), o), settings), 201); }
    if (id && !sub) {
      if (method === 'GET') {
        const post = postById(env, id);
        if (!post || !canEdit(env, ctx, post)) reject(404, 'not_found', 'No such post.');
        return json(editorDTO(env, ctx, post, settings));
      }
      if (method === 'PATCH') { requireWriter(ctx); return json(editorDTO(env, ctx, updatePost(env, ctx, id, await body(), o), settings)); }
      if (method === 'DELETE') { requireWriter(ctx); return json(deletePost(env, ctx, id)); }
    }
    if (id && sub === 'comments') {
      if (method === 'GET') return json(listForPost(env, ctx, id));
      if (method === 'POST') return json(createComment(env, ctx, id, await body()), 201);
    }
    if (id && sub === 'claps' && method === 'POST') return json(clap(env, ctx, id, (await body()).add));
    if (id && sub === 'state' && method === 'GET') {
      const post = postById(env, id);
      if (!post) reject(404, 'not_found', 'No such post.');
      return json({ claps: post.claps || 0, mine: myClaps(env, ctx, id), comments: post.comments || 0, can_moderate: canEdit(env, ctx, post) });
    }
  }

  if (root === 'comments' && id) {
    if (method === 'PATCH') {
      const input = await body();
      if (input.action) return json(moderate(env, ctx, id, input.action));
      return json(editComment(env, ctx, id, input.body));
    }
    if (method === 'DELETE') return json(moderate(env, ctx, id, 'delete'));
  }

  if (root === 'inbox' && method === 'GET') {
    requireWriter(ctx);
    return json(inbox(env, ctx, { status: url.searchParams.get('status') || 'all', limit: url.searchParams.get('limit') }));
  }

  if (root === 'media') {
    if (!id && method === 'POST') return json(await upload(env, ctx, request), 201);
    if (!id && method === 'GET') { requireWriter(ctx); return json({ media: listMine(env, ctx) }); }
  }

  if (root === 'team') {
    requireAdmin(ctx);
    if (!id && method === 'GET') return json({ members: teamList(env), invites: listInvites(env, ctx) });
    if (id && method === 'PATCH') { const input = await body(); return json(setRole(env, ctx, id, input.role)); }
  }
  if (root === 'invites') {
    if (!id && method === 'POST') return json(await createInvite(env, ctx, await body(), o), 201);
    if (id && method === 'DELETE') return json(revokeInvite(env, ctx, id));
  }
  if (root === 'join' && id) {
    if (method === 'GET') return json(await previewInvite(env, ctx, id));
    if (method === 'POST') return json(await acceptInvite(env, ctx, id, await body()));
  }

  if (root === 'themes') {
    requireAdmin(ctx);
    if (!id && method === 'GET') return json({ active: settings.theme, themes: listThemes(env).map((t) => ({ ...t, settings: (loadTheme(env, ctx, t.id) || {}).settings || [], values: settingValues(loadTheme(env, ctx, t.id) || { settings: [] }, (settings.themeSettings || {})[t.id]) })) });
    if (id === 'validate' && method === 'POST') { const r = validate((await body()).files); return json({ ok: r.ok, errors: r.errors, warnings: r.warnings, id: r.manifest ? r.manifest.id : null }); }
    if (!id && method === 'POST') {
      const input = await readJSON(request, 9000000);
      const saved = saveTheme(env, ctx, input.files);
      if (input.activate) updateSettings(env, { theme: saved.id });
      return json(saved, 201);
    }
    if (id && sub === 'files' && method === 'GET') return json(await themeFiles(env, id, o));
    if (id && sub === 'activate' && method === 'POST') return json(activateTheme(env, ctx, id, (await body()).settings));
    if (id && !sub && method === 'DELETE') return json(deleteTheme(env, id, settings.theme));
  }

  if (root === 'reference' && method === 'GET') { requireMember(ctx); return new Response(env.holm.private.read('reference.md'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }); }

  // Operators set up a fresh site without signing in: a SETUP_KEY runtime secret
  // (holm secret runtime set SETUP_KEY … --app <id>) unlocks loading the samples and
  // site settings. Remove the secret afterwards.
  if (root === 'setup' && !id && method === 'POST') {
    const key = env.holm.secrets.get('SETUP_KEY');
    const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!key || key.length < 24 || given.length !== key.length || !(await sameSecret(given, key))) reject(401, 'unauthorized', 'A valid setup key is required.');
    const input = await body();
    const setup = { env, member: { id: 'setup', name: 'Setup' }, person: { handle: null, role: 'admin' }, role: 'admin', admin: true, writer: true, cache: new Map() };
    const out = {};
    if (input.samples) out.samples = await loadSamples(env, setup, o);
    if (input.site) out.site = updateSettings(env, input.site);
    return json(out);
  }

  if (root === 'samples') {
    requireAdmin(ctx);
    if (id === 'load' && method === 'POST') return json(await loadSamples(env, ctx, o, await body()));
    if (id === 'comments' && method === 'DELETE') return json(clearSamples(env, ctx, url.searchParams.get('post')));
    if (!id && method === 'DELETE') return json(removeSamples(env, ctx));
  }

  reject(404, 'not_found', 'No such endpoint.');
}
