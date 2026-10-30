// The time strip: each day is a track and time runs left to right, the way a
// video editor lays out clips. Shaded spans show when someone is free; strips
// are spans you paint, trim at either end and slide along; the clip is the
// meeting itself, the length of the event, dropped where you want it.
//
// One component serves three pages: a guest picking or suggesting times, a
// host painting weekly hours, and a host settling a request. Callers keep the
// data; the strip draws it and reports what the pointer did.
//
// The whole day zooms: pinch, ctrl or ⌘ with the scroll wheel (a trackpad
// pinch), or the − and + of zoomControl(). Positions are written in minutes
// times one CSS variable (--ppm, pixels per minute), so a zoom moves nothing
// but that variable and the scroll.
//
//   timeline({
//     tracks: [{ key, label, sub, dim, today, paused }],
//     mode: 'clip' | 'strips',
//     layers: (track) => ({ shade, busy, glow, mark }),  minutes of the day, [[a, b]]
//     strips: { get(key), set(key, ranges, { live }), kind: 'host' | 'guest', step, min, max, editable, across },
//     clip: { get(), set(c), place(key, start) },        place() snaps, or returns null
//     now: () => ({ key, minute }) | null,
//     zoom: 'week',                                      remember the zoom under this name
//     days: { toggle(key, on), move(from, to) },         the host's week: a switch per day, days that drag
//     onTap(key, minute), onChange(), onSelect(sel), onLive()
//   })
import { h, fill, ic, haptic, reduced, wide } from './ui.js'
import * as t from './time.js'
import { sound } from './sound.js'

const DAY = 1440
const HOLD = 260
const NUDGE = 60
const ZOOM_MAX = 6

const pad = (n) => String(n).padStart(2, '0')

// "9:00" or "09:00", and "9:00 – 10:30 AM" written as the reader's clock does.
export function short(min) {
  const m = ((min % DAY) + DAY) % DAY
  const hh = Math.floor(m / 60)
  if (t.clock24()) return `${pad(min >= DAY ? 24 : hh)}:${pad(m % 60)}`
  return `${hh % 12 || 12}:${pad(m % 60)}`
}

export function span(a, b) {
  if (t.clock24()) return `${short(a)} – ${short(b)}`
  const pa = Math.floor((a % DAY) / 60) < 12 ? 'AM' : 'PM'
  const pb = b >= DAY ? 'AM' : Math.floor(b / 60) < 12 ? 'AM' : 'PM'
  return pa === pb ? `${short(a)} – ${short(b)} ${pb}` : `${short(a)} ${pa} – ${short(b)} ${pb}`
}

function hourLabel(hh, min = 0) {
  if (min) return t.clock24() ? `${pad(hh % 24)}:${pad(min)}` : `${hh % 12 || 12}:${pad(min)}`
  if (t.clock24()) return `${pad(hh % 24)}:00`
  const x = hh % 24
  return x === 12 ? 'Noon' : x === 0 ? '12 AM' : `${x % 12} ${x < 12 ? 'AM' : 'PM'}`
}

// Sorted, with touching or overlapping spans joined.
export function merge(ranges) {
  const out = []
  for (const [a, b] of ranges.filter(([a, b]) => b > a).map((r) => r.slice()).sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

export function intersect(xs, ys) {
  const out = []
  for (const [a, b] of xs) for (const [c, d] of ys) {
    const lo = Math.max(a, c)
    const hi = Math.min(b, d)
    if (hi > lo) out.push([lo, hi])
  }
  return merge(out)
}

// Where a span `len` long can start in a day that already has `list`,
// nearest to `want`, or null when no gap is long enough.
function fitInto(list, want, len) {
  let best = null
  let edge = 0
  for (const [a, b] of [...list.slice().sort((x, y) => x[0] - y[0]), [DAY, DAY]]) {
    if (a - edge >= len) {
      const at = Math.max(edge, Math.min(a - len, want))
      if (best === null || Math.abs(at - want) < Math.abs(best - want)) best = at
    }
    edge = Math.max(edge, b)
  }
  return best
}

export function timeline(o) {
  const zoomKey = o.zoom ? 'kalendar:zoom:' + o.zoom : null
  const base = () => o.ppm || (wide() ? 1 : 1.15)
  const kept = () => { try { const z = Number(localStorage.getItem(zoomKey)); return zoomKey && z > 0 ? z : null } catch { return null } }
  const state = {
    tracks: o.tracks || [],
    mode: o.mode || 'clip',
    ppm: kept() || base(),
    sel: null,
    drag: null,
    shown: null,
    swap: null
  }
  const labelW = () => (o.days ? (wide() ? 136 : 112) : wide() ? 96 : 70)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  const corner = h('div.tl-corner', o.corner || null)
  const scale = h('div.tl-scale')
  const ruler = h('div.tl-ruler', corner, scale)
  const rows = h('div.tl-rows')
  const sheet = h('div.tl-sheet', ruler, rows)
  const el = h('div.tl' + (o.className ? '.' + o.className : ''), { role: 'group', 'aria-label': o.label || 'Times' }, sheet)
  const lanes = new Map()
  const zooms = new Set()

  /* ---- Drawing ---------------------------------------------------------------- */

  function layout() {
    sheet.style.setProperty('--ppm', String(state.ppm))
    sheet.style.setProperty('--label', labelW() + 'px')
  }

  // Hour marks: every hour when there's room, every two or three when the
  // day is zoomed right out, and half hours when it's zoomed right in.
  function drawScale() {
    const hour = state.ppm * 60
    const every = hour >= 52 ? 1 : hour >= 26 ? 2 : 3
    const ticks = []
    for (let hh = 0; hh <= 24; hh += every) {
      ticks.push(h('span.tl-tick' + (hh === 0 ? '.first' : hh === 24 ? '.last' : ''), { style: { left: at(hh * 60) } }, hh < 24 ? hourLabel(hh) : ''))
      if (hour >= 150 && hh < 24) ticks.push(h('span.tl-tick.half', { style: { left: at(hh * 60 + 30) } }, hourLabel(hh, 30)))
    }
    fill(scale, ticks)
  }

  function drawRows() {
    lanes.clear()
    fill(rows, state.tracks.map((track) => {
      const lane = h('div.tl-lane', { 'data-key': track.key, tabindex: '-1' })
      lanes.set(track.key, lane)
      drawLane(track, lane)
      return h('div.tl-row' + (track.dim ? '.dim' : '') + (track.today ? '.today' : '') + (track.paused ? '.paused' : ''), { 'data-key': track.key },
        h('div.tl-label' + (o.days ? '.day' : ''),
          h('div.tl-name', h('b', track.label), track.sub ? h('small', track.sub) : null),
          o.days && o.days.toggle ? daySwitch(track) : null),
        lane)
    }))
  }

  function daySwitch(track) {
    const input = h('input.switch.mini', { type: 'checkbox', role: 'switch', checked: !track.paused && !track.dim, 'aria-label': `${track.label}: open for bookings` })
    input.addEventListener('change', () => o.days.toggle(track.key, input.checked))
    return input
  }

  const at = (min) => `calc(var(--ppm) * ${min}px)`
  const box = (cls, a, b, kids = []) => h(cls, { style: { left: at(a), width: at(Math.max(b - a, 1)) } }, kids)

  function drawLane(track, lane = lanes.get(track.key)) {
    if (!lane) return
    const l = (o.layers && o.layers(track)) || {}
    const kids = []
    const now = o.now && o.now()
    if (now && now.key === track.key) kids.push(box('div.tl-past', 0, now.minute))
    for (const [a, b] of l.shade || []) kids.push(box('div.tl-shade', a, b))
    for (const [a, b] of l.busy || []) kids.push(box('div.tl-busy', a, b))
    for (const [a, b] of l.mark || []) kids.push(box('div.tl-mark', a, b, (b - a) * state.ppm > 64 ? [h('span.tl-text', o.markLabel || 'Booked now')] : []))
    const kind = o.strips ? o.strips.kind || 'host' : null
    if (o.strips) {
      const from = sourceOf(track.key)
      hoursOf(track.key).forEach(([a, b], i) => {
        const on = state.sel && state.sel.key === track.key && state.sel.index === i
        const editable = state.mode === 'strips' && o.strips.editable !== false
        const strip = box(`div.tl-strip.${kind}` + (on ? '.sel' : '') + (editable ? '.edit' : ''), a, b,
          editable ? [h('span.tl-handle.l', { 'data-part': 'handle-l', 'aria-hidden': 'true' }), h('span.tl-handle.r', { 'data-part': 'handle-r', 'aria-hidden': 'true' })] : [])
        strip.dataset.part = 'strip'
        strip.dataset.index = String(i)
        strip.dataset.src = from + ':' + i
        // Where the glow covers a strip, the glow speaks for it.
        if (!(l.glow || []).some(([g, z]) => g < b && z > a)) strip.append(h('span.tl-text', label(a, b, kind)))
        kids.push(strip)
      })
    }
    for (const [a, b] of l.glow || []) kids.push(box('div.tl-glow', a, b, (b - a) * state.ppm > 76 ? [h('span.tl-text', o.glowLabel || 'Both free')] : []))
    const c = o.clip && o.clip.get()
    if (c && c.key === track.key && state.mode === 'clip') {
      const narrow = (c.end - c.start) * state.ppm < 66
      // It pops in where it lands, not while it's dragged or nudged.
      const was = state.shown
      const fresh = !state.drag && (!was || was.key !== c.key || Math.abs(was.start - c.start) > c.end - c.start)
      state.shown = { key: c.key, start: c.start }
      const clip = box('div.tl-clip.' + (c.mode || 'open') + (narrow ? '.narrow' : '') + (fresh ? '.fresh' : ''), c.start, c.end, narrow ? [h('span.tl-flag', short(c.start))] : [h('span.tl-text', clipLabel(c))])
      clip.dataset.part = 'clip'
      clip.tabIndex = 0
      clip.setAttribute('role', 'slider')
      clip.setAttribute('aria-label', o.clipAria ? o.clipAria(c) : span(c.start, c.end))
      clip.setAttribute('aria-valuetext', span(c.start, c.end))
      kids.push(clip)
    } else if (!c) state.shown = null
    if (now && now.key === track.key) kids.push(h('div.tl-now', { style: { left: at(now.minute) } }))
    fill(lane, kids)
  }

  function label(a, b, kind) {
    const w = (b - a) * state.ppm
    if (o.stripLabel) return o.stripLabel(a, b, kind, w)
    return w > 150 ? span(a, b) : w > 84 ? `${short(a)}–${short(b)}` : w > 58 ? short(a) : ''
  }

  function clipLabel(c) {
    const w = (c.end - c.start) * state.ppm
    const text = w > 104 ? span(c.start, c.end) : short(c.start)
    return c.mode === 'ask' && w > 150 ? `Ask · ${text}` : text
  }

  function redraw() {
    layout()
    drawScale()
    drawRows()
  }

  function redrawTrack(key) {
    const track = state.tracks.find((x) => x.key === key)
    if (track) drawLane(track)
  }

  // While a day is held over another, the two show each other's hours.
  const sourceOf = (key) => { const w = state.swap; return w && key === w.from ? w.to : w && key === w.to ? w.from : key }
  const hoursOf = (key) => o.strips.get(sourceOf(key))

  // Strips that changed rows glide there from where they were drawn.
  function tops() {
    const seen = new Map()
    for (const strip of rows.querySelectorAll('.tl-strip')) seen.set(strip.dataset.src, strip.getBoundingClientRect().top)
    return seen
  }
  function glide(before, match = null) {
    if (reduced()) return
    for (const strip of rows.querySelectorAll('.tl-strip')) {
      const top = before.get(match ? match(strip) : strip.dataset.src)
      if (top === undefined) continue
      const dy = top - strip.getBoundingClientRect().top
      if (Math.abs(dy) > 1) strip.animate([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2, .9, .25, 1)' })
    }
  }

  /* ---- Zoom ----------------------------------------------------------------------- */

  // Out to the whole day in view, in to an hour across a phone.
  const fit = () => (el.clientWidth > labelW() ? (el.clientWidth - labelW()) / DAY : base())
  const limits = () => [Math.min(fit(), base()), ZOOM_MAX]

  // Zoom to `ppm`, keeping the time under client x `ax` (default: the middle) still.
  function zoomNow(ppm, ax = null) {
    const [lo, hi] = limits()
    ppm = clamp(ppm, lo, hi)
    if (Math.abs(ppm - state.ppm) < 1e-4) return
    const r = el.getBoundingClientRect()
    const x = (ax == null ? r.left + labelW() + (el.clientWidth - labelW()) / 2 : ax) - r.left - labelW()
    const minute = (el.scrollLeft + x) / state.ppm
    state.ppm = ppm
    sheet.style.setProperty('--ppm', String(ppm))
    el.scrollLeft = minute * ppm - x
    settle()
  }

  let zoomRaf = 0
  function zoomTo(ppm, ax = null) {
    cancelAnimationFrame(zoomRaf)
    const [lo, hi] = limits()
    const to = clamp(ppm, lo, hi)
    if (reduced()) { zoomNow(to, ax); return }
    const from = state.ppm
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 260)
      const e = 1 - Math.pow(1 - p, 3)
      zoomNow(from * Math.pow(to / from, e), ax)
      if (p < 1) zoomRaf = requestAnimationFrame(step)
    }
    zoomRaf = requestAnimationFrame(step)
  }

  // Once a zoom comes to rest, redraw what depends on width (the hour marks,
  // the times written inside spans) and remember it for next time.
  let settleTimer = 0
  function settle() {
    clearTimeout(settleTimer)
    paintZooms()
    settleTimer = setTimeout(() => {
      drawScale()
      for (const track of state.tracks) drawLane(track)
      try { if (zoomKey) localStorage.setItem(zoomKey, String(Math.round(state.ppm * 1000) / 1000)) } catch {}
    }, 140)
  }

  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    cancelAnimationFrame(zoomRaf)
    zoomNow(state.ppm * Math.exp(-clamp(e.deltaY, -60, 60) * 0.012), e.clientX)
  }, { passive: false })

  // Two fingers pinch, followed as pointers (touch events don't always come
  // once the strip's own gestures are under way).
  let pinch = null
  const fingers = new Map()
  const pair = () => [...fingers.values()].slice(0, 2)
  const gap = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y)
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.size !== 2) return
    // The first finger may have caught a handle or a strip: a second one
    // makes it a pinch, and whatever the first had started is put back.
    const p = state.pending
    if (p) { clearTimeout(p.timer); state.pending = null }
    if (state.drag) abandon()
    pinch = { d: Math.max(20, gap(pair())), ppm: state.ppm }
    cancelAnimationFrame(zoomRaf)
  }, true)
  const onFinger = (e) => {
    const f = fingers.get(e.pointerId)
    if (!f) return
    f.x = e.clientX
    f.y = e.clientY
    if (!pinch || fingers.size < 2) return
    const [a, b] = pair()
    zoomNow(pinch.ppm * gap([a, b]) / pinch.d, (a.x + b.x) / 2)
  }
  const offFinger = (e) => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null }
  addEventListener('pointermove', onFinger)
  addEventListener('pointerup', offFinger)
  addEventListener('pointercancel', offFinger)
  // While something is dragged or pinched, a finger mustn't scroll the page.
  el.addEventListener('touchmove', (e) => { if (state.drag || pinch) e.preventDefault() }, { passive: false })

  // − ↔ + : zoom out, the whole day, zoom in; a small control for the page to place.
  function zoomControl() {
    const less = h('button.zoom-btn', { type: 'button', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => { zoomTo(state.ppm / 1.6); sound.tap() } }, ic('minus', 16, 2.4))
    const whole = h('button.zoom-btn.whole', { type: 'button', 'aria-label': 'Show the whole day', title: 'Whole day', onclick: () => { zoomTo(fit()); sound.tap() } }, ic('moveHorizontal', 16, 2.2))
    const more = h('button.zoom-btn', { type: 'button', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => { zoomTo(state.ppm * 1.6); sound.tap() } }, ic('plus', 16, 2.4))
    const box = h('div.zoom', { role: 'group', 'aria-label': 'Zoom' }, less, whole, more)
    zooms.add({ less, whole, more })
    requestAnimationFrame(paintZooms)
    return box
  }

  function paintZooms() {
    const [lo, hi] = limits()
    for (const z of zooms) {
      z.less.disabled = state.ppm <= lo + 1e-3
      z.more.disabled = state.ppm >= hi - 1e-3
      z.whole.classList.toggle('on', state.ppm <= fit() + 1e-3)
    }
  }

  /* ---- Pointer ------------------------------------------------------------------- */

  const minuteAt = (lane, x) => (x - lane.getBoundingClientRect().left) / state.ppm
  const snap = (m, step = (o.strips && o.strips.step) || 15) => Math.round(m / step) * step

  function laneAt(y) {
    for (const [key, lane] of lanes) {
      const r = lane.getBoundingClientRect()
      if (y >= r.top && y < r.bottom) return { key, lane }
    }
    return null
  }

  function stripsOf(key) { return o.strips.get(key).map((r) => r.slice()) }

  // Neighbours bound a strip: it can grow or slide up to them, not over.
  function bounds(list, i) {
    return [i > 0 ? list[i - 1][1] : 0, i < list.length - 1 ? list[i + 1][0] : DAY]
  }

  function begin(d, e) {
    state.drag = d
    el.classList.add('dragging')
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId) } catch {}
    haptic(6)
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // A second finger is a pinch, not a paint.
    if (!e.isPrimary) { const p = state.pending; if (p) { clearTimeout(p.timer); state.pending = null } return }
    const touch = e.pointerType === 'touch'
    const dayLabel = o.days && o.days.move && e.target.closest('.tl-label')
    if (dayLabel) {
      if (e.target.closest('input')) return
      const key = dayLabel.parentNode.dataset.key
      state.pending = { kind: 'day', key, x: e.clientX, y: e.clientY, id: e.pointerId, hold: touch }
      if (touch) armHold()
      else e.preventDefault()
      return
    }
    const lane = e.target.closest('.tl-lane')
    if (!lane) return
    const key = lane.dataset.key
    const at = minuteAt(lane, e.clientX)
    const partEl = e.target.closest('[data-part]')
    const part = partEl && partEl.dataset.part
    const start = { x: e.clientX, y: e.clientY, key, at, id: e.pointerId, target: e.target }

    if (part === 'clip' && state.mode === 'clip') {
      const c = o.clip.get()
      begin({ kind: 'clip', grab: at - c.start, last: c }, e)
      e.preventDefault()
      return
    }
    if ((part === 'handle-l' || part === 'handle-r') && state.mode === 'strips') {
      const i = Number(partEl.closest('.tl-strip').dataset.index)
      select({ key, index: i })
      begin({ kind: 'trim', side: part === 'handle-l' ? 'l' : 'r', key, index: i, list: stripsOf(key) }, e)
      e.preventDefault()
      return
    }
    if (part === 'strip' && state.mode === 'strips' && o.strips.editable !== false) {
      const i = Number(partEl.dataset.index)
      const list = stripsOf(key)
      const selected = state.sel && state.sel.key === key && state.sel.index === i
      if (!touch || selected) {
        select({ key, index: i })
        state.pending = { ...start, kind: 'move', index: i, list, grab: at - list[i][0] }
        if (!touch) e.preventDefault()
        return
      }
      state.pending = { ...start, kind: 'move', index: i, list, grab: at - list[i][0], hold: true, tapSelect: true }
      armHold()
      return
    }
    // An empty part of a lane: paint or drop the clip. A finger holds first,
    // so a swipe still scrolls.
    state.pending = { ...start, kind: state.mode === 'clip' ? 'clip-new' : 'paint', hold: touch }
    if (touch) armHold()
    else e.preventDefault()
  })

  function armHold() {
    const p = state.pending
    p.timer = setTimeout(() => {
      if (state.pending !== p) return
      p.hold = false
      p.held = true
      startPending(p, p.x, p.y)
    }, HOLD)
  }

  function startPending(p, x, y) {
    state.pending = null
    if (p.kind === 'day') { liftDay(p, x, y); return }
    const lane = lanes.get(p.key)
    if (!lane) return
    if (p.kind === 'clip-new') {
      const c = o.clip.place(p.key, Math.round(p.at - o.clipLength / 2))
      if (!c) return
      o.clip.set(c)
      redrawTrack(p.key)
      begin({ kind: 'clip', grab: p.at - c.start, last: c }, { target: el, pointerId: p.id })
      moveTo(x, y)
    } else if (p.kind === 'paint') {
      const list = stripsOf(p.key)
      if (list.length >= (o.strips.max || 8)) { sound.error(); return }
      const a = clamp(Math.floor(p.at / 15) * 15, 0, DAY - (o.strips.min || 15))
      list.push([a, a + (o.strips.min || 15)])
      const merged = list.sort((x, y) => x[0] - y[0])
      const index = merged.findIndex((r) => r[0] === a)
      o.strips.set(p.key, merged, { live: true })
      select({ key: p.key, index })
      begin({ kind: 'paint', key: p.key, index, origin: a, list: merged }, { target: el, pointerId: p.id })
      moveTo(x, y)
    } else if (p.kind === 'move') {
      select({ key: p.key, index: p.index })
      const len = p.list[p.index][1] - p.list[p.index][0]
      begin({ kind: 'move', key: p.key, index: p.index, list: p.list, grab: p.grab, from: p.key, fromIndex: p.index, len, orig: new Map([[p.key, p.list]]), touched: new Set([p.key]) }, { target: el, pointerId: p.id })
      moveTo(x, y)
    }
  }

  const onMove = (e) => {
    const p = state.pending
    if (p && e.pointerId === p.id) {
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.hold) {
        if (moved > 8) { clearTimeout(p.timer); state.pending = null }
        return
      }
      if (moved > 4) startPending(p, e.clientX, e.clientY)
      return
    }
    if (!state.drag || e.pointerId !== undefined && state.drag.id !== undefined && e.pointerId !== state.drag.id) return
    e.preventDefault()
    moveTo(e.clientX, e.clientY)
    if (state.drag && state.drag.kind !== 'day') edgeScroll(e.clientX)
  }
  addEventListener('pointermove', onMove, { passive: false })

  function moveTo(x, y) {
    const d = state.drag
    if (!d) return
    d.x = x
    d.y = y
    if (d.kind === 'day') { dragDay(x, y); return }
    if (d.kind === 'clip') {
      const hit = laneAt(y) || { key: d.last.key, lane: lanes.get(d.last.key) }
      const at = minuteAt(hit.lane, x)
      const c = o.clip.place(hit.key, Math.round(at - d.grab))
      if (!c) return
      const prev = d.last
      if (prev && c.key === prev.key && c.start === prev.start && c.mode === prev.mode) return
      d.last = c
      o.clip.set(c)
      if (prev && prev.key !== c.key) redrawTrack(prev.key)
      redrawTrack(c.key)
      if (c.mode === 'open' && (!prev || prev.mode !== 'open' || prev.start !== c.start)) { haptic(3); sound.tick && sound.tick() }
      o.onLive && o.onLive()
      return
    }
    if (d.kind === 'move' && o.strips.across) { moveAcross(d, x, y); return }
    const lane = lanes.get(d.key)
    const at = minuteAt(lane, x)
    const list = d.list.map((r) => r.slice())
    const [lo, hi] = bounds(list, d.index)
    const min = o.strips.min || 15
    const r = list[d.index]
    if (d.kind === 'trim') {
      if (d.side === 'l') r[0] = clamp(snap(at), lo, r[1] - min)
      else r[1] = clamp(snap(at), r[0] + min, hi)
    } else if (d.kind === 'move') {
      const len = r[1] - r[0]
      const a = clamp(snap(at - d.grab), lo, hi - len)
      r[0] = a
      r[1] = a + len
    } else if (d.kind === 'paint') {
      const m = snap(at)
      if (m >= d.origin) { r[0] = d.origin; r[1] = clamp(m, d.origin + min, hi) } else { r[0] = clamp(m, lo, d.origin); r[1] = Math.max(d.origin, r[0] + min) }
    }
    const before = o.strips.get(d.key)[d.index]
    if (before && before[0] === r[0] && before[1] === r[1]) return
    o.strips.set(d.key, list, { live: true })
    redrawTrack(d.key)
    haptic(2)
    o.onLive && o.onLive()
  }

  // A strip slides along its own day, or up and down into another. There it
  // lands where it's held, nudged into a gap close by, or trades places with
  // the spans in its way, which go back to the day it came from. Failing
  // both, it takes the nearest gap long enough; a day with no room keeps it
  // home.
  function moveAcross(d, x, y) {
    const hit = laneAt(y)
    let key = hit ? hit.key : d.key
    const want = (k) => snap(minuteAt(lanes.get(k), x) - d.grab)
    const orig = (k) => {
      if (!d.orig.has(k)) d.orig.set(k, stripsOf(k))
      return d.orig.get(k).map((r) => r.slice())
    }
    const lists = new Map()
    let index = d.fromIndex
    let traded = null
    if (key !== d.from) {
      const target = orig(key)
      const w = want(key)
      const a = target.length >= (o.strips.max || 8) ? null : fitInto(target, w, d.len)
      // A gap close to where it's held takes it; otherwise it trades places
      // with what's there, rather than jumping to a far end of the day.
      const deal = a === null || Math.abs(a - w) > NUDGE ? trade(d, key, w, orig) : null
      if (deal) {
        d.full = null
        traded = deal.hit
        index = deal.index
        lists.set(d.from, deal.home)
        lists.set(key, deal.there)
      } else if (a === null) {
        if (!d.full || d.full !== key) { d.full = key; sound.error(); haptic(12) }
        key = d.from
      } else {
        d.full = null
        target.push([a, a + d.len])
        target.sort((p, q) => p[0] - q[0])
        index = target.findIndex((r) => r[0] === a)
        const home = orig(d.from)
        home.splice(d.fromIndex, 1)
        lists.set(d.from, home)
        lists.set(key, target)
      }
    }
    if (key === d.from) {
      const home = orig(d.from)
      const [lo, hi] = bounds(home, d.fromIndex)
      const a = clamp(want(d.from), lo, hi - d.len)
      home[d.fromIndex] = [a, a + d.len]
      lists.set(d.from, home)
      index = d.fromIndex
    }
    // Put back any day it passed through.
    for (const k of d.touched) if (!lists.has(k)) lists.set(k, orig(k))
    const deal = traded ? key + ':' + JSON.stringify(traded) : null
    const same = key === d.key && index === d.index && lists.get(key)[index][0] === o.strips.get(key)[d.index]?.[0] && deal === d.deal
    if (same && lists.size === d.touched.size) return
    if (key !== d.key || deal !== d.deal) { haptic(8); sound.tick && sound.tick() } else haptic(2)
    // What's traded glides between the two days, and back if it's undone.
    const before = new Map()
    const at = (k, r) => k + ':' + r[0] + '-' + r[1]
    for (const strip of rows.querySelectorAll('.tl-strip')) {
      const k = strip.closest('.tl-lane').dataset.key
      const r = o.strips.get(k)[Number(strip.dataset.index)]
      if (r) before.set(at(k, r), strip.getBoundingClientRect().top)
    }
    const was = d.deal ? { key: d.dealKey, hit: d.dealHit } : null
    d.key = key
    d.index = index
    d.deal = deal
    d.dealKey = traded ? key : null
    d.dealHit = traded
    d.touched = new Set(lists.keys())
    state.sel = { key, index }
    for (const [k, list] of lists) { o.strips.set(k, list, { live: true }); redrawTrack(k) }
    if (traded || was) {
      // A traded span is the same span in another row: match it by its times.
      glide(before, (strip) => {
        const k = strip.closest('.tl-lane').dataset.key
        const r = o.strips.get(k)[Number(strip.dataset.index)]
        if (!r) return null
        if (traded && k === d.from && traded.some(([p, q]) => p === r[0] && q === r[1])) return at(key, r)
        if (was && k === was.key && was.hit.some(([p, q]) => p === r[0] && q === r[1])) return at(d.from, r)
        return null
      })
    }
    for (const row of rows.children) row.classList.toggle('drop', (row.dataset.key === key && key !== d.from) || (!!traded && row.dataset.key === d.from))
    o.onLive && o.onLive()
  }

  // No gap long enough on that day: the strip takes the place of what's in
  // its way, and that goes back to the day the strip came from, at its own
  // times, if it fits there.
  function trade(d, key, want, orig) {
    const a = clamp(want, 0, DAY - d.len)
    const there = orig(key)
    const hit = there.filter(([p, q]) => p < a + d.len && q > a)
    const home = orig(d.from)
    home.splice(d.fromIndex, 1)
    if (!hit.length || home.length + hit.length > (o.strips.max || 8)) return null
    if (hit.some(([p, q]) => home.some(([x, y]) => p < y && q > x))) return null
    const rest = there.filter((r) => !hit.includes(r))
    rest.push([a, a + d.len])
    rest.sort((p, q) => p[0] - q[0])
    home.push(...hit.map((r) => r.slice()))
    home.sort((p, q) => p[0] - q[0])
    return { home, there: rest, hit: hit.map((r) => r.slice()), index: rest.findIndex((r) => r[0] === a) }
  }

  let scrollRaf = 0
  function edgeScroll(x) {
    cancelAnimationFrame(scrollRaf)
    const r = el.getBoundingClientRect()
    const left = r.left + labelW()
    const v = x < left + 36 ? -1 : x > r.right - 36 ? 1 : 0
    if (!v || !state.drag) return
    const tick = () => {
      if (!state.drag) return
      el.scrollLeft += v * 9
      moveTo(state.drag.x, state.drag.y)
      scrollRaf = requestAnimationFrame(tick)
    }
    scrollRaf = requestAnimationFrame(tick)
  }

  /* ---- Moving a whole day ----------------------------------------------------------- */

  // Hold a day's name (or press and drag it with a mouse) and it lifts. Over
  // another day, the two trade hours on screen as you go, so you see the week
  // you'll get; let go to keep it, or anywhere else to put it back.
  function liftDay(p, x, y) {
    const row = [...rows.children].find((r) => r.dataset.key === p.key)
    if (!row) return
    if (state.sel) select(null)
    const label = row.querySelector('.tl-label')
    const r = label.getBoundingClientRect()
    const ghost = h('div.tl-ghost', { 'aria-hidden': 'true' }, label.querySelector('.tl-name').cloneNode(true), h('span.tl-ghost-hint'))
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: Math.max(r.width, 196) + 'px', height: r.height + 'px' })
    document.body.append(ghost)
    row.classList.add('lifted')
    // How each day's label looks now, to trade along with its hours.
    const looks = new Map([...rows.children].map((x) => {
      const sw = x.querySelector('input.switch')
      const small = x.querySelector('.tl-label small')
      return [x.dataset.key, { dim: x.classList.contains('dim'), paused: x.classList.contains('paused'), sub: small ? small.textContent : '', on: sw ? sw.checked : null }]
    }))
    begin({ kind: 'day', key: p.key, row, ghost, looks, dy: y - r.top, target: null, id: p.id }, { target: el, pointerId: p.id })
    sound.tap()
    dragDay(x, y)
  }

  function dragDay(x, y) {
    const d = state.drag
    d.ghost.style.transform = `translate3d(0, ${y - d.dy - parseFloat(d.ghost.style.top)}px, 0) scale(1.03)`
    const hit = laneAt(y)
    const target = hit && hit.key !== d.key ? hit.key : null
    if (target === d.target) return
    const was = d.target
    d.target = target
    swapTo(d, was, target)
    const hint = d.ghost.querySelector('.tl-ghost-hint')
    const name = target ? (state.tracks.find((tr) => tr.key === target) || {}).label : ''
    hint.textContent = target ? (o.strips.get(target).length ? `Swap with ${name}` : `Move to ${name}`) : ''
    if (target) { haptic(6); sound.tick && sound.tick() }
  }

  function swapTo(d, was, target) {
    const before = tops()
    state.swap = target ? { from: d.key, to: target } : null
    for (const key of new Set([d.key, was, target].filter(Boolean))) { redrawTrack(key); lookOf(d, key) }
    for (const row of rows.children) row.classList.toggle('drop', !!target && (row.dataset.key === target || row.dataset.key === d.key))
    glide(before)
  }

  function lookOf(d, key) {
    const row = [...rows.children].find((r) => r.dataset.key === key)
    const look = d.looks.get(sourceOf(key))
    if (!row || !look) return
    row.classList.toggle('dim', look.dim)
    row.classList.toggle('paused', look.paused)
    const small = row.querySelector('.tl-label small')
    if (small) small.textContent = look.sub
    const sw = row.querySelector('input.switch')
    if (sw && look.on !== null) sw.checked = look.on
  }

  function dropDay(d, cancelled) {
    d.row.classList.remove('lifted')
    const target = cancelled ? null : d.target
    const ghost = d.ghost
    if (target && !reduced()) {
      const to = [...rows.children].find((r) => r.dataset.key === target).getBoundingClientRect()
      ghost.style.transition = 'transform .22s var(--ease-out), opacity .22s'
      ghost.style.transform = `translate3d(0, ${to.top - parseFloat(ghost.style.top)}px, 0)`
      ghost.style.opacity = '0'
      setTimeout(() => ghost.remove(), 240)
    } else ghost.remove()
    for (const row of rows.children) row.classList.remove('drop')
    // Kept: the week becomes what's on screen. Put back: the hours glide home.
    if (target) { state.swap = null; o.days.move(d.key, target) }
    else if (d.target) swapTo(d, d.target, null)
  }

  function end(e) {
    const p = state.pending
    if (p && e.pointerId === p.id) {
      clearTimeout(p.timer)
      state.pending = null
      if (p.held) return
      // A tap.
      if (p.kind === 'day') return
      if (p.tapSelect) { select(state.sel && state.sel.key === p.key && state.sel.index === p.index ? null : { key: p.key, index: p.index }); return }
      if (p.kind === 'move') return
      if (state.sel && state.mode === 'strips') { select(null); return }
      o.onTap && o.onTap(p.key, p.at)
      return
    }
    if (!state.drag) return
    cancelAnimationFrame(scrollRaf)
    const d = state.drag
    state.drag = null
    el.classList.remove('dragging')
    if (d.kind === 'day') { dropDay(d, e.type === 'pointercancel'); return }
    if (d.kind !== 'clip') {
      for (const row of rows.children) row.classList.remove('drop')
      // Other days a strip passed through or left settle first.
      if (d.touched) for (const k of d.touched) if (k !== d.key) { o.strips.set(k, merge(o.strips.get(k)), { live: false }); redrawTrack(k) }
      const list = o.strips.get(d.key)
      const keep = list[d.index]
      const merged = merge(list)
      o.strips.set(d.key, merged, { live: false })
      const index = keep ? merged.findIndex((r) => r[0] <= keep[0] && r[1] >= keep[1]) : -1
      state.sel = index >= 0 ? { key: d.key, index } : null
      redrawTrack(d.key)
      sound.pop && sound.pop()
      o.onSelect && o.onSelect(state.sel)
    } else sound.tap()
    o.onChange && o.onChange()
  }
  // Put a drag back as it was, unsaved: a pinch took over.
  function abandon() {
    const d = state.drag
    state.drag = null
    el.classList.remove('dragging')
    cancelAnimationFrame(scrollRaf)
    if (d.kind === 'day') { dropDay(d, true); return }
    if (d.kind === 'clip') return
    if (d.kind === 'move' && d.orig) for (const [k, list] of d.orig) { o.strips.set(k, list, { live: true }); redrawTrack(k) }
    else if (d.kind === 'paint') { o.strips.set(d.key, d.list.filter((_, i) => i !== d.index), { live: true }); redrawTrack(d.key) }
    else if (d.list) { o.strips.set(d.key, d.list, { live: true }); redrawTrack(d.key) }
    for (const row of rows.children) row.classList.remove('drop')
    select(null)
  }

  const onCancel = (e) => {
    const p = state.pending
    if (p && e.pointerId === p.id) { clearTimeout(p.timer); state.pending = null }
    if (state.drag) end(e)
  }
  addEventListener('pointerup', end)
  addEventListener('pointercancel', onCancel)

  /* ---- Selection and keys ------------------------------------------------------------ */

  function select(sel) {
    const old = state.sel
    state.sel = sel
    if (old && (!sel || old.key !== sel.key)) redrawTrack(old.key)
    if (sel) redrawTrack(sel.key)
    o.onSelect && o.onSelect(sel)
  }

  function removeSelected() {
    const s = state.sel
    if (!s) return
    const list = stripsOf(s.key)
    list.splice(s.index, 1)
    o.strips.set(s.key, list, { live: false })
    state.sel = null
    redrawTrack(s.key)
    sound.remove && sound.remove()
    o.onSelect && o.onSelect(null)
    o.onChange && o.onChange()
  }

  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) {
      e.preventDefault()
      zoomTo(state.ppm * (e.key === '-' ? 1 / 1.6 : 1.6))
      return
    }
    if (state.mode === 'clip' && e.target.closest('.tl-clip')) {
      const c = o.clip.get()
      if (!c) return
      const keys = state.tracks.map((x) => x.key)
      let next = null
      if (e.key === 'ArrowRight') next = o.clip.place(c.key, c.start + (o.keyStep || 15), { dir: 1 })
      else if (e.key === 'ArrowLeft') next = o.clip.place(c.key, c.start - (o.keyStep || 15), { dir: -1 })
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const k = keys[keys.indexOf(c.key) + (e.key === 'ArrowDown' ? 1 : -1)]
        if (k) next = o.clip.place(k, c.start)
      } else if (e.key === 'Enter') { o.onEnter && o.onEnter(); return } else return
      e.preventDefault()
      if (!next) return
      o.clip.set(next)
      redrawTrack(c.key)
      redrawTrack(next.key)
      const clip = lanes.get(next.key).querySelector('.tl-clip')
      clip && clip.focus({ preventScroll: true })
      reveal(next.key, next.start)
      sound.tick && sound.tick()
      o.onLive && o.onLive()
      o.onChange && o.onChange()
      return
    }
    if (state.mode === 'strips' && state.sel && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeSelected() }
    if (state.mode === 'strips' && state.sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      const s = state.sel
      const list = stripsOf(s.key)
      const [lo, hi] = bounds(list, s.index)
      const r = list[s.index]
      const by = e.key === 'ArrowRight' ? 15 : -15
      if (e.shiftKey) r[1] = clamp(r[1] + by, r[0] + 15, hi)
      else { const len = r[1] - r[0]; r[0] = clamp(r[0] + by, lo, hi - len); r[1] = r[0] + len }
      o.strips.set(s.key, list, { live: false })
      redrawTrack(s.key)
      o.onSelect && o.onSelect(state.sel)
      o.onChange && o.onChange()
    }
    if (e.key === 'Escape' && state.sel) select(null)
  })

  /* ---- Scrolling ------------------------------------------------------------------ */

  function reveal(key, minute, { center = false, smooth = true } = {}) {
    const lane = lanes.get(key)
    const x = labelW() + minute * state.ppm
    const view = el.clientWidth - labelW()
    let left = el.scrollLeft
    if (center) left = x - labelW() - view / 2
    else if (x < el.scrollLeft + labelW() + 24) left = x - labelW() - 48
    else if (x > el.scrollLeft + el.clientWidth - 80) left = x - el.clientWidth + 160
    const behavior = smooth && !reduced() ? 'smooth' : 'auto'
    // One call for both axes: a second smooth scroll would cancel the first.
    let top = el.scrollTop
    if (lane) {
      const row = lane.parentNode
      if (row.offsetTop < el.scrollTop + 30 || row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) top = Math.max(0, row.offsetTop - 30 - row.offsetHeight)
    }
    el.scrollTo({ left: Math.max(0, left), top, behavior })
  }

  function scrollToMinute(minute) {
    el.scrollLeft = Math.max(0, minute * state.ppm - 8)
  }

  // A new width can make the kept zoom too far out (or the label column change).
  let lastW = 0
  const sizer = new ResizeObserver(() => {
    if (!el.clientWidth || el.clientWidth === lastW) return
    lastW = el.clientWidth
    layout()
    const [lo, hi] = limits()
    if (state.ppm < lo - 1e-4 || state.ppm > hi + 1e-4) zoomNow(clamp(state.ppm, lo, hi))
    else paintZooms()
  })
  sizer.observe(el)

  redraw()

  return {
    el,
    redraw,
    redrawTrack,
    reveal,
    scrollToMinute,
    removeSelected,
    zoomControl,
    zoomTo,
    get selected() { return state.sel },
    select,
    setTracks(tracks) { state.tracks = tracks; drawRows() },
    setMode(mode) { state.mode = mode; state.sel = null; el.dataset.mode = mode; drawRows() },
    get mode() { return state.mode },
    lane: (key) => lanes.get(key),
    destroy() {
      sizer.disconnect()
      removeEventListener('pointerup', end)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointercancel', onCancel)
      removeEventListener('pointermove', onFinger)
      removeEventListener('pointerup', offFinger)
      removeEventListener('pointercancel', offFinger)
    }
  }
}
