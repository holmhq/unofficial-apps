// The photo viewer. It grows out of the tile you tapped and shrinks back into it, swipes
// between photos, zooms with a pinch, the wheel or a double tap (fetching the original when
// you look closer), and closes when you pull the photo down. Its bar carries the actions;
// the details sit beside the photo on a desk and in a sheet on a phone.

import { h, ic, reduced, haptic, menu, sheet, closeMenus, toast } from './ui.js'
import { heartFill } from './icons.js'
import { lib, photoURL } from './store.js'
import { placeholder } from './grid.js'
import { longDay, clock, zone, bytes, dayLabel } from './time.js'

const EASE = 'cubic-bezier(.32,.72,0,1)'
const isPhone = () => innerWidth < 760

let current = null
export const viewerOpen = () => !!current

// list: the photos in order; index: the one to show; from: the grid it came from (for the
// way in and out); share: a shared album's slug; actions(p) → { favorite, album, trash, … };
// onChange(p): called as the shown photo changes.
export function openViewer({ list, index, from = null, share = null, actions = () => ({}), context = 'library' }) {
  if (current) current.close(true)
  let i = Math.max(0, Math.min(index, list.length - 1))
  let chrome = true
  let info = false
  let zoom = { s: 1, x: 0, y: 0 }
  let busy = false

  const back = h('div.v-back')
  const track = h('div.v-track')
  const stage = h('div.v-stage', track)
  const title = h('div.v-title')
  const actionsBox = h('div.v-actions')
  const top = h('div.v-top', h('button.v-btn', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => close() }, ic(isPhone() ? 'chevronLeft' : 'x', 22, 2)), title, actionsBox)
  const bottom = h('div.v-bottom')
  const prev = h('button.v-nav.is-prev', { type: 'button', 'aria-label': 'Previous photo', onclick: () => go(-1) }, ic('chevronLeft', 26, 2))
  const next = h('button.v-nav.is-next', { type: 'button', 'aria-label': 'Next photo', onclick: () => go(1) }, ic('chevronRight', 26, 2))
  const side = h('aside.v-info', { 'aria-label': 'Details' })
  const root = h('div.viewer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo' }, back, stage, prev, next, top, bottom, side)
  document.body.append(root)
  document.documentElement.classList.add('is-viewing')
  const previous = document.activeElement

  const slides = new Map() // offset (-1, 0, 1) → { el, frame, img, p }

  /* ---- Geometry ----------------------------------------------------------- */

  function area() {
    const W = stage.clientWidth
    const H = stage.clientHeight
    return isPhone() ? { x: 0, y: 0, w: W, h: H } : { x: 72, y: 64, w: W - 144, h: H - 104 }
  }
  function fit(p) {
    const A = area()
    const s = Math.min(A.w / p.w, A.h / p.h, isPhone() ? Infinity : Math.max(1, 1600 / Math.max(p.w, p.h)) * 2)
    const w = Math.round(p.w * s)
    const hh = Math.round(p.h * s)
    return { w, h: hh, x: Math.round(A.x + (A.w - w) / 2), y: Math.round(A.y + (A.h - hh) / 2) }
  }

  function slide(offset) {
    const p = list[i + offset]
    if (!p) return null
    const F = fit(p)
    const img = new Image()
    img.alt = ''
    img.draggable = false
    img.decoding = 'async'
    const frame = h('div.v-frame', { style: { left: F.x + 'px', top: F.y + 'px', width: F.w + 'px', height: F.h + 'px' } }, img)
    const ph = placeholder(p.th)
    if (ph) frame.style.backgroundImage = `url(${ph})`
    img.src = photoURL(p, 't', share)
    const full = new Image()
    full.decoding = 'async'
    full.onload = () => { if (img.isConnected || offset !== 0) img.src = full.src }
    full.src = photoURL(p, 'p', share)
    const el = h('div.v-slide', frame)
    el.style.transform = `translate3d(${offset * 100}%,0,0)`
    track.append(el)
    return { el, frame, img, p, F }
  }

  function build() {
    for (const s of slides.values()) s.el.remove()
    slides.clear()
    for (const o of [-1, 0, 1]) { const s = slide(o); if (s) slides.set(o, s) }
    zoom = { s: 1, x: 0, y: 0 }
    drawChrome()
  }

  function layoutSlides() {
    for (const s of slides.values()) {
      s.F = fit(s.p)
      Object.assign(s.frame.style, { left: s.F.x + 'px', top: s.F.y + 'px', width: s.F.w + 'px', height: s.F.h + 'px' })
    }
    applyZoom(false)
  }

  /* ---- Chrome: the title, actions and details ---------------------------------- */

  function drawChrome() {
    const p = list[i]
    if (!p) return
    title.replaceChildren(h('b.trunc', dayLabel(p.taken) === 'Today' || dayLabel(p.taken) === 'Yesterday' ? dayLabel(p.taken) : longDay(p.taken)),
      h('small.trunc', [p.place && !share ? p.place.split(',')[0] : null, clock(p.taken)].filter(Boolean).join(' · ')))
    const a = actions(p, context)
    const btn = (icon, label, fn, cls = '') => h('button.v-btn' + cls, { type: 'button', 'aria-label': label, title: label, onclick: fn }, typeof icon === 'string' ? ic(icon, 21, 1.9) : icon)
    const list1 = []
    if (a.favorite) list1.push(btn(p.fav ? heartFill(21) : 'heart', p.fav ? 'Remove from Favorites (F)' : 'Add to Favorites (F)', () => a.favorite(p).then(drawChrome), p.fav ? '.is-on' : ''))
    if (a.restore) list1.push(btn('rotateCcw', 'Restore', () => a.restore(p).then(gone)))
    if (!share) list1.push(btn('info', 'Details (I)', () => toggleInfo(), info ? '.is-active' : ''))
    if (a.album) list1.push(btn('bookImage', 'Add to album', (e) => a.album(p, e.currentTarget)))
    if (a.share) list1.push(btn('share', 'Share', () => a.share(p)))
    if (a.download && !a.share) list1.push(btn('download', 'Download', () => a.download(p)))
    const more = a.more ? a.more(p, { gone }) : []
    if (more.length) list1.push(btn('ellipsis', 'More', (e) => menu(e.currentTarget, more, { align: 'end' })))
    if (a.trash) list1.push(btn('trash2', 'Move to Trash (Delete)', () => a.trash(p).then(gone)))
    if (a.destroy) list1.push(btn('trash2', 'Delete for good', () => a.destroy(p).then((ok) => { if (ok) gone() })))
    if (isPhone()) {
      actionsBox.replaceChildren(...(a.album ? [btn('bookImage', 'Add to album', (e) => a.album(p, e.currentTarget))] : []), ...(more.length ? [btn('ellipsis', 'More', (e) => menu(e.currentTarget, more, { align: 'end' }))] : []))
      bottom.replaceChildren(...list1.filter((b) => !/Add to album|More/.test(b.getAttribute('aria-label'))))
    } else {
      actionsBox.replaceChildren(...list1)
      bottom.replaceChildren()
    }
    prev.hidden = i <= 0
    next.hidden = i >= list.length - 1
    if (info) drawInfo()
  }

  function row(icon, main, sub, extra = null) {
    return h('div.v-row', h('span.v-row-ic', ic(icon, 19, 1.8)), h('div.grow', h('b', main), sub ? h('small', sub) : null, extra))
  }

  function details(p) {
    const exp = p.exp || {}
    const parts = [exp.f ? `ƒ/${exp.f}` : null, exp.s ? (exp.s >= 1 ? `${exp.s}s` : `1/${Math.round(1 / exp.s)}`) : null, exp.mm35 || exp.mm ? `${exp.mm35 || Math.round(exp.mm)} mm` : null, exp.iso ? `ISO ${exp.iso}` : null].filter(Boolean)
    const albums = (p.albums || []).map((id) => lib.albums.get(id)).filter(Boolean)
    const mp = (p.w * p.h) / 1e6
    return [
      row('calendar', longDay(p.taken), [clock(p.taken), zone(p.offset)].filter(Boolean).join(' · ')),
      row('image', p.name || 'Photo', [`${p.w.toLocaleString()} × ${p.h.toLocaleString()}`, mp >= 1 ? `${mp.toFixed(mp < 10 ? 1 : 0)} MP` : null, p.orig ? bytes(p.size) : 'full-size copy'].filter(Boolean).join(' · ')),
      p.camera ? row('camera', p.camera, p.lens || null, parts.length ? h('div.v-chips', parts.map((t) => h('span', t))) : null) : null,
      p.gps ? row('mapPin', p.place || 'Location', `${p.gps[0].toFixed(4)}, ${p.gps[1].toFixed(4)}`, h('a.v-map', { href: `https://www.openstreetmap.org/?mlat=${p.gps[0]}&mlon=${p.gps[1]}#map=12/${p.gps[0]}/${p.gps[1]}`, target: '_blank', rel: 'noopener' }, 'Open map', ic('externalLink', 13, 2))) : null,
      albums.length ? row('bookImage', albums.length === 1 ? 'In 1 album' : `In ${albums.length} albums`, null, h('div.v-chips', albums.map((a) => h('span', a.title)))) : null
    ]
  }

  function drawInfo() {
    const p = list[i]
    if (!p) return
    side.replaceChildren(h('div.v-info-head', h('b', 'Details'), h('button.v-btn.is-dim', { type: 'button', 'aria-label': 'Close details', onclick: () => toggleInfo(false) }, ic('x', 18, 2))), h('div.v-info-body', details(p)))
  }

  function toggleInfo(on = !info) {
    if (share) return
    if (isPhone()) {
      if (!on) return
      sheet({ title: 'Details', cancel: null, done: 'Done', body: () => h('div.v-info-body.is-sheet', details(list[i])) })
      return
    }
    info = on
    root.classList.toggle('has-info', info)
    if (info) drawInfo()
    drawChrome()
    requestAnimationFrame(layoutSlides)
    setTimeout(layoutSlides, 380)
  }

  function showChrome(on = !chrome) {
    chrome = on
    root.classList.toggle('is-bare', !chrome)
  }

  /* ---- Moving between photos ----------------------------------------------------- */

  function go(step, { fromDrag = 0 } = {}) {
    const j = i + step
    if (j < 0 || j >= list.length || busy) {
      if (fromDrag) settleTrack()
      return
    }
    busy = true
    resetZoom()
    const duration = reduced() ? 0 : 320
    track.style.transition = `transform ${duration}ms ${EASE}`
    track.style.transform = `translate3d(${-step * 100}%,0,0)`
    setTimeout(() => {
      track.style.transition = 'none'
      track.style.transform = 'none'
      i = j
      const old = slides.get(-step)
      if (old) old.el.remove()
      const mid = slides.get(0)
      const far = slides.get(step)
      slides.clear()
      if (mid) { slides.set(-step, mid); mid.el.style.transform = `translate3d(${-step * 100}%,0,0)` }
      if (far) { slides.set(0, far); far.el.style.transform = 'translate3d(0,0,0)' }
      const s = slide(step)
      if (s) slides.set(step, s)
      zoom = { s: 1, x: 0, y: 0 }
      drawChrome()
      busy = false
    }, duration + 10)
    haptic(5)
  }

  function settleTrack() {
    track.style.transition = `transform 300ms ${EASE}`
    track.style.transform = 'none'
  }

  // The shown photo left the list (to the Trash, out of the album): show the next one.
  function gone() {
    list = list.filter((p, k) => k !== i)
    if (!list.length) return close()
    i = Math.min(i, list.length - 1)
    build()
  }

  /* ---- Zoom and pan ---------------------------------------------------------------- */

  function applyZoom(animate) {
    const s = slides.get(0)
    if (!s) return
    s.frame.style.transition = animate ? `transform 280ms ${EASE}` : 'none'
    s.frame.style.transform = zoom.s === 1 ? '' : `translate3d(${zoom.x}px,${zoom.y}px,0) scale(${zoom.s})`
    root.classList.toggle('is-zoomed', zoom.s > 1.01)
    if (zoom.s > 1.3) sharpen(s)
  }

  function sharpen(s) {
    if (s.sharp || !s.p.orig || share || Math.max(s.p.w, s.p.h) <= 2100 || !/^image\/(jpeg|png|webp|gif|avif)$/.test(s.p.type || '')) return
    s.sharp = true
    const big = new Image()
    big.decoding = 'async'
    big.onload = () => { if (s.img.isConnected) s.img.src = big.src }
    big.src = photoURL(s.p, 'o')
  }

  function clampZoom() {
    const s = slides.get(0)
    if (!s) return
    const A = area()
    const W = s.F.w * zoom.s
    const H = s.F.h * zoom.s
    const maxX = Math.max(0, (W - A.w) / 2 + (s.F.x + s.F.w / 2 - (A.x + A.w / 2)) * 0)
    const maxY = Math.max(0, (H - A.h) / 2)
    const limX = Math.max(maxX, (W - s.F.w) / 2)
    const limY = Math.max(maxY, (H - s.F.h) / 2)
    zoom.x = Math.min(limX, Math.max(-limX, zoom.x))
    zoom.y = Math.min(limY, Math.max(-limY, zoom.y))
  }

  // Zoom to `to` keeping the point (cx, cy) on screen where it is.
  function zoomAt(to, cx, cy, animate = true) {
    const s = slides.get(0)
    if (!s) return
    to = Math.min(8, Math.max(1, to))
    const r = stage.getBoundingClientRect()
    const ox = cx - (r.left + s.F.x + s.F.w / 2)
    const oy = cy - (r.top + s.F.y + s.F.h / 2)
    const k = to / zoom.s
    zoom.x = ox - (ox - zoom.x) * k
    zoom.y = oy - (oy - zoom.y) * k
    zoom.s = to
    if (to === 1) zoom = { s: 1, x: 0, y: 0 }
    clampZoom()
    applyZoom(animate)
  }
  function resetZoom() { if (zoom.s !== 1) { zoom = { s: 1, x: 0, y: 0 }; applyZoom(true) } }

  stage.addEventListener('wheel', (e) => {
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022))
    zoomAt(zoom.s * factor, e.clientX, e.clientY, false)
  }, { passive: false })

  /* ---- Pointers: swipe, pull down, pan, pinch, double tap ------------------------------ */

  const pts = new Map()
  let drag = null
  let pinch = null
  let lastTap = 0
  let tapTimer = 0

  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || busy) return
    stage.setPointerCapture(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: zoom.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
      drag = null
      return
    }
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, zx: zoom.x, zy: zoom.y, dx: 0, dy: 0 }
  })

  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(pinch.s * (d / pinch.d), pinch.cx, pinch.cy, false)
      return
    }
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.dx = dx
    drag.dy = dy
    if (zoom.s > 1.01) {
      zoom.x = drag.zx + dx
      zoom.y = drag.zy + dy
      clampZoom()
      applyZoom(false)
      return
    }
    if (!drag.axis && Math.hypot(dx, dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : dy > 0 ? 'down' : 'up'
    if (drag.axis === 'x') {
      const edge = (dx > 0 && i === 0) || (dx < 0 && i === list.length - 1)
      track.style.transition = 'none'
      track.style.transform = `translate3d(${edge ? dx / 3 : dx}px,0,0)`
    } else if (drag.axis === 'down') {
      const s = slides.get(0)
      if (!s) return
      const k = Math.max(0.6, 1 - dy / 1400)
      s.frame.style.transition = 'none'
      s.frame.style.transform = `translate3d(${dx * 0.6}px,${dy}px,0) scale(${k})`
      back.style.opacity = String(Math.max(0, 1 - dy / 420))
      root.classList.add('is-pulling')
    }
  })

  const end = (e) => {
    if (!pts.has(e.pointerId)) return
    pts.delete(e.pointerId)
    if (pinch) {
      if (pts.size < 2) {
        pinch = null
        if (zoom.s < 1.05) resetZoom()
        const rest = [...pts.values()][0]
        drag = rest ? { x: rest.x, y: rest.y, t: performance.now(), axis: null, zx: zoom.x, zy: zoom.y, dx: 0, dy: 0 } : null
      }
      return
    }
    if (!drag) return
    const d = drag
    drag = null
    const ms = performance.now() - d.t
    if (d.axis === 'x') {
      const v = d.dx / Math.max(1, ms)
      const w = stage.clientWidth
      if (d.dx < -w * 0.18 || v < -0.45) go(1, { fromDrag: 1 })
      else if (d.dx > w * 0.18 || v > 0.45) go(-1, { fromDrag: 1 })
      else settleTrack()
      return
    }
    if (d.axis === 'down') {
      root.classList.remove('is-pulling')
      if (d.dy > 110 || d.dy / Math.max(1, ms) > 0.5) return close()
      const s = slides.get(0)
      if (s) { s.frame.style.transition = `transform 320ms ${EASE}`; s.frame.style.transform = '' }
      back.style.transition = 'opacity 320ms'
      back.style.opacity = ''
      setTimeout(() => { back.style.transition = '' }, 340)
      return
    }
    if (d.axis || Math.hypot(d.dx, d.dy) > 8 || e.type === 'pointercancel') return
    // A tap: twice zooms, once shows or hides the bars (after waiting to see if it's twice).
    const now = performance.now()
    if (now - lastTap < 300) {
      clearTimeout(tapTimer)
      lastTap = 0
      if (zoom.s > 1.01) resetZoom()
      else zoomAt(2.6, e.clientX, e.clientY, true)
      return
    }
    lastTap = now
    if (e.pointerType === 'mouse') return
    tapTimer = setTimeout(() => showChrome(), 280)
  }
  stage.addEventListener('pointerup', end)
  stage.addEventListener('pointercancel', end)
  stage.addEventListener('dblclick', (e) => e.preventDefault())

  /* ---- Keys ------------------------------------------------------------------------------ */

  function onKey(e) {
    if (document.querySelector('.layer') || e.metaKey || e.ctrlKey || e.altKey) return
    const p = list[i]
    const a = actions(p, context)
    if (e.key === 'Escape') { e.preventDefault(); if (zoom.s > 1.01) resetZoom(); else if (info) toggleInfo(false); else close() }
    else if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'i' && !share) toggleInfo()
    else if (e.key === 'f' && a.favorite) a.favorite(p).then(drawChrome)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && a.trash) a.trash(p).then(gone)
    else if (e.key === '+' || e.key === '=') zoomAt(zoom.s * 1.6, innerWidth / 2, innerHeight / 2)
    else if (e.key === '-') zoomAt(zoom.s / 1.6, innerWidth / 2, innerHeight / 2)
    else return
  }
  document.addEventListener('keydown', onKey)
  const onResize = () => layoutSlides()
  addEventListener('resize', onResize)

  /* ---- Opening and closing ------------------------------------------------------------------ */

  function morph(frame, F, rect, forward) {
    const sx = rect.width / F.w
    const sy = rect.height / F.h
    const s = Math.max(sx, sy)
    const r = stage.getBoundingClientRect()
    const dx = rect.left + rect.width / 2 - (r.left + F.x + F.w / 2)
    const dy = rect.top + rect.height / 2 - (r.top + F.y + F.h / 2)
    const cx = ((F.w * s - rect.width) / 2) / s
    const cy = ((F.h * s - rect.height) / 2) / s
    const from = { transform: `translate3d(${dx}px,${dy}px,0) scale(${s})`, clipPath: `inset(${cy}px ${cx}px round ${3 / s}px)` }
    const to = { transform: 'translate3d(0,0,0) scale(1)', clipPath: 'inset(0px 0px round 0px)' }
    return frame.animate(forward ? [from, to] : [{ transform: frame.style.transform || to.transform, clipPath: to.clipPath }, from], { duration: forward ? 380 : 330, easing: EASE, fill: 'forwards' })
  }

  build()
  const origin = from && list[i] ? from.rectOf(list[i].id, { reveal: false }) : null
  requestAnimationFrame(() => {
    root.classList.add('is-open')
    const s = slides.get(0)
    if (origin && s && !reduced()) {
      from.hide(s.p.id, true)
      const anim = morph(s.frame, s.F, origin.rect, true)
      anim.onfinish = () => { anim.cancel(); from.hide(s.p.id, false) }
    }
  })
  haptic(6)

  function close(instant = false) {
    if (!current || current.root !== root) return
    current = null
    closeMenus()
    document.removeEventListener('keydown', onKey)
    removeEventListener('resize', onResize)
    document.documentElement.classList.remove('is-viewing')
    const s = slides.get(0)
    const target = !instant && s && from ? from.rectOf(s.p.id) : null
    root.classList.remove('is-open')
    root.classList.add('is-closing')
    if (target && !reduced()) {
      from.hide(s.p.id, true)
      if (zoom.s !== 1) { zoom = { s: 1, x: 0, y: 0 }; applyZoom(false) }
      const anim = morph(s.frame, s.F, target.rect, false)
      anim.onfinish = () => { from.hide(s.p.id, false); root.remove() }
    } else setTimeout(() => root.remove(), instant ? 0 : 260)
    if (previous && previous.focus && document.contains(previous) && !previous.closest('.grid')) previous.focus({ preventScroll: true })
  }

  current = { root, close, refresh: () => drawChrome(), photo: () => list[i] }
  return current
}

export function closeViewer() { if (current) current.close() }
export function refreshViewer() { if (current) current.refresh() }
