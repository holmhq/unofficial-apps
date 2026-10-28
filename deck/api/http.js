// Deck's HTTP side: shared and embedded decks with their link previews, the library's
// pictures, upload links, and the JSON API the web app uses. Claude's tools (ops.js) call
// the same functions.
import { json, errorResponse, readJSON, reject, sameOrigin, escapeHTML, int } from './lib/util.js';
import { context, requireMember } from './people.js';
import {
  access, myWorkspaces, createWorkspace, updateWorkspace, refreshMember, teamList, setRole, leave,
  createInvite, previewInvite, acceptInvite, revokeInvite, wsDTO,
} from './workspaces.js';
import {
  listDecks, createDeck, getDeck, saveDeck, deleteDeck, duplicateDeck, listRevisions, restoreRevision,
  setShare, publicDeck, presentDeck, sharedDeck, previewImage,
} from './decks.js';
import { listMedia, storeMedia, deleteMedia, readUpload, createUploadLink, uploadLinkStatus, uploadWithLink, serve, inLibrary } from './media.js';

const LOCAL = /^(127\.|localhost|\[::1\]|[a-z0-9.-]+\.localhost|[0-9.]+\.nip\.io|[a-z0-9-]+\.[0-9.]+\.nip\.io)(:\d+)?$/;

export function originOf(url) {
  return LOCAL.test(url.host) ? url.origin : `https://${url.host}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      // Claude's tools answer with full links, so remember the address people use.
      const origin = originOf(url);
      if (!/^(127\.|localhost|\[::1\])/.test(url.host)) {
        const kept = env.holm.app.kv.get('site:origin');
        if (kept !== origin && (!kept || !LOCAL.test(url.host))) env.holm.app.kv.set('site:origin', origin);
      }
      if (path.startsWith('/api/')) return await api(request, env, url);
      let m = /^\/upload\/([a-z0-9]{24})$/.exec(path);
      if (m && request.method === 'POST') {
        try { return json(await uploadWithLink(env, m[1], request), 201); } catch (error) { return errorResponse(error); }
      }
      if (m && url.searchParams.has('status')) return json(await uploadLinkStatus(env, m[1]));
      if (m) return staticPage(request, env, url, '/upload', { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      if (request.method !== 'GET' && request.method !== 'HEAD') return env.holm.web.fetch(request);
      m = /^\/media\/([a-z0-9]+)(?:-(w\d{3,4}|og))?(?:\.[a-z0-9]{2,5})?$/.exec(path);
      if (m) return serve(env, m[1], m[2]);
      m = /^\/(s|e)\/([a-z0-9]{16})$/.exec(path);
      if (m) return sharedPage(request, env, url, m[1], m[2]);
      if (path === '/sample') return staticPage(request, env, url, '/view', { 'Cache-Control': 'no-cache' });
      if (/^\/p\/[a-z0-9]{12}$/.test(path)) return staticPage(request, env, url, '/view', { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return env.holm.web.fetch(request);
    } catch (error) {
      if (path.startsWith('/api/')) return errorResponse(error);
      console.error('page failed', path, String(error && (error.stack || error.message) || error).slice(0, 800));
      return new Response('Something went wrong. Try again in a moment.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },
};

// A static page served at another address, with Holm's head tags intact.
async function staticPage(request, env, url, file, headers = {}) {
  const page = await env.holm.web.fetch(new Request(url.origin + file, { headers: { accept: 'text/html' } }));
  const out = new Headers(page.headers);
  out.delete('content-length');
  out.delete('etag');
  for (const [k, v] of Object.entries(headers)) out.set(k, v);
  return new Response(await page.text(), { status: page.status, headers: out });
}

// /s/<sid> (the deck as one page) and /e/<sid> (the same, for an iframe on any site). The
// server writes the deck's own title, description and picture so link previews show it.
async function sharedPage(request, env, url, kind, sid) {
  const found = sharedDeck(env, sid);
  const page = await env.holm.web.fetch(new Request(url.origin + '/view', { headers: { accept: 'text/html' } }));
  let html = await page.text();
  const origin = originOf(url);
  const pageURL = `${origin}/s/${sid}`;
  const content = found ? found.revision.content : null;
  const title = content ? String(content.title || 'Untitled deck') : 'Deck not found';
  const description = content ? String(content.description || `${content.slides.length} slides`) : 'This deck isn’t shared, or the link changed.';
  const picture = content && previewImage(content);
  const image = picture ? origin + picture : `${origin}/social_preview.png`;
  const tags = [
    `<title>${escapeHTML(title)}</title>`,
    `<meta name="description" content="${escapeHTML(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHTML(title)}">`,
    `<meta property="og:description" content="${escapeHTML(description)}">`,
    `<meta property="og:url" content="${escapeHTML(pageURL)}">`,
    `<meta property="og:image" content="${escapeHTML(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="canonical" href="${escapeHTML(pageURL)}">`,
  ].join('\n');
  // Drop the static page's own copies of these, then put the deck's in their place.
  html = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(?:name|property)="(?:description|og:[a-z:_]+|twitter:[a-z:_]+)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<meta charset="utf-8">/i, (m) => `${m}\n${tags}`);
  if (kind === 'e') html = html.replace('<html lang="en"', '<html lang="en" data-embed=""');
  const headers = new Headers(page.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (kind === 'e') {
    const csp = headers.get('content-security-policy');
    headers.set('Content-Security-Policy', csp ? csp.replace(/frame-ancestors[^;]*/i, 'frame-ancestors *') : 'frame-ancestors *');
    headers.delete('x-frame-options');
  }
  return new Response(html, { status: found ? 200 : 404, headers });
}

// ---------- JSON API for the web app ----------

async function api(request, env, url) {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) reject(403, 'forbidden', 'Cross-site requests are refused.');
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const ctx = context(env);
  const body = async () => readJSON(request);
  const [a, b, c, d] = parts;

  if (a === 'me' && parts.length === 1 && method === 'GET') return json(me(env, ctx, url.searchParams.get('return')));
  if (a === 'sample' && parts.length === 1 && method === 'GET') return json({ content: env.holm.private.readJSON('sample.json') }, 200, { 'Cache-Control': 'public, max-age=300' });
  if (a === 's' && parts.length === 2 && method === 'GET') return json(publicDeck(env, b), 200, { 'Cache-Control': 'no-cache' });
  if (a === 'join' && parts.length === 2) {
    if (method === 'GET') return json(await previewInvite(env, ctx, b));
    if (method === 'POST') return json(await acceptInvite(env, ctx, b));
  }

  if (a === 'workspaces' && parts.length === 1 && method === 'POST') {
    requireMember(ctx);
    const input = await body();
    const first = myWorkspaces(env, ctx).length === 0;
    const ws = createWorkspace(env, ctx, input);
    let sample = null;
    if (first || input.sample) sample = createDeck(env, ctx, ws.wid, { content: env.holm.private.readJSON('sample.json'), from: 'sample' }, 'person').deck;
    return json({ workspace: wsDTO(ws, 'owner'), sample }, 201);
  }

  if (a === 'w' && b) {
    const wid = b;
    if (parts.length === 2) {
      if (method === 'GET') {
        const { ws, role } = access(env, ctx, wid, 'editor');
        return json({ workspace: { ...wsDTO(ws, role), channel: 'ws-' + ws.chan }, decks: listDecks(env, ctx, wid) });
      }
      if (method === 'PATCH') return json(updateWorkspace(env, ctx, wid, await body(), (id) => inLibrary(env, wid, id)));
    }
    if (c === 'leave' && parts.length === 3 && method === 'POST') return json(leave(env, ctx, wid));
    if (c === 'team') {
      if (parts.length === 3 && method === 'GET') return json(teamList(env, ctx, wid));
      if (parts.length === 4 && method === 'PATCH') return json(setRole(env, ctx, wid, d, (await body()).role));
    }
    if (c === 'invites') {
      if (parts.length === 3 && method === 'POST') return json(await createInvite(env, ctx, wid, await body(), originOf(url)), 201);
      if (parts.length === 4 && method === 'DELETE') return json(revokeInvite(env, ctx, wid, d));
    }
    if (c === 'decks' && parts.length === 3) {
      if (method === 'GET') return json({ decks: listDecks(env, ctx, wid) });
      if (method === 'POST') {
        const input = await body();
        const content = input.from === 'sample' ? env.holm.private.readJSON('sample.json') : undefined;
        return json(createDeck(env, ctx, wid, { title: input.title, content, from: input.from }, 'person'), 201);
      }
    }
    if (c === 'media') {
      if (parts.length === 3 && method === 'GET') { access(env, ctx, wid, 'editor'); return json({ media: listMedia(env, wid) }); }
      if (parts.length === 3 && method === 'POST') {
        access(env, ctx, wid, 'editor');
        const { bytes, fields } = await readUpload(request);
        return json(storeMedia(env, wid, ctx.member.id, bytes, { ...fields, via: 'studio' }), 201);
      }
      if (parts.length === 4 && d === 'link' && method === 'POST') { access(env, ctx, wid, 'editor'); return json(await createUploadLink(env, wid, ctx.member.id, originOf(url)), 201); }
      if (parts.length === 4 && method === 'DELETE') { access(env, ctx, wid, 'editor'); return json(deleteMedia(env, wid, d)); }
    }
  }

  if (a === 'decks' && b) {
    const did = b;
    if (parts.length === 2) {
      if (method === 'GET') return json(getDeck(env, ctx, did, url.searchParams.has('rev') ? int(url.searchParams.get('rev'), 1, 1, 1e9) : null));
      if (method === 'POST') return json(saveDeck(env, ctx, did, await body(), 'person'));
      if (method === 'DELETE') return json(deleteDeck(env, ctx, did));
    }
    if (parts.length === 3) {
      if (c === 'duplicate' && method === 'POST') return json(duplicateDeck(env, ctx, did), 201);
      if (c === 'revisions' && method === 'GET') return json(listRevisions(env, ctx, did, 100));
      if (c === 'restore' && method === 'POST') return json(restoreRevision(env, ctx, did, (await body()).revision, 'person'));
      if (c === 'share' && method === 'PUT') return json(setShare(env, ctx, did, await body()));
      if (c === 'present' && method === 'GET') return json(presentDeck(env, ctx, did, url.searchParams.has('rev') ? int(url.searchParams.get('rev'), 1, 1, 1e9) : null), 200, { 'Cache-Control': 'no-store' });
    }
  }
  reject(404, 'not_found', 'No such API route.');
}

// Who you are and where you belong. The web app asks first; its answer keeps the team list's
// names and pictures current.
export function me(env, ctx, back) {
  const auth = env.holm.auth;
  const after = typeof back === 'string' && /^\/(?!\/)[\w\-./?=&#%]*$/.test(back) && !back.startsWith('/auth') ? back : '/';
  let admin = false;
  try { admin = !!(ctx.member && auth.isAppAdmin()); } catch { admin = false; }
  if (ctx.member) { try { refreshMember(env, ctx.member); } catch (error) { console.warn('refresh member', String(error && error.message || error).slice(0, 200)); } }
  return {
    signed_in: !!ctx.member,
    name: ctx.member ? ctx.member.name || '' : null,
    email: ctx.member ? ctx.member.email || '' : null,
    picture: ctx.member ? ctx.member.picture || '' : null,
    admin,
    login_url: auth.getLoginURL(after),
    logout_url: auth.getLogoutURL(),
    workspaces: myWorkspaces(env, ctx),
  };
}
