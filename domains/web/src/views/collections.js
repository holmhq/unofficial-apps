// Saved names and lists: one page each, the same cards as a search, a way to check them all
// again, and, for a list, a note and a share link that opens for anyone without signing in.

import { $, $$, esc, act, toast, copy, ago } from '../dom.js'
import { svg } from '../icons.js'
import * as saved from '../saved.js'
import * as lists from '../lists.js'
import { settings } from '../settings.js'
import { provider as providerById, fallback } from '../providers/index.js'
import { state, layerKind, openLayer, closeLayer, drawLayer, paintSide, signIn, go, isOpen, copyHTML, pageCreditHTML } from '../shell.js'
import { cardHTML, fromItem } from './cards.js'

const lastChecked = (items) => Math.max(0, ...items.map((i) => i.checked || i.at || 0))

function headHTML(title, items, extra, actions) {
  const at = lastChecked(items)
  return `<div class="col-h"><div class="col-t"><h1 class="lt">${esc(title)}</h1>
      <p class="sub">${items.length} ${items.length === 1 ? 'name' : 'names'}${extra}${items.length && at ? ` · <span id="checked">checked ${ago(at)}</span>` : ''}</p></div>
    <div class="col-act">${items.length ? `<button type="button" class="btn sm quiet" data-act="recheck">${svg('refreshCw', 15, 2)} Check again</button>` : ''}${actions}</div></div>`
}

export function savedHTML() {
  const items = saved.list()
  return `<div class="panel"><div class="wrap">${headHTML('Saved', items, '', '')}
    ${items.length ? `<div class="grid">${items.map((it) => cardHTML(fromItem(it), 'saved')).join('')}</div>` : `<div class="empty">${svg('star', 22, 1.6)}<span>Star a name to keep it here${state.me && state.me.signed_in ? '' : '. Sign in to keep them on every device'}.</span></div>`}
  </div>${pageCreditHTML()}</div>`
}

export function listHTML(id) {
  const l = lists.get(id)
  if (!l) return `<div class="panel"><div class="wrap"><div class="empty"><span>This list isn’t here any more.</span><a class="btn sm" href="/" data-act="nav">Search</a></div></div></div>`
  return `<div class="panel"><div class="wrap">
    ${headHTML(l.name, l.items, l.shared && l.slug ? ' · shared' : '', `<button type="button" class="btn sm primary" data-act="share" data-id="${l.id}">${svg('share', 15, 2)} Share</button><button type="button" class="icon-btn" data-act="list-menu" data-id="${l.id}" aria-label="More for this list" title="More">${svg('ellipsis', 18, 2)}</button>`)}
    <label class="note"><span>Note for whoever you share it with</span><textarea class="note-in" rows="2" data-note="${l.id}" maxlength="280" placeholder="Say why you picked these">${esc(l.note || '')}</textarea></label>
    ${l.items.length ? `<div class="grid">${l.items.map((it) => cardHTML(fromItem(it), 'saved')).join('')}</div>` : `<div class="empty">${svg('folder', 22, 1.6)}<span>Nothing here yet. In a search, use the folder button on a name to add it.</span><a class="btn sm" href="/" data-act="nav">Search</a></div>`}
  </div>${pageCreditHTML()}</div>`
}

export function listsHTML() {
  const all = lists.all()
  return `<div class="panel"><div class="wrap"><div class="col-h"><div class="col-t"><h1 class="lt">Lists</h1><p class="sub">Collect names for a friend or a project, and share them by link.</p></div></div>
    <div class="group">${all.map((l) => `<a class="g-row" href="/lists/${l.id}" data-act="nav">${svg('folder', 19, 1.9)}<span class="g-t">${esc(l.name)}</span><span class="n">${l.items.length || ''}</span>${svg('chevronRight', 16, 2)}</a>`).join('')}
    <button type="button" class="g-row" data-act="newlist">${svg('plus', 19, 2)}<span class="g-t">New list</span></button></div></div>${pageCreditHTML()}</div>`
}

/* ---- Check them all again ---- */

async function recheck() {
  const items = state.view === 'saved' ? saved.list() : (lists.get(state.listId) || { items: [] }).items
  const names = items.map((i) => i.domain)
  if (!names.length) return
  const cards = $$('#main .card')
  cards.forEach((c, i) => setTimeout(() => c.classList.add('checking'), i * 30))
  let p = providerById(settings.provider)
  const apply = (r) => {
    const patch = { status: r.status, checked: Date.now(), ...(r.premium && typeof r.price === 'number' ? { premium: true, price: r.price } : {}) }
    saved.update(r.name, patch)
    lists.update(r.name, patch)
    const card = document.querySelector(`#main .card[data-d="${r.name}"]`)
    if (card) { const t = document.createElement('div'); t.innerHTML = cardHTML(fromItem({ ...(items.find((i) => i.domain === r.name) || {}), ...patch, domain: r.name }), 'saved'); card.replaceWith(t.firstElementChild) }
  }
  try { await p.check(names, apply) } catch (error) {
    const other = error && error.code === 'unreachable' ? fallback(p.id) : null
    if (other) { p = other; await p.check(names, apply).catch(() => {}) }
  }
  for (const c of $$('#main .card.checking')) c.classList.remove('checking')
  const ch = $('#checked'); if (ch) ch.textContent = 'checked just now'
  toast(`${names.length} ${names.length === 1 ? 'name' : 'names'} checked`)
}

/* ---- Share ---- */

layerKind('share', (o) => {
  const l = lists.get(o.id)
  if (!l) return { modal: true, html: '' }
  const signedIn = state.me && state.me.signed_in
  const link = lists.linkFor(l)
  const these = l.items.length === 1 ? 'this name' : `these ${l.items.length} names`
  let body
  if (!signedIn) body = `<p class="m-sub">A shared list lives with your account, so the link keeps working on any device. Sign in to make one.</p><button type="button" class="btn primary block" data-act="sign-in">Sign in to share</button>`
  else if (!l.shared || !link) body = `<p class="m-sub">Make a link that opens ${these} on one page, checked again whenever it’s opened. No sign-in needed to look.</p>
    <label class="note"><span>Note for them</span><textarea class="note-in" rows="2" data-note="${l.id}" maxlength="280" placeholder="Say why you picked these">${esc(l.note || '')}</textarea></label>
    <button type="button" class="btn primary block" data-act="make-link" data-id="${l.id}"${o.busy ? ' disabled' : ''}>${o.busy ? 'Making a link…' : `${svg('link', 16, 2)} Make a link`}</button>`
  else body = `<p class="m-sub">Anyone with the link sees ${these} on one page, checked again when they open it. No sign-in needed.</p>
    <div class="share-link">${copyHTML(link)}</div>
    <label class="note"><span>Note for them</span><textarea class="note-in" rows="2" data-note="${l.id}" maxlength="280" placeholder="Say why you picked these">${esc(l.note || '')}</textarea></label>
    <div class="m-foot"><button type="button" class="btn sm quiet danger" data-act="unshare" data-id="${l.id}">Stop sharing</button><a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">See what they see ${svg('arrowRight', 15, 2.2)}</a></div>`
  return { modal: true, head: false, title: `Share “${l.name}”`, html: `<h3 class="m-title">Share “${esc(l.name)}”</h3>${body}` }
})

/* ---- Rename or delete a list ---- */

layerKind('list-menu', (o) => {
  const l = lists.get(o.id)
  if (!l) return { html: '' }
  return {
    title: l.name, w: 268, right: true,
    html: `<form class="menu-in" data-form="rename" data-id="${l.id}"><input name="name" value="${esc(l.name)}" aria-label="List name" maxlength="40" autocomplete="off"><button class="btn sm" type="submit">Rename</button></form>
      <div class="sep-line"></div>
      <button type="button" class="opt danger" data-act="list-delete" data-id="${l.id}"><span class="ck">${svg('trash2', 16, 2)}</span><span class="opt-t">${o.sure ? 'Delete for good' : 'Delete list'}</span>${o.sure ? '<span class="opt-s">Tap again</span>' : ''}</button>`,
  }
})

act({
  recheck: () => recheck(),
  share: (el) => openLayer({ kind: 'share', id: el.dataset.id, onClose: rerender }),
  'make-link': async (el) => {
    const id = el.dataset.id
    state.layer.busy = true; drawLayer(true)
    try {
      await lists.share(id)
      const link = lists.linkFor(lists.get(id))
      const ok = await copy(link)
      toast(ok ? 'Link made and copied' : 'Link made')
    } catch (error) {
      toast(error.message || 'Couldn’t make a link. Try again.')
    }
    if (state.layer) { state.layer.busy = false; drawLayer(true) }
    paintSide()
  },
  unshare: async (el) => {
    await lists.unshare(el.dataset.id).catch(() => {})
    toast('The link no longer opens')
    closeLayer()
    rerender()
  },
  'list-menu': (el) => { if (isOpen('list-menu')) closeLayer(); else openLayer({ kind: 'list-menu', id: el.dataset.id, anchor: el }) },
  'list-delete': (el) => {
    if (!state.layer.sure) { state.layer.sure = true; drawLayer(true); return }
    const l = lists.get(el.dataset.id)
    lists.remove(el.dataset.id)
    closeLayer()
    toast(`Deleted “${l ? l.name : 'list'}”`)
    paintSide()
    go('/lists')
  },
})

export function submitRename(form) {
  lists.rename(form.dataset.id, form.elements.name.value)
  closeLayer()
  paintSide()
  rerender()
}

export function rerender() {
  const main = $('#main')
  if (!main) return
  if (state.view === 'saved') main.innerHTML = savedHTML()
  else if (state.view === 'list') main.innerHTML = listHTML(state.listId)
  else if (state.view === 'lists') main.innerHTML = listsHTML()
}

export function signInToShare() { signIn() }
