// Connect via MCP: one sheet that shows how to add overlap to Claude, ChatGPT or Claude Code,
// and what its tools do. The address comes from /api/me, so each host shows its own.

import { h, icon, mcpMark, copyField, segmented } from './ui.js'
import { tick } from './sound.js'

const row = (lead, title, text) =>
  h('div', { class: 'mcp-row' }, lead, h('div', {}, h('strong', {}, title), h('small', {}, text)))
const step = (n, title, text) => row(h('span', { class: 'mcp-lead num' }, String(n)), title, text)
const can = (name, title, text) => row(h('span', { class: 'mcp-lead' }, icon(name)), title, text)

export function mcpSheet(address = `${location.origin}/_holm/mcp`, { onClose } = {}) {
  const command = `claude mcp add --transport http overlap ${address}`
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div', { class: 'mcp-list' },
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it overlap and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your plans.')),
    chatgpt: h('div', { class: 'mcp-list' },
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it overlap, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick overlap from + in a chat.')),
    code: h('div', { class: 'mcp-code' },
      copyField(command, { label: 'Copy the command', onCopy: tick }),
      h('p', {}, 'Run it in a terminal, then type ', h('code', {}, '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div', { class: 'mcp-list' },
      can('calendar', 'See who’s free', 'Your plans, and the best times so far.'),
      can('plus', 'Start a plan', 'Dates, hours, and a link to share.'),
      can('edit', 'Add your times', 'Mark when you’re free on a plan.'),
      can('check', 'Pick the time', 'Settle it, rename, tidy up or delete.'))
  }
  const show = key => Object.entries(panes).forEach(([k, pane]) => { pane.classList.toggle('on', k === key); pane.inert = k !== key })
  show('claude')
  const dialog = h('dialog', { class: 'sheet mcp', 'aria-labelledby': 'mcp-title', tabindex: '-1' },
    h('div', { class: 'mcp-hero', 'aria-hidden': 'true' },
      h('img', { class: 'mcp-app', src: '/icon-192.png', alt: '', width: '60', height: '60' }),
      h('span', { class: 'mcp-dots' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span', { class: 'mcp-tile' }, mcpMark())),
    h('h2', { id: 'mcp-title' }, 'Connect via MCP'),
    h('div', { class: 'mcp-label' }, 'Connector address'),
    copyField(address, { label: 'Copy the connector address', onCopy: tick }),
    segmented([['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']], 'claude', show, 'Where to connect'),
    h('div', { class: 'mcp-panes' }, ...Object.values(panes)),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'button quiet', type: 'button', onclick: () => dialog.close() }, 'Done')))
  // A click on the backdrop closes it; a click on the sheet's own padding doesn't.
  dialog.addEventListener('click', e => {
    const r = dialog.getBoundingClientRect()
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close()
  })
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.() })
  document.body.append(dialog)
  dialog.showModal()
  // Start on the sheet itself, so no field shows a focus ring before anyone uses the keyboard.
  dialog.focus()
  return dialog
}
