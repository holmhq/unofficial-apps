// Relay — app bootstrap, shell, router, realtime wiring.
// #app is the persistent shell container. Screens mount into it directly.
// Routing uses the History API (clean URLs) on Holm's --spa fallback.

import { el, clear, iconEl, toast, avatarEl, openSheet, closeSheet, holmFooter } from './ui.js';
import * as rt from './realtime.js';
import { init as initTheme } from './theme.js';
import { loadSession, openSignIn, session } from './auth.js';
import { data, on, emit, prefs, conversationSync } from './state.js';
import { api } from './api.js';
import { unlock as unlockSound } from './sound.js';
import { navigate, back, chatPath } from './router.js';

import * as onboarding from './pages/onboarding.js';
import * as conversations from './pages/conversations.js';
import * as discover from './pages/discover.js';
import * as friends from './pages/friends.js';
import * as settings from './pages/settings.js';
import * as chat from './pages/chat.js';

// ── boot ───────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  // A notification tap focuses this window; sw.js asks it to open the chat.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'relay:navigate' && typeof e.data.url === 'string' && e.data.url.charAt(0) === '/') navigate(e.data.url);
  });
}
// ── viewport tracking ─────────────────────────────────────────────────────
// visualViewport.height is the actually-visible height — it shrinks when the
// iOS soft keyboard opens (100dvh does NOT), so driving the app shell from
// --vvh keeps the composer + recent messages above the keyboard and docks
// sheets above it.
const docEl = document.documentElement;
function syncViewport() {
  const vv = window.visualViewport;
  docEl.style.setProperty('--vvh', `${(vv && vv.height) || window.innerHeight}px`);
  docEl.style.setProperty('--vvw', `${(vv && vv.width) || window.innerWidth}px`);
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  docEl.style.setProperty('--kb', docEl.classList.contains('keyboard') ? `${kb}px` : '0px');
}
syncViewport();
window.addEventListener('resize', syncViewport);
window.addEventListener('orientationchange', syncViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewport);
  window.visualViewport.addEventListener('scroll', syncViewport);
}
// Installed PWA has no Safari URL bar → apply the real bottom safe-area inset
// (styles.css :root.standalone). JS fallback alongside the (display-mode:
// standalone) media query, for older iOS.
if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone) {
  docEl.classList.add('standalone');
}

// ── join links (/join/<token>) — email-invite redemption ────────────────────
// Capture the token before routing, stash it, and normalize the URL to '/'.
// After sign-in + username claim (session 'ready'), maybeRedeemJoin() consumes
// it: the sender's invite lands in this member's inbox (badge) to accept.
const JOIN_RE = /^\/join\/([A-Za-z0-9_-]+)\/?$/;
(function captureJoinToken() {
  const m = (location.pathname || '').match(JOIN_RE);
  if (!m) return;
  try { sessionStorage.setItem('relay:join', m[1]); } catch (_e) {}
  try { history.replaceState({}, '', '/'); } catch (_e) {}
})();
function pendingJoinToken() {
  try { return sessionStorage.getItem('relay:join') || ''; } catch (_e) { return ''; }
}
let joinRedeemed = false;
function maybeRedeemJoin() {
  const token = pendingJoinToken();
  if (!token || joinRedeemed) return;
  joinRedeemed = true;
  try { sessionStorage.removeItem('relay:join'); } catch (_e) {}
  api.redeemJoin(token)
    .then((res) => {
      if (res && res.redeemed) {
        refreshInvites();
        toast('You’ve been invited — see Friends', 'user-plus');
        navigate('/friends');
      }
    })
    .catch(() => {});
}

initTheme();
const _unlock = () => { unlockSound(); document.removeEventListener('pointerdown', _unlock); };
document.addEventListener('pointerdown', _unlock);

const root = document.getElementById('app');

let topbar, titleNode, stage, tabbar;
let currentCleanup = null;

const TABS = [
  { id: 'chats', icon: 'message-circle', label: 'Chats', path: '/' },
  { id: 'discover', icon: 'user-plus', label: 'Add', path: '/discover' },
  { id: 'friends', icon: 'users', label: 'Friends', path: '/friends' },
  { id: 'settings', icon: 'settings', label: 'Settings', path: '/settings' }
];

function buildShell() {
  clear(root);
  titleNode = el('div', { class: 'tb-title' });
  topbar = el('div', { class: 'topbar' });
  stage = el('div', { class: 'stage' });
  tabbar = el('div', { class: 'tabbar' });
  TABS.forEach((t) => {
    const btn = el('button', { class: 'tab', 'aria-label': t.label, title: t.label, onclick: () => navigate(t.path) },
      iconEl(t.icon, { size: '24px' }),
      el('span', { text: t.label }));
    btn.dataset.tab = t.id;
    tabbar.appendChild(btn);
  });
  root.appendChild(topbar);
  root.appendChild(stage);
  root.appendChild(tabbar);
}

// ── session-driven render ──────────────────────────────────────────────────
function render() {
  const s = session.status;
  if (currentCleanup) { try { currentCleanup(); } catch (_e) {} currentCleanup = null; }

  if (s === 'loading') {
    clear(root);
    root.appendChild(el('div', { class: 'boot' }, el('img', { class: 'boot-mark', src: '/favicon.svg', alt: '', width: '76', height: '76' })));
    return;
  }
  if (s === 'signed-out') {
    clear(root);
    root.appendChild(signInScreen());
    return;
  }
  if (s === 'needs-onboarding') {
    clear(root);
    currentCleanup = onboarding.mount(root) || null;
    return;
  }

  // ready
  buildShell();
  setupRealtime();
  route();
  maybeRedeemJoin();
}

function signInScreen() {
  const invited = !!pendingJoinToken();
  return el('div', { class: 'center fade-in' },
    el('img', { class: 'crest', src: '/favicon.svg', alt: 'Relay', width: '84', height: '84' }),
    el('h1', { text: 'Relay' }),
    el('p', { text: invited
      ? 'You’ve been invited to Relay — a private, mobile-first messenger. Sign in to connect.'
      : 'A private, mobile-first messenger. Connect by username — Relay never reveals who’s here.' }),
    el('button', { class: 'btn', style: { marginTop: '4px' }, onclick: () => openSignIn() }, invited ? 'Sign in to connect' : 'Sign in'),
    holmFooter()
  );
}

// ── router (clean URLs) ────────────────────────────────────────────────────
function parsePath() {
  const p = location.pathname || '/';
  const g = p.match(/^\/chat\/group\/(.+)$/);
  if (g) return { name: 'chat', kind: 'group', param: decodeURIComponent(g[1]) };
  const u = p.match(/^\/chat\/@(.+)$/);
  if (u) return { name: 'chat', kind: 'user', param: decodeURIComponent(u[1]) };
  const m = p.match(/^\/chat\/(.+)$/);
  if (m) return { name: 'chat', kind: 'room', param: decodeURIComponent(m[1]) };
  if (p === '/discover') return { name: 'discover' };
  if (p === '/friends') return { name: 'friends' };
  if (p === '/settings') return { name: 'settings' };
  return { name: 'chats' };
}

// A monotonic generation so a route() that is still awaiting (e.g. a cold-load
// conversation fetch) can bail if a newer navigation supersedes it — prevents a
// stale continuation from mounting a chat twice.
let routeGen = 0;
async function route() {
  const gen = ++routeGen;
  const r = parsePath();
  if (currentCleanup) { try { currentCleanup(); } catch (_e) {} currentCleanup = null; }
  clear(stage);

  if (r.name === 'chat') {
    root.classList.add('chat-mode');

    // Resolve the room from my conversations list. /chat/<roomId> resolves by id;
    // /chat/@username and /chat/group/<slug> resolve from the list (which carries
    // each room's username / slug). A cold deep-link loads the list first.
    let room = null;
    if (r.kind === 'room') {
      room = data.conversations.find((c) => c.id === r.param);
      if (!room) {
        try { await refreshConversations(); } catch (_e) {}
        if (gen !== routeGen) return;            // superseded — don't double-mount
        room = data.conversations.find((c) => c.id === r.param);
      }
      room = room || { id: r.param };            // unknown id — mount best-effort
    } else {
      if (!data.conversations.length) {
        try { await refreshConversations(); } catch (_e) {}
        if (gen !== routeGen) return;
      }
      room = r.kind === 'user'
        ? data.conversations.find((c) => c.type !== 'group' && c.username === r.param)
        : data.conversations.find((c) => c.type === 'group' && c.slug === r.param);
      if (!room) { mountNoRoom(r); return; }     // no such chat for me
    }

    setTopbar({
      back: true,
      title: room.title || 'Chat',
      actions: [el('button', { class: 'ibtn', 'aria-label': room.type === 'group' ? 'Group info' : 'Contact details', onclick: () => (room.type === 'group' ? openGroupSheet(room) : openContactSheet(room)) }, iconEl('ellipsis'))]
    });
    const host = el('div', { class: 'chat fade-in' });
    stage.appendChild(host);
    currentCleanup = chat.mount(host, { room: room, roomId: room.id }) || null;
    return;
  }

  if (gen !== routeGen) return;                // bail if superseded mid-await
  root.classList.remove('chat-mode');
  highlightTab(r.name);

  let page;
  if (r.name === 'chats') { setTopbar({ title: 'Relay', brand: true, actions: [newChatBtn()] }); page = conversations; }
  else if (r.name === 'discover') { setTopbar({ title: 'Add someone' }); page = discover; }
  else if (r.name === 'friends') { setTopbar({ title: 'Friends' }); page = friends; }
  else { setTopbar({ title: 'Settings' }); page = settings; }

  const host = el('div', { class: 'view' });
  stage.appendChild(host);
  currentCleanup = page.mount(host) || null;
}

// /chat/@username or /chat/group/<slug> where I have no such room: a neutral
// screen (never an existence oracle). DM → offer to send an invite; group → the
// group is invite-only / handle not found.
function mountNoRoom(r) {
  setTopbar({ back: true, title: r.kind === 'user' ? '@' + r.param : 'Group' });
  let body;
  if (r.kind === 'user') {
    body = el('div', { class: 'center fade-in' },
      el('div', { class: 'discover-icon' }, iconEl('user-plus', { size: '26px' })),
      el('h2', { text: 'No chat with @' + r.param }),
      el('p', { class: 'muted', text: 'You don’t have a conversation with @' + r.param + ' yet. Send an invite — they’ll appear in Friends once they accept. (Relay never reveals whether they’re here.)' }),
      el('button', { class: 'btn', style: { marginTop: '6px' }, onclick: () => {
        api.sendInvite(r.param)
          .then(() => { toast('Invite sent to @' + r.param, 'check'); navigate('/discover'); })
          .catch(() => toast('Could not send invite', 'x'));
      } }, iconEl('send', { size: '18px' }), 'Send invite'),
      el('button', { class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => back() }, 'Back')
    );
  } else {
    body = el('div', { class: 'center fade-in' },
      el('div', { class: 'discover-icon' }, iconEl('users', { size: '26px' })),
      el('h2', { text: 'Group not available' }),
      el('p', { class: 'muted', text: 'This group is invite-only, or the handle wasn’t found. Ask a member to invite you.' }),
      el('button', { class: 'btn ghost', style: { marginTop: '8px' }, onclick: () => back() }, 'Back')
    );
  }
  stage.appendChild(body);
  currentCleanup = null;
}

function newChatBtn() {
  return el('button', { class: 'ibtn', 'aria-label': 'New chat', onclick: () => navigate('/discover') }, iconEl('user-plus'));
}

// Chat header "⋯" → contact details sheet. Editable display name (alias) +
// a viewer-scoped custom photo (set/remove). Both override only for me.
function openContactSheet(room) {
  const me = session.member && session.member.id;
  const contactId = (room.members || []).find((id) => id !== me) || '';
  const initial = room.alias || room.realTitle || room.title || '';
  const input = el('input', { class: 'input', value: initial, placeholder: 'Display name', maxlength: '60', autocomplete: 'off' });
  const photoInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

  // roomDTO already returns the custom-photo URL as `picture` when one is set.
  let photoUrl = room.picture || '';
  const avatarBox = el('div', { class: 'contact-avatar-wrap', role: 'button', tabindex: '0', 'aria-label': 'Set photo', onclick: () => photoInput.click() });

  function renderAvatar() {
    clear(avatarBox);
    const node = avatarEl({ picture: photoUrl, avatar: room.avatar, username: room.username, displayName: room.title }, 76);
    node.classList.add('contact-avatar');
    avatarBox.appendChild(node);
    avatarBox.appendChild(el('div', { class: 'contact-avatar-cam' }, iconEl('camera', { size: '15px' })));
  }
  renderAvatar();
  // Always present; visibility tracks whether a custom photo is set, so the
  // button appears right after setPhoto() and disappears after clearPhoto()
  // without rebuilding the whole sheet body.
  const removeBtn = el('button', { class: 'btn ghost block', onclick: clearPhoto }, iconEl('trash-2', { size: '16px' }), 'Remove photo');
  const syncRemoveBtn = () => { removeBtn.style.display = (room.customPicture || !!photoUrl) ? '' : 'none'; };
  syncRemoveBtn();

  function setPhoto(file) {
    api.setContactAvatar(room.id, file)
      .then(() => {
        photoUrl = contactId ? (api.contactAvatarUrl(contactId) + '?v=' + Date.now()) : photoUrl;
        room.picture = photoUrl; room.customPicture = true;
        renderAvatar(); syncRemoveBtn();
        emit('conversations');          // refresh Chats/Friends avatars
        toast('Photo updated', 'check');
      })
      .catch(() => toast('Could not update photo', 'x'));
  }
  function clearPhoto() {
    api.clearContactAvatar(room.id)
      .then(() => {
        photoUrl = ''; room.picture = ''; room.customPicture = false;
        renderAvatar(); syncRemoveBtn();
        emit('conversations');
        toast('Photo removed', 'check');
      })
      .catch(() => toast('Could not remove photo', 'x'));
  }
  photoInput.addEventListener('change', () => { const f = photoInput.files && photoInput.files[0]; if (f) setPhoto(f); photoInput.value = ''; });

  function save() {
    const val = input.value.trim();
    api.setAlias(room.id, val)
      .then(() => {
        const c = data.conversations.find((x) => x.id === room.id);
        const newTitle = val || (c && c.realTitle) || room.realTitle || room.title;
        if (c) { c.alias = val; c.title = newTitle; }
        room.alias = val; room.title = newTitle;
        const big = titleNode && titleNode.firstChild;
        if (big) big.textContent = newTitle || 'Chat';
        emit('conversations');          // refresh Chats/Friends with the new name
        toast(val ? 'Name updated' : 'Name reset', 'check');
        closeSheet();
      })
      .catch(() => toast('Could not update name', 'x'));
  }

  const body = el('div', { class: 'sheet-body' },
    photoInput,
    el('div', { class: 'contact-card' },
      avatarBox,
      el('div', { class: 'ph-name', text: room.title || 'Relay chat' }),
      room.username ? el('div', { class: 'ph-user mono', text: '@' + room.username }) : null,
      el('div', { class: 'hint', text: 'Tap the photo to set a custom picture (only visible to you).' })
    ),
    el('div', { class: 'field', style: { marginTop: '4px' } },
      el('label', { text: 'Display name (only visible to you)' }),
      input,
      room.alias ? el('div', { class: 'hint', text: 'Real name: ' + (room.realTitle || '') }) : null
    ),
    el('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: save }, 'Save'),
    removeBtn,
    el('button', { class: 'btn ghost block', onclick: () => closeSheet() }, 'Cancel')
  );
  openSheet(body);
  setTimeout(() => { input.focus(); input.select(); }, 140);
}

// Group info sheet: member roster (everyone sees everyone), invite-by-username
// (consent required — they must accept), and leave. Members are added only via
// accepted invites, never silently.
function openGroupSheet(room) {
  const me = session.member && session.member.id;
  const addInput = el('input', { class: 'input', type: 'text', inputmode: 'latin', autocapitalize: 'none',
    autocomplete: 'off', spellcheck: 'false', maxlength: '24', placeholder: 'username' });
  function doAdd() {
    const u = String(addInput.value || '').trim().toLowerCase().replace(/^@/, '');
    if (!u) { addInput.focus(); return; }
    api.sendInvite(u, room.id)
      .then(() => { addInput.value = ''; toast('Invite sent to @' + u, 'check'); })
      .catch(() => toast('Could not send invite', 'x'));
  }
  function doLeave() {
    closeSheet();
    api.leaveGroup(room.id)
      .then(() => { toast('Left group', 'check'); refreshConversations(); navigate('/'); })
      .catch(() => toast('Could not leave group', 'x'));
  }
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

  // Group handle (clean URL /chat/group/<slug>). Creator sets/edits/clears it;
  // other members just see the link.
  const isCreator = me === room.createdBy;
  const slugInput = el('input', { class: 'input mono', type: 'text', inputmode: 'latin', autocapitalize: 'none',
    autocomplete: 'off', spellcheck: 'false', maxlength: '30', value: room.slug || '', placeholder: 'stanford_cs_2026' });
  function doSetSlug() {
    const s = String(slugInput.value || '').trim().toLowerCase().replace(/^@/, '');
    api.setGroupSlug(room.id, s)
      .then((res) => {
        const c = data.conversations.find((x) => x.id === room.id);
        if (c && res.room) c.slug = res.room.slug;
        room.slug = res.room ? res.room.slug : room.slug;
        toast(s ? 'Handle saved' : 'Handle cleared', 'check');
        emit('conversations');
        const r0 = parsePath();               // if this group is open, move to its canonical URL
        if (r0.name === 'chat') { const cur = data.conversations.find((x) => x.id === room.id); if (cur) navigate(chatPath(cur)); }
        closeSheet();
      })
      .catch((e) => toast((e && e.data && e.data.error) || 'Could not save handle', 'x'));
  }
  slugInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetSlug(); });

  const roster = (room.memberProfiles || []).map((p) =>
    el('div', { class: 'member-row' },
      avatarEl({ picture: p.picture, username: p.username, displayName: p.displayName }, 38),
      el('div', { class: 'member-name', text: p.displayName || ('@' + p.username) }),
      p.id === me ? el('span', { class: 'pill muted', text: 'you' }) : null));

  openSheet(el('div', { class: 'sheet-body' },
    el('div', { class: 'contact-card' },
      el('div', { class: 'avatar group-mark' }, iconEl('users', { size: '30px' })),
      el('div', { class: 'ph-name', text: room.title || 'Group' }),
      el('div', { class: 'ph-user mono', text: (room.memberCount || (room.members || []).length) + ' members' })
    ),
    isCreator
      ? el('div', { class: 'field', style: { marginTop: '10px' } },
          el('label', { text: 'Group handle (clean link)' }), slugInput,
          el('div', { class: 'hint mono' }, room.slug ? (location.host + '/chat/group/' + room.slug) : '3–30 chars: letters, numbers, underscore'),
          el('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: doSetSlug }, room.slug ? 'Update handle' : 'Set handle'))
      : (room.slug ? el('div', { class: 'field', style: { marginTop: '10px' } },
          el('label', { text: 'Group link' }),
          el('div', { class: 'hint mono' }, location.host + '/chat/group/' + room.slug)) : null),
    el('div', { class: 'sec-label', text: 'Members' }),
    el('div', { class: 'member-list' }, ...roster),
    el('div', { class: 'field', style: { marginTop: '12px' } },
      el('label', { text: 'Add member by username' }),
      el('div', { class: 'input-wrap' }, el('span', { class: 'input-prefix', text: '@' }), addInput)),
    el('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: doAdd }, iconEl('user-plus', { size: '18px' }), 'Send invite'),
    el('button', { class: 'btn block danger', style: { marginTop: '10px' }, onclick: doLeave }, iconEl('log-out', { size: '18px' }), 'Leave group'),
    el('button', { class: 'btn ghost block', onclick: () => closeSheet() }, 'Close')
  ));
  setTimeout(() => addInput.focus(), 120);
}

function setTopbar(opts) {
  clear(topbar);
  if (opts.back) {
    topbar.appendChild(el('button', { class: 'ibtn', 'aria-label': 'Back', onclick: () => back() }, iconEl('chevron-left')));
  }
  titleNode.textContent = '';
  titleNode.appendChild(el('big', { text: opts.title || '' }));
  if (opts.brand) topbar.appendChild(el('img', { class: 'tb-mark', src: '/favicon.svg', alt: '', width: '28', height: '28' }));
  topbar.appendChild(titleNode);
  topbar.appendChild(el('div', { class: 'spacer' }));
  if (opts.actions) opts.actions.forEach((a) => topbar.appendChild(a));
}

function highlightTab(name) {
  tabbar.querySelectorAll('.tab').forEach((t) => {
    t.setAttribute('aria-current', t.dataset.tab === name ? 'page' : 'false');
    const dot = t.querySelector('.dot');
    if (dot) dot.remove();
    if (t.dataset.tab === 'friends' && data.incoming.length) {
      t.appendChild(el('span', { class: 'dot' }));
    }
  });
}

// Live-update the chat header name when the conversation list changes (a realtime
// 'conversation' refresh, or a contact setting a display name) while a thread is
// open. The cold-load case is covered by route() awaiting the fetch first.
function syncChatHeader() {
  const r = parsePath();
  if (r.name !== 'chat') return;
  const room = data.conversations.find((c) => c.id === r.param);
  if (room && titleNode && titleNode.firstChild) {
    titleNode.firstChild.textContent = room.title || 'Chat';
  }
}

// ── realtime ───────────────────────────────────────────────────────────────
let rtSetup = false;
let rtSawConnected = false;
function setupRealtime() {
  if (rtSetup || !session.member) return;
  rtSetup = true;
  rt.connect();
  rt.onState((state) => {
    if (state !== 'connected') return;
    if (!rtSawConnected) { rtSawConnected = true; return; }
    scheduleSync();
    refreshInvites();
  });
  if (session.channel) rt.channel(session.channel, onUserData);
  refreshConversations();
  refreshInvites();
}

function onUserData(payload) {
  if (!payload) return;
  if (payload.type === 'relay:messageNotify') onMessageNotify(payload);
  else if (payload.type === 'relay:conversation') refreshConversations();
  else if (payload.type === 'relay:invite') { refreshInvites(); toast('New invitation', 'user-plus'); }
  else if (payload.type === 'relay:inviteAccepted') {
    refreshConversations();
    refreshInvites();
    const who = payload.by ? (payload.by.displayName || ('@' + payload.by.username)) : 'Someone';
    toast(who + ' accepted your invite', 'check');
  }
}

// Foreground notifications (only while Relay runs: Holm has no Web Push yet).
// Shown via the service worker so they work in installed PWAs (Android
// Chrome and iOS home-screen apps reject `new Notification`); sw.js handles taps.
function onMessageNotify(p) {
  const r = parsePath();
  const viewingThis = r.name === 'chat' && decodeURIComponent(r.param) === p.roomId;
  if (viewingThis && document.hasFocus()) return;          // you're already reading it
  if (!notificationsEnabled()) return;
  if (!document.hidden && viewingThis) return;             // thread is open but unfocused — skip toast spam
  const room = data.conversations.find((c) => c.id === p.roomId);
  const url = room ? chatPath(room) : '/chat/' + encodeURIComponent(p.roomId);
  const opts = { body: p.preview || 'New message', tag: 'relay:' + p.roomId, icon: '/icon-192.png', data: { url } };
  const title = p.senderName || 'Relay';
  const pageNotify = () => {
    try {
      const n = new Notification(title, opts);
      n.onclick = () => { window.focus(); navigate(url); n.close(); };
    } catch (_e) {}
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.showNotification(title, opts) : pageNotify()))
      .catch(pageNotify);
  } else pageNotify();
}
// Clear notifications for chats that are now read (here or on another device).
function closeReadNotifications() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration()
    .then((reg) => (reg && reg.getNotifications ? reg.getNotifications() : []))
    .then((list) => list.forEach((n) => {
      if (!n.tag || n.tag.indexOf('relay:') !== 0) return;
      const c = data.conversations.find((x) => x.id === n.tag.slice(6));
      if (!c || !(Number(c.unread) > 0)) n.close();
    }))
    .catch(() => {});
}
function updateTitle() {
  const count = (data.conversations || []).reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
  document.title = count ? ('Relay (' + count + ')') : 'Relay';
  // Home-screen icon badge (installed PWA; no-op elsewhere).
  try {
    if (count && navigator.setAppBadge) navigator.setAppBadge(count).catch(() => {});
    else if (!count && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (_e) {}
  closeReadNotifications();
}
function notificationsEnabled() {
  return prefs.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

let conversationsInflight = null;
let conversationsInflightGen = 0;
function refreshConversations() {
  // Dedupe only within the current generation; a read invalidates older fetches.
  if (conversationsInflight && conversationsInflightGen === conversationSync.generation) return conversationsInflight;
  const gen = ++conversationSync.generation;
  conversationsInflightGen = gen;
  const pending = api.conversations()
    .then((res) => {
      if (gen !== conversationSync.generation) return;
      data.conversations = (res && res.conversations) || [];
      conversationSync.applied++;
      emit('conversations', { refreshed: true });
    })
    .catch(() => {})
    .finally(() => { if (conversationsInflight === pending) conversationsInflight = null; });
  conversationsInflight = pending;
  return pending;
}
on('conversations:refresh', refreshConversations);
function refreshInvites() {
  Promise.all([api.incoming(), api.outbox()])
    .then(([inc, sent]) => {
      data.incoming = (inc && inc.invites) || [];
      data.outbox = (sent && sent.invites) || [];
      emit('invites');
      highlightTab(parsePath().name);
    })
    .catch(() => {});
}

// Reads on this device clear other tabs without another network request.
let readChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    readChannel = new BroadcastChannel('relay');
    readChannel.onmessage = ({ data: message }) => {
      if (session.status !== 'ready' || !message || message.type !== 'read') return;
      const room = data.conversations.find((c) => c.id === message.roomId);
      if (!room || typeof message.readAt !== 'number' || !Number.isFinite(message.readAt) || !(Number(room.lastAt) <= message.readAt)) return;
      conversationSync.generation++;
      conversationSync.reads[room.id] = (conversationSync.reads[room.id] || 0) + 1;
      room.unread = 0;
      emit('conversations');
    };
  }
} catch (_e) {}
on('room:read', (room) => {
  // A partial watermark read must not clear another tab's still-unread messages.
  if (readChannel && room && room.unread === 0) {
    try { readChannel.postMessage({ type: 'read', roomId: room.id, readAt: room.readAt }); } catch (_e) {}
  }
});

let syncTimer = null;
function scheduleSync() {
  if (document.hidden || session.status !== 'ready' || !session.member) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (document.hidden || session.status !== 'ready' || !session.member) return;
    refreshConversations().then(() => emit('sync'));
  }, 500);
}

// ── wire events ────────────────────────────────────────────────────────────
on('session', render);
on('invites', () => highlightTab(parsePath().name));
on('conversations', () => { highlightTab(parsePath().name); syncChatHeader(); updateTitle(); });
window.addEventListener('popstate', route);
document.addEventListener('visibilitychange', scheduleSync);
['focus', 'pageshow', 'online'].forEach((evt) => window.addEventListener(evt, scheduleSync));

// Escape: close whatever overlay is on top (auth modal → sheet/lightbox);
// only otherwise does it back out of an open chat. One press does one thing.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.body.classList.contains('auth-open')) {
    const c = document.querySelector('.authmodal__close'); if (c) c.click(); return;
  }
  if (closeSheet()) return;
  if (parsePath().name === 'chat') { e.preventDefault(); back(); }
});

// ── go ─────────────────────────────────────────────────────────────────────
loadSession();
