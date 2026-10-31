// A shared list, as the person it was shared with sees it: every name on one page, checked
// again live as the page opens, each with a way to register it. No sign-in.

import { $, esc } from '../dom.js'
import { svg, svgMark } from '../icons.js'
import * as api from '../api.js'
import { settings } from '../settings.js'
import { provider as providerById, fallback } from '../providers/index.js'
import { cardHTML, fromItem } from './cards.js'

export function sharedHTML() {
  return `<div class="shell friend">
    <header class="top"><a class="brand" href="/">${svgMark(26)}<span>Domains</span></a><a class="text-btn" href="/">Find your own</a></header>
    <div class="panel"><div class="fr-wrap" id="shared"><div class="fr-eyebrow"><i class="live"></i>Opening the list…</div><div class="grid fr-grid"><div class="ghost"></div><div class="ghost"></div><div class="ghost"></div></div></div></div>
    <div class="toast" id="toast" role="status"></div>
  </div>`
}

export async function mountShared(slug) {
  const box = $('#shared')
  let doc
  try { doc = await api.get('/api/share/' + encodeURIComponent(slug)) } catch (error) {
    box.innerHTML = `<div class="empty"><span>${esc(error.status === 404 ? 'This link doesn’t open a list any more. Whoever shared it may have stopped sharing.' : error.message)}</span><a class="btn sm" href="/">Find a domain</a></div>`
    document.title = 'Domains'
    return
  }
  document.title = `${doc.name} · Domains`
  const items = doc.items.map((it) => ({ ...fromItem(it), status: 'checking' }))
  const n = items.length
  box.innerHTML = `<div class="fr-eyebrow"><i class="live"></i><span id="fr-status">${n} ${n === 1 ? 'domain' : 'domains'} shared with you · checking now</span></div>
    <h1 class="fr-title">${esc(doc.name)}</h1>
    ${doc.note ? `<div class="bubble-row"><span class="avatar">${svg('user', 15, 2)}</span><div class="bubble">${esc(doc.note)}</div></div>` : ''}
    ${n ? `<div class="grid fr-grid">${items.map((it, i) => cardHTML(it, 'friend').replace('class="card', `style="--d:${Math.min(i, 16) * 18}ms" class="card in`)).join('')}</div>` : '<div class="empty"><span>This list is empty for now.</span></div>'}
    <p class="fr-foot">Picked with <a href="/">Domains</a>, which finds short names that are still available.</p>`
  if (!n) return
  let p = providerById(settings.provider)
  let available = 0
  const apply = (r) => {
    const it = items.find((x) => x.domain === r.name)
    if (!it) return
    it.status = r.status
    if (r.premium && typeof r.price === 'number') { it.premium = true; it.price = r.price }
    if (r.status === 'free' || r.status === 'maybe') available++
    const card = document.querySelector(`.fr-grid .card[data-d="${r.name}"]`)
    if (card) { const t = document.createElement('div'); t.innerHTML = cardHTML(fromItem({ domain: it.domain, status: it.status, price: it.price, premium: it.premium }), 'friend'); card.replaceWith(t.firstElementChild) }
  }
  try { await p.check(items.map((i) => i.domain), apply) } catch (error) {
    const other = error && error.code === 'unreachable' ? fallback(p.id) : null
    if (other) { p = other; await p.check(items.map((i) => i.domain), apply).catch(() => {}) }
  }
  const st = $('#fr-status')
  if (st) st.textContent = `${n} ${n === 1 ? 'domain' : 'domains'} shared with you · ${available} available · checked just now`
}
