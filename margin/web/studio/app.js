// Margin Studio: a workspace's posts, comments, team and settings; your names and personas;
// Claude; and, for Margin's admins, Margin itself. Starting out (/new) and invites
// (/join/<code>) live here too.
import { api, remembered, esc, h, $, $$, toast, ago, icons, sheet, menu, copy, upload, pickFile, setTheme, currentTheme, setWorkspace, currentWorkspace } from './lib.js';
import { makeZip, readZip } from './zip.js';

const root = document.getElementById('app');
let me = null;
let counts = { pending: 0 };
const LAST = 'margin.studio.ws';
const HANDLE_RE = /^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/;

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

// Each load takes a ticket; an answer paints only while its ticket is the latest one.
let tickets = 0;
function ticket() { const mine = ++tickets; return () => mine === tickets; }

const remember = (slug) => { try { if (slug) localStorage.setItem(LAST, slug); } catch { /* fine */ } };
const recalled = () => { try { return localStorage.getItem(LAST); } catch { return null; } };

async function loadMe(slug) {
  setWorkspace(slug);
  me = await api('/api/me?return=' + encodeURIComponent(location.pathname + location.search));
  if (me.workspace) remember(me.workspace.slug);
  return me;
}
async function ensureWorkspace(slug) {
  if (currentWorkspace() !== (slug || null) || !me) await loadMe(slug || null);
}
// The workspace for pages that belong to none (You, Claude, Margin): the last one used.
function homeWorkspace() {
  const mine = me.workspaces || [];
  const last = recalled();
  return (mine.find((w) => w.slug === last) || mine[0] || {}).slug || null;
}

async function start() {
  try { await loadMe(null); } catch (error) {
    root.innerHTML = `<div class="center"><div class="welcome"><h1>Can't reach Margin</h1><p>${esc(error.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
    return;
  }
  route();
}

async function refreshCounts() {
  if (!me.writer) return;
  try {
    const d = await api('/api/inbox?status=pending&limit=1');
    counts.pending = d.pending_count;
    paintNavCounts();
  } catch { /* the badge can wait */ }
}

async function route() {
  $$('.menu').forEach((el) => (el._close ? el._close() : el.remove()));
  $$('.scrim, .sheet').forEach((el) => el.remove());
  const url = new URL(location.href);
  const path = url.pathname.replace(/\/+$/, '') || '/studio';
  const join = /^\/join\/([a-z0-9]+)$/.exec(path);
  try {
    if (join) return await joinView(join[1]);
    if (path === '/new') return await newView(url);
    if (!me.signed_in) return signedOut();
    // Margin's admins can run Margin before picking a name of their own.
    if (me.needs_handle && !(me.admin && path === '/studio/margin')) return go('/new', true);
    if (path === '/studio/write' || path.startsWith('/studio/write/')) return await writeView(path, url);
    const parts = path.split('/').slice(2);
    if (!parts.length) {
      const ws = homeWorkspace();
      if (ws) return go(`/studio/${ws}`, true);
      await ensureWorkspace(null);
      return shell('none');
    }
    if (['you', 'claude', 'margin'].includes(parts[0])) {
      await ensureWorkspace(homeWorkspace());
      return shell(parts[0]);
    }
    const slug = parts[0];
    await ensureWorkspace(slug);
    if (!me.workspace || (!me.workspace.writer && !me.admin)) return notFound();
    return shell(parts[1] || 'posts');
  } catch (error) {
    if (error.status === 404) return notFound();
    root.innerHTML = `<div class="center"><div class="welcome"><h1>Something went wrong</h1><p>${esc(error.message)}</p><a class="btn primary" href="/studio" data-nav>Back to Studio</a></div></div>`;
  }
}

function notFound() {
  document.title = 'Not found — Studio';
  root.innerHTML = '<div class="center"><div class="welcome"><h1>Nothing here</h1><p>That workspace or page isn’t yours, or doesn’t exist.</p><a class="btn primary" href="/studio" data-nav>Go to Studio</a></div></div>';
}

async function writeView(path, url) {
  const id = path.split('/')[3] || null;
  let slug = url.searchParams.get('ws') || homeWorkspace();
  if (id) {
    const post = await api(`/api/posts/${id}`, { workspace: false });
    slug = post.ws;
  }
  await ensureWorkspace(slug);
  if (!me.workspace || !me.workspace.writer) return notFound();
  root.innerHTML = '<div class="spinner" style="margin-top:30vh"></div>';
  import('./editor.js').then((m) => m.editorView(root, { me, id, go })).catch((error) => {
    root.innerHTML = `<div class="center"><div class="welcome"><h1>The editor didn't load</h1><p>${esc(error.message)}</p><a class="btn primary" href="/studio" data-nav>Back to Studio</a></div></div>`;
  });
}

// ---------- marks and brand ----------

const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="mark-svg"><path fill="currentColor" d="M1.42 5.45h10.25a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84Zm0 6.22h10.25a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84Zm0 6.22h5.89a1.42 1.42 0 0 1 0 2.84H1.42a1.42 1.42 0 0 1 0-2.84ZM18 3.27h3.82Q24 3.27 24 5.45v5.46q0 2.18-2.18 2.18H19.2l-3.49 2.84.22-3.49q-.11-.44-.11-1.53V5.45q0-2.18 2.18-2.18Z"/></svg>';
const marginMark = () => `<span class="side-mark margin-mark">${MARK}</span>`;
function wsLogo(w, size = 32) {
  if (!w) return marginMark();
  return w.logo ? `<img class="ws-logo" src="${esc(w.logo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
    : `<span class="ws-logo ws-letter" style="width:${size}px;height:${size}px;background:${esc(w.color || 'var(--accent)')}">${esc(w.initial || '?')}</span>`;
}
const suggestHandle = (name) => (name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24);
const slugOf = (name) => (name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

function signedOut() {
  document.title = 'Studio — Margin';
  root.innerHTML = `<div class="center"><div class="welcome">${marginMark()}<h1>Margin Studio</h1>
    <p>Sign in to write, answer comments and run your workspace.</p>
    <a class="btn primary" style="width:100%;height:46px" href="${esc(me.login_url)}">Sign in</a></div></div>`;
}

// ---------- starting out: your name, a workspace, an invite, Claude ----------

function steps(at, total = 4) {
  return `<div class="ob-dots" aria-label="Step ${at + 1} of ${total}">${Array.from({ length: total }, (_, i) => `<span class="${i === at ? 'on' : i < at ? 'done' : ''}"></span>`).join('')}</div>`;
}

function checkAs(input, hint, kind, render) {
  let timer = null;
  let n = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const value = input.value;
    const mine = ++n;
    hint.className = 'ob-hint';
    if (!value) { hint.textContent = render.empty; return; }
    if (!HANDLE_RE.test(value)) { hint.textContent = 'Letters, numbers, - or _, starting with a letter.'; hint.classList.add('bad'); return; }
    hint.textContent = 'Checking…';
    timer = setTimeout(async () => {
      try {
        const r = await api(`/api/check/${kind}?value=${encodeURIComponent(value)}`, { workspace: false });
        if (mine !== n) return;
        hint.textContent = r.free ? render.free(value) : r.reason;
        hint.classList.add(r.free ? 'good' : 'bad');
      } catch { hint.textContent = ''; }
    }, 280);
  });
}

async function newView(url) {
  document.title = 'Start — Margin';
  if (!me.signed_in) {
    root.innerHTML = `<div class="center"><div class="welcome ob">${marginMark()}<h1>Start writing</h1>
      <p>Sign in, pick your name, and start a workspace for your team. It takes a minute.</p>
      <a class="btn primary ob-go" href="${esc(me.login_url)}">Sign in to start</a>
      <p class="ob-small">Already invited? Open the link you were sent.</p></div></div>`;
    return;
  }
  if (me.needs_handle) return nameStep();
  if (!me.margin.can_create) {
    root.innerHTML = `<div class="center"><div class="welcome ob">${marginMark()}<h1>Workspaces start by invitation here</h1>
      <p>${me.margin.signups === 'invite' ? 'Margin is invite-only on this server.' : 'Anyone can read and comment, but new workspaces are started by Margin’s admins.'} If someone invited you, open their link.</p>
      <a class="btn primary ob-go" href="${me.workspaces.length ? '/studio' : '/'}"${me.workspaces.length ? ' data-nav' : ''}>${me.workspaces.length ? 'Go to Studio' : 'Read Margin'}</a></div></div>`;
    return;
  }
  return workspaceStep(url.searchParams.get('first') === '1' || !me.workspaces.length);
}

function nameStep() {
  const first = me.margin.can_create;
  root.innerHTML = `<div class="center"><form class="welcome ob" novalidate>${steps(0, first ? 4 : 1)}
    <h1>What should we call you?</h1><p>Your name in every workspace you join. You can add personas later, to write under other names.</p>
    ${me.picture ? `<img class="ob-photo" src="${esc(me.picture)}" alt="Your photo">` : ''}
    <div class="group">
      <div class="field"><label for="n">Name</label><input id="n" class="input" maxlength="60" value="${esc(me.name || '')}" autocomplete="name"></div>
      <div class="field"><label for="h">Handle</label><div class="handle-input"><span>@</span><input id="h" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" value="${esc(suggestHandle(me.name))}"></div><small class="ob-hint" data-hint>Your page: ${esc(location.host)}/@handle</small></div>
    </div>
    <button class="btn primary ob-go" type="submit">Continue</button></form></div>`;
  const form = $('form', root);
  const input = $('#h', root);
  const hint = $('[data-hint]', root);
  input.addEventListener('input', () => { input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
  checkAs(input, hint, 'handle', { empty: 'Pick a handle.', free: (v) => `@${v} is free.` });
  if (input.value) input.dispatchEvent(new Event('input'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!HANDLE_RE.test(input.value)) { hint.textContent = 'Use 2–30 lowercase letters, digits, - or _, starting with a letter.'; hint.className = 'ob-hint bad'; return; }
    try {
      await api('/api/me/blog', { method: 'POST', body: { handle: input.value, name: $('#n', root).value }, workspace: false });
      await loadMe(null);
      go(me.margin.can_create ? '/new?first=1' : '/studio', true);
    } catch (error) { hint.textContent = error.message; hint.className = 'ob-hint bad'; }
  });
}

function workspaceStep(first) {
  root.innerHTML = `<div class="center"><form class="welcome ob" novalidate>${first ? steps(1) : `<a class="ob-back" href="/studio" data-nav>${icons.back}Studio</a>`}
    <h1>Name your workspace</h1><p>One for your team. You can be in as many as you like.</p>
    <div class="group">
      <div class="profile-edit"><button type="button" class="avatar-pick logo-pick" data-new-logo aria-label="Add a logo"><span class="ws-logo ws-logo-empty" style="width:56px;height:56px">${icons.image}</span></button><div class="row-main"><span class="row-title">Logo</span><span class="row-sub">Optional. A square image; you can change it later.</span></div></div>
      <div class="field"><label for="wn">Name</label><input id="wn" class="input" maxlength="60" placeholder="Lumen"></div>
      <div class="field"><label for="ws">Address</label><div class="handle-input"><span>${esc(location.host)}/</span><input id="ws" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" placeholder="lumen"></div><small class="ob-hint" data-hint>Lowercase letters, numbers and dashes.</small></div>
      <div class="field"><label for="wt">Tagline (optional)</label><input id="wt" class="input" maxlength="120" placeholder="A small team making a calm calendar"></div>
    </div>
    <div class="ob-addr"><span>Your page there</span><code data-addr>/${esc('yourteam')}/@${esc(me.handle)}</code></div>
    <button class="btn primary ob-go" type="submit">Create workspace</button></form></div>`;
  const name = $('#wn', root);
  const slug = $('#ws', root);
  const hint = $('[data-hint]', root);
  let touched = false;
  let logo = null;
  $('[data-new-logo]', root).addEventListener('click', async (e) => {
    const pick = e.currentTarget;
    const file = await pickFile('image/*');
    if (!file) return;
    pick.innerHTML = '<span class="ws-logo ws-logo-empty" style="width:56px;height:56px"><span class="spinner"></span></span>';
    try { const media = await upload(file, 512); logo = media.id; pick.innerHTML = `<img class="ws-logo" src="${esc(media.url)}" alt="" style="width:56px;height:56px">`; } catch (error) { toast(error.message); pick.innerHTML = `<span class="ws-logo ws-logo-empty" style="width:56px;height:56px">${icons.image}</span>`; }
  });
  const paint = () => { $('[data-addr]', root).textContent = `/${slug.value || 'yourteam'}/@${me.handle}`; };
  name.addEventListener('input', () => { if (!touched) { slug.value = slugOf(name.value); slug.dispatchEvent(new Event('input')); } });
  slug.addEventListener('input', (e) => { if (e.isTrusted) touched = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); paint(); });
  checkAs(slug, hint, 'workspace', { empty: 'Lowercase letters, numbers and dashes.', free: (v) => `${location.host}/${v} is free.` });
  name.focus();
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return; }
    try {
      const ws = await api('/api/workspaces', { method: 'POST', body: { name: name.value, slug: slug.value || undefined, tagline: $('#wt', root).value || undefined, logo: logo || undefined }, workspace: false });
      await loadMe(ws.slug);
      first ? inviteStep(ws) : go(`/studio/${ws.slug}`, true);
    } catch (error) { hint.textContent = error.message; hint.className = 'ob-hint bad'; }
  });
}

async function inviteStep(ws) {
  root.innerHTML = `<div class="center"><div class="welcome ob">${steps(2)}
    <h1>Invite your team</h1><p>They sign in, pick a handle, and write in ${esc(ws.name)}.</p>
    <div class="group"><div class="field"><label>Invite link</label><div class="code-box"><span data-link>Making a link…</span><button class="btn small primary" data-copy disabled>${icons.copy}Copy</button></div><small>Works once and lasts 14 days. Make as many as you need in Team.</small></div>
    <div class="field"><label for="ie">Or send it to</label><div class="row-inline"><input id="ie" class="input" type="email" placeholder="name@company.com" autocapitalize="none"><button class="btn small" data-send>Send</button></div><small data-sent></small></div></div>
    <button class="btn primary ob-go" data-next>Continue</button><button class="btn plain ob-skip" data-next>Skip for now</button></div></div>`;
  let link = '';
  try {
    const r = await api('/api/invites', { method: 'POST', body: { role: 'writer' } });
    link = r.link;
    $('[data-link]', root).textContent = link;
    $('[data-copy]', root).disabled = false;
  } catch (error) { $('[data-link]', root).textContent = error.message; }
  $('[data-copy]', root).addEventListener('click', () => copy(link, 'Invite link copied'));
  $('[data-send]', root).addEventListener('click', async () => {
    const email = $('#ie', root).value.trim();
    if (!email) return;
    try {
      const r = await api('/api/invites', { method: 'POST', body: { role: 'writer', email } });
      $('[data-sent]', root).textContent = r.emailed && r.emailed.ok ? `Sent to ${email}.` : `Made a link for ${email}; mail is off here, so send it yourself: ${r.link}`;
      $('#ie', root).value = '';
    } catch (error) { $('[data-sent]', root).textContent = error.message; }
  });
  $$('[data-next]', root).forEach((b) => b.addEventListener('click', () => claudeStep(ws)));
}

function connectBlock() {
  const url = `${location.origin}/_holm/mcp`;
  return `<div class="group"><div class="field"><label>In Claude</label><small style="margin:0 0 8px">Settings → Connectors → Add custom connector, then paste:</small><div class="code-box wrap"><span>${esc(url)}</span><button class="btn small" data-copy-url>${icons.copy}Copy</button></div></div>
    <div class="field"><label>In Claude Code</label><div class="code-box wrap"><span>claude mcp add --transport http margin ${esc(url)}</span><button class="btn small" data-copy-cli>${icons.copy}Copy</button></div></div></div>
    ${me.admin ? '' : '<p class="ob-note">For now, Holm opens these tools only to this server’s admins. Everyone can write in Studio until it opens them to all.</p>'}`;
}
function wireConnect(scope) {
  const url = `${location.origin}/_holm/mcp`;
  $('[data-copy-url]', scope)?.addEventListener('click', () => copy(url, 'Address copied'));
  $('[data-copy-cli]', scope)?.addEventListener('click', () => copy(`claude mcp add --transport http margin ${url}`, 'Command copied'));
}

function claudeStep(ws) {
  root.innerHTML = `<div class="center"><div class="welcome ob">${steps(3)}
    <h1>Connect Claude</h1><p>Claude drafts and edits your posts and answers comments, as you.</p>
    ${connectBlock()}
    <button class="btn primary ob-go" data-next>Done</button><button class="btn plain ob-skip" data-next>Later</button></div></div>`;
  wireConnect(root);
  $$('[data-next]', root).forEach((b) => b.addEventListener('click', () => doneStep(ws)));
}

function doneStep(ws) {
  root.innerHTML = `<div class="center"><div class="welcome ob ob-done"><span class="ob-check">${icons.check}</span>
    <h1>${esc(ws.name)} is live</h1><p class="ob-url">${esc(location.host)}/${esc(ws.slug)}</p>
    <a class="btn primary ob-go" href="/studio/write?ws=${esc(ws.slug)}" data-nav>Write your first post</a><a class="btn plain ob-skip" href="/studio/${esc(ws.slug)}" data-nav>Open Studio</a></div></div>`;
}

async function joinView(code) {
  document.title = 'Join — Margin';
  root.innerHTML = '<div class="center"><div class="spinner"></div></div>';
  let invite;
  try { invite = await api(`/api/join/${code}`, { workspace: false }); } catch (error) { invite = { valid: false, reason: error.message }; }
  const logo = invite.logo ? `<img class="ob-logo" src="${esc(invite.logo)}" alt="">` : marginMark();
  if (!invite.valid) {
    root.innerHTML = `<div class="center"><div class="welcome ob">${logo}<h1>This invite can't be used</h1><p>${esc(invite.reason)}</p><a class="btn ob-go" href="/">Go to Margin</a></div></div>`;
    return;
  }
  const role = invite.role === 'admin' ? 'an admin' : 'a writer';
  if (!me.signed_in) {
    root.innerHTML = `<div class="center"><div class="welcome ob">${logo}<h1>Join ${esc(invite.workspace)}</h1>
      <p>${esc(invite.invited_by || 'The team')} invited you to write in ${esc(invite.workspace)} as ${role}.${invite.email ? ` Sign in with ${esc(invite.email)}.` : ''}</p>
      <a class="btn primary ob-go" href="${esc(me.login_url)}">Sign in to accept</a></div></div>`;
    return;
  }
  const mine = me.identities || [];
  root.innerHTML = `<div class="center"><form class="welcome ob" novalidate>${logo}<h1>Join ${esc(invite.workspace)}</h1>
    <p>${esc(invite.invited_by || 'The team')} invited you to write here as ${role}.</p>
    ${me.handle ? (mine.length > 1 ? `<div class="group"><div class="field"><label for="as">Join as</label><select id="as" class="select">${mine.map((b) => `<option value="${esc(b.handle)}">${esc(b.name)} (@${esc(b.handle)})</option>`).join('')}</select><small>The team’s owners see which of your names you use there. Readers never do.</small></div></div>` : '')
      : `<div class="group">
      <div class="field"><label for="n">Your name</label><input id="n" class="input" maxlength="60" value="${esc(me.name || '')}"></div>
      <div class="field"><label for="h">Your handle</label><div class="handle-input"><span>@</span><input id="h" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" value="${esc(suggestHandle(me.name))}"></div><small class="ob-hint" data-hint>Your page: ${esc(location.host)}/${esc(invite.slug)}/@handle</small></div>
    </div>`}
    <button class="btn primary ob-go" type="submit">Accept invite</button><p class="ob-hint" data-hint2></p></form></div>`;
  const input = $('#h', root);
  if (input) {
    input.addEventListener('input', () => { input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
    checkAs(input, $('[data-hint]', root), 'handle', { empty: 'Pick a handle.', free: (v) => `@${v} is free.` });
  }
  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input ? { handle: input.value, name: $('#n', root).value } : { as: $('#as', root)?.value };
    try {
      const r = await api(`/api/join/${code}`, { method: 'POST', body, workspace: false });
      await loadMe(r.workspace);
      toast(`Welcome to ${invite.workspace}`);
      go(`/studio/${r.workspace}`, true);
    } catch (error) { const hint = $('[data-hint]', root) || $('[data-hint2]', root); hint.textContent = error.message; hint.className = 'ob-hint bad'; }
  });
}

// ---------- the shell ----------

function navItems() {
  const w = me.workspace;
  const base = w ? `/studio/${w.slug}` : null;
  const items = [];
  if (w) {
    items.push({ key: 'posts', path: base, label: 'Posts', icon: 'posts' });
    items.push({ key: 'comments', path: `${base}/comments`, label: 'Comments', icon: 'comments', count: true });
    if (w.admin) items.push({ key: 'team', path: `${base}/team`, label: 'Team', icon: 'team' });
    if (w.admin) items.push({ key: 'workspace', path: `${base}/workspace`, label: 'Workspace', icon: 'home' });
  }
  items.push({ key: 'sep' });
  items.push({ key: 'you', path: '/studio/you', label: 'You', icon: 'user' });
  items.push({ key: 'claude', path: '/studio/claude', label: 'Write with Claude', icon: 'claude' });
  if (me.admin) items.push({ key: 'margin', path: '/studio/margin', label: 'Margin', icon: 'shield', admin: true });
  return items;
}

function shell(pane) {
  const w = me.workspace;
  const key = `${w ? w.slug : '-'}:${me.admin}`;
  if (!$('.app', root) || root.dataset.shell !== key) {
    root.dataset.shell = key;
    const nav = navItems();
    root.innerHTML = `<div class="app">
      <aside class="side" aria-label="Studio">
        <button type="button" class="ws-switch" data-switch aria-haspopup="menu">${wsLogo(w)}<span class="side-site"><b>${esc(w ? w.name : 'Margin')}</b><span>${esc(w ? (w.role ? w.role[0].toUpperCase() + w.role.slice(1) : 'Margin admin') : 'Studio')}</span></span>${icons.updown}</button>
        ${w && w.writer ? `<button type="button" class="new-post" data-new>${icons.pen}New post</button>` : '<div style="height:10px"></div>'}
        <nav class="nav">${nav.map((n) => (n.key === 'sep' ? '<div class="nav-sep"></div>' : `<a class="nav-item" href="${n.path}" data-nav data-key="${n.key}">${icons[n.icon]}<span>${esc(n.label)}</span>${n.count ? '<span class="nav-count" hidden></span>' : ''}${n.admin ? '<span class="chip nav-chip">Admin</span>' : ''}</a>`)).join('')}</nav>
        <div class="side-foot">
          ${w ? `<a class="nav-item" href="/${esc(w.slug)}" target="_blank" rel="noopener">${icons.external}<span>View ${esc(w.name)}</span></a>` : `<a class="nav-item" href="/" target="_blank" rel="noopener">${icons.external}<span>View Margin</span></a>`}
          <button type="button" class="me-row" data-me>${me.picture ? `<img src="${esc(me.picture)}" alt="">` : '<span class="avatar"></span>'}<span><b>${esc(me.name || 'You')}</b><small>${esc(me.handle ? '@' + me.handle : '')}</small></span></button>
        </div>
      </aside>
      <div class="main"><header class="top"><h1></h1><div data-actions style="display:flex;gap:8px;align-items:center"></div></header><div class="panel"></div></div>
      <nav class="tabbar" aria-label="Studio">
        ${w ? `<a class="tab" href="/studio/${esc(w.slug)}" data-nav data-key="posts">${icons.posts}Posts</a>
        <a class="tab" href="/studio/${esc(w.slug)}/comments" data-nav data-key="comments">${icons.comments}Comments<span class="nav-count" hidden></span></a>
        ${w.writer ? `<button type="button" class="tab tab-write" data-new aria-label="New post"><span class="plus">${icons.plus}</span></button>` : ''}` : ''}
        <a class="tab" href="/studio/you" data-nav data-key="you">${icons.user}You</a>
        <button type="button" class="tab" data-more>${icons.more}More</button>
      </nav></div>`;
    $$('[data-new]', root).forEach((b) => b.addEventListener('click', () => go(`/studio/write?ws=${w.slug}`)));
    $('[data-me]', root).addEventListener('click', (e) => accountMenu(e.currentTarget));
    $('[data-more]', root).addEventListener('click', (e) => moreMenu(e.currentTarget));
    $('[data-switch]', root).addEventListener('click', (e) => switcher(e.currentTarget));
    const panel = $('.panel', root);
    panel.addEventListener('scroll', () => $('.top', root).classList.toggle('lined', panel.scrollTop > 4), { passive: true });
    refreshCounts();
  }
  for (const el of $$('[data-key]', root)) el.classList.toggle('on', el.dataset.key === pane);
  paintNavCounts();
  const views = { posts: postsView, comments: commentsView, team: teamView, workspace: workspaceView, you: youView, claude: claudeView, margin: marginView, none: noWorkspaceView };
  const view = views[pane];
  const panel = $('.panel', root);
  const top = $('.top', root);
  $('[data-actions]', top).innerHTML = '';
  panel.scrollTop = 0;
  top.classList.remove('lined');
  const allowed = view && (!['team', 'workspace'].includes(pane) || (w && w.admin)) && (pane !== 'margin' || me.admin) && (!['posts', 'comments'].includes(pane) || w);
  if (!allowed) {
    top.querySelector('h1').textContent = 'Not found';
    panel.innerHTML = '<div class="empty"><h2>Nothing here</h2><p>That page is not part of Studio.</p><a class="btn" href="/studio" data-nav>Go to Studio</a></div>';
    return;
  }
  view(panel, top);
}

function switcher(anchor) {
  const items = (me.workspaces || []).map((w) => ({
    label: w.name, checked: !!(me.workspace && w.slug === me.workspace.slug),
    icon: wsLogo(w, 22), run: () => go(`/studio/${w.slug}`),
  }));
  if (me.workspace && !(me.workspaces || []).some((w) => w.slug === me.workspace.slug)) items.unshift({ label: me.workspace.name, note: 'Visiting', checked: true, icon: wsLogo(me.workspace, 22), run: () => {} });
  if (items.length) items.push('-');
  if (me.margin.can_create) items.push({ label: 'New workspace', icon: icons.plus, run: () => go('/new') });
  items.push({ label: 'View Margin', icon: icons.external, href: '/', blank: true });
  menu(anchor, items);
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
  document.title = `${title} — ${me.workspace ? me.workspace.name : 'Margin'} Studio`;
}

function accountMenu(anchor) {
  const theme = currentTheme();
  const analytics = globalThis.__HOLM_SURFACES__ && globalThis.__HOLM_SURFACES__.analytics;
  const items = [];
  if (me.handle) items.push({ label: 'Your page', icon: icons.user, href: `/@${me.handle}`, blank: true });
  if (me.admin && analytics) items.push({ label: 'Analytics', icon: icons.chart, href: analytics, blank: true });
  if (items.length) items.push('-');
  for (const [t, label, icon] of [['light', 'Light', icons.sun], ['dark', 'Dark', icons.moon], ['system', 'Match device', icons.monitor]]) items.push({ label, icon, checked: theme === t, run: () => setTheme(t) });
  items.push('-', { label: 'Sign out', icon: icons.out, danger: true, run: signOut });
  menu(anchor, items);
}

function moreMenu(anchor) {
  const items = navItems().filter((n) => n.key !== 'sep' && !['posts', 'comments', 'you'].includes(n.key)).map((n) => ({ label: n.label, icon: icons[n.icon], run: () => go(n.path) }));
  items.push({ label: 'Switch workspace', icon: icons.updown, run: () => switcher(anchor) });
  items.push('-');
  const theme = currentTheme();
  const NAME = { light: 'Light', dark: 'Dark', system: 'Match device' };
  items.push({ label: 'Appearance', note: NAME[theme], icon: { light: icons.sun, dark: icons.moon, system: icons.monitor }[theme], run: () => { const next = { system: 'light', light: 'dark', dark: 'system' }[theme]; setTheme(next); toast(`Appearance: ${NAME[next]}`); } });
  items.push({ label: 'Sign out', icon: icons.out, danger: true, run: signOut });
  menu(anchor, items);
}

async function signOut() {
  await fetch(me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }).catch(() => {});
  location.href = '/';
}

const skeletonRows = (n = 4) => `<div class="group">${Array.from({ length: n }, () => '<div class="post-row"><span class="thumb skeleton"></span><span class="row-main"><span class="skeleton" style="height:16px;width:60%"></span><span class="skeleton" style="height:12px;width:35%;margin-top:6px"></span></span></div>').join('')}</div>`;

function noWorkspaceView(panel, top) {
  setTop(top, 'Studio');
  panel.innerHTML = `<div class="page"><div class="empty"><div class="empty-icon">${icons.home}</div><h2>You’re not on a workspace yet</h2>
    <p>${me.margin.can_create ? 'Start one for your team, or open an invite link someone sent you.' : 'Open the invite link someone sent you to join their workspace.'} Meanwhile you can comment on any post.</p>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${me.margin.can_create ? '<a class="btn primary" href="/new" data-nav>Start a workspace</a>' : ''}<a class="btn" href="/">Read Margin</a></div></div></div>`;
}

// ---------- posts ----------

let postsFilter = { status: 'all', scope: 'mine' };

async function postsView(panel, top) {
  const w = me.workspace;
  setTop(top, 'Posts', w.writer ? `<button class="btn primary small" data-new-top>${icons.plus}<span>New post</span></button>` : '');
  $('[data-new-top]', top)?.addEventListener('click', () => go(`/studio/write?ws=${w.slug}`));
  panel.innerHTML = `<div class="page"><h2 class="page-title">Posts</h2>
    <div class="toolbar"><div class="seg" data-status>${['all', 'draft', 'published'].map((s) => `<button type="button" data-v="${s}" aria-pressed="${postsFilter.status === s}">${{ all: 'All', draft: 'Drafts', published: 'Published' }[s]}</button>`).join('')}</div>
    <span class="grow"></span>${w.admin ? `<div class="seg" data-scope>${['mine', 'all'].map((s) => `<button type="button" data-v="${s}" aria-pressed="${postsFilter.scope === s}">${s === 'mine' ? 'Mine' : 'Everyone'}</button>`).join('')}</div>` : ''}</div>
    <div data-list>${skeletonRows()}</div></div>`;
  const load = () => {
    const list = $('[data-list]', panel);
    const alive = ticket();
    return remembered(`/api/posts?scope=${postsFilter.scope}&status=${postsFilter.status}`, (data) => paintPosts(list, data), alive)
      .catch((error) => { if (alive()) list.innerHTML = `<p class="group-note">${esc(error.message)}</p>`; });
  };
  const paintPosts = (list, data) => {
    if (!data.posts.length) {
      list.innerHTML = `<div class="empty"><div class="empty-icon">${icons.pen}</div><h2>${postsFilter.status === 'published' ? 'Nothing published yet' : postsFilter.status === 'draft' ? 'No drafts' : 'Write your first post'}</h2>
        <p>Start in the editor, or ask Claude to draft one for you.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${w.writer ? '<button class="btn primary" data-start>New post</button>' : ''}<a class="btn" href="/studio/claude" data-nav>${icons.claude}Write with Claude</a></div></div>`;
      $('[data-start]', list)?.addEventListener('click', () => go(`/studio/write?ws=${w.slug}`));
      return;
    }
    list.innerHTML = `<div class="group">${data.posts.map((p) => `<div class="post-row" data-id="${p.id}">
      ${p.cover ? `<img class="thumb" src="${esc(p.cover.thumb || p.cover.url)}" alt="" loading="lazy">` : `<span class="thumb thumb-empty">${icons.pen}</span>`}
      <span class="row-main"><span class="row-title">${esc(p.title)}</span>
      <span class="row-sub">${p.status === 'draft' ? '<span class="chip amber">Draft</span>' : '<span class="chip green">Published</span>'}${p.featured ? '<span class="chip">Pinned</span>' : ''}<span>@${esc(p.blog.handle)}</span><span>${esc(ago(p.updated_at))}</span>${p.pending ? `<span class="chip amber">${p.pending} to approve</span>` : ''}</span></span>
      <span class="stats"><span>${icons.clap}${p.claps}</span><span>${icons.comments.replace('class="ic"', 'class="ic ic-s"')}${p.comments}</span></span>
      <button type="button" class="icon-btn" data-more-post aria-label="More">${icons.more}</button></div>`).join('')}</div>`;
    for (const row of $$('.post-row', list)) {
      const post = data.posts.find((p) => p.id === row.dataset.id);
      row.addEventListener('click', (e) => { if (!e.target.closest('[data-more-post]')) go(`/studio/write/${post.id}`); });
      row.querySelector('[data-more-post]').addEventListener('click', (e) => {
        e.stopPropagation();
        const items = [
          { label: 'Edit', icon: icons.pen, run: () => go(`/studio/write/${post.id}`) },
          { label: post.status === 'published' ? 'View' : 'Preview', icon: icons.eye, href: post.status === 'published' ? post.url : `/studio/preview/${post.id}`, blank: true },
          { label: 'Copy link', icon: icons.copy, run: () => copy(location.origin + post.url, 'Link copied') },
        ];
        if (w.admin && post.status === 'published') items.push({ label: post.featured ? 'Unpin from home' : 'Pin to home', icon: icons.home, run: async () => { try { await api(`/api/posts/${post.id}`, { method: 'PATCH', body: { featured: !post.featured } }); toast(post.featured ? 'Unpinned' : 'Pinned'); load(); } catch (error) { toast(error.message); } } });
        items.push('-', { label: 'Delete', icon: icons.trash, danger: true, run: async () => {
          if (!confirm(`Delete “${post.title}”? Its comments and claps go too. This can't be undone.`)) return;
          try { await api(`/api/posts/${post.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (error) { toast(error.message); }
        } });
        menu(e.currentTarget, items);
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
    <div class="toolbar"><div class="seg" data-tab>${[['pending', 'Waiting'], ['unanswered', 'Unanswered'], ['recent', 'Recent']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${inboxTab === v}">${l}<span class="seg-count" data-n="${v}"></span></button>`).join('')}</div></div>
    <div data-list><div class="spinner"></div></div></div>`;
  const load = () => {
    const list = $('[data-list]', panel);
    const alive = ticket();
    return remembered(`/api/inbox?status=${inboxTab}&limit=60`, (data) => paintInbox(list, data), alive)
      .catch((error) => { if (alive()) list.innerHTML = `<p class="group-note">${esc(error.message)}</p>`; });
  };
  const paintInbox = (list, data) => {
    counts.pending = data.pending_count;
    paintNavCounts();
    $('[data-n="pending"]', panel).textContent = data.pending_count ? String(data.pending_count) : '';
    $('[data-n="unanswered"]', panel).textContent = data.unanswered_count ? String(data.unanswered_count) : '';
    const items = data[inboxTab] || [];
    if (!items.length) {
      const text = { pending: ['Nothing waiting', 'Comments that need approval show up here.'], unanswered: ['All caught up', 'Threads where a reader is waiting on you show up here.'], recent: ['No comments yet', 'Comments on your posts show up here.'] }[inboxTab];
      list.innerHTML = `<div class="empty"><div class="empty-icon">${icons.check}</div><h2>${text[0]}</h2><p>${text[1]}</p></div>`;
      return;
    }
    list.innerHTML = items.map((c) => `<article class="card" data-id="${c.id}">
      <div class="card-post">on <a href="${esc(c.post.url)}#c-${c.id}" target="_blank" rel="noopener">${esc(c.post.title)}</a></div>
      ${c.thread_quote ? `<div class="card-quote">${esc(c.thread_quote.exact)}</div>` : ''}
      ${c.in_reply_to ? `<div class="card-post">replying to “${esc(c.in_reply_to.body.slice(0, 120))}${c.in_reply_to.body.length > 120 ? '…' : ''}”</div>` : ''}
      <div class="card-who">${c.author.avatar ? `<img class="avatar" src="${esc(c.author.avatar)}" alt="">` : '<span class="avatar"></span>'}<b>${esc(c.author.name)}</b>${c.author.team ? '<span class="chip">Team</span>' : '<span class="chip">Outside</span>'}${c.status === 'pending' ? '<span class="chip amber">Waiting</span>' : ''}${c.via === 'mcp' ? '<span class="chip">Claude</span>' : ''}<time>${esc(ago(c.created_at))}</time></div>
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
        const box = h('<div class="reply-box"><textarea rows="1" placeholder="Reply as the post’s author" aria-label="Reply"></textarea><button class="btn primary small" data-send disabled>Send</button></div>');
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

// ---------- team ----------

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', writer: 'Writer' };
// "expires in 13 days", "expires tomorrow", "expires in 5 hours".
function expiresIn(iso) {
  const left = Date.parse(iso) - Date.now();
  if (left <= 0) return 'expired';
  const hours = Math.round(left / 3600000);
  if (hours < 1) return 'expires within the hour';
  if (hours < 24) return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'expires tomorrow' : `expires in ${days} days`;
}

async function teamView(panel, top) {
  const w = me.workspace;
  setTop(top, 'Team', `<button class="btn primary small" data-invite>${icons.plus}<span>Invite</span></button>`);
  panel.innerHTML = '<div class="page"><h2 class="page-title">Team</h2><div class="spinner"></div></div>';
  const render = () => {
    const alive = ticket();
    return remembered('/api/team', paintTeam, alive)
      .catch((error) => { if (alive()) $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; });
  };
  const paintTeam = (data) => {
    const open = data.invites.filter((i) => !i.used && !i.expired);
    const owner = w.role === 'owner' || me.admin;
    $('.page', panel).innerHTML = `<h2 class="page-title">Team</h2><p class="page-lead">Only people you invite write in ${esc(w.name)}. Anyone signed in can read, clap and comment.</p>
      <div class="group-title">Members</div><div class="group">${data.members.map((m) => `<div class="row"><img class="avatar" src="${esc(m.picture || (m.names[0] && m.names[0].avatar) || '')}" alt=""><span class="row-main"><span class="row-title">${esc(m.name)}${m.you ? ' (you)' : ''}</span><span class="row-sub">${m.names.length ? 'Writes as ' + m.names.map((n) => '@' + esc(n.handle)).join(', ') : 'Hasn’t written yet'}${m.email ? ` · ${esc(m.email)}` : ''}</span></span>
        <select class="select boxed" style="width:auto" data-role="${esc(m.account)}"${m.you || (m.role === 'owner' && !owner) || m.account.startsWith('sample:') ? ' disabled' : ''}>${['owner', 'admin', 'writer'].filter((r) => r !== 'owner' || owner || m.role === 'owner').map((r) => `<option value="${r}"${m.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}<option value="remove">Remove</option></select></div>`).join('')}</div>
      <p class="group-note">Only ${esc(w.name)}’s owners and admins see which names a member writes under here. Readers never do.</p>
      <div class="group-title">Open invites</div>${open.length ? `<div class="group">${open.map((i) => `<div class="row"><span class="row-main"><span class="row-title">${esc(i.email || 'Anyone with the link')}</span><span class="row-sub">${ROLE_LABEL[i.role]} · ${esc(expiresIn(i.expires_at))}</span></span><button class="btn small" data-revoke="${esc(i.id)}">Revoke</button></div>`).join('')}</div>` : '<div class="group"><div class="row"><span class="row-sub">No open invites.</span></div></div>'}
      ${w.role !== 'owner' ? '<div style="margin-top:28px"><button class="btn danger" data-leave>Leave this workspace</button></div>' : ''}`;
    for (const sel of $$('[data-role]', panel)) {
      sel.addEventListener('change', async () => {
        if (sel.value === 'remove' && !confirm('Remove this person from the team? Their posts stay, and they keep reading and commenting.')) { render(); return; }
        try { await api(`/api/team/${encodeURIComponent(sel.dataset.role)}`, { method: 'PATCH', body: { role: sel.value } }); toast('Updated'); render(); } catch (error) { toast(error.message); render(); }
      });
    }
    for (const b of $$('[data-revoke]', panel)) b.addEventListener('click', async () => { try { await api(`/api/invites/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Revoked'); render(); } catch (error) { toast(error.message); } });
    $('[data-leave]', panel)?.addEventListener('click', leaveWorkspace);
    top.querySelector('[data-invite]').onclick = () => inviteSheet(render);
  };
  render();
}

async function leaveWorkspace() {
  if (!confirm(`Leave ${me.workspace.name}? Your posts stay there.`)) return;
  try { await api('/api/workspace/leave', { method: 'POST', body: {} }); await loadMe(null); toast('You left'); go('/studio', true); } catch (error) { toast(error.message); }
}

function inviteSheet(done) {
  const form = h(`<form novalidate><div class="group">
    <div class="field"><label for="ie">Email (optional)</label><input id="ie" class="input" type="email" placeholder="name@company.com" autocapitalize="none"><small>With an email, only someone signed in with it can use the link, and Margin emails it when the server can send mail.</small></div>
    <div class="field"><label for="ir">Role</label><select id="ir" class="select"><option value="writer">Writer: posts under their names</option><option value="admin">Admin: also runs the team and settings</option></select></div>
    </div>
    <div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Create invite link</button></div></form>`);
  const s = sheet(`Invite to ${me.workspace.name}`, form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/invites', { method: 'POST', body: { email: $('#ie', form).value || undefined, role: $('#ir', form).value } });
      s.body.innerHTML = `<p style="margin:0 4px 14px;color:var(--muted)">Send this link${r.email ? ` to ${esc(r.email)}` : ''}. It works once and expires in 14 days.</p>
        <div class="code-box"><span>${esc(r.link)}</span><button class="btn small primary" data-copy>${icons.copy}Copy</button></div>
        ${r.emailed ? `<p style="margin:12px 4px 0;font-size:13.5px;color:${r.emailed.ok ? 'var(--accent-text)' : 'var(--muted)'}">${r.emailed.ok ? `Emailed to ${esc(r.email)}.` : `Not emailed (${esc(r.emailed.message || r.emailed.code || 'mail is off')}); send the link yourself.`}</p>` : ''}`;
      $('[data-copy]', s.body).addEventListener('click', () => copy(r.link, 'Invite link copied'));
      done();
    } catch (error) { toast(error.message); }
  });
}

// ---------- workspace settings ----------

const MOD_LABEL = { off: ['Show right away', 'Every comment appears as soon as it’s sent.'], outsiders: ['Hold comments from outside the team', 'Names on the team post straight away; others wait.'], all: ['Hold every comment', 'Someone on the post’s side approves each one first.'] };
const LOOKS = { paper: 'Paper', flat: 'Flat colour', blocks: 'Blocks' };
const TONES = { lilac: '#b9adff', tangerine: '#ff8a4c', mint: '#86e3c3', butter: '#ffd84d', sky: '#8ccbff', coral: '#ff9b8f' };

async function workspaceView(panel, top) {
  setTop(top, 'Workspace');
  panel.innerHTML = '<div class="page"><h2 class="page-title">Workspace</h2><div class="spinner"></div></div>';
  // A settings form: repaint from fresher data only until the person starts changing things.
  const alive = ticket();
  let touched = false;
  for (const type of ['input', 'pointerdown']) $('.page', panel).addEventListener(type, () => { touched = true; }, { once: true });
  const paint = async ([ws, posts, team, themes]) => {
    const nav = [...(ws.nav || [])];
    let featured = [...(ws.featured || [])];
    let logo = ws.logo;
    let cover = { ...ws.cover };
    const home = ws.home.startsWith('@') ? 'writer' : ws.home;
    const names = team.members.flatMap((m) => m.names);
    const page = $('.page', panel);
    page.innerHTML = `<h2 class="page-title">${esc(ws.name)}</h2>
      <p class="page-lead"><a href="/${esc(ws.slug)}" target="_blank" rel="noopener">${esc(location.host)}/${esc(ws.slug)}</a></p>
      <div class="group-title">Identity</div><div class="group">
        <div class="profile-edit"><button type="button" class="avatar-pick logo-pick" data-logo aria-label="Upload a logo">${wsLogo({ ...ws, logo: ws.logo ? `/media/${ws.logo}` : null, initial: ws.initial, color: ws.color }, 56)}</button><div class="row-main"><span class="row-title">Logo</span><span class="row-sub">A square image, shown in the bar, the tab and the landing page.</span></div><div class="row-actions"><button type="button" class="btn small" data-logo>${ws.logo ? 'Change' : 'Upload'}</button>${ws.logo ? '<button type="button" class="btn small" data-logo-remove>Remove</button>' : ''}</div></div>
        <div class="field"><label for="sn">Name</label><input id="sn" class="input" maxlength="60" value="${esc(ws.name)}"></div>
        <div class="field"><label for="st">Tagline</label><input id="st" class="input" maxlength="120" value="${esc(ws.tagline)}"></div>
        <div class="field"><label for="sd">Description</label><textarea id="sd" class="textarea" maxlength="300" rows="2">${esc(ws.description)}</textarea><small>Shown to search engines and on the home page.</small></div>
      </div>
      <div class="group-title">Home page</div><div class="group"><div class="field">
        <div class="seg wide" data-home>${[['latest', 'Latest posts'], ['curated', 'Curated'], ['writer', 'One writer']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${home === v}">${l}</button>`).join('')}</div>
        <div data-home-detail style="margin-top:14px"></div></div></div>
      <div class="group-title">Comments</div><div class="group" data-mod>${Object.entries(MOD_LABEL).map(([v, [l, n]]) => `<button type="button" class="row link choice" data-v="${v}" aria-pressed="${ws.moderation === v}"><span class="row-main"><span class="row-title" style="font-weight:500">${l}</span><span class="row-sub">${n}</span></span><span class="choice-check">${icons.check}</span></button>`).join('')}</div>
      <div class="group-title">Covers</div><div class="group"><div class="field">
        <p class="row-sub" style="margin:0 0 12px">Posts without a photo get a drawn cover in this style. Writers pick each drawing’s subject.</p>
        <div class="seg wide" data-look>${Object.entries(LOOKS).map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cover.look === v}">${l}</button>`).join('')}</div>
        <div class="swatches" data-tones>${Object.entries(TONES).map(([v, c]) => `<button type="button" class="swatch" data-v="${v}" aria-label="${v}" aria-pressed="${cover.tone === v}" style="background:${c}"></button>`).join('')}</div>
        <div class="cover-preview" data-preview></div></div></div>
      <div class="group-title">Theme</div>
      <div class="themes">${themes.themes.map((t) => `<div class="theme-card${t.id === themes.active ? ' on' : ''}" data-theme-id="${esc(t.id)}"><div class="theme-shot ${esc(t.id)}">Aa</div>
        <div class="theme-body"><b>${esc(t.name)} ${t.id === themes.active ? '<span class="chip green">Live</span>' : ''}</b><p>${esc(t.description)}</p>
        <div class="theme-actions">${t.id === themes.active ? '' : '<button class="btn small primary" data-use>Use</button>'}<a class="btn small" href="/${esc(ws.slug)}?theme=${esc(t.id)}" target="_blank" rel="noopener">Preview</a></div></div></div>`).join('')}</div>
      <div data-theme-settings></div>
      <div class="group-title">Menu links</div><div class="group" data-nav-links></div>
      <div style="display:flex;gap:8px;margin:-12px 0 24px"><button class="btn small" data-add-link>${icons.plus}Add link</button></div>
      <div class="save-bar"><button class="btn primary" data-save>Save changes</button></div>
      ${ws.role !== 'owner' && !me.admin ? '' : ''}`;
    // home page
    const detail = $('[data-home-detail]', page);
    let homeMode = home;
    let homeWriter = ws.home.startsWith('@') ? ws.home.slice(1) : (names[0] || {}).handle || '';
    const byId = new Map(posts.posts.map((p) => [p.id, p]));
    const paintHome = () => {
      if (homeMode === 'latest') detail.innerHTML = '<p class="row-sub" style="margin:0">Newest posts first, the latest featured at the top.</p>';
      else if (homeMode === 'writer') detail.innerHTML = `<select class="select" data-writer>${names.map((n) => `<option value="${esc(n.handle)}"${n.handle === homeWriter ? ' selected' : ''}>${esc(n.name)} (@${esc(n.handle)})</option>`).join('')}</select><p class="row-sub" style="margin:8px 0 0">That writer’s page becomes ${esc(ws.name)}’s home.</p>`;
      else {
        const pinned = featured.map((id) => byId.get(id)).filter(Boolean);
        detail.innerHTML = `<div class="pins">${pinned.map((p, i) => `<div class="pin">${p.cover ? `<img src="${esc(p.cover.thumb || p.cover.url)}" alt="">` : '<span class="pin-empty"></span>'}<span class="row-main"><span class="row-title">${esc(p.title)}</span><span class="row-sub">${esc(p.blog.name)}</span></span><button type="button" class="icon-btn" data-up="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${icons.back.replace('<svg', '<svg style="transform:rotate(90deg)"')}</button><button type="button" class="icon-btn" data-rm-pin="${i}" aria-label="Unpin">${icons.close}</button></div>`).join('') || '<p class="row-sub" style="margin:0 0 8px">Nothing pinned yet.</p>'}</div>
          <select class="select" data-pin><option value="">Pin a post from anyone on the team…</option>${posts.posts.filter((p) => !featured.includes(p.id)).map((p) => `<option value="${esc(p.id)}">${esc(p.title)} — ${esc(p.blog.name)}</option>`).join('')}</select>
          <p class="row-sub" style="margin:8px 0 0">Pinned posts come first, in this order. The rest follow, newest first.</p>`;
        $$('[data-up]', detail).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.up); [featured[i - 1], featured[i]] = [featured[i], featured[i - 1]]; paintHome(); }));
        $$('[data-rm-pin]', detail).forEach((b) => b.addEventListener('click', () => { featured.splice(Number(b.dataset.rmPin), 1); paintHome(); }));
        $('[data-pin]', detail).addEventListener('change', (e) => { if (e.target.value) { featured.push(e.target.value); paintHome(); } });
      }
      $('[data-writer]', detail)?.addEventListener('change', (e) => { homeWriter = e.target.value; });
    };
    paintHome();
    const seg = (sel, onPick) => $(sel, page).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      $$('button', $(sel, page)).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(b.dataset.v);
    });
    seg('[data-home]', (v) => { homeMode = v; paintHome(); });
    let moderation = ws.moderation;
    seg('[data-mod]', (v) => { moderation = v; });
    // covers, previewed with a real drawing
    const covers = await import('/margin/covers.js');
    const live = await import('/margin/live-covers.js');
    const preview = $('[data-preview]', page);
    const paintPreview = () => {
      const spec = covers.normalize({ motif: covers.MOTIFS[(ws.slug.length + (cover.look === 'paper' ? 0 : 3)) % covers.MOTIFS.length], look: cover.look, tone: cover.tone, seed: 1203 });
      preview.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'cover-live';
      preview.append(box);
      live.mount(box, spec);
    };
    paintPreview();
    seg('[data-look]', (v) => { cover.look = v; paintPreview(); });
    $('[data-tones]', page).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      $$('[data-tones] button', page).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      cover.tone = b.dataset.v;
      paintPreview();
    });
    // logo
    // A logo saves at once, like a photo anywhere else in Studio.
    const saveLogo = async (next) => {
      try {
        await api('/api/workspace', { method: 'PATCH', body: { logo: next } });
        logo = next;
        await loadMe(ws.slug);
        root.dataset.shell = '';
        toast(next ? 'Logo updated' : 'Logo removed');
        shell('workspace');
      } catch (error) { toast(error.message); }
    };
    for (const b of $$('[data-logo]', page)) b.addEventListener('click', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      try { const media = await upload(file, 512); await saveLogo(media.id); } catch (error) { toast(error.message); }
    });
    $('[data-logo-remove]', page)?.addEventListener('click', () => saveLogo(null));
    // theme
    const active = themes.themes.find((t) => t.id === themes.active) || themes.themes[0];
    if (active && active.settings.length) {
      $('[data-theme-settings]', page).innerHTML = `<div class="group-title">${esc(active.name)} settings</div><div class="group">${active.settings.map((s) => settingField(s, active.values[s.key])).join('')}</div>`;
    }
    for (const card of $$('[data-theme-id]', page)) {
      $('[data-use]', card)?.addEventListener('click', async () => { try { await api(`/api/themes/${card.dataset.themeId}/activate`, { method: 'POST', body: {} }); toast('Theme is live'); workspaceView(panel, top); } catch (error) { toast(error.message); } });
    }
    // nav links
    const paintNav = () => {
      const box = $('[data-nav-links]', page);
      box.innerHTML = nav.length ? nav.map((n, i) => `<div class="row"><input class="input" data-l="${i}" maxlength="30" placeholder="Label" value="${esc(n.label)}" style="flex:1"><input class="input" data-u="${i}" maxlength="300" placeholder="/about or https://…" value="${esc(n.url)}" style="flex:2"><button class="icon-btn" data-rm="${i}" aria-label="Remove">${icons.close}</button></div>`).join('') : '<div class="row"><span class="row-sub">No extra links. Themes show Latest and your writers.</span></div>';
      for (const b of $$('[data-rm]', box)) b.addEventListener('click', () => { nav.splice(Number(b.dataset.rm), 1); paintNav(); });
      for (const i of $$('[data-l]', box)) i.addEventListener('input', () => { nav[i.dataset.l].label = i.value; });
      for (const i of $$('[data-u]', box)) i.addEventListener('input', () => { nav[i.dataset.u].url = i.value; });
    };
    paintNav();
    $('[data-add-link]', page).addEventListener('click', () => { if (nav.length < 8) { nav.push({ label: '', url: '' }); paintNav(); } });
    $('[data-save]', page).addEventListener('click', async () => {
      const body = {
        name: $('#sn', page).value, tagline: $('#st', page).value, description: $('#sd', page).value,
        home: homeMode === 'writer' ? '@' + homeWriter : homeMode, featured, moderation, cover, logo: logo || null,
        nav: nav.filter((n) => n.label.trim() && n.url.trim()),
      };
      try {
        if (active && active.settings.length) {
          const values = {};
          for (const s of active.settings) { const el = $(`[data-setting="${s.key}"]`, page); values[s.key] = s.type === 'boolean' ? el.checked : el.value; }
          await api(`/api/themes/${active.id}/activate`, { method: 'POST', body: { settings: values } });
        }
        await api('/api/workspace', { method: 'PATCH', body });
        await loadMe(ws.slug);
        root.dataset.shell = '';
        toast('Saved');
        shell('workspace');
      } catch (error) { toast(error.message); }
    });

  };
  try {
    await remembered(['/api/workspace', '/api/posts?scope=all&status=published', '/api/team', '/api/themes'], paint, () => alive() && !touched);
  } catch (error) { if (alive()) $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; }
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

// ---------- you: your names and personas ----------

async function youView(panel, top) {
  setTop(top, 'You', `<button class="btn small" data-new-persona>${icons.plus}<span>New persona</span></button>`);
  $('[data-new-persona]', top).addEventListener('click', () => identitySheet(null, () => youView(panel, top)));
  panel.innerHTML = '<div class="page"><h2 class="page-title">You</h2><div class="spinner"></div></div>';
  const alive = ticket();
  let touched = false;
  for (const type of ['input', 'pointerdown']) $('.page', panel).addEventListener(type, () => { touched = true; }, { once: true });
  const paint = async (data) => {
    const page = $('.page', panel);
    page.innerHTML = `<h2 class="page-title">You</h2>
      <div class="group-title">Your names</div><div class="group">${data.identities.map((b) => `<div class="row link" data-handle="${esc(b.handle)}"><img class="avatar" src="${esc(b.avatar)}" alt=""><span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="row-sub">@${esc(b.handle)} · ${b.own ? 'your name' : 'persona'} · ${b.posts} post${b.posts === 1 ? '' : 's'}</span></span><span class="chev">${icons.chev}</span></div>`).join('')}
        <button type="button" class="row link add-row" data-add>${icons.plus}<span>New persona</span></button></div>
      <p class="group-note">Write and comment as any of these. Readers can’t tell they’re the same person.</p>
      <div class="group-title">Workspaces</div>${me.workspaces.length ? `<div class="group">${me.workspaces.map((w) => `<a class="row link" href="/studio/${esc(w.slug)}" data-nav>${wsLogo(w)}<span class="row-main"><span class="row-title">${esc(w.name)}</span><span class="row-sub">${esc(ROLE_LABEL[w.role] || w.role)}${w.identities.length ? ' · writes as ' + w.identities.map((h) => '@' + esc(h)).join(', ') : ''}</span></span><span class="chev">${icons.chev}</span></a>`).join('')}</div>` : '<div class="group"><div class="row"><span class="row-sub">You’re not on a workspace yet.</span></div></div>'}
      ${me.margin.can_create ? '<div style="margin:-8px 0 24px"><a class="btn small" href="/new" data-nav>Start a workspace</a></div>' : ''}
      <div class="group-title">Claude</div>${connectBlock()}`;
    wireConnect(page);
    for (const row of $$('[data-handle]', page)) row.addEventListener('click', () => identitySheet(data.identities.find((b) => b.handle === row.dataset.handle), () => youView(panel, top)));
    $('[data-add]', page).addEventListener('click', () => identitySheet(null, () => youView(panel, top)));

  };
  try {
    await remembered('/api/identities', paint, () => alive() && !touched);
  } catch (error) { if (alive()) $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; }
}

function identitySheet(identity, done) {
  const form = h(`<form novalidate>
    <div class="group">
      ${identity ? `<div class="profile-edit"><button type="button" class="avatar-pick" data-avatar aria-label="Change picture"><img class="avatar-lg" src="${esc(identity.avatar)}" alt=""></button><div class="row-main"><span class="row-title">@${esc(identity.handle)}</span><span class="row-sub">${esc(location.host)}/@${esc(identity.handle)}</span></div></div>`
        : `<div class="field"><label for="ph">Handle</label><div class="handle-input"><span>@</span><input id="ph" class="input" maxlength="30" autocapitalize="none" spellcheck="false" placeholder="fieldnotes"></div><small class="ob-hint" data-hint>Its own address: ${esc(location.host)}/@handle</small></div>`}
      <div class="field"><label for="pn">Name</label><input id="pn" class="input" maxlength="60" value="${esc(identity ? identity.name : '')}" placeholder="Field Notes"></div>
      <div class="field"><label for="pb">Bio</label><textarea id="pb" class="textarea" rows="2" maxlength="280">${esc(identity ? identity.bio : '')}</textarea></div>
    </div>
    ${identity ? '' : '<p class="group-note">A persona is another name you can write and comment under. Readers can’t tell it’s you; the owners of workspaces you use it in can.</p>'}
    <div style="display:flex;gap:8px;justify-content:flex-end">${identity && identity.persona ? '<button type="button" class="btn danger" data-delete>Remove</button><span style="flex:1"></span>' : ''}<button class="btn primary" type="submit">${identity ? 'Save' : 'Create persona'}</button></div>
  </form>`);
  const s = sheet(identity ? identity.name : 'New persona', form);
  let avatar;
  $('[data-avatar]', form)?.addEventListener('click', async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try { const media = await upload(file, 512); avatar = media.id; $('[data-avatar] img', form).src = media.url; } catch (error) { toast(error.message); }
  });
  const ph = $('#ph', form);
  if (ph) {
    ph.addEventListener('input', () => { ph.value = ph.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
    checkAs(ph, $('[data-hint]', form), 'handle', { empty: 'Pick a handle.', free: (v) => `@${v} is free.` });
  }
  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!confirm(`Remove @${identity.handle}?`)) return;
    try { await api(`/api/identities/${identity.handle}`, { method: 'DELETE', workspace: false }); s.close(); toast('Removed'); await loadMe(currentWorkspace()); done(); } catch (error) { toast(error.message); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: $('#pn', form).value, bio: $('#pb', form).value };
    try {
      if (identity) {
        if (avatar) body.avatar = avatar;
        await api(`/api/identities/${identity.handle}`, { method: 'PATCH', body, workspace: false });
      } else {
        body.handle = ph.value;
        await api('/api/identities', { method: 'POST', body, workspace: false });
      }
      s.close();
      toast(identity ? 'Saved' : 'Persona created');
      await loadMe(currentWorkspace());
      done();
    } catch (error) { toast(error.message); }
  });
}

// ---------- Claude ----------

function claudeView(panel, top) {
  setTop(top, 'Write with Claude');
  const w = me.workspace;
  const persona = (me.identities || []).find((b) => b.persona);
  panel.innerHTML = `<div class="page"><h2 class="page-title">Write with Claude</h2>
    <p class="page-lead">Connect Claude to Margin and it can draft and publish posts under your names, answer ordinary comments in your voice, and ask you about the rest. It only ever does what you can do here, in the workspaces you’re on.</p>
    ${connectBlock()}
    <p class="group-note" style="margin:-8px 4px 24px">In Claude Code, type /mcp to sign in.</p>
    <div class="group-title">Try asking</div>
    <div class="prompt-list">
      <div class="prompt">“Write a draft for ${esc(w ? w.name : 'my workspace')} about what we learned shipping v2. Keep it under 800 words and give me the preview link.”</div>
      ${persona ? `<div class="prompt">“Turn these notes into a post as @${esc(persona.handle)} and publish it.”</div>` : ''}
      <div class="prompt">“Check my comments. Reply to the simple ones, and tell me about anything that needs me.”</div>
      ${w && w.admin ? `<div class="prompt">“Pin our launch post on ${esc(w.name)}’s home and switch our covers to the paper style.”</div>` : ''}
    </div>
    <p class="group-note" style="margin:0 4px">Claude replies only to ordinary comments and leaves anything sensitive, critical, legal, personal or about money for you. Replies it posts are marked Claude in your inbox.</p>
  </div>`;
  wireConnect(panel);
}

// ---------- Margin itself (its admins) ----------

const SIGNUP_LABEL = { open: ['Anyone', 'Anyone can sign up and start a workspace.'], readers: ['Anyone, to read and comment', 'New workspaces need you, or an invite from a workspace.'], invite: ['Invited people only', 'Only people invited to a workspace can sign up.'] };

async function marginView(panel, top) {
  setTop(top, 'Margin', `<button class="btn small" data-upload>${icons.upload}<span>Upload theme</span></button>`);
  panel.innerHTML = '<div class="page"><h2 class="page-title">Margin</h2><div class="spinner"></div></div>';
  const alive = ticket();
  let touched = false;
  for (const type of ['input', 'pointerdown']) $('.page', panel).addEventListener(type, () => { touched = true; }, { once: true });
  const paint = async ([settings, spaces, themes]) => {
    const list = spaces.workspaces;
    let signups = settings.signups;
    let homeMode = settings.home.startsWith('ws:') ? 'workspace' : settings.home.startsWith('@') ? 'writer' : 'landing';
    const examples = [...(settings.examples || [])];
    const page = $('.page', panel);
    page.innerHTML = `<h2 class="page-title">Margin</h2><p class="page-lead">Settings for all of ${esc(location.host)}. Only this server’s admins see this.</p>
      <div class="group-title">Who can join</div><div class="group" data-signups>${Object.entries(SIGNUP_LABEL).map(([v, [l, n]]) => `<button type="button" class="row link choice" data-v="${v}" aria-pressed="${signups === v}"><span class="row-main"><span class="row-title" style="font-weight:500">${l}</span><span class="row-sub">${n}</span></span><span class="choice-check">${icons.check}</span></button>`).join('')}</div>
      <div class="group-title">Home page</div><div class="group"><div class="field">
        <div class="seg wide" data-home>${[['landing', 'Margin’s landing'], ['workspace', 'A workspace'], ['writer', 'A writer']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${homeMode === v}">${l}</button>`).join('')}</div>
        <div style="margin-top:12px" data-home-detail></div></div></div>
      <div class="group-title">On the landing</div><div class="group">${list.map((w) => `<label class="row link">${wsLogo(w)}<span class="row-main"><span class="row-title">${esc(w.name)}</span><span class="row-sub">/${esc(w.slug)} · ${w.posts} post${w.posts === 1 ? '' : 's'}</span></span><span class="switch"><input type="checkbox" data-example="${esc(w.slug)}"${examples.includes(w.slug) ? ' checked' : ''}><span></span></span></label>`).join('') || '<div class="row"><span class="row-sub">No workspaces yet.</span></div>'}</div>
      <p class="group-note">The landing page shows these as examples, in the order you switch them on.</p>
      <div class="group-title">Address</div><div class="group"><div class="field"><label for="ph">Primary address</label><input id="ph" class="input" maxlength="200" placeholder="${esc(location.host)}" value="${esc(settings.primaryHost || '')}" autocapitalize="none" spellcheck="false"><small>Other addresses of this app send readers here, and links use it.</small></div></div>
      <div class="save-bar"><button class="btn primary" data-save>Save changes</button></div>
      <div class="group-title">Workspaces</div><div class="group">${list.map((w) => `<div class="row">${wsLogo(w)}<span class="row-main"><span class="row-title">${esc(w.name)}${w.suspended ? ' <span class="chip amber">Suspended</span>' : ''}${w.sample ? ' <span class="chip">Sample</span>' : ''}</span><span class="row-sub">/${esc(w.slug)} · started ${esc(ago(w.created_at))}</span></span><a class="btn small" href="/studio/${esc(w.slug)}" data-nav>Open</a><button class="btn small${w.suspended ? '' : ' danger'}" data-suspend="${esc(w.slug)}" data-on="${w.suspended ? '0' : '1'}">${w.suspended ? 'Restore' : 'Suspend'}</button></div>`).join('') || '<div class="row"><span class="row-sub">No workspaces yet.</span></div>'}</div>
      <div class="group-title">Theme library</div>
      <div class="themes">${themes.themes.map((t) => `<div class="theme-card" data-id="${esc(t.id)}"><div class="theme-shot ${esc(t.id)}">Aa</div>
        <div class="theme-body"><b>${esc(t.name)}${t.built_in ? '' : ' <span class="chip">Added</span>'}</b><p>${esc(t.description)}</p>
        <div class="theme-actions"><button class="btn small" data-download>${icons.download}Download</button>${t.built_in ? '' : `<button class="btn small danger" data-delete aria-label="Delete">${icons.trash}</button>`}</div></div></div>`).join('')}</div>
      <p class="group-note">A theme is a few HTML templates and a stylesheet. Download one, change it by hand or with Claude, and upload it; every workspace can then pick it. <a href="/api/reference" target="_blank" rel="noopener">Reference</a></p>
      <div class="group-title">Sample content</div><div class="group">
        <div class="row"><span class="row-main"><span class="row-title">Load the samples</span><span class="row-sub">Adds two made-up teams, Lumen and Copperline, with writers, posts and a few comments, and shows them on the landing.</span></span><button class="btn small" data-samples>Load</button></div>
        <div class="row"><span class="row-main"><span class="row-title">Remove the samples</span><span class="row-sub">Deletes the sample workspaces, writers, posts and their comments.</span></span><button class="btn small danger" data-remove-samples>Remove</button></div>
      </div>`;
    const detail = $('[data-home-detail]', page);
    let homeWs = settings.home.startsWith('ws:') ? settings.home.slice(3) : (list[0] || {}).slug || '';
    let homeWriter = settings.home.startsWith('@') ? settings.home.slice(1) : '';
    const paintHome = () => {
      if (homeMode === 'landing') detail.innerHTML = '<p class="row-sub" style="margin:0">Margin’s own front page, with the examples below.</p>';
      else if (homeMode === 'workspace') detail.innerHTML = `<select class="select" data-home-ws>${list.map((w) => `<option value="${esc(w.slug)}"${w.slug === homeWs ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select><p class="row-sub" style="margin:8px 0 0">That workspace’s home becomes ${esc(location.host)}.</p>`;
      else detail.innerHTML = `<div class="handle-input"><span>@</span><input class="input" data-home-writer maxlength="30" value="${esc(homeWriter)}" placeholder="maya" autocapitalize="none" spellcheck="false"></div><p class="row-sub" style="margin:8px 0 0">That writer’s page becomes ${esc(location.host)}.</p>`;
      $('[data-home-ws]', detail)?.addEventListener('change', (e) => { homeWs = e.target.value; });
      $('[data-home-writer]', detail)?.addEventListener('input', (e) => { homeWriter = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); });
    };
    paintHome();
    const seg = (sel, onPick) => $(sel, page).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      $$('button', $(sel, page)).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(b.dataset.v);
    });
    seg('[data-signups]', (v) => { signups = v; });
    seg('[data-home]', (v) => { homeMode = v; paintHome(); });
    for (const box of $$('[data-example]', page)) box.addEventListener('change', () => {
      const i = examples.indexOf(box.dataset.example);
      if (box.checked && i < 0) examples.push(box.dataset.example);
      if (!box.checked && i >= 0) examples.splice(i, 1);
    });
    $('[data-save]', page).addEventListener('click', async () => {
      const body = { signups, examples, primary_host: $('#ph', page).value.trim(), home: homeMode === 'workspace' ? 'ws:' + homeWs : homeMode === 'writer' ? '@' + homeWriter : 'landing' };
      try { await api('/api/margin', { method: 'PATCH', body, workspace: false }); await loadMe(currentWorkspace()); toast('Saved'); } catch (error) { toast(error.message); }
    });
    for (const b of $$('[data-suspend]', page)) b.addEventListener('click', async () => {
      const on = b.dataset.on === '1';
      if (on && !confirm(`Suspend ${b.dataset.suspend}? Its pages stop showing to everyone but Margin’s admins.`)) return;
      try { await api(`/api/margin/workspaces/${b.dataset.suspend}`, { method: 'PATCH', body: { suspended: on }, workspace: false }); toast(on ? 'Suspended' : 'Restored'); marginView(panel, top); } catch (error) { toast(error.message); }
    });
    for (const card of $$('.theme-card', page)) {
      const id = card.dataset.id;
      $('[data-download]', card).addEventListener('click', () => downloadTheme(id));
      $('[data-delete]', card)?.addEventListener('click', async () => { if (!confirm(`Delete the theme ${id}?`)) return; try { await api(`/api/themes/${id}`, { method: 'DELETE', workspace: false }); toast('Deleted'); marginView(panel, top); } catch (error) { toast(error.message); } });
    }
    top.querySelector('[data-upload]').onclick = () => uploadTheme(() => marginView(panel, top));
    $('[data-samples]', page).addEventListener('click', async (e) => {
      if (!confirm('Add the sample workspaces, writers, posts and comments?')) return;
      e.target.disabled = true;
      try {
        let r;
        do { r = await api('/api/samples/load', { method: 'POST', body: {}, workspace: false }); toast(r.message); } while (!r.done);
        await loadMe(currentWorkspace());
        marginView(panel, top);
      } catch (error) { toast(error.message); e.target.disabled = false; }
    });
    $('[data-remove-samples]', page).addEventListener('click', async () => {
      if (!confirm('Delete all sample workspaces, posts and comments?')) return;
      try {
        let r;
        do { r = await api('/api/samples', { method: 'DELETE', workspace: false }); toast(r.message); } while (!r.done);
        await loadMe(null);
        root.dataset.shell = '';
        go('/studio/margin', true);
      } catch (error) { toast(error.message); }
    });

  };
  try {
    await remembered([{ path: '/api/margin', options: { workspace: false } }, { path: '/api/margin/workspaces', options: { workspace: false } }, { path: '/api/themes', options: { workspace: false } }], paint, () => alive() && !touched);
  } catch (error) { if (alive()) $('.page', panel).innerHTML = `<p class="group-note">${esc(error.message)}</p>`; }
}

async function downloadTheme(id) {
  try {
    const data = await api(`/api/themes/${id}/files`, { workspace: false });
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
  try { check = await api('/api/themes/validate', { method: 'POST', body: { files }, workspace: false }); } catch (error) { toast(error.message); return; }
  const list = (items, cls) => items.map((i) => `<div class="issue ${cls}"><code>${esc(i.file)}${i.line ? ':' + i.line : ''}</code><span>${esc(i.message)}</span></div>`).join('');
  const box = h(`<div><p style="margin:0 4px 14px;color:var(--muted)">${check.ok ? `“${esc(check.id)}” is ready.` : `Fix ${check.errors.length} problem${check.errors.length === 1 ? '' : 's'} and upload again.`}</p>
    <div class="issues">${list(check.errors, 'err')}${list(check.warnings, '')}</div>
    ${check.ok ? '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn primary" data-save>Add to the library</button></div>' : ''}</div>`);
  const s = sheet(check.ok ? 'Upload theme' : 'This theme needs changes', box);
  $('[data-save]', box)?.addEventListener('click', async () => {
    try { await api('/api/themes', { method: 'POST', body: { files }, workspace: false }); s.close(); toast('Theme added'); done(); } catch (error) { toast(error.message); }
  });
}

start();
