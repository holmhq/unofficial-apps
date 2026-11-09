// Storage and chat rules: upstream SwarmChat's store.py (5ee0c0e, MIT) on Holm DS, KV, S3 and realtime.
//
// DS indexes only (app, collection, id), so every hot path reads by id (proposal 001, Phase 0):
//   swarms       <swarm>                   name, workspace, settings, rules, users {id: {name, hint}}, retired [ids],
//                                          viewer channel, created_at
//   swarm_chats  <swarm>                   chats [ids], channels [ids]
//   swarm_n      <swarm>                   n: the number of the swarm's newest event
//   names        <swarm>:#<name>           a channel's name, lower case -> {chat}
//                <swarm>:dm:<hash>         a direct chat's exact members -> {chat}
//   users        <swarm>:<user>            name, fields, status, token_sha256, hint, chats [ids], notify {chat: level}
//   chats        <chat, 16 hex>            name|null, members, managers, created_by, created_at, public, archived,
//                                          description, seq (its newest message), msg_at, at (last activity),
//                                          spans {user: [[after, upto|null]]} (which seqs each member may read)
//   msg.<swarm>  <chat>:<seq>              (a message) from, at, text, mentions, reply_to, reply_to_from, parent, replies [seqs],
//                                          attachments, edited_at, deleted, reactions, edits [event n]
//   cursors      <swarm>:<user>:<chat>     pos, mine [[first, last] runs of my seqs after pos], ment [seqs after pos that mention me],
//                                          reads [[upto, at]] (the newest read moves: receipts)
//   events       <swarm>:<n>               upstream's log lines for every chat, in swarm order (feed, export)
//   files        <attachment id>           swarm, chat, seq, sha256, name, size, type, folder
//   blobs        <swarm>:<sha256>          refs, size, key (the S3 object)
// `seq` counts a chat's messages only, with no gaps, so a page is `id $in [<chat>:<n> …]` and unread counts are
// arithmetic. The export renumbers into upstream's log lines.

import { Policy } from './policy.js';

export const VERSION = '0.1.0';
export const UPSTREAM = '5ee0c0e';
export const DEFAULTS = {
  max_text: 20000, max_body: 1 << 20, max_attachment: 16 * 1024 * 1024, max_attachments: 20, max_page: 250,
  default_notify: 'all', quota: 0, wait_guard: true, max_messages_day: 20000,
};
export const LEVELS = ['all', 'mentions', 'none'];
export const USER_ID = /^[a-z0-9][a-z0-9._-]{0,39}$/;
export const MESSAGE_ID = /^([0-9a-f]{6,32}):(\d+)$/;
const READS_KEPT = 50;
const READS_PER_ROW = 100;
const WAIT_MESSAGES = 100;
const WORD = /[\p{L}\p{N}_-]/u;

export const messagesOf = (swarm) => `msg.${swarm}`;

export class Err extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const now = () => new Date().toISOString();

export function hex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let s = '';
  for (const x of d) s += x.toString(16).padStart(2, '0');
  return s;
}

export const list = (v) => (!v ? [] : (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : [String(v)])
  .map((s) => String(s).trim()).filter(Boolean));

export function int(p, key, d) {
  const v = p ? p[key] : undefined;
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n) || (typeof v !== 'number' && !/^\s*-?\d+\s*$/.test(String(v)))) throw new Err(400, `Bad request: ${key} must be a whole number.`);
  return Math.max(0, Math.trunc(n));
}

export function byIds(ds, collection, ids) {
  if (!ids.length) return [];
  if (ids.length === 1) { const r = ds.findOne(collection, ids[0]); return r ? [r] : []; }
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    out.push(...ds.find(collection, { id: { $in: part } }, { limit: part.length }));
  }
  return out;
}

// difflib.get_close_matches, near enough: similarity by longest common subsequence, cutoff 0.6.
function close(word, choices, n = 3) {
  const lcs = (a, b) => {
    const row = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let prev = 0;
      for (let j = 1; j <= b.length; j++) {
        const keep = row[j];
        row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
        prev = keep;
      }
    }
    return row[b.length];
  };
  return choices.map((c) => [2 * lcs(word, c) / (word.length + c.length || 1), c])
    .filter(([r]) => r >= 0.6).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, c]) => c);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// My own messages after my read position, as runs [first, last], so an agent that writes a lot stays one short list.
export const runs = (m) => (!m ? [] : m.length && typeof m[0] === 'number' ? m.map((x) => [x, x]) : m);
export const mineHas = (m, x) => runs(m).some(([a, b]) => a <= x && x <= b);
export function mineAdd(m, x) {
  const r = runs(m).map((y) => [...y]);
  const last = r[r.length - 1];
  if (last && last[1] === x - 1) last[1] = x; else r.push([x, x]);
  return r;
}
export const mineTrim = (m, pos) => runs(m).filter(([, b]) => b > pos).map(([a, b]) => [Math.max(a, pos + 1), b]);

// ------------------------------------------------------------------ the swarm a request acts on

export class Swarm {
  constructor(env, row, me) {
    this.env = env;
    this.ds = env.holm.app.ds;
    this.kv = env.holm.app.kv;
    this.row = row;
    this.id = row.id;
    this.settings = { ...DEFAULTS, ...(row.settings || {}) };
    this.me = me; // a user id, or null for the super admin (or a viewer)
    this._policy = null;
    this._users = new Map();
    this._chats = new Map();
    this._cursors = new Map();
    this._names = null;
    this.woken = new Set();
    this.events = 0;
  }

  // Each swarm's messages live in their own collection, so searching them never reaches another swarm's.
  get M() { return messagesOf(this.id); }

  get policy() {
    if (!this._policy) this._policy = new Policy(this.row.rules || {});
    return this._policy;
  }

  // ---------------------------------------------------------------- users

  get people() { return this.row.users || {}; }
  exists(u) { return Object.prototype.hasOwnProperty.call(this.people, u); }
  name(u) { return this.people[u]?.name ?? u; }

  names() {
    if (!this._names) {
      this._names = new Map();
      for (const p of Object.values(this.people)) {
        const k = p.name.toLowerCase();
        this._names.set(k, (this._names.get(k) || 0) + 1);
      }
    }
    return this._names;
  }

  // The name to show: the display name, with the id added when someone else has the same name.
  display(u) {
    const name = this.name(u);
    return (this.names().get(name.toLowerCase()) || 0) > 1 ? `${name} (${u})` : name;
  }

  user(u) {
    if (!this._users.has(u)) this._users.set(u, this.ds.findOne('users', `${this.id}:${u}`));
    return this._users.get(u);
  }

  loadUsers(ids) {
    const want = ids.filter((u) => !this._users.has(u));
    for (const r of byIds(this.ds, 'users', want.map((u) => `${this.id}:${u}`))) this._users.set(r.user, r);
    for (const u of want) if (!this._users.has(u)) this._users.set(u, null);
  }

  publicUser(u) {
    const r = this.exists(u) ? this.user(u) : null;
    if (!r) return { id: u, name: u, fields: {}, status: '' };
    return { id: r.user, name: r.name, fields: r.fields || {}, status: r.status || '' };
  }

  // A user id from an id or a display name, in any case.
  userRef(ref) {
    ref = String(ref).trim().replace(/^@+/, '');
    const low = ref.toLowerCase();
    if (this.exists(low)) return low;
    const hits = Object.entries(this.people).filter(([, p]) => p.name.toLowerCase() === low).map(([u]) => u);
    if (hits.length === 1) return hits[0];
    if (hits.length) throw new Err(400, `Several people are named ${ref}: ${hits.join(', ')}. Use the id.`);
    const near = close(ref, [...Object.values(this.people).map((p) => p.name), ...Object.keys(this.people)]);
    throw new Err(404, `No one called '${ref}'.` + (near.length ? ` Did you mean ${near.join(', ')}?` : ''));
  }

  requireMe() {
    if (this.me !== null && !this.exists(this.me)) throw new Err(401, 'This user no longer exists.');
  }

  // ---------------------------------------------------------------- chats

  chat(id) {
    if (!this._chats.has(id)) {
      const c = this.ds.findOne('chats', id);
      this._chats.set(id, c && c.swarm === this.id ? c : null);
    }
    return this._chats.get(id);
  }

  loadChats(ids) {
    const want = [...new Set(ids)].filter((id) => !this._chats.has(id));
    for (const c of byIds(this.ds, 'chats', want)) if (c.swarm === this.id) this._chats.set(c.id, c);
    for (const id of want) if (!this._chats.has(id)) this._chats.set(id, null);
    return ids.map((id) => this._chats.get(id)).filter(Boolean);
  }

  forget(chat) { this._chats.delete(chat.id || chat); }

  myChats(user = this.me) {
    const row = this.user(user);
    return this.loadChats(row?.chats || []).filter((c) => c.members.includes(user));
  }

  alias(key) { return this.ds.findOne('names', `${this.id}:${key}`); }

  channelNamed(name) {
    const a = this.alias('#' + name.toLowerCase());
    return a ? this.chat(a.chat) : null;
  }

  managers(chat) {
    if (!chat.name) return [];
    return (chat.managers ?? [chat.created_by]).filter((u) => chat.members.includes(u));
  }

  title(chat, me = this.me) {
    return chat.name ? `#${chat.name}` : chat.members.filter((u) => u !== me).map((u) => this.display(u)).join(', ');
  }

  member(chat, me = this.me) {
    this.requireMe();
    if (!chat.members.includes(me)) {
      const how = chat.public ? 'It is public, so you can join it.' : 'Ask one of its members to add you.';
      throw new Err(403, `You are not in #${chat.name}. ${how}`);
    }
    return chat;
  }

  open(chat) {
    if (chat.archived) throw new Err(403, `#${chat.name} is archived, so nothing in it can change. Unarchive it first.`);
  }

  require(action, chat = null) {
    const refusal = this.policy.check(action, this.policy.roles(this.me, chat ? this.managers(chat) : null));
    if (refusal) throw new Err(403, refusal);
  }

  // ---------------------------------------------------------------- what each member may read

  limited(chat) { return !!chat.name && this.policy.history === 'while_member'; }

  // [lo, hi] seq ranges, inclusive, of the messages after `after` and before `before` that `me` may read.
  ranges(me, chat, after = 0, before = null) {
    const top = before === null || before === undefined ? chat.seq : Math.min(chat.seq, before - 1);
    const lo = after + 1;
    if (me === null || !this.limited(chat)) return lo <= top ? [[lo, top]] : [];
    const out = [];
    for (const [a, b] of chat.spans?.[me] || []) {
      const s = Math.max(lo, a + 1);
      const e = Math.min(top, b ?? Infinity);
      if (s <= e) out.push([s, e]);
    }
    return out;
  }

  *seqs(me, chat, after = 0, before = null, newest = false) {
    const rs = this.ranges(me, chat, after, before);
    if (newest) { for (let i = rs.length - 1; i >= 0; i--) for (let s = rs[i][1]; s >= rs[i][0]; s--) yield s; }
    else for (const [a, b] of rs) for (let s = a; s <= b; s++) yield s;
  }

  count(me, chat) { return this.ranges(me, chat).reduce((n, [a, b]) => n + b - a + 1, 0); }

  sees(me, chat, seq) {
    if (me === null || !this.limited(chat)) return true;
    return (chat.spans?.[me] || []).some(([a, b]) => a < seq && (b === null || b === undefined || seq <= b));
  }

  // ---------------------------------------------------------------- read positions

  cursorId(user, chat) { return `${this.id}:${user}:${chat.id || chat}`; }

  cursor(chat, user = this.me) {
    const id = this.cursorId(user, chat);
    if (!this._cursors.has(id)) this._cursors.set(id, this.ds.findOne('cursors', id));
    return this._cursors.get(id) || { id, pos: 0, mine: [], ment: [], reads: [], missing: true };
  }

  loadCursors(pairs) {
    const want = [...new Set(pairs.map(([u, c]) => this.cursorId(u, c)))].filter((id) => !this._cursors.has(id));
    for (const r of byIds(this.ds, 'cursors', want)) this._cursors.set(r.id, r);
    for (const id of want) if (!this._cursors.has(id)) this._cursors.set(id, null);
  }

  position(chat, user = this.me) { return this.cursor(chat, user).pos || 0; }

  level(chat, user = this.me) {
    return this.user(user)?.notify?.[chat.id] ?? this.settings.default_notify;
  }

  // How many messages after my read position, from others, I may read. Counted without listing them.
  unread(chat, me = this.me) {
    const cur = this.cursor(chat, me);
    const pos = cur.pos || 0;
    let n = 0;
    for (const [a, b] of this.ranges(me, chat, pos)) n += b - a + 1;
    for (const [a, b] of mineTrim(cur.mine, pos)) {
      for (const [lo, hi] of this.ranges(me, chat, a - 1, b + 1)) n -= hi - lo + 1;
    }
    return Math.max(0, n);
  }

  // Whether a message after my read position that I may read mentions me.
  mentioned(chat, me = this.me) {
    const cur = this.cursor(chat, me);
    return (cur.ment || []).some((s) => s > (cur.pos || 0) && this.sees(me, chat, s));
  }

  own(chat, seq, me = this.me) {
    const cur = this.cursor(chat, me);
    return seq > (cur.pos || 0) ? mineHas(cur.mine, seq) : null; // null: unknown, read the row
  }

  // When `user` first read up to `seq` here, from the read moves: the newest from the cursor, older ones from their
  // rows. null when they have not.
  readAt(chat, user, seq) {
    const cur = this.cursor(chat, user);
    const tail = cur.reads || [];
    if (tail.length && tail[0][0] < seq) {
      for (const [upto, at] of tail) if (upto >= seq) return at;
      return null;
    }
    const chunks = cur.chunks || [];
    if (!chunks.length) {
      for (const [upto, at] of tail) if (upto >= seq) return at;
      return null;
    }
    let i = 0;
    while (i + 1 < chunks.length && chunks[i + 1][0] < seq) i++;
    for (const [upto, at] of this.readChunk(cur.id, i)) if (upto >= seq) return at;
    return i + 1 < chunks.length ? chunks[i + 1][1] : null;
  }

  readChunk(cursorId, k) {
    this._chunks = this._chunks || new Map();
    const id = `${cursorId}:${k}`;
    if (!this._chunks.has(id)) this._chunks.set(id, this.ds.findOne('reads', id)?.entries || []);
    return this._chunks.get(id);
  }

  // (how far `user` had read, when that read happened) at the time `at`: (0, null) if nothing by then.
  positionAt(chat, user, at) {
    const cur = this.cursor(chat, user);
    const chunks = cur.chunks || [];
    if (!chunks.length || chunks[0][1] > at) return [0, null];
    let i = 0;
    while (i + 1 < chunks.length && chunks[i + 1][1] <= at) i++;
    let found = [0, null];
    for (const [upto, t] of this.readChunk(cur.id, i)) { if (t > at) break; found = [upto, t]; }
    return found;
  }

  // ---------------------------------------------------------------- messages

  messageRows(chat, seqs) {
    const rows = byIds(this.ds, this.M, seqs.map((s) => `${chat.id}:${s}`));
    const at = new Map(rows.map((r) => [r.seq, r]));
    return seqs.map((s) => at.get(s)).filter(Boolean);
  }

  // A message as members see it: with its id, and later edits, deletion and reactions applied.
  view(chat, m) {
    const out = { id: `${chat.id}:${m.seq}`, chat: chat.id, seq: m.seq, kind: 'message', from: m.from, text: m.text, at: m.at };
    if (m.edited_at) out.edited_at = m.edited_at;
    if (m.mentions !== undefined && m.mentions !== null) out.mentions = m.mentions;
    if (m.reply_to) out.reply_to = m.reply_to;
    if (m.attachments?.length) out.attachments = m.attachments.map(({ sha256: _h, ...a }) => a);
    if (m.reply_to_from) out.reply_to_from = m.reply_to_from;
    if (m.deleted) { out.text = ''; out.deleted = true; delete out.attachments; }
    const reactions = {};
    for (const [emoji, users] of Object.entries(m.reactions || {})) if (users.length) reactions[emoji] = users;
    if (Object.keys(reactions).length) out.reactions = reactions;
    return out;
  }

  // A message for `me` to see. On my own messages: who has read them and when (read receipts).
  message(chat, m, me = this.me) {
    const out = this.view(chat, m);
    out.from_name = this.display(m.from);
    if (me && m.parent && !this.sees(me, chat, m.parent)) { delete out.reply_to; delete out.reply_to_from; }
    if (me && m.from === me) {
      this.loadCursors(chat.members.filter((u) => u !== me).map((u) => [u, chat]));
      out.read_by = [];
      out.unread_by = [];
      for (const u of chat.members) {
        if (u === me) continue;
        const at = this.readAt(chat, u, m.seq);
        if (at || this.position(chat, u) >= m.seq) out.read_by.push({ id: u, name: this.display(u), at });
        else out.unread_by.push(u);
      }
    }
    return out;
  }

  named(chat, m) { return { ...this.view(chat, m), from_name: this.display(m.from) }; }

  // (chat, the stored message) for a message id the caller can see. me=null sees every chat.
  find(ref, me = this.me) {
    const match = MESSAGE_ID.exec(String(ref || '').trim());
    const chat = match && this.chat(match[1]);
    const seq = match ? Number(match[2]) : 0;
    const row = chat && (me === null || chat.members.includes(me)) && seq >= 1 && seq <= chat.seq
      && this.sees(me, chat, seq) ? this.ds.findOne(this.M, `${chat.id}:${seq}`) : null;
    if (!row) throw new Err(404, `No message ${ref} in your chats.`);
    return [chat, row];
  }

  // The newest message I may read in a chat, as stored.
  last(chat, me = this.me) {
    if (!chat.seq) return null;
    const newest = this.seqs(me, chat, 0, null, true).next();
    if (newest.done) return null;
    return this.ds.findOne(this.M, `${chat.id}:${newest.value}`);
  }

  summary(chat, me = this.me, last) {
    if (last === undefined) last = this.last(chat, me);
    return {
      id: chat.id, kind: chat.name ? 'channel' : 'direct', name: chat.name ?? null, description: chat.description || '',
      public: !!chat.public, archived: !!chat.archived, managers: this.managers(chat), title: this.title(chat, me),
      members: chat.members.map((u) => ({ id: u, name: this.display(u) })),
      unread: this.unread(chat, me), mentioned: this.mentioned(chat, me), notify: this.level(chat, me),
      last_at: chat.at, last: last ? this.message(chat, last, me) : null,
    };
  }

  // Summaries for many chats with one read each for cursors and newest messages.
  summaries(chats, me = this.me) {
    this.loadCursors(chats.map((c) => [me, c]));
    const ids = [];
    const newest = new Map();
    for (const c of chats) {
      const n = c.seq ? this.seqs(me, c, 0, null, true).next() : { done: true };
      if (!n.done) { newest.set(c.id, n.value); ids.push(`${c.id}:${n.value}`); }
    }
    const rows = new Map(byIds(this.ds, this.M, ids).map((r) => [r.chat, r]));
    return chats.map((c) => this.summary(c, me, rows.get(c.id) || null));
  }

  titles(messages) {
    const out = {};
    for (const m of messages) {
      const c = this.chat(m.chat);
      if (c) out[m.chat] = { title: this.title(c), name: c.name ?? null };
    }
    return out;
  }

  // ---------------------------------------------------------------- writing

  // Runs fn(tx, log) in one transaction. log(chat, kind, fields) appends an event to the swarm's history.
  // Runs fn(tx, log, meta) in one transaction. log(chat, kind, fields) appends an event to the swarm's history; meta is
  // the swarm's counters row (n, bytes, first_at, last_at), saved if fn changes it.
  write(fn) {
    let written = 0;
    const result = this.ds.transaction((tx) => {
      const counter = tx.findOne('swarm_n', this.id);
      const meta = { n: 0, bytes: 0, ...(counter || {}) };
      const before = JSON.stringify(meta);
      const log = (chat, kind, fields = {}) => {
        meta.n += 1;
        tx.insert('events', { ...fields, id: `${this.id}:${meta.n}`, swarm: this.id, n: meta.n, chat: chat ? chat.id || chat : null, kind });
        return meta.n;
      };
      this._meta = meta;
      let out;
      try { out = fn(tx, log, meta); } finally { this._meta = null; }
      if (JSON.stringify(meta) !== before) {
        if (meta.n !== (counter?.n || 0)) written = meta.n;
        const { id: _i, _rev, _createdAt, _updatedAt, ...fields } = meta;
        if (counter) tx.update('swarm_n', { id: this.id }, { $set: fields });
        else tx.insert('swarm_n', { id: this.id, ...fields });
      }
      return out;
    });
    this._cursors.clear();
    if (written) this.events = written;
    return result;
  }

  // A system line (created, added, renamed …): an event, and its place in the chat's list of them, at the message
  // count it came after, so the viewer can show it between the right messages.
  system(tx, log, chat, kind, fields) {
    const n = log(chat, kind, { ...fields, at_seq: chat.seq || 0 });
    const c = tx.findOne('chats', chat.id);
    const list = [...(c?.system || []), [n, chat.seq || 0]];
    if (c) tx.update('chats', { id: chat.id }, { $set: { system: list, n } });
    chat.system = list;
    chat.n = n;
    return n;
  }

  // Wakes waiting agents (content-free) and the swarm's viewers, after the write has landed.
  wake(users, except = null) {
    for (const u of users) {
      if (u === except || this.woken.has(u)) continue;
      this.woken.add(u);
      const hint = this.people[u]?.hint;
      if (hint) { try { this.env.holm.realtime.broadcast(hint, { type: 'wake' }); } catch { /* best effort */ } }
    }
    this.feed();
  }

  feed() {
    if (!this.events || !this.row.viewer) return;
    try { this.env.holm.realtime.broadcast(this.row.viewer, { type: 'feed', n: this.events }); } catch { /* best effort */ }
  }

  // Moves read positions forward and writes a read event for each: the receipts. marks: [[chat, seq]].
  markRead(marks, user = this.me) {
    const todo = [];
    for (const [chat, s] of marks) {
      const seq = Math.min(s, chat.seq || 0);
      if (seq > this.position(chat, user)) todo.push([chat, seq]);
    }
    if (!todo.length) return;
    const at = now();
    this.write((tx, log) => {
      for (const [chat, seq] of todo) {
        const id = this.cursorId(user, chat);
        const cur = tx.findOne('cursors', id);
        if (cur && seq <= (cur.pos || 0)) continue;
        log(chat, 'read', { from: user, at, upto: seq });
        const reads = [...(cur?.reads || []), [seq, at]].slice(-READS_KEPT);
        const fields = {
          pos: seq, mine: mineTrim(cur?.mine, seq), ment: (cur?.ment || []).filter((s) => s > seq), reads, at,
        };
        // The whole history of read moves, a hundred to a row, for receipts on old messages and "what had it read".
        let rk = cur?.rk ?? 0;
        let chunks = cur?.chunks || [];
        const chunkId = (k) => `${id}:${k}`;
        const row = chunks.length ? tx.findOne('reads', chunkId(rk)) : null;
        if (row && row.entries.length < READS_PER_ROW) {
          tx.update('reads', { id: row.id }, { $set: { entries: [...row.entries, [seq, at]] } });
        } else {
          if (row) rk += 1;
          tx.insert('reads', { id: chunkId(rk), swarm: this.id, user, chat: chat.id, k: rk, entries: [[seq, at]] });
          chunks = [...chunks, [seq, at]];
        }
        Object.assign(fields, { rk, chunks });
        if (cur) tx.update('cursors', { id }, { $set: fields });
        else tx.insert('cursors', { id, swarm: this.id, user, chat: chat.id, ...fields });
      }
    });
  }

  // How far my read position may move once the messages `shown` reached me: past each unread message up to the
  // first one not shown. A message a search or filter left out stays unread.
  shownUpto(chat, shown, me = this.me) {
    let upto = 0;
    const pos = this.position(chat, me);
    const mine = this.cursor(chat, me).mine;
    for (const s of this.seqs(me, chat, pos)) {
      if (mineHas(mine, s)) continue;
      if (!shown.has(s)) break;
      upto = s;
    }
    return upto;
  }

  markShown(shown, me = this.me) {
    const marks = [];
    const chats = this.loadChats(Object.keys(shown || {}));
    this.loadCursors(chats.map((c) => [me, c]));
    for (const chat of chats) {
      if (!chat.members.includes(me)) continue;
      const seqs = shown[chat.id];
      if (!Array.isArray(seqs)) throw new Err(400, 'shown is {chat: [message seqs]}.');
      const upto = this.shownUpto(chat, new Set(seqs.map(Number)), me);
      if (upto) marks.push([chat, upto]);
    }
    this.markRead(marks, me);
  }

  // Marks read up to these positions ({chat: seq}), in the chats I am still in.
  confirm(positions, me = this.me) {
    if (!positions || typeof positions !== 'object' || Array.isArray(positions)) return;
    const chats = this.loadChats(Object.keys(positions));
    this.loadCursors(chats.map((c) => [me, c]));
    const marks = [];
    for (const chat of chats) {
      const seq = Number(positions[chat.id]);
      if (chat.members.includes(me) && Number.isFinite(seq)) marks.push([chat, Math.trunc(seq)]);
    }
    this.markRead(marks, me);
  }

  // ---------------------------------------------------------------- finding and making chats

  // A chat from its id, a channel's name (with or without #), or people: one person, or several separated by
  // commas, meaning the direct chat with exactly them. With create, a missing direct chat is made.
  async chatRef(ref, create = false) {
    this.requireMe();
    const me = this.me;
    ref = String(ref ?? '').trim();
    if (/^[0-9a-f]{6,32}$/.test(ref)) {
      const c = this.chat(ref);
      if (c && c.members.includes(me)) return c;
    }
    const bare = ref.replace(/^#+/, '').trim();
    let channel = bare ? this.channelNamed(bare) : null;
    if (channel && !channel.public && !channel.members.includes(me)) channel = null;
    if (ref.startsWith('#')) {
      if (!channel) throw new Err(404, `There is no channel ${ref}.`);
      return this.member(channel);
    }
    let people;
    try {
      people = [...new Set([me, ...ref.split(',').filter((p) => p.trim()).map((p) => this.userRef(p))])].sort();
    } catch (e) {
      if (!(e instanceof Err)) throw e;
      if (channel) return this.member(channel);
      throw new Err(404, `No channel or person '${ref}'. ${e.message}`);
    }
    if (channel) throw new Err(400, `'${ref}' is both a channel and a person. Write #${channel.name} for the channel.`);
    if (people.length < 2) throw new Err(400, 'Name at least one other person.');
    const key = 'dm:' + (await sha256(people.join(','))).slice(0, 40);
    const found = this.alias(key);
    if (found && this.chat(found.chat)) return this.chat(found.chat);
    if (!create) throw new Err(404, `You have no chat with exactly ${people.filter((u) => u !== me).join(', ')} yet.`);
    const refusal = this.policy.create(me, people);
    if (refusal) throw new Err(403, refusal);
    return this.newChat(people, null, { key });
  }

  channelName(name) {
    name = typeof name === 'string' ? name.trim().replace(/^#+/, '').trim() : '';
    if (!name || [...name].length > 80 || name.includes(',')) throw new Err(400, 'A channel name is 1 to 80 characters, without commas.');
    return name;
  }

  description(text) {
    if (text === undefined || text === null || text === '' || text === false) return '';
    if (typeof text !== 'string' || [...text.trim()].length > 1000) throw new Err(400, 'A channel description is text, up to 1,000 characters.');
    return text.trim();
  }

  // Channel names are unique in the swarm, and never someone's id or name. A private channel's members learn which
  // channel took a name. Anyone else learns only that it is taken.
  nameFree(name, chat = null) {
    const taken = this.channelNamed(name);
    if (taken && taken.id !== chat?.id) {
      if (!taken.public && !taken.members.includes(this.me)) throw new Err(400, `The name #${name} is taken. Pick another name.`);
      const how = taken.archived ? 'It is archived. Unarchive it' : taken.public ? 'Join it' : 'Ask one of its members to add you';
      throw new Err(400, `There is already a channel #${taken.name} (${taken.id}). ${how}, or pick another name.`);
    }
    if (this.exists(name.toLowerCase()) || (this.names().get(name.toLowerCase()) || 0) > 0) {
      throw new Err(400, `'${name}' is someone's name. Pick another name for the channel.`);
    }
  }

  newChat(members, name, { key, isPublic = false, description = '' } = {}) {
    const me = this.me;
    const aliasId = `${this.id}:${name ? '#' + name.toLowerCase() : key}`;
    const at = now();
    const made = this.write((tx, log) => {
      const again = tx.findOne('names', aliasId);
      if (again) {
        if (name) throw new Err(400, `The name #${name} is taken. Pick another name.`);
        return { existing: again.chat };
      }
      let id = hex(8);
      while (tx.findOne('chats', id)) id = hex(8);
      const spans = {};
      for (const u of members) spans[u] = [[0, null]];
      const chat = {
        id, swarm: this.id, name: name ?? null, members, created_by: me, created_at: at, public: !!isPublic,
        archived: false, description: description || '', seq: 0, msg_at: '', at, spans,
      };
      if (name) chat.managers = [me];
      tx.insert('chats', chat);
      tx.insert('names', { id: aliasId, swarm: this.id, chat: id });
      for (const u of members) {
        const cid = this.cursorId(u, id);
        if (!tx.findOne('cursors', cid)) tx.insert('cursors', { id: cid, swarm: this.id, user: u, chat: id, pos: 0, mine: [], ment: [], reads: [] });
        const row = tx.findOne('users', `${this.id}:${u}`);
        if (row) tx.update('users', { id: row.id }, { $set: { chats: [...(row.chats || []), id] } });
      }
      const index = tx.findOne('swarm_chats', this.id);
      const chats = [...(index?.chats || []), id];
      const channels = name ? [...(index?.channels || []), id] : index?.channels || [];
      if (index) tx.update('swarm_chats', { id: this.id }, { $set: { chats, channels } });
      else tx.insert('swarm_chats', { id: this.id, swarm: this.id, chats, channels });
      const shown = {};
      if (isPublic) shown.public = true;
      if (description) shown.description = description;
      this.system(tx, log, chat, 'created', { from: me, at, members, name: name ?? null, ...shown });
      return { chat };
    });
    for (const u of members) this._users.delete(u);
    if (made.existing) return this.chat(made.existing);
    this._chats.set(made.chat.id, made.chat);
    this.feed();
    return made.chat;
  }

  // A chat's fresh row inside a transaction, after a check that it still belongs here.
  fresh(tx, chat) {
    const c = tx.findOne('chats', chat.id);
    if (!c) throw new Err(404, 'That chat is gone.');
    return c;
  }

  setChat(tx, chat, fields) {
    tx.update('chats', { id: chat.id }, { $set: fields });
    Object.assign(chat, fields);
    this._chats.set(chat.id, chat);
  }

  changeMembers(chat, add = [], remove = []) {
    const me = this.me;
    if (!chat.name) throw new Err(400, 'The members of a direct chat are fixed. Make a channel for a group whose members change.');
    add = [...new Set(add.map((u) => this.userRef(u)))].filter((u) => !chat.members.includes(u));
    remove = [...new Set(remove.map((u) => this.userRef(u)))].filter((u) => chat.members.includes(u));
    if (add.some((u) => u !== me)) this.require('add_members', chat);
    if (remove.some((u) => u !== me)) this.require('remove_members', chat);
    const refusal = add.length ? this.policy.add(me, chat.members, add) : null;
    if (refusal) throw new Err(403, refusal);
    if (!add.length && !remove.length) return chat;
    const at = now();
    const before = [...chat.members];
    this.write((tx, log) => {
      const c = this.fresh(tx, chat);
      if (add.length && c.archived) this.open(c);
      const spans = { ...(c.spans || {}) };
      for (const u of add) spans[u] = [...(spans[u] || []), [c.seq, null]];
      for (const u of remove) {
        const s = (spans[u] || []).map((x) => [...x]);
        if (s.length && (s[s.length - 1][1] === null || s[s.length - 1][1] === undefined)) s[s.length - 1][1] = c.seq;
        spans[u] = s;
      }
      const members = [...new Set([...c.members, ...add])].filter((u) => !remove.includes(u)).sort();
      const fields = { members, spans, at };
      if (remove.length) fields.managers = this.managers(c).filter((u) => !remove.includes(u));
      this.setChat(tx, chat, { ...c, ...fields });
      if (add.length) this.system(tx, log, chat, 'added', { from: me, at, users: add });
      if (remove.length) this.system(tx, log, chat, 'removed', { from: me, at, users: remove });
      for (const u of add) {
        const cid = this.cursorId(u, chat);
        if (!tx.findOne('cursors', cid)) tx.insert('cursors', { id: cid, swarm: this.id, user: u, chat: chat.id, pos: 0, mine: [], ment: [], reads: [] });
      }
      for (const u of [...add, ...remove]) {
        const row = tx.findOne('users', `${this.id}:${u}`);
        if (!row) continue;
        const chats = (row.chats || []).filter((id) => id !== chat.id);
        if (add.includes(u)) chats.push(chat.id);
        tx.update('users', { id: row.id }, { $set: { chats } });
      }
    });
    for (const u of [...add, ...remove]) this._users.delete(u);
    this.wake([...before, ...add, ...remove]);
    return chat;
  }

  // Joins a public channel, by its name or id. A private one takes being added by a member.
  join(ref) {
    this.requireMe();
    const me = this.me;
    ref = String(ref ?? '').trim();
    const bare = ref.replace(/^#+/, '').trim();
    const chat = (/^[0-9a-f]{6,32}$/.test(ref) ? this.chat(ref) : null) || (bare ? this.channelNamed(bare) : null);
    if (!chat || !chat.name || (!chat.public && !chat.members.includes(me))) throw new Err(404, `There is no channel ${ref}.`);
    if (chat.members.includes(me)) return chat;
    const refusal = this.policy.join(me, chat.members);
    if (refusal) throw new Err(403, refusal);
    return this.changeMembers(chat, [me]);
  }

  // A one-line change to a channel (visibility, name, description, managers, archived) with its event.
  change(chat, kind, fields, event = {}) {
    const at = now();
    this.write((tx, log) => {
      const c = this.fresh(tx, chat);
      this.setChat(tx, chat, { ...c, ...fields, at });
      this.system(tx, log, chat, kind, { from: this.me, at, ...event });
    });
    this.feed();
  }

  setPublic(chat, isPublic) {
    if (!chat.name) throw new Err(400, 'Only a channel can be public. A direct chat holds exactly its members.');
    this.require(isPublic ? 'make_public' : 'make_private', chat);
    this.open(chat);
    if (!!chat.public === isPublic) return;
    this.change(chat, 'visibility', { public: isPublic }, { public: isPublic });
  }

  rename(chat, name) {
    if (!chat.name) throw new Err(400, 'Only a channel has a name. Make a channel to name a group.');
    name = this.channelName(name);
    this.require('rename_channel', chat);
    const posters = this.policy.posters;
    if (posters && posters.has(chat.name.toLowerCase()) && name.toLowerCase() !== chat.name.toLowerCase()) {
      throw new Err(403, `The rules name #${chat.name} for who may post in it, so it keeps its name: a new one `
        + `would drop the rule. Naming it by its id, ${chat.id}, in the rules allows renaming.`);
    }
    this.open(chat);
    this.nameFree(name, chat);
    const at = now();
    const oldId = `${this.id}:#${chat.name.toLowerCase()}`;
    const newId = `${this.id}:#${name.toLowerCase()}`;
    this.write((tx, log) => {
      const c = this.fresh(tx, chat);
      if (oldId !== newId) {
        if (tx.findOne('names', newId)) throw new Err(400, `The name #${name} is taken. Pick another name.`);
        tx.delete('names', { id: oldId });
        tx.insert('names', { id: newId, swarm: this.id, chat: chat.id });
      }
      this.setChat(tx, chat, { ...c, name, at });
      this.system(tx, log, chat, 'renamed', { from: this.me, at, name });
    });
    this.feed();
  }

  describe(chat, description) {
    if (!chat.name) throw new Err(400, 'Only a channel has a description. A direct chat is described by its members.');
    description = this.description(description);
    this.require('describe_channel', chat);
    this.open(chat);
    if ((chat.description || '') === description) return;
    this.change(chat, 'described', { description }, { description });
  }

  setManagers(chat, add = [], remove = []) {
    if (!chat.name) throw new Err(400, 'Only a channel has managers. A direct chat has only its members.');
    this.require('set_managers', chat);
    add = [...new Set(add.map((u) => this.userRef(u)))];
    remove = [...new Set(remove.map((u) => this.userRef(u)))];
    this.open(chat);
    const strangers = add.filter((u) => !chat.members.includes(u));
    if (strangers.length) throw new Err(400, `${strangers.join(', ')} ${strangers.length === 1 ? 'is' : 'are'} not in #${chat.name}. Add them first.`);
    const current = this.managers(chat);
    add = add.filter((u) => !current.includes(u));
    remove = remove.filter((u) => current.includes(u));
    if (!add.length && !remove.length) return;
    const managers = [...new Set([...current, ...add])].filter((u) => !remove.includes(u)).sort();
    this.change(chat, 'managers', { managers }, { ...(add.length ? { added: add } : {}), ...(remove.length ? { removed: remove } : {}) });
  }

  archive(chat, archived) {
    if (!chat.name) throw new Err(400, 'Only a channel can be archived. A direct chat stays as it is.');
    this.require('archive_channel', chat);
    if (!!chat.archived === archived) return;
    this.change(chat, archived ? 'archived' : 'unarchived', { archived });
  }

  // ---------------------------------------------------------------- messages

  // Members the text mentions: @id, @Full Name, @First when no one else in the chat has that first name, or @all.
  // A mention that could mean two members is refused, so the sender writes the id instead.
  mentions(chat, text, sender) {
    let work = text.toLowerCase();
    const others = chat.members.filter((u) => u !== sender);
    if (/@(all|everyone|here|channel)\b/.test(work)) return others;
    const found = new Set();
    const hit = (word) => {
      const re = new RegExp(`@${escapeRe(word)}(?![\\p{L}\\p{N}_-])`, 'gu');
      if (!re.test(work)) return false;
      work = work.replace(re, ' ');
      return true;
    };
    for (const u of [...others].sort((a, b) => b.length - a.length)) if (hit(u)) found.add(u);
    for (const part of ['full', 'first']) {
      const groups = new Map();
      for (const u of others) {
        const words = this.name(u).toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        const k = part === 'full' ? words.join(' ') : words[0];
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(u);
      }
      for (const k of [...groups.keys()].sort((a, b) => b.length - a.length)) {
        const re = new RegExp(`@${escapeRe(k)}(?![\\p{L}\\p{N}_-])`, 'u');
        if (!re.test(work)) continue;
        if (groups.get(k).length > 1) {
          const ids = groups.get(k).map((u) => `@${u}`).join(' or ');
          throw new Err(400, `@${k} could mean ${ids}. Write ${ids} instead.`);
        }
        found.add(groups.get(k)[0]);
        hit(k);
      }
    }
    return [...found].sort();
  }

  messageCap() {
    const cap = this.settings.max_messages_day;
    if (!cap) return null;
    const key = `day:${this.id}:${now().slice(0, 10)}`;
    const n = this.kv.get(key) || 0;
    if (n >= cap) throw new Err(429, `This swarm has sent its ${String(cap).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} messages for today (UTC). Ask its owner to raise the cap.`);
    return key;
  }

  countSent(key) {
    if (!key) return;
    try { this.kv.set(key, (this.kv.get(key) || 0) + 1, 2 * 86400000); } catch { /* best effort */ }
  }

  // Writes a message. Attachments, if any, are already stored (files.js) and counted in the same transaction.
  send(chat, text, replyTo = null, attachments = [], blobs = null) {
    const me = this.me;
    if (typeof text !== 'string') text = text === undefined || text === null ? '' : String(text);
    if (!attachments.length && !text.trim()) throw new Err(400, 'The message is empty.');
    if (text.length > this.settings.max_text) throw new Err(400, `The message is longer than ${this.settings.max_text} characters.`);
    const day = this.messageCap();
    let parent = null;
    if (replyTo) {
      const [target, row] = this.find(replyTo);
      if (target.id !== chat.id) throw new Err(400, 'A reply must be in the same chat as the message it answers.');
      parent = row;
    }
    this.member(chat);
    this.open(chat);
    let refusal = this.policy.send(me, chat.members, chat.name, chat.id);
    if (refusal) throw new Err(403, refusal);
    const mentioned = this.mentions(chat, text, me);
    let sent = null;
    this.write((tx, log, meta) => {
      const c = this.fresh(tx, chat);
      this.member(c);
      this.open(c);
      refusal = this.policy.send(me, c.members, c.name, c.id);
      if (refusal) throw new Err(403, refusal);
      const seq = (c.seq || 0) + 1;
      let at = now();
      if (c.msg_at && c.msg_at > at) at = c.msg_at;
      const m = { id: `${c.id}:${seq}`, swarm: this.id, chat: c.id, seq, from: me, at, text };
      if (attachments.length) m.attachments = attachments.map(({ image: _i, text: _t, ...a }) => a);
      if (parent) {
        m.reply_to = `${c.id}:${parent.seq}`;
        m.reply_to_from = parent.from;
        m.parent = parent.seq;
        // Every message above it counts one more comment under it, for the board.
        let up = tx.findOne(this.M, `${c.id}:${parent.seq}`);
        const set = { replies: [...(up.replies || []), seq] };
        for (let hops = 0; up && hops < 1000; hops++) {
          tx.update(this.M, { id: up.id }, { $set: { ...set, comments: (up.comments || 0) + 1, active_at: at } });
          for (const k of Object.keys(set)) delete set[k];
          up = up.parent ? tx.findOne(this.M, `${c.id}:${up.parent}`) : null;
        }
      }
      if (mentioned.length) m.mentions = mentioned;
      tx.insert(this.M, m);
      const n = log(c, 'message', { from: me, at, seq });
      this.setChat(tx, chat, {
        ...c, seq, msg_at: at, at, n, sent: { ...(c.sent || {}), [me]: ((c.sent || {})[me] || 0) + 1 }, last_by: { ...(c.last_by || {}), [me]: at },
      });
      // Messages a minute, by chat and sender: the viewer's activity bar and replays.
      const minute = Math.floor(Date.parse(at) / 60000) * 60;
      const aid = `${this.id}:${minute}`;
      const act = tx.findOne('activity', aid);
      const chats = { ...(act?.chats || {}) };
      chats[c.id] = { ...(chats[c.id] || {}), [me]: ((chats[c.id] || {})[me] || 0) + 1 };
      if (act) tx.update('activity', { id: aid }, { $set: { count: (act.count || 0) + 1, chats } });
      else tx.insert('activity', { id: aid, swarm: this.id, t: minute, count: 1, chats });
      if (!meta.first_at) meta.first_at = at;
      if (!meta.last_at || at > meta.last_at) meta.last_at = at;
      const cid = this.cursorId(me, c);
      const cur = tx.findOne('cursors', cid) || { pos: 0, mine: [] };
      const mine = { mine: mineAdd(mineTrim(cur.mine, cur.pos || 0), seq) };
      if (cur.id) tx.update('cursors', { id: cid }, { $set: mine });
      else tx.insert('cursors', { id: cid, swarm: this.id, user: me, chat: c.id, pos: 0, ment: [], reads: [], ...mine });
      for (const u of mentioned) {
        const uid = this.cursorId(u, c);
        const uc = tx.findOne('cursors', uid);
        if (uc) tx.update('cursors', { id: uid }, { $set: { ment: [...(uc.ment || []), seq] } });
      }
      for (const a of attachments) {
        tx.insert('files', { id: a.id, swarm: this.id, chat: c.id, seq, sha256: a.sha256, name: a.name, size: a.size, type: a.type, ...(a.folder ? { folder: true } : {}), ...(a.image ? { image: a.image } : {}), ...(a.text ? { text: a.text } : {}) });
      }
      if (blobs) blobs(tx);
      sent = m;
    });
    this.countSent(day);
    this.wake(chat.members, me);
    return this.named(chat, sent);
  }

  // An edit, delete or reaction. Only the sender may edit. The sender may delete, and so may whoever the rules allow
  // to delete another person's message: administrators, by default.
  changeMessage(ref, kind, fields = {}) {
    const me = this.me;
    const [chat, m] = this.find(ref);
    if (kind === 'edit' && m.from !== me) throw new Err(403, 'Only the sender can edit a message.');
    if (kind === 'edit') {
      const text = fields.text || '';
      if (typeof text !== 'string' || !text.trim()) throw new Err(400, 'The new text is empty. To remove the message, delete it.');
      if (text.length > this.settings.max_text) throw new Err(400, `The message is longer than ${this.settings.max_text} characters.`);
    }
    this.member(chat);
    this.open(chat);
    let refusal = null;
    if (kind === 'edit') refusal = this.policy.send(me, chat.members, chat.name, chat.id);
    else if (kind === 'react') refusal = this.policy.react(me, chat.members, chat.name);
    else if (m.from !== me) refusal = this.policy.check('delete_message', this.policy.roles(me, this.managers(chat)));
    if (refusal) throw new Err(403, refusal);
    if (kind === 'edit') fields.mentions = this.mentions(chat, fields.text, me);
    if (m.deleted) throw new Err(400, `${ref.trim()} was deleted.`);
    const at = now();
    let updated = null;
    let released = [];
    this.write((tx, log) => {
      const c = this.fresh(tx, chat);
      this.member(c);
      this.open(c);
      const row = tx.findOne(this.M, m.id);
      if (row.deleted) throw new Err(400, `${ref.trim()} was deleted.`);
      const n = log(c, kind, { from: me, at, target: row.seq, ...fields });
      const set = {};
      let mentionsBefore = row.mentions || [];
      let mentionsAfter = mentionsBefore;
      if (kind === 'edit') {
        Object.assign(set, { text: fields.text, edited_at: at, mentions: fields.mentions, edits: [...(row.edits || []), n] });
        if (row.original_text === undefined) Object.assign(set, { original_text: row.text, original_mentions: row.mentions || [] });
        mentionsAfter = fields.mentions;
      } else if (kind === 'delete') {
        Object.assign(set, { deleted: at, text: '', mentions: [], attachments: [], original_text: '', original_mentions: [] });
        released = row.attachments || [];
        mentionsAfter = [];
        for (const e of row.edits || []) tx.update('events', { id: `${this.id}:${e}` }, { $set: { text: '' }, $unset: { mentions: true } });
        for (const a of released) tx.delete('files', { id: a.id });
      } else {
        const reactions = { ...(row.reactions || {}) };
        const users = [...(reactions[fields.emoji] || [])];
        if (fields.remove && users.includes(me)) users.splice(users.indexOf(me), 1);
        else if (!fields.remove && !users.includes(me)) users.push(me);
        reactions[fields.emoji] = users;
        set.reactions = reactions;
      }
      tx.update(this.M, { id: row.id }, { $set: set });
      updated = { ...row, ...set };
      if (kind !== 'react') {
        for (const u of c.members) {
          const want = mentionsAfter.includes(u);
          if (want === mentionsBefore.includes(u)) continue;
          const uid = this.cursorId(u, c);
          const uc = tx.findOne('cursors', uid);
          if (!uc || row.seq <= (uc.pos || 0)) continue;
          const ment = (uc.ment || []).filter((s) => s !== row.seq);
          if (want) ment.push(row.seq);
          tx.update('cursors', { id: uid }, { $set: { ment: ment.sort((a, b) => a - b) } });
        }
      }
      if (released.length) this.releaseBlobs(tx, released);
    });
    if (released.length) this.dropBlobs();
    this.wake(chat.members, me);
    return this.named(chat, updated);
  }

  // ---------------------------------------------------------------- blobs (files.js stores them)

  releaseBlobs(tx, attachments) {
    this._drop = this._drop || [];
    for (const a of attachments) {
      const id = `${this.id}:${a.sha256}`;
      const b = tx.findOne('blobs', id);
      if (!b) continue;
      if ((b.refs || 0) <= 1) {
        tx.delete('blobs', { id });
        this._drop.push(b.key);
      } else tx.update('blobs', { id }, { $set: { refs: b.refs - 1 } });
      this.usage(tx, -a.size);
    }
  }

  dropBlobs() {
    for (const key of this._drop || []) { try { this.env.holm.app.s3.delete(key); } catch { /* kept until swarm deletion */ } }
    this._drop = [];
  }

  // Bytes of files a swarm's standing messages hold, counted each time a file is sent.
  usage(tx, delta) {
    if (this._meta) { this._meta.bytes = Math.max(0, (this._meta.bytes || 0) + delta); return; }
    const c = tx.findOne('swarm_n', this.id);
    if (c) tx.update('swarm_n', { id: this.id }, { $set: { bytes: Math.max(0, (c.bytes || 0) + delta) } });
    else tx.insert('swarm_n', { id: this.id, n: 0, bytes: Math.max(0, delta) });
  }

  // ---------------------------------------------------------------- threads

  // (chat, [[seq, depth], …]): the whole thread a message is in, its first message first at depth 0, each reply after
  // the message it answers, one level deeper. Messages I may not read are left out, with their level.
  thread(ref, me = this.me) {
    const [chat, row] = this.find(ref, me);
    let top = row;
    const seen = new Map([[row.seq, row]]);
    while (top.parent) {
      const up = this.ds.findOne(this.M, `${chat.id}:${top.parent}`);
      if (!up) break;
      seen.set(up.seq, up);
      top = up;
    }
    let level = [top];
    const expanded = new Set();
    while (level.length) {
      const next = [];
      for (const m of level) {
        expanded.add(m.seq);
        for (const r of m.replies || []) if (!expanded.has(r)) next.push(r);
      }
      for (const r of this.messageRows(chat, next.filter((x) => !seen.has(x)))) seen.set(r.seq, r);
      level = next.map((x) => seen.get(x)).filter(Boolean);
    }
    const found = [];
    const todo = [[top.seq, 0]];
    while (todo.length) {
      const [seq, depth] = todo.pop();
      const m = seen.get(seq);
      if (!m) continue;
      const shown = this.sees(me, chat, seq);
      if (shown) found.push([seq, depth]);
      for (const r of [...(m.replies || [])].reverse()) todo.push([r, shown ? depth + 1 : depth]);
    }
    return [chat, found, seen];
  }

  // ---------------------------------------------------------------- waiting

  // Messages a wait would return now, and how far it looked in each chat.
  pending(p, only, senders, after) {
    const me = this.me;
    const chats = only ? [only] : this.myChats();
    this.loadCursors(chats.map((c) => [me, c]));
    let found = [];
    const positions = {};
    for (const chat of chats) {
      const level = only || p.any ? 'all' : this.level(chat);
      const given = after?.[chat.id];
      const start = given === undefined || given === null ? this.position(chat) : Math.max(0, Math.trunc(Number(given)) || 0);
      positions[chat.id] = start;
      if ((chat.seq || 0) <= start) continue;
      const cur = this.cursor(chat);
      const pos = cur.pos || 0;
      const mine = cur.mine;
      const ment = new Set(cur.ment || []);
      const rows = new Map();
      const row = (s) => {
        if (!rows.has(s)) rows.set(s, this.ds.findOne(this.M, `${chat.id}:${s}`));
        return rows.get(s);
      };
      const fromOther = (s) => (s > pos ? !mineHas(mine, s) : row(s)?.from !== me);
      for (const s of this.seqs(me, chat, start, null, true)) {
        if (fromOther(s)) { positions[chat.id] = s; break; }
      }
      if (level === 'none') continue;
      const mentionsOnly = !!p.mentions || level === 'mentions';
      const remaining = WAIT_MESSAGES - found.length;
      const picked = [];
      for (const s of this.seqs(me, chat, start)) {
        if (!fromOther(s)) continue;
        if (mentionsOnly && !(s > pos ? ment.has(s) : (row(s)?.mentions || []).includes(me))) continue;
        if (senders.size && !senders.has(row(s)?.from)) continue;
        picked.push(s);
        if (picked.length > remaining) break;
      }
      if (picked.length > remaining) {
        picked.length = remaining;
        positions[chat.id] = picked[picked.length - 1];
      }
      const need = picked.filter((s) => !rows.has(s));
      for (const r of this.messageRows(chat, need)) rows.set(r.seq, r);
      found.push(...picked.map((s) => rows.get(s)).filter(Boolean).map((r) => this.message(chat, r)));
      if (found.length >= WAIT_MESSAGES) break;
    }
    found = found.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.chat < b.chat ? -1 : a.chat > b.chat ? 1 : a.seq - b.seq));
    return [found, positions];
  }

  // More than 5 empty waits in a sliding 10 s from one user: 429, with both ways to wait here.
  guard() {
    if (this.settings.wait_guard === false) return;
    const t = Date.now();
    const slot = Math.floor(t / 10000);
    const key = (s) => `ew:${this.id}:${this.me}:${s}`;
    const n = (this.kv.get(key(slot)) || 0) + 1;
    this.kv.set(key(slot), n, 25000);
    const prev = this.kv.get(key(slot - 1)) || 0;
    const weight = 1 - (t % 10000) / 10000;
    if (n + prev * weight > 5) {
      throw new Err(429, 'This server answers wait at once and cannot hold it open. Wait without spending requests: '
        + '`node swarmchat.mjs wait` (download it from this server at /swarmchat.mjs) sleeps until a message comes, '
        + 'or loop the stock client with a pause: `until swarmchat wait --timeout 0; [ $? -ne 4 ]; do sleep 10; done`.');
    }
  }

  hint(u = this.me) { return { channel: this.people[u]?.hint, path: '/_ws' }; }
}

// The swarm a token belongs to: {swarm row, user} or null. user is an id, '@admin' or '@view'.
export async function tokenOwner(env, token) {
  if (!token) return null;
  const record = env.holm.app.kv.get('tok:' + await sha256(token));
  if (!record) return null;
  const row = env.holm.app.ds.findOne('swarms', record.swarm);
  return row ? { row, user: record.user } : null;
}
