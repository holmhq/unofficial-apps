// Export: a swarm's whole history, a page at a time, for `swarmchat.mjs export DIR`, which writes it as an upstream
// data folder (FORMAT 1) that upstream's own `swarmchat view --data DIR` opens. Seqs here count messages only; the
// client renumbers them into upstream's log lines.
import { UPSTREAM, byIds, int } from './store.js';
import { json } from './v1.js';

const clean = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_') && k !== 'id' && k !== 'swarm') out[k] = v;
  return out;
};

function people(s) {
  const ids = [...Object.keys(s.row.users || {}), ...(s.row.retired || [])];
  const rows = byIds(s.ds, 'users', ids.map((u) => `${s.id}:${u}`));
  const users = [];
  const retired = [];
  const state = {};
  const cursorIds = [];
  for (const r of rows) {
    if (r.removed) retired.push({ id: r.user, deleted_at: r.removed });
    else {
      users.push({ id: r.user, name: r.name, fields: r.fields || {}, status: r.status || '', token_sha256: r.token_sha256, created_at: r.created_at });
      state[r.user] = { read: {}, notify: { ...(r.notify || {}) } };
      for (const c of r.chats || []) cursorIds.push(`${s.id}:${r.user}:${c}`);
    }
  }
  for (const c of byIds(s.ds, 'cursors', cursorIds)) if (state[c.user] && c.pos) state[c.user].read[c.chat] = c.pos;
  return { users, retired, state };
}

function chats(s) {
  const index = s.ds.findOne('swarm_chats', s.id);
  return byIds(s.ds, 'chats', index?.chats || []).map((c) => {
    const meta = { id: c.id, name: c.name ?? null, members: c.members, created_by: c.created_by, created_at: c.created_at };
    if (c.name) meta.managers = s.managers(c);
    if (c.public) meta.public = true;
    if (c.description) meta.description = c.description;
    if (c.archived) meta.archived = true;
    return meta;
  });
}

export function exportPage(s, p) {
  const after = int(p, 'after', 0);
  const limit = Math.max(1, Math.min(int(p, 'limit', 500), 1000));
  const total = s.ds.findOne('swarm_n', s.id)?.n || 0;
  const upto = Math.min(total, after + limit);
  const ids = [];
  for (let n = after + 1; n <= upto; n++) ids.push(`${s.id}:${n}`);
  const rows = byIds(s.ds, 'events', ids).sort((a, b) => a.n - b.n).filter((e) => e.chat);
  const messageIds = rows.filter((e) => e.kind === 'message').map((e) => `${e.chat}:${e.seq}`);
  const messages = new Map(byIds(s.ds, s.M, messageIds).map((m) => [m.id, m]));
  const events = rows.map((e) => {
    const out = clean(e);
    if (e.kind === 'message') {
      const m = messages.get(`${e.chat}:${e.seq}`);
      if (m) {
        if (m.deleted) out.deleted = true;
        else {
          out.text = m.original_text ?? m.text;
          if (m.attachments?.length) out.attachments = m.attachments;
          const mentions = m.original_mentions ?? m.mentions;
          if (mentions?.length) out.mentions = mentions;
        }
        if (m.reply_to) out.reply_to = m.reply_to;
      }
    }
    return out;
  });
  const page = { format: 1, upstream: UPSTREAM, swarm: { id: s.id, name: s.row.name, created_at: s.row.created_at }, events, next: upto < total ? upto : null };
  if (!after) Object.assign(page, people(s), { policy: s.row.rules || {}, chats: chats(s) });
  return page;
}

export function exportFile(s, p) {
  const sha = typeof p.sha256 === 'string' ? p.sha256 : '';
  const blob = /^[0-9a-f]{64}$/.test(sha) ? s.ds.findOne('blobs', `${s.id}:${sha}`) : null;
  const obj = blob ? s.env.holm.app.s3.get(blob.key) : null;
  if (!obj) return json(404, { error: `No stored file ${sha}.` });
  return new Response(obj.data, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
}
