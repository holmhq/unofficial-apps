// Names you starred, with what we last knew about each, and a way to ask again.

import { h, ic, haptic, toast, flip, ago, fill } from '../ui.js'
import { starFilled } from '../icons.js'
import * as catalog from '../catalog.js'
import * as saved from '../saved.js'
import { settings } from '../settings.js'
import { provider as providerById, fallback } from '../providers/index.js'
import { openDomain, dn, checkOne } from './detail.js'
import { state, signIn, holmFooter, go } from '../shell.js'

export function savedView() {
  const list = h('div.group', { role: 'list' })
  const sub = h('p.page-sub')
  const checkBtn = h('button.btn.small.tinted', { type: 'button', onclick: checkAll }, ic('rotateCw', 15, 2.2), 'Check all')
  const empty = h('div.empty',
    h('span.empty-icon', ic('star', 24, 2)),
    h('b', 'Nothing saved yet'),
    h('p', 'Tap a free name, then Save. It stays here with its price, and you can check it again any time.'),
    h('div.row-actions', h('button.btn.primary', { type: 'button', onclick: () => go('/') }, ic('search', 17, 2.2), 'Find a name')))
  const page = h('div.page',
    h('div', { style: { display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '12px' } }, h('h1.large-title', 'Saved'), checkBtn),
    sub, list, empty)
  const panel = h('div.panel', page, holmFooter())
  const checking = new Set()
  const rows = new Map()

  function paint() {
    const items = saved.list()
    const me = state.me
    fill(sub, me && me.signed_in ? 'On every device you sign in on.' : ['In this browser. ', h('a', { href: '#', style: { color: 'var(--ink)', 'font-weight': 'var(--w-strong)' }, onclick: (e) => { e.preventDefault(); signIn() } }, 'Sign in'), ' to keep them everywhere.'])
    empty.hidden = !!items.length
    list.hidden = !items.length
    checkBtn.hidden = !items.length
    flip(list, () => {
      const keep = new Set(items.map((i) => i.domain))
      for (const [d, el] of rows) if (!keep.has(d)) { el.remove(); rows.delete(d) }
      items.forEach((item, i) => {
        let el = rows.get(item.domain)
        const fresh = row(item)
        if (el) el.replaceWith(fresh)
        rows.set(item.domain, fresh)
        if (list.children[i] !== fresh) list.insertBefore(fresh, list.children[i] || null)
      })
    })
  }

  function stateOf(item) {
    if (checking.has(item.domain)) return { cls: 'checking', text: 'Checking…' }
    const price = typeof item.price === 'number' ? ' · ' + catalog.money(item.price) : ''
    const when = item.checked ? ' · ' + ago(item.checked) : ''
    if (item.status === 'free') return { cls: 'free', text: 'Free' + price + when }
    if (item.status === 'premium') return { cls: 'premium', text: 'Free, premium' + price + when }
    if (item.status === 'taken') return { cls: 'taken', text: 'Taken' + when }
    if (item.status === 'maybe') return { cls: 'free', text: 'Probably free' + when }
    return { cls: 'unknown', text: 'Not checked' }
  }

  function row(item) {
    const st = stateOf(item)
    const { tld, label } = catalog.split(item.domain)
    return h('div.row.saved-row', { role: 'listitem', 'data-key': item.domain },
      h('button.icon-btn.star-btn', { type: 'button', 'aria-label': `Remove ${item.domain} from saved`, onclick: () => {
        haptic()
        saved.remove(item.domain)
        toast(`Removed ${item.domain}`, { kind: 'info' })
      } }, starFilled(19)),
      h('button.row-main', { type: 'button', onclick: () => open(item) }, dn(item.domain, tld), h('span.state.' + st.cls, h('i'), st.text)),
      h('a.icon-btn', { href: catalog.registrar.url(item.domain), target: '_blank', rel: 'noopener', 'aria-label': `${item.domain} at ${catalog.registrar.name}`, title: `Open at ${catalog.registrar.name}` }, ic('arrowUpRight', 18, 2.2)))
  }

  function itemFor(item, result) {
    const { tld, label } = catalog.split(item.domain)
    const r = result || (item.status ? { name: item.domain, status: item.status === 'premium' ? 'free' : item.status, premium: item.status === 'premium', price: item.status === 'premium' ? item.price : undefined } : null)
    return { domain: item.domain, tld, label, kind: null, state: r ? r.status : 'unknown', result: r, at: item.checked || null }
  }

  async function check(item) {
    checking.add(item.domain)
    paint()
    const r = await checkOne(item.domain)
    checking.delete(item.domain)
    const { tld } = catalog.split(item.domain)
    const p = catalog.priceOf(r, tld)
    saved.update(item.domain, { status: r.status === 'free' && r.premium ? 'premium' : r.status, price: p && (r.status === 'free' || r.status === 'maybe') ? p.first : undefined, checked: Date.now() })
    return r
  }

  function open(item) {
    haptic()
    openDomain(itemFor(item), { recheck: async () => { const r = await check(item); return itemFor(saved.get(item.domain) || item, r) } })
  }

  async function checkAll() {
    haptic()
    const items = saved.list()
    if (!items.length) return
    checkBtn.classList.add('busy')
    for (const i of items) checking.add(i.domain)
    paint()
    const results = new Map()
    const domains = items.map((i) => i.domain)
    let p = providerById(settings.provider)
    try { await p.check(domains, (r) => results.set(r.name, r)) } catch (error) {
      const other = error && error.code === 'unreachable' ? fallback(p.id) : null
      if (other) await other.check(domains, (r) => results.set(r.name, r)).catch(() => {})
    }
    for (const i of items) {
      checking.delete(i.domain)
      const r = results.get(i.domain)
      if (!r) continue
      const pr = catalog.priceOf(r, catalog.split(i.domain).tld)
      saved.update(i.domain, { status: r.status === 'free' && r.premium ? 'premium' : r.status, price: pr && (r.status === 'free' || r.status === 'maybe') ? pr.first : undefined, checked: Date.now() })
    }
    checkBtn.classList.remove('busy')
    paint()
    const free = [...results.values()].filter((r) => r.status === 'free').length
    toast(`${free} of ${items.length} still free`, { kind: free ? 'good' : 'info' })
  }

  saved.on(paint)
  paint()
  return { el: panel, show: paint }
}
