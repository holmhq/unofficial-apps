// Connect via MCP: one sheet that shows how to add pastebin to Claude, ChatGPT or Claude Code,
// and what its tools do. The address comes from /api/me, so each host shows its own.

import { h, icon, toast } from './lib.js'

// Anything to copy is one click-to-copy field: the value on one line in mono, a copy icon at
// its end, Copy fading in on hover, and a tick with Copied for 1.6 s after a click. No toast.
export function copyField(value) {
  const text = h('code.copy-value', value)
  const word = h('span.copy-word', { 'aria-live': 'polite' }, 'Copy')
  let timer
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch (e) {
      getSelection().selectAllChildren(text)
      toast('Couldn’t copy. It’s selected, so copy it by hand.', 'error')
      return
    }
    field.classList.add('is-copied')
    word.textContent = 'Copied'
    clearTimeout(timer)
    timer = setTimeout(() => { field.classList.remove('is-copied'); word.textContent = 'Copy' }, 1600)
  }
  const field = h('div.copy-field', {
    role: 'button', tabindex: '0', 'aria-label': 'Copy ' + value,
    onclick: copy,
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy() } },
  }, text, h('span.copy-cue', word, icon('copy', 'cf-copy'), icon('check', 'cf-tick')))
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  return field
}

const row = (lead, title, text) => h('div.mcp-row', lead, h('div', h('strong', title), h('span', text)))
const step = (n, title, text) => row(h('span.mcp-num', String(n)), title, text)
const can = (name, title, text) => row(h('span.mcp-ic', icon(name)), title, text)

// `back` gets focus again when the sheet closes: the menu item that opened it is gone.
export function mcpSheet(address, back) {
  const mcp = address || location.origin + '/_holm/mcp'
  const command = 'claude mcp add --transport http pastebin ' + mcp
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div.mcp-list',
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it pastebin and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your pastes.')),
    chatgpt: h('div.mcp-list',
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it pastebin, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick pastebin from + in a chat.')),
    code: h('div.mcp-code',
      copyField(command),
      h('p.mcp-note', 'Run it in a terminal, then type ', h('code', '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div.mcp-list',
      can('list', 'Your pastes', 'List them and read any one.'),
      can('plus', 'Make a paste', 'Text or code, with a link to share.'),
      can('clock', 'Manage links', 'Rename, change expiry, revoke, delete.'),
      can('open', 'Open a link', 'Read a paste someone sent you.')),
  }
  const seg = h('div.mcp-seg', { role: 'group', 'aria-label': 'Where to connect' })
  const show = id => {
    for (const [k, pane] of Object.entries(panes)) { pane.classList.toggle('is-on', k === id); pane.inert = k !== id }
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pane === id)))
  }
  for (const [id, label] of [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']]) {
    seg.append(h('button', { type: 'button', 'data-pane': id, onclick: () => show(id) }, label))
  }
  show('claude')

  // Focus starts on the sheet itself, so no ring shows until the keyboard moves it.
  const dlg = h('dialog.mcp', { 'aria-labelledby': 'mcp-title' },
    h('div.mcp-body', { tabindex: '-1', autofocus: true },
      h('div.mcp-hero', { 'aria-hidden': 'true' },
        h('img.mcp-app', { src: '/icon-192.png', alt: '', width: 60, height: 60 }),
        h('span.mcp-link', h('i'), h('i'), h('i'), h('i'), h('i')),
        h('span.mcp-tile', icon('mcp'))),
      h('h2#mcp-title', 'Connect via MCP'),
      h('div.mcp-label', 'Connector address'),
      copyField(mcp),
      seg,
      h('div.mcp-panes', ...Object.values(panes)),
      h('div.dialog-actions', h('button.btn', { type: 'button', onclick: () => dlg.close() }, 'Done'))))
  // A click on the backdrop lands on the dialog itself; the body fills everything inside it.
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() })
  dlg.addEventListener('close', () => { dlg.remove(); if (back && back.isConnected) back.focus() })
  document.body.append(dlg)
  dlg.showModal()
  return dlg
}
