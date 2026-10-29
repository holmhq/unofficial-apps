// The time strip: each day is a track and time runs left to right, the way a
// video editor lays out clips. Shaded spans show when someone is free; strips
// are spans you paint, trim at either end and slide along; the clip is the
// meeting itself, the length of the event, dropped where you want it.
//
// One component serves three pages: a guest picking or suggesting times, a
// host painting weekly hours, and a host settling a request. Callers keep the
// data; the strip draws it and reports what the pointer did.
//
//   timeline({
//     tracks: [{ key, label, sub, dim, today }],
//     mode: 'clip' | 'strips',
//     layers: (track) => ({ shade, busy, glow }),     minutes of the day, [[a, b]]
//     strips: { get(key), set(key, ranges), kind: 'host' | 'guest', step, min },
//     clip: { get(), place(key, start) },             place() snaps, or returns null
//     now: () => ({ key, minute }) | null,
//     onTap(key, minute), onChange(), onSelect(sel), onLive()
//   })
import { h, fill, haptic, reduced, wide } from './ui.js'
import * as t from './time.js'
import { sound } from './sound.js'

const DAY = 1440
const HOLD = 260

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

function hourLabel(hh) {
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

export function timeline(o) {
  const state = {
    tracks: o.tracks || [],
    mode: o.mode || 'clip',
    ppm: o.ppm || (wide() ? 1 : 1.15),
    sel: null,
    drag: null
  }
  const labelW = () => (wide() ? 96 : 70)
  const laneW = () => Math.round(DAY * state.ppm)

  const corner = h('div.tl-corner', o.corner || null)
  const scale = h('div.tl-scale')
  const ruler = h('div.tl-ruler', corner, scale)
  const rows = h('div.tl-rows')
  const sheet = h('div.tl-sheet', ruler, rows)
  const el = h('div.tl' + (o.className ? '.' + o.className : ''), { role: 'group', 'aria-label': o.label || 'Times' }, sheet)
  const lanes = new Map()

  /* ---- Drawing ---------------------------------------------------------------- */

  function layout() {
    sheet.style.setProperty('--lane', laneW() + 'px')
    sheet.style.setProperty('--label', labelW() + 'px')
    sheet.style.setProperty('--hour', state.ppm * 60 + 'px')
  }

  function drawScale() {
    const every = state.ppm * 60 >= 52 ? 1 : 2
    const ticks = []
    for (let hh = 0; hh <= 24; hh += every) {
      ticks.push(h('span.tl-tick' + (hh === 0 ? '.first' : hh === 24 ? '.last' : ''), { style: { left: hh * 60 * state.ppm + 'px' } }, hh < 24 ? hourLabel(hh) : ''))
    }
    fill(scale, ticks)
  }

  function drawRows() {
    lanes.clear()
    fill(rows, state.tracks.map((track) => {
      const lane = h('div.tl-lane', { 'data-key': track.key, tabindex: '-1' })
      lanes.set(track.key, lane)
      drawLane(track, lane)
      return h('div.tl-row' + (track.dim ? '.dim' : '') + (track.today ? '.today' : ''), { 'data-key': track.key },
        h('div.tl-label', h('b', track.label), track.sub ? h('small', track.sub) : null),
        lane)
    }))
  }

  const px = (min) => min * state.ppm + 'px'
  const box = (cls, a, b, kids = []) => h(cls, { style: { left: px(a), width: px(Math.max(b - a, 1)) } }, kids)

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
      o.strips.get(track.key).forEach(([a, b], i) => {
        const on = state.sel && state.sel.key === track.key && state.sel.index === i
        const editable = state.mode === 'strips' && o.strips.editable !== false
        const strip = box(`div.tl-strip.${kind}` + (on ? '.sel' : '') + (editable ? '.edit' : ''), a, b,
          editable ? [h('span.tl-handle.l', { 'data-part': 'handle-l', 'aria-hidden': 'true' }), h('span.tl-handle.r', { 'data-part': 'handle-r', 'aria-hidden': 'true' })] : [])
        strip.dataset.part = 'strip'
        strip.dataset.index = String(i)
        // Where the glow covers a strip, the glow speaks for it.
        if (!(l.glow || []).some(([g, z]) => g < b && z > a)) strip.append(h('span.tl-text', label(a, b, kind)))
        kids.push(strip)
      })
    }
    for (const [a, b] of l.glow || []) kids.push(box('div.tl-glow', a, b, (b - a) * state.ppm > 76 ? [h('span.tl-text', o.glowLabel || 'Both free')] : []))
    const c = o.clip && o.clip.get()
    if (c && c.key === track.key && state.mode === 'clip') {
      const narrow = (c.end - c.start) * state.ppm < 66
      const clip = box('div.tl-clip.' + (c.mode || 'open') + (narrow ? '.narrow' : ''), c.start, c.end, narrow ? [h('span.tl-flag', short(c.start))] : [h('span.tl-text', clipLabel(c))])
      clip.dataset.part = 'clip'
      clip.tabIndex = 0
      clip.setAttribute('role', 'slider')
      clip.setAttribute('aria-label', o.clipAria ? o.clipAria(c) : span(c.start, c.end))
      clip.setAttribute('aria-valuetext', span(c.start, c.end))
      kids.push(clip)
    }
    if (now && now.key === track.key) kids.push(h('div.tl-now', { style: { left: px(now.minute) } }))
    fill(lane, kids)
  }

  function label(a, b, kind) {
    const w = (b - a) * state.ppm
    if (o.stripLabel) return o.stripLabel(a, b, kind, w)
    return w > 150 ? span(a, b) : w > 84 ? `${short(a)}–${short(b)}` : w > 44 ? short(a) : ''
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

  /* ---- Pointer ------------------------------------------------------------------- */

  const minuteAt = (lane, x) => (x - lane.getBoundingClientRect().left) / state.ppm
  const snap = (m, step = (o.strips && o.strips.step) || 15) => Math.round(m / step) * step
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

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
    const lane = e.target.closest('.tl-lane')
    if (!lane) return
    const key = lane.dataset.key
    const at = minuteAt(lane, e.clientX)
    const partEl = e.target.closest('[data-part]')
    const part = partEl && partEl.dataset.part
    const touch = e.pointerType === 'touch'
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
      begin({ kind: 'move', key: p.key, index: p.index, list: p.list, grab: p.grab }, { target: el, pointerId: p.id })
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
    if (!state.drag) return
    e.preventDefault()
    moveTo(e.clientX, e.clientY)
    edgeScroll(e.clientX)
  }
  addEventListener('pointermove', onMove, { passive: false })

  // While something is being dragged, a finger mustn't scroll the page.
  el.addEventListener('touchmove', (e) => { if (state.drag) e.preventDefault() }, { passive: false })

  function moveTo(x, y) {
    const d = state.drag
    if (!d) return
    d.x = x
    d.y = y
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

  function end(e) {
    const p = state.pending
    if (p && e.pointerId === p.id) {
      clearTimeout(p.timer)
      state.pending = null
      if (p.held) return
      // A tap.
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
    if (d.kind !== 'clip') {
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

  const onResize = () => {
    const ppm = o.ppm || (wide() ? 1 : 1.15)
    if (ppm === state.ppm) return
    const mid = (el.scrollLeft + (el.clientWidth - labelW()) / 2) / state.ppm
    state.ppm = ppm
    redraw()
    el.scrollLeft = Math.max(0, mid * ppm - (el.clientWidth - labelW()) / 2)
  }
  addEventListener('resize', onResize)

  redraw()

  return {
    el,
    redraw,
    redrawTrack,
    reveal,
    scrollToMinute,
    removeSelected,
    get selected() { return state.sel },
    select,
    setTracks(tracks) { state.tracks = tracks; drawRows() },
    setMode(mode) { state.mode = mode; state.sel = null; el.dataset.mode = mode; drawRows() },
    get mode() { return state.mode },
    lane: (key) => lanes.get(key),
    destroy() {
      removeEventListener('resize', onResize)
      removeEventListener('pointerup', end)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointercancel', onCancel)
    }
  }
}
