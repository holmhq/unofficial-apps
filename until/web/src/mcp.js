// Connect via MCP: one sheet that shows how to add Until to Claude, ChatGPT or Claude Code,
// and what its tools do. The address comes from /api/me, so each host shows its own.

import { h, openSheet, say } from './ui.js'
import { icon } from './icons.js'

// Anything to copy is one click-to-copy field: the value on one line in mono, a copy icon at
// its end, Copy fading in on hover, and a tick with Copied for 1.6 s after a click.
export function copyField(value) {
  const text = h('code', { class: 'copy-value' }, value)
  const word = h('span', { class: 'copy-word', 'aria-live': 'polite' }, 'Copy')
  const copyIcon = icon('copy', 16)
  const tickIcon = icon('check', 16)
  copyIcon.classList.add('cf-copy')
  tickIcon.classList.add('cf-tick')
  let timer = 0
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      getSelection().selectAllChildren(text)
      say('Couldn’t copy. It’s selected, so copy it by hand.')
      return
    }
    field.classList.add('is-copied')
    word.textContent = 'Copied'
    clearTimeout(timer)
    timer = setTimeout(() => { field.classList.remove('is-copied'); word.textContent = 'Copy' }, 1600)
  }
  const field = h('div', {
    class: 'copy-field', role: 'button', tabindex: '0', 'aria-label': `Copy ${value}`,
    onclick: copy,
    onkeydown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy() } }
  }, text, h('span', { class: 'copy-cue' }, word, copyIcon, tickIcon))
  // A value too long for the line scrolls sideways under a fade.
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  return field
}

const row = (lead, title, text) => h('div', { class: 'mcp-row' }, lead, h('div', { class: 'mcp-t' }, h('strong', {}, title), h('span', {}, text)))
const step = (n, title, text) => row(h('span', { class: 'mcp-ic num' }, String(n)), title, text)
const can = (name, title, text) => row(h('span', { class: 'mcp-ic' }, icon(name, 17)), title, text)

export function openMcpSheet(address) {
  const mcp = address || `${location.origin}/_holm/mcp`
  // Every pane sits in the same grid cell, so the sheet is as tall as the tallest and never jumps.
  const panes = {
    claude: h('div', { class: 'mcp-list' },
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it Until and paste the address.'),
      step(3, 'Connect and sign in', 'Allow it once. Claude sees only your trackers.')),
    chatgpt: h('div', { class: 'mcp-list' },
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it Until, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick Until from + in a chat.')),
    code: h('div', { class: 'mcp-code' },
      copyField(`claude mcp add --transport http until ${mcp}`),
      h('p', { class: 'mcp-note' }, 'Run it in a terminal, then type ', h('code', {}, '/mcp'), ' in Claude Code and sign in.')),
    tools: h('div', { class: 'mcp-list' },
      can('hourglass', 'Your trackers', 'Days left, and how each day went.'),
      can('plus', 'Add a tracker', 'To a date, or for a number of days.'),
      can('star', 'Rate a day', 'One to five stars, today or earlier.'),
      can('pencil', 'Change or delete', 'Rename it, move its dates, or remove it.'))
  }
  const seg = h('div', { class: 'mcp-seg', role: 'group', 'aria-label': 'Where to connect' })
  const show = id => {
    for (const [key, pane] of Object.entries(panes)) { pane.classList.toggle('is-on', key === id); pane.inert = key !== id }
    for (const button of seg.children) {
      const on = button.dataset.pane === id
      button.classList.toggle('active', on)
      button.setAttribute('aria-pressed', String(on))
    }
  }
  for (const [id, label] of [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code'], ['tools', 'Tools']]) {
    seg.append(h('button', { class: 'seg-btn', type: 'button', 'data-pane': id, onclick: () => show(id) }, label))
  }
  show('claude')

  // Focus starts on the sheet itself, so no ring shows until the keyboard moves it; closing
  // hands it back to the avatar button, since the menu row that opened it is hidden.
  const sheet = openSheet('mcp-sheet', 'Connect via MCP',
    h('header', { class: 'sheet-header' },
      h('p', { class: 'sheet-title' }, 'Connect via MCP'),
      h('button', { class: 'ghost-btn', type: 'button', 'aria-label': 'Close', onclick: () => sheet.close() }, icon('x', 16))),
    h('div', { class: 'mcp-hero', 'aria-hidden': 'true' },
      h('img', { class: 'mcp-app', src: '/icon-192.png', alt: '', width: '60', height: '60' }),
      h('span', { class: 'mcp-link' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span', { class: 'mcp-tile' }, icon('mcp', 32))),
    h('p', { class: 'field-label mcp-label' }, 'Connector address'),
    copyField(mcp),
    seg,
    h('div', { class: 'mcp-panes' }, ...Object.values(panes)),
    h('button', { class: 'chip-btn full-width mcp-done', type: 'button', onclick: () => sheet.close() }, 'Done'))
  return sheet
}
