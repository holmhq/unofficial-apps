// Filters: one compact panel that opens from the search field. Four rows, one control each:
// extensions (presets above the extensions themselves), length (a ruler), which ideas to
// make, and the first-year price. Changes apply as they're made.

import { esc, act } from '../dom.js'
import { svg } from '../icons.js'
import * as catalog from '../catalog.js'
import { settings, set, setKind, reset, changed, MAX_ANY } from '../settings.js'
import { layerKind, drawLayer } from '../shell.js'

const POPULAR = ['com', 'io', 'co', 'ai', 'app', 'dev', 'net', 'org', 'me', 'so', 'sh', 'to', 'xyz', 'gg', 'fm', 'tv', 'is', 'one', 'pro', 'art', 'run', 'cc']
const LENGTHS = [4, 5, 6, 7, 8, 10, MAX_ANY]
const PRICES = [[0, 'Any'], [15, '$15'], [40, '$40'], [100, '$100']]
const KINDS = [['short', 'Shorter'], ['sound', 'Sound-alikes'], ['ai', 'AI', true], ['hack', 'Hacks'], ['affix', 'Prefix · suffix']]
const SHOWN = ['short', 'two', 'three', 'classic', 'tech', 'cheap']
const SHORT_NAMES = { short: 'Short', two: '2 letters', three: '3 letters', classic: 'Classic', tech: 'Tech', cheap: 'Under $5' }

export const tlds = () => catalog.tldsFor(settings)

export function summary() {
  const n = tlds().length
  return `${n} ${n === 1 ? 'extension' : 'extensions'} · ${settings.max >= MAX_ANY ? 'any length' : `up to ${settings.max} letters`} · ${settings.maxPrice ? `under $${settings.maxPrice}` : 'any price'}`
}

function panelHTML() {
  const ts = tlds()
  const presets = SHOWN.map((id) => { const p = catalog.preset(id); return `<button type="button" class="pre${settings.preset === id ? ' on' : ''}" data-act="f-preset" data-v="${id}" title="${esc(p.note)}">${esc(SHORT_NAMES[id] || p.name)}</button>` }).join('')
  const extra = ts.filter((t) => !POPULAR.includes(t)).slice(0, 8)
  const toks = [...POPULAR.filter(catalog.has), ...extra].map((t) => {
    const on = ts.includes(t)
    const row = catalog.get(t)
    return `<button type="button" class="tok${on ? ' on' : ''}" data-act="f-tld" data-t="${t}" aria-pressed="${on}" title="${row ? catalog.money(row.p) + ' the first year' : ''}">.${esc(t)}</button>`
  }).join('')
  const more = ts.length > POPULAR.filter((t) => ts.includes(t)).length + extra.length ? `<span class="tok-more">and ${ts.length - POPULAR.filter((t) => ts.includes(t)).length - extra.length} more</span>` : ''
  const ruler = LENGTHS.map((n) => `<button type="button" class="${settings.max === n ? 'on' : ''}${n <= settings.max ? ' in' : ''}" data-act="f-len" data-v="${n}" aria-pressed="${settings.max === n}">${n >= MAX_ANY ? 'Any' : n}</button>`).join('')
  const kinds = KINDS.map(([k, name, ai]) => `<button type="button" class="tok${settings.kinds[k] ? ' on' : ''}" data-act="f-kind" data-k="${k}" aria-pressed="${!!settings.kinds[k]}">${ai ? svg('sparkles', 12, 2) : ''}${name}</button>`).join('')
  const prices = PRICES.map(([v, l]) => `<button type="button" class="in${settings.maxPrice === v ? ' on' : ''}" data-act="f-price" data-v="${v}" aria-pressed="${settings.maxPrice === v}">${l}</button>`).join('')
  return `<div class="flt">
    <div class="f-row"><div class="f-l">Extensions${settings.preset === 'custom' ? '<small>your own</small>' : ''}</div><div class="f-c"><div class="presets">${presets}</div><div class="toks">${toks}${more}</div></div></div>
    <div class="f-row"><div class="f-l">Length</div><div class="f-c"><div class="ruler">${ruler}</div><span class="f-note">${settings.max >= MAX_ANY ? 'Any length before the dot.' : `Up to ${settings.max} letters before the dot. What you typed is always tried.`}</span></div></div>
    <div class="f-row"><div class="f-l">Ideas</div><div class="f-c"><div class="toks">${kinds}</div></div></div>
    <div class="f-row"><div class="f-l">First year</div><div class="f-c"><div class="ruler">${prices}</div><div class="toks"><button type="button" class="tok${settings.hidePremium ? ' on' : ''}" data-act="f-premium" aria-pressed="${settings.hidePremium}">Hide premium names</button></div></div></div>
    <div class="f-foot"><span>${esc(summary())}</span>${changed() ? '<button type="button" data-act="f-reset">Reset</button>' : ''}</div>
  </div>`
}

layerKind('filters', () => ({ title: 'Filters', w: 548, right: true, html: panelHTML() }))

const redraw = () => drawLayer(true)
act({
  'f-preset': (el) => { set({ preset: el.dataset.v }); redraw() },
  'f-tld': (el) => {
    const t = el.dataset.t
    let own = tlds().slice()
    own = own.includes(t) ? own.filter((x) => x !== t) : [...own, t]
    if (!own.length) own = [t]
    set({ custom: catalog.byRank(own), preset: 'custom' })
    redraw()
  },
  'f-len': (el) => { set({ max: Number(el.dataset.v) }); redraw() },
  'f-kind': (el) => { setKind(el.dataset.k, !settings.kinds[el.dataset.k]); redraw() },
  'f-price': (el) => { set({ maxPrice: Number(el.dataset.v) }); redraw() },
  'f-premium': () => { set({ hidePremium: !settings.hidePremium }); redraw() },
  'f-reset': () => { reset(); redraw() },
})
