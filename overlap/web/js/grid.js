// The availability grid: one column per date, one row per slot.
//
// In "mine" mode you paint: press on a slot and drag a rectangle; it fills if
// the first slot was empty and clears if it was yours. Everyone's heat shows
// faintly underneath. In "all" mode the heat is the point: the more people
// free, the deeper the colour. Keyboard: arrows move, Space toggles.

import { h, personColor } from './ui.js'
import { dayParts, hourLabel } from './time.js'
import * as sound from './sound.js'

export function createGrid(plan, { describe, onPaint, onBlocked }) {
  const rows = (plan.end - plan.start) / plan.step
  const days = plan.days.length
  const cells = []
  let state = { people: [], mine: null, mode: 'all', filter: null, final: null }
  let drag = null
  let focus = null
  let hoverAt = null

  const grid = h('div', {
    class: 'grid mode-all', role: 'grid', tabindex: '0', 'data-step': String(plan.step),
    'aria-label': 'Availability. Use the arrow keys to move and Space to mark a time.',
    vars: { '--days': String(days) }
  })
  const scroller = h('div', { class: 'scroller' }, grid)
  const tip = h('div', { class: 'tip', role: 'tooltip' })
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' })

  grid.append(h('div', { class: 'gh corner' }))
  plan.days.forEach((day, d) => {
    const p = dayParts(day)
    grid.append(h('div', { class: 'gh', role: 'columnheader' },
      h('span', { class: 'dw' }, p.weekday), h('span', { class: 'dn' }, p.day), h('span', { class: 'dm' }, p.month)))
    cells[d] = []
  })
  for (let r = 0; r < rows; r++) {
    const at = plan.start + r * plan.step
    const onHour = at % 60 === 0
    grid.append(h('div', { class: `gl${r ? '' : ' first'}`, 'aria-hidden': 'true' }, onHour ? h('span', {}, hourLabel(at)) : null))
    for (let d = 0; d < days; d++) {
      const c = h('div', { class: `c${onHour && r ? ' hour' : ''}${d === 0 ? ' dayfirst' : ''}`, 'data-d': d, 'data-r': r })
      cells[d][r] = c
      grid.append(c)
    }
  }

  const index = (d, r) => d * rows + r
  const position = el => ({ d: Number(el.dataset.d), r: Number(el.dataset.r) })
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList?.contains('c') && grid.contains(el) ? el : null }
  const mineAt = (d, r) => !!state.mine && state.mine.slots[index(d, r)] === '1'

  function render() {
    const { people, mine, mode, filter, final } = state
    grid.classList.toggle('mode-mine', mode === 'mine')
    grid.classList.toggle('mode-all', mode !== 'mine')
    grid.classList.toggle('filtered', !!filter)
    if (filter) grid.style.setProperty('--pc', personColor(filter.color))
    const total = Math.max(1, people.length)
    for (let d = 0; d < days; d++) {
      for (let r = 0; r < rows; r++) {
        const i = index(d, r)
        let count = 0
        for (const p of people) if (p.slots[i] === '1') count++
        const c = cells[d][r]
        c.style.setProperty('--h', (count / total).toFixed(3))
        c.classList.toggle('full', people.length > 1 && count === people.length)
        c.classList.toggle('mine', !!mine && mine.slots[i] === '1')
        if (filter) c.style.setProperty('--f', filter.slots[i] === '1' ? '1' : '0')
        const inFinal = !!final && final.day === d && r >= final.from && r < final.to
        c.classList.toggle('final', inFinal)
        c.classList.toggle('first', inFinal && r === final.from)
        c.classList.toggle('last', inFinal && r === final.to - 1)
      }
    }
    if (hoverAt) showTip(hoverAt.d, hoverAt.r, hoverAt.x, hoverAt.y)
  }

  // Painting
  function rect(a, b) {
    const set = []
    for (let d = Math.min(a.d, b.d); d <= Math.max(a.d, b.d); d++)
      for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) set.push([d, r])
    return set
  }
  function preview() {
    for (const [d, r] of drag.shown) cells[d][r].classList.remove('add', 'del')
    drag.shown = rect(drag.anchor, drag.current)
    for (const [d, r] of drag.shown) cells[d][r].classList.add(drag.adding ? 'add' : 'del')
  }
  function commit() {
    const slots = state.mine.slots.split('')
    const changed = []
    for (const [d, r] of drag.shown) {
      cells[d][r].classList.remove('add', 'del')
      const i = index(d, r)
      const v = drag.adding ? '1' : '0'
      if (slots[i] !== v) { slots[i] = v; changed.push(i) }
    }
    drag = null
    if (changed.length) onPaint(slots.join(''), changed)
  }

  grid.addEventListener('pointerdown', e => {
    if (e.button > 0) return
    if (!state.mine && e.target.closest?.('.c')) { onBlocked?.(); return }
    if (state.mode !== 'mine' || !state.mine) return
    const c = e.target.closest?.('.c')
    if (!c) return
    e.preventDefault()
    hideTip()
    grid.setPointerCapture(e.pointerId)
    const p = position(c)
    drag = { anchor: p, current: p, adding: !mineAt(p.d, p.r), shown: [], x: e.clientX, y: e.clientY }
    preview()
    sound.paint(p.r, rows, drag.adding)
    autoScroll()
  })
  grid.addEventListener('pointermove', e => {
    if (drag) {
      drag.x = e.clientX; drag.y = e.clientY
      track()
      return
    }
    if (e.pointerType !== 'mouse') return
    const c = cellAt(e.clientX, e.clientY)
    if (!c) return hideTip()
    const p = position(c)
    hoverAt = { ...p, x: e.clientX, y: e.clientY }
    showTip(p.d, p.r, e.clientX, e.clientY)
  })
  grid.addEventListener('pointerleave', () => { if (!drag) hideTip() })
  const end = () => { if (drag) commit() }
  grid.addEventListener('pointerup', end)
  grid.addEventListener('pointercancel', end)
  grid.addEventListener('lostpointercapture', end)

  function track() {
    const c = cellAt(drag.x, drag.y)
    if (!c) return
    const p = position(c)
    if (p.d === drag.current.d && p.r === drag.current.r) return
    drag.current = p
    preview()
    sound.paint(p.r, rows, drag.adding)
  }
  // Scroll while dragging near the scroller's edges, so long days paint in one go.
  function autoScroll() {
    if (!drag) return
    const box = scroller.getBoundingClientRect()
    const edge = 36
    let dx = 0, dy = 0
    if (drag.y > box.bottom - edge) dy = Math.min(18, (drag.y - (box.bottom - edge)) / 2)
    else if (drag.y < box.top + edge + 40) dy = -Math.min(18, ((box.top + edge + 40) - drag.y) / 2)
    if (drag.x > box.right - edge) dx = Math.min(18, (drag.x - (box.right - edge)) / 2)
    else if (drag.x < box.left + edge + 50) dx = -Math.min(18, ((box.left + edge + 50) - drag.x) / 2)
    if (dx || dy) { scroller.scrollBy(dx, dy); track() }
    requestAnimationFrame(autoScroll)
  }

  // Keyboard
  grid.addEventListener('focus', () => { if (!focus) moveFocus({ d: 0, r: 0 }) })
  grid.addEventListener('blur', () => { if (focus) cells[focus.d][focus.r].classList.remove('focus') })
  grid.addEventListener('keydown', e => {
    if (!focus) return
    const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    if (moves[e.key]) {
      e.preventDefault()
      const [dd, dr] = moves[e.key]
      moveFocus({ d: Math.max(0, Math.min(days - 1, focus.d + dd)), r: Math.max(0, Math.min(rows - 1, focus.r + dr)) })
      if (e.shiftKey && state.mode === 'mine' && state.mine && mineAt(focus.d, focus.r) !== keyPaint) toggle(focus)
    } else if ((e.key === ' ' || e.key === 'Enter') && state.mode === 'mine' && state.mine) {
      e.preventDefault()
      keyPaint = !mineAt(focus.d, focus.r)
      toggle(focus)
    }
  })
  let keyPaint = true
  function toggle({ d, r }) {
    const slots = state.mine.slots.split('')
    const i = index(d, r)
    slots[i] = slots[i] === '1' ? '0' : '1'
    sound.paint(r, rows, slots[i] === '1')
    onPaint(slots.join(''), [i])
  }
  function moveFocus(p) {
    if (focus) cells[focus.d][focus.r].classList.remove('focus')
    focus = p
    const c = cells[p.d][p.r]
    c.classList.add('focus')
    c.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const text = describe(p.d, p.r)?.textContent
    if (text) live.textContent = text
  }

  // Tooltip
  function showTip(d, r, x, y) {
    const body = describe(d, r)
    if (!body) return hideTip()
    tip.replaceChildren(body)
    if (!tip.isConnected) document.body.append(tip)
    const w = tip.offsetWidth, ht = tip.offsetHeight
    let left = x + 16, top = y + 18
    if (left + w > innerWidth - 8) left = x - w - 16
    if (top + ht > innerHeight - 8) top = y - ht - 14
    tip.style.left = `${Math.max(8, left)}px`
    tip.style.top = `${Math.max(8, top)}px`
    tip.classList.add('show')
  }
  function hideTip() { hoverAt = null; tip.classList.remove('show') }

  return {
    el: h('div', {}, scroller, live),
    rows,
    update(next) { state = { ...state, ...next }; render() },
    flash(indexes, color) {
      for (const i of indexes) {
        const c = cells[Math.floor(i / rows)]?.[i % rows]
        if (!c) continue
        c.style.setProperty('--pc', color)
        c.classList.remove('flash')
        void c.offsetWidth
        c.classList.add('flash')
        setTimeout(() => c.classList.remove('flash'), 950)
      }
    },
    pulse(run) {
      const first = cells[run.day]?.[run.from]
      if (!first) return
      first.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      for (let r = run.from; r < run.to; r++) {
        const c = cells[run.day][r]
        c.classList.remove('pulse')
        void c.offsetWidth
        c.classList.add('pulse')
        setTimeout(() => c.classList.remove('pulse'), 2900)
      }
    },
    destroy() { tip.remove() }
  }
}
