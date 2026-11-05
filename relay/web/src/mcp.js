// Relay — Connect via MCP: one sheet that shows how to add Relay to Claude, ChatGPT or
// Claude Code, and what its tools do. The address comes from /api/me, so each host shows its own.

import { el, openSheet, closeSheet, copyField } from './ui.js';
import { iconEl } from './icons.js';
import { session } from './state.js';

function row(lead, title, text) {
  return el('div', { class: 'setting' },
    el('div', { class: 'si' + (typeof lead === 'number' ? ' is-num' : '') }, typeof lead === 'number' ? String(lead) : iconEl(lead, { size: '18px' })),
    el('div', { class: 'st' }, el('b', { text: title }), el('small', { text: text })));
}

export function openMcpSheet() {
  const address = session.mcp || location.origin + '/_holm/mcp';
  const command = 'claude mcp add --transport http relay ' + address;
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: el('div', { class: 'card' },
      row(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      row(2, 'Add a custom connector', 'Name it Relay and paste the address.'),
      row(3, 'Connect and sign in', 'Allow access once. Claude sees only your chats.')),
    chatgpt: el('div', { class: 'card' },
      row(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      row(2, 'Create a connector', 'Name it Relay, paste the address and choose OAuth.'),
      row(3, 'Connect and sign in', 'Then pick Relay from + in a chat.')),
    code: el('div', { class: 'mcp-code' },
      copyField(command),
      el('p', { class: 'mcp-note' }, 'Run it in a terminal, then type ', el('code', { class: 'mono', text: '/mcp' }), ' in Claude Code and sign in.')),
    tools: el('div', { class: 'card' },
      row('bell', 'Catch up', 'What’s unread, and marking it read.'),
      row('message-circle', 'Read your chats', 'Any chat, further back on request.'),
      row('send', 'Send a message', 'Text you ask for, to a friend or a group.'),
      row('user-plus', 'Friends and invites', 'See friends, send and answer invites.'))
  };
  const seg = el('div', { class: 'seg mcp-seg', role: 'group', 'aria-label': 'Where to connect' });
  const buttons = {};
  function show(id) {
    Object.entries(panes).forEach(([k, node]) => { node.classList.toggle('is-on', k === id); node.inert = k !== id; });
    Object.entries(buttons).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === id)));
  }
  [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']].forEach(([id, label]) => {
    buttons[id] = el('button', { type: 'button', onclick: () => show(id) }, label);
    seg.appendChild(buttons[id]);
  });
  show('claude');

  const opener = document.activeElement;
  const wrap = openSheet(el('div', { class: 'sheet-body mcp-sheet' },
    el('div', { class: 'mcp-hero', 'aria-hidden': 'true' },
      el('img', { class: 'mcp-app', src: '/icon-192.png', alt: '', width: '60', height: '60' }),
      el('span', { class: 'mcp-link' }, el('i'), el('i'), el('i'), el('i'), el('i')),
      el('span', { class: 'mcp-tile' }, iconEl('mcp', { size: '32px' }))),
    el('div', { class: 'sheet-title mcp-title', text: 'Connect via MCP' }),
    el('div', { class: 'mcp-label', text: 'Connector address' }),
    copyField(address),
    seg,
    el('div', { class: 'mcp-panes' }, ...Object.values(panes)),
    el('button', { class: 'btn ghost block', type: 'button', onclick: () => closeSheet() }, 'Done')));
  // Closing puts focus back on the Settings row that opened it.
  wrap._teardown = () => { if (opener && opener.isConnected) opener.focus(); };
}
