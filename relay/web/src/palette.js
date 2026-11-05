// Relay — ⌘K: one field to go to a tab or a chat, or do what the account menu does.

import { el, clear, avatarEl, openFeedback } from './ui.js';
import { iconEl } from './icons.js';
import { data, prefs, setPref } from './state.js';
import { apply as applyTheme, THEMES } from './theme.js';
import { navigate, chatPath } from './router.js';
import { openMcpSheet } from './mcp.js';
import { signOut } from './auth.js';

let open = null;

export function togglePalette() {
  if (open) { open.close(); return; }
  const opener = document.activeElement;
  const input = el('input', { class: 'pal-field', type: 'text', placeholder: 'Go to a chat, or do…', 'aria-label': 'Go to a chat, or do something', autocomplete: 'off', spellcheck: 'false' });
  const list = el('div', { class: 'pal-list', role: 'listbox' });
  const box = el('div', { class: 'pal', role: 'dialog', 'aria-label': 'Command menu' },
    el('div', { class: 'pal-top' }, iconEl('search', { size: '18px' }), input, el('kbd', { text: 'esc' })), list);
  const layer = el('div', { class: 'pal-layer', onclick: (e) => { if (e.target === layer) close(); } }, box);
  document.body.appendChild(layer);
  requestAnimationFrame(() => layer.classList.add('is-in'));
  input.focus();

  const commands = () => [
    { label: 'Chats', icon: 'message-circle', hint: 'Go', run: () => navigate('/') },
    { label: 'Add someone', icon: 'user-plus', hint: 'Go', run: () => navigate('/discover') },
    { label: 'Friends', icon: 'users', hint: 'Go', run: () => navigate('/friends') },
    { label: 'Settings', icon: 'settings', hint: 'Go', run: () => navigate('/settings') },
    ...data.conversations.map((c) => ({ label: c.title || '@' + c.username, chat: c, hint: c.type === 'group' ? 'Group' : (c.username ? '@' + c.username : ''), run: () => navigate(chatPath(c)) })),
    { label: 'Connect via MCP…', icon: 'mcp', run: () => openMcpSheet() },
    ...THEMES.filter((t) => t.id !== prefs.theme).map((t) => ({ label: t.id === 'system' ? 'Match this device' : t.label + ' appearance', icon: t.icon, hint: 'Theme', run: () => { setPref('theme', t.id); applyTheme(); } })),
    { label: 'Send feedback', icon: 'message-circle', run: () => openFeedback() },
    { label: 'Sign out', icon: 'log-out', run: () => signOut() }
  ];
  const score = (text, q) => {
    const t = String(text || '').toLowerCase();
    if (t.startsWith(q)) return 3;
    if (t.includes(' ' + q) || t.includes('@' + q)) return 2;
    if (t.includes(q)) return 1;
    return 0;
  };
  let at = 0;
  let shown = [];
  function draw() {
    const q = input.value.trim().toLowerCase();
    shown = commands().map((c) => ({ ...c, s: q ? Math.max(score(c.label, q), score(c.hint, q)) : 1 })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 12);
    at = Math.min(at, Math.max(0, shown.length - 1));
    clear(list);
    if (!shown.length) { list.appendChild(el('div', { class: 'pal-none', text: 'Nothing matches' })); return; }
    shown.forEach((c, n) => list.appendChild(el('button', { class: 'pal-item' + (n === at ? ' is-on' : ''), type: 'button', role: 'option',
      onpointermove: () => { if (at !== n) { at = n; mark(); } }, onclick: () => pick(c) },
      c.chat ? avatarEl({ picture: c.chat.picture, avatar: c.chat.avatar, username: c.chat.username, displayName: c.chat.title }, 26) : el('span', { class: 'pal-ic' }, iconEl(c.icon, { size: '16px' })),
      el('span', { class: 'pal-label', text: c.label }), c.hint ? el('small', { text: c.hint }) : null)));
  }
  // Keep the highlighted row in view by scrolling the list itself, never the page around it.
  function mark() {
    Array.from(list.children).forEach((node, n) => node.classList.toggle('is-on', n === at));
    const row = list.children[at];
    if (!row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 6;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 6;
  }
  function pick(c) { close(); setTimeout(() => c.run(), 0); }
  function close() {
    if (!open) return;
    open = null;
    document.removeEventListener('keydown', onKey, true);
    layer.classList.remove('is-in');
    setTimeout(() => layer.remove(), 180);
    if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]); }
  }
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { at = 0; draw(); });
  draw();
  open = { close };
}
