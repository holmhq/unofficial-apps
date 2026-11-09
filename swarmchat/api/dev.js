// Development routes for the conformance run on a local node, behind the SWARMCHAT_DEV_KEY runtime secret. Without
// that secret (the default, and on any public node) every path here answers 404.
import { Err, hex, sha256 } from './store.js';
import { createSwarm, deleteSwarm } from './swarms.js';
import { json } from './v1.js';

export async function dev(request, env, url) {
  let key = null;
  try { key = env.holm.secrets.get('SWARMCHAT_DEV_KEY'); } catch { key = null; }
  if (!key || request.headers.get('x-dev-key') !== key || request.method !== 'POST') return json(404, { error: 'Not found.' });
  const p = await request.json().catch(() => ({}));
  try {
    if (url.pathname === '/dev/swarm') {
      const { swarm, admin_token } = await createSwarm(env, { name: p.name || 'test', settings: p.settings || {} });
      const view = hex(24);
      const digest = await sha256(view);
      env.holm.app.ds.update('swarms', { id: swarm.id }, { $set: { view_keys: [{ id: hex(4), label: 'test', sha256: digest, created_at: new Date().toISOString() }] } });
      env.holm.app.kv.set('tok:' + digest, { swarm: swarm.id, user: '@view' });
      return json(200, { swarm: swarm.id, admin_token, view_token: view });
    }
    if (url.pathname === '/dev/swarm/delete') {
      const swarm = env.holm.app.ds.findOne('swarms', p.swarm);
      if (!swarm) return json(200, { done: true });
      return json(200, { done: deleteSwarm(env, swarm) });
    }
    if (url.pathname === '/dev/swarm/settings') {
      const swarm = env.holm.app.ds.findOne('swarms', p.swarm);
      if (!swarm) throw new Err(404, 'No such swarm.');
      const settings = { ...swarm.settings, ...(p.settings || {}) };
      env.holm.app.ds.update('swarms', { id: swarm.id }, { $set: { settings } });
      return json(200, { settings });
    }
    if (url.pathname === '/dev/swarm/blobs') {
      const objects = env.holm.app.s3.list(`b/${p.swarm}/`) || [];
      const keys = (Array.isArray(objects) ? objects : objects.objects || objects.keys || []).map((o) => (typeof o === 'string' ? o : o.key || o.path));
      return json(200, { blobs: [...new Set(keys.map((k) => k.split('/')[2]))].sort() });
    }
    return json(404, { error: 'Not found.' });
  } catch (e) {
    if (e instanceof Err) return json(e.status, { error: e.message });
    return json(500, { error: String(e?.stack || e) });
  }
}
