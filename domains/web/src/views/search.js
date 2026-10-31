// The search page. Before a search: what this is, the field, names to try. During and after:
// the field docks at the top with a progress line, the shortest free names gather in a row
// of tiles, and every name tried has a card whose extensions settle from waiting to free or
// taken as the answers come in.

import { h, ic, flip, reduced, haptic, nope, menu, fill } from '../ui.js'
import { mark, starFilled } from '../icons.js'
import * as catalog from '../catalog.js'
import { settings, set, setKind, on as onSettings, SEARCH_KEYS, changed, MAX_ANY } from '../settings.js'
import { Search, HACKS, PASS } from '../search.js'
import * as saved from '../saved.js'
import { openDomain, dn } from './detail.js'
import { openFilters, openTlds } from './filters.js'
import namecheap from '../providers/namecheap.js'
import { holmFooter, go } from '../shell.js'

const EXAMPLES = ['Zacharia', 'harbour labs', 'photon', 'flicker']
const AI_KIND = { nickname: 'Nickname', spelling: 'Other spelling', short: 'Short form', blend: 'Blend', coined: 'New word' }
const TILES = 12
const TILE_KIND = { exact: 'Your word', short: 'Shorter', sound: 'Sound-alike', affix: 'Prefix or suffix', hack: 'Domain hack', ai: 'AI idea' }

export function searchView() {
  let search = null
  let query = ''
  let groups = new Map() // key -> { el, pills, count, map: domain -> pill, g, order }
  let tiles = new Map() // domain -> tile
  let frame = 0
  let quiet = false
  let rerun = 0
  let tilesTouched = false

  /* ---- The field, docked or not ---------------------------------------------------- */

  const input = h('input', { type: 'search', name: 'q', placeholder: 'Your name or an idea', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'search', 'aria-label': 'Name to search for', maxlength: 80 })
  const clear = h('button.icon-btn.clear', { type: 'button', 'aria-label': 'Clear', hidden: true, onclick: () => { input.value = ''; clear.hidden = true; input.focus() } }, ic('x', 16, 2.6))
  const field = h('form.field', { role: 'search', onsubmit: (e) => { e.preventDefault(); submit() } },
    ic('search', 20, 2.2), input, clear, h('button.btn.primary.go-btn', { type: 'submit' }, 'Search'))
  let warmed = false
  input.addEventListener('input', () => {
    clear.hidden = !input.value
    if (!warmed && input.value.length > 1) { warmed = true; if (settings.provider === 'namecheap') namecheap.warm() }
  })
  const badge = h('span.badge')
  const filtersBtn = h('button.filters-btn', { type: 'button', 'aria-label': 'Filters', onclick: () => { haptic(); openFilters() } }, ic('slidersHorizontal', 20, 2), badge)
  const quick = h('div.quick', { role: 'toolbar', 'aria-label': 'Quick filters' })
  const bar = h('i')
  const progress = h('div.progress', { 'aria-hidden': 'true' }, bar)
  const dock = h('div.dock', h('div.dock-in', h('div.field-row', field, filtersBtn), quick, progress))

  /* ---- Before a search ------------------------------------------------------------- */

  const hero = h('section.hero.enter',
    h('div.hero-mark', mark(34, { dot: '#30d158' })),
    h('h1', 'Find a short domain', h('br'), 'that’s ', h('em', 'actually free.')),
    h('p.lead', 'Type a name. Domains tries shorter spellings, sound-alikes and AI ideas across two- and three-letter extensions, and shows what’s free as the answers come in.'))
  const tryRow = h('div.try', h('span', 'Try'), EXAMPLES.map((q) => h('button', { type: 'button', onclick: () => { haptic(); input.value = q; submit() } }, q)))
  const how = h('div.how',
    step('scissors', '', 'Shorter, on purpose', 'Zacharia becomes zach, zack, zak and zchr: clipped forms, sound-alikes and initials, made in your browser.'),
    step('sparkles', '.ai', 'Ideas from AI', 'A model adds nicknames, other spellings and new words that keep the sense of your name and stay short.'),
    step('zap', '.go', 'Free comes first', 'Each name is checked live with Namecheap. The shortest free ones rise to the top as answers arrive.'))
  const intro = h('div.intro', tryRow, how,
    h('p.foot-note', { style: { 'margin-top': '22px' } }, 'Lookups go through a Namecheap adapter today. Domains is built on adapters, so another lookup service can take its place. ',
      h('a', { href: '/about', onclick: (e) => { e.preventDefault(); go('/about') } }, 'How it works')))

  /* ---- Results ----------------------------------------------------------------------- */

  const status = h('div.status', { 'aria-live': 'polite' })
  const notice = h('div')
  const tilesCount = h('span')
  const tilesEl = h('div.tiles', { role: 'list', 'aria-label': 'Shortest free names' })
  for (const type of ['pointerdown', 'wheel', 'touchstart']) tilesEl.addEventListener(type, () => { tilesTouched = true }, { passive: true })
  const groupsCount = h('span')
  const groupsEl = h('div.groups')
  const moreEl = h('div.more')
  const footNote = h('p.foot-note')
  const results = h('div.page.results',
    status, notice,
    h('div.sec-head', h('h2', 'Shortest free'), tilesCount), tilesEl,
    h('div.sec-head', h('h2', 'Every name'), groupsCount), groupsEl,
    moreEl, footNote)

  const panel = h('div.panel.search-panel', hero, dock, intro, results, holmFooter())
  results.hidden = true

  /* ---- Running a search --------------------------------------------------------------- */

  function submit() {
    const q = input.value.trim()
    if (!q) { nope(field); input.focus(); return }
    if (matchMedia('(pointer: coarse)').matches) input.blur()
    const url = '/?q=' + encodeURIComponent(q)
    if (q === query && search) { start(q, { quiet: true }); return }
    go(url)
  }

  // Called by the page for every address: /?q=… searches, / shows the start.
  function show(q) {
    q = (q || '').trim()
    if (q === query && (search || !q)) return
    if (!q) {
      swap(() => {
        if (search) search.cancel()
        search = null
        query = ''
        input.value = ''
        clear.hidden = true
        panel.classList.remove('searching')
        hero.hidden = false
        intro.hidden = false
        results.hidden = true
        hero.classList.remove('enter')
      })
      return
    }
    input.value = q
    clear.hidden = false
    swap(() => start(q))
  }

  function swap(change) {
    const docking = !panel.classList.contains('searching') !== !query
    if (!docking || !document.startViewTransition || reduced()) { change(); return }
    document.documentElement.dataset.vt = 'dock'
    const t = document.startViewTransition(change)
    t.finished.finally(() => { if (document.documentElement.dataset.vt === 'dock') delete document.documentElement.dataset.vt })
  }

  function start(q, { quiet: keep = false } = {}) {
    if (search) search.cancel()
    query = q
    quiet = keep
    panel.classList.add('searching')
    hero.hidden = true
    intro.hidden = true
    results.hidden = false
    groups = new Map()
    tiles = new Map()
    groupsEl.replaceChildren()
    tilesEl.replaceChildren()
    tilesEl.scrollLeft = 0
    tilesTouched = false
    fill(notice)
    if (!keep) panel.scrollTop = 0
    search = new Search(q, settings, onEvent)
    if (search.empty) {
      fill(status, h('span', 'Type a name with letters or numbers in it.'))
      paintTiles()
      return
    }
    search.start()
    schedule()
    requestAnimationFrame(() => { quiet = false })
  }

  function onEvent(type, payload) {
    if (type === 'groups') addGroups(payload)
    else if (type === 'cell') paintCell(payload)
    else if (type === 'provider') {
      fill(notice, h('div.notice', ic('info', 17, 2.2), h('span', `${payload.from.name} couldn’t be reached from this browser, so the registries are being asked directly (RDAP). Answers are a little slower and carry no premium prices.`)))
    } else if (type === 'ai') {
      if (search.ai === 'error' && search.aiNote) notice.append(h('div.notice', ic('sparkles', 17, 2.2), h('span', search.aiNote)))
    }
    schedule()
  }

  /* ---- Groups and pills ------------------------------------------------------------------ */

  const orderOf = (g) => (g.kind === 'exact' ? -1e6 + g.score : g.key === HACKS ? -1e5 : g.score)

  function addGroups(list) {
    const insert = () => {
      let n = 0
      for (const g of list) {
        const ge = makeGroup(g)
        groups.set(g.key, ge)
        if (!quiet && !reduced()) {
          ge.el.classList.add('enter')
          ge.el.style.setProperty('--d', Math.min(n++, 14) * 35 + 'ms')
          ge.el.addEventListener('animationend', () => ge.el.classList.remove('enter'), { once: true })
        }
        const after = [...groupsEl.children].find((el) => groups.get(el.dataset.key).order > ge.order)
        groupsEl.insertBefore(ge.el, after || null)
      }
    }
    if (groupsEl.children.length && !quiet) flip(groupsEl, insert)
    else insert()
  }

  function makeGroup(g) {
    const hack = g.key === HACKS
    const count = h('span.grp-count')
    const pills = h('div.pills')
    const why = g.kind === 'ai' ? [AI_KIND[g.aiKind] || 'AI idea', g.why].filter(Boolean).join(' · ') : g.why
    const el = h('div.grp' + (hack ? '.hacks' : ''), { 'data-key': g.key, role: 'group', 'aria-label': hack ? 'Domain hacks' : g.label },
      h('div.grp-head',
        h('span.grp-label', hack ? 'Domain hacks' : g.label),
        hack ? null : h('span.grp-len', { title: `${g.label.length} characters` }, String(g.label.length)),
        g.kind === 'ai' ? h('span.chip.ai', ic('sparkles', 11, 2.4), 'AI') : null,
        h('span.grp-why', why || ''),
        count),
      pills)
    const ge = { el, pills, count, map: new Map(), g, order: orderOf(g), hack }
    syncPills(ge)
    return ge
  }

  // Draw a pill for every name the group has (hacks can join later).
  function syncPills(ge) {
    let i = ge.map.size
    for (const cell of ge.g.cells) {
      if (ge.map.has(cell.domain)) continue
      const b = h('button.pill', { type: 'button', style: { '--i': i++ }, onclick: () => open(cell) })
      ge.map.set(cell.domain, b)
      paintPill(b, cell, ge.hack, false)
      ge.pills.append(b)
    }
    paintGroup(ge)
  }

  function priceOf(cell) {
    const p = cell.result ? catalog.priceOf(cell.result, cell.tld) : null
    return p ? p.first : null
  }

  // Free, but hidden by "Hide premium" or the price limit.
  function filteredOut(cell) {
    const premium = cell.result && cell.result.premium
    if (settings.hidePremium && premium) return true
    if (settings.maxPrice) { const p = priceOf(cell); if (p != null && p > settings.maxPrice) return true }
    return false
  }

  function paintPill(b, cell, hack, animate) {
    const r = cell.result
    const premium = !!(r && r.premium && cell.state === 'free')
    const isSaved = saved.has(cell.domain)
    b.className = 'pill ' + cell.state + (premium ? ' premium' : '') + (isSaved ? ' saved' : '') + (cell.state === 'free' && filteredOut(cell) ? ' over' : '')
    const text = hack ? cell.domain : '.' + cell.tld
    const price = cell.state === 'free' ? priceOf(cell) : null
    b.replaceChildren(...[text, price != null ? h('small', catalog.money(price, { short: true })) : null].filter(Boolean))
    const words = { queued: 'not checked yet', checking: 'checking', free: premium ? 'free, premium price' : 'free', taken: 'taken', maybe: 'probably free', unknown: 'no answer' }
    b.setAttribute('aria-label', `${cell.domain}: ${words[cell.state] || cell.state}${price != null ? ', ' + catalog.money(price) : ''}`)
    if (animate && !reduced() && (cell.state === 'free' || cell.state === 'taken')) {
      b.classList.add('settle')
      b.addEventListener('animationend', (e) => { if (e.animationName === 'settle') b.classList.remove('settle') }, { once: false })
    }
  }

  function paintGroup(ge) {
    let free = 0
    let pending = 0
    for (const cell of ge.g.cells) {
      if (cell.state === 'free' && !filteredOut(cell)) free++
      else if (cell.state === 'checking') pending++
    }
    ge.count.textContent = free ? `${free} free` : ''
    ge.count.classList.toggle('on', free > 0)
    ge.el.classList.toggle('none', !free && !pending)
  }

  function paintCell(cell) {
    const ge = groups.get(cell.group)
    if (!ge) return
    let b = ge.map.get(cell.domain)
    if (!b) { syncPills(ge); b = ge.map.get(cell.domain) }
    if (b) paintPill(b, cell, ge.hack, !quiet)
    paintGroup(ge)
  }

  function open(cell) {
    haptic()
    const item = () => ({ ...cell, at: cell.result ? Date.now() : null })
    openDomain(item(), {
      recheck: async () => {
        const s = search
        await s.recheck(cell.domain)
        return item()
      },
    }).then(() => {
      // The star may have changed.
      const ge = groups.get(cell.group)
      const b = ge && ge.map.get(cell.domain)
      if (b) paintPill(b, cell, ge.hack, false)
      schedule()
    })
  }

  /* ---- Status, tiles, more ------------------------------------------------------------------ */

  function schedule() {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; paintStatus(); paintTiles(); paintMore() })
  }

  function paintStatus() {
    const s = search
    if (!s || s.empty) return
    const running = s.done < s.sent
    const secs = s.finished ? ((s.finished - s.started) / 1000).toFixed(1).replace(/\.0$/, '') : ''
    const freeShown = [...s.cells.values()].filter((c) => c.state === 'free' && !filteredOut(c)).length
    fill(status,
      h('span.pulse' + (running ? '' : '.idle')),
      running
        ? h('span', 'Checking ', h('b.num', String(s.done)), ' of ', h('span.num', String(s.sent)))
        : h('span', h('b.num', String(s.done)), s.done === 1 ? ' name checked' : ' names checked', secs && !s.switched ? ` in ${secs} s` : ''),
      h('span.sep'),
      h('span', h('b.num.free-n', String(freeShown)), ' free'),
      h('span.sep'),
      h('span.via', 'with ' + s.provider.name),
      aiState(s))
    bar.style.width = (s.sent ? (s.done / s.sent) * 100 : 0) + '%'
    progress.classList.toggle('run', running)
    progress.classList.toggle('done', !running && s.done > 0)
    groupsCount.textContent = `${s.groups.size} ${s.groups.size === 1 ? 'name' : 'names'} · ${catalog.tldsFor(settings).length} extensions`
    fill(footNote,
      'Free means a registry would register the name right now; nothing is held for you until you buy it. Prices are ',
      catalog.registrar.name, '’s list prices for the first year (', catalog.updatedLabel(), '). Looked up with the ', s.provider.name, ' adapter; other lookup services can plug in. ',
      h('a', { href: '/about', onclick: (e) => { e.preventDefault(); go('/about') } }, 'How it works'))
  }

  function aiState(s) {
    if (s.ai === 'off') return null
    if (s.ai === 'thinking') return h('span.ai-state.thinking', ic('sparkles', 13, 2.2), 'Thinking of shorter names…')
    if (s.ai === 'done') return h('span.ai-state', ic('sparkles', 13, 2.2), `${s.aiCount} AI ${s.aiCount === 1 ? 'idea' : 'ideas'}`)
    if (s.ai === 'empty') return h('span.ai-state', ic('sparkles', 13, 2.2), 'No new AI ideas')
    return h('span.ai-state', ic('sparkles', 13, 2.2), 'AI ideas unavailable')
  }

  function paintTiles() {
    const s = search
    if (!s) return
    const best = s.empty ? [] : s.best((c) => !filteredOut(c), TILES)
    const running = s.done < s.sent || s.ai === 'thinking'
    const freeShown = [...s.cells.values()].filter((c) => c.state === 'free' && !filteredOut(c)).length
    tilesCount.textContent = freeShown > TILES ? `${TILES} of ${freeShown}` : ''
    if (!best.length) {
      tiles = new Map()
      if (running) {
        if (!tilesEl.querySelector('.ghost')) tilesEl.replaceChildren(...[0, 1, 2].map(() => h('div.tile.ghost', h('i'), h('i'))))
      } else {
        tilesEl.replaceChildren(h('div.tiles-none', s.empty ? '' : 'Nothing free yet in these extensions. ',
          s.empty ? null : h('a', { href: '#', style: { color: 'var(--ink)', 'font-weight': 'var(--w-strong)' }, onclick: (e) => { e.preventDefault(); set({ preset: settings.preset === 'three' ? 'two' : 'three' }) } }, settings.preset === 'three' ? 'Try every two-letter one' : 'Try every three-letter one'),
          s.empty || settings.max >= MAX_ANY ? null : [', or ', h('a', { href: '#', style: { color: 'var(--ink)', 'font-weight': 'var(--w-strong)' }, onclick: (e) => { e.preventDefault(); set({ max: Math.min(MAX_ANY, settings.max + 2) }) } }, 'allow longer names'), '.']))
      }
      return
    }
    const keep = new Set(best.map((c) => c.domain))
    const reorder = () => {
      for (const el of [...tilesEl.children]) if (!el.dataset.key || !keep.has(el.dataset.key)) el.remove()
      for (const [d, el] of tiles) if (!keep.has(d)) tiles.delete(d)
      best.forEach((cell, i) => {
        let el = tiles.get(cell.domain)
        if (!el) {
          el = tile(cell)
          tiles.set(cell.domain, el)
          if (!quiet && !reduced()) { el.classList.add('enter'); el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true }) }
        } else paintTile(el, cell)
        if (tilesEl.children[i] !== el) tilesEl.insertBefore(el, tilesEl.children[i] || null)
      })
    }
    if (tilesEl.querySelector('.tile:not(.ghost)') && !quiet) flip(tilesEl, reorder)
    else reorder()
    // New finds go in at the front; keep the row at its start unless someone scrolled it.
    if (!tilesTouched) tilesEl.scrollLeft = 0
  }

  function tile(cell) {
    const el = h('button.tile', { type: 'button', role: 'listitem', 'data-key': cell.domain, onclick: () => open(cell) })
    paintTile(el, cell)
    return el
  }

  function paintTile(el, cell) {
    const r = cell.result || {}
    const premium = !!r.premium
    const price = priceOf(cell)
    const isSaved = saved.has(cell.domain)
    const kind = TILE_KIND[cell.kind] || ''
    el.classList.toggle('saved', isSaved)
    el.setAttribute('aria-label', `${cell.domain}, free${price != null ? ', ' + catalog.money(price) + ' first year' : ''}`)
    el.replaceChildren(
      dn(cell.domain, cell.tld),
      h('span.meta', h('span.price' + (premium ? '.premium' : ''), price != null ? catalog.money(price) : ''), h('span.kind', premium ? 'Premium' : kind)),
      isSaved ? h('span.saved-star', starFilled(14)) : h('span.free-dot' + (premium ? '.premium' : '')))
  }

  function paintMore() {
    const s = search
    if (!s || s.empty || s.done < s.sent || !s.waiting) { fill(moreEl); return }
    const n = Math.min(PASS, s.waiting)
    fill(moreEl,
      h('span', `${s.waiting} longer ${s.waiting === 1 ? 'name hasn’t' : 'names haven’t'} been checked yet.`),
      h('button.btn.tinted', { type: 'button', onclick: () => { haptic(); s.more(); schedule() } }, ic('search', 17, 2.2), `Check ${n} more`))
  }

  /* ---- Filters that only change what's shown -------------------------------------------------- */

  function applyView() {
    results.classList.toggle('only-free', settings.onlyFree)
    results.classList.toggle('hide-premium', settings.hidePremium)
    for (const ge of groups.values()) {
      for (const cell of ge.g.cells) { const b = ge.map.get(cell.domain); if (b) paintPill(b, cell, ge.hack, false) }
      paintGroup(ge)
    }
    schedule()
  }

  function paintQuick() {
    const p = catalog.preset(settings.preset)
    const chip = (label, icon, on, onclick, extra = {}) => h('button' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on == null ? null : String(on), onclick, ...extra }, icon ? ic(icon, 15, 2.2) : null, label)
    fill(quick,
      chip(p.name, null, null, (e) => presetMenu(e.currentTarget), { 'aria-haspopup': 'menu' }),
      chip(settings.max >= MAX_ANY ? 'Any length' : `Up to ${settings.max} letters`, null, null, (e) => lengthMenu(e.currentTarget), { 'aria-haspopup': 'menu' }),
      chip('Only free', null, settings.onlyFree, () => { haptic(); set({ onlyFree: !settings.onlyFree }) }),
      chip('AI ideas', 'sparkles', settings.kinds.ai, () => { haptic(); setKind('ai', !settings.kinds.ai) }),
      chip('Hide premium', null, settings.hidePremium, () => { haptic(); set({ hidePremium: !settings.hidePremium }) }))
    for (const b of quick.querySelectorAll('button:not([aria-pressed])')) b.append(ic('chevronDown', 14, 2.4))
    const n = changed()
    badge.textContent = n ? String(n) : ''
    badge.hidden = !n
  }

  function presetMenu(anchor) {
    menu(anchor, [
      ...catalog.PRESETS.filter((p) => p.id !== 'custom').map((p) => ({ label: p.name, checked: settings.preset === p.id, onclick: () => set({ preset: p.id }) })),
      'sep',
      { label: settings.preset === 'custom' ? `Your own (${settings.custom.length})` : 'Pick your own…', icon: 'plus', checked: settings.preset === 'custom', onclick: openTlds },
    ], { align: 'start' })
  }

  function lengthMenu(anchor) {
    menu(anchor, [3, 4, 5, 6, 8, 10, 12, MAX_ANY].map((n) => ({ label: n >= MAX_ANY ? 'Any length' : `Up to ${n} letters`, checked: settings.max === n, onclick: () => set({ max: n }) })), { align: 'start' })
  }

  onSettings((patch) => {
    paintQuick()
    applyView()
    if (query && Object.keys(patch).some((k) => SEARCH_KEYS.includes(k))) {
      clearTimeout(rerun)
      rerun = setTimeout(() => start(query, { quiet: true }), 380)
    }
  })
  saved.on(() => { if (search) applyView() })

  paintQuick()
  applyView()

  return {
    el: panel,
    show,
    focus: () => { input.focus(); input.select() },
  }
}

function step(icon, tone, title, text) {
  return h('div.how-step', h('span.how-ic' + tone, ic(icon, 19, 2)), h('b', title), h('p', text))
}
