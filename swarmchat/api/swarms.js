// A swarm's life: made, its admin token and view keys given out, deleted with everything in it.
import { DEFAULTS, Err, hex, messagesOf, now, sha256 } from './store.js';

const SETTINGS = ['max_text', 'max_page', 'default_notify', 'wait_guard', 'max_messages_day', 'quota', 'max_users', 'max_attachment', 'max_attachments'];

export function cleanSettings(given = {}) {
  const out = {};
  for (const k of SETTINGS) if (given[k] !== undefined) out[k] = given[k];
  if (out.default_notify !== undefined && !['all', 'mentions', 'none'].includes(out.default_notify)) throw new Err(400, 'default_notify is one of all, mentions, none.');
  for (const k of ['max_text', 'max_page', 'max_messages_day', 'quota', 'max_users', 'max_attachment', 'max_attachments']) {
    if (out[k] !== undefined && (!Number.isInteger(out[k]) || out[k] < 0)) throw new Err(400, `${k} must be a whole number of at least 0.`);
  }
  if (out.max_page === 0 || out.max_text === 0) throw new Err(400, 'max_page and max_text must be at least 1.');
  if (out.max_attachment !== undefined && out.max_attachment > DEFAULTS.max_attachment) out.max_attachment = DEFAULTS.max_attachment;
  if (out.max_attachments !== undefined && out.max_attachments > DEFAULTS.max_attachments) out.max_attachments = DEFAULTS.max_attachments;
  if (out.wait_guard !== undefined) out.wait_guard = !!out.wait_guard;
  return out;
}

// Makes a swarm and returns {swarm, admin_token}. The admin token is shown once and stored as its SHA-256.
export async function createSwarm(env, { workspace = null, name, settings = {}, created_by = null } = {}) {
  const { ds, kv } = env.holm.app;
  name = typeof name === 'string' ? name.trim() : '';
  if (!name || [...name].length > 80) throw new Err(400, 'A swarm name is 1 to 80 characters.');
  let id = 's' + hex(7);
  while (ds.findOne('swarms', id)) id = 's' + hex(7);
  const token = hex(32);
  const digest = await sha256(token);
  const row = {
    id, workspace, name, settings: cleanSettings(settings), rules: {}, users: {}, retired: [], viewer: 'v-' + hex(16),
    admin_sha256: digest, created_by, created_at: now(),
  };
  ds.transaction((tx) => {
    tx.insert('swarms', row);
    tx.insert('swarm_chats', { id, swarm: id, chats: [], channels: [] });
    tx.insert('swarm_n', { id, n: 0, bytes: 0 });
  });
  kv.set('tok:' + digest, { swarm: id, user: '@admin' });
  return { swarm: row, admin_token: token };
}

// A new admin token for the swarm. The old one stops working at once.
export async function rotateAdmin(env, swarm) {
  const { ds, kv } = env.holm.app;
  const token = hex(32);
  const digest = await sha256(token);
  ds.update('swarms', { id: swarm.id }, { $set: { admin_sha256: digest } });
  if (swarm.admin_sha256) kv.delete('tok:' + swarm.admin_sha256);
  kv.set('tok:' + digest, { swarm: swarm.id, user: '@admin' });
  return token;
}

const COLLECTIONS = ['events', 'cursors', 'reads', 'activity', 'files', 'blobs', 'names', 'chats', 'users'];

// Deletes a swarm and everything in it, a bounded batch per call: returns true when nothing is left.
export function deleteSwarm(env, swarm, budget = 3000) {
  const { ds, kv, s3 } = env.holm.app;
  const t0 = Date.now();
  if (!swarm.deleting) {
    ds.update('swarms', { id: swarm.id }, { $set: { deleting: now() } });
    if (swarm.admin_sha256) kv.delete('tok:' + swarm.admin_sha256);
    for (const k of swarm.view_keys || []) kv.delete('tok:' + k.sha256);
    for (const u of ds.find('users', { swarm: swarm.id }, { limit: 5000 })) if (u.token_sha256) kv.delete('tok:' + u.token_sha256);
  }
  for (const c of [messagesOf(swarm.id), ...COLLECTIONS]) {
    for (;;) {
      if (Date.now() - t0 > budget) return false;
      const rows = c.startsWith('msg.') ? ds.find(c, {}, { limit: 200 }) : ds.find(c, { swarm: swarm.id }, { limit: 200 });
      if (!rows.length) break;
      if (c === 'blobs') for (const b of rows) { try { s3.delete(b.key); } catch { /* gone already */ } }
      ds.transaction((tx) => { for (const r of rows) tx.delete(c, { id: r.id }); });
    }
  }
  ds.transaction((tx) => {
    tx.delete('swarm_chats', { id: swarm.id });
    tx.delete('swarm_n', { id: swarm.id });
    tx.delete('swarms', { id: swarm.id });
  });
  return true;
}
