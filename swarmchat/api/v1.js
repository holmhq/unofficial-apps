// Upstream's wire protocol: POST /v1/<name> with a JSON body and `Authorization: Bearer <token>`, answers in JSON,
// refusals as {"error": "..."} with upstream's statuses. GET /v1/health answers without a token.
import { ADMIN, METHODS } from './agent.js';
import { DEFAULTS, Err, Swarm, UPSTREAM, VERSION, tokenOwner } from './store.js';

const SPECIAL = ['download', 'send_files'];
const VIEWS = ['view_info', 'view_snapshot', 'view_feed', 'view_messages', 'view_thread', 'view_receipts', 'view_posts',
  'view_search', 'view_activity', 'view_at', 'view_replay', 'view_as', 'view_knew', 'view_text', 'view_download'];
const EXPORT = ['export_page', 'export_file'];

export const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
});

export function health() {
  const { max_text, max_attachment, max_attachments } = DEFAULTS;
  return { ok: true, name: 'swarmchat', version: VERSION, upstream: UPSTREAM, limits: { max_text, max_attachment, max_attachments } };
}

export function bearer(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

const USER_TOKEN = 'Unknown token. Set SWARMCHAT_TOKEN or run `swarmchat login`.';

// Who makes this request, from its token alone, before the body is read. Admin requests take the swarm's admin
// token (the super admin, me = null) or a user's; everything else takes a user's.
export async function caller(env, name, token, request = null) {
  if (!(name in ADMIN) && !(name in METHODS) && !SPECIAL.includes(name) && !EXPORT.includes(name) && !VIEWS.includes(name)) {
    throw new Err(404, `There is no request named '${name}'.`);
  }
  const owner = await tokenOwner(env, token);
  if (VIEWS.includes(name)) {
    // A view key or the admin token, or a signed-in member of the swarm's workspace (any role).
    if (owner && (owner.user === '@view' || owner.user === '@admin')) return new Swarm(env, owner.row, null);
    if (!token && request) {
      const { viewerSwarm } = await import('./people.js');
      const row = viewerSwarm(env, request);
      if (row) return new Swarm(env, row, null);
    }
    throw new Err(401, 'This request needs a view key, or sign-in as a member of the swarm\'s workspace.');
  }
  if (EXPORT.includes(name)) {
    if (!owner || owner.user !== '@admin') throw new Err(401, "This request needs the swarm's admin token.");
    return new Swarm(env, owner.row, null);
  }
  if (name in ADMIN && owner?.user === '@admin') return new Swarm(env, owner.row, null);
  if (!owner || owner.user.startsWith('@')) {
    throw new Err(401, name in ADMIN ? 'This request needs the admin token, or the token of a user the rules allow.' : USER_TOKEN);
  }
  if (!owner.row.users?.[owner.user]) throw new Err(401, USER_TOKEN);
  return new Swarm(env, owner.row, owner.user);
}

export function failure(env, name, e) {
  if (e instanceof Err) return json(e.status, { error: e.message });
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600 && e.status !== 500) {
    return json(e.status === 409 ? 503 : e.status, { error: e.status === 503 || e.status === 409 ? 'The server is busy. Try again.' : String(e.message || e) });
  }
  env.holm.log.error(`v1 ${name}: ${e?.stack || e}`);
  if (e instanceof TypeError) return json(400, { error: `Bad request: ${e.message}` });
  return json(500, { error: "Server error. See the server's log." });
}

export async function v1(request, env, url) {
  const name = url.pathname.slice(4);
  if (name === 'health' && (request.method === 'GET' || request.method === 'HEAD')) return json(200, health());
  if (request.method !== 'POST') return json(404, { error: 'Not found.' });
  try {
    const s = await caller(env, name, bearer(request), request);
    if (name === 'send_files') {
      const { sendFiles } = await import('./files.js');
      return json(200, await sendFiles(s, request));
    }
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.length > s.settings.max_body) throw new Err(413, `The request is larger than ${s.settings.max_body} bytes.`);
    let params;
    try { params = raw.length ? JSON.parse(new TextDecoder().decode(raw)) : {}; } catch (e) { throw new Err(400, `Bad request: ${e.message}`); }
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Err(400, 'The request body must be a JSON object.');
    if (VIEWS.includes(name)) {
      const v = await import('./view.js');
      if (name === 'view_download') return v.viewDownload(s, params);
      return json(200, await v.VIEW[name](s, params));
    }
    if (EXPORT.includes(name)) {
      const ex = await import('./export.js');
      return name === 'export_file' ? ex.exportFile(s, params) : json(200, ex.exportPage(s, params));
    }
    let result;
    if (s.me === null || (name in ADMIN && !(name in METHODS))) {
      result = await ADMIN[name](s, params);
    } else {
      if (params.ack) { s.confirm(params.ack); delete params.ack; }
      if (name === 'download') return (await import('./files.js')).download(s, params);
      result = await METHODS[name](s, params);
    }
    return json(200, result);
  } catch (e) {
    return failure(env, name, e);
  }
}
