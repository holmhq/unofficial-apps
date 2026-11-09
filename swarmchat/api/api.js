// The people-facing JSON routes under /api, for the web app. Holm sign-in decides who is asking; each route checks
// the caller's workspace role itself (people.js).
import * as P from './people.js';
import { Err, Swarm } from './store.js';
import { failure, json } from './v1.js';

async function body(request) {
  if (request.method === 'GET' || request.method === 'DELETE') return {};
  const text = await request.text();
  if (text.length > 65536) throw new Err(413, 'The request is too large.');
  try { return text ? JSON.parse(text) : {}; } catch { throw new Err(400, 'The request body must be JSON.'); }
}

export async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  try {
    if (path === '/api/me' && method === 'GET') return json(200, P.me(env, url));
    const parts = path.split('/').slice(2); // ['workspaces', id, …]
    if (parts[0] === 'invites' && parts[1] && method === 'GET') return json(200, await P.previewInvite(env, parts[1]));
    const me = P.requireWho(env);
    const input = await body(request);
    const [a, id, b, sub, c] = parts;
    if (a === 'invites' && id && b === 'accept' && method === 'POST') return json(200, await P.acceptInvite(env, me, id));
    if (a === 'workspaces' && !id && method === 'POST') return json(200, { workspace: P.createWorkspace(env, me, input) });
    if (a === 'workspaces' && id) {
      if (!b && method === 'GET') return json(200, P.workspace(env, me, id));
      if (!b && method === 'PATCH') return json(200, P.renameWorkspace(env, me, id, input));
      if (!b && method === 'DELETE') return json(200, P.deleteWorkspace(env, me, id));
      if (b === 'invites' && !sub && method === 'POST') return json(200, await P.inviteToWorkspace(env, me, id, input));
      if (b === 'invites' && sub && method === 'DELETE') return json(200, P.revokeInvite(env, me, id, sub));
      if (b === 'members' && sub && method === 'PATCH') return json(200, P.setRole(env, me, id, sub, input.role));
      if (b === 'members' && sub && method === 'DELETE') return json(200, P.removeMember(env, me, id, sub));
      if (b === 'swarms' && !sub && method === 'POST') return json(200, await P.newSwarm(env, me, id, input));
    }
    if (a === 'swarms' && id) {
      if (!b && method === 'GET') return json(200, P.swarmDetail(env, me, id));
      if (!b && method === 'PATCH') return json(200, P.renameSwarm(env, me, id, input));
      if (!b && method === 'DELETE') return json(200, P.removeSwarm(env, me, id));
      if (b === 'agents' && !sub && method === 'POST') return json(200, await P.addAgent(env, me, id, input));
      if (b === 'agents' && sub && !c && method === 'DELETE') return json(200, await P.removeAgent(env, me, id, sub));
      if (b === 'agents' && sub && c === 'token' && method === 'POST') return json(200, await P.rotateAgent(env, me, id, sub));
      if (b === 'admin-token' && method === 'POST') return json(200, await P.rotateAdminToken(env, me, id));
      if (b === 'view-keys' && !sub && method === 'POST') return json(200, await P.addViewKey(env, me, id, input));
      if (b === 'view-keys' && sub && method === 'DELETE') return json(200, P.revokeViewKey(env, me, id, sub));
      if (b === 'rules' && method === 'PUT') return json(200, P.setSwarmRules(env, me, id, input));
      if ((b === 'export_page' || b === 'export_file') && method === 'POST') {
        const { row } = P.swarmAccess(env, me, id, 'admin');
        const ex = await import('./export.js');
        const s = new Swarm(env, row, null);
        return b === 'export_file' ? ex.exportFile(s, input) : json(200, ex.exportPage(s, input));
      }
    }
    if (a === 'admin') {
      if (!id && method === 'GET') return json(200, P.adminOverview(env, me));
      if (id === 'caps' && method === 'PUT') return json(200, P.setCaps(env, me, input));
      if (id === 'invites' && !b && method === 'POST') return json(200, await P.inviteCreator(env, me));
      if (id === 'invites' && b && method === 'DELETE') return json(200, P.revokeCreatorInvite(env, me, b));
    }
    return json(404, { error: 'Not found.' });
  } catch (e) {
    return failure(env, `api ${method} ${path}`, e);
  }
}
