// The filters: which extensions, how short, which ideas to make, what to show, and who looks
// names up. The same controls sit in the sidebar on a desk and in a sheet on a phone; each
// keeps itself in step with the settings, so both stay right.

import { h, ic, sheet, toggle, segmented, haptic } from '../ui.js'
import * as catalog from '../catalog.js'
import { settings, set, setKind, on as onSettings, DEFAULTS, MAX_ANY } from '../settings.js'
import { PROVIDERS } from '../providers/index.js'

const PRICES = [5, 10, 15, 20, 30, 50, 100, 250, 1000, 0]

export function filtersPanel() {
  const syncs = []
  const el = h('div.filters')

  // Extensions
  const presetBtns = catalog.PRESETS.map((p) => h('button', { type: 'button', 'aria-pressed': 'false', title: p.note, onclick: () => {
    haptic()
    if (p.id === 'custom') { openTlds(); return }
    set({ preset: p.id })
  } }, p.name))
  const peek = h('div.tld-peek')
  const count = h('span.num')
  syncs.push(() => {
    catalog.PRESETS.forEach((p, i) => {
      const on = settings.preset === p.id
      presetBtns[i].classList.toggle('on', on)
      presetBtns[i].setAttribute('aria-pressed', String(on))
    })
    const list = catalog.tldsFor(settings)
    count.textContent = list.length === 1 ? '1 extension' : `${list.length} extensions`
    const shown = list.slice(0, 14)
    peek.replaceChildren(...shown.map((t) => h('span', '.' + t)), h('button', { type: 'button', onclick: openTlds }, list.length > shown.length ? `+${list.length - shown.length} · Edit` : 'Edit'))
  })
  el.append(h('section.f-sec', h('h3.f-title', 'Extensions', count), h('div.presets', presetBtns), peek))

  // Length
  const lenValue = h('span.num')
  const len = h('input.slider', { type: 'range', min: 2, max: MAX_ANY, step: 1, 'aria-label': 'Longest name to try' })
  len.addEventListener('input', () => { paintLen(+len.value); set({ max: +len.value }) })
  const paintLen = (v) => {
    lenValue.textContent = v >= MAX_ANY ? 'Any length' : `Up to ${v} letters`
    len.style.setProperty('--p', ((v - 2) / (MAX_ANY - 2)) * 100 + '%')
  }
  syncs.push(() => { len.value = settings.max; paintLen(settings.max) })
  el.append(h('section.f-sec', h('h3.f-title', 'Length', lenValue), len, h('div.range-ends', h('span', '2'), h('span', 'Any'))))

  // Ideas
  const kinds = [
    ['short', 'scissors', 'Shorter forms', 'zach, zac, zchr'],
    ['sound', 'audioLines', 'Sound-alikes', 'zak, zack, zakk'],
    ['ai', 'sparkles', 'AI ideas', 'Nicknames and new words'],
    ['hack', 'puzzle', 'Domain hacks', 'inter.net, da.sh'],
    ['affix', 'plus', 'Prefix and suffix', 'getzach, zachhq'],
  ]
  const kindRows = kinds.map(([id, icon, name, eg]) => {
    const sw = toggle(settings.kinds[id], (v) => setKind(id, v), name)
    sw.classList.add('small')
    syncs.push(() => { sw.checked = settings.kinds[id] !== false })
    return h('label.f-row', ic(icon, 17, 2), h('span.grow', name, h('small', eg)), sw)
  })
  el.append(h('section.f-sec', h('h3.f-title', 'Ideas'), kindRows))

  // Show
  const onlyFree = toggle(settings.onlyFree, (v) => set({ onlyFree: v }), 'Only free names')
  const noPremium = toggle(settings.hidePremium, (v) => set({ hidePremium: v }), 'Hide premium names')
  onlyFree.classList.add('small')
  noPremium.classList.add('small')
  const priceValue = h('span.num')
  const price = h('input.slider', { type: 'range', min: 0, max: PRICES.length - 1, step: 1, 'aria-label': 'Highest first-year price' })
  const paintPrice = (i) => {
    const v = PRICES[i]
    priceValue.textContent = v ? `Up to ${catalog.money(v)}` : 'Any price'
    price.style.setProperty('--p', (i / (PRICES.length - 1)) * 100 + '%')
  }
  price.addEventListener('input', () => { paintPrice(+price.value); set({ maxPrice: PRICES[+price.value] }) })
  syncs.push(() => {
    onlyFree.checked = settings.onlyFree
    noPremium.checked = settings.hidePremium
    const i = PRICES.indexOf(settings.maxPrice)
    price.value = i < 0 ? PRICES.length - 1 : i
    paintPrice(+price.value)
  })
  el.append(h('section.f-sec', h('h3.f-title', 'Show'),
    h('label.f-row', ic('eyeOff', 17, 2), h('span.grow', 'Only free names'), onlyFree),
    h('label.f-row', ic('crown', 17, 2), h('span.grow', 'Hide premium names', h('small', 'Registry prices above the usual')), noPremium),
    h('div.f-row', { style: { 'margin-top': '6px', cursor: 'default' } }, ic('tag', 17, 2), h('span.grow', 'First-year price'), priceValue),
    price))

  // Lookups
  const seg = segmented(PROVIDERS.map((p) => ({ value: p.id, label: p.id === 'rdap' ? 'RDAP' : p.name })), settings.provider, (v) => set({ provider: v }), { label: 'Lookup provider' })
  const about = h('p.group-note', { style: { margin: '8px 2px 0' } })
  syncs.push(() => {
    seg.set(settings.provider)
    const p = PROVIDERS.find((x) => x.id === settings.provider) || PROVIDERS[0]
    about.textContent = p.about
  })
  el.append(h('section.f-sec', h('h3.f-title', 'Lookups'), seg, about))

  const sync = () => syncs.forEach((fn) => fn())
  sync()
  const off = onSettings(sync)
  el.dispose = off
  return el
}

// On a phone: the same controls in a sheet.
export function openFilters() {
  let panel = null
  return sheet({
    title: 'Filters',
    cancel: null,
    done: 'Done',
    body: () => {
      panel = filtersPanel()
      return [panel, h('button.btn.block', { type: 'button', onclick: () => { haptic(); resetFilters() } }, ic('undo2', 17, 2.2), 'Reset filters')]
    },
    onClose: () => { if (panel) panel.dispose() },
  })
}

export function resetFilters() {
  set({ ...DEFAULTS, kinds: { ...DEFAULTS.kinds } })
}

// Pick your own extensions: every one Namecheap sells, shortest first, with prices.
export function openTlds() {
  const picked = new Set(settings.preset === 'custom' ? settings.custom : catalog.tldsFor(settings))
  const all = catalog.all().slice().sort((a, b) => (a.t.length - b.t.length) || catalog.rank(a.t) - catalog.rank(b.t) || (a.t < b.t ? -1 : 1))
  const rows = new Map()
  const counter = h('span')
  const paintCount = () => { counter.textContent = picked.size === 1 ? '1 picked' : `${picked.size} picked` }
  const list = h('div.tld-list')
  const groups = [
    ['Two letters', (r) => !r.t.includes('.') && r.t.length === 2],
    ['Three letters', (r) => !r.t.includes('.') && r.t.length === 3],
    ['Four letters', (r) => !r.t.includes('.') && r.t.length === 4],
    ['Longer', (r) => !r.t.includes('.') && r.t.length > 4],
    ['Second level', (r) => r.t.includes('.')],
  ]
  for (const [name, test] of groups) {
    const items = all.filter(test)
    if (!items.length) continue
    const box = h('div.group')
    for (const r of items) {
      const row = h('button.row' + (picked.has(r.t) ? '.on' : ''), { type: 'button', 'aria-pressed': String(picked.has(r.t)), onclick: () => {
        haptic(4)
        if (picked.has(r.t)) picked.delete(r.t); else picked.add(r.t)
        row.classList.toggle('on', picked.has(r.t))
        row.setAttribute('aria-pressed', String(picked.has(r.t)))
        paintCount()
      } },
      h('span.t', '.' + r.t), h('span.c', r.c || (r.pop ? 'Popular' : r.h || '')), h('span.p', catalog.money(r.p)), h('span.tick', ic('check', 13, 3)))
      row.dataset.t = r.t
      rows.set(r.t, row)
      box.append(row)
    }
    const title = h('h3.group-title', name)
    list.append(title, box)
    box.dataset.group = name
  }
  const find = h('input', { type: 'search', placeholder: 'Find an extension', 'aria-label': 'Find an extension', autocomplete: 'off', autocapitalize: 'off', spellcheck: false })
  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase().replace(/^\./, '')
    for (const [t, row] of rows) {
      const r = catalog.get(t)
      row.hidden = !!q && !t.startsWith(q) && !(r.c || '').toLowerCase().includes(q)
    }
    for (const box of list.querySelectorAll('.group')) {
      const any = [...box.children].some((c) => !c.hidden)
      box.hidden = !any
      box.previousElementSibling.hidden = !any
    }
  })
  paintCount()
  return sheet({
    title: 'Extensions',
    wide: true,
    done: 'Use',
    onDone: (close) => {
      if (!picked.size) { close(); return }
      set({ preset: 'custom', custom: catalog.byRank([...picked]) })
      close(true)
    },
    body: () => [
      h('div.search-mini', ic('search', 16, 2.2), find),
      h('div.picker-bar', counter, h('button', { type: 'button', onclick: () => {
        picked.clear()
        for (const row of rows.values()) { row.classList.remove('on'); row.setAttribute('aria-pressed', 'false') }
        paintCount()
      } }, 'Clear')),
      list,
    ],
  })
}
