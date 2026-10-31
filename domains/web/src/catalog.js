// The extensions you can pick and their prices: Namecheap's list prices for one year, saved
// in /data/tlds.json by tools/catalog.mjs. Prices here are a guide; checkout is the price.
//
// Row: { t: 'io', p: first year, r: renewal, g: usual first-year price when on offer,
//        cc: country code, c: country, pop: popular, eap: early access, min: years,
//        x: the registry asks for more details, h: Namecheap's offer note }

let data = null
let byName = new Map()

export async function load() {
  if (data) return data
  let doc = null
  try { doc = JSON.parse(localStorage.getItem('domains:tlds') || 'null') } catch {}
  const fresh = fetch('/data/tlds.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('catalog')))).then((d) => {
    try { localStorage.setItem('domains:tlds', JSON.stringify(d)) } catch {}
    return d
  })
  if (!doc) doc = await fresh
  else fresh.then(use).catch(() => {})
  use(doc)
  return data
}

function use(doc) {
  data = doc
  byName = new Map(doc.tlds.map((row) => [row.t, row]))
}

export const updated = () => (data ? data.updated : '')

// "31 Oct 2026", in the reader's own way of writing dates.
export function updatedLabel() {
  const iso = updated()
  if (!iso) return 'recently'
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
export const all = () => (data ? data.tlds : [])
export const get = (t) => byName.get(t) || null
export const has = (t) => byName.has(t)

// Most-wanted first; everything else after, cheapest first.
const RANK = ['com', 'io', 'co', 'ai', 'app', 'dev', 'net', 'org', 'me', 'so', 'sh', 'to', 'xyz', 'gg', 'fm', 'tv', 'is', 'one', 'pro', 'art', 'new', 'run', 'fun', 'lol', 'inc', 'bio', 'us', 'uk', 'ca', 'de', 'eu', 'in', 'cc', 'ws', 'la', 'im', 'ac', 'vc', 'id', 'li', 'pw', 'bz', 'cx', 'ch', 'es', 'fr', 'nl', 'mx', 'sg']
export function rank(t) {
  const i = RANK.indexOf(t)
  return i >= 0 ? i : 100 + (get(t) ? get(t).p : 999)
}
export const byRank = (list) => [...list].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))

const single = (row) => !row.t.includes('.')

export const PRESETS = [
  { id: 'short', name: 'Short picks', note: 'The short extensions people know', tlds: () => ['com', 'io', 'co', 'ai', 'so', 'sh', 'me', 'to', 'app', 'dev', 'xyz', 'net'] },
  { id: 'two', name: '2 letters', note: 'Every two-letter extension', tlds: () => byRank(all().filter((r) => single(r) && r.t.length === 2).map((r) => r.t)) },
  { id: 'three', name: '3 letters', note: 'Every three-letter extension', tlds: () => byRank(all().filter((r) => single(r) && r.t.length === 3).map((r) => r.t)) },
  { id: 'classic', name: 'Classic', note: '.com, .net and .org', tlds: () => ['com', 'net', 'org'] },
  { id: 'tech', name: 'Tech', note: 'Where software lives', tlds: () => ['io', 'ai', 'dev', 'app', 'sh', 'so', 'co', 'xyz', 'run', 'tech', 'build', 'tools'].filter(has) },
  { id: 'cheap', name: 'Under $5', note: 'Short ones that are cheap to keep', tlds: () => byRank(all().filter((r) => single(r) && r.t.length <= 4 && r.p < 5 && r.r < 25 && !r.eap).map((r) => r.t)) },
  { id: 'custom', name: 'Your own', note: 'The ones you picked', tlds: (custom) => byRank((custom || []).filter(has)) },
]

export function preset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0]
}

export function tldsFor(settings) {
  const list = preset(settings.preset).tlds(settings.custom).filter(has)
  return list.length ? list : PRESETS[0].tlds().filter(has)
}

// Money as people read it: $2.98, $29.98, $1,039. Short (for pills): $2.98, $30, $1,039.
export function money(n, { short = false } = {}) {
  if (typeof n !== 'number' || !isFinite(n)) return ''
  const whole = (v) => '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (n >= 1000 || (n >= 100 && Number.isInteger(n)) || (short && n >= 10)) return whole(n)
  return '$' + (Number.isInteger(n) ? n : n.toFixed(2))
}

// The price of a name: a premium quote from the lookup when there is one, else the list
// price of its extension.
export function priceOf(result, tld) {
  if (result && result.premium && typeof result.price === 'number') return { first: result.price, renew: typeof result.renew === 'number' ? result.renew : null, premium: true }
  const row = get(tld)
  if (!row) return null
  return { first: row.p, renew: row.r, usual: row.g || null, min: row.min || 1, premium: false, eap: !!row.eap, rules: !!row.x, hint: row.h || '' }
}

// The longest extension we know that ends the name (zack.co.uk -> co.uk).
export function split(domain) {
  const parts = String(domain).toLowerCase().split('.')
  for (let i = 1; i < parts.length; i++) {
    const tld = parts.slice(i).join('.')
    if (has(tld)) return { label: parts.slice(0, i).join('.'), tld }
  }
  return { label: parts[0], tld: parts.slice(1).join('.') }
}

// Where to register. Lookups and buying are separate: whichever provider answered, this is
// the registrar whose prices are shown.
export const registrar = {
  name: 'Namecheap',
  url: (domain) => 'https://www.namecheap.com/domains/registration/results/?domain=' + encodeURIComponent(domain),
}
