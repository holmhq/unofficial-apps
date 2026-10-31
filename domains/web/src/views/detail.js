// One name, up close: free or not, what it costs this year and after, who holds it when
// taken, why it was suggested, and the way to register it.

import { h, ic, sheet, copyText, haptic, ago, toast, fill } from '../ui.js'
import { starFilled } from '../icons.js'
import * as catalog from '../catalog.js'
import * as saved from '../saved.js'
import { KIND } from '../gen.js'
import { provider as providerById } from '../providers/index.js'
import { settings } from '../settings.js'

const AI_KIND = { nickname: 'a nickname', spelling: 'another spelling', short: 'a short form', blend: 'a blend', coined: 'a new word' }

export function dn(domain, tld) {
  const t = tld || catalog.split(domain).tld
  const label = t && domain.endsWith('.' + t) ? domain.slice(0, -(t.length + 1)) : domain
  return h('span.dn', h('b', label), h('span', t ? '.' + t : ''))
}

export function statusOf(item) {
  const r = item.result
  const state = item.state || (r && r.status) || 'unknown'
  if (state === 'queued' || state === 'checking') return { cls: 'checking', word: 'Checking…' }
  if (state === 'free') return r && r.premium ? { cls: 'premium', word: 'Free · premium price' } : { cls: 'free', word: 'Free to register' }
  if (state === 'taken') return { cls: 'taken', word: r && r.since ? `Taken since ${r.since}` : 'Taken' }
  if (state === 'maybe') return { cls: 'maybe', word: 'Probably free' }
  return { cls: 'unknown', word: 'No answer' }
}

// item: { domain, tld, label, kind, why, aiKind, state, result, at }
// recheck(): asks again and resolves with the fresh item.
export function openDomain(item, { recheck = null } = {}) {
  let body = null
  const paint = (it) => {
    item = it
    fill(body, ...content(item, paint))
  }
  const content = (it) => {
    const st = statusOf(it)
    const r = it.result || {}
    const free = it.state === 'free' || it.state === 'maybe'
    const price = catalog.priceOf(r, it.tld)
    const row = catalog.get(it.tld)
    const facts = []
    if (free && price) {
      facts.push(h('div.row', h('span', 'First year'), h('b', price.usual ? h('s', catalog.money(price.usual)) : null, catalog.money(price.first))))
      if (price.renew) facts.push(h('div.row', h('span', 'Then each year'), h('b', catalog.money(price.renew))))
      if (price.min > 1) facts.push(h('div.row', h('span', 'Shortest term'), h('b', `${price.min} years`)))
    }
    if (it.state === 'taken') {
      if (r.since) facts.push(h('div.row', h('span', 'Registered'), h('b', String(r.since))))
      if (r.registrar) facts.push(h('div.row', h('span', 'Registrar'), h('span.v.trunc', { style: { 'max-width': '60%' } }, r.registrar)))
      if (typeof r.elsewhere === 'number' && r.elsewhere > 0) facts.push(h('div.row', h('span', `“${it.label}” is also taken in`), h('b', `${r.elsewhere} ${r.elsewhere === 1 ? 'extension' : 'extensions'}`)))
    }
    if (row) facts.push(h('div.row', h('span', 'Extension'), h('span.v', '.' + it.tld + (row.c ? ` · ${row.c}` : ''))))
    if (it.kind) {
      const k = it.kind === 'ai' ? `AI idea${it.aiKind ? ', ' + AI_KIND[it.aiKind] : ''}` : (KIND[it.kind] || {}).name
      if (k) facts.push(h('div.row', h('span', 'Why'), h('span.v.trunc', { style: { 'max-width': '64%' } }, it.why && it.kind !== 'exact' ? `${k}: ${it.why[0].toLowerCase() + it.why.slice(1)}` : k)))
    }

    const isSaved = saved.has(it.domain)
    const starBtn = h('button.btn.large', { type: 'button', onclick: () => {
      haptic()
      const now = saved.toggle(it.domain, { status: it.state === 'free' && r.premium ? 'premium' : it.state, price: price ? price.first : undefined })
      toast(now ? 'Saved' : 'Removed from saved', { kind: now ? 'good' : 'info' })
      paint(it)
    } }, isSaved ? starFilled(18) : ic('star', 18, 2), isSaved ? 'Saved' : 'Save')
    if (isSaved) starBtn.style.color = 'var(--premium-text)'

    const actions = []
    if (it.state !== 'taken') {
      actions.push(h('a.btn.large.block' + (free ? '.go' : '.primary'), { href: catalog.registrar.url(it.domain), target: '_blank', rel: 'noopener' },
        free ? `Register at ${catalog.registrar.name}` : `Look at ${catalog.registrar.name}`, ic('arrowUpRight', 18, 2.4)))
      actions.push(h('div.pair', starBtn, h('button.btn.large', { type: 'button', onclick: () => copyText(it.domain, 'Copied ' + it.domain) }, ic('copy', 17, 2), 'Copy')))
    } else {
      actions.push(h('div.pair',
        h('a.btn.large', { href: 'https://' + it.domain, target: '_blank', rel: 'noopener noreferrer' }, 'Visit', ic('arrowUpRight', 17, 2.2)),
        h('a.btn.large', { href: 'https://lookup.icann.org/en/lookup?name=' + encodeURIComponent(it.domain), target: '_blank', rel: 'noopener' }, 'Who has it', ic('arrowUpRight', 17, 2.2))))
      actions.push(h('div.pair', starBtn, h('button.btn.large', { type: 'button', onclick: () => copyText(it.domain, 'Copied ' + it.domain) }, ic('copy', 17, 2), 'Copy')))
    }

    const source = r.source ? providerById(r.source) : null
    const notes = []
    if (st.cls === 'checking') notes.push('Asking now…')
    else if (r.source === 'rdap' && free) notes.push('The registry has no record of this name (RDAP). It may still be reserved or carry a premium price; Namecheap’s checkout has the final word.')
    else if (it.state === 'maybe') notes.push('No registration was found, but this extension’s registry wasn’t asked directly. Check at Namecheap before you count on it.')
    else if (free) notes.push(`Checked with ${source ? source.name : 'the registry'}${it.at ? ' ' + ago(it.at) : ''}. Free means the registry would register it now; nothing is held for you until you buy it.`)
    else if (it.state === 'unknown') notes.push(r.reason ? `No answer: ${r.reason.toLowerCase()}.` : 'No answer this time.')
    if (free && price && !price.premium) notes.push(`${catalog.registrar.name}’s list price on ${catalog.updatedLabel()}${price.eap ? ', in early access' : ''}${price.rules ? '; the registry asks for extra details' : ''}. Checkout shows the final price.`)
    if (price && price.premium) notes.push('A premium name: the registry sets a higher price, every year.')

    return [
      h('div.dhead', dn(it.domain, it.tld), h('span.badge-status.' + st.cls, h('i'), st.word)),
      facts.length ? h('div.group.facts', facts) : null,
      h('div.d-actions', actions),
      recheck && st.cls !== 'checking' ? h('button.btn.small', { type: 'button', style: { 'align-self': 'center', background: 'none', color: 'var(--ink-2)' }, onclick: async () => {
        haptic()
        paint({ ...it, state: 'checking' })
        try { paint(await recheck()) } catch { paint(it); toast('That didn’t go through. Try again.', { kind: 'bad' }) }
      } }, ic('rotateCw', 15, 2.2), 'Check again') : null,
      notes.map((n) => h('p.d-note', n)),
    ]
  }
  return sheet({
    title: '',
    label: item.domain,
    cancel: null,
    done: 'Done',
    body: () => { body = h('div', { style: { display: 'flex', 'flex-direction': 'column', gap: '14px' } }); paint(item); return body },
  })
}

// A saved name or a typed one, checked on its own (no search running).
export async function checkOne(domain) {
  const p = providerById(settings.provider)
  let result = null
  const run = (prov) => prov.check([domain], (r) => { result = r })
  try { await run(p) } catch (error) {
    if (error && error.code === 'unreachable') { const { fallback } = await import('../providers/index.js'); const other = fallback(p.id); if (other) await run(other).catch(() => {}) }
  }
  return result || { name: domain, status: 'unknown', source: p.id, reason: 'No answer' }
}
