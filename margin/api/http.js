// Margin's HTTP side: reading pages, media, drawings and theme assets, Studio's shell, and
// the JSON API that Studio and the reader script use. Requests about a workspace name it
// in the X-Margin-Workspace header (or ?ws=); requests about a post take its workspace.
import { json, errorResponse, readJSON, reject, sameOrigin, sha256 } from './lib/util.js';
import { context, requireMember, requireJoined, requireWriter, requireWsAdmin, requireAdmin } from './people.js';
import { marginSettings, updateMargin } from './settings.js';
import { blogByHandle, blogDTO, ownDTO, myIdentities, createPersonBlog, createPersona, updateBlog, deletePersona, handle as checkHandle, RESERVED, HANDLE } from './blogs.js';
import { createPost, updatePost, deletePost, postById, editorDTO, cardDTO, canEdit, postsOf, published, wsCached } from './posts.js';
import { listForPost, createComment, moderate, editComment, inbox, clearSamples } from './comments.js';
import { clap, myClaps } from './claps.js';
import { upload, serve, listMine, uploadWithLink, uploadLinkStatus } from './media.js';
import { createInvite, previewInvite, acceptInvite, listInvites, revokeInvite } from './invites.js';
import { listThemes, loadTheme, validate, saveTheme, deleteTheme, themeFiles, serveAsset, settingValues } from './themes.js';
import { workspaceBySlug, useWorkspace, createWorkspace, updateWorkspace, myWorkspaces, teamList, setRole, leave, allWorkspaces, setSuspended, wsDTO } from './workspaces.js';
import { page, errorPage, cards } from './pages.js';
import { prepare } from './markdown.js';
import { loadSamples, removeSamples } from './samples.js';
import { me, activateTheme } from './ops.js';

const LOCAL = /^(127\.|localhost|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/;

const handler = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      const margin = marginSettings(env);
      const primary = margin.primaryHost;
      // One address for everything: other hosts on this app send readers there.
      if (primary && url.host !== primary && !LOCAL.test(url.host) && (request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/_holm') && !path.startsWith('/auth')) {
        return new Response(null, { status: 301, headers: { Location: `https://${primary}${path}${url.search}`, 'Cache-Control': 'public, max-age=3600' } });
      }
      const origin = primary && !LOCAL.test(url.host) ? `https://${primary}` : url.origin;
      if (env.holm.app.kv.get('site:origin') !== origin && !/^(127\.|localhost)/.test(url.host)) env.holm.app.kv.set('site:origin', origin);
      if (path.startsWith('/api/')) return await api(request, env, url);
      // An upload link: the page in a browser, files by POST (from that page or curl).
      let m = /^\/upload\/([a-z0-9]{24})$/.exec(path);
      if (m && request.method === 'POST') {
        try { return json(await uploadWithLink(env, m[1], request), 201); } catch (error) { return errorResponse(error); }
      }
      if (m && url.searchParams.has('status')) return json(await uploadLinkStatus(env, m[1]), 200, { 'Cache-Control': 'no-store' });
      if (m) return uploadPage(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') return env.holm.web.fetch(request);
      m = /^\/media\/([a-z0-9]+)(?:-(w\d{3,4}|og))?(?:\.[a-z0-9]{2,5})?$/.exec(path);
      if (m) return serve(env, request, m[1], m[2]);
      m = /^\/t\/([a-z0-9.-]+)\/(.+)$/.exec(path);
      if (m) return serveAsset(env, m[1], m[2]);
      if (path === '/margin/covers.js') {
        return new Response(env.holm.private.read('covers.js'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (/^\/(studio(\/(?!preview\/).*)?|join\/[a-z0-9]+|new)$/.test(path)) return studioShell(request, env, url);
      const ctx = context(env);
      const answer = await page(request, env, ctx);
      if (answer) return answer;
      const fallback = await env.holm.web.fetch(request);
      if (fallback.status === 404 && (request.headers.get('accept') || '').includes('text/html')) return errorPage(env, ctx, request, null, 404);
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

// The upload page is a static file; links never go stale in a cache.
async function uploadPage(request, env, url) {
  const page = await env.holm.web.fetch(new Request(url.origin + '/upload', { headers: { accept: 'text/html' } }));
  const out = new Headers(page.headers);
  out.delete('content-length');
  out.delete('etag');
  out.set('Cache-Control', 'no-store');
  out.set('Referrer-Policy', 'no-referrer');
  return new Response(await page.text(), { status: page.status, headers: out });
}

function originOf(env, url) { return env.holm.app.kv.get('site:origin') || url.origin; }

// The workspace a request is about: named in a header or the query string.
function namedWorkspace(env, request, url) {
  const slug = (request.headers.get('x-margin-workspace') || url.searchParams.get('ws') || '').trim().toLowerCase();
  if (!slug) return null;
  const ws = workspaceBySlug(env, slug);
  if (!ws) reject(404, 'not_found', `There is no workspace ${slug}.`);
  return ws;
}

function withPost(env, ctx, id) {
  const post = postById(env, id);
  if (!post) reject(404, 'not_found', 'No such post.');
  useWorkspace(env, ctx, wsCached(env, ctx, post.ws));
  return post;
}

function availability(env, value, label) {
  try {
    const h = checkHandle(value, label);
    return { value: h, free: !blogByHandle(env, h), reason: blogByHandle(env, h) ? `${h} is taken.` : null };
  } catch (error) {
    return { value: String(value || ''), free: false, reason: error.message };
  }
}

async function api(request, env, url) {
  const method = request.method;
  const parts = url.pathname.slice(5).split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) reject(403, 'forbidden', 'Cross-site requests are not allowed.');
  const ctx = context(env);
  useWorkspace(env, ctx, namedWorkspace(env, request, url));
  const body = async () => (method === 'GET' || method === 'HEAD' ? {} : readJSON(request));
  const [root, id, sub] = parts;
  const o = originOf(env, url);

  if (root === 'me' && !id && method === 'GET') {
    const out = me(env, ctx);
    out.login_url = env.holm.auth.getLoginURL(url.searchParams.get('return') || '/');
    out.logout_url = ctx.member ? env.holm.auth.getLogoutURL() : null;
    return json(out);
  }
  if (root === 'me' && id === 'blog' && method === 'POST') {
    requireMember(ctx);
    return json(ownDTO(createPersonBlog(env, ctx, await body())), 201);
  }

  if (root === 'check' && method === 'GET') {
    if (id === 'handle') return json(availability(env, url.searchParams.get('value'), 'A handle'));
    if (id === 'workspace') return json(availability(env, url.searchParams.get('value'), 'An address'));
  }

  if (root === 'cards' && method === 'GET') {
    return json({ cards: cards(env, ctx, request) }, 200, { 'Cache-Control': 'public, max-age=60' });
  }

  // ---- identities: your main name and personas ----
  if (root === 'identities') {
    requireMember(ctx);
    if (!id && method === 'GET') {
      const counts = new Map();
      for (const p of published(env, ctx, null)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
      return json({ identities: myIdentities(env, ctx).map((b) => ({ ...ownDTO(b), posts: counts.get(b.handle) || 0 })) });
    }
    if (!id && method === 'POST') { requireJoined(ctx); return json(ownDTO(createPersona(env, ctx, await body())), 201); }
    const blog = id ? blogByHandle(env, id) : null;
    if (!blog) reject(404, 'not_found', 'No such name.');
    if (blog.kind === 'workspace') useWorkspace(env, ctx, workspaceBySlug(env, blog.ws));
    if (method === 'PATCH') return json(ownDTO(updateBlog(env, ctx, blog, await body())));
    if (method === 'DELETE') { deletePersona(env, ctx, blog); return json({ deleted: true }); }
  }

  // ---- workspaces ----
  if (root === 'workspaces') {
    requireMember(ctx);
    if (!id && method === 'GET') return json({ workspaces: myWorkspaces(env, ctx) });
    if (!id && method === 'POST') {
      const ws = createWorkspace(env, ctx, await body());
      useWorkspace(env, ctx, ws);
      return json({ ...wsDTO(ws), role: ctx.wsRole }, 201);
    }
  }
  if (root === 'workspace') {
    if (!id && method === 'GET') { requireWsAdmin(ctx); return json({ ...ctx.ws, ...wsDTO(ctx.ws), url: o + '/' + ctx.ws.slug }); }
    if (!id && method === 'PATCH') { requireWsAdmin(ctx); const ws = updateWorkspace(env, ctx, await body()); return json({ ...ws, ...wsDTO(ws) }); }
    if (id === 'leave' && method === 'POST') { requireMember(ctx); return json(leave(env, ctx)); }
  }
  if (root === 'team') {
    requireWsAdmin(ctx);
    if (!id && method === 'GET') return json({ members: teamList(env, ctx), invites: listInvites(env, ctx) });
    if (id && method === 'PATCH') return json(setRole(env, ctx, id, (await body()).role));
  }
  if (root === 'invites') {
    if (!id && method === 'POST') { requireWsAdmin(ctx); return json(await createInvite(env, ctx, await body(), o), 201); }
    if (id && method === 'DELETE') return json(revokeInvite(env, ctx, id));
  }
  if (root === 'join' && id) {
    if (method === 'GET') return json(await previewInvite(env, ctx, id));
    if (method === 'POST') return json(await acceptInvite(env, ctx, id, await body()));
  }

  // ---- posts ----
  if (root === 'posts') {
    if (!id && method === 'GET') {
      requireWriter(ctx);
      const scope = url.searchParams.get('scope') || 'mine';
      const status = url.searchParams.get('status') || 'all';
      let list;
      if (scope === 'all' && ctx.wsAdmin) list = postsOf(env, ctx, null, status, ctx.ws.slug);
      else {
        const handles = myIdentities(env, ctx).map((b) => b.handle);
        if (ctx.wsAdmin) handles.push(ctx.ws.slug);
        list = handles.flatMap((h) => postsOf(env, ctx, h, status, ctx.ws.slug));
      }
      list = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 300);
      return json({ posts: list.map((p) => ({ ...cardDTO(env, ctx, p), status: p.status, pending: p.pending || 0, updated_at: new Date(p.updatedAt).toISOString() })) });
    }
    if (!id && method === 'POST') { requireWriter(ctx); const input = await body(); await prepare(input.markdown ?? input.body); return json(editorDTO(env, ctx, createPost(env, ctx, input, o)), 201); }
    if (id && !sub) {
      const post = withPost(env, ctx, id);
      if (method === 'GET') {
        if (!canEdit(env, ctx, post)) reject(404, 'not_found', 'No such post.');
        return json(editorDTO(env, ctx, post));
      }
      if (method === 'PATCH') { requireMember(ctx); const input = await body(); await prepare(input.markdown ?? input.body); return json(editorDTO(env, ctx, updatePost(env, ctx, id, input, o))); }
      if (method === 'DELETE') { requireMember(ctx); return json(deletePost(env, ctx, id)); }
    }
    if (id && sub === 'comments') {
      withPost(env, ctx, id);
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
    if (!id && method === 'GET') { requireMember(ctx); return json({ media: listMine(env, ctx) }); }
  }

  // ---- themes: Margin's admins add them; a workspace's owners pick one ----
  if (root === 'themes') {
    const theme = ctx.ws ? ctx.ws.theme : marginSettings(env).theme;
    const saved = ctx.ws ? ctx.ws.themeSettings || {} : {};
    if (!id && method === 'GET') {
      if (!ctx.admin && !ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins see themes.');
      return json({ active: theme, can_upload: ctx.admin, themes: listThemes(env).map((t) => { const full = loadTheme(env, ctx, t.id) || { settings: [] }; return { ...t, settings: full.settings || [], values: settingValues(full, saved[t.id]) }; }) });
    }
    if (id === 'validate' && method === 'POST') { requireAdmin(ctx); const r = validate((await body()).files); return json({ ok: r.ok, errors: r.errors, warnings: r.warnings, id: r.manifest ? r.manifest.id : null }); }
    if (!id && method === 'POST') {
      requireAdmin(ctx);
      const input = await readJSON(request, 9000000);
      return json(saveTheme(env, ctx, input.files), 201);
    }
    if (id && sub === 'files' && method === 'GET') { requireMember(ctx); return json(await themeFiles(env, id, o)); }
    if (id && sub === 'activate' && method === 'POST') { requireWsAdmin(ctx); return json(activateTheme(env, ctx, id, (await body()).settings)); }
    if (id && !sub && method === 'DELETE') {
      requireAdmin(ctx);
      const inUse = allWorkspaces(env).find((w) => w.theme === id);
      if (inUse) reject(409, 'in_use', `${inUse.name} uses this theme. Switch it first.`);
      return json(deleteTheme(env, id, marginSettings(env).theme));
    }
  }

  // ---- Margin itself (its admins) ----
  if (root === 'margin') {
    requireAdmin(ctx);
    if (!id && method === 'GET') return json({ ...marginSettings(env), url: o });
    if (!id && method === 'PATCH') return json(updateMargin(env, await body()));
    if (id === 'workspaces' && !sub && method === 'GET') {
      return json({ workspaces: allWorkspaces(env).map((w) => ({ ...wsDTO(w), suspended: !!w.suspended, sample: !!w.sample, posts: published(env, ctx, w.slug).length, created_at: new Date(w.createdAt || 0).toISOString() })) });
    }
    if (id === 'workspaces' && sub && method === 'PATCH') return json(wsDTO(setSuspended(env, ctx, sub, (await body()).suspended)));
  }

  if (root === 'reference' && method === 'GET') { requireMember(ctx); return new Response(env.holm.private.read('reference.md'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }); }

  // Operators set up a node without signing in: a SETUP_KEY runtime secret
  // (holm secret runtime set SETUP_KEY … --app <id>) unlocks removing and loading the
  // samples and Margin's settings. Remove the secret afterwards.
  if (root === 'setup' && !id && method === 'POST') {
    const key = env.holm.secrets.get('SETUP_KEY');
    const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!key || key.length < 24 || given.length !== key.length || !(await sameSecret(given, key))) reject(401, 'unauthorized', 'A valid setup key is required.');
    const input = await body();
    const setup = { env, member: { id: 'setup', name: 'Setup' }, person: { handle: null }, admin: true, ws: null, membership: null, writer: false, wsAdmin: false, cache: new Map() };
    const out = {};
    // Each step reports done: false while there's more; call again until it's done.
    if (input.remove_samples) {
      out.removed = removeSamples(env, setup);
      if (!out.removed.done) return json(out);
    }
    if (input.samples) out.samples = await loadSamples(env, setup, o);
    if (input.margin) out.margin = updateMargin(env, input.margin);
    return json(out);
  }

  if (root === 'samples') {
    requireAdmin(ctx);
    if (id === 'load' && method === 'POST') return json(await loadSamples(env, ctx, o));
    if (id === 'comments' && method === 'DELETE') return json(clearSamples(env, ctx, url.searchParams.get('post')));
    if (!id && method === 'DELETE') return json(removeSamples(env, ctx));
  }

  reject(404, 'not_found', 'No such endpoint.');
}

export { RESERVED, HANDLE, blogDTO };
