// Connect via MCP: one sheet that says how to connect Claude, ChatGPT or
// Claude Code to this app's tools, which Holm serves at /_holm/mcp. The
// account menu opens it. COOKBOOK.md's "Connect via MCP" is the standard;
// Shelf's mcpSheet is the reference.
import { el, glyph, segmented } from './lib.js'

// Anything to copy is one field: the value on one line and a copy icon,
// Copy on hover and Copied with a tick after. No separate button.
// `field.set(value)` changes what it holds.
export function copyField(value) {
  const text = el('code', { class: 'copy-value' }, value)
  const word = el('span', { class: 'copy-word', 'aria-live': 'polite' }, 'Copy')
  let timer
  const copy = async () => {
    try { await navigator.clipboard.writeText(text.textContent) } catch {
      getSelection().selectAllChildren(text)
      word.textContent = 'Selected: copy it by hand'
      field.classList.add('is-refused')
      clearTimeout(timer)
      timer = setTimeout(() => { field.classList.remove('is-refused'); word.textContent = 'Copy' }, 2400)
      return
    }
    getSelection().removeAllRanges()
    field.classList.add('is-copied')
    word.textContent = 'Copied'
    clearTimeout(timer)
    timer = setTimeout(() => { field.classList.remove('is-copied'); word.textContent = 'Copy' }, 1600)
  }
  const field = el('div', {
    class: 'copy-field', role: 'button', tabindex: '0', 'aria-label': 'Copy ' + value,
    onclick: copy,
    onkeydown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy() } }
  }, text, el('span', { class: 'copy-cue' }, word, glyph('copy', 'glyph line'), glyph('check', 'glyph line')))
  // A value too long for the line scrolls sideways under a fade.
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1)
  text.addEventListener('scroll', fade, { passive: true })
  new ResizeObserver(fade).observe(text)
  field.set = next => { text.textContent = next; field.setAttribute('aria-label', 'Copy ' + next); fade() }
  return field
}

let open = null

export function mcpSheet(address = location.origin + '/_holm/mcp') {
  if (open) return
  const command = 'claude mcp add --transport http feedback ' + address
  const row = (lead, title, text) => el('div', { class: 'mcp-row' }, lead, el('div', {}, el('strong', {}, title), el('span', {}, text)))
  const step = (n, title, text) => row(el('span', { class: 'mcp-num' }, String(n)), title, text)
  const can = (name, title, text) => row(el('span', { class: 'mcp-ic' }, glyph(name, 'glyph line')), title, text)
  // Every pane sits in the same grid cell, so the sheet is as tall as the
  // tallest and never changes height between tabs.
  const panes = {
    claude: el('div', { class: 'mcp-group' },
      step(1, 'Open Settings, then Connectors', 'On claude.ai or in the Claude app.'),
      step(2, 'Add a custom connector', 'Name it Feedback and paste the address.'),
      step(3, 'Connect and sign in', 'Allow access once. Claude sees only your projects.')),
    chatgpt: el('div', { class: 'mcp-group' },
      step(1, 'Turn on Developer mode', 'In Settings, under Apps, then Advanced. On the web, on paid plans.'),
      step(2, 'Create a connector', 'Name it Feedback, paste the address and choose OAuth.'),
      step(3, 'Connect and sign in', 'Then pick Feedback from + in a chat.')),
    code: el('div', { class: 'mcp-stack' },
      copyField(command),
      el('p', { class: 'mcp-note' }, 'Run it in a terminal, then type ', el('code', {}, '/mcp'), ' in Claude Code and sign in.')),
    tools: el('div', { class: 'mcp-group' },
      can('inbox', 'Read your inbox', 'Your projects, and what people sent to each.'),
      can('reply', 'File and answer', 'Add feedback from a chat, answer it and share it by link.'),
      can('check', 'Tidy up', 'Mark items done, and turn their links on or off.'),
      can('chart', 'Read your stats', 'Visits, scans and sends over 7, 30 or 90 days.'))
  }
  const show = value => Object.entries(panes).forEach(([key, pane]) => {
    pane.classList.toggle('is-on', key === value)
    pane.inert = key !== value
  })
  show('claude')

  const back = document.activeElement
  const done = el('button', { type: 'button', class: 'mcp-done' }, 'Done')
  const sheet = el('div', { class: 'mcp-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mcp-title' },
    el('div', { class: 'mcp-head' }, el('h2', { id: 'mcp-title' }, 'Connect via MCP'), done),
    el('div', { class: 'mcp-hero', 'aria-hidden': 'true' },
      el('img', { class: 'mcp-app', src: '/icon-192.png', alt: '', width: 60, height: 60 }),
      el('span', { class: 'mcp-link' }, el('i'), el('i'), el('i'), el('i'), el('i')),
      el('span', { class: 'mcp-tile' }, glyph('mcp', 'glyph'))),
    el('div', { class: 'mcp-label' }, 'Connector address'),
    copyField(address),
    segmented({
      label: 'Where to connect', value: 'claude', onchange: show, className: 'mcp-tabs',
      options: [{ value: 'claude', label: 'Claude' }, { value: 'chatgpt', label: 'ChatGPT' }, { value: 'code', label: 'Claude Code' }, { value: 'tools', label: 'Tools' }]
    }),
    el('div', { class: 'mcp-panes' }, ...Object.values(panes)))
  const scrim = el('div', { class: 'mcp-scrim' }, sheet)

  const close = () => {
    open = null
    document.removeEventListener('keydown', onKey)
    scrim.classList.add('is-closing')
    const gone = () => scrim.remove()
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) gone()
    else { scrim.addEventListener('animationend', gone, { once: true }); setTimeout(gone, 400) }
    // The menu that opened it is gone by now: the avatar takes focus back.
    const to = back && back !== document.body && back.isConnected ? back : document.querySelector('.avatar-btn')
    to?.focus?.({ preventScroll: true })
  }
  // Escape closes; Tab stays inside the sheet.
  const onKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); close() }
    if (event.key !== 'Tab') return
    const stops = [...sheet.querySelectorAll('button, [tabindex="0"]')].filter(node => !node.closest('[inert]') && node.offsetParent && node.tabIndex >= 0)
    const first = stops[0], last = stops[stops.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  done.addEventListener('click', close)
  scrim.addEventListener('click', event => { if (event.target === scrim) close() })
  document.addEventListener('keydown', onKey)
  document.body.append(scrim)
  open = close
  done.focus({ preventScroll: true })
}
