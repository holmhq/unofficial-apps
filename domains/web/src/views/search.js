// Search: a hero with one big field; the first search flies that field up into the navbar.
// Under the navbar, one row of the ideas tried (tap one to see only its names), then the
// available names. Lookups answer in bursts, so cards are revealed one at a time at an even
// pace, appended in order; premium names come last.

import { $, $$, esc, act, toast, reduced, phone, rel } from '../dom.js'
import { svg } from '../icons.js'
import * as catalog from '../catalog.js'
import * as saved from '../saved.js'
import { settings, on as onSettings, changed, SEARCH_KEYS, MAX_ANY } from '../settings.js'
import { Search, HACKS } from '../search.js'
import { provider as providerById } from '../providers/index.js'
import { state, openLayer, closeLayer, isOpen, render } from '../shell.js'
import { cardHTML, fromCell, onChange } from './cards.js'
import { summary } from './filters.js'

const S = { search: null, q: '', seq: [], deferred: [], revealed: 0, revealT: null, drained: false, focus: null, morphing: false, cards: new Map(), dropped: new Set() }
export const query = () => S.q
export const hasResults = () => !!S.search

/* ---- Markup ---- */

export function fieldHTML(nav, hold = false) {
  return `<form class="field${nav ? ' nav' : ''}${hold ? ' hold' : ''}" id="form" role="search" autocomplete="off">${svg('search', nav ? 16 : 19, 2)}
    <input id="q" name="q" value="${esc(S.q)}" placeholder="A name or an idea" spellcheck="false" autocapitalize="off" aria-label="Name to search for" enterkeyhint="search" maxlength="60">
    ${S.q && nav ? `<button type="button" class="icon-btn sm" data-act="clear" aria-label="Clear and start over" title="Clear">${svg('x', 15, 2)}</button>` : ''}
    <span class="f-sep"></span>
    <button type="button" class="icon-btn${nav ? ' sm' : ''}${changed() ? ' dot' : ''}" id="filter-btn" data-act="filters" aria-label="Filters: ${esc(summary())}" title="Filters">${svg('slidersHorizontal', nav ? 16 : 18, 2)}</button>
    <i class="bar" id="bar"></i></form>`
}

export function heroHTML({ animateIn = false, hold = false } = {}) {
  return `<div class="panel hero-panel"><div class="hero${animateIn ? ' in' : ''}" id="hero">
    <h1>Find a short domain that’s still available.</h1>
    <p>Type a name. Shorter spellings, sound-alikes and AI ideas, checked live. Only available names show.</p>
    ${fieldHTML(false, hold)}
    <div class="try">Try <button type="button" data-act="try" data-q="photon">photon</button><button type="button" data-act="try" data-q="harbour labs">harbour labs</button><button type="button" data-act="try" data-q="orbit">orbit</button></div>
  </div></div>`
}

export function resultsHTML() {
  return `<div class="ideas-bar"><div class="wrap"><div class="chips" id="chips"><span class="ai-mark" title="">${svg('sparkles', 16, 2)}</span><button type="button" class="chip on" data-act="chip" data-l="">All <span class="n">0</span></button></div></div></div>
    <div class="panel" id="panel"><div class="wrap"><div class="note-line" id="note-line" hidden></div><div class="grid" id="grid"></div><div id="after"></div></div></div>
    <p class="sr" id="status" aria-live="polite"></p>`
}

export function mainHTML(o = {}) { return S.search ? resultsHTML() : heroHTML(o) }

/* ---- One search ---- */

const passes = (n) => (!settings.maxPrice || (typeof n.price === 'number' && n.price <= settings.maxPrice)) && !(settings.hidePremium && n.premium)
const visible = (n) => passes(n) && (!S.focus || n.group === S.focus)

function stop() {
  if (S.search) S.search.cancel()
  clearTimeout(S.revealT)
  S.revealT = null
}

export function start(q) {
  stop()
  S.q = q.trim()
  S.seq = []; S.deferred = []; S.revealed = 0; S.drained = false; S.focus = null; S.cards.clear(); S.dropped.clear()
  if (!S.q) { S.search = null; return }
  const search = new Search(S.q, settings, (type, payload) => listen(search, type, payload))
  S.search = search
  if (search.empty) { S.search = null; return }
  const p = providerById(settings.provider)
  if (p.warm) p.warm()
  search.start()
  document.title = `${S.q} · Domains`
}

function listen(search, type, payload) {
  if (S.search !== search) return
  if (type === 'cell') {
    const cell = payload
    if (cell.state !== 'free' && cell.state !== 'maybe') return
    const n = fromCell(cell)
    if (n.premium) S.deferred.push(n)
    else S.seq.push(n)
    pump()
  } else if (type === 'groups') chips(true)
  else if (type === 'ai') { chips(true); if (search.ai === 'error' && search.aiNote) note(search.aiNote) }
  else if (type === 'progress') { progress(); settle() }
  else if (type === 'provider') toast(`${payload.from.name} can’t be reached; checking with ${payload.to.name}`)
}

// When the lookups are done, premium names join the end of the stream.
function settle() {
  const s = S.search
  if (!s || !s.idle) return
  if (S.deferred.length) { S.seq.push(...S.deferred.sort((a, b) => a.price - b.price)); S.deferred = [] }
  pump()
}

function cardFor(n) {
  let el = S.cards.get(n.domain)
  if (!el) {
    const t = document.createElement('div')
    t.innerHTML = cardHTML(n, 'search')
    el = t.firstElementChild
    el.addEventListener('animationend', (e) => { if (e.target === el) { el.classList.remove('in'); el.style.removeProperty('--d') } })
    S.cards.set(n.domain, el)
  }
  return el
}

function ghost(on) {
  const grid = $('#grid')
  if (!grid) return
  let g = $('.ghost', grid)
  if (on && !g) { g = document.createElement('div'); g.className = 'ghost'; g.setAttribute('aria-hidden', 'true'); grid.append(g) }
  if (on && g) g.classList.remove('out')
  if (!on && g && !g.classList.contains('out')) { g.classList.add('out'); g.addEventListener('animationend', () => g.remove(), { once: true }) }
}

// One card at a time: quick when many are waiting, never a burst.
function pump() {
  if (!S.search || S.morphing || S.revealT) return
  const tick = () => {
    S.revealT = null
    if (!S.search || S.morphing) return
    const grid = $('#grid')
    while (S.revealed < S.seq.length) {
      const n = S.seq[S.revealed++]
      if (!visible(n)) continue
      if (grid) { const el = cardFor(n); el.classList.add('in'); grid.insertBefore(el, $('.ghost', grid)); if (!S.drained) ghost(true) }
      chips(false)
      const left = S.seq.length - S.revealed
      S.revealT = setTimeout(tick, left > 12 ? 14 : left > 5 ? 22 : 32)
      return
    }
    chips(false)
    const s = S.search
    if (s.idle && !S.deferred.length) finish()
    else if (grid && S.revealed === 0) ghost(true)
  }
  tick()
}

function finish() {
  if (S.drained) return
  S.drained = true
  ghost(false)
  chipsFinal()
  after()
  const n = S.seq.filter(visible).length
  const sr = $('#status'); if (sr) sr.textContent = `${n} available ${n === 1 ? 'name' : 'names'} for ${S.q}.`
}

function progress() {
  const bar = $('#bar'), s = S.search
  if (!bar || !s) return
  const total = s.sent + s.waiting
  bar.style.width = (total ? Math.min(1, s.done / Math.max(1, s.sent)) * 100 : 0) + '%'
  bar.classList.toggle('done', s.idle)
}

function note(text) {
  const el = $('#note-line')
  if (!el) return
  el.textContent = text
  el.hidden = !text
}

/* ---- Chips: the ideas tried, one row ---- */

function counts() {
  const m = new Map()
  let total = 0
  for (let i = 0; i < S.revealed; i++) { const n = S.seq[i]; if (passes(n)) { m.set(n.group, (m.get(n.group) || 0) + 1); total++ } }
  return { m, total }
}

function chipHTML(g, n, extra = '') {
  const label = g.key === HACKS ? 'Domain hacks' : g.label
  return `<button type="button" class="chip${S.focus === g.key ? ' on' : ''}${n ? '' : ' zero'}${extra}" data-act="chip" data-l="${esc(g.key)}" title="${esc(g.why || '')}">${g.kind === 'ai' ? svg('sparkles', 12, 2) : ''}${esc(label)} <span class="n">${n}</span></button>`
}

function chips(animate) {
  const row = $('#chips'), s = S.search
  if (!row || !s) return
  const { m, total } = counts()
  const mark = $('.ai-mark', row)
  mark.classList.toggle('on', s.ai === 'thinking')
  mark.title = s.aiRead || (s.ai === 'thinking' ? 'Reading what you typed…' : s.ai === 'off' ? 'AI ideas are off' : '')
  const all = $('.chip[data-l=""]', row)
  all.classList.toggle('on', !S.focus)
  const an = $('.n', all); if (an.textContent !== String(total)) an.textContent = total
  let k = 0
  const before = $('.chip.more, .chip.check', row)
  for (const g of s.groups.values()) {
    if (S.dropped.has(g.key)) continue
    const n = m.get(g.key) || 0
    let ch = row.querySelector(`.chip[data-l="${CSS.escape(g.key)}"]`)
    if (!ch) {
      const t = document.createElement('div')
      t.innerHTML = chipHTML(g, n, animate ? ' new' : '')
      ch = t.firstElementChild
      if (animate) ch.style.setProperty('--d', (k++ * 25) + 'ms')
      row.insertBefore(ch, before)
      continue
    }
    const ne = $('.n', ch); if (ne.textContent !== String(n)) ne.textContent = n
    ch.classList.toggle('zero', !n)
  }
}

function collapse(el) {
  if (!el) return
  const w = el.offsetWidth
  el.style.overflow = 'hidden'
  if (reduced()) { el.remove(); return }
  el.animate([{ opacity: 1, width: w + 'px' }, { opacity: 0, width: '0px', paddingLeft: '0px', paddingRight: '0px', borderWidth: '0px', marginRight: '-6px' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' }).onfinish = () => el.remove()
}

// At the end: ideas with nothing available fold away; then a way to ask for more.
function chipsFinal() {
  const row = $('#chips'), s = S.search
  if (!row || !s) return
  const { m } = counts()
  for (const g of s.groups.values()) {
    if (S.dropped.has(g.key) || m.get(g.key) || S.focus === g.key) continue
    S.dropped.add(g.key)
    collapse(row.querySelector(`.chip[data-l="${CSS.escape(g.key)}"]`))
  }
  for (const el of $$('.chip.more, .chip.check', row)) el.remove()
  if (s.waiting) row.insertAdjacentHTML('beforeend', `<button type="button" class="chip check new" data-act="check-more" title="Check the longer names this search hasn’t asked about yet">Check ${s.waiting} more</button>`)
  if (settings.kinds.ai && s.ai !== 'error' && s.aiRounds < 3) row.insertAdjacentHTML('beforeend', `<button type="button" class="chip more new" data-act="more" title="Ask the AI for names like the available ones and the ones you starred">${svg('sparkles', 12, 2)}<span>More like these</span></button>`)
}

function after() {
  const el = $('#after')
  if (!el || !S.search) return
  const none = S.drained && !S.seq.some(visible)
  el.innerHTML = none ? `<div class="empty"><span>${S.focus ? 'Nothing available for this idea with these filters.' : 'Nothing available with these filters.'}</span>${changed() ? '<button type="button" class="btn sm" data-act="f-reset-search">Reset filters</button>' : ''}</div>` : ''
}

/* ---- Drawing into a fresh shell ---- */

export function mount() {
  const row = $('#chips')
  if (row) {
    row.addEventListener('scroll', () => row.classList.toggle('scrolled', row.scrollLeft > 2), { passive: true })
    row.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault() } }, { passive: false })
  }
  if (!S.search) return
  const grid = $('#grid')
  if (grid) {
    for (const el of S.cards.values()) el.classList.remove('in')
    for (let i = 0; i < S.revealed; i++) { const n = S.seq[i]; if (visible(n)) grid.append(cardFor(n)) }
    ghost(!S.drained)
  }
  chips(false)
  if (S.drained) chipsFinal()
  after()
  progress()
  pump()
}

// A calm crossfade when what's shown changes, then a short stagger.
function relayout() {
  const grid = $('#grid')
  if (!grid || !S.search) return
  grid.classList.add('swap')
  setTimeout(() => {
    grid.innerHTML = ''
    let k = 0
    for (let i = 0; i < S.revealed; i++) {
      const n = S.seq[i]
      if (!visible(n)) continue
      const el = cardFor(n)
      el.classList.remove('in'); el.style.setProperty('--d', Math.min(k, 16) * 14 + 'ms'); void el.offsetWidth; el.classList.add('in')
      grid.append(el); k++
    }
    if (!S.drained) ghost(true)
    grid.classList.remove('swap')
    chips(false)
    after()
  }, 150)
}

/* ---- The magic move ---- */

function ghostField(text) {
  const g = document.createElement('div')
  g.className = 'morph-field'
  g.innerHTML = `${svg('search', 18, 2)}<span class="g-t${text ? '' : ' ph'}">${esc(text || 'A name or an idea')}</span>${text ? `<span class="g-x">${svg('x', 15, 2)}</span>` : ''}<span class="g-sep"></span><span class="g-f">${svg('slidersHorizontal', 17, 2)}</span>`
  document.body.append(g)
  return g
}
function fly(g, from, to, dur) {
  const at = (b) => ({ transform: `translate(${b.x}px, ${b.y}px)`, width: b.w + 'px', height: b.h + 'px', borderRadius: (b.h > 46 ? 16 : 11) + 'px', fontSize: (b.h > 46 ? 18 : 15) + 'px', paddingLeft: (b.h > 46 ? 18 : 12) + 'px', paddingRight: (b.h > 46 ? 8 : 3) + 'px', gap: (b.h > 46 ? 10 : 8) + 'px' })
  return g.animate([at(from), at(to)], { duration: dur, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' })
}

export function run(q, { push = true } = {}) {
  q = q.trim()
  if (!q) return
  const url = '/?q=' + encodeURIComponent(q)
  if (push) history.pushState({}, '', url)
  closeLayer()
  const hero = $('#hero'), field = hero && $('#form', hero)
  if (state.view === 'search' && hero && field && !reduced()) return toResults(q, hero, field)
  if (state.view === 'search' && S.search) return newSearch(q)
  start(q)
  render()
}

function toResults(q, hero, field) {
  const from = rel(field)
  const box = rel(hero)
  const ov = document.createElement('div')
  ov.className = 'morph-ov'
  const clone = hero.cloneNode(true)
  clone.removeAttribute('id'); clone.classList.remove('in')
  clone.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;margin:0;padding:0`
  for (const el of $$('[id]', clone)) el.removeAttribute('id')
  $('form', clone).style.visibility = 'hidden'
  ov.append(clone)
  S.morphing = true
  start(q)
  render({ entering: true, hold: true })
  document.body.append(ov)
  const target = $('#form')
  const to = rel(target)
  const g = ghostField(S.q)
  const dur = 640
  fly(g, from, to, dur)
  ;[...clone.children].forEach((el, i) => {
    if (el.tagName === 'FORM') return
    el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateY(${i < 2 ? -18 : 14}px) scale(.98)`, filter: 'blur(6px)' }], { duration: 360, delay: i * 40, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
  })
  setTimeout(() => { S.morphing = false; const sh = $('.shell'); if (sh) sh.classList.remove('entering'); pump() }, dur * 0.6)
  setTimeout(() => { target.classList.remove('hold'); g.remove(); ov.remove() }, dur)
}

export function toHero({ push = true } = {}) {
  const nav = $('#form')
  closeLayer()
  stop()
  S.search = null; S.q = ''; S.focus = null
  if (push) history.pushState({}, '', '/')
  document.title = 'Domains · find a short domain that’s still available'
  if (!nav || reduced() || state.view !== 'search') { state.view = 'search'; render({ animateIn: true }); focus(); return }
  const from = rel(nav)
  const main = $('#main')
  const box = rel(main)
  const ov = document.createElement('div')
  ov.className = 'morph-ov'
  const clone = main.cloneNode(true)
  for (const el of $$('[id]', clone)) el.removeAttribute('id')
  clone.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;display:flex;flex-direction:column;background:var(--bg)`
  ov.append(clone)
  render({ animateIn: true, hold: true })
  document.body.append(ov)
  clone.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' })
  const target = $('#form')
  const to = rel(target)
  const g = ghostField('')
  const dur = 600
  fly(g, from, to, dur)
  setTimeout(() => { target.classList.remove('hold'); g.remove(); ov.remove(); focus() }, dur)
}

function focus() { const q = $('#q'); if (q && !phone()) q.focus({ preventScroll: true }) }

// A search from the navbar: the grid fades and the new names stream in.
function newSearch(q) {
  const grid = $('#grid')
  if (grid) grid.classList.add('swap')
  setTimeout(() => {
    start(q)
    const main = $('#main')
    main.innerHTML = resultsHTML()
    mount()
    const form = $('#form')
    if (form) form.outerHTML = fieldHTML(true)
  }, grid ? 150 : 0)
}

/* ---- Filters change: new names to check, or just a different view of these ---- */

let rerunTimer = null
onSettings((patch) => {
  const fb = $('#filter-btn')
  if (fb) { fb.classList.toggle('dot', changed()); fb.setAttribute('aria-label', 'Filters: ' + summary()) }
  if (!S.search) return
  if (Object.keys(patch).some((k) => SEARCH_KEYS.includes(k))) { clearTimeout(rerunTimer); rerunTimer = setTimeout(() => newSearch(S.q), 380) }
  else relayout()
})

// A star or a list changed somewhere: keep the visible card's star current.
onChange(() => {})

act({
  try: (el) => { const q = $('#q'); if (q) q.value = el.dataset.q; run(el.dataset.q) },
  clear: () => toHero(),
  filters: () => { if (isOpen('filters')) closeLayer(); else openLayer({ kind: 'filters', sel: '#form' }) },
  chip: (el) => {
    const key = el.dataset.l || null
    S.focus = S.focus === key ? null : key
    for (const c of $$('#chips .chip[data-l]')) c.classList.toggle('on', (c.dataset.l || null) === S.focus)
    relayout()
  },
  more: (el) => {
    const s = S.search
    if (!s) return
    el.classList.add('thinking'); const t = $('span', el); if (t) t.textContent = 'Finding more…'
    S.drained = false
    ghost(true)
    const like = [...new Set([...saved.list().map((i) => catalog.split(i.domain).label), ...S.seq.slice(0, 30).map((n) => n.label)])]
    s.moreIdeas(like)
    setTimeout(() => collapse(el), 400)
  },
  'check-more': (el) => { const s = S.search; if (!s) return; S.drained = false; ghost(true); collapse(el); s.more() },
  'f-reset-search': () => { import('../settings.js').then((m) => m.reset()) },
})
