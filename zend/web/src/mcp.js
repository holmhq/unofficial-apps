// Connect via MCP: one sheet that shows how to add Zend to Claude, ChatGPT or Claude Code,
// and what its tools do. The address comes from /api/me, so each host shows its own.

import { h, ic, sheet, segmented, copyField } from './ui.js'
import { store } from './store.js'

const row = (lead, title, text) => h('div.item', lead, h('span.t', title, h('small', text)))
const step = (n, title, text) => row(h('span.sq.step.num', String(n)), title, text)
const can = (icon, colour, title, text) => row(h('span.sq.' + colour, ic(icon, 17, 2)), title, text)

// `back` gets focus again when the sheet closes: the menu item that opened it is gone.
export function mcpSheet(back) {
  const address = (store.me && store.me.mcp) || location.origin + '/_holm/mcp'
  const command = 'claude mcp add --transport http zend ' + address
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div.group.icons',
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it Zend and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude drafts; you send.')),
    chatgpt: h('div.group.icons',
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it Zend, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick Zend from + in a chat.')),
    code: h('div.mcp-code',
      copyField(command, 'Copy the Claude Code command'),
      h('p.mcp-note', 'Run it in a terminal, then type ', h('code', '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div.group.icons',
      can('chats', 'blue', 'Read your texts', 'Conversations and replies, unread first.'),
      can('compose', 'green', 'Draft a text', 'It waits here until you tap Send.'),
      can('phone', 'gray', 'Your phone', 'Its status and today’s limits.'),
      can('templates', 'indigo', 'Names and templates', 'Name a number, reuse a saved text.'))
  }
  const show = (id) => {
    for (const [key, pane] of Object.entries(panes)) {
      pane.classList.toggle('is-on', key === id)
      pane.inert = key !== id
    }
  }
  const seg = segmented(
    [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']].map(([value, label]) => ({ value, label })),
    'claude', show, { label: 'Where to connect' })
  seg.classList.add('mcp-seg')
  show('claude')

  return sheet({
    title: 'Connect via MCP',
    cancel: null,
    done: 'Done',
    wide: true,
    body: () => [h('div.mcp',
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: '60', height: '60' }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', ic('mcp', 32))),
      h('div.mcp-label', 'Connector address'),
      copyField(address, 'Copy the connector address'),
      seg,
      h('div.mcp-panes', Object.values(panes)))]
  }).then(() => { if (back && back.isConnected) back.focus({ preventScroll: true }) })
}
