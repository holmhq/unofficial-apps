// Connect: where a new person starts. The steps for Claude, ChatGPT and Claude Code are in the
// Connect via MCP sheet (shell.js), the same one the account menu opens; this page leads to it
// and has what to ask for once Claude is connected.
import { h, ic, copyable, copyCue } from '../ui.js'
import { state, mcpSheet } from '../shell.js'
import * as audio from '../audio.js'

export const PROMPTS = [
  'I’m stepping away. Use Ralk to tell me when you need an approval, and say it out loud when the deploy is done.',
  'Run the whole test suite. When it finishes, send a Ralk notification with the result, kind done or error, project name included.',
  'From now on, notify me on Ralk whenever a build finishes or fails, and ask me on Ralk before anything that changes production.',
  'Read me the summary of this pull request on Ralk, in two sentences.',
]

export function connectTab() {
  const open = () => { audio.play('pro_hover_tick/soft'); mcpSheet() }
  const el = h('div.tab-page',
    h('h1.large-title', 'Connect'),
    h('p.page-sub', 'Connect once; from then on Claude can reach you here as ', h('b', state.me.name || 'you'), '.'),
    h('section.card.connect-card',
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: 60, height: 60 }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', ic('mcp', 32))),
      h('div.connect-text', h('b', 'Add Ralk to Claude'), h('p', 'Claude, Claude Code or ChatGPT, wherever it runs: a VM, a container or a server.')),
      h('button.btn.primary.large.block', { type: 'button', onclick: open }, ic('mcp', 18), 'Connect via MCP…')),
    h('h2.group-title', 'Then try asking'),
    h('div.group', PROMPTS.map((p) => copyable(h('div.row.prompt', h('p', p), copyCue()), p, { onCopy: () => audio.play('ui_pop/soft') }))),
    h('p.group-note', 'Tap one to copy it. Tools act as you and see only your notifications; disconnect any time where you connected.'))
  return { el }
}
