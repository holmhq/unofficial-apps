// What the viewer asks: upstream SwarmChat's view.py (5ee0c0e, MIT) on Holm. Read-only requests that see every chat
// of one swarm and change nothing: no read position moves and no event is written. Seeing as an agent calls the same
// handlers the agents call, as that agent, with nothing marked read.
//
// Numbering: messages keep their seq (1, 2, 3 … per chat, ids <chat>:<seq>), exactly as agents see them. A system
// line (created, added, renamed …) gets the seq of the message it follows plus a small fraction, so it sorts between
// the right messages. Feed events and a chat's `seq` use the swarm's event number n, which only grows.
import { METHODS } from './agent.js';
import { download as fileDownload } from './files.js';
import { Err, Swarm, byIds, int, list } from './store.js';

const PREVIEW = 160;
const RECENT = 900;
const MAX_FEED = 500;
const TEXT_BYTES = 5000000;
const POSTS_WINDOW = 600;

const epoch = (at) => Date.parse(at) / 1000;
const iso = (t) => new Date(Math.round(t * 1000)).toISOString();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function num(p, key, d, most) {
  const v = p[key];
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Err(400, `Bad request: ${key} must be a number.`);
  return clamp(Math.trunc(n), 0, most);
}

function chatOf(s, ref) {
  const c = typeof ref === 'string' || typeof ref === 'number' ? s.chat(String(ref).trim()) : null;
  if (!c) throw new Err(404, `There is no chat ${ref}.`);
  return c;
}

function userOf(s, ref) {
  const u = String(ref ?? '').trim().toLowerCase();
  if (!s.exists(u)) throw new Err(404, `There is no user ${ref}.`);
  return u;
}

const kindOf = (c) => (c.name ? 'channel' : c.members.length === 2 ? 'direct' : 'group');

function short(m) {
  const text = m.deleted ? '' : m.text || '';
  return { seq: m.seq, from: m.from, at: m.at, text: text.slice(0, PREVIEW), deleted: !!m.deleted, files: (m.attachments || []).length };
}

function person(s, u) {
  if (s.exists(u)) return s.publicUser(u);
  return { id: u, name: u, fields: {}, status: '', removed: true };
}

// Pictures get their size and type, text files their first lines, from what the upload read.
function withFiles(s, list) {
  const ids = [];
  for (const m of list) for (const a of m.attachments || []) if (!a.folder) ids.push(a.id);
  if (!ids.length) return list;
  const rows = new Map(byIds(s.ds, 'files', ids).map((f) => [f.id, f]));
  for (const m of list) {
    for (const a of m.attachments || []) {
      const f = rows.get(a.id);
      if (f?.image) a.image = f.image;
      else if (f?.text) a.text = f.text;
    }
  }
  return list;
}

// Messages as the viewer shows them: replies counted, and a reply carrying the start of the message it answers.
function messages(s, chat, rows) {
  const have = new Map(rows.map((r) => [r.seq, r]));
  const wanted = [...new Set(rows.filter((r) => r.parent && !have.has(r.parent)).map((r) => r.parent))];
  for (const r of s.messageRows(chat, wanted)) have.set(r.seq, r);
  const out = rows.map((r) => {
    const m = s.view(chat, r);
    m.replies = (r.replies || []).length;
    if (r.parent && have.has(r.parent)) m.parent = short(s.view(chat, have.get(r.parent)));
    return m;
  });
  return withFiles(s, out);
}

function systemLine(chat, e) {
  const { id: _i, swarm: _s, n, at_seq: atSeq, _createdAt, _updatedAt, _rev, ...rest } = e;
  const seq = (atSeq || 0) + Math.min(0.999, n / 1e9);
  return { ...rest, id: `${chat.id}:${seq}`, chat: chat.id, seq };
}

function positions(s, chat) {
  s.loadCursors(chat.members.map((u) => [u, chat]));
  const out = {};
  for (const u of chat.members) out[u] = s.position(chat, u);
  return out;
}

function meta(s) {
  return s.ds.findOne('swarm_n', s.id) || { n: 0 };
}

// Messages a minute, from the activity rows between two times (seconds), oldest first.
function minutes(s, from, to) {
  const ids = [];
  for (let t = Math.floor(from / 60) * 60; t <= to; t += 60) ids.push(`${s.id}:${t}`);
  if (ids.length > 50000) ids.splice(0, ids.length - 50000);
  return byIds(s.ds, 'activity', ids).sort((a, b) => a.t - b.t);
}

function summary(s, chat, last, recent) {
  const lastBy = {};
  for (const [u, at] of Object.entries(chat.last_by || {})) lastBy[u] = epoch(at);
  return {
    id: chat.id, kind: kindOf(chat), name: chat.name ?? null, description: chat.description || '', public: !!chat.public,
    archived: !!chat.archived, members: [...chat.members], managers: s.managers(chat), created_by: chat.created_by,
    created_at: chat.created_at, seq: chat.n || 0, messages: chat.seq || 0, last_at: chat.at,
    last: last ? short(last) : null, sent: { ...(chat.sent || {}) }, last_by: lastBy, ...(recent !== undefined ? { recent } : {}),
  };
}

function summaries(s, chats) {
  const rows = new Map(byIds(s.ds, s.M, chats.filter((c) => c.seq).map((c) => `${c.id}:${c.seq}`)).map((r) => [r.chat, r]));
  return chats.map((c) => summary(s, c, rows.get(c.id) || null));
}

function allChats(s) {
  const index = s.ds.findOne('swarm_chats', s.id);
  return s.loadChats(index?.chats || []);
}

// How many of a chat's messages were written by the moment t (seconds): a search over their times.
function countBy(s, chat, t) {
  let lo = 0;
  let hi = chat.seq || 0;
  const stamp = iso(t);
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const r = s.ds.findOne(s.M, `${chat.id}:${mid}`);
    if (r && r.at <= stamp) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// Who was in a chat at the time `at`, from its created, added and removed lines.
function membersAt(s, chat, at) {
  let members = new Set();
  const lines = byIds(s.ds, 'events', (chat.system || []).map(([n]) => `${s.id}:${n}`)).sort((a, b) => a.n - b.n);
  for (const e of lines) {
    if (e.at > at) break;
    if (e.kind === 'created') members = new Set(e.members || []);
    else if (e.kind === 'added') for (const u of e.users || []) members.add(u);
    else if (e.kind === 'removed') for (const u of e.users || []) members.delete(u);
  }
  return members;
}

// A small swarm's activity from its message times exactly; a larger one's from its messages a minute.
const EXACT_EVENTS = 6000;

function exactActivity(s, m, only, buckets, p) {
  const ids = [];
  for (let n = 1; n <= (m.n || 0); n++) ids.push(`${s.id}:${n}`);
  const times = byIds(s.ds, 'events', ids).filter((e) => e.kind === 'message' && (!only || only.has(e.chat)))
    .map((e) => [epoch(e.at), e.chat, e.from]).sort((a, b) => a[0] - b[0]);
  if (!times.length) return { start: null, end: null, width: null, counts: [], window: {} };
  const first = times[0][0];
  const last = times[times.length - 1][0];
  const width = Math.max((last - first) / buckets, 0.001);
  const counts = new Array(buckets).fill(0);
  for (const [t] of times) counts[clamp(Math.floor((t - first) / width), 0, buckets - 1)] += 1;
  const out = { start: first, end: last, width, counts };
  if (p.from !== undefined && p.to !== undefined && p.from !== null && p.to !== null) {
    const window = {};
    for (const [t, c, u] of times) {
      if (t < Number(p.from) || t > Number(p.to)) continue;
      const w = window[c] || (window[c] = { messages: 0, sent: {} });
      w.messages += 1;
      w.sent[u] = (w.sent[u] || 0) + 1;
    }
    out.window = window;
  }
  return out;
}

// ---------------------------------------------------------------------- the whole swarm at once

export const VIEW = {
  view_info(s) {
    const m = meta(s);
    return {
      name: s.row.name, version: 'swarmchat', read_only: false, data: s.row.name, feed: m.n || 0, feed_id: s.id,
      channel: s.row.viewer, swarm: s.id, workspace: s.row.workspace || null,
    };
  },

  view_snapshot(s, p) {
    const info = VIEW.view_info(s, p);
    const chats = allChats(s);
    const out = summaries(s, chats);
    const m = meta(s);
    const recent = {};
    if (m.last_at) {
      const newest = epoch(m.last_at);
      for (const row of minutes(s, newest - RECENT, newest)) {
        for (const [c, by] of Object.entries(row.chats || {})) recent[c] = (recent[c] || 0) + Object.values(by).reduce((a, b) => a + b, 0);
      }
    }
    for (const c of out) c.recent = recent[c.id] || 0;
    const ids = Object.keys(s.people).sort();
    s.loadUsers(ids);
    const users = new Map(ids.map((u) => [u, person(s, u)]));
    for (const c of out) for (const u of [...c.members, ...Object.keys(c.sent)]) if (!users.has(u)) users.set(u, person(s, u));
    return { feed: info.feed, server: info, users: [...users.values()], chats: out, now: Date.now() / 1000 };
  },

  // Everything after the feed number `after`, at once (the page sleeps on the swarm's viewer channel between asks).
  // reset means take a new snapshot: the viewer fell behind numbers that no longer exist, or this is another swarm.
  view_feed(s, p) {
    const after = num(p, 'after', 0, Number.MAX_SAFE_INTEGER);
    const total = meta(s).n || 0;
    if (after > total || (p.feed_id && p.feed_id !== s.id)) return { feed: total, events: [], reset: true };
    const upto = Math.min(total, after + MAX_FEED);
    const ids = [];
    for (let n = after + 1; n <= upto; n++) ids.push(`${s.id}:${n}`);
    const rows = byIds(s.ds, 'events', ids).sort((a, b) => a.n - b.n);
    const chats = new Map(s.loadChats([...new Set(rows.filter((e) => e.chat).map((e) => e.chat))]).map((c) => [c.id, c]));
    const want = new Map();
    for (const e of rows) {
      if (!e.chat || !chats.has(e.chat)) continue;
      const seq = e.kind === 'message' ? e.seq : ['edit', 'delete', 'react'].includes(e.kind) ? e.target : null;
      if (seq) { if (!want.has(e.chat)) want.set(e.chat, new Set()); want.get(e.chat).add(seq); }
    }
    const shown = new Map();
    for (const [cid, seqs] of want) {
      const chat = chats.get(cid);
      for (const m of messages(s, chat, s.messageRows(chat, [...seqs].sort((a, b) => a - b)))) shown.set(`${cid}:${m.seq}`, m);
    }
    const out = [];
    for (const e of rows) {
      if (!e.chat) {
        if (e.kind === 'user' && e.user) out.push({ n: e.n, kind: 'user', user: person(s, e.user) });
        continue;
      }
      const chat = chats.get(e.chat);
      if (!chat) continue;
      if (e.kind === 'message') {
        const m = shown.get(`${e.chat}:${e.seq}`);
        if (m) out.push({ n: e.n, kind: 'message', chat: e.chat, seq: e.n, count: e.seq, message: m });
      } else if (['edit', 'delete', 'react'].includes(e.kind)) {
        const m = shown.get(`${e.chat}:${e.target}`);
        if (m) out.push({ n: e.n, kind: 'change', chat: e.chat, seq: e.n, change: e.kind, from: e.from, message: m });
      } else if (e.kind === 'read') {
        out.push({ n: e.n, kind: 'read', chat: e.chat, seq: e.n, user: e.from, upto: e.upto, at: e.at });
      } else {
        out.push({ n: e.n, kind: 'chat', chat: e.chat, seq: e.n, event: systemLine(chat, e), summary: summaries(s, [chat])[0] });
      }
    }
    return { feed: upto, events: out };
  },

  // ---------------------------------------------------------------------- one chat

  // A run of a chat's messages, oldest first: the newest `limit`, or those just `before` or `after` a seq, or those
  // `around` one, or the newest written by a moment `at`. With them, the system lines in the same stretch and every
  // member's read position.
  view_messages(s, p) {
    const chat = chatOf(s, p.chat);
    const limit = num(p, 'limit', 100, 500) || 1;
    const n = chat.seq || 0;
    let lo;
    let hi;
    if (p.around !== undefined && p.around !== null) {
      const i = clamp(Math.ceil(Number(p.around)) - 1, 0, n);
      lo = Math.max(0, Math.min(i - Math.floor(limit / 2), n - limit));
      hi = Math.min(n, lo + limit);
    } else if (p.before !== undefined && p.before !== null) {
      hi = clamp(Math.ceil(Number(p.before)) - 1, 0, n);
      lo = Math.max(0, hi - limit);
    } else if (p.after !== undefined && p.after !== null) {
      lo = clamp(Math.floor(Number(p.after)), 0, n);
      hi = Math.min(n, lo + limit);
    } else if (p.at !== undefined && p.at !== null) {
      hi = countBy(s, chat, Number(p.at));
      lo = Math.max(0, hi - limit);
    } else {
      hi = n;
      lo = Math.max(0, n - limit);
    }
    const seqs = [];
    for (let q = lo + 1; q <= hi; q++) seqs.push(q);
    const rows = s.messageRows(chat, seqs);
    const lines = (chat.system || []).filter(([, k]) => (lo === 0 || k >= lo + 1) && (hi === n || k <= hi - 1));
    let sys = byIds(s.ds, 'events', lines.map(([e]) => `${s.id}:${e}`)).map((e) => systemLine(chat, e));
    if (p.at !== undefined && p.at !== null) { const stamp = iso(Number(p.at)); sys = sys.filter((e) => e.at <= stamp); }
    const all = [...messages(s, chat, rows), ...sys].sort((a, b) => a.seq - b.seq);
    return { chat: chat.id, messages: all, first: lo === 0, last: hi === n, index: lo, total: n, positions: positions(s, chat) };
  },

  view_thread(s, p) {
    const [chat, tree, rows] = s.thread(String(p.id || ''), null);
    const depth = new Map(tree);
    const out = messages(s, chat, tree.map(([seq]) => rows.get(seq)));
    for (const m of out) m.depth = depth.get(m.seq);
    return { chat: chat.id, messages: out, positions: positions(s, chat) };
  },

  view_receipts(s, p) {
    const [chat, m] = s.find(String(p.id || ''), null);
    s.loadCursors(chat.members.map((u) => [u, chat]));
    const read = [];
    const unread = [];
    for (const u of chat.members) {
      if (u === m.from) continue;
      const at = s.readAt(chat, u, m.seq);
      if (at || s.position(chat, u) >= m.seq) read.push({ id: u, at });
      else unread.push(u);
    }
    read.sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1));
    return { id: `${chat.id}:${m.seq}`, read, unread };
  },

  // ---------------------------------------------------------------------- the board

  // Top-level messages as posts, from one chat or from every channel and group (the front page), sorted hot, new,
  // top or active. With `as`, only chats that agent is in. Ranks the newest posts (about 600 across the swarm).
  view_posts(s, p) {
    const sort = p.sort || 'hot';
    if (!['hot', 'new', 'top', 'active'].includes(sort)) throw new Err(400, 'sort is hot, new, top or active.');
    const limit = num(p, 'limit', 30, 200) || 1;
    const offset = num(p, 'offset', 0, 1e9);
    let chats = p.chat ? [chatOf(s, p.chat)] : allChats(s).filter((c) => kindOf(c) !== 'direct');
    if (p.as) { const u = userOf(s, p.as); chats = chats.filter((c) => c.members.includes(u)); }
    chats = chats.filter((c) => c.seq).sort((a, b) => (a.msg_at < b.msg_at ? 1 : -1));
    const posts = [];
    const window = Math.max(POSTS_WINDOW, offset + limit);
    for (const chat of chats) {
      if (posts.length >= window * 2) break;
      let top = chat.seq;
      while (top > 0 && posts.length < window * 2) {
        const seqs = [];
        for (let q = top; q > Math.max(0, top - 200); q--) seqs.push(q);
        top -= 200;
        for (const r of s.messageRows(chat, seqs)) if (!r.parent) posts.push([chat, r]);
        if (p.chat ? posts.length >= window : posts.length >= window / Math.min(chats.length, 6)) break;
      }
    }
    const newest = Math.max(0, ...posts.map(([, r]) => epoch(r.at)));
    const votes = (r) => Object.values(r.reactions || {}).reduce((n, u) => n + u.length, 0);
    const key = {
      hot: (r) => [(votes(r) + (r.comments || 0) + 1) / ((Math.max(0, newest - epoch(r.at)) / 3600 + 2) ** 1.5), r.at, r.seq],
      new: (r) => [r.at, r.seq], top: (r) => [votes(r) + (r.comments || 0), r.at, r.seq], active: (r) => [r.active_at || r.at, r.seq],
    }[sort];
    const cmp = (a, b) => { const x = key(a[1]); const y = key(b[1]); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? 1 : -1; return 0; };
    const page = posts.sort(cmp).slice(offset, offset + limit);
    const out = [];
    for (const [chat, r] of page) {
      const m = messages(s, chat, [r])[0];
      out.push({ ...m, comments: r.comments || 0, votes: votes(r), active_at: epoch(r.active_at || r.at) });
    }
    return { posts: out, more: page.length === limit };
  },

  // ---------------------------------------------------------------------- search

  // Messages, newest first, from every chat, or only `chats`, or only an agent's chats with `as`. `text` is matched by
  // the node's search index and then in the text as it now stands. `from`, `mentions`, `files`, `after` and `before`
  // narrow it. For the next page, pass the reply's `until`.
  view_search(s, p) {
    const text = String(p.text || '').trim().toLowerCase();
    const limit = num(p, 'limit', 50, 500) || 1;
    let chats = p.chats ? list(p.chats).map((c) => chatOf(s, c)) : allChats(s);
    if (p.as) { const u = userOf(s, p.as); chats = chats.filter((c) => c.members.includes(u)); }
    const allowed = new Map(chats.map((c) => [c.id, c]));
    const senders = new Set(list(p.from));
    const after = p.after ? iso(Number(p.after) || epoch(p.after)) : null;
    const before = p.before ? iso(Number(p.before) || epoch(p.before)) : null;
    const until = Array.isArray(p.until) ? [iso(Number(p.until[0])), String(p.until[1]), Number(p.until[2])] : null;
    const mention = p.mentions ? String(p.mentions) : null;
    const fits = (r) => allowed.has(r.chat) && !r.deleted && (!text || (r.text || '').toLowerCase().includes(text))
      && (!senders.size || senders.has(r.from)) && (!mention || (r.mentions || []).includes(mention))
      && (!p.files || (r.attachments || []).length) && (!after || r.at >= after) && (!before || r.at < before)
      && (!until || r.at < until[0] || (r.at === until[0] && (r.chat < until[1] || (r.chat === until[1] && r.seq < until[2]))));
    const found = new Map();
    if (text) {
      try {
        const hits = s.ds.search(s.M, text, { limit: 500 });
        for (const h of hits?.results || []) { const r = h.doc || h; if (r && fits(r)) found.set(r.id, r); }
      } catch { /* the index may be warming up: the scan below still finds recent ones */ }
    }
    // The newest messages, scanned, so a word piece the index does not match still finds recent messages.
    let budget = 3000;
    for (const chat of [...allowed.values()].filter((c) => c.seq).sort((a, b) => (a.msg_at < b.msg_at ? 1 : -1))) {
      if (budget <= 0) break;
      let top = chat.seq;
      while (top > 0 && budget > 0) {
        const seqs = [];
        for (let q = top; q > Math.max(0, top - 250); q--) seqs.push(q);
        top -= 250;
        budget -= seqs.length;
        for (const r of s.messageRows(chat, seqs)) if (fits(r)) found.set(r.id, r);
      }
    }
    const sorted = [...found.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.chat < b.chat ? 1 : a.chat > b.chat ? -1 : b.seq - a.seq)).slice(0, limit);
    const byChat = new Map();
    for (const r of sorted) { if (!byChat.has(r.chat)) byChat.set(r.chat, []); byChat.get(r.chat).push(r); }
    const shown = new Map();
    for (const [cid, rows] of byChat) for (const m of messages(s, allowed.get(cid), rows)) shown.set(m.id, m);
    const last = sorted[sorted.length - 1];
    return { messages: sorted.map((r) => shown.get(r.id)), until: sorted.length === limit && last ? [epoch(last.at), last.chat, last.seq] : null };
  },

  // ---------------------------------------------------------------------- over time

  view_activity(s, p) {
    const m = meta(s);
    let only = null;
    if (p.as) { const u = userOf(s, p.as); only = new Set(s.myChats(u).map((c) => c.id)); }
    if (!m.first_at) return { start: null, end: null, width: null, counts: [], window: {} };
    const buckets = num(p, 'buckets', 200, 2000) || 1;
    if ((m.n || 0) <= EXACT_EVENTS) return exactActivity(s, m, only, buckets, p);
    const first = epoch(m.first_at);
    const last = epoch(m.last_at);
    const width = Math.max((last - first) / buckets, 0.001);
    const counts = new Array(buckets).fill(0);
    const rows = minutes(s, first, last);
    const total = (row) => Object.entries(row.chats || {}).filter(([c]) => !only || only.has(c)).reduce((n, [, by]) => n + Object.values(by).reduce((a, b) => a + b, 0), 0);
    for (const row of rows) {
      const k = total(row);
      if (!k) continue;
      const t = clamp(row.t + 30, first, last);
      counts[clamp(Math.floor((t - first) / width), 0, buckets - 1)] += k;
    }
    const out = { start: first, end: last, width, counts };
    if (p.from !== undefined && p.to !== undefined && p.from !== null && p.to !== null) {
      const from = Number(p.from);
      const to = Number(p.to);
      const window = {};
      for (const row of rows) {
        if (row.t + 60 <= from || row.t > to) continue;
        for (const [c, by] of Object.entries(row.chats || {})) {
          if (only && !only.has(c)) continue;
          const w = window[c] || (window[c] = { messages: 0, sent: {} });
          for (const [u, k] of Object.entries(by)) { w.messages += k; w.sent[u] = (w.sent[u] || 0) + k; }
        }
      }
      out.window = window;
    }
    return out;
  },

  // Every chat as it stood at the moment `at` (seconds): how many messages it had, the newest of them, who had written
  // how many, and how many came in the 15 minutes before. With `as`, that agent's read position in each of its chats
  // then and what it had not read; with `mine` as well, only that agent's chats.
  view_at(s, p) {
    const t = Number(p.at);
    if (!Number.isFinite(t)) throw new Err(400, 'at is a time in seconds since 1970.');
    const user = p.as ? userOf(s, p.as) : null;
    const stamp = iso(t);
    let chats = allChats(s);
    if (user && p.mine) chats = chats.filter((c) => c.members.includes(user));
    const m = meta(s);
    const count = new Map();
    const sent = new Map();
    const recent = new Map();
    const minute = Math.floor(t / 60) * 60;
    if (m.first_at) {
      for (const row of minutes(s, epoch(m.first_at), Math.min(t, epoch(m.last_at)))) {
        for (const [c, by] of Object.entries(row.chats || {})) {
          const k = Object.values(by).reduce((a, b) => a + b, 0);
          if (row.t < minute) {
            count.set(c, (count.get(c) || 0) + k);
            const sc = sent.get(c) || {};
            for (const [u, x] of Object.entries(by)) sc[u] = (sc[u] || 0) + x;
            sent.set(c, sc);
            if (row.t + 60 > t - RECENT) recent.set(c, (recent.get(c) || 0) + k);
          } else if (row.t === minute) {
            // The minute `at` falls in: its messages are the chat's next k seqs, checked one by one.
            const chat = s.chat(c);
            if (!chat) continue;
            const base = count.get(c) || 0;
            const seqs = [];
            for (let q = base + 1; q <= Math.min(chat.seq, base + k); q++) seqs.push(q);
            const sc = sent.get(c) || {};
            let j = base;
            for (const r of s.messageRows(chat, seqs)) if (r.at <= stamp) { j = r.seq; sc[r.from] = (sc[r.from] || 0) + 1; recent.set(c, (recent.get(c) || 0) + 1); }
            count.set(c, j);
            sent.set(c, sc);
          }
        }
      }
    }
    const lastIds = chats.filter((c) => count.get(c.id)).map((c) => `${c.id}:${count.get(c.id)}`);
    const lasts = new Map(byIds(s.ds, s.M, lastIds).map((r) => [r.chat, r]));
    if (user) s.loadCursors(chats.filter((c) => c.members.includes(user)).map((c) => [user, c]));
    const out = {};
    for (const chat of chats) {
      const j = count.get(chat.id) || 0;
      const state = { born: chat.created_at <= stamp, messages: j, sent: sent.get(chat.id) || {}, recent: recent.get(chat.id) || 0 };
      const last = lasts.get(chat.id);
      if (j && last) { state.last = { seq: j, from: last.from, at: last.at }; state.last_at = last.at; }
      if (user && chat.members.includes(user)) {
        const upto = Math.min(s.positionAt(chat, user, stamp)[0], j);
        let unread = j - upto;
        let mentioned = 0;
        if (j > upto && j - upto <= 500) {
          const seqs = [];
          for (let q = upto + 1; q <= j; q++) seqs.push(q);
          unread = 0;
          for (const r of s.messageRows(chat, seqs)) {
            if (r.from !== user) unread++;
            if ((r.mentions || []).includes(user)) mentioned++;
          }
        }
        state.as = { upto, unread, mentioned };
      }
      out[chat.id] = state;
    }
    return { at: t, chats: out };
  },

  // The messages written after a moment, oldest first, as [time, chat, seq, sender], from the swarm's history.
  // `after` is a time (seconds) or the last one already had as [time, chat, seq].
  view_replay(s, p) {
    const after = p.after || 0;
    const cursor = Array.isArray(after) ? [Number(after[0]), String(after[1]), Number(after[2])] : [Number(after), '\uffff', 0];
    const limit = num(p, 'limit', 2000, 20000) || 1;
    let only = null;
    if (p.as) { const u = userOf(s, p.as); only = new Set(s.myChats(u).map((c) => c.id)); }
    const total = meta(s).n || 0;
    const stamp = iso(cursor[0]);
    let lo = 1;
    let hi = total + 1;
    while (lo < hi) { // the first event at or after the moment
      const mid = Math.floor((lo + hi) / 2);
      const e = s.ds.findOne('events', `${s.id}:${mid}`);
      if (e && e.at < stamp) lo = mid + 1; else hi = mid;
    }
    const out = [];
    let n = Math.max(1, lo - 50);
    const past = (row) => { const k = [epoch(row.at), row.chat, row.seq]; return k[0] > cursor[0] || (k[0] === cursor[0] && (k[1] > cursor[1] || (k[1] === cursor[1] && k[2] > cursor[2]))); };
    let budget = 40;
    while (n <= total && out.length <= limit && budget-- > 0) {
      const ids = [];
      for (let k = n; k < n + 500 && k <= total; k++) ids.push(`${s.id}:${k}`);
      n += 500;
      for (const e of byIds(s.ds, 'events', ids).sort((a, b) => a.n - b.n)) {
        if (e.kind !== 'message' || (only && !only.has(e.chat)) || !past(e)) continue;
        out.push([epoch(e.at), e.chat, e.seq, e.from]);
        if (out.length > limit) break;
      }
    }
    return { messages: out.slice(0, limit), more: out.length > limit || (n <= total && budget <= 0) };
  },

  // ---------------------------------------------------------------------- as one agent

  async view_as(s, p) {
    const user = userOf(s, p.user);
    const as = new Swarm(s.env, s.row, user);
    const chats = (await METHODS.chats(as, { limit: 1e9 })).chats;
    const out = { user: as.publicUser(user), chats, positions: {} };
    for (const c of as.myChats()) out.positions[c.id] = as.position(c);
    if (p.unread) {
      const r = await METHODS.read(as, { peek: true, limit: num(p, 'limit', 50, 500) || 50 });
      withFiles(s, r.messages);
      out.unread = r.messages;
      out.unread_left = r.unread_left;
    }
    return out;
  },

  // How far the sender of a message had marked messages read in each of its chats when it sent it. Not everything it
  // saw: peeks, threads and searches leave no read move.
  view_knew(s, p) {
    const [chat, m] = s.find(String(p.id || ''), null);
    const user = m.from;
    const at = m.at;
    const t = epoch(at);
    const chats = [chat, ...s.myChats(user).filter((c) => c.id !== chat.id && c.created_at <= at)];
    s.loadCursors(chats.map((c) => [user, c]));
    const out = [];
    for (const c of chats) {
      const n = c.id === chat.id ? m.seq : countBy(s, c, t);
      if (!n && c.id !== chat.id) continue;
      if (c.id !== chat.id && !membersAt(s, c, at).has(user)) continue;
      const [upto, readAt] = s.positionAt(c, user, at);
      const read = Math.min(upto, n);
      let unseen = n - read;
      if (n > read && n - read <= 500) {
        const seqs = [];
        for (let q = read + 1; q <= n; q++) seqs.push(q);
        unseen = s.messageRows(c, seqs).filter((r) => r.from !== user).length;
      }
      out.push({ chat: c.id, upto, read_at: readAt, messages: n, read, last: n, unseen });
    }
    out.sort((a, b) => (a.chat !== chat.id) - (b.chat !== chat.id) || b.unseen - a.unseen || (a.chat < b.chat ? -1 : 1));
    return { message: messages(s, chat, [m])[0], user, at, chats: out };
  },

  view_text(s, p) {
    const res = fileDownload(s, p, null);
    const info = JSON.parse(res.headers.get('x-attachment'));
    if (info.folder) throw new Err(400, `${info.name} is a folder. Download it instead.`);
    return res.arrayBuffer().then((buf) => {
      let data = new Uint8Array(buf);
      const cut = data.length > TEXT_BYTES;
      if (cut) {
        data = data.subarray(0, TEXT_BYTES);
        const nl = data.lastIndexOf(10);
        if (nl >= 0) data = data.subarray(0, nl + 1);
      }
      const text = new TextDecoder('utf-8').decode(data).replace(/^﻿/, '').replace(/\0/g, '�');
      return { text, size: info.size, shown: data.length, cut };
    });
  },
};

export function viewDownload(s, p) {
  return fileDownload(s, p, null);
}

export { int };
