// What each request does: upstream SwarmChat's api.py (5ee0c0e, MIT). Every handler takes the swarm (with the
// caller's user id, or null for the super admin) and the request's parameters, and returns a JSON-ready object.
import { RuleError } from './policy.js';
import { Err, LEVELS, MESSAGE_ID, USER_ID, hex, int, list, now, sha256 } from './store.js';

const ordered = (ms) => ms.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.chat < b.chat ? -1 : a.chat > b.chat ? 1 : a.seq - b.seq));

function bound(s, value) {
  if (!value) return null;
  if (typeof value === 'string' && MESSAGE_ID.test(value.trim())) {
    const [chat, m] = s.find(value);
    return { at: m.at, chat: chat.id, seq: m.seq };
  }
  return String(value);
}

function compareBound(chat, m, b) {
  if (typeof b === 'object') {
    if (b.chat === chat.id) return Math.sign(m.seq - b.seq);
    const l = [m.at, chat.id, m.seq];
    const r = [b.at, b.chat, b.seq];
    for (let i = 0; i < 3; i++) if (l[i] !== r[i]) return l[i] > r[i] ? 1 : -1;
    return 0;
  }
  return m.at > b ? 1 : m.at < b ? -1 : 0;
}

// Up to n messages at these seqs in a chat, in their order, keeping those from `senders`, mentioning me, after
// `since`, before `before` and containing `search`. Reads only what it keeps or must look at, a batch at a time.
function pick(s, chat, seqs, n, { since, before, search, senders, mentions, skipOwn }) {
  const me = s.me;
  const found = [];
  const ment = new Set(s.cursor(chat).ment || []);
  const pos = s.position(chat);
  const plain = !since && !before && !search && !senders.size && !mentions;
  for (;;) {
    const batch = [];
    const size = plain ? n - found.length : Math.max(64, Math.min(256, (n - found.length) * 2));
    while (batch.length < size) {
      const next = seqs.next();
      if (next.done) break;
      const seq = next.value;
      if (skipOwn && s.own(chat, seq) === true) continue;
      if (mentions && seq > pos && !ment.has(seq)) continue;
      batch.push(seq);
    }
    if (!batch.length) break;
    for (const m of s.messageRows(chat, batch)) {
      if (skipOwn && m.from === me) continue;
      if (senders.size && !senders.has(m.from)) continue;
      if (mentions && !(m.mentions || []).includes(me)) continue;
      if (since && compareBound(chat, m, since) <= 0) continue;
      if (before && compareBound(chat, m, before) >= 0) continue;
      const shown = s.message(chat, m);
      if (search && !shown.text.toLowerCase().includes(search)) continue;
      found.push(shown);
      if (found.length >= n) return found;
    }
  }
  return found;
}

async function targetsOf(s, p) {
  return p.chat ? [await s.chatRef(p.chat)] : s.myChats();
}

function unreadLeft(s, chats) {
  s.loadCursors(chats.map((c) => [s.me, c]));
  return chats.reduce((n, c) => n + s.unread(s.chat(c.id) || c), 0);
}

function summaryOf(s, chat) {
  s.forget(chat);
  const fresh = s.chat(chat.id);
  return s.summary(fresh);
}

function text(p, key) {
  const v = p[key];
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

// ---------------------------------------------------------------------- requests for every user

export const METHODS = {
  whoami(s) {
    return { user: s.publicUser(s.me), hint: s.hint() };
  },

  people(s, p) {
    const ids = Object.keys(s.people).sort();
    s.loadUsers(ids);
    let found = ids.map((u) => s.publicUser(u));
    const q = text(p, 'search').toLowerCase();
    if (q) found = found.filter((u) => [u.id, u.name, u.status, ...Object.values(u.fields).map(String)].join(' ').toLowerCase().includes(q));
    return { people: found };
  },

  chats(s, p) {
    let found = s.summaries(s.myChats());
    if (p.unread) found = found.filter((c) => c.unread);
    if (p.with) {
      const wanted = list(p.with).map((u) => s.userRef(u));
      found = found.filter((c) => wanted.every((u) => c.members.some((m) => m.id === u)));
    }
    if (p.name) {
      const q = text(p, 'name').toLowerCase().replace(/^#+/, '');
      found = found.filter((c) => c.title.toLowerCase().includes(q));
    }
    const order = p.sort || 'recent';
    const keys = {
      recent: (a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0),
      unread: (a, b) => (b.unread - a.unread) || (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0),
      name: (a, b) => { const x = a.title.toLowerCase(); const y = b.title.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; },
    };
    if (!keys[order]) throw new Err(400, `sort is one of ${Object.keys(keys).join(', ')}.`);
    found.sort(keys[order]);
    return { chats: found.slice(0, int(p, 'limit', 20)) };
  },

  // Unread messages by default. last, all, since, before or search read history instead. thread reads a whole
  // thread, each message with its depth, and moves no read position. One reply holds at most max_page messages;
  // when more match, `more` is true and the same request with the reply's `cursor` gives the next page.
  async read(s, p) {
    const me = s.me;
    let fallback = false;
    let more = false;
    const most = s.settings.max_page;
    let cursor = p.cursor || {};
    if (typeof cursor !== 'object' || Array.isArray(cursor)) throw new Err(400, 'cursor is the one a previous reply gave.');
    let targets;
    let messages;
    let keep;
    if (p.thread) {
      const [chat, tree, rows] = s.thread(p.thread);
      const skip = int(cursor, 'skip', 0);
      const limit = Math.min(int(p, 'limit', 0) || most, most);
      const page = tree.slice(skip, skip + limit);
      more = skip + limit < tree.length;
      targets = [chat];
      keep = 'first';
      cursor = { skip: skip + page.length };
      messages = page.map(([seq, depth]) => ({ ...s.message(chat, rows.get(seq)), depth }));
    } else if (p.id) {
      const [chat, m] = s.find(p.id);
      targets = [chat];
      messages = [s.message(chat, m)];
      keep = 'first';
    } else {
      targets = await targetsOf(s, p);
      s.loadCursors(targets.map((c) => [me, c]));
      const senders = new Set(list(p.from).map((u) => s.userRef(u)));
      const since = bound(s, p.since);
      const before = bound(s, p.before);
      const search = text(p, 'search').toLowerCase();
      const history = !!(p.last || p.all || since || before || search);
      keep = history ? 'last' : 'first';
      const limit = Math.min(int(p, 'limit', 0) || int(p, 'last', 0) || (history ? 20 : 50), most);
      messages = [];
      const given = {};
      for (const [c, seq] of Object.entries(cursor)) given[c] = int(cursor, c, 0);
      cursor = given;
      for (const chat of targets) {
        let after;
        let upto;
        if (history) { after = 0; upto = cursor[chat.id] ?? null; }
        else { after = Math.max(s.position(chat), cursor[chat.id] || 0); upto = null; }
        if (since && typeof since === 'object' && since.chat === chat.id) after = Math.max(after, since.seq);
        if (before && typeof before === 'object' && before.chat === chat.id) upto = upto === null ? before.seq : Math.min(upto, before.seq);
        const found = pick(s, chat, s.seqs(me, chat, after, upto, history), limit + 1, {
          since, before, search, senders, mentions: !!p.mentions, skipOwn: !history,
        });
        more = more || found.length > limit;
        const page = found.slice(0, limit);
        messages.push(...(history ? page.reverse() : page));
      }
      if (!history && p.chat && !messages.length && !senders.size && !p.mentions && !Object.keys(cursor).length) {
        fallback = true;
        keep = 'last';
        const chat = targets[0];
        const seqs = [];
        for (const seq of s.seqs(me, chat, 0, null, true)) { seqs.push(seq); if (seqs.length >= 20) break; }
        messages = s.messageRows(chat, seqs.reverse()).map((m) => s.message(chat, m));
      }
      messages = ordered(messages);
      more = more || messages.length > limit;
      messages = keep === 'first' ? messages.slice(0, limit) : messages.slice(-limit);
      for (const m of messages) {
        const c = m.chat;
        cursor[c] = keep === 'first' ? Math.max(cursor[c] || 0, m.seq) : Math.min(cursor[c] ?? m.seq, m.seq);
      }
    }
    if (!p.peek && !p.thread) {
      const shown = {};
      for (const m of messages) (shown[m.chat] = shown[m.chat] || []).push(m.seq);
      s.markShown(shown);
    }
    return {
      messages, chats: s.titles(messages), unread_left: unreadLeft(s, targets), fallback, keep,
      more: more && !fallback, cursor: more ? cursor : null,
    };
  },

  // Marks read up to `positions` ({chat: seq}), and what a read showed (`shown`, {chat: [seq, …]}).
  async mark_read(s, p) {
    s.confirm(p.positions);
    if (p.shown !== undefined && p.shown !== null && (typeof p.shown !== 'object' || Array.isArray(p.shown))) {
      throw new Err(400, 'shown is {chat: [message seqs]}.');
    }
    s.markShown(p.shown || {});
    const targets = await targetsOf(s, p);
    return { ok: true, unread_left: unreadLeft(s, targets) };
  },

  async send(s, p) {
    if (!p.chat) throw new Err(400, 'Say where to send: a #channel, a person, people separated by commas, or a chat id.');
    const chat = await s.chatRef(p.chat, true);
    const message = s.send(chat, text(p, 'text'), p.reply_to || null);
    return { message, chat: summaryOf(s, chat) };
  },

  edit(s, p) {
    return { message: s.changeMessage(text(p, 'id'), 'edit', { text: p.text || '' }) };
  },

  delete(s, p) {
    return { message: s.changeMessage(text(p, 'id'), 'delete') };
  },

  react(s, p) {
    const emoji = text(p, 'emoji').trim();
    if (!emoji || [...emoji].length > 40) throw new Err(400, 'Give an emoji or a short word, up to 40 characters.');
    return { message: s.changeMessage(text(p, 'id'), 'react', { emoji, ...(p.remove ? { remove: true } : {}) }) };
  },

  chat_info: async (s, p) => {
    const chat = await s.chatRef(text(p, 'chat'));
    const info = s.summary(chat);
    s.loadUsers(chat.members.filter((u) => s.exists(u)));
    info.members = chat.members.map((u) => ({ ...s.publicUser(u), name: s.display(u) }));
    Object.assign(info, { created_by: chat.created_by, created_at: chat.created_at, messages: s.count(s.me, chat) });
    return { chat: info };
  },

  channel_create(s, p) {
    s.requireMe();
    const name = s.channelName(p.name);
    const description = s.description(p.description);
    s.require('create_channel');
    const members = [...new Set([s.me, ...list(p.members).map((u) => s.userRef(u))])].sort();
    const refusal = s.policy.create(s.me, members);
    if (refusal) throw new Err(403, refusal);
    s.nameFree(name);
    const chat = s.newChat(members, name, { isPublic: !!p.public, description });
    return { chat: s.summary(chat) };
  },

  // Public channels, which anyone may join, most recently active first. Archived ones take no one. The count of
  // messages is of those the caller may read: under while_member someone outside learns no count.
  channel_list(s, p) {
    const q = text(p, 'search').trim().replace(/^#+/, '').toLowerCase();
    const index = s.ds.findOne('swarm_chats', s.id);
    const found = s.loadChats(index?.channels || [])
      .filter((c) => c.public && !c.archived && c.name.toLowerCase().includes(q))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return {
      channels: found.slice(0, int(p, 'limit', 50)).map((c) => ({
        id: c.id, name: c.name, title: `#${c.name}`, description: c.description || '', members: c.members.length, last_at: c.at,
        messages: c.members.includes(s.me) || !s.limited(c) ? s.count(s.me, c) : null, joined: c.members.includes(s.me),
      })),
    };
  },

  channel_join(s, p) {
    return { chat: summaryOf(s, s.join(text(p, 'chat'))) };
  },

  async channel_visibility(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    if (p.visibility !== 'public' && p.visibility !== 'private') throw new Err(400, 'visibility is public or private.');
    s.setPublic(chat, p.visibility === 'public');
    return { chat: summaryOf(s, chat) };
  },

  async channel_add(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.changeMembers(chat, list(p.users));
    return { chat: summaryOf(s, chat) };
  },

  async channel_remove(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.changeMembers(chat, [], list(p.users));
    const fresh = summaryOf(s, chat);
    return { chat: s.chat(chat.id).members.includes(s.me) ? fresh : { id: chat.id } };
  },

  channel_leave(s, p) {
    return METHODS.channel_remove(s, { chat: p.chat, users: [s.me] });
  },

  async channel_rename(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.rename(chat, p.name || '');
    return { chat: summaryOf(s, chat) };
  },

  async channel_describe(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.describe(chat, p.description ?? '');
    return { chat: summaryOf(s, chat) };
  },

  async channel_managers(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    const add = list(p.add);
    const remove = list(p.remove);
    if (add.length || remove.length) s.setManagers(chat, add, remove);
    return { chat: summaryOf(s, chat) };
  },

  async channel_archive(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.archive(chat, true);
    return { chat: summaryOf(s, chat) };
  },

  async channel_unarchive(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    s.archive(chat, false);
    return { chat: summaryOf(s, chat) };
  },

  // Chats that need me, following my notification level for each: all, mentions or none.
  notifications(s, p) {
    const found = s.summaries(s.myChats()).filter((c) => p.all || (c.notify === 'all' && c.unread) || (c.notify === 'mentions' && c.mentioned));
    found.sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
    return {
      chats: found.slice(0, int(p, 'limit', 20)), unread: found.reduce((n, c) => n + c.unread, 0),
      mentions: found.reduce((n, c) => n + (c.mentioned ? 1 : 0), 0),
    };
  },

  // Answers at once (a v1 handler cannot hold a request open): what is pending from my read positions, or from
  // `after`, the positions a previous wait returned. An empty answer carries `retry_after` and the hint channel, on
  // which a realtime wake says "ask again" (swarmchat.mjs sleeps on it, spending nothing).
  async wait(s, p) {
    if (p.timeout !== undefined && p.timeout !== null) {
      const t = Number(p.timeout);
      if (!Number.isFinite(t) || t < 0 || typeof p.timeout === 'boolean') throw new Err(400, 'timeout must be a finite number of seconds at least 0.');
    }
    s.requireMe();
    const only = p.chat ? await s.chatRef(p.chat) : null;
    const senders = new Set(list(p.from).map((u) => s.userRef(u)));
    const after = p.after && typeof p.after === 'object' && !Array.isArray(p.after) ? p.after : {};
    if (only) s.member(only);
    const [found, positions] = s.pending(p, only, senders, after);
    if (!found.length) {
      s.guard();
      return { messages: [], positions, chats: {}, retry_after: 20, hint: s.hint() };
    }
    if (!p.peek) {
      const newest = {};
      for (const m of found) newest[m.chat] = Math.max(newest[m.chat] || 0, m.seq);
      s.markRead(Object.entries(newest).map(([c, seq]) => [s.chat(c), seq]));
    }
    return { messages: found, positions, chats: s.titles(found) };
  },

  async settings_notify(s, p) {
    const chat = await s.chatRef(text(p, 'chat'));
    const level = p.level || '';
    if (!LEVELS.includes(level)) throw new Err(400, `The level is one of ${LEVELS.join(', ')}.`);
    const id = `${s.id}:${s.me}`;
    s.ds.transaction((tx) => {
      const row = tx.findOne('users', id);
      tx.update('users', { id }, { $set: { notify: { ...(row.notify || {}), [chat.id]: level } } });
    });
    s._users.delete(s.me);
    s.wake([s.me]);
    return METHODS.settings_show(s);
  },

  settings_status(s, p) {
    const status = text(p, 'text').trim();
    s.write((tx, log) => {
      tx.update('users', { id: `${s.id}:${s.me}` }, { $set: { status } });
      log(null, 'user', { user: s.me, at: now() });
    });
    s._users.delete(s.me);
    s.feed();
    return METHODS.settings_show(s);
  },

  async settings_token(s) {
    return { token: await rotate(s, s.me) };
  },

  settings_show(s) {
    const row = s.user(s.me);
    return { user: s.publicUser(s.me), notify: { ...(row?.notify || {}) } };
  },
};

// ---------------------------------------------------------------------- the super admin, and whoever the rules allow

async function rotate(s, user) {
  const token = hex(24);
  const digest = await sha256(token);
  const hint = 'h-' + hex(16);
  const id = `${s.id}:${user}`;
  const row = s.ds.findOne('users', id);
  s.ds.transaction((tx) => {
    tx.update('users', { id }, { $set: { token_sha256: digest, hint } });
    const sw = tx.findOne('swarms', s.id);
    tx.update('swarms', { id: s.id }, { $set: { users: { ...sw.users, [user]: { ...sw.users[user], hint } } } });
  });
  s.kv.delete('tok:' + row.token_sha256);
  s.kv.set('tok:' + digest, { swarm: s.id, user });
  s.row.users = { ...s.row.users, [user]: { ...s.row.users[user], hint } };
  return token;
}

export async function addUser(s, id, name, fields) {
  id = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (!USER_ID.test(id)) throw new Err(400, "A user id is 1 to 40 of a-z, 0-9, '.', '_' and '-', starting with a letter or digit.");
  if (typeof (name ?? '') !== 'string' || (fields !== undefined && fields !== null && (typeof fields !== 'object' || Array.isArray(fields)))) {
    throw new Err(400, 'name must be text and fields must be an object.');
  }
  const cap = s.settings.max_users;
  const token = hex(24);
  const digest = await sha256(token);
  const hint = 'h-' + hex(16);
  const at = now();
  const profile = { name: name || id, fields: fields || {}, status: '' };
  s.write((tx, log) => {
    const sw = tx.findOne('swarms', s.id);
    if (sw.users?.[id]) throw new Err(400, `${id} already exists.`);
    if ((sw.retired || []).includes(id)) throw new Err(400, `${id} is a retired user id. Choose a new id; rotate a token to keep an existing identity.`);
    if (cap && Object.keys(sw.users || {}).length >= cap) throw new Err(403, `This swarm has its ${cap} agents, the most it may have. Remove one, or ask the workspace's owner.`);
    tx.insert('users', { id: `${s.id}:${id}`, swarm: s.id, user: id, ...profile, token_sha256: digest, hint, chats: [], notify: {}, created_at: at });
    const users = { ...(sw.users || {}), [id]: { name: profile.name, hint } };
    tx.update('swarms', { id: s.id }, { $set: { users } });
    s.row.users = users;
    log(null, 'user', { user: id, at });
  });
  s._names = null;
  s.kv.set('tok:' + digest, { swarm: s.id, user: id });
  s.feed();
  return { user: { id, ...profile }, token };
}

export async function removeUser(s, ref) {
  const user = s.userRef(ref);
  const leaver = Object.create(Object.getPrototypeOf(s));
  Object.assign(leaver, s, { me: user, _users: new Map(), _chats: new Map(), _cursors: new Map(), woken: new Set() });
  for (const chat of leaver.myChats()) if (chat.name) leaver.changeMembers(chat, [], [user]);
  const row = s.ds.findOne('users', `${s.id}:${user}`);
  const at = now();
  s.write((tx, log) => {
    const sw = tx.findOne('swarms', s.id);
    const users = { ...(sw.users || {}) };
    delete users[user];
    tx.update('swarms', { id: s.id }, { $set: { users, retired: [...(sw.retired || []), user] } });
    tx.update('users', { id: row.id }, { $set: { removed: at } });
    s.row.users = users;
    s.row.retired = [...(sw.retired || []), user];
    log(null, 'user', { user, at });
  });
  s._names = null;
  s.kv.delete('tok:' + row.token_sha256);
  s.feed();
}

export function setRules(s, rules) {
  try { new (s.policy.constructor)(rules); } catch (e) {
    if (e instanceof RuleError) throw new Err(400, e.message);
    throw e;
  }
  s.ds.update('swarms', { id: s.id }, { $set: { rules } });
  s.row.rules = rules;
  s._policy = null;
}

const ROLE_LISTS = { admin: ['admins', 'edit_admins'], channel_creator: ['channel_creators', 'edit_channel_creators'] };

export const ADMIN = {
  async user_add(s, p) {
    s.require('add_user');
    return addUser(s, p.id, p.name, p.fields);
  },

  async user_remove(s, p) {
    s.require('remove_user');
    await removeUser(s, text(p, 'id'));
    return { ok: true };
  },

  async token_rotate(s, p) {
    s.require('rotate_token');
    return { token: await rotate(s, s.userRef(text(p, 'id'))) };
  },

  policy_set(s, p) {
    if (s.me !== null) throw new Err(403, 'Only the super admin may set the rules.');
    const rules = p.rules || {};
    if (typeof rules !== 'object' || Array.isArray(rules)) throw new Err(400, 'The rules are a JSON object.');
    setRules(s, rules);
    return { rules: s.row.rules };
  },

  policy_show(s) {
    s.require('show_rules');
    return { rules: s.row.rules || {} };
  },

  // Shows who holds a role, or changes it: admin, or channel_creator, where `everyone` makes every user one.
  role_change(s, p) {
    const role = p.role;
    const add = list(p.add);
    const remove = list(p.remove);
    const everyone = !!p.everyone;
    if (!(role in ROLE_LISTS)) throw new Err(400, 'The role is admin or channel_creator.');
    if (everyone && (role !== 'channel_creator' || add.length || remove.length)) {
      throw new Err(400, 'Only channel_creator may be everyone, and then without names to add or remove.');
    }
    const [key, action] = ROLE_LISTS[role];
    s.require(add.length || remove.length || everyone ? action : 'show_rules');
    let users;
    if (add.length || remove.length || everyone) {
      const added = new Set(add.map((u) => s.userRef(u)));
      const removed = new Set(remove.map((u) => String(u).trim().toLowerCase()));
      const rules = { ...(s.row.rules || {}) };
      if (everyone) delete rules[key];
      else rules[key] = [...new Set([...(rules[key] || []).map((u) => u.trim().toLowerCase()), ...added])].filter((u) => !removed.has(u)).sort();
      setRules(s, rules);
      users = rules[key];
    } else users = (s.row.rules || {})[key];
    return { role, users: users === undefined || users === null ? (role === 'admin' ? [] : null) : users };
  },
};
