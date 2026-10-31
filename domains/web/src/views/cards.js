// A name as a card, a name up close, and what you can do with one: star it, put it in a
// list. Search results, saved names, lists and shared lists all draw the same card.
//
// name: { domain, label, tld, status, price, renew, premium, kind, aiKind, why, from, group }

import { esc, act, toast, phone, haptic } from '../dom.js'
import { svg, svgStar } from '../icons.js'
import * as catalog from '../catalog.js'
import * as saved from '../saved.js'
import * as lists from '../lists.js'
import { state, layerKind, openLayer, closeLayer, drawLayer, paintSide, isOpen } from '../shell.js'

export const known = new Map()
const changes = new Set()
export function onChange(fn) { changes.add(fn) }
function changed(domain) { for (const fn of changes) fn(domain) }

export function fromCell(cell) {
  const p = catalog.priceOf(cell.result, cell.tld) || {}
  const n = { domain: cell.domain, label: cell.label, tld: cell.tld, status: cell.state, price: p.first, renew: p.renew, premium: !!p.premium, kind: cell.kind, aiKind: cell.aiKind || null, why: cell.why, group: cell.group, registrar: cell.result && cell.result.registrar, since: cell.result && cell.result.since }
  known.set(n.domain, { ...(known.get(n.domain) || {}), ...n })
  return n
}

export function fromItem(it) {
  const { label, tld } = catalog.split(it.domain)
  const p = catalog.priceOf(it.premium ? { premium: true, price: it.price } : null, tld) || {}
  const was = known.get(it.domain) || {}
  const n = { ...was, domain: it.domain, label, tld, status: it.status || was.status || 'unknown', price: typeof it.price === 'number' ? it.price : p.first, renew: was.renew ?? p.renew, premium: !!it.premium, checked: it.checked || it.at }
  known.set(n.domain, n)
  return n
}

const KIND_LABEL = { exact: 'Your word', short: 'Shorter', sound: 'Sounds alike', hack: 'Domain hack', affix: 'Prefix or suffix' }
const AI_LABEL = { nickname: 'Nickname', spelling: 'Spelling', short: 'Shorter', related: 'Related word', blend: 'Blend', coined: 'New word' }
export const kindLabel = (n) => (n.kind === 'ai' ? AI_LABEL[n.aiKind] || 'AI idea' : KIND_LABEL[n.kind] || '')
const fitClass = (d) => (d.length <= 9 ? '' : d.length <= 11 ? ' fit1' : d.length <= 13 ? ' fit2' : d.length <= 16 ? ' fit3' : ' fit4')
export const money = (n) => catalog.money(n)
const available = (n) => n.status === 'free' || n.status === 'maybe'

export function starHTML(n) {
  const on = saved.has(n.domain)
  return `<button type="button" class="icon-btn sm star${on ? ' on' : ''}" data-act="star" data-d="${n.domain}" aria-pressed="${on}" aria-label="${on ? 'Unsave' : 'Save'} ${n.domain}" title="${on ? 'Saved' : 'Save'}">${on ? svgStar(16) : svg('star', 16, 1.9)}</button>`
}

// mode: 'search' | 'saved' | 'friend'
export function cardHTML(n, mode = 'search') {
  const taken = n.status === 'taken'
  const unknown = n.status === 'unknown' || n.status === 'checking'
  let price
  if (taken) price = '<span class="price taken">Taken now</span>'
  else if (unknown) price = `<span class="price taken">${n.status === 'checking' ? 'Checking…' : 'Not checked'}</span>`
  else price = `<span class="price${n.premium ? ' prem' : ''}${n.status === 'maybe' ? ' maybe' : ''}">${money(n.price)}${n.premium ? '<em>Premium</em>' : n.status === 'maybe' ? '<em>Likely</em>' : ''}</span>`
  let right = ''
  if (mode === 'friend') right = available(n) ? `<a class="reg" href="${catalog.registrar.url(n.domain)}" target="_blank" rel="noopener">Register ${svg('arrowUpRight', 13, 2.2)}</a>` : ''
  else right = `<span class="m-r"><button type="button" class="icon-btn sm hov" data-act="addlist" data-d="${n.domain}" aria-label="Add ${n.domain} to a list" title="Add to a list">${svg('folderPlus', 16, 1.9)}</button>${mode === 'search' && kindLabel(n) ? `<span class="why">${n.kind === 'ai' ? svg('sparkles', 11, 2) : ''}${esc(kindLabel(n))}</span>` : ''}</span>`
  return `<article class="card${taken ? ' is-taken' : ''}" data-d="${n.domain}">
    <button type="button" class="card-open" data-act="detail" data-d="${n.domain}" aria-label="${n.domain}: details"></button>
    <div class="c-top"><div class="dn${fitClass(n.domain)}" title="${n.domain}"><b>${esc(n.label)}</b><span>.${esc(n.tld)}</span></div>${mode !== 'friend' ? `<div class="card-acts">${starHTML(n)}</div>` : ''}</div>
    <div class="meta">${price}${right}</div></article>`
}

function paintStars(domain) {
  for (const el of document.querySelectorAll(`.card[data-d="${domain}"] .card-acts`)) el.innerHTML = starHTML(known.get(domain) || { domain })
  for (const b of document.querySelectorAll(`.star[data-d="${domain}"]`)) if (saved.has(domain)) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump') }
}

/* ---- A name up close ---- */

layerKind('detail', (o) => {
  const n = known.get(o.d) || fromItem({ domain: o.d })
  const on = saved.has(n.domain)
  const inLists = lists.containing(n.domain).map((l) => l.name)
  const ok = available(n)
  const status = n.status === 'taken' ? `Taken${n.since ? ` since ${n.since}` : ''}${n.registrar ? ` · ${esc(n.registrar)}` : ''}`
    : n.status === 'free' ? '<i class="live"></i>Available' : n.status === 'maybe' ? '<i class="live maybe"></i>Likely available · not confirmed by the registry' : 'Not checked yet'
  const row = catalog.get(n.tld)
  return {
    modal: true, title: n.domain, head: false,
    html: `<div class="detail"><div class="d-name${fitClass(n.domain)}"><b>${esc(n.label)}</b><span>.${esc(n.tld)}</span></div>
      <div class="d-status">${status}</div>
      ${ok ? `<dl class="d-prices"><div><dt>First year</dt><dd>${money(n.price)}</dd></div><div><dt>Then each year</dt><dd>${money(n.renew ?? n.price)}</dd></div></dl>` : ''}
      ${n.why ? `<p class="d-why">${n.kind === 'ai' ? svg('sparkles', 14, 2) : ''}<span>${esc(kindLabel(n))}${n.why && n.why !== kindLabel(n) ? ': ' + esc(n.why) : ''}</span></p>` : ''}
      ${row && row.h && ok && !n.premium ? `<p class="d-note">${esc(row.h)} at ${catalog.registrar.name}.</p>` : ''}
      <a class="btn primary block" href="${catalog.registrar.url(n.domain)}" target="_blank" rel="noopener">${ok ? 'Register' : 'Look'} at ${catalog.registrar.name} ${svg('arrowUpRight', 16, 2.2)}</a>
      <div class="d-row"><button type="button" class="btn" data-act="star" data-d="${n.domain}">${on ? svgStar(16) + ' Saved' : svg('star', 16, 1.9) + ' Save'}</button><button type="button" class="btn" data-act="addlist" data-d="${n.domain}" data-from="detail">${svg('folderPlus', 16, 1.9)} <span>${inLists.length ? esc(inLists[0]) + (inLists.length > 1 ? ` +${inLists.length - 1}` : '') : 'Add to list'}</span></button></div></div>`,
  }
})

/* ---- Add to a list ---- */

let naming = false
layerKind('addlist', (o) => ({
  title: 'Add to a list', w: 268, modal: !!o.back && !phone(),
  html: `<div class="menu-h">Add ${esc(o.d)} to</div>
    ${lists.all().map((l) => `<button type="button" class="opt" data-act="list-toggle" data-id="${l.id}" data-d="${o.d}" aria-pressed="${lists.has(l.id, o.d)}"><span class="ck">${lists.has(l.id, o.d) ? svg('check', 16, 2.4) : ''}</span><span class="opt-t">${esc(l.name)}</span><span class="opt-s">${l.items.length || ''}</span></button>`).join('')}
    ${lists.all().length ? '<div class="sep-line"></div>' : ''}${newListHTML(o.d)}`,
}))
layerKind('newlist', (o) => ({ title: 'New list', w: 288, html: `<div class="menu-h">A list for a friend or a project</div>${newListHTML('', true)}` }))

function newListHTML(d, open = naming) {
  return open
    ? `<form class="menu-in" data-form="newlist" data-d="${d}"><input name="name" placeholder="Name it, like a friend’s name" aria-label="List name" maxlength="40" autocomplete="off" autofocus><button class="btn sm primary" type="submit">Add</button></form>`
    : `<button type="button" class="opt" data-act="newlist-open"><span class="ck">${svg('plus', 16, 2.2)}</span><span class="opt-t">New list…</span></button>`
}

function info(domain) {
  const n = known.get(domain) || {}
  return { status: n.status, price: n.price, premium: n.premium }
}

export function makeList(name, domain) {
  const l = lists.create(name, domain || null, domain ? info(domain) : {})
  if (!l) return null
  naming = false
  paintSide()
  changed(domain || null)
  toast(domain ? `Added to ${l.name}` : `Made “${l.name}”`)
  return l
}

act({
  star: (el) => {
    const d = el.dataset.d
    haptic()
    saved.toggle(d, info(d))
    paintStars(d)
    paintSide()
    changed(d)
    if (isOpen('detail')) drawLayer(true)
  },
  detail: (el) => openLayer({ kind: 'detail', d: el.dataset.d }),
  addlist: (el) => {
    naming = !lists.all().length
    const d = el.dataset.d
    if (el.dataset.from === 'detail') openLayer({ kind: 'addlist', d, back: { kind: 'detail', d } })
    else openLayer({ kind: 'addlist', d, anchor: el })
  },
  'list-toggle': (el) => {
    const { id, d } = el.dataset
    const l = lists.get(id)
    const added = lists.toggle(id, d, info(d))
    toast(added ? `Added to ${l.name}` : `Removed from ${l.name}`)
    drawLayer(true)
    paintSide()
    changed(d)
  },
  'newlist-open': () => { naming = true; drawLayer(true) },
  newlist: (el) => openLayer({ kind: 'newlist', anchor: el }),
})

export function submitNewList(form) {
  const name = form.elements.name.value
  const d = form.dataset.d || null
  const l = makeList(name, d)
  if (!l) return
  const back = state.layer && state.layer.back
  if (state.layer && state.layer.kind === 'addlist') drawLayer(true)
  else closeLayer()
  if (!d && back) openLayer(back)
  return l
}
