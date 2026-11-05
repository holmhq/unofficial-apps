// Deck's web app: the landing page, a workspace's decks, library and team, Connect via MCP,
// invites and the first workspace. The studio (studio.js) loads when a deck opens.
import { api, keeper, forgetCached, esc, $, $$, html, toast, ago, kb, icons, MARK, MCP_MARK, sheet, menu, copy, copyField, confirmSheet, currentTheme, setTheme, applyTheme, uploadTo, pickFiles, avatar, wsLogo } from './lib.js?v=0.4.0';
import { thumb } from '/deck/render.js?v=0.4.0';
import { LAYOUTS } from './schema.js?v=0.4.0';
import { subscribe } from './live.js?v=0.4.0';

const root = document.getElementById('app');
let me = null;
let teardown = [];
const markTile = (size = 26) => `<span class="mark" style="font-size:${size}px">${MARK}</span>`;

// ---------- routing ----------

export function go(path, replace = false) {
  if (location.pathname + location.search + location.hash !== path) history[replace ? 'replaceState' : 'pushState'](null, '', path);
  route();
}
addEventListener('popstate', () => route());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});

// Who's here, kept between visits so a signed-in page draws at once; the next answer from the
// server replaces it, and the page redraws only if something that shows has changed.
const ME = 'deck.me';
const shown = (m) => JSON.stringify([m.signed_in, m.name, m.email, m.picture, m.admin, m.mcp, m.workspaces]);
function keptMe() {
  try { const m = JSON.parse(localStorage.getItem(ME) || 'null'); return m && m.signed_in ? m : null; } catch { return null; }
}
async function loadMe() {
  me = await api(`/api/me?return=${encodeURIComponent(location.pathname + location.search)}`);
  try { if (me.signed_in) localStorage.setItem(ME, JSON.stringify(me)); else forgetCached(); } catch { /* private mode */ }
  if (me.admin) loadSurfaces('/');
  return me;
}

// Holm writes the addresses of its own pages for this app, analytics among them, into the
// page it serves to the people allowed to see them. The copy the service worker keeps may
// predate sign-in, so an admin's browser reads them from a fresh copy (the worker lets a
// no-store request through).
let surfaces = globalThis.__HOLM_SURFACES__ || null;
let surfacesAsked = false;
function loadSurfaces(path) {
  if (surfacesAsked) return;
  surfacesAsked = true;
  fetch(path, { cache: 'no-store' }).then((r) => r.text()).then((page) => {
    const m = /__HOLM_SURFACES__\s*=\s*(\{[^}]*\})/.exec(page);
    surfaces = m ? JSON.parse(m[1]) : null;
  }).catch(() => { surfacesAsked = false; });
}
export const whoami = () => me;

// A workspace's tabs stay alive while you move between them: each keeps its page and its
// scroll, and only the part that changed is drawn again.
let place = null;

function cleanup() {
  for (const f of teardown) { try { f(); } catch { /* already gone */ } }
  teardown = [];
  place = null;
  document.body.classList.remove('in-studio');
  $('.menu')?._close?.();
  palette?.close();
}
export function onLeave(f) { teardown.push(f); }

async function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  let m = /^\/w\/([a-z0-9]{10})(?:\/(library|team))?$/.exec(path);
  if (m && place && place.ws.id === m[1] && root.contains(place.panel)) { $('.menu')?._close?.(); palette?.close(); return showTab(m[2] || 'decks'); }
  cleanup();
  if (path === '/') {
    if (!me.signed_in) return landing();
    const ws = lastWorkspace();
    if (!ws) return go('/new', true);
    return go(`/w/${ws.id}`, true);
  }
  if ((m = /^\/w\/([a-z0-9]{10})(?:\/(library|team|claude))?$/.exec(path))) {
    if (!me.signed_in) return signIn();
    // The old Connect Claude page is now a sheet over the workspace's decks.
    if (m[2] === 'claude') { history.replaceState(null, '', `/w/${m[1]}`); await workspacePage(m[1], 'decks'); return mcpSheet(); }
    return workspacePage(m[1], m[2] || 'decks');
  }
  if ((m = /^\/d\/([a-z0-9]{12})$/.exec(path))) {
    if (!me.signed_in) return signIn();
    document.title = 'Deck';
    root.innerHTML = '<div class="boot"><div class="spinner"></div></div>';
    const studio = await import('./studio.js?v=0.4.0');
    return studio.open(root, m[1], { me, go, onLeave, accountButton, rememberWorkspace });
  }
  if ((m = /^\/join\/([a-z0-9]{10,40})$/.exec(path))) return joinPage(m[1]);
  if (path === '/new') { if (!me.signed_in) return signIn(); return newWorkspacePage(); }
  notFound();
}

function lastWorkspace() {
  let last = null;
  try { last = localStorage.getItem('deck.ws'); } catch { /* private mode */ }
  return me.workspaces.find((w) => w.id === last) || me.workspaces[0] || null;
}
export function rememberWorkspace(id) { try { localStorage.setItem('deck.ws', id); } catch { /* private mode */ } }

function signIn() { location.href = me.login_url; }

// ---------- shared chrome ----------

// The theme switch: three icons, never the words, so the menu stays narrow.
function themeChoices() {
  const theme = currentTheme();
  return { label: 'Appearance', choices: [['light', 'Light', icons.sun], ['dark', 'Dark', icons.moon], ['system', 'Match device', icons.monitor]].map(([t, label, icon]) => ({ label, icon, checked: theme === t, run: () => setTheme(t) })) };
}

// The round avatar at the top right, signed out too: then it opens a menu with the theme
// and Sign in.
export function accountButton() {
  const b = html(`<button type="button" class="avatar-btn" aria-label="${me.signed_in ? 'Account' : 'Sign in'}" aria-haspopup="menu">${avatar(me.signed_in ? me : null, 32)}</button>`);
  b.addEventListener('click', () => {
    if (!me.signed_in) {
      const head = html(`<div class="menu-head"><span class="avatar avatar-empty" style="width:34px;height:34px" aria-hidden="true">${icons.user}</span><span style="min-width:0"><b>Not signed in</b><small>Sign in to make decks</small></span></div>`);
      menu(b, [themeChoices(), '-', { label: 'Sign in', icon: icons.user, run: signIn }], { header: head });
      return;
    }
    const analytics = surfaces && typeof surfaces.analytics === 'string' ? surfaces.analytics : null;
    const head = html(`<div class="menu-head">${avatar(me, 34)}<span style="min-width:0"><b>${esc(me.name || 'You')}</b><small>${esc(me.email || '')}</small></span></div>`);
    const items = [themeChoices()];
    items.push('-', { label: 'Connect via MCP…', icon: MCP_MARK, run: () => mcpSheet(b) });
    if (me.admin && analytics) items.push('-', { label: 'Analytics', icon: icons.chart, href: analytics, blank: true });
    items.push('-', { label: 'Sign out', icon: icons.out, run: signOut });
    menu(b, items, { header: head });
  });
  return b;
}

async function signOut() {
  await fetch(me.logout_url, { method: 'POST', headers: { accept: 'application/json' } }).catch(() => {});
  try { localStorage.removeItem('deck.ws'); } catch { /* private mode */ }
  forgetCached();
  location.href = '/';
}

function credit() {
  const el = html(`<footer class="credit"><a href="https://holmhq.com" target="_blank" rel="noopener"><svg viewBox="0 0 32 32" width="12" height="12" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4.667 0h22.666A4.667 4.667 0 0 1 32 4.667v22.666A4.667 4.667 0 0 1 27.333 32H4.667A4.667 4.667 0 0 1 0 27.333V4.667A4.667 4.667 0 0 1 4.667 0ZM6.75 16h18.5c.414 0 .75.336.75.75v10.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75v4.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-10.5c0-.414.336-.75.75-.75Zm0-12h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Zm14 0h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Z"/></svg>A Holm app</a><span class="dot" data-feedback-dot></span><button type="button" data-feedback>Feedback</button><span class="dot"></span><a href="${SOURCE}" target="_blank" rel="noopener">Source</a></footer>`);
  if (FEEDBACK_PROJECT) $('[data-feedback]', el).addEventListener('click', feedback);
  else { $('[data-feedback]', el).remove(); $('[data-feedback-dot]', el).remove(); }
  return el;
}
const SOURCE = 'https://github.com/holmhq/unofficial-apps/tree/main/deck';

// Send feedback opens Deck's form on feedback.zyt.app. Its script (a copy kept in
// /vendor/feedback/) loads only when someone asks for it.
let feedbackScript = null;
function feedback() {
  if (!feedbackScript) {
    feedbackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/feedback/embed.js';
      Object.assign(s.dataset, { project: FEEDBACK_PROJECT, origin: 'https://feedback.zyt.app', color: '#2f5bd8', button: 'none' });
      s.onload = () => resolve();
      s.onerror = () => { feedbackScript = null; reject(new Error('Feedback is not available right now.')); };
      document.head.append(s);
    });
  }
  feedbackScript.then(() => (globalThis.HolmFeedback || globalThis.ZytFeedback)?.open?.()).catch((error) => toast(error.message));
}
const FEEDBACK_PROJECT = 'kahhzpst';

// Every page is a fixed shell, like an app: the bar on top, one panel that scrolls under it,
// and on phones the tab bar below. The window never scrolls, so the bars stay put and the
// Holm credit sits at the foot of the panel however short the page is.
function mount(bar, body, tabs) {
  const panel = html('<div class="panel"></div>');
  panel.append(body, credit());
  const shell = html('<div class="shell"></div>');
  shell.append(bar, panel);
  if (tabs) shell.append(tabs);
  root.replaceChildren(shell);
  panel.addEventListener('scroll', () => bar.classList.toggle('lined', panel.scrollTop > 4), { passive: true });
  return panel;
}

function topBar({ ws, tab } = {}) {
  const bar = html(`<header class="bar"><div class="bar-in">
    <a class="brand" href="/" data-nav>${markTile(26)}<span>Deck</span></a>
    ${ws ? `<span class="ws-sep" aria-hidden="true">/</span><button type="button" class="ws-switch" aria-haspopup="menu">${wsLogo(ws, 24)}<span class="name">${esc(ws.name)}</span>${icons.updown}</button>
    <nav class="tabs" aria-label="Workspace">
      <a href="/w/${ws.id}" data-nav data-tab="decks">Decks</a>
      <a href="/w/${ws.id}/library" data-nav data-tab="library">Library</a>
      <a href="/w/${ws.id}/team" data-nav data-tab="team">Team</a>
    </nav>` : ''}
    <div class="bar-end">${ws ? `<button type="button" class="btn ghost claude-btn">${icons.claude}<span>Connect Claude</span></button>` : ''}</div>
  </div></header>`);
  $('.bar-end', bar).append(accountButton());
  $('.claude-btn', bar)?.addEventListener('click', (e) => mcpSheet(e.currentTarget));
  if (ws) {
    $(`[data-tab="${tab}"]`, bar)?.classList.add('on');
    $('.ws-switch', bar).addEventListener('click', (e) => switcher(e.currentTarget, ws));
  }
  return bar;
}

function tabBar(ws, tab) {
  const el = html(`<nav class="tabbar" aria-label="Workspace">
    <a href="/w/${ws.id}" data-nav data-tab="decks">${icons.decks}Decks</a>
    <a href="/w/${ws.id}/library" data-nav data-tab="library">${icons.image}Library</a>
    <a href="/w/${ws.id}/team" data-nav data-tab="team">${icons.team}Team</a>
    <button type="button" data-mcp>${icons.claude}Claude</button>
  </nav>`);
  $(`[data-tab="${tab}"]`, el)?.classList.add('on');
  $('[data-mcp]', el).addEventListener('click', (e) => mcpSheet(e.currentTarget));
  return el;
}

function switcher(anchor, ws) {
  const items = me.workspaces.map((w) => ({ label: w.name, icon: wsLogo(w, 20), checked: w.id === ws.id, run: () => go(`/w/${w.id}`) }));
  items.push('-', { label: 'New workspace', icon: icons.plus, run: () => go('/new') });
  menu(anchor, items);
}

function notFound() {
  mount(topBar(), html(`<div class="card-page"><div class="solo"><h1>Nothing here</h1><p>That address isn’t part of Deck.</p><form><a class="btn primary" href="/" data-nav>Go to your decks</a></form></div></div>`));
}

// ---------- landing ----------

async function landing() {
  document.title = 'Deck — decks you make with Claude';
  const page = html(`<div>
    <section class="landing-hero">
      <div>
        <h1 class="landing-title">Decks you make <em>with Claude</em>.</h1>
        <p class="sub">Tell Claude the story; Deck turns it into slides that always look right, and you watch every change land. Invite your team, keep your screenshots in one library, present anywhere and share a link.</p>
        <div class="ctas"><a class="btn primary lg" href="${esc(me.login_url)}">Get started, free</a><a class="btn lg" href="/sample">${icons.play}See a sample deck</a></div>
      </div>
      <div class="hero-art"><div class="spinner"></div></div>
    </section>
    <section class="features">
      <div class="feature">${icons.claude}<h3>Claude writes, you watch</h3><p>Connect Claude once. It drafts, tightens and rearranges; each save appears in your open deck on the same slide.</p></div>
      <div class="feature">${icons.decks}<h3>Seven layouts, no mess</h3><p>Cover, statement, cards, flow, screenshot, numbers and the ask. No free canvas, so every deck looks considered.</p></div>
      <div class="feature">${icons.team}<h3>A workspace for the team</h3><p>Invite teammates with a link. Decks and pictures stay private to the workspace until you share one.</p></div>
      <div class="feature">${icons.share}<h3>Present, share, embed</h3><p>Keys, swipes, notes and a clock. Share a link that follows your latest save, or pin a version.</p></div>
    </section>
    <section class="layouts-strip"><h2 class="strip-title">Every layout, from the sample deck</h2><p>Text you can edit in place, a fan of what comes next on the cover, numbers that count up.</p><div class="strip"></div></section>
  </div>`);
  mount(topBar(), page);
  try {
    const { content } = await api('/api/sample');
    const art = $('.hero-art', page);
    art.replaceChildren(thumb(content, 0, { imgSizes: '60vw' }));
    art.append(html(`<div class="claude-bubble"><b>${icons.claude}Claude</b>Tightened the ask on slide 7 and moved the numbers before it. Have a look?</div>`));
    const strip = $('.strip', page);
    content.slides.forEach((s, i) => {
      if (i === 0) return;
      const fig = html(`<figure><figcaption><b>${esc(LAYOUTS[s.layout]?.label || s.layout)}</b> · ${esc(LAYOUTS[s.layout]?.blurb || '')}</figcaption></figure>`);
      fig.prepend(thumb(content, i, { imgSizes: '300px' }));
      strip.append(fig);
    });
  } catch { $('.hero-art', page).innerHTML = ''; }
}

// ---------- a workspace: decks, library, team, Claude ----------

async function workspacePage(wid, tab) {
  const known = me.workspaces.find((w) => w.id === wid);
  if (!known) {
    await loadMe().catch(() => {});
    if (!me.workspaces.find((w) => w.id === wid)) return notFound();
  }
  const ws = me.workspaces.find((w) => w.id === wid);
  rememberWorkspace(wid);
  const stack = html('<div class="tab-pages"></div>');
  const bar = topBar({ ws, tab });
  const tabs = tabBar(ws, tab);
  const panel = mount(bar, stack, tabs);
  place = { ws, bar, tabs, panel, stack, pages: {}, tab: null };
  showTab(tab);
}

// Show one of the workspace's tabs. The first visit draws it; later visits show it again as
// it was, at its scroll, without asking the server again unless it's been a minute.
const VIEWS = { decks: decksView, library: libraryView, team: teamView };
function showTab(tab) {
  const p = place;
  if (p.tab === tab) return;
  if (p.tab) { const was = p.pages[p.tab]; was.scroll = p.panel.scrollTop; was.el.hidden = true; }
  p.tab = tab;
  for (const el of $$('[data-tab]', p.bar).concat($$('[data-tab]', p.tabs))) el.classList.toggle('on', el.dataset.tab === tab);
  let entry = p.pages[tab];
  if (!entry) {
    const el = html('<main class="page"></main>');
    p.stack.append(el);
    entry = p.pages[tab] = { el, scroll: 0, refresh: null, title: '', at: Date.now() };
    entry.refresh = VIEWS[tab](el, p.ws);
    entry.title = document.title;
  } else {
    entry.el.hidden = false;
    document.title = entry.title;
    // Decks follow realtime; a tab left for a while checks once, quietly, when it comes back.
    if (Date.now() - entry.at > 60000) { entry.at = Date.now(); entry.refresh?.(); }
  }
  p.panel.scrollTop = entry.scroll;
  p.bar.classList.toggle('lined', entry.scroll > 4);
}

// After a change to the workspace itself (its name or logo), draw it from scratch.
function redraw(wid, tab) { cleanup(); workspacePage(wid, tab); }

function decksView(page, ws) {
  document.title = `Decks — ${ws.name}`;
  page.innerHTML = `<div class="page-head"><div><h1>Decks</h1></div><div class="actions"><button type="button" class="btn primary" data-new>${icons.plus}New deck</button></div></div><div data-list></div>`;
  $('[data-new]', page).addEventListener('click', () => newDeck(ws));
  let channel = null;
  let painted = false;
  const paint = (data) => {
    painted = true;
    listen(data);
    const box = $('[data-list]', page);
    const decks = data.decks;
    if (!decks.length) {
      box.replaceChildren(html(`<div class="empty"><div class="art">${markTile(54)}</div><h2>No decks yet</h2><p>Start one here, or connect Claude and ask it for a deck about anything you’re working on.</p><div class="row-actions"><button class="btn primary" data-new>${icons.plus}New deck</button><button class="btn" data-sample>Add the sample deck</button><button class="btn" data-mcp>${icons.claude}Connect Claude</button></div></div>`));
      $('.empty [data-new]', page).addEventListener('click', () => newDeck(ws));
      $('.empty [data-mcp]', page).addEventListener('click', (e) => mcpSheet(e.currentTarget));
      $('.empty [data-sample]', page).addEventListener('click', () => newDeck(ws, 'sample'));
      return;
    }
    const grid = html('<div class="decks"></div>');
    grid.replaceChildren(...decks.map((d) => deckCard(d, ws)));
    box.replaceChildren(grid);
  };
  // Claude's saves and teammates' changes arrive over realtime, so the list stays current.
  function listen(data) {
    if (channel || !data.workspace.channel) return;
    channel = data.workspace.channel;
    let timer = 0;
    onLeave(subscribe(channel, (m) => {
      if (m.type === 'decks' || (m.type === 'ready' && m.again)) { clearTimeout(timer); timer = setTimeout(load, 300); }
    }));
  }
  const fetchDecks = keeper(`/api/w/${ws.id}`, paint);
  const load = () => fetchDecks().catch(async (error) => {
    if (error.status === 404) { await loadMe(); return go('/', true); }
    if (!painted) $('[data-list]', page).innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  });
  $('[data-list]', page).innerHTML = `<div class="decks">${Array.from({ length: 4 }, () => '<div><div class="frame" style="border-radius:10px;background:var(--panel);box-shadow:var(--sheet)"></div><p style="height:14px;width:60%;margin-top:12px;border-radius:4px;background:var(--hover)"></p></div>').join('')}</div>`;
  load();
  return load;
}

function deckCard(d, ws) {
  const by = d.updated_by || {};
  const who = by.by === 'claude' ? '<span class="chip claude">Claude</span>' : esc(by.name ? by.name.split(' ')[0] : '');
  const card = html(`<div class="deck-card"><a href="/d/${d.id}" data-nav aria-label="${esc(d.title)}"></a>
    <div class="info"><div class="info-main"><h3><a href="/d/${d.id}" data-nav tabindex="-1">${esc(d.title)}</a></h3><div class="meta">${who}${who ? '<span>·</span>' : ''}<span>${esc(ago(d.updated_at))}</span>${d.shared ? `<span class="chip accent">${icons.link}Shared</span>` : ''}<span>· ${d.slides} slide${d.slides === 1 ? '' : 's'}</span></div></div>
    <button type="button" class="icon-btn more" aria-label="More for ${esc(d.title)}" aria-haspopup="menu">${icons.more}</button></div></div>`);
  const content = { ...d.peek, slides: d.peek.slides };
  $('a', card).append(thumb(content, 0, { imgSizes: '320px' }));
  $('.more', card).addEventListener('click', (e) => {
    const items = [
      { label: 'Open', icon: icons.pencil, run: () => go(`/d/${d.id}`) },
      { label: 'Present', icon: icons.play, href: `/p/${d.id}` },
      { label: 'Duplicate', icon: icons.duplicate, run: async () => { try { const r = await api(`/api/decks/${d.id}/duplicate`, { method: 'POST', body: {} }); toast('Duplicated'); go(`/d/${r.deck.id}`); } catch (error) { toast(error.message); } } },
    ];
    if (d.shared) items.push({ label: 'Copy share link', icon: icons.link, run: () => copy(location.origin + d.shared.url, 'Link copied') });
    items.push('-', { label: 'Delete…', icon: icons.trash, danger: true, run: async () => {
      if (!(await confirmSheet('Delete this deck?', `“${d.title}” and its history will be gone for everyone on ${ws.name}${d.shared ? ', and its share link will stop working' : ''}.`, 'Delete', { danger: true }))) return;
      try { await api(`/api/decks/${d.id}`, { method: 'DELETE' }); toast('Deleted'); card.remove(); } catch (error) { toast(error.message); }
    } });
    menu(e.currentTarget, items);
  });
  return card;
}

async function newDeck(ws, from) {
  try {
    const made = await api(`/api/w/${ws.id}/decks`, { method: 'POST', body: from ? { from } : { title: 'Untitled deck' } });
    go(`/d/${made.deck.id}`);
  } catch (error) { toast(error.message); }
}

function libraryView(page, ws) {
  document.title = `Library — ${ws.name}`;
  page.innerHTML = `<div class="page-head"><div><h1>Library</h1><p>Screenshots, photos and drawings for ${esc(ws.name)}’s decks. Drop files anywhere on this page.</p></div><div class="actions"><button type="button" class="btn" data-link>${icons.phone}<span>From your phone</span></button><button type="button" class="btn primary" data-upload>${icons.upload}Upload</button></div></div><div class="uploading" hidden><div class="spinner"></div><span></span></div><div class="media-grid"></div>`;
  const grid = $('.media-grid', page);
  let painted = false;
  const paint = ({ media }) => {
    painted = true;
    if (!media.length) {
      grid.replaceChildren(html(`<div class="empty" style="grid-column:1/-1"><div class="art" style="color:var(--text-3)">${icons.image.replace('class="ic"', 'class="ic" style="width:48px;height:48px;stroke-width:1.2"')}</div><h2>Nothing in the library yet</h2><p>Add screenshots of your product, photos or drawings. Claude can add them too, and every deck in ${esc(ws.name)} can use them.</p></div>`));
      return;
    }
    grid.replaceChildren(...media.map((m) => mediaCard(m, ws, load)));
  };
  const fetchMedia = keeper(`/api/w/${ws.id}/media`, paint);
  const load = () => fetchMedia().catch((error) => { if (!painted) grid.innerHTML = `<p class="muted">${esc(error.message)}</p>`; });
  const send = async (files) => {
    if (!files.length) return;
    const status = $('.uploading', page);
    status.hidden = false;
    let done = 0;
    for (const file of files) {
      $('span', status).textContent = `Uploading ${file.name} (${done + 1} of ${files.length})…`;
      try { await uploadTo(`/api/w/${ws.id}/media`, file); done++; } catch (error) { toast(error.message); }
    }
    status.hidden = true;
    if (done) toast(done === 1 ? 'Added to the library' : `Added ${done} pictures`);
    load();
  };
  $('[data-upload]', page).addEventListener('click', async () => send(await pickFiles('image/*,.svg,.heic')));
  $('[data-link]', page).addEventListener('click', () => phoneLink(ws));
  dropZone(send, () => !page.hidden);
  load();
  return load;
}

// A workspace's logo: any picture already in its library, or a new one (which joins it).
async function logoSheet(ws, current) {
  const box = html(`<div><div style="display:flex;gap:8px;margin-bottom:14px"><button type="button" class="btn primary" data-upload>${icons.upload}Upload</button><span class="uploading" hidden style="margin:0"><span class="spinner"></span><span></span></span></div><div class="media-grid"><div class="spinner"></div></div></div>`);
  const s = sheet('Choose a logo', box, { wide: true, focus: false });
  const grid = $('.media-grid', box);
  const choose = async (m) => {
    await api(`/api/w/${ws.id}`, { method: 'PATCH', body: { logo: m.id } });
    s.close();
    await loadMe();
    toast('Logo updated');
    redraw(ws.id, 'team');
  };
  $('[data-upload]', box).addEventListener('click', async () => {
    const [file] = await pickFiles('image/*,.svg', false);
    if (!file) return;
    const status = $('.uploading', box);
    status.hidden = false;
    $('span:last-child', status).textContent = `Uploading ${file.name}…`;
    try { await choose(await uploadTo(`/api/w/${ws.id}/media`, file)); } catch (error) { status.hidden = true; toast(error.message); }
  });
  try {
    const { media } = await api(`/api/w/${ws.id}/media`);
    if (!media.length) { grid.replaceChildren(html(`<p class="muted" style="grid-column:1/-1">Nothing in the library yet. Upload a logo and it joins the library too.</p>`)); return; }
    grid.replaceChildren(...media.map((m) => {
      const card = html(`<button type="button" class="media-card pickable${current === `/media/${m.id}` ? ' on' : ''}" style="padding:0;border:0;text-align:left"><span class="pic"><img src="${esc(m.sizes && m.sizes.w320 ? m.sizes.w320 : m.url)}" alt="" loading="lazy"></span><span class="cap"><span class="cap-main"><b>${esc(m.name || m.alt || 'Picture')}</b><small>${m.width ? `${m.width} × ${m.height} · ` : ''}${kb(m.size)}</small></span></span></button>`);
      card.addEventListener('click', () => choose(m).catch((error) => toast(error.message)));
      return card;
    }));
  } catch (error) { grid.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
}

function mediaCard(m, ws, reload) {
  const card = html(`<div class="media-card"><div class="pic"><img src="${esc(m.sizes && m.sizes.w320 ? m.sizes.w320 : m.url)}" alt="${esc(m.alt)}" loading="lazy"></div><div class="cap"><div class="cap-main"><b>${esc(m.name || m.alt || 'Picture')}</b><small>${m.width && m.height ? `${m.width} × ${m.height} · ` : ''}${kb(m.size)}</small></div><button type="button" class="icon-btn" aria-label="More" aria-haspopup="menu">${icons.more}</button></div></div>`);
  $('.icon-btn', card).addEventListener('click', (e) => menu(e.currentTarget, [
    { label: 'Open', icon: icons.external, href: m.url, blank: true },
    { label: 'Copy address', icon: icons.copy, run: () => copy(m.url, 'Address copied') },
    '-',
    { label: 'Delete…', icon: icons.trash, danger: true, run: async () => {
      if (!(await confirmSheet('Delete this picture?', 'Slides that show it will show an empty frame instead.', 'Delete', { danger: true }))) return;
      try { await api(`/api/w/${ws.id}/media/${m.id}`, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (error) { toast(error.message); }
    } },
  ]));
  return card;
}

// Files dropped anywhere go to the library, while active() says the library is showing.
export function dropZone(send, active = () => true) {
  let depth = 0;
  let hint = null;
  const enter = (e) => { if (!active() || ![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); depth++; if (!hint) { hint = html('<div class="drop-hint">Drop to add to the library</div>'); document.body.append(hint); } };
  const over = (e) => { if (active() && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); };
  const leave = () => { depth = Math.max(0, depth - 1); if (!depth) { hint?.remove(); hint = null; } };
  const drop = (e) => { if (!active() || !e.dataTransfer?.files?.length) return; e.preventDefault(); depth = 0; hint?.remove(); hint = null; send([...e.dataTransfer.files]); };
  document.addEventListener('dragenter', enter);
  document.addEventListener('dragover', over);
  document.addEventListener('dragleave', leave);
  document.addEventListener('drop', drop);
  onLeave(() => { document.removeEventListener('dragenter', enter); document.removeEventListener('dragover', over); document.removeEventListener('dragleave', leave); document.removeEventListener('drop', drop); hint?.remove(); });
}

export async function phoneLink(ws) {
  try {
    const link = await api(`/api/w/${ws.id}/media/link`, { method: 'POST', body: {} });
    const box = html(`<div class="sheet-stack"><p style="color:var(--text-2)">Open this link on your phone to add up to ${link.files} pictures to ${esc(ws.name)}’s library. It works for an hour.</p></div>`);
    box.append(copyField(link.url));
    sheet('Add pictures from your phone', box, { focus: false });
  } catch (error) { toast(error.message); }
}

function teamView(page, ws) {
  document.title = `Team — ${ws.name}`;
  page.innerHTML = '<div class="page-head"><div><h1>Team</h1></div><div class="actions"></div></div><div data-body><div class="spinner"></div></div>';
  let painted = false;
  const fetchTeam = keeper(`/api/w/${ws.id}/team`, (data) => { painted = true; paintTeam(page, ws, data, load); });
  const load = () => fetchTeam().catch((error) => { if (!painted) $('[data-body]', page).innerHTML = `<p class="muted">${esc(error.message)}</p>`; });
  load();
  return load;
}

function paintTeam(page, ws, data, load) {
  const manage = data.workspace.can_manage;
  $('.actions', page).replaceChildren();
  if (manage) {
    const b = html(`<button type="button" class="btn primary">${icons.plus}Invite people</button>`);
    b.addEventListener('click', () => inviteSheet(ws, load));
    $('.actions', page).append(b);
  }
  const body = $('[data-body]', page);
  body.innerHTML = '';
  const ROLE = { owner: 'Owner', admin: 'Admin', editor: 'Editor' };
  if (manage) {
    const settings = html(`<div><div class="section-title" style="margin-top:0">Workspace</div><div class="group"><div class="row ws-row">${wsLogo(data.workspace, 40)}<div class="row-main"><input class="input" data-name value="${esc(data.workspace.name)}" maxlength="60" aria-label="Workspace name" style="max-width:360px"></div><div class="row-actions"><button class="btn" data-logo>${data.workspace.logo ? 'Change logo' : 'Add a logo'}</button>${data.workspace.logo ? '<button class="btn" data-logo-remove>Remove</button>' : ''}</div></div></div></div>`);
    const nameInput = $('[data-name]', settings);
    nameInput.addEventListener('change', async () => {
      try { await api(`/api/w/${ws.id}`, { method: 'PATCH', body: { name: nameInput.value } }); await loadMe(); toast('Renamed'); redraw(ws.id, 'team'); } catch (error) { toast(error.message); }
    });
    $('[data-logo]', settings).addEventListener('click', () => logoSheet(ws, data.workspace.logo));
    $('[data-logo-remove]', settings)?.addEventListener('click', async () => {
      try { await api(`/api/w/${ws.id}`, { method: 'PATCH', body: { logo: null } }); await loadMe(); redraw(ws.id, 'team'); } catch (error) { toast(error.message); }
    });
    body.append(settings);
  }
  const people = html(`<div><div class="section-title">People</div><div class="group"></div><p class="group-note">Owners and admins invite people and manage the team. Everyone can make, edit, share and present decks.</p></div>`);
  for (const m of data.members) {
    const row = html(`<div class="row">${avatar(m, 36)}<div class="row-main"><span class="row-title">${esc(m.name)}${m.you ? ' <span class="muted">(you)</span>' : ''}</span><span class="row-sub">${esc(m.email || `Joined ${ago(m.joined_at)}`)}</span></div><div class="row-actions"><span class="chip">${ROLE[m.role]}</span></div></div>`);
    if (manage && !m.you && (m.role !== 'owner' || data.workspace.role === 'owner')) {
      const b = html(`<button type="button" class="icon-btn" aria-label="Change ${esc(m.name)}’s role" aria-haspopup="menu">${icons.more}</button>`);
      b.addEventListener('click', () => menu(b, [
        ...['owner', 'admin', 'editor'].filter((r) => r !== 'owner' || data.workspace.role === 'owner').map((r) => ({ label: ROLE[r], checked: m.role === r, run: () => setRole(m, r) })),
        '-', { label: `Remove from ${ws.name}`, icon: icons.trash, danger: true, run: () => setRole(m, 'remove') },
      ]));
      $('.row-actions', row).append(b);
    }
    $('.group', people).append(row);
  }
  async function setRole(m, role) {
    if (role === 'remove' && !(await confirmSheet(`Remove ${m.name}?`, `They lose access to ${ws.name}'s decks and library.`, 'Remove', { danger: true }))) return;
    try { await api(`/api/w/${ws.id}/team/${m.account}`, { method: 'PATCH', body: { role } }); toast(role === 'remove' ? 'Removed' : 'Role changed'); load(); } catch (error) { toast(error.message); }
  }
  body.append(people);
  if (manage && data.invites.length) {
    const inv = html('<div><div class="section-title">Open invites</div><div class="group"></div></div>');
    for (const i of data.invites) {
      const row = html(`<div class="row"><span class="avatar avatar-empty" style="width:36px;height:36px">${icons.mail}</span><div class="row-main"><span class="row-title">${esc(i.email || 'Anyone with the link')}</span><span class="row-sub wraps">${ROLE[i.role]} · from ${esc(i.invited_by || 'the team')} · ${esc(expiresIn(i.expires_at))}</span></div><div class="row-actions"><button class="btn" data-revoke>Revoke</button></div></div>`);
      $('[data-revoke]', row).addEventListener('click', async () => { try { await api(`/api/w/${ws.id}/invites/${i.id}`, { method: 'DELETE' }); row.remove(); toast('Invite revoked'); } catch (error) { toast(error.message); } });
      $('.group', inv).append(row);
    }
    body.append(inv);
  }
  const leave = html(`<div style="margin-top:28px"><button class="btn danger">Leave ${esc(ws.name)}</button></div>`);
  $('button', leave).addEventListener('click', async () => {
    if (!(await confirmSheet(`Leave ${ws.name}?`, 'You lose access to its decks and library until someone invites you again.', 'Leave', { danger: true }))) return;
    try { await api(`/api/w/${ws.id}/leave`, { method: 'POST', body: {} }); await loadMe(); toast(`You left ${ws.name}`); go('/', true); } catch (error) { toast(error.message); }
  });
  body.append(leave);
}

// When an invite stops working, counted forward (ago() only counts back).
function expiresIn(iso) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
  if (!(days > 0)) return 'expires today';
  return days === 1 ? 'expires tomorrow' : `expires in ${days} days`;
}

function inviteSheet(ws, done) {
  const box = html(`<form>
    <div class="field"><span>Role</span><div class="seg" role="radiogroup"><button type="button" class="on" data-role="editor">Editor</button><button type="button" data-role="admin">Admin</button></div><small>Editors make and share decks. Admins also invite people and manage the team.</small></div>
    <label class="field"><span>Email (optional)</span><input class="input" type="email" name="email" placeholder="name@company.com" autocomplete="off"><small>Only this address can use the link. Leave empty for anyone who has it.</small></label>
    <label class="check" style="margin-bottom:6px"><input type="checkbox" name="send"> Also email the invite</label>
    <div class="sheet-actions"><button type="submit" class="btn primary">Create invite link</button></div>
  </form>`);
  let role = 'editor';
  $$('[data-role]', box).forEach((b) => b.addEventListener('click', () => { role = b.dataset.role; $$('[data-role]', box).forEach((x) => x.classList.toggle('on', x === b)); }));
  const s = sheet(`Invite to ${ws.name}`, box);
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = box.email.value.trim();
    try {
      const inv = await api(`/api/w/${ws.id}/invites`, { method: 'POST', body: { role, email: email || undefined, send_email: !!(email && box.send.checked) } });
      const out = html(`<div class="sheet-stack"><p style="color:var(--text-2)">Send this link to ${esc(email || 'the person you’re inviting')}. It works once, for 14 days.</p><span data-field></span>${inv.emailed ? `<p class="hint">${inv.emailed.ok ? 'Emailed as well.' : `The email didn’t go out (${esc(inv.emailed.message || inv.emailed.code || 'email is off on this server')}); send the link yourself.`}</p>` : ''}</div>`);
      $('[data-field]', out).replaceWith(copyField(inv.link));
      s.body.replaceChildren(out);
      done();
    } catch (error) { toast(error.message); }
  });
}

// ---------- Connect via MCP ----------

// One sheet: Deck's icon joined to the MCP mark, the connector address to copy, and how to add
// it to Claude, ChatGPT or Claude Code, or what its tools do. The address comes from /api/me,
// so every host shows its own. Closing it puts focus back where it was opened from, or on the
// avatar when that was the account menu.
const MCP_TABS = [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']];

export function mcpSheet(opener) {
  const address = me.mcp || `${location.origin}/_holm/mcp`;
  const command = `claude mcp add --transport http deck ${address}`;
  const row = (lead, title, text) => `<div class="mcp-row">${lead}<div class="mcp-t"><b>${title}</b><small>${text}</small></div></div>`;
  const step = (n, title, text) => row(`<span class="mcp-ic num">${n}</span>`, title, text);
  const can = (icon, title, text) => row(`<span class="mcp-ic">${icon}</span>`, title, text);
  const panes = {
    claude: `<div class="group">${step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.')}${step(2, 'Add a custom connector', 'Name it Deck and paste the address.')}${step(3, 'Connect and sign in', 'Allow access once. Claude sees only your workspaces.')}</div>`,
    chatgpt: `<div class="group">${step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.')}${step(2, 'Create a connector', 'Name it Deck, paste the address and choose OAuth.')}${step(3, 'Connect and sign in', 'Then pick Deck from + in a chat.')}</div>`,
    code: '<div class="sheet-stack" data-code><p class="mcp-note">Run it in a terminal, then type <code class="inline">/mcp</code> in Claude Code and sign in.</p></div>',
    tools: `<div class="group">${can(icons.decks, 'Make and edit decks', 'Write a deck, or change a few slides.')}${can(icons.history, 'Read and go back', 'Any deck, its notes and earlier versions.')}${can(icons.image, 'Add pictures', 'Drawings, or a link to send from a phone.')}${can(icons.share, 'Share and invite', 'Share by link, and invite your team.')}</div>`,
  };
  const box = html(`<div class="sheet-stack mcp">
    <div class="mcp-hero" aria-hidden="true"><img class="mcp-app" src="/icon-192.png" alt="" width="60" height="60"><span class="mcp-link"><i></i><i></i><i></i><i></i><i></i></span><span class="mcp-tile">${MCP_MARK}</span></div>
    <div class="mcp-label">Connector address</div>
    <span data-address></span>
    <div class="seg mcp-seg" role="group" aria-label="Where to connect">${MCP_TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="mcp-panes">${MCP_TABS.map(([k]) => `<div data-pane="${k}">${panes[k]}</div>`).join('')}</div>
  </div>`);
  $('[data-address]', box).replaceWith(copyField(address));
  $('[data-code]', box).prepend(copyField(command));
  const show = (tab) => {
    $$('[data-tab]', box).forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
    $$('[data-pane]', box).forEach((p) => { p.classList.toggle('is-on', p.dataset.pane === tab); p.inert = p.dataset.pane !== tab; });
  };
  $$('[data-tab]', box).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show('claude');
  const s = sheet('Connect via MCP', box, {
    focus: false,
    onClose: () => { const back = opener && opener.isConnected && !opener.closest('.menu') ? opener : $('.avatar-btn'); back?.focus({ preventScroll: true }); },
  });
  s.box.classList.add('mcp-box');
  // Focus the sheet itself, so nothing inside it shows a focus ring until someone tabs.
  s.box.tabIndex = -1;
  s.box.focus({ preventScroll: true });
  return s;
}

// ---------- first workspace, invites ----------

function newWorkspacePage() {
  document.title = 'New workspace — Deck';
  const first = (me.name || '').trim().split(/\s+/)[0];
  const isFirst = !me.workspaces.length;
  const page = html(`<div class="card-page"><div class="solo">${markTile(40)}<h1 style="margin-top:18px">${isFirst ? `Welcome${first ? `, ${esc(first)}` : ''}` : 'A new workspace'}</h1><p>${isFirst ? 'Decks live in a workspace you can share with your team. Name yours; you can change it later.' : 'A workspace has its own decks, library and people.'}</p>
    <form><label class="field"><span>Workspace name</span><input class="input" name="name" maxlength="60" required value="${esc(isFirst && first ? `${first}’s team` : '')}" placeholder="Acme"></label><button class="btn primary" type="submit">Create workspace</button></form>
    ${isFirst ? '<p class="hint" style="margin-top:14px">We’ll add a sample deck to show what Deck can do.</p>' : ''}</div></div>`);
  mount(topBar(), page);
  const form = $('form', page);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const made = await api('/api/workspaces', { method: 'POST', body: { name: form.name.value } });
      await loadMe();
      rememberWorkspace(made.workspace.id);
      go(`/w/${made.workspace.id}`);
    } catch (error) { button.disabled = false; toast(error.message); }
  });
  setTimeout(() => form.name.select(), 60);
}

async function joinPage(code) {
  document.title = 'Join — Deck';
  mount(topBar(), html('<div class="card-page"><div class="spinner"></div></div>'));
  let info;
  try { info = await api(`/api/join/${code}`); } catch (error) { info = { valid: false, reason: error.message }; }
  const logo = info.workspace ? wsLogo({ logo: info.logo, initial: info.initial }, 48) : markTile(44);
  let body;
  if (info.member) body = `<p>${esc(info.reason)}</p><form><a class="btn primary" href="/w/${info.id}" data-nav>Open ${esc(info.workspace)}</a></form>`;
  else if (!info.valid) body = `<p>${esc(info.reason)}</p><form><a class="btn primary" href="/" data-nav>Go to Deck</a></form>`;
  else if (!me.signed_in) body = `<p>${esc(info.invited_by || 'Someone')} invited you to make decks with ${esc(info.workspace)} as ${info.role === 'admin' ? 'an admin' : 'an editor'}.${info.email ? ` The invite is for ${esc(info.email)}.` : ''}</p><form><a class="btn primary" href="${esc(me.login_url)}">Sign in to join</a></form>`;
  else body = `<p>${esc(info.invited_by || 'Someone')} invited you to make decks with ${esc(info.workspace)} as ${info.role === 'admin' ? 'an admin' : 'an editor'}.</p><form><button class="btn primary" type="submit">Join ${esc(info.workspace)}</button></form>`;
  const page = html(`<div class="card-page"><div class="solo">${logo}<h1>${esc(info.workspace ? `Join ${info.workspace}` : 'Invite')}</h1>${body}</div></div>`);
  mount(topBar(), page);
  $('form', page)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/api/join/${code}`, { method: 'POST', body: {} });
      await loadMe();
      rememberWorkspace(r.workspace);
      toast(`Welcome to ${info.workspace}`);
      go(`/w/${r.workspace}`);
    } catch (error) { toast(error.message); }
  });
}

// ---------- ⌘K ----------

// A place, a deck or something to do, by typing a few letters of it. ⌘K again, Escape or a
// click outside closes it.
let palette = null;
function openPalette() {
  if (palette) { palette.close(); return; }
  if (!me || !me.signed_in) return;
  const ws = (place && place.ws) || lastWorkspace();
  const opener = document.activeElement;
  const input = html('<input class="pal-field" type="text" placeholder="Go to, find or do…" aria-label="Go to, find or do" autocomplete="off" spellcheck="false">');
  const list = html('<div class="pal-list" role="listbox" aria-label="Results"></div>');
  const box = html(`<div class="pal" role="dialog" aria-modal="true" aria-label="Command menu"><div class="pal-top">${icons.search}</div></div>`);
  $('.pal-top', box).append(input, html('<kbd>esc</kbd>'));
  box.append(list);
  const layer = html('<div class="pal-layer"></div>');
  layer.append(box);
  layer.addEventListener('pointerdown', (e) => { if (e.target === layer) close(); });
  document.body.append(layer);
  input.focus();
  let decks = [];
  try { decks = ws ? (JSON.parse(localStorage.getItem(`deck.cache:/api/w/${ws.id}`) || 'null')?.decks || []) : []; } catch { /* none kept */ }
  const commands = () => [
    ...(ws ? [
      { label: 'Decks', icon: icons.decks, hint: ws.name, run: () => go(`/w/${ws.id}`) },
      { label: 'Library', icon: icons.image, hint: ws.name, run: () => go(`/w/${ws.id}/library`) },
      { label: 'Team', icon: icons.team, hint: ws.name, run: () => go(`/w/${ws.id}/team`) },
    ] : []),
    ...decks.map((d) => ({ label: d.title, icon: icons.decks, hint: 'Deck', deck: true, run: () => go(`/d/${d.id}`) })),
    ...(ws ? [{ label: 'New deck', icon: icons.plus, run: () => newDeck(ws) }] : []),
    { label: 'Connect via MCP…', icon: MCP_MARK, run: () => mcpSheet() },
    ...me.workspaces.filter((w) => !ws || w.id !== ws.id).map((w) => ({ label: w.name, icon: wsLogo(w, 18), hint: 'Workspace', run: () => go(`/w/${w.id}`) })),
    { label: 'New workspace', icon: icons.plus, run: () => go('/new') },
  ];
  const score = (text, q) => {
    const t = String(text).toLowerCase();
    if (t.startsWith(q)) return 3;
    if (t.includes(' ' + q)) return 2;
    if (t.includes(q)) return 1;
    let i = 0;
    for (const ch of t) if (ch === q[i]) i++;
    return i === q.length ? 0.5 : 0;
  };
  let at = 0;
  let shown = [];
  function draw() {
    const q = input.value.trim().toLowerCase();
    const all = commands();
    // With nothing typed: places, the six latest decks, then the rest.
    let decksLeft = 6;
    shown = q ? all.map((c) => ({ ...c, s: score(c.label, q) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 12)
      : all.filter((c) => !c.deck || decksLeft-- > 0);
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((c, n) => {
      const b = html(`<button type="button" class="pal-item${n === at ? ' is-on' : ''}" role="option" aria-selected="${n === at}"><span class="pal-ic">${c.icon}</span><span class="pal-label"></span>${c.hint ? '<small></small>' : ''}</button>`);
      $('.pal-label', b).textContent = c.label;
      if (c.hint) $('small', b).textContent = c.hint;
      b.addEventListener('pointermove', () => { if (at !== n) { at = n; mark(); } });
      b.addEventListener('click', () => pick(c));
      return b;
    }) : [html('<div class="pal-none">Nothing matches</div>')]));
  }
  const mark = () => [...list.children].forEach((el, n) => { el.classList.toggle('is-on', n === at); el.setAttribute('aria-selected', String(n === at)); });
  // Keep the chosen row in view by scrolling the list itself, never the page.
  const reveal = () => {
    const el = list.children[at];
    if (!el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 6;
  };
  function pick(c) { close(); setTimeout(() => c.run(), 0); }
  function close() {
    if (palette !== api_) return;
    palette = null;
    document.removeEventListener('keydown', onKey, true);
    layer.classList.add('out');
    setTimeout(() => layer.remove(), 160);
    if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); reveal(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); reveal(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]); }
  }
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { at = 0; draw(); list.scrollTop = 0; });
  draw();
  const api_ = { close };
  palette = api_;
}
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    if (!palette && ($('.sheet-box') || $('.menu'))) return;
    e.preventDefault();
    openPalette();
  }
});

// ---------- start ----------

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname.endsWith('localhost'))) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

applyTheme();
const keptAccount = keptMe();
if (keptAccount) {
  // Draw at once from the account kept here, then take the server's answer.
  me = keptAccount;
  route();
  loadMe().then((fresh) => {
    if (shown(fresh) === shown(keptAccount)) return;
    if (location.pathname.startsWith('/d/') && fresh.signed_in) return;
    cleanup();
    route();
  }).catch(() => {});
} else {
  try {
    await loadMe();
    route();
  } catch (error) {
    root.innerHTML = `<div class="card-page"><div class="solo"><h1>Deck can’t load</h1><p>${esc(error.message)}</p><form><button class="btn primary" type="button" onclick="location.reload()">Try again</button></form></div></div>`;
  }
}
