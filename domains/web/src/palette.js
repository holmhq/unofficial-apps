// ⌘K: a place, a list or something to do, by typing a few letters of it. Anything else typed
// is a name to search for.

import { $, esc, phone } from './dom.js'
import { svg } from './icons.js'
import * as lists from './lists.js'
import * as search from './views/search.js'
import { state, go, openLayer, setSide, mcpSheet, signIn, signOut } from './shell.js'

let open = null

function commands() {
  const signedIn = !!(state.me && state.me.signed_in)
  const q = search.query()
  const newList = $('.side [data-act="newlist"]')
  return [
    { label: 'Search', icon: 'search', hint: 'Go', run: () => go(q ? '/?q=' + encodeURIComponent(q) : '/') },
    { label: 'Saved', icon: 'star', hint: 'Go', run: () => go('/saved') },
    { label: 'Lists', icon: 'folder', hint: 'Go', run: () => go('/lists') },
    ...lists.all().map((l) => ({ label: l.name, icon: 'folder', hint: 'List', run: () => go('/lists/' + l.id) })),
    { label: 'New list…', icon: 'folderPlus', run: () => openLayer({ kind: 'newlist', anchor: newList && newList.offsetParent ? newList : null }) },
    $('#form') ? { label: 'Filters', icon: 'slidersHorizontal', run: () => openLayer({ kind: 'filters', sel: '#form' }) } : null,
    phone() ? null : { label: state.sideOn ? 'Hide sidebar' : 'Show sidebar', icon: 'panelLeft', run: () => setSide(!state.sideOn) },
    { label: 'How it works', icon: 'info', hint: 'Go', run: () => go('/about') },
    signedIn ? { label: 'Connect via MCP…', icon: 'mcp', run: () => mcpSheet() } : null,
    signedIn ? { label: 'Sign out', icon: 'logOut', run: () => signOut() } : { label: 'Sign in', icon: 'user', run: () => signIn() },
  ].filter(Boolean)
}

function score(text, q) {
  const t = text.toLowerCase()
  if (t.startsWith(q)) return 3
  if (t.includes(' ' + q)) return 2
  if (t.includes(q)) return 1
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 0.5 : 0
}

export function openPalette() {
  if (open) { open.close(); return }
  const back = document.activeElement
  const layer = document.createElement('div')
  layer.className = 'pal-layer'
  layer.innerHTML = `<div class="pal" role="dialog" aria-label="Command menu"><div class="pal-top">${svg('search', 18, 2.1)}<input class="pal-field" type="text" placeholder="Go to, do, or search a name…" aria-label="Go to, do, or search a name" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><kbd>esc</kbd></div><div class="pal-list" role="listbox"></div></div>`
  document.body.append(layer)
  const input = $('.pal-field', layer)
  const list = $('.pal-list', layer)
  requestAnimationFrame(() => layer.classList.add('is-in'))
  input.focus()
  let at = 0
  let shown = []

  function draw() {
    const typed = input.value.trim()
    const q = typed.toLowerCase()
    const cmds = commands().map((c) => ({ ...c, s: q ? score(c.label, q) : 1 })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s)
    const find = typed ? [{ label: `Search for “${typed}”`, icon: 'sparkles', hint: 'Enter', run: () => go('/?q=' + encodeURIComponent(typed)) }] : []
    shown = [...cmds.filter((c) => c.s >= 2), ...find, ...cmds.filter((c) => c.s < 2)].slice(0, 12)
    at = Math.min(at, Math.max(0, shown.length - 1))
    list.innerHTML = shown.map((c, n) => `<button type="button" class="pal-item${n === at ? ' is-on' : ''}" role="option" data-n="${n}"><span class="pal-ic">${svg(c.icon, 16, 2)}</span><span class="pal-t">${esc(c.label)}</span>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`).join('')
  }
  const mark = () => [...list.children].forEach((el, n) => el.classList.toggle('is-on', n === at))
  // Keeps the chosen row in view by scrolling the list itself; scrollIntoView would move the shell too.
  function reveal() {
    const el = list.children[at]
    if (!el) return
    const r = el.getBoundingClientRect()
    const box = list.getBoundingClientRect()
    if (r.top < box.top + 6) list.scrollTop -= box.top + 6 - r.top
    else if (r.bottom > box.bottom - 6) list.scrollTop += r.bottom - box.bottom + 6
  }
  function pick(c) { close(false); setTimeout(() => c.run(), 0) }
  function close(refocus = true) {
    layer.classList.remove('is-in')
    setTimeout(() => layer.remove(), 180)
    open = null
    document.removeEventListener('keydown', onKey, true)
    if (refocus && back && back !== document.body && back.isConnected) back.focus({ preventScroll: true })
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); reveal() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); reveal() }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]) }
  }
  layer.addEventListener('click', (e) => {
    if (e.target === layer) { close(); return }
    const b = e.target.closest('.pal-item')
    if (b) pick(shown[+b.dataset.n])
  })
  list.addEventListener('pointermove', (e) => {
    const b = e.target.closest('.pal-item')
    if (b && +b.dataset.n !== at) { at = +b.dataset.n; mark() }
  })
  document.addEventListener('keydown', onKey, true)
  input.addEventListener('input', () => { at = 0; draw() })
  draw()
  open = { close }
}

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || (e.key !== 'k' && e.key !== 'K') || open) return
  if (state.layer || !$('.shell')) return
  e.preventDefault()
  openPalette()
})
