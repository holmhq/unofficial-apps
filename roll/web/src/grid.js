// The photo grid: rows that keep each photo's shape and fill the width, a heading for every
// month and day, and a date rail to jump through the years. Only what is on screen (and a
// screen either side) is in the page, so a library of tens of thousands scrolls like ten.

import { h, ic, reduced, haptic } from './ui.js'
import { heartFill } from './icons.js'
import { photoURL, common } from './store.js'
import { dayKey, dayLabel, shortDay, monthYear, yearOf, shortMonthYear } from './time.js'
import { thumbHashToDataURL } from '../vendor/thumbhash/thumbhash.js'

const LEVELS = { desk: [116, 172, 240, 340], phone: [74, 104, 144, 210] }
const ZOOM_KEY = 'roll:zoom'

const placeholders = new Map()
export function placeholder(th) {
  if (!th) return null
  let url = placeholders.get(th)
  if (!url) {
    try {
      const bin = atob(th)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      url = thumbHashToDataURL(bytes)
    } catch { url = '' }
    placeholders.set(th, url)
  }
  return url || null
}

export class Selection {
  constructor() { this.ids = new Set(); this.fns = new Set(); this.anchor = null }
  get size() { return this.ids.size }
  has(id) { return this.ids.has(id) }
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn) }
  emit() { for (const fn of this.fns) fn(this) }
  toggle(id) { if (this.ids.has(id)) this.ids.delete(id); else this.ids.add(id); this.anchor = id; this.emit() }
  set(ids, on) { for (const id of ids) on ? this.ids.add(id) : this.ids.delete(id); this.emit() }
  clear() { const had = this.ids.size || this.active; this.ids.clear(); this.anchor = null; this.active = false; if (had) this.emit() }
  list() { return [...this.ids] }
}

const phone = () => innerWidth < 760
const level = () => {
  let z = 1
  try { z = Number(localStorage.getItem(ZOOM_KEY)) } catch {}
  return Number.isInteger(z) && z >= 0 && z <= 3 ? z : 1
}

// opts: panel (the scrolling element), before/after (elements around the grid), group
// ('day' | 'none'), months (headings per month), share (a shared album's slug), selection,
// onOpen(photo, list), badge(photo) → text.
export function createGrid(opts) {
  const { panel, group = 'day', months = true, share = null, selection = null, onOpen, badge = null, pad = null } = opts
  const wrap = h('div.grid', { role: 'list' })
  const scrub = h('div.scrub', { 'aria-hidden': 'true' })
  const years = h('div.scrub-years')
  const knob = h('div.scrub-knob')
  const bubble = h('div.scrub-bubble')
  scrub.append(years, knob, bubble)

  let photos = []
  let L = { items: [], height: 0, marks: [], index: new Map() }
  let width = 0
  const rendered = new Map()
  let raf = 0
  let moving = 0

  /* ---- Layout -------------------------------------------------------------- */

  function sizes() {
    const p = phone()
    return { target: LEVELS[p ? 'phone' : 'desk'][level()], gap: p ? 2 : 4, day: p ? 36 : 40, month: p ? 46 : 54, side: pad != null ? pad : 0 }
  }

  // Days short enough sit side by side in a month, each over its own heading, the way a
  // contact sheet fills a page; a long day takes whole rows that fill the width. Every edge
  // is rounded to a pixel so neighbouring tiles always meet.
  function layout() {
    const S = sizes()
    width = Math.max(200, wrap.clientWidth - S.side * 2)
    const W = width
    const items = []
    const marks = []
    const index = new Map()
    const keys = photos.map((p) => dayKey(p.taken))
    const aspect = (p) => Math.min(3.2, Math.max(0.42, p.w / p.h))
    const blockGap = phone() ? 8 : 20
    const rowGap = phone() ? 6 : 12
    let y = 0

    const tile = (p, x, top, w, hh) => {
      const x0 = Math.round(S.side + x)
      const x1 = Math.round(S.side + x + w)
      const it = { kind: 'tile', key: p.id, p, x: x0, y: Math.round(top), w: x1 - x0, h: Math.round(top + hh) - Math.round(top) }
      index.set(p.id, it)
      items.push(it)
    }

    // Whole rows across the width, the last one left at the target height.
    const rows = (list) => {
      let row = []
      let sum = 0
      const flush = (full) => {
        const room = W - S.gap * (row.length - 1)
        const hh = full ? room / sum : Math.min(S.target, room / sum)
        let x = 0
        for (const [p, a] of row) { tile(p, x, y, a * hh, hh); x += a * hh + S.gap }
        y += hh + S.gap
        row = []
        sum = 0
      }
      for (const p of list) {
        const a = aspect(p)
        row.push([p, a])
        sum += a
        if (sum * S.target + S.gap * (row.length - 1) >= W) flush(true)
      }
      if (row.length) flush(false)
      y -= S.gap
    }

    // Days flow into each other along a row, a wider gap between them, and every full row is
    // fitted to the width exactly. A row where a day begins has room above it for that day's
    // heading, which spans the day's part of the row.
    let row = []
    let sum = 0
    const gapsOf = (list) => list.reduce((n, e, k) => n + (k ? (e.start ? blockGap : S.gap) : 0), 0)
    const flushRow = (full) => {
      if (!row.length) return
      const gaps = gapsOf(row)
      const fit = (W - gaps) / sum
      const hh = full ? fit : Math.min(S.target, fit)
      const heads = row.some((e) => e.start)
      const top = y + (heads ? S.day : 0)
      let x = 0
      const starts = []
      row.forEach((e, k) => {
        if (k) x += e.start ? blockGap : S.gap
        if (e.start) starts.push([e, x])
        tile(e.p, x, top, e.a * hh, hh)
        x += e.a * hh
      })
      const end = x
      starts.forEach(([e, sx], k) => {
        const next = starts[k + 1] ? starts[k + 1][1] - blockGap : end
        Object.assign(e.head, { x: Math.round(S.side + sx), y, w: Math.max(40, Math.round(next - sx)) })
        items.push(e.head)
      })
      y = Math.round(top + hh) + S.gap
      row = []
      sum = 0
    }

    if (group !== 'day') {
      if (photos.length) marks.push({ y: 0, t: photos[0].taken })
      rows(photos)
    } else {
      let i = 0
      let lastMonth = null
      while (i < photos.length) {
        let j = i + 1
        while (j < photos.length && keys[j] === keys[i]) j++
        const day = photos.slice(i, j)
        const month = keys[i].slice(0, 7)
        if (months && month !== lastMonth) {
          flushRow(false)
          if (lastMonth !== null) y += rowGap
          const it = { kind: 'month', key: 'm' + month, x: 0, y, h: S.month, t: photos[i].taken }
          items.push(it)
          index.set(it.key, it)
          marks.push({ y, t: photos[i].taken })
          y += S.month
          lastMonth = month
        } else if (!months && !marks.length) marks.push({ y, t: photos[i].taken })
        const head = { kind: 'day', key: 'd' + keys[i], t: photos[i].taken, ids: day.map((p) => p.id), place: common(day.map((p) => p.place && p.place.split(',')[0])), h: S.day }
        index.set(head.key, head)
        day.forEach((p, k) => {
          const e = { p, a: aspect(p), start: k === 0, head }
          row.push(e)
          sum += e.a
          if (sum * S.target + gapsOf(row) >= W) flushRow(true)
        })
        i = j
      }
      flushRow(false)
      y -= S.gap
    }
    items.sort((a, b) => a.y - b.y)
    L = { items, height: Math.max(0, Math.round(y)), marks, index }
    wrap.style.height = L.height + 'px'
    drawYears()
  }

  /* ---- Drawing ------------------------------------------------------------- */

  const offset = () => wrap.offsetTop

  function render() {
    raf = 0
    const top = panel.scrollTop - offset()
    const vh = panel.clientHeight || innerHeight
    const lo = top - vh * 0.8
    const hi = top + vh * 1.8
    let a = 0
    let b = L.items.length
    while (a < b) { const m = (a + b) >> 1; if (L.items[m].y < lo - 400) a = m + 1; else b = m }
    const want = new Set()
    for (let k = a; k < L.items.length; k++) {
      const it = L.items[k]
      if (it.y > hi) break
      if (it.y + it.h < lo) continue
      want.add(it.key)
      let el = rendered.get(it.key)
      if (!el) {
        el = it.kind === 'tile' ? tile(it) : heading(it)
        rendered.set(it.key, el)
        wrap.append(el)
      } else place(el, it)
    }
    for (const [key, el] of rendered) if (!want.has(key)) { el.remove(); rendered.delete(key) }
    moveKnob()
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render) }

  function place(el, it) {
    const t = `translate3d(${it.x || 0}px,${it.y}px,0)`
    if (el._t !== t) { el.style.transform = t; el._t = t }
    if (it.kind === 'day' && el._w !== it.w) { el.style.width = it.w + 'px'; el._w = it.w }
    if (it.kind === 'tile') {
      if (el._w !== it.w) { el.style.width = it.w + 'px'; el._w = it.w }
      if (el._h !== it.h) { el.style.height = it.h + 'px'; el._h = it.h }
      if (el._p !== it.p) refreshTile(el, it.p)
    }
  }

  function tile(it) {
    const p = it.p
    const el = h('div.tile', { role: 'listitem', 'data-id': p.id, tabindex: '-1' })
    const img = new Image()
    img.alt = ''
    img.decoding = 'async'
    img.draggable = false
    img.onload = () => img.classList.add('is-in')
    img.onerror = () => { if (!img._retried && !p.local) { img._retried = true; setTimeout(() => { img.src = photoURL(p, 't', share) + (share ? '&' : '?') + 'r=1' }, 1500) } }
    img.src = photoURL(p, 't', share)
    if (img.complete && img.naturalWidth) img.classList.add('is-in', 'is-now')
    el._img = img
    el.append(img)
    if (selection) el.append(h('span.tick', { 'aria-hidden': 'true' }, ic('check', 13, 3.2)))
    place(el, it)
    refreshTile(el, p)
    return el
  }

  function refreshTile(el, p) {
    el._p = p
    const ph = placeholder(p.th)
    if (ph && el._ph !== ph) { el.style.backgroundImage = `url(${ph})`; el._ph = ph }
    el.classList.toggle('is-picked', !!selection && selection.has(p.id))
    let fav = el.querySelector('.tile-fav')
    if (p.fav && !share && !fav) el.append(h('span.tile-fav', heartFill(15)))
    else if (!p.fav && fav) fav.remove()
    const text = badge ? badge(p) : null
    let b = el.querySelector('.tile-badge')
    if (text && !b) el.append(b = h('span.tile-badge'))
    if (b) { if (text) b.textContent = text; else b.remove() }
    el.classList.toggle('is-pending', !!p.pending)
    let ring = el.querySelector('.tile-up')
    if (p.pending && !ring) el.append(ring = h('span.tile-up', h('i')))
    if (ring && !p.pending) ring.remove()
    if (ring) ring.style.setProperty('--p', String(p.progress || 0))
    el.setAttribute('aria-label', dayLabel(p.taken) + (p.place ? ', ' + p.place : ''))
  }

  function heading(it) {
    if (it.kind === 'month') {
      const el = h('div.ghead.is-month', h('h2', monthYear(it.t)))
      place(el, it)
      return el
    }
    const tick = selection ? h('button.dtick', { type: 'button', 'aria-label': 'Select ' + dayLabel(it.t) }, ic('check', 12, 3.2)) : null
    const el = h('div.ghead.is-day' + (it.x <= 1 ? '.is-edge' : ''), tick, h('b.trunc', it.w && it.w < 150 ? shortDay(it.t) : dayLabel(it.t)), it.place && (!it.w || it.w >= 190) ? h('span.trunc', it.place) : null)
    el._ids = it.ids
    place(el, it)
    syncDay(el)
    return el
  }

  function syncDay(el) {
    if (!selection || !el._ids) return
    el.classList.toggle('is-picked', el._ids.every((id) => selection.has(id)))
  }

  /* ---- The date rail ---------------------------------------------------------- */

  function drawYears() {
    years.replaceChildren()
    const tall = L.height > (panel.clientHeight || innerHeight) * 2.2
    scrub.classList.toggle('is-on', tall && L.marks.length > 0)
    if (!tall) return
    const railH = scrub.clientHeight || panel.clientHeight
    let last = -99
    let lastYear = null
    for (const m of L.marks) {
      const y = yearOf(m.t)
      if (y === lastYear) continue
      lastYear = y
      const at = (m.y / L.height) * railH
      if (at - last < 20) continue
      last = at
      years.append(h('span', { style: { top: at + 'px' } }, String(y)))
    }
  }

  function markAt(y) {
    let best = L.marks[0]
    for (const m of L.marks) { if (m.y <= y) best = m; else break }
    return best
  }

  function moveKnob() {
    if (!scrub.classList.contains('is-on')) return
    const railH = scrub.clientHeight
    const top = Math.max(0, panel.scrollTop - offset())
    const max = Math.max(1, L.height - panel.clientHeight)
    knob.style.transform = `translateY(${Math.min(1, top / max) * (railH - 28)}px)`
    if (!dragging) {
      scrub.classList.add('is-live')
      clearTimeout(moveKnob.timer)
      moveKnob.timer = setTimeout(() => scrub.classList.remove('is-live'), 1200)
    }
  }

  let dragging = false
  function scrubTo(event, jump) {
    const r = scrub.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height))
    const y = f * L.height
    const m = markAt(y)
    bubble.textContent = m ? shortMonthYear(m.t) : ''
    bubble.style.transform = `translateY(${Math.min(r.height - 30, Math.max(0, event.clientY - r.top - 15))}px)`
    if (jump) {
      const max = Math.max(0, L.height - panel.clientHeight)
      panel.scrollTop = offset() + Math.min(max, f * max)
    }
  }
  scrub.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || dragging) scrubTo(e, dragging) })
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true
    scrub.classList.add('is-drag')
    scrub.setPointerCapture(e.pointerId)
    scrubTo(e, true)
    e.preventDefault()
  })
  const stop = () => { dragging = false; scrub.classList.remove('is-drag') }
  scrub.addEventListener('pointerup', stop)
  scrub.addEventListener('pointercancel', stop)
  scrub.addEventListener('pointerleave', () => { if (!dragging) bubble.textContent = '' })

  /* ---- Clicks, selection and long presses --------------------------------------- */

  let press = null
  let suppress = false
  wrap.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.tile')
    if (!el || e.pointerType === 'mouse' || !selection) return
    press = { id: el.dataset.id, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      press = null
      suppress = true
      haptic(12)
      selection.toggle(el.dataset.id)
    }, 430) }
  })
  const cancelPress = (e) => {
    if (!press) return
    if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return
    clearTimeout(press.timer)
    press = null
  }
  wrap.addEventListener('pointermove', cancelPress, { passive: true })
  wrap.addEventListener('pointerup', cancelPress)
  wrap.addEventListener('pointercancel', cancelPress)
  wrap.addEventListener('contextmenu', (e) => { if (e.target.closest('.tile') && !matchMedia('(hover: hover)').matches) e.preventDefault() })

  wrap.addEventListener('click', (e) => {
    if (suppress) { suppress = false; return }
    const day = e.target.closest('.dtick')
    if (day && selection) {
      const el = day.closest('.ghead')
      const all = el._ids.every((id) => selection.has(id))
      selection.set(el._ids, !all)
      haptic()
      return
    }
    const el = e.target.closest('.tile')
    if (!el) return
    const p = el._p
    if (!p || p.pending) return
    if (selection && (selection.size || selection.active || e.target.closest('.tick') || e.metaKey || e.ctrlKey || e.shiftKey)) {
      if (e.shiftKey && selection.anchor && L.index.has(selection.anchor)) {
        const ids = photos.map((x) => x.id)
        const a = ids.indexOf(selection.anchor)
        const b = ids.indexOf(p.id)
        selection.set(ids.slice(Math.min(a, b), Math.max(a, b) + 1), true)
        selection.anchor = p.id
      } else selection.toggle(p.id)
      haptic()
      return
    }
    if (onOpen) onOpen(p, photos, el)
  })
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = e.target.closest('.tile')
    if (el && el._p && onOpen) { e.preventDefault(); onOpen(el._p, photos, el) }
  })

  if (selection) {
    selection.on(() => {
      wrap.classList.toggle('is-selecting', selection.size > 0 || !!selection.active)
      for (const el of rendered.values()) {
        if (el._p) el.classList.toggle('is-picked', selection.has(el._p.id))
        else syncDay(el)
      }
    })
  }

  /* ---- Zoom: ctrl + wheel (a trackpad pinch) or two fingers ------------------------- */

  function zoom(step) {
    const z = Math.min(3, Math.max(0, level() + step))
    if (z === level()) return false
    const anchor = firstVisible()
    try { localStorage.setItem(ZOOM_KEY, String(z)) } catch {}
    relayout(anchor)
    return true
  }
  let wheelAt = 0
  panel.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    if (Date.now() - wheelAt < 260 || Math.abs(e.deltaY) < 2) return
    wheelAt = Date.now()
    zoom(e.deltaY < 0 ? 1 : -1)
  }, { passive: false })
  const fingers = new Map()
  let pinch = null
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    fingers.set(e.pointerId, [e.clientX, e.clientY])
    if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (press) { clearTimeout(press.timer); press = null } }
  })
  panel.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return
    fingers.set(e.pointerId, [e.clientX, e.clientY])
    if (fingers.size !== 2 || !pinch) return
    const [a, b] = [...fingers.values()]
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    if (d / pinch > 1.35) { if (zoom(1)) haptic(); pinch = d }
    else if (d / pinch < 0.74) { if (zoom(-1)) haptic(); pinch = d }
  })
  const lift = (e) => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null }
  panel.addEventListener('pointerup', lift)
  panel.addEventListener('pointercancel', lift)

  function firstVisible() {
    const top = panel.scrollTop - offset()
    for (const it of L.items) if (it.kind === 'tile' && it.y + it.h > top) return { id: it.key, dy: it.y - top }
    return null
  }

  function relayout(anchor = firstVisible()) {
    layout()
    if (anchor && L.index.has(anchor.id)) panel.scrollTop = offset() + L.index.get(anchor.id).y - anchor.dy
    for (const [key, el] of rendered) {
      const it = L.index.get(key)
      if (!it || (it.kind === 'day' && el._ids && el._ids.join() !== it.ids.join())) { el.remove(); rendered.delete(key) }
    }
    render()
  }

  panel.addEventListener('scroll', schedule, { passive: true })
  const resize = new ResizeObserver(() => {
    const before = width
    if (Math.abs(wrap.clientWidth - before) < 1 && L.items.length) { drawYears(); return }
    relayout()
  })
  resize.observe(wrap)

  return {
    el: wrap,
    scrub,
    get photos() { return photos },
    // New photos (or the same ones changed). Tiles that stay slide to their new places.
    set(list, { animate = true } = {}) {
      const anchor = width ? firstVisible() : null
      photos = list
      if (!wrap.isConnected || !wrap.clientWidth) { L = { items: [], height: 0, marks: [], index: new Map() }; requestAnimationFrame(() => { if (wrap.clientWidth) relayout(null) }); return }
      if (animate && rendered.size && !reduced()) {
        wrap.classList.add('is-moving')
        clearTimeout(moving)
        moving = setTimeout(() => wrap.classList.remove('is-moving'), 450)
      }
      relayout(anchor && anchor.dy > -40 ? anchor : null)
    },
    relayout,
    zoom,
    // The tile's place on screen, scrolling it into view first if it's off screen.
    rectOf(id, { reveal = true } = {}) {
      const it = L.index.get(id)
      if (!it) return null
      const top = it.y + offset()
      if (reveal && (top < panel.scrollTop + 40 || top + it.h > panel.scrollTop + panel.clientHeight - 40)) {
        panel.scrollTop = top - (panel.clientHeight - it.h) / 2
      }
      render()
      const el = rendered.get(id)
      return el ? { rect: el.getBoundingClientRect(), el } : null
    },
    hide(id, on) {
      const el = rendered.get(id)
      if (el) el.classList.toggle('is-hidden', on)
    },
    destroy() { resize.disconnect() }
  }
}
