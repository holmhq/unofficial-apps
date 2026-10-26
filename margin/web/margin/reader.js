// Margin's reader: the account menu, claps, quote comments, responses, sharing and link
// previews. Pages work without it; this only adds what needs a signed-in person.

const boot = JSON.parse(document.getElementById('m-boot')?.textContent || '{}');
const postId = boot.post || null;
const phone = () => window.matchMedia('(max-width: 760px)').matches;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' };
  if (options.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(options.body); }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'Something went wrong.'), { status: res.status, code: data?.error?.code });
  return data;
}

function toast(text) {
  $('.m-toast')?.remove();
  const el = h(`<div class="m-toast" role="status">${esc(text)}</div>`);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ago(iso) {
  const t = Date.parse(iso);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ''}`;
}
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const ICON = {
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092a10 10 0 1 0-4.777-4.719"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12l7-7l7 7m-7 7V5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 21h8m.174-14.188a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5l-5-5m5 5H9"/></svg>',
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5l-5-5m5 5H3"/></svg>',
  clap: '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M188.87 65a18 18 0 0 0-31.25 18l-24.26-42a18 18 0 0 0-31.22 18L96.4 49a18 18 0 0 0-31.22 18l3.34 5.77A26 26 0 0 0 39.74 111l3 5.2A26 26 0 0 0 23.5 155l35.27 61a80.14 80.14 0 0 0 149.52-39.57a71.92 71.92 0 0 0 1.71-74.85Zm1.2 127.56A64.12 64.12 0 0 1 72.65 208l-35.27-61a10 10 0 0 1 17.34-10L75 172a8 8 0 0 0 13.87-8l-35.25-61A10 10 0 0 1 71 93l31.81 55a8 8 0 0 0 13.87-8l-26-45a10 10 0 0 1 17.35-10l36.5 63a8 8 0 0 0 13.87-8l-12.6-21.75a10 10 0 0 1 17.64-9.25l20.22 35a63.52 63.52 0 0 1 6.41 48.57Z"/></svg>',
};

// ---------- who is reading ----------

let me = null;
const ready = api('/api/me?return=' + encodeURIComponent(location.pathname + location.search)).then((d) => (me = d)).catch(() => (me = { signed_in: false, login_url: boot.signin }));
const signinURL = () => (me && me.login_url) || boot.signin || '/auth/login';

function signInDialog(title, text) {
  closeDialog();
  const scrim = h('<div class="m-scrim" data-m-dialog></div>');
  const box = h(`<div class="m-dialog" role="dialog" aria-modal="true" aria-labelledby="m-dialog-title" data-m-dialog>
    <div class="m-dialog-icon">${ICON.clap}</div>
    <h2 id="m-dialog-title">${esc(title)}</h2><p>${esc(text)}</p>
    <div class="m-dialog-actions"><a class="m-button" href="${esc(signinURL())}">Sign in</a><button type="button" class="m-button m-quiet" data-close>Not now</button></div></div>`);
  scrim.addEventListener('click', closeDialog);
  box.querySelector('[data-close]').addEventListener('click', closeDialog);
  document.body.append(scrim, box);
  box.querySelector('.m-button').focus();
}
function closeDialog() { $$('[data-m-dialog]').forEach((el) => el.remove()); }

// ---------- theme ----------

function setTheme(value) {
  try { if (value === 'system') localStorage.removeItem('margin.theme'); else localStorage.setItem('margin.theme', value); } catch { /* private mode */ }
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}
function currentTheme() { try { return localStorage.getItem('margin.theme') || 'system'; } catch { return 'system'; } }

// ---------- account menu ----------

async function account() {
  const slot = $('[data-m-account]');
  if (!slot) return;
  await ready;
  const btn = h(`<button type="button" class="m-avatar-button" aria-haspopup="menu" aria-expanded="false" aria-label="${me.signed_in ? 'Account' : 'Sign in'}"></button>`);
  if (me.signed_in && me.picture) btn.append(h(`<img src="${esc(me.picture)}" alt="">`));
  else btn.innerHTML = ICON.user;
  slot.replaceChildren(btn);
  if (me.writer) {
    api('/api/inbox?status=pending&limit=1').then((d) => {
      if (d.pending_count) slot.append(h(`<span class="m-avatar-badge">${d.pending_count > 99 ? '99+' : d.pending_count}</span>`));
      me.pending = d.pending_count;
    }).catch(() => {});
  }
  let menu = null;
  const close = () => { menu?.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu) return close();
    const theme = currentTheme();
    const seg = `<div class="m-seg" role="group" aria-label="Appearance">${['light', 'dark', 'system'].map((t) => `<button type="button" data-theme-pick="${t}" aria-pressed="${t === theme}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`;
    let html;
    if (me.signed_in) {
      const sub = me.handle ? '@' + me.handle : me.role === 'reader' ? 'Reader' : me.role[0].toUpperCase() + me.role.slice(1);
      html = `<div class="m-menu" role="menu">
        <div class="m-menu-head">${me.picture ? `<img src="${esc(me.picture)}" alt="">` : '<span class="m-menu-ph"></span>'}<div style="min-width:0"><div class="m-menu-name">${esc(me.name || 'You')}</div><div class="m-menu-sub">${esc(sub)}</div></div></div>
        ${me.writer ? `<a class="m-menu-item" role="menuitem" href="/studio/write">${ICON.pen}Write a post</a>
        <a class="m-menu-item" role="menuitem" href="/studio">${ICON.grid}Studio${me.pending ? `<span class="m-menu-count">${me.pending}</span>` : ''}</a>` : ''}
        ${me.handle ? `<a class="m-menu-item" role="menuitem" href="/@${esc(me.handle)}">${ICON.user}Your blog</a>` : ''}
        <div class="m-menu-sep"></div>${seg}<div class="m-menu-sep"></div>
        <button type="button" class="m-menu-item" role="menuitem" data-signout>${ICON.out}Sign out</button></div>`;
    } else {
      html = `<div class="m-menu" role="menu">
        <a class="m-menu-item" role="menuitem" href="${esc(signinURL())}">${ICON.in}Sign in</a>
        <div class="m-menu-sep"></div>${seg}</div>`;
    }
    menu = h(html);
    slot.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    menu.addEventListener('click', async (ev) => {
      const pick = ev.target.closest('[data-theme-pick]');
      if (pick) {
        setTheme(pick.dataset.themePick);
        $$('[data-theme-pick]', menu).forEach((b) => b.setAttribute('aria-pressed', String(b === pick)));
        return;
      }
      if (ev.target.closest('[data-signout]')) {
        await fetch(me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }).catch(() => {});
        location.reload();
      }
    });
  });
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// ---------- claps ----------

function claps() {
  const buttons = $$('[data-m-clap]');
  if (!buttons.length || !postId) return;
  let mine = 0;
  let total = Number($('[data-m-clap-count]')?.textContent || 0) || 0;
  let queued = 0;
  let timer = null;
  const paint = () => {
    for (const b of buttons) {
      b.classList.toggle('m-clapped', mine > 0);
      const count = b.querySelector('[data-m-clap-count]');
      if (count) count.textContent = total ? total.toLocaleString() : '';
      b.setAttribute('aria-label', mine ? `Clap (you clapped ${mine})` : 'Clap');
    }
  };
  ready.then(() => {
    if (!me.signed_in) return;
    api(`/api/posts/${postId}/state`).then((s) => { mine = s.mine; total = s.claps; paint(); }).catch(() => {});
  });
  const flush = async () => {
    const add = queued;
    queued = 0;
    if (!add) return;
    try {
      const r = await api(`/api/posts/${postId}/claps`, { method: 'POST', body: { add } });
      mine = r.mine;
      total = r.total;
      paint();
    } catch (error) { toast(error.message); }
  };
  const one = (button) => {
    if (mine + queued >= 50) {
      burst(button, 'Max');
      return false;
    }
    queued++;
    total++;
    paint();
    mine = Math.max(mine, 0);
    burst(button, `+${mine + queued}`);
    button.classList.remove('m-pulse');
    void button.offsetWidth;
    button.classList.add('m-pulse');
    if (navigator.vibrate) navigator.vibrate(4);
    clearTimeout(timer);
    timer = setTimeout(flush, 650);
    return true;
  };
  for (const button of buttons) {
    let hold = null;
    let held = false;
    const stop = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
    button.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (!me) return;
      if (!me.signed_in) return;
      held = false;
      hold = setTimeout(() => {
        held = true;
        hold = setInterval(() => { if (!one(button)) stop(); }, 130);
      }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => button.addEventListener(t, stop));
    button.addEventListener('contextmenu', (e) => e.preventDefault());
    button.addEventListener('click', async () => {
      await ready;
      if (!me.signed_in) return signInDialog('Sign in to clap', 'Claps tell the writer which posts land. You can clap up to 50 times.');
      if (held) { held = false; return; }
      one(button);
    });
  }
  window.addEventListener('pagehide', () => { if (queued) navigator.sendBeacon?.(`/api/posts/${postId}/claps`, new Blob([JSON.stringify({ add: queued })], { type: 'application/json' })); });
}

function burst(button, text) {
  const icon = button.querySelector('.m-clap-icon') || button;
  icon.querySelector('.m-burst')?.remove();
  const el = h(`<span class="m-burst">${esc(text)}</span>`);
  icon.append(el);
  setTimeout(() => el.remove(), 720);
}

// ---------- share ----------

function share() {
  for (const button of $$('[data-m-share]')) {
    button.addEventListener('click', async () => {
      const url = location.origin + location.pathname;
      if (navigator.share && phone()) {
        try { await navigator.share({ title: boot.title || document.title, url }); } catch { /* cancelled */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); }
    });
  }
}

// ---------- text anchoring ----------

const body = $('[data-m-body]');
const norm = (s) => s.replace(/\s+/g, ' ');

// The post's text with every character mapped back to its DOM text node.
function textIndex() {
  const nodes = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.m-burst, .m-seltool, figcaption, .m-notes') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let text = '';
  const map = [];
  let lastSpace = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n);
    const value = n.nodeValue;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (/\s/.test(ch)) {
        if (lastSpace) continue;
        text += ' ';
        lastSpace = true;
      } else {
        text += ch;
        lastSpace = false;
      }
      map.push([n, i]);
    }
    // Block boundaries count as a space.
    if (!lastSpace && /^(P|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH|FIGCAPTION|DIV)$/.test(n.parentElement.tagName) && n === n.parentElement.lastChild) { text += ' '; map.push([n, value.length]); lastSpace = true; }
  }
  return { text, map };
}

function locate(index, quote) {
  const exact = norm(quote.exact).trim();
  if (!exact) return null;
  let best = null;
  let at = index.text.indexOf(exact);
  while (at !== -1) {
    const before = index.text.slice(Math.max(0, at - 64), at);
    const after = index.text.slice(at + exact.length, at + exact.length + 64);
    let score = 0;
    const p = norm(quote.prefix || '');
    const s = norm(quote.suffix || '');
    for (let i = 1; i <= Math.min(p.length, before.length); i++) { if (p[p.length - i] === before[before.length - i]) score++; else break; }
    for (let i = 0; i < Math.min(s.length, after.length); i++) { if (s[i] === after[i]) score++; else break; }
    if (!best || score > best.score) best = { start: at, end: at + exact.length, score };
    at = index.text.indexOf(exact, at + 1);
  }
  return best;
}

function wrap(index, start, end, attrs) {
  const marks = [];
  const pieces = new Map();
  for (let i = start; i < end; i++) {
    const [node, offset] = index.map[i];
    if (offset >= node.nodeValue.length) continue;
    const piece = pieces.get(node) || { from: offset, to: offset };
    piece.from = Math.min(piece.from, offset);
    piece.to = Math.max(piece.to, offset + 1);
    pieces.set(node, piece);
  }
  for (const [node, { from, to }] of pieces) {
    if (!node.parentNode) continue;
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < target.nodeValue.length) target.splitText(to - from);
    const mark = document.createElement('mark');
    mark.className = attrs.className;
    for (const [k, v] of Object.entries(attrs.data || {})) mark.dataset[k] = v;
    target.parentNode.insertBefore(mark, target);
    mark.append(target);
    marks.push(mark);
  }
  return marks;
}

function unwrap(selector) {
  for (const mark of $$(selector, body)) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  }
}

function quoteFromSelection(range, text) {
  // Selection text keeps line breaks between paragraphs; a Range's toString() drops them.
  const exact = norm(text || range.toString()).trim().slice(0, 600);
  const before = document.createRange();
  before.setStart(body, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(body, body.childNodes.length);
  return { exact, prefix: norm(before.toString()).slice(-60).trimStart(), suffix: norm(after.toString()).slice(0, 60).trimEnd() };
}

// ---------- comments ----------

const state = { comments: [], canModerate: false, moderation: 'outsiders', groups: [], loaded: false };
const groupKey = (q) => norm(q.exact).trim().toLowerCase();

async function loadComments() {
  if (!postId) return;
  try {
    const data = await api(`/api/posts/${postId}/comments`);
    state.comments = data.comments;
    state.canModerate = data.can_moderate;
    state.moderation = data.moderation;
    state.loaded = true;
  } catch { return; }
  paintHighlights();
  paintResponses();
  paintCounts();
  panel.refresh();
  notes.paint();
}

function roots() { return state.comments.filter((c) => !c.parent_id); }
function repliesOf(id) { return state.comments.filter((c) => c.parent_id === id); }

function paintCounts() {
  const visible = state.comments.filter((c) => c.status === 'approved' && !c.sample).length;
  for (const el of $$('[data-m-open-comments] .m-count')) el.textContent = visible || '';
}

function paintHighlights() {
  if (!body) return;
  unwrap('mark.m-hl');
  const groups = new Map();
  for (const c of roots()) {
    if (!c.quote) continue;
    const key = groupKey(c.quote);
    if (!groups.has(key)) groups.set(key, { key, quote: c.quote, roots: [] });
    groups.get(key).roots.push(c);
  }
  state.groups = [...groups.values()];
  const index = textIndex();
  const placed = [];
  for (const g of state.groups) {
    const found = locate(index, g.quote);
    if (!found) { g.marks = []; continue; }
    g.start = found.start;
    placed.push({ g, found });
  }
  // Wrap from the end so earlier offsets stay valid.
  placed.sort((a, b) => b.found.start - a.found.start);
  for (const { g, found } of placed) {
    const pending = g.roots.every((c) => c.status === 'pending');
    g.marks = wrap(index, found.start, found.end, { className: `m-hl${pending ? ' m-hl-pending' : ''}`, data: { group: g.key } });
  }
  state.groups.sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
}

function flash(group) {
  const marks = $$(`mark.m-hl`, body).filter((m) => m.dataset.group === group.key);
  if (!marks.length) return;
  marks[0].scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  marks.forEach((m) => m.classList.add('m-hl-on'));
  setTimeout(() => marks.forEach((m) => { if (!panel.isOpenFor(group.key)) m.classList.remove('m-hl-on'); }), 1600);
}

function authorAvatar(a, cls = 'm-msg-avatar') {
  return a.avatar ? `<img class="${cls}" src="${esc(a.avatar)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;
}

// One chat bubble.
function bubble(c, prev) {
  const follow = prev && prev.author.name === c.author.name && !prev.quote && !c.quote && Date.parse(c.created_at) - Date.parse(prev.created_at) < 600000;
  const tools = [];
  if (me && me.signed_in) tools.push('<button type="button" class="m-link-button" data-act="reply">Reply</button>');
  if (state.canModerate && c.status === 'pending') tools.push('<button type="button" class="m-link-button m-good" data-act="approve">Approve</button><button type="button" class="m-link-button m-bad" data-act="reject">Reject</button>');
  if (c.can_delete) tools.push('<button type="button" class="m-link-button" data-act="delete">Delete</button>');
  const tags = [c.author.is_author ? '<span class="m-badge">Author</span>' : '', c.status === 'pending' ? '<span class="m-tag">Pending</span>' : '', c.status === 'rejected' ? '<span class="m-tag">Hidden</span>' : '', c.sample ? '<span class="m-tag">Sample</span>' : ''].join('');
  return `<div class="m-msg${c.mine ? ' m-mine' : ''}${follow ? ' m-follow' : ''}${c.status === 'pending' ? ' m-pending' : ''}" data-id="${c.id}">
    ${c.mine ? (tags ? `<div class="m-msg-name">${tags}</div>` : '') : `<div class="m-msg-name">${c.author.url ? `<a href="${esc(c.author.url)}">${esc(c.author.name)}</a>` : esc(c.author.name)}${tags}</div>`}
    <div class="m-msg-row">${c.mine ? '' : authorAvatar(c.author)}<div class="m-bubble">${c.body_html}<span class="m-time">${esc(clock(c.created_at))}</span></div></div>
    ${tools.length ? `<div class="m-msg-tools">${tools.join('')}</div>` : ''}</div>`;
}

async function act(id, action) {
  try {
    if (action === 'delete') {
      if (!confirm('Delete this comment?')) return;
      await api(`/api/comments/${id}`, { method: 'DELETE' });
    } else await api(`/api/comments/${id}`, { method: 'PATCH', body: { action } });
    await loadComments();
    toast(action === 'approve' ? 'Approved' : action === 'reject' ? 'Hidden from readers' : 'Deleted');
  } catch (error) { toast(error.message); }
}

async function send({ body: text, quote, parent }) {
  const payload = { body: text };
  if (quote) payload.quote = quote;
  if (parent) payload.parent_id = parent;
  const saved = await api(`/api/posts/${postId}/comments`, { method: 'POST', body: payload });
  state.comments.push(saved);
  if (saved.status === 'pending') toast('Sent. It shows once the author approves it.');
  await loadComments();
  return saved;
}

function grow(textarea) {
  const fit = () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px'; };
  textarea.addEventListener('input', fit);
  fit();
}

// The side panel (wide screens) or bottom sheet (phones) for comment threads.
const panel = (() => {
  let el = null;
  let scrim = null;
  let view = { mode: 'all', group: null, draft: null, replyTo: null };

  function open(next) {
    view = { mode: 'all', group: null, draft: null, replyTo: null, ...next };
    if (!el) {
      const sheet = phone();
      el = h(`<aside class="m-panel${sheet ? ' m-sheet' : ''}" role="dialog" aria-label="Comments">${sheet ? '<div class="m-grab"></div>' : ''}
        <div class="m-panel-head"><div class="m-panel-title"></div><div data-seg></div><button type="button" class="m-icon-button" data-close aria-label="Close">${ICON.close}</button></div>
        <div data-quote></div><div class="m-panel-body" data-list></div><div data-foot></div></aside>`);
      if (sheet) {
        scrim = h('<div class="m-scrim"></div>');
        scrim.addEventListener('click', close);
        document.body.append(scrim);
        swipeToClose(el);
      }
      el.querySelector('[data-close]').addEventListener('click', close);
      el.addEventListener('click', onClick);
      document.body.append(el);
      if (!sheet) document.documentElement.classList.add('m-with-panel');
    }
    render();
    highlight();
  }

  function close() {
    unwrap('mark.m-hl-draft');
    el?.remove();
    scrim?.remove();
    document.documentElement.classList.remove('m-with-panel');
    el = null;
    scrim = null;
    $$('mark.m-hl-on', body || document).forEach((m) => m.classList.remove('m-hl-on'));
    view = { mode: 'all', group: null, draft: null, replyTo: null };
  }

  function highlight() {
    $$('mark.m-hl', body || document).forEach((m) => m.classList.toggle('m-hl-on', !!view.group && m.dataset.group === view.group.key));
  }

  function swipeToClose(sheet) {
    let y0 = null;
    const grab = sheet.querySelector('.m-grab');
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (y0 !== null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    grab.addEventListener('pointerup', (e) => { const d = e.clientY - (y0 ?? e.clientY); y0 = null; if (d > 90) close(); else sheet.style.transform = ''; });
  }

  function threadHTML(list) {
    let html = '';
    let prev = null;
    for (const c of list) { html += bubble(c, prev); prev = c; }
    return html;
  }

  function render() {
    if (!el) return;
    const title = el.querySelector('.m-panel-title');
    const seg = el.querySelector('[data-seg]');
    const quoteSlot = el.querySelector('[data-quote]');
    const list = el.querySelector('[data-list]');
    const foot = el.querySelector('[data-foot]');
    const total = state.comments.length;
    if (view.group || view.draft) {
      const q = view.draft || view.group.quote;
      title.textContent = view.draft ? 'New comment' : 'Comments';
      seg.innerHTML = `<div class="m-seg"><button type="button" aria-pressed="true">This quote</button><button type="button" data-all aria-pressed="false">All ${total || ''}</button></div>`;
      quoteSlot.innerHTML = `<div class="m-panel-quote">${esc(q.exact)}</div>`;
      if (view.group) {
        const msgs = view.group.roots.flatMap((r) => [r, ...repliesOf(r.id)]);
        list.innerHTML = threadHTML(msgs) + (msgs.some((m) => m.status === 'pending' && m.mine) ? '<div class="m-note">Waiting for the author to approve</div>' : '');
      } else list.innerHTML = '<div class="m-panel-empty"><strong>Say something about this</strong>Your comment will sit beside this passage for everyone reading.</div>';
    } else {
      title.textContent = total ? `${total} comment${total === 1 ? '' : 's'}` : 'Comments';
      seg.innerHTML = '';
      quoteSlot.innerHTML = '';
      if (!roots().length) list.innerHTML = '<div class="m-panel-empty"><strong>No comments yet</strong>Select any passage to comment on it, or respond to the whole post below.</div>';
      else {
        let html = '';
        for (const r of roots()) {
          if (r.quote) html += `<div class="m-thread-quote" data-goto="${esc(groupKey(r.quote))}"><span>${esc(r.quote.exact)}</span></div>`;
          else html += '<div class="m-thread-break"></div>';
          html += threadHTML([r, ...repliesOf(r.id)]);
        }
        list.innerHTML = html;
      }
    }
    foot.innerHTML = composer();
    const ta = foot.querySelector('textarea');
    if (ta) {
      grow(ta);
      const sendBtn = foot.querySelector('.m-send');
      const sync = () => { sendBtn.disabled = !ta.value.trim(); };
      ta.addEventListener('input', sync);
      sync();
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(ta); } });
      sendBtn.addEventListener('click', () => submit(ta));
      if (view.draft || view.replyTo) setTimeout(() => ta.focus({ preventScroll: true }), 60);
    }
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  function composer() {
    if (!me || !me.signed_in) return `<div class="m-signin-card"><span>Sign in to join the conversation.</span><a class="m-button" href="${esc(signinURL())}">Sign in</a></div>`;
    const reply = view.replyTo ? state.comments.find((c) => c.id === view.replyTo) : null;
    const hint = state.moderation === 'all' || (state.moderation === 'outsiders' && !me.writer) ? (state.canModerate ? '' : ' (the author approves comments)') : '';
    return `<div class="m-compose"><div class="m-compose-field">
      ${reply ? `<div class="m-compose-reply"><span>Replying to ${esc(reply.author.name)}</span><button type="button" data-cancel-reply aria-label="Cancel reply">×</button></div>` : ''}
      <textarea rows="1" placeholder="${view.draft ? 'Add a comment' : reply ? 'Reply' : view.group ? 'Reply' : 'Respond to the post'}${esc(hint)}" aria-label="Comment"></textarea></div>
      <button type="button" class="m-send" aria-label="Send" disabled>${ICON.up}</button></div>`;
  }

  async function submit(ta) {
    const text = ta.value.trim();
    if (!text) return;
    const btn = el.querySelector('.m-send');
    btn.disabled = true;
    try {
      if (view.draft) {
        const saved = await send({ body: text, quote: view.draft });
        unwrap('mark.m-hl-draft');
        const g = state.groups.find((x) => x.roots.some((r) => r.id === saved.id));
        view = { mode: 'quote', group: g || null, draft: g ? null : view.draft, replyTo: null };
      } else if (view.replyTo) {
        await send({ body: text, parent: view.replyTo });
        view.replyTo = null;
      } else if (view.group) {
        await send({ body: text, parent: view.group.roots[0].id });
        view.group = state.groups.find((x) => x.key === view.group.key) || view.group;
      } else {
        await send({ body: text });
      }
      render();
      highlight();
    } catch (error) {
      toast(error.message);
      btn.disabled = false;
    }
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-all]')) { unwrap('mark.m-hl-draft'); view = { mode: 'all', group: null, draft: null, replyTo: null }; render(); highlight(); return; }
    if (t.closest('[data-cancel-reply]')) { view.replyTo = null; render(); return; }
    const goto = t.closest('[data-goto]');
    if (goto) {
      const g = state.groups.find((x) => x.key === goto.dataset.goto);
      if (g) { view = { mode: 'quote', group: g, draft: null, replyTo: null }; render(); highlight(); flash(g); }
      return;
    }
    const button = t.closest('[data-act]');
    if (button) {
      const id = button.closest('[data-id]').dataset.id;
      if (button.dataset.act === 'reply') { view.replyTo = id; render(); return; }
      act(id, button.dataset.act);
    }
  }

  return {
    open, close, render,
    refresh() {
      if (!el) return;
      if (view.group) view.group = state.groups.find((x) => x.key === view.group.key) || null;
      render();
      highlight();
    },
    isOpenFor(key) { return !!el && !!view.group && view.group.key === key; },
    openGroup(key) { const g = state.groups.find((x) => x.key === key); if (g) open({ mode: 'quote', group: g }); },
    draft(quote) { open({ mode: 'quote', draft: quote }); },
  };
})();

// Wide screens with the "margin" layout: the first note of each passage sits beside it.
const notes = (() => {
  let layer = null;
  const enabled = () => boot.layout === 'margin' && body && !phone() && body.getBoundingClientRect().right + 300 < document.documentElement.clientWidth;
  function paint() {
    layer?.remove();
    layer = null;
    if (!enabled() || !state.groups.length) return;
    const rect = body.getBoundingClientRect();
    const left = rect.right + window.scrollX + 56;
    const width = Math.min(280, document.documentElement.clientWidth - (rect.right + 56) - 24);
    if (width < 200) return;
    layer = h('<div class="m-notes" aria-label="Comments beside the text"></div>');
    let bottom = 0;
    for (const g of state.groups) {
      if (!g.marks || !g.marks.length || !g.marks[0].isConnected) continue;
      const top = Math.max(g.marks[0].getBoundingClientRect().top + window.scrollY - 6, bottom + 12);
      const first = g.roots[0];
      const count = g.roots.reduce((n, r) => n + 1 + repliesOf(r.id).length, 0);
      const card = h(`<div class="m-note-card" style="left:${left}px;top:${top}px;--m-note-width:${width}px" data-group="${esc(g.key)}" role="button" tabindex="0" aria-label="Open comments on this passage">
        <div class="m-note-count">${ICON.comment}${count} comment${count === 1 ? '' : 's'}</div>
        <div class="m-note-item"><div class="m-note-who">${authorAvatar(first.author, '')}${esc(first.author.name)}${first.author.is_author ? '<span class="m-badge">Author</span>' : ''}<time>${esc(ago(first.created_at))}</time></div>
        <div class="m-note-text">${first.body_html}</div></div>
        ${count > 1 ? `<div class="m-note-more">${count - 1} more</div>` : ''}</div>`);
      card.addEventListener('click', () => panel.openGroup(g.key));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') panel.openGroup(g.key); });
      layer.append(card);
      document.body.append(layer);
      bottom = top + card.offsetHeight;
    }
    if (layer && !layer.isConnected) document.body.append(layer);
  }
  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(paint, 150); });
  return { paint };
})();

// The responses section at the end of the post.
function paintResponses() {
  const section = $('[data-m-comments]');
  if (!section) return;
  const slot = section.querySelector('[data-m-composer]');
  const threads = section.querySelector('[data-m-threads]');
  if (slot && !slot.dataset.ready) {
    slot.dataset.ready = '1';
    if (me && me.signed_in) {
      slot.innerHTML = `<div class="m-card-compose"><div class="m-card-compose-top">${me.picture ? `<img src="${esc(me.picture)}" alt="">` : ''}${esc(me.name || 'You')}</div>
        <textarea rows="2" placeholder="What are your thoughts?" aria-label="Your response"></textarea>
        <div class="m-card-compose-foot"><span></span><button type="button" class="m-button" disabled>Respond</button></div></div>`;
      const ta = slot.querySelector('textarea');
      const btn = slot.querySelector('.m-button');
      const hint = slot.querySelector('.m-card-compose-foot span');
      if (state.moderation === 'all' || (state.moderation === 'outsiders' && !me.writer)) hint.textContent = state.canModerate ? '' : 'The author approves responses before they appear.';
      ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 280) + 'px'; });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await send({ body: ta.value.trim() }); ta.value = ''; ta.style.height = ''; } catch (error) { toast(error.message); btn.disabled = false; }
      });
    } else {
      const link = slot.querySelector('a');
      if (link) link.href = signinURL();
    }
  }
  if (!threads) return;
  let html = '';
  for (const r of roots()) {
    html += `<div class="m-thread">${response(r, false)}${repliesOf(r.id).map((c) => response(c, true)).join('')}</div>`;
  }
  threads.innerHTML = html || '<p class="m-empty">No responses yet. Be the first, or select a passage to comment on it.</p>';
  const title = section.querySelector('.m-responses-title');
  const visible = state.comments.filter((c) => c.status === 'approved' && !c.sample).length;
  if (title) title.innerHTML = `Responses${visible ? ` <span class="m-count">(${visible})</span>` : ''}`;
}

function response(c, reply) {
  const tools = [];
  if (me && me.signed_in && !reply) tools.push('<button type="button" class="m-link-button" data-act="reply">Reply</button>');
  if (state.canModerate && c.status === 'pending') tools.push('<button type="button" class="m-link-button m-good" data-act="approve">Approve</button><button type="button" class="m-link-button m-bad" data-act="reject">Reject</button>');
  if (c.can_delete) tools.push('<button type="button" class="m-link-button" data-act="delete">Delete</button>');
  const tags = [c.author.is_author ? '<span class="m-badge">Author</span>' : '', c.status === 'pending' ? '<span class="m-tag">Pending</span>' : '', c.status === 'rejected' ? '<span class="m-tag">Hidden</span>' : '', c.sample ? '<span class="m-tag">Sample</span>' : ''].join('');
  return `<article class="m-response${reply ? ' m-reply' : ''}" id="c-${c.id}" data-id="${c.id}">
    <header class="m-response-head">${c.author.avatar ? `<img class="m-avatar" src="${esc(c.author.avatar)}" alt="" loading="lazy">` : '<span class="m-avatar m-avatar-empty"></span>'}
    <span class="m-response-name">${c.author.url ? `<a href="${esc(c.author.url)}">${esc(c.author.name)}</a>` : esc(c.author.name)}</span>${tags}<time datetime="${esc(c.created_at)}">${esc(ago(c.created_at))}</time></header>
    ${c.quote ? `<blockquote class="m-response-quote" data-goto="${esc(groupKey(c.quote))}">${esc(c.quote.exact)}</blockquote>` : ''}
    <div class="m-response-body">${c.body_html}</div>
    ${tools.length ? `<div class="m-response-tools">${tools.join('')}</div>` : ''}</article>`;
}

function responsesEvents() {
  const section = $('[data-m-comments]');
  if (!section) return;
  section.addEventListener('click', async (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      const g = state.groups.find((x) => x.key === goto.dataset.goto);
      if (g) { flash(g); setTimeout(() => panel.openGroup(g.key), 350); }
      return;
    }
    const button = e.target.closest('[data-act]');
    if (!button) return;
    const id = button.closest('[data-id]').dataset.id;
    if (button.dataset.act === 'reply') return inlineReply(button.closest('.m-thread'), id);
    act(id, button.dataset.act);
  });
}

function inlineReply(thread, id) {
  if (thread.querySelector('.m-card-compose')) return thread.querySelector('textarea').focus();
  const box = h(`<div class="m-card-compose" style="margin:14px 0 0 20px"><textarea rows="2" placeholder="Write a reply" aria-label="Reply"></textarea>
    <div class="m-card-compose-foot"><span></span><button type="button" class="m-button m-quiet" data-cancel>Cancel</button><button type="button" class="m-button" disabled data-send>Reply</button></div></div>`);
  thread.append(box);
  const ta = box.querySelector('textarea');
  const btn = box.querySelector('[data-send]');
  ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); });
  box.querySelector('[data-cancel]').addEventListener('click', () => box.remove());
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await send({ body: ta.value.trim(), parent: id }); } catch (error) { toast(error.message); btn.disabled = false; }
  });
  ta.focus();
}

// ---------- the selection bar ----------

function selectionBar() {
  if (!body) return;
  let bar = null;
  let range = null;
  let selected = '';
  const hide = () => { bar?.remove(); bar = null; };
  const show = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
    const r = sel.getRangeAt(0);
    if (!body.contains(r.commonAncestorContainer)) return hide();
    const text = norm(r.toString()).trim();
    if (text.length < 3) return hide();
    range = r.cloneRange();
    selected = sel.toString();
    const rects = r.getClientRects();
    const box = rects.length ? rects[0] : r.getBoundingClientRect();
    const last = rects.length ? rects[rects.length - 1] : box;
    hide();
    bar = h(`<div class="m-seltool" role="toolbar" aria-label="Selection">
      <button type="button" data-sel="comment">${ICON.comment}Comment</button><span class="m-seltool-sep"></span>
      <button type="button" data-sel="link">${ICON.link}Link to quote</button></div>`);
    document.body.append(bar);
    const below = phone() || ('ontouchstart' in window);
    const anchor = below ? last : box;
    let x = anchor.left + window.scrollX + anchor.width / 2 - bar.offsetWidth / 2;
    x = Math.max(window.scrollX + 10, Math.min(x, window.scrollX + document.documentElement.clientWidth - bar.offsetWidth - 10));
    const y = below ? anchor.bottom + window.scrollY + 14 : box.top + window.scrollY - bar.offsetHeight - 12;
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
    bar.classList.toggle('m-below', below);
    bar.style.setProperty('--m-arrow', `${Math.max(16, Math.min(bar.offsetWidth - 16, anchor.left + window.scrollX + anchor.width / 2 - x))}px`);
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', async (e) => {
      const which = e.target.closest('[data-sel]')?.dataset.sel;
      if (!which || !range) return;
      const quote = quoteFromSelection(range, selected);
      if (which === 'link') {
        const url = `${location.origin}${location.pathname}#:~:text=${encodeURIComponent(quote.exact.slice(0, 300))}`;
        try { await navigator.clipboard.writeText(url); toast('Link to this passage copied'); } catch { prompt('Copy this link', url); }
        hide();
        return;
      }
      await ready;
      if (!me.signed_in) { hide(); return signInDialog('Sign in to comment', 'Your comment will sit beside this passage for everyone reading.'); }
      const idx = textIndex();
      const found = locate(idx, quote);
      window.getSelection().removeAllRanges();
      hide();
      if (found) wrap(idx, found.start, found.end, { className: 'm-hl-draft' });
      panel.draft(quote);
    });
  };
  let t = null;
  document.addEventListener('selectionchange', () => { clearTimeout(t); t = setTimeout(show, phone() ? 450 : 200); });
  document.addEventListener('scroll', () => { if (bar && phone()) hide(); }, { passive: true });
  body.addEventListener('click', (e) => {
    const mark = e.target.closest('mark.m-hl');
    if (mark && window.getSelection().isCollapsed) panel.openGroup(mark.dataset.group);
  });
}

// ---------- link previews ----------

function previews() {
  if (phone() || !window.matchMedia('(hover: hover)').matches) return;
  const cache = new Map();
  let pop = null;
  let timer = null;
  const isPost = (a) => a.origin === location.origin && (/^\/@[a-z0-9_-]+\/[a-z0-9-]+\/?$/.test(a.pathname) || (boot.home_blog && /^\/[a-z0-9-]+\/?$/.test(a.pathname))) && a.pathname !== location.pathname;
  const hide = () => { clearTimeout(timer); pop?.remove(); pop = null; };
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.closest('.m-pop, .m-menu, .m-postcard') || !isPost(a)) return;
    if (!a.closest('[data-m-body], [data-m-preview]')) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const key = a.pathname;
      if (!cache.has(key)) cache.set(key, api('/api/cards?url=' + encodeURIComponent(key)).then((d) => d.cards[0]?.card || null).catch(() => null));
      const card = await cache.get(key);
      if (!card || !a.matches(':hover')) return;
      hide();
      pop = h(`<a class="m-pop" href="${esc(card.url)}">${card.cover ? `<div class="m-pop-cover"><img src="${esc(card.cover.url)}" alt=""></div>` : ''}
        <div class="m-pop-text"><div class="m-pop-blog"><img src="${esc(card.blog.avatar)}" alt="">${esc(card.blog.name)}</div>
        <div class="m-pop-title">${esc(card.title)}</div>${card.description ? `<div class="m-pop-desc">${esc(card.description)}</div>` : ''}
        <div class="m-pop-meta">${esc(card.date)} · ${esc(card.reading_time)}</div></div></a>`);
      document.body.append(pop);
      const r = a.getBoundingClientRect();
      const x = Math.max(10, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 10));
      const above = r.bottom + pop.offsetHeight + 12 > window.innerHeight;
      pop.style.left = x + 'px';
      pop.style.top = (above ? r.top + window.scrollY - pop.offsetHeight - 10 : r.bottom + window.scrollY + 10) + 'px';
      pop.addEventListener('mouseleave', hide);
    }, 350);
  });
  document.addEventListener('mouseout', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !(e.relatedTarget && pop && pop.contains(e.relatedTarget))) { clearTimeout(timer); setTimeout(() => { if (pop && !pop.matches(':hover')) hide(); }, 200); }
  });
}

// ---------- live updates ----------

function live() {
  if (!postId || !('WebSocket' in window)) return;
  let tries = 0;
  let t = null;
  const connect = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/_ws`);
    ws.addEventListener('open', () => { tries = 0; ws.send(JSON.stringify({ type: 'subscribe', channel: `post:${postId}` })); });
    ws.addEventListener('message', (e) => {
      for (const line of String(e.data).split('\n')) {
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.type === 'message') { clearTimeout(t); t = setTimeout(loadComments, 400); }
      }
    });
    ws.addEventListener('close', () => { tries++; if (tries < 8) setTimeout(connect, Math.min(30000, 1000 * 2 ** tries)); });
  };
  connect();
}

// ---------- start ----------

account();
share();
if (postId) {
  claps();
  responsesEvents();
  selectionBar();
  for (const open of $$('[data-m-open-comments]')) {
    open.addEventListener('click', (e) => {
      if (boot.layout === 'panel' || phone()) { e.preventDefault(); panel.open({ mode: 'all' }); }
    });
  }
  ready.then(loadComments);
  live();
  window.addEventListener('load', () => notes.paint());
}
previews();
