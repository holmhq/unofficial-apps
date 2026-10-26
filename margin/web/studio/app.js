// Margin Studio: posts, comments, blogs and personas, the team, the site and its themes.
import { api, esc, h, $, $$, toast, ago, icons, sheet, menu, copy, upload, pickFile, setTheme, currentTheme } from './lib.js';
import { makeZip, readZip } from './zip.js';

const root = document.getElementById('app');
let me = null;
let counts = { pending: 0 };
let site = null;

const NAV = [
  { path: '/studio', label: 'Posts', icon: 'posts' },
  { path: '/studio/comments', label: 'Comments', icon: 'comments', count: () => counts.pending },
  { path: '/studio/blogs', label: 'Blogs', icon: 'blogs' },
  { path: '/studio/team', label: 'Team', icon: 'team', admin: true },
  { path: '/studio/site', label: 'Site', icon: 'site', admin: true },
  { path: '/studio/themes', label: 'Themes', icon: 'themes', admin: true },
  { path: '/studio/claude', label: 'Write with Claude', icon: 'claude' },
];

export function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  route();
}
window.addEventListener('popstate', () => route());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});

async function start() {
  try {
    me = await api('/api/me?return=' + encodeURIComponent(location.pathname));
  } catch (error) {
    root.innerHTML = `<div class="center"><div class="welcome"><h1>Can't reach the server</h1><p>${esc(error.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
    return;
  }
  route();
  if (me.writer) refreshCounts();
}

async function refreshCounts() {
  try {
    const d = await api('/api/inbox?status=pending&limit=1');
    counts.pending = d.pending_count;
    paintNavCounts();
  } catch { /* the badge can wait */ }
}

function route() {
  $$('.menu, .scrim, .sheet').forEach((el) => el.remove());
  const path = location.pathname.replace(/\/+$/, '') || '/studio';
  const join = /^\/join\/([a-z0-9]+)$/.exec(path);
  if (join) return joinView(join[1]);
  if (!me.signed_in) return signedOut();
  if (!me.writer) return readerOnly();
  if (me.needs_handle) return pickHandle();
  if (path === '/studio/write' || path.startsWith('/studio/write/')) {
    root.innerHTML = '<div class="spinner" style="margin-top:30vh"></div>';
    import('./editor.js').then((m) => m.editorView(root, { me, id: path.split('/')[3] || null, go })).catch((error) => {
      root.innerHTML = `<div class="center"><div class="welcome"><h1>The editor didn't load</h1><p>${esc(error.message)}</p><a class="btn primary" href="/studio" data-nav>Back to Studio</a></div></div>`;
    });
    return;
  }
  shell(path);
}

// ---------- not on the team ----------

function brandMark() { return `<span class="side-mark">${esc((me.site.name || 'M').trim().charAt(0).toUpperCase())}</span>`; }

function signedOut() {
  document.title = `Studio — ${me.site.name}`;
  root.innerHTML = `<div class="center"><div class="welcome">${brandMark()}<h1>${esc(me.site.name)} Studio</h1>
    <p>Sign in to write, answer comments and run the blog.</p>
    <a class="btn primary" href="${esc(me.login_url)}">Sign in</a></div></div>`;
}

function readerOnly() {
  document.title = `Studio — ${me.site.name}`;
  root.innerHTML = `<div class="center"><div class="welcome">${brandMark()}<h1>Studio is for the team</h1>
    <p>You're signed in as ${esc(me.name || 'a reader')}. You can read, clap and comment on every post. To write here, ask an admin for an invite link.</p>
    <a class="btn primary" href="/">Read ${esc(me.site.name)}</a></div></div>`;
}

const HANDLE_RE = /^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/;
function suggestHandle(name) { return (name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24); }

function pickHandle() {
  document.title = `Pick your handle — ${me.site.name}`;
  root.innerHTML = `<div class="center"><form class="welcome" novalidate>${brandMark()}<h1>Pick your handle</h1>
    <p>Your posts will live at <b>${esc(location.host)}/@<span data-preview>${esc(suggestHandle(me.name) || 'you')}</span>/…</b></p>
    <div class="group">
      <div class="field"><label for="h">Handle</label><div class="handle-input"><span>@</span><input id="h" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" value="${esc(suggestHandle(me.name))}"></div><small data-hint>2–30 letters, digits, - or _.</small></div>
      <div class="field"><label for="n">Name</label><input id="n" class="input" maxlength="60" value="${esc(me.name || '')}"></div>
      <div class="field"><label for="b">Bio</label><textarea id="b" class="textarea" maxlength="280" rows="2" placeholder="A line about you (optional)"></textarea></div>
    </div>
    <button class="btn primary" type="submit" style="width:100%;height:46px">Start writing</button></form></div>`;
  const form = $('form', root);
  const input = $('#h', root);
  input.addEventListener('input', () => {
    input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    $('[data-preview]', root).textContent = input.value || 'you';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!HANDLE_RE.test(input.value)) { $('[data-hint]', root).textContent = 'Use 2–30 lowercase letters, digits, - or _, starting with a letter.'; return; }
    try {
      await api('/api/me/blog', { method: 'POST', body: { handle: input.value, name: $('#n', root).value, bio: $('#b', root).value } });
      me = await api('/api/me');
      go('/studio', true);
    } catch (error) { $('[data-hint]', root).textContent = error.message; }
  });
}

async function joinView(code) {
  document.title = `Join — ${me.site.name}`;
  root.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  let invite;
  try { invite = await api(`/api/join/${code}`); } catch (error) { invite = { valid: false, reason: error.message }; }
  if (!invite.valid) {
    root.innerHTML = `<div class="center"><div class="welcome">${brandMark()}<h1>This invite can't be used</h1><p>${esc(invite.reason)}</p><a class="btn" href="/">Go to ${esc(invite.site || me.site.name)}</a></div></div>`;
    return;
  }
  const role = invite.role === 'admin' ? 'an admin' : 'a writer';
  if (!me.signed_in) {
    root.innerHTML = `<div class="center"><div class="welcome">${brandMark()}<h1>Join ${esc(invite.site)}</h1>
      <p>${esc(invite.invited_by || 'The team')} invited you to write here as ${role}.${invite.email ? ` Sign in with ${esc(invite.email)}.` : ''}</p>
      <a class="btn primary" style="width:100%;height:46px" href="${esc(me.login_url)}">Sign in to accept</a></div></div>`;
    return;
  }
  root.innerHTML = `<div class="center"><form class="welcome" novalidate>${brandMark()}<h1>Join ${esc(invite.site)}</h1>
    <p>${esc(invite.invited_by || 'The team')} invited you to write here as ${role}.</p>
    ${me.handle ? '' : `<div class="group">
      <div class="field"><label for="h">Your handle</label><div class="handle-input"><span>@</span><input id="h" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" value="${esc(suggestHandle(me.name))}"></div><small data-hint>Your posts live at ${esc(location.host)}/@handle/…</small></div>
      <div class="field"><label for="n">Name</label><input id="n" class="input" maxlength="60" value="${esc(me.name || '')}"></div>
    </div>`}
    <button class="btn primary" type="submit" style="width:100%;height:46px">Accept invite</button><p data-hint2 style="margin-top:12px"></p></form></div>`;
  const input = $('#h', root);
  input?.addEventListener('input', () => { input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input ? { handle: input.value, name: $('#n', root).value } : {};
    try {
      await api(`/api/join/${code}`, { method: 'POST', body });
      me = await api('/api/me');
      toast(`Welcome to ${invite.site}`);
      go('/studio', true);
    } catch (error) { ($('[data-hint]', root) || $('[data-hint2]', root)).textContent = error.message; }
  });
}

// ---------- the shell ----------

function navItems() { return NAV.filter((n) => !n.admin || me.admin); }

function shell(path) {
  if (!$('.app', root)) {
    root.innerHTML = `<div class="app">
      <aside class="side" aria-label="Studio">
        <a class="side-brand" href="/">${brandMark()}<span class="side-site"><b>${esc(me.site.name)}</b><span>Studio</span></span></a>
        <button type="button" class="new-post" data-new>${icons.pen}New post</button>
        <nav class="nav">${navItems().map((n) => `<a class="nav-item" href="${n.path}" data-nav data-path="${n.path}">${icons[n.icon]}<span>${esc(n.label)}</span>${n.count ? '<span class="nav-count" hidden></span>' : ''}</a>`).join('')}</nav>
        <div class="side-foot">
          <a class="nav-item" href="/" target="_blank" rel="noopener">${icons.external}<span>View site</span></a>
          <button type="button" class="me-row" data-me>${me.picture ? `<img src="${esc(me.picture)}" alt="">` : '<span class="avatar"></span>'}<span><b>${esc(me.name || 'You')}</b><small>${esc(me.handle ? '@' + me.handle : me.role)}</small></span></button>
        </div>
      </aside>
      <div class="main"><header class="top"><h1></h1><div data-actions style="display:flex;gap:8px;align-items:center"></div></header><div class="panel"></div></div>
      <nav class="tabbar" aria-label="Studio">
        <a class="tab" href="/studio" data-nav data-path="/studio">${icons.posts}Posts</a>
        <a class="tab" href="/studio/comments" data-nav data-path="/studio/comments">${icons.comments}Comments<span class="nav-count" hidden></span></a>
        <button type="button" class="tab tab-write" data-new aria-label="New post"><span class="plus">${icons.plus}</span></button>
        <a class="tab" href="/studio/blogs" data-nav data-path="/studio/blogs">${icons.blogs}Blogs</a>
        <button type="button" class="tab" data-more>${icons.more}More</button>
      </nav></div>`;
    $$('[data-new]', root).forEach((b) => b.addEventListener('click', () => go('/studio/write')));
    $('[data-me]', root).addEventListener('click', (e) => accountMenu(e.currentTarget));
    $('[data-more]', root).addEventListener('click', (e) => moreMenu(e.currentTarget));
    const panel = $('.panel', root);
    panel.addEventListener('scroll', () => $('.top', root).classList.toggle('lined', panel.scrollTop > 4), { passive: true });
  }
  for (const el of $$('[data-path]', root)) el.classList.toggle('on', el.dataset.path === path || (el.dataset.path === '/studio' && path === '/studio'));
  paintNavCounts();
  const views = {
    '/studio': postsView, '/studio/comments': commentsView, '/studio/blogs': blogsView, '/studio/team': teamView,
    '/studio/site': siteView, '/studio/themes': themesView, '/studio/claude': claudeView,
  };
  const view = views[path];
  const panel = $('.panel', root);
  const top = $('.top', root);
  $('[data-actions]', top).innerHTML = '';
  panel.scrollTop = 0;
  top.classList.remove('lined');
  if (!view || (NAV.find((n) => n.path === path)?.admin && !me.admin)) {
    top.querySelector('h1').textContent = 'Not found';
    panel.innerHTML = '<div class="empty"><h2>Nothing here</h2><p>That page is not part of Studio.</p><a class="btn" href="/studio" data-nav>Go to posts</a></div>';
    return;
  }
  view(panel, top);
}

function paintNavCounts() {
  for (const el of $$('.nav-count', root)) {
    el.hidden = !counts.pending;
    el.textContent = counts.pending > 99 ? '99+' : String(counts.pending);
  }
}

function setTop(top, title, actions = '') {
  top.querySelector('h1').textContent = title;
  $('[data-actions]', top).innerHTML = actions;
  document.title = `${title} — ${me.site.name} Studio`;
}

function accountMenu(anchor) {
  const theme = currentTheme();
  const analytics = globalThis.__HOLM_SURFACES__ && globalThis.__HOLM_SURFACES__.analytics;
  const items = [
    { label: 'View site', icon: icons.external, href: '/', blank: true },
  ];
  if (me.handle) items.push({ label: 'Your blog', icon: icons.blogs, href: `/@${me.handle}`, blank: true });
  if (analytics) items.push({ label: 'Analytics', icon: icons.chart, href: analytics, blank: true });
  items.push('-');
  for (const t of ['light', 'dark', 'system']) items.push({ label: `${t[0].toUpperCase() + t.slice(1)}${theme === t ? ' ✓' : ''}`, icon: icons.sun, run: () => setTheme(t) });
  items.push('-', { label: 'Sign out', icon: icons.out, danger: true, run: signOut });
  menu(anchor, items);
}

function moreMenu(anchor) {
  const items = navItems().filter((n) => !['/studio', '/studio/comments', '/studio/blogs'].includes(n.path)).map((n) => ({ label: n.label, icon: icons[n.icon], run: () => go(n.path) }));
  items.push('-', { label: 'View site', icon: icons.external, href: '/', blank: true });
  const theme = currentTheme();
  items.push({ label: `Appearance: ${theme[0].toUpperCase() + theme.slice(1)}`, icon: icons.sun, run: () => { const next = { system: 'light', light: 'dark', dark: 'system' }[theme]; setTheme(next); toast(`Appearance: ${next}`); } });
  items.push({ label: 'Sign out', icon: icons.out, danger: true, run: signOut });
  menu(anchor, items);
}

async function signOut() {
  await fetch(me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }).catch(() => {});
  location.href = '/';
}

const skeletonRows = (n = 4) => `<div class="group">${Array.from({ length: n }, () => '<div class="post-row"><span class="thumb skeleton"></span><span class="row-main"><span class="skeleton" style="height:16px;width:60%"></span><span class="skeleton" style="height:12px;width:35%;margin-top:6px"></span></span></div>').join('')}</div>`;

// ---------- posts ----------

let postsFilter = { status: 'all', scope: 'mine' };

async function postsView(panel, top) {
  setTop(top, 'Posts', `<button class="btn primary small" data-new-top>${icons.plus}<span>New post</span></button>`);
  $('[data-new-top]', top).addEventListener('click', () => go('/studio/write'));
  panel.innerHTML = `<div class="page"><h2 class="page-title">Posts</h2>
    <div class="toolbar"><div class="seg" data-status>${['all', 'draft', 'published'].map((s) => `<button type="button" data-v="${s}" aria-pressed="${postsFilter.status === s}">${{ all: 'All', draft: 'Drafts', published: 'Published' }[s]}</button>`).join('')}</div>
    <span class="grow"></span>${me.admin ? `<div class="seg" data-scope>${['mine', 'all'].map((s) => `<button type="button" data-v="${s}" aria-pressed="${postsFilter.scope === s}">${s === 'mine' ? 'Mine' : 'Everyone'}</button>`).join('')}</div>` : ''}</div>
    <div data-list>${skeletonRows()}</div></div>`;
  const load = async () => {
    const list = $('[data-list]', panel);
    let data;
    try { data = await api(`/api/posts?scope=${postsFilter.scope}&status=${postsFilter.status}`); } catch (error) { list.innerHTML = `<p class="group-note">${esc(error.message)}</p>`; return; }
    if (!data.posts.length) {
      list.innerHTML = `<div class="empty"><div class="empty-icon">${icons.pen}</div><h2>${postsFilter.status === 'published' ? 'Nothing published yet' : postsFilter.status === 'draft' ? 'No drafts' : 'Write your first post'}</h2>
        <p>Start in the editor, or ask Claude to draft one for you.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-start>New post</button><a class="btn" href="/studio/claude" data-nav>${icons.claude}Write with Claude</a></div></div>`;
      $('[data-start]', list).addEventListener('click', () => go('/studio/write'));
      return;
    }
    list.innerHTML = `<div class="group">${data.posts.map((p) => `<div class="post-row" data-id="${p.id}">
      ${p.cover ? `<img class="thumb" src="${esc(p.cover.url)}" alt="" loading="lazy">` : `<span class="thumb">${icons.posts}</span>`}
      <span class="row-main"><span class="row-title">${esc(p.title)}</span>
      <span class="row-sub">${p.status === 'draft' ? '<span class="chip amber">Draft</span>' : '<span class="chip green">Published</span>'}<span>@${esc(p.blog.handle)}</span><span>${esc(ago(p.updated_at))}</span>${p.pending ? `<span class="chip amber">${p.pending} to approve</span>` : ''}</span></span>
      <span class="stats"><span>${icons.clap}${p.claps}</span><span>${icons.comments.replace('class="ic"', 'class="ic ic-s"')}${p.comments}</span></span>
      <button type="button" class="icon-btn" data-more-post aria-label="More">${icons.more}</button></div>`).join('')}</div>`;
    for (const row of $$('.post-row', list)) {
      const post = data.posts.find((p) => p.id === row.dataset.id);
      row.addEventListener('click', (e) => { if (!e.target.closest('[data-more-post]')) go(`/studio/write/${post.id}`); });
      row.querySelector('[data-more-post]').addEventListener('click', (e) => {
        e.stopPropagation();
        menu(e.currentTarget, [
          { label: 'Edit', icon: icons.pen, run: () => go(`/studio/write/${post.id}`) },
          { label: post.status === 'published' ? 'View' : 'Preview', icon: icons.eye, href: post.status === 'published' ? post.url : `/studio/preview/${post.id}`, blank: true },
          { label: 'Copy link', icon: icons.copy, run: () => copy(location.origin + post.url, 'Link copied') },
          '-',
          { label: 'Delete', icon: icons.trash, danger: true, run: async () => {
            if (!confirm(`Delete “${post.title}”? Its comments and claps go too. This can't be undone.`)) return;
            try { await api(`/api/posts/${post.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (error) { toast(error.message); }
          } },
        ]);
      });
    }
  };
  for (const [sel, key] of [['[data-status]', 'status'], ['[data-scope]', 'scope']]) {
    const seg = $(sel, panel);
    seg?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      postsFilter[key] = b.dataset.v;
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load();
    });
  }
  load();
}

// ---------- comments ----------

let inboxTab = 'pending';

async function commentsView(panel, top) {
  setTop(top, 'Comments');
  panel.innerHTML = `<div class="page"><h2 class="page-title">Comments</h2>
    <div class="toolbar"><div class="seg" data-tab>${[['pending', 'Waiting'], ['unanswered', 'Unanswered'], ['recent', 'Recent']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${inboxTab === v}">${l}<span data-n="${v}"></span></button>`).join('')}</div></div>
    <div data-list><div class="spinner"></div></div></div>`;
  const load = async () => {
    const list = $('[data-list]', panel);
    let data;
    try { data = await api(`/api/inbox?status=${inboxTab}&limit=60`); } catch (error) { list.innerHTML = `<p class="group-note">${esc(error.message)}</p>`; return; }
    counts.pending = data.pending_count;
    paintNavCounts();
    $('[data-n="pending"]', panel).textContent = data.pending_count ? ` ${data.pending_count}` : '';
    $('[data-n="unanswered"]', panel).textContent = data.unanswered_count ? ` ${data.unanswered_count}` : '';
    const items = data[inboxTab] || [];
    if (!items.length) {
      const text = { pending: ['Nothing waiting', 'Comments that need your approval show up here.'], unanswered: ['All caught up', 'Threads where the reader is waiting on you show up here.'], recent: ['No comments yet', 'Comments on your posts show up here.'] }[inboxTab];
      list.innerHTML = `<div class="empty"><div class="empty-icon">${icons.check}</div><h2>${text[0]}</h2><p>${text[1]}</p></div>`;
      return;
    }
    list.innerHTML = items.map((c) => `<article class="card" data-id="${c.id}">
      <div class="card-post">on <a href="${esc(c.post.url)}#c-${c.id}" target="_blank" rel="noopener">${esc(c.post.title)}</a></div>
      ${c.thread_quote ? `<div class="card-quote">${esc(c.thread_quote.exact)}</div>` : ''}
      ${c.in_reply_to ? `<div class="card-post">replying to “${esc(c.in_reply_to.body.slice(0, 120))}${c.in_reply_to.body.length > 120 ? '…' : ''}”</div>` : ''}
      <div class="card-who">${c.author.avatar ? `<img class="avatar" src="${esc(c.author.avatar)}" alt="">` : '<span class="avatar"></span>'}<b>${esc(c.author.name)}</b>${c.author.team ? '<span class="chip">Team</span>' : ''}${c.status === 'pending' ? '<span class="chip amber">Waiting</span>' : ''}${c.via === 'mcp' ? '<span class="chip">Claude</span>' : ''}<time>${esc(ago(c.created_at))}</time></div>
      <div class="card-body">${c.body_html}</div>
      <div class="card-actions">${c.status === 'pending' ? '<button class="btn primary small" data-act="approve">Approve</button><button class="btn small" data-act="reject">Reject</button>' : ''}
        <button class="btn small" data-act="reply">Reply</button><span class="grow"></span><button class="icon-btn" data-act="delete" aria-label="Delete">${icons.trash}</button></div>
    </article>`).join('');
    list.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const card = b.closest('.card');
      const id = card.dataset.id;
      const act = b.dataset.act;
      if (act === 'reply') {
        if ($('.reply-box', card)) return $('.reply-box textarea', card).focus();
        const box = h(`<div class="reply-box"><textarea rows="1" placeholder="Reply as the post's blog" aria-label="Reply"></textarea><button class="btn primary small" data-send disabled>Send</button></div>`);
        card.append(box);
        const ta = $('textarea', box);
        const send = $('[data-send]', box);
        ta.addEventListener('input', () => { send.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; });
        send.addEventListener('click', async () => {
          send.disabled = true;
          const item = items.find((x) => x.id === id);
          try {
            if (item.status === 'pending') await api(`/api/comments/${id}`, { method: 'PATCH', body: { action: 'approve' } });
            await api(`/api/posts/${item.post_id}/comments`, { method: 'POST', body: { body: ta.value.trim(), parent_id: id } });
            toast('Reply posted');
            load();
          } catch (error) { toast(error.message); send.disabled = false; }
        });
        ta.focus();
        return;
      }
      if (act === 'delete' && !confirm('Delete this comment and its replies?')) return;
      try {
        if (act === 'delete') await api(`/api/comments/${id}`, { method: 'DELETE' });
        else await api(`/api/comments/${id}`, { method: 'PATCH', body: { action: act } });
        toast({ approve: 'Approved', reject: 'Rejected', delete: 'Deleted' }[act]);
        load();
      } catch (error) { toast(error.message); }
    };
  };
  $('[data-tab]', panel).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    inboxTab = b.dataset.v;
    $$('[data-tab] button', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  });
  load();
}

// ---------- blogs and personas ----------

const MOD_LABEL = { '': 'Follow the site', off: 'Show every comment at once', outsiders: 'Approve comments from outside the team', all: 'Approve every comment' };
function moderationSelect(id, value) {
  return `<select id="${id}" class="select">${Object.entries(MOD_LABEL).map(([v, l]) => `<option value="${v}"${(value || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}

async function blogsView(panel, top) {
  setTop(top, 'Blogs', me.admin ? `<button class="btn small" data-new-persona>${icons.plus}<span>New persona</span></button>` : '');
  $('[data-new-persona]', top)?.addEventListener('click', () => personaSheet(null, () => blogsView(panel, top)));
  panel.innerHTML = '<div class="page"><h2 class="page-title">Blogs</h2><div class="spinner"></div></div>';
  let data;
  let team = [];
  try {
    data = await api('/api/blogs');
    if (me.admin) team = (await api('/api/team')).members;
  } catch (error) { panel.innerHTML = `<div class="page"><p class="group-note">${esc(error.message)}</p></div>`; return; }
  const own = data.blogs.find((b) => b.handle === me.handle);
  const personas = data.blogs.filter((b) => b.is_persona && (b.can_write || me.admin));
  const others = me.admin ? data.blogs.filter((b) => !b.is_persona && b.handle !== me.handle) : [];
  const page = $('.page', panel);
  page.innerHTML = `<h2 class="page-title">Blogs</h2>
    ${own ? `<div class="group-title">Your blog</div><div class="group" data-own>
      <div class="profile-edit"><button type="button" class="avatar-pick" data-avatar aria-label="Change picture"><img class="avatar-lg" src="${esc(own.avatar)}" alt=""></button>
      <div class="row-main"><span class="row-title">${esc(own.name)}</span><a class="row-sub" href="${esc(own.url)}" target="_blank" rel="noopener">${esc(location.host)}/@${esc(own.handle)} ${icons.external.replace('class="ic"', 'class="ic ic-s"')}</a></div></div>
      <div class="field"><label for="bn">Name</label><input id="bn" class="input" maxlength="60" value="${esc(own.name)}"></div>
      <div class="field"><label for="bb">Bio</label><textarea id="bb" class="textarea" maxlength="280" rows="2">${esc(own.bio)}</textarea></div>
      <div class="field"><label for="bm">Comments on your posts</label>${moderationSelect('bm', own.own_moderation)}</div>
    </div><div style="display:flex;justify-content:flex-end;margin:-10px 0 24px"><button class="btn primary" data-save-own>Save</button></div>` : ''}
    <div class="group-title">Personas</div>
    ${personas.length ? `<div class="group">${personas.map((b) => `<div class="row link" data-handle="${esc(b.handle)}"><img class="avatar" src="${esc(b.avatar)}" alt=""><span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="row-sub">@${esc(b.handle)} · ${b.posts} post${b.posts === 1 ? '' : 's'}${me.admin ? ` · ${(b.writers || []).length} writer${(b.writers || []).length === 1 ? '' : 's'}` : ''}</span></span><span class="chev">${icons.chev}</span></div>`).join('')}</div>`
      : `<div class="group"><div class="row"><span class="row-main"><span class="row-sub">${me.admin ? 'A persona is a shared identity like @team or @engineering that people can post and comment as.' : 'No personas yet. Admins can give you one to post as.'}</span></span></div></div>`}
    ${others.length ? `<div class="group-title">Writers' blogs</div><div class="group">${others.map((b) => `<a class="row link" href="${esc(b.url)}" target="_blank" rel="noopener"><img class="avatar" src="${esc(b.avatar)}" alt=""><span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="row-sub">@${esc(b.handle)} · ${b.posts} post${b.posts === 1 ? '' : 's'}</span></span><span class="chev">${icons.external}</span></a>`).join('')}</div>` : ''}`;
  if (own) {
    let avatar;
    $('[data-avatar]', page).addEventListener('click', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      try {
        const media = await upload(file, 512);
        avatar = media.id;
        $('[data-avatar] img', page).src = media.url;
      } catch (error) { toast(error.message); }
    });
    $('[data-save-own]', page).addEventListener('click', async () => {
      const body = { name: $('#bn', page).value, bio: $('#bb', page).value, moderation: $('#bm', page).value || null };
      if (avatar) body.avatar = avatar;
      try { await api(`/api/blogs/${own.handle}`, { method: 'PATCH', body }); toast('Saved'); } catch (error) { toast(error.message); }
    });
  }
  for (const row of $$('[data-handle]', page)) {
    row.addEventListener('click', () => personaSheet(personas.find((b) => b.handle === row.dataset.handle), () => blogsView(panel, top), team));
  }
}

async function personaSheet(persona, done, team = []) {
  if (me.admin && !team.length) { try { team = (await api('/api/team')).members; } catch { team = []; } }
  const writers = new Set(persona ? persona.writers || [] : []);
  const form = h(`<form novalidate>
    <div class="group">
      ${persona ? `<div class="profile-edit"><button type="button" class="avatar-pick" data-avatar aria-label="Change picture"><img class="avatar-lg" src="${esc(persona.avatar)}" alt=""></button><div class="row-main"><span class="row-title">@${esc(persona.handle)}</span><span class="row-sub">${esc(location.host)}/@${esc(persona.handle)}</span></div></div>`
        : `<div class="field"><label for="ph">Handle</label><div class="handle-input"><span>@</span><input id="ph" class="input" maxlength="30" autocapitalize="none" spellcheck="false" placeholder="team"></div></div>`}
      <div class="field"><label for="pn">Name</label><input id="pn" class="input" maxlength="60" value="${esc(persona ? persona.name : '')}" placeholder="The Team"></div>
      <div class="field"><label for="pb">Bio</label><textarea id="pb" class="textarea" rows="2" maxlength="280">${esc(persona ? persona.bio : '')}</textarea></div>
      ${persona ? `<div class="field"><label for="pm">Comments on its posts</label>${moderationSelect('pm', persona.own_moderation)}</div>` : ''}
    </div>
    ${me.admin && team.length ? `<div class="group-title">Who can write as it</div><div class="group">${team.map((m) => `<label class="row link"><img class="avatar" src="${esc(m.picture || '')}" alt=""><span class="row-main"><span class="row-title">${esc(m.name || m.email)}</span><span class="row-sub">${m.handle ? '@' + esc(m.handle) : esc(m.role)}</span></span><span class="switch"><input type="checkbox" value="${esc(m.memberId)}"${writers.has(m.memberId) || m.role === 'admin' ? ' checked' : ''}${m.role === 'admin' ? ' disabled' : ''}><span></span></span></label>`).join('')}</div><p class="group-note">Admins can always write as every persona.</p>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end">${persona && me.admin ? '<button type="button" class="btn danger" data-delete>Remove</button><span style="flex:1"></span>' : ''}<button class="btn primary" type="submit">${persona ? 'Save' : 'Create persona'}</button></div>
  </form>`);
  const s = sheet(persona ? persona.name : 'New persona', form);
  let avatar;
  $('[data-avatar]', form)?.addEventListener('click', async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try { const media = await upload(file, 512); avatar = media.id; $('[data-avatar] img', form).src = media.url; } catch (error) { toast(error.message); }
  });
  $('#ph', form)?.addEventListener('input', (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!confirm(`Remove @${persona.handle}?`)) return;
    try { await api(`/api/blogs/${persona.handle}`, { method: 'DELETE' }); s.close(); toast('Removed'); done(); } catch (error) { toast(error.message); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: $('#pn', form).value, bio: $('#pb', form).value };
    if (me.admin && team.length) body.writers = $$('input[type=checkbox]:checked:not(:disabled)', form).map((i) => i.value);
    try {
      if (persona) {
        if (avatar) body.avatar = avatar;
        body.moderation = $('#pm', form).value || null;
        await api(`/api/blogs/${persona.handle}`, { method: 'PATCH', body });
      } else {
        body.handle = $('#ph', form).value;
        await api('/api/blogs', { method: 'POST', body });
      }
      s.close();
      toast(persona ? 'Saved' : 'Persona created');
      done();
    } catch (error) { toast(error.message); }
  });
}

// ---------- team ----------

async function teamView(panel, top) {
  setTop(top, 'Team', `<button class="btn primary small" data-invite>${icons.plus}<span>Invite</span></button>`);
  panel.innerHTML = '<div class="page"><h2 class="page-title">Team</h2><div class="spinner"></div></div>';
  const render = async () => {
    let data;
    let blogs;
    try { [data, blogs] = await Promise.all([api('/api/team'), api('/api/blogs')]); } catch (error) { $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; return; }
    const open = data.invites.filter((i) => !i.used && !i.expired);
    $('.page', panel).innerHTML = `<h2 class="page-title">Team</h2><p class="page-lead">Only people you invite can write here. Anyone can sign in to read, clap and comment.</p>
      <div class="group-title">Members</div><div class="group">${data.members.map((m) => `<div class="row"><img class="avatar" src="${esc(m.picture || '')}" alt=""><span class="row-main"><span class="row-title">${esc(m.name || m.email)}</span><span class="row-sub">${m.handle ? `@${esc(m.handle)}` : 'No blog yet'}${m.email ? ` · ${esc(m.email)}` : ''}</span></span>
        <select class="select boxed" style="width:auto" data-role="${esc(m.memberId)}"${m.memberId === me.member_id ? ' disabled' : ''}>${['admin', 'writer', 'reader'].map((r) => `<option value="${r}"${m.role === r ? ' selected' : ''}>${r === 'reader' ? 'Remove' : r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="group-title">Open invites</div>${open.length ? `<div class="group">${open.map((i) => `<div class="row"><span class="row-main"><span class="row-title">${esc(i.email || 'Anyone with the link')}</span><span class="row-sub">${i.role === 'admin' ? 'Admin' : 'Writer'}${i.personas.length ? ' · ' + i.personas.map((p) => '@' + esc(p)).join(', ') : ''} · expires ${esc(ago(i.expires_at).replace(' ago', ''))}</span></span><button class="btn small" data-revoke="${esc(i.id)}">Revoke</button></div>`).join('')}</div>` : '<div class="group"><div class="row"><span class="row-sub">No open invites.</span></div></div>'}`;
    for (const sel of $$('[data-role]', panel)) {
      sel.addEventListener('change', async () => {
        if (sel.value === 'reader' && !confirm('Remove this person from the team? Their posts stay; they keep reading and commenting.')) { render(); return; }
        try { await api(`/api/team/${sel.dataset.role}`, { method: 'PATCH', body: { role: sel.value } }); toast('Updated'); render(); } catch (error) { toast(error.message); render(); }
      });
    }
    for (const b of $$('[data-revoke]', panel)) b.addEventListener('click', async () => { try { await api(`/api/invites/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Revoked'); render(); } catch (error) { toast(error.message); } });
    top.querySelector('[data-invite]').onclick = () => inviteSheet(blogs.blogs.filter((b) => b.is_persona), render);
  };
  render();
}

function inviteSheet(personas, done) {
  const form = h(`<form novalidate><div class="group">
    <div class="field"><label for="ie">Email (optional)</label><input id="ie" class="input" type="email" placeholder="name@company.com" autocapitalize="none"><small>With an email, only someone signed in with it can use the link, and we email it when the server can send mail.</small></div>
    <div class="field"><label for="ir">Role</label><select id="ir" class="select"><option value="writer">Writer — posts on their own blog</option><option value="admin">Admin — also runs the team and site</option></select></div>
    </div>
    ${personas.length ? `<div class="group-title">Can also write as</div><div class="group">${personas.map((p) => `<label class="row link"><img class="avatar" src="${esc(p.avatar)}" alt=""><span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">@${esc(p.handle)}</span></span><span class="switch"><input type="checkbox" value="${esc(p.handle)}"><span></span></span></label>`).join('')}</div>` : ''}
    <div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Create invite link</button></div></form>`);
  const s = sheet('Invite to write', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/invites', { method: 'POST', body: { email: $('#ie', form).value || undefined, role: $('#ir', form).value, personas: $$('input[type=checkbox]:checked', form).map((i) => i.value) } });
      s.body.innerHTML = `<p style="margin:0 4px 14px;color:var(--muted)">Send this link${r.email ? ` to ${esc(r.email)}` : ''}. It works once and expires in 14 days.</p>
        <div class="code-box"><span>${esc(r.link)}</span><button class="btn small primary" data-copy>${icons.copy}Copy</button></div>
        ${r.emailed ? `<p style="margin:12px 4px 0;font-size:13.5px;color:${r.emailed.ok ? 'var(--accent-text)' : 'var(--muted)'}">${r.emailed.ok ? `Emailed to ${esc(r.email)}.` : `Not emailed (${esc(r.emailed.message || r.emailed.code || 'mail is off')}); send the link yourself.`}</p>` : ''}`;
      $('[data-copy]', s.body).addEventListener('click', () => copy(r.link, 'Invite link copied'));
      done();
    } catch (error) { toast(error.message); }
  });
}

// ---------- site ----------

async function siteView(panel, top) {
  setTop(top, 'Site');
  panel.innerHTML = '<div class="page"><h2 class="page-title">Site</h2><div class="spinner"></div></div>';
  let blogs;
  try { [site, blogs] = await Promise.all([api('/api/site'), api('/api/blogs')]); } catch (error) { $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; return; }
  const nav = [...(site.nav || [])];
  const page = $('.page', panel);
  page.innerHTML = `<h2 class="page-title">Site</h2>
    <div class="group-title">Identity</div><div class="group">
      <div class="field"><label for="sn">Name</label><input id="sn" class="input" maxlength="60" value="${esc(site.name)}"></div>
      <div class="field"><label for="st">Tagline</label><input id="st" class="input" maxlength="120" value="${esc(site.tagline)}"></div>
      <div class="field"><label for="sd">Description</label><textarea id="sd" class="textarea" maxlength="300" rows="2">${esc(site.description)}</textarea><small>Shown to search engines and on the landing page.</small></div>
    </div>
    <div class="group-title">Home page</div><div class="group">
      <div class="field"><label for="sh">${esc(location.host)} shows</label><select id="sh" class="select"><option value="landing"${site.home === 'landing' ? ' selected' : ''}>The landing page (the theme's front page)</option>${blogs.blogs.map((b) => `<option value="@${esc(b.handle)}"${site.home === '@' + b.handle ? ' selected' : ''}>${esc(b.name)}'s blog (@${esc(b.handle)})</option>`).join('')}</select><small>When a blog is home, its posts live at ${esc(location.host)}/post-name and everyone's posts are at /latest.</small></div>
    </div>
    <div class="group-title">Comments</div><div class="group">
      <div class="field"><label for="sm">By default</label><select id="sm" class="select">${Object.entries(MOD_LABEL).filter(([v]) => v).map(([v, l]) => `<option value="${v}"${site.moderation === v ? ' selected' : ''}>${l}</option>`).join('')}</select><small>Each blog can choose its own in Blogs.</small></div>
    </div>
    <div class="group-title">Menu links</div><div class="group" data-nav-links></div>
    <div style="display:flex;gap:8px;margin:-12px 0 24px"><button class="btn small" data-add-link>${icons.plus}Add link</button><span style="flex:1"></span><button class="btn primary" data-save>Save</button></div>
    <div class="group-title">Sample content</div><div class="group">
      <div class="row"><span class="row-main"><span class="row-title">Fill a new site</span><span class="row-sub">Adds a fictional team with personas, posts, photos and a few comments, so you can see the themes at work.</span></span><button class="btn small" data-samples>Load</button></div>
      <div class="row"><span class="row-main"><span class="row-title">Remove sample content</span><span class="row-sub">Deletes the sample personas, posts, photos and their comments.</span></span><button class="btn small danger" data-remove-samples>Remove</button></div>
      <div class="row"><span class="row-main"><span class="row-title">Sample comments</span><span class="row-sub">Comments marked as samples are shown only to the team. Remove them all here.</span></span><button class="btn small danger" data-clear-samples>Remove</button></div>
    </div>`;
  const paintNav = () => {
    const box = $('[data-nav-links]', page);
    box.innerHTML = nav.length ? nav.map((n, i) => `<div class="row"><input class="input" data-l="${i}" maxlength="30" placeholder="Label" value="${esc(n.label)}" style="flex:1"><input class="input" data-u="${i}" maxlength="300" placeholder="/about or https://…" value="${esc(n.url)}" style="flex:2"><button class="icon-btn" data-rm="${i}" aria-label="Remove">${icons.close}</button></div>`).join('') : '<div class="row"><span class="row-sub">No extra links. Themes show Latest and your blogs.</span></div>';
    for (const b of $$('[data-rm]', box)) b.addEventListener('click', () => { nav.splice(Number(b.dataset.rm), 1); paintNav(); });
    for (const i of $$('[data-l]', box)) i.addEventListener('input', () => { nav[i.dataset.l].label = i.value; });
    for (const i of $$('[data-u]', box)) i.addEventListener('input', () => { nav[i.dataset.u].url = i.value; });
  };
  paintNav();
  $('[data-add-link]', page).addEventListener('click', () => { if (nav.length < 8) { nav.push({ label: '', url: '' }); paintNav(); } });
  $('[data-save]', page).addEventListener('click', async () => {
    try {
      site = await api('/api/site', { method: 'PATCH', body: { name: $('#sn', page).value, tagline: $('#st', page).value, description: $('#sd', page).value, home: $('#sh', page).value, moderation: $('#sm', page).value, nav: nav.filter((n) => n.label.trim() && n.url.trim()) } });
      me.site.name = site.name;
      toast('Saved');
    } catch (error) { toast(error.message); }
  });
  $('[data-samples]', page).addEventListener('click', async (e) => {
    if (!confirm('Add the sample team, personas, posts and comments to this site?')) return;
    e.target.disabled = true;
    try { const r = await api('/api/samples/load', { method: 'POST', body: {} }); toast(r.message || 'Sample content added'); } catch (error) { toast(error.message); e.target.disabled = false; }
  });
  $('[data-remove-samples]', page).addEventListener('click', async () => {
    if (!confirm('Delete all sample personas, posts and comments?')) return;
    try { const r = await api('/api/samples', { method: 'DELETE' }); toast(`Removed ${r.removed} sample posts`); } catch (error) { toast(error.message); }
  });
  $('[data-clear-samples]', page).addEventListener('click', async () => {
    if (!confirm('Remove every sample comment?')) return;
    try { const r = await api('/api/samples/comments', { method: 'DELETE' }); toast(`Removed ${r.removed}`); } catch (error) { toast(error.message); }
  });
}

// ---------- themes ----------

async function themesView(panel, top) {
  setTop(top, 'Themes', `<button class="btn small" data-upload>${icons.upload}<span>Upload</span></button>`);
  panel.innerHTML = '<div class="page page-wide"><h2 class="page-title">Themes</h2><div class="spinner"></div></div>';
  const render = async () => {
    let data;
    try { data = await api('/api/themes'); } catch (error) { $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; return; }
    const active = data.themes.find((t) => t.id === data.active) || data.themes[0];
    const page = $('.page', panel);
    page.innerHTML = `<h2 class="page-title">Themes</h2><p class="page-lead">A theme is a few HTML templates and a stylesheet. Download one to see how it's built, change it here or with Claude, and upload it as your own.</p>
      <div class="themes">${data.themes.map((t) => `<div class="theme-card${t.id === data.active ? ' on' : ''}" data-id="${esc(t.id)}">
        <div class="theme-shot ${esc(t.id)}">Aa</div>
        <div class="theme-body"><b>${esc(t.name)} ${t.id === data.active ? '<span class="chip green">Live</span>' : ''}${t.built_in ? '' : ' <span class="chip">Yours</span>'}</b><p>${esc(t.description)}</p>
        <div class="theme-actions">${t.id === data.active ? '' : '<button class="btn small primary" data-activate>Use</button>'}<a class="btn small" href="/?theme=${esc(t.id)}" target="_blank" rel="noopener">Preview</a><button class="btn small" data-download>${icons.download}</button>${t.built_in || t.id === data.active ? '' : `<button class="btn small danger" data-delete aria-label="Delete">${icons.trash}</button>`}</div></div></div>`).join('')}</div>
      ${active.settings.length ? `<div class="group-title">${esc(active.name)} settings</div><div class="group" data-settings>${active.settings.map((s) => settingField(s, active.values[s.key])).join('')}</div>
      <div style="display:flex;justify-content:flex-end;margin:-12px 0 24px"><button class="btn primary" data-save-settings>Save</button></div>` : ''}
      <div class="group-title">Make your own</div><div class="group">
        <div class="row"><span class="row-main"><span class="row-title">With Claude</span><span class="row-sub">Connect Claude (see Write with Claude), then ask: “Download the Quiet theme, make a version with a warmer palette and a big serif headline, check it, and save it as quiet-warm.”</span></span></div>
        <div class="row"><span class="row-main"><span class="row-title">By hand</span><span class="row-sub">Download a theme, edit theme.json, the templates and CSS, then Upload the .zip. Margin checks it first and lists anything to fix.</span></span><a class="btn small" href="/api/reference" target="_blank" rel="noopener">Reference</a></div>
      </div>`;
    for (const card of $$('.theme-card', page)) {
      const id = card.dataset.id;
      $('[data-activate]', card)?.addEventListener('click', async () => { try { await api(`/api/themes/${id}/activate`, { method: 'POST', body: {} }); toast('Theme is live'); render(); } catch (error) { toast(error.message); } });
      $('[data-download]', card).addEventListener('click', () => downloadTheme(id));
      $('[data-delete]', card)?.addEventListener('click', async () => { if (!confirm(`Delete the theme ${id}?`)) return; try { await api(`/api/themes/${id}`, { method: 'DELETE' }); toast('Deleted'); render(); } catch (error) { toast(error.message); } });
    }
    $('[data-save-settings]', page)?.addEventListener('click', async () => {
      const values = {};
      for (const s of active.settings) {
        const el = $(`[data-setting="${s.key}"]`, page);
        values[s.key] = s.type === 'boolean' ? el.checked : el.value;
      }
      try { await api(`/api/themes/${active.id}/activate`, { method: 'POST', body: { settings: values } }); toast('Saved'); } catch (error) { toast(error.message); }
    });
    top.querySelector('[data-upload]').onclick = () => uploadTheme(render);
  };
  render();
}

function settingField(s, value) {
  const id = `set-${s.key}`;
  let control;
  if (s.type === 'boolean') return `<label class="row link"><span class="row-main"><span class="row-title" style="font-weight:500">${esc(s.label || s.key)}</span></span><span class="switch"><input id="${id}" type="checkbox" data-setting="${esc(s.key)}"${value ? ' checked' : ''}><span></span></span></label>`;
  if (s.type === 'color') control = `<div style="display:flex;gap:10px;align-items:center"><input id="${id}" type="color" data-setting="${esc(s.key)}" value="${esc(value || '#000000')}" style="width:44px;height:32px;border:0;padding:0;background:none"><span class="row-sub">${esc(value || '')}</span></div>`;
  else if (s.type === 'textarea') control = `<textarea id="${id}" class="textarea" rows="3" data-setting="${esc(s.key)}">${esc(value || '')}</textarea>`;
  else if (s.type === 'select') control = `<select id="${id}" class="select" data-setting="${esc(s.key)}">${(s.options || []).map((o) => { const v = o.value ?? o; return `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(o.label ?? o)}</option>`; }).join('')}</select>`;
  else control = `<input id="${id}" class="input" data-setting="${esc(s.key)}" value="${esc(value || '')}" placeholder="${esc(s.placeholder || '')}">`;
  return `<div class="field"><label for="${id}">${esc(s.label || s.key)}</label>${control}</div>`;
}

async function downloadTheme(id) {
  try {
    const data = await api(`/api/themes/${id}/files`);
    const files = Object.entries(data.files).map(([name, text]) => ({ name: `${id}/${name}`, data: text }));
    for (const b of data.binaries) {
      const res = await fetch(b.url);
      if (res.ok) files.push({ name: `${id}/${b.path}`, data: new Uint8Array(await res.arrayBuffer()) });
    }
    const blob = makeZip(files);
    const a = h(`<a download="${esc(id)}-theme.zip"></a>`);
    a.href = URL.createObjectURL(blob);
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (error) { toast(error.message); }
}

async function uploadTheme(done) {
  const file = await pickFile('.zip,application/zip');
  if (!file) return;
  let entries;
  try { entries = await readZip(await file.arrayBuffer()); } catch (error) { toast(error.message); return; }
  // Accept a zip with or without a top folder.
  const names = entries.map((e) => e.name);
  const prefix = names.every((n) => n.includes('/')) && new Set(names.map((n) => n.split('/')[0])).size === 1 ? names[0].split('/')[0] + '/' : '';
  const files = {};
  const dec = new TextDecoder();
  for (const e of entries) {
    const path = e.name.slice(prefix.length);
    if (!path || path.startsWith('__MACOSX') || /(^|\/)\./.test(path) || /\.txt$/i.test(path)) continue;
    if (/\.(woff2?|ttf|otf|png|jpe?g|webp|gif|avif|ico)$/i.test(path)) {
      let bin = '';
      for (let i = 0; i < e.data.length; i += 32768) bin += String.fromCharCode(...e.data.subarray(i, i + 32768));
      files[path] = { base64: btoa(bin) };
    } else files[path] = dec.decode(e.data);
  }
  let check;
  try { check = await api('/api/themes/validate', { method: 'POST', body: { files } }); } catch (error) { toast(error.message); return; }
  const list = (items, cls) => items.map((i) => `<div class="issue ${cls}"><code>${esc(i.file)}${i.line ? ':' + i.line : ''}</code><span>${esc(i.message)}</span></div>`).join('');
  const box = h(`<div><p style="margin:0 4px 14px;color:var(--muted)">${check.ok ? `“${esc(check.id)}” is ready.` : `Fix ${check.errors.length} problem${check.errors.length === 1 ? '' : 's'} and upload again.`}</p>
    <div class="issues">${list(check.errors, 'err')}${list(check.warnings, '')}</div>
    ${check.ok ? '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-save>Save</button><button class="btn primary" data-live>Save and use</button></div>' : ''}</div>`);
  const s = sheet(check.ok ? 'Upload theme' : 'This theme needs changes', box);
  for (const [sel, activate] of [['[data-save]', false], ['[data-live]', true]]) {
    $(sel, box)?.addEventListener('click', async () => {
      try { await api('/api/themes', { method: 'POST', body: { files, activate } }); s.close(); toast(activate ? 'Theme is live' : 'Theme saved'); done(); } catch (error) { toast(error.message); }
    });
  }
}

// ---------- Claude ----------

function claudeView(panel, top) {
  setTop(top, 'Write with Claude');
  const url = `${location.origin}/_holm/mcp`;
  panel.innerHTML = `<div class="page"><h2 class="page-title">Write with Claude</h2>
    <p class="page-lead">Connect Claude to ${esc(me.site.name)} and it can draft and publish posts as you, answer ordinary comments in your voice, and ask you about the rest. It only ever does what you can do here.</p>
    <div class="group-title">Connector address</div>
    <div class="code-box" style="margin-bottom:24px"><span>${esc(url)}</span><button class="btn small primary" data-copy>${icons.copy}Copy</button></div>
    <div class="group-title">Claude on the web, desktop or phone</div>
    <div class="group"><div class="field"><ol class="steps"><li>Open Settings → Connectors → Add custom connector.</li><li>Name it ${esc(me.site.name)} and paste the address above.</li><li>Sign in when asked and allow access. Claude sees the tools in any chat.</li></ol></div></div>
    <div class="group-title">Claude Code</div>
    <div class="code-box" style="margin-bottom:8px"><span>claude mcp add --transport http margin ${esc(url)}</span><button class="btn small" data-copy-cli>${icons.copy}</button></div>
    <p class="group-note" style="margin:0 4px 24px">Then type /mcp in Claude Code to sign in.</p>
    <div class="group-title">Try asking</div>
    <div class="prompt-list">
      <div class="prompt">“Write a draft for my blog about what we learned shipping v2. Keep it under 800 words and give me the preview link.”</div>
      <div class="prompt">“Turn these notes into a post for @${esc((me.blogs.find((b) => b.is_persona) || { handle: 'team' }).handle)} and publish it.”</div>
      <div class="prompt">“Check my comments. Reply to the simple ones, and tell me about anything that needs me.”</div>
      ${me.admin ? '<div class="prompt">“Download the Quiet theme, make a warmer version with serif headlines, check it, and save it as a new theme so I can preview it.”</div>' : ''}
    </div>
    <p class="group-note" style="margin:0 4px">Claude replies only to ordinary comments and leaves anything sensitive, critical, legal, personal or about money for you. Replies it posts are marked Claude in your inbox.</p>
  </div>`;
  $('[data-copy]', panel).addEventListener('click', () => copy(url, 'Address copied'));
  $('[data-copy-cli]', panel).addEventListener('click', () => copy(`claude mcp add --transport http margin ${url}`, 'Command copied'));
}

start();
