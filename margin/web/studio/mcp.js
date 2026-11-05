// Connect via MCP: one sheet that shows how to add Margin to Claude, ChatGPT or Claude Code,
// and what its tools do. The address comes from /api/me, so each host shows its own.
import { esc, h, $, $$, icons, sheet, copyField } from './lib.js';

const row = (lead, title, text) => `<div class="row mcp-row">${lead}<span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(text)}</span></span></div>`;
const step = (n, title, text) => row(`<span class="mcp-ic num">${n}</span>`, title, text);
const can = (icon, title, text) => row(`<span class="mcp-ic">${icons[icon]}</span>`, title, text);
const TABS = [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']];

// opener: what to focus when the sheet closes, since the menu item that opened it is gone.
export function mcpSheet(address, opener) {
  const url = address || location.origin + '/_holm/mcp';
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: `<div class="group">${step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.')}${step(2, 'Add a custom connector', 'Name it Margin and paste the address.')}${step(3, 'Connect and sign in', 'Allow access once. Claude can do only what you can.')}</div>`,
    chatgpt: `<div class="group">${step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.')}${step(2, 'Create a connector', 'Name it Margin, paste the address and choose OAuth.')}${step(3, 'Connect and sign in', 'Then pick Margin from + in a chat.')}</div>`,
    code: '<div class="mcp-code"><div data-cli></div><p class="mcp-note">Run it in a terminal, then type <code>/mcp</code> in Claude Code and sign in.</p></div>',
    tools: `<div class="group">${can('pen', 'Write posts', 'Draft, edit and publish under your names.')}${can('comments', 'Answer comments', 'Approve, reply and tidy up your inbox.')}${can('image', 'Add pictures', 'Drawings and photos for your posts.')}${can('team', 'Run a workspace', 'Settings, themes, team and invites.')}</div>`,
  };
  const body = h(`<div class="mcp">
    <div class="mcp-hero" aria-hidden="true"><img class="mcp-app" src="/icon-192.png" alt="" width="60" height="60"><span class="mcp-link"><i></i><i></i><i></i><i></i><i></i></span><span class="mcp-tile">${icons.mcp}</span></div>
    <div class="mcp-label">Connector address</div>
    <div data-address></div>
    <div class="seg wide mcp-seg" role="group" aria-label="Where to connect">${TABS.map(([k, label]) => `<button type="button" data-tab="${k}">${label}</button>`).join('')}</div>
    <div class="mcp-panes">${Object.entries(panes).map(([k, html]) => `<div class="mcp-pane" data-pane="${k}">${html}</div>`).join('')}</div>
  </div>`);
  $('[data-address]', body).replaceWith(copyField(url));
  $('[data-cli]', body).replaceWith(copyField(`claude mcp add --transport http margin ${url}`));
  const show = (tab) => {
    for (const b of $$('[data-tab]', body)) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    for (const p of $$('[data-pane]', body)) { const on = p.dataset.pane === tab; p.classList.toggle('is-on', on); p.inert = !on; }
  };
  for (const b of $$('[data-tab]', body)) b.addEventListener('click', () => show(b.dataset.tab));
  show('claude');
  return sheet('Connect via MCP', body, { className: 'mcp-sheet', onClose: () => { if (opener && opener.isConnected) opener.focus({ preventScroll: true }); } });
}
