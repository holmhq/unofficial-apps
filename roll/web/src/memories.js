// "On this day": a card for each earlier year with photos from today's date, which plays
// as a story: each photo for a few seconds with a slow drift, bars along the top, a tap on
// either side to move, holding to pause and a pull down to close.

import { h, ic, reduced, haptic } from './ui.js'
import { photoURL } from './store.js'
import { placeholder } from './grid.js'
import { yearsAgo, range, clock } from './time.js'

const SECONDS = 4.6

export function memoryStrip(list, { onOpen }) {
  const row = h('div.mem-row', { role: 'list' })
  for (const m of list) {
    const ph = placeholder(m.cover.th)
    const img = h('img', { src: photoURL(m.cover, 'p'), alt: '', decoding: 'async', loading: 'lazy', draggable: 'false' })
    img.onload = () => img.classList.add('is-in')
    const card = h('button.mem-card', { type: 'button', role: 'listitem', style: ph ? { 'background-image': `url(${ph})` } : {}, 'aria-label': `${yearsAgo(m.years)}, ${m.photos.length} photos`, onclick: () => onOpen(m, card) },
      img, h('span.mem-shade'), h('span.mem-text', h('b', yearsAgo(m.years)), h('small', m.place || String(m.year))))
    row.append(card)
  }
  return h('section.mem', { 'aria-label': 'On this day' }, h('div.mem-head', h('h2', 'On this day')), h('div.mem-scroll', row))
}

export function playMemory(m, from) {
  const photos = m.photos
  let i = 0
  let paused = false
  let started = 0
  let elapsed = 0
  let frame = 0
  const bars = h('div.story-bars', photos.map(() => h('span', h('i'))))
  const stage = h('div.story-stage')
  const title = h('div.story-title', h('b', yearsAgo(m.years)), h('small', [m.place, range(photos[0].taken, photos[photos.length - 1].taken)].filter(Boolean).join(' · ')))
  const closeBtn = h('button.story-x', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, ic('x', 22, 2.2))
  const pauseBtn = h('button.story-x', { type: 'button', 'aria-label': 'Pause', onclick: () => toggle() }, ic('pause', 20, 2.2))
  const root = h('div.story', { role: 'dialog', 'aria-modal': 'true', 'aria-label': yearsAgo(m.years) },
    stage, h('div.story-top', bars, h('div.story-head', title, pauseBtn, closeBtn)))
  document.body.append(root)
  document.documentElement.classList.add('is-viewing')
  const slides = []

  function show(k) {
    i = k
    for (const [n, bar] of [...bars.children].entries()) bar.classList.toggle('is-done', n < i)
    const p = photos[i]
    const ph = placeholder(p.th)
    const img = h('img', { src: photoURL(p, 'p'), alt: '', decoding: 'async', draggable: 'false' })
    const caption = h('div.story-cap', clock(p.taken))
    const slide = h('div.story-slide' + (p.w > p.h * 1.1 ? '.is-wide' : ''), { style: ph ? { 'background-image': `url(${ph})` } : {} }, img, caption)
    const dir = i % 2 ? -1 : 1
    slide.style.setProperty('--from', dir > 0 ? '25%' : '75%')
    slide.style.setProperty('--to', dir > 0 ? '75%' : '25%')
    slide.style.setProperty('--dx', dir * 2 + '%')
    slide.style.setProperty('--dur', SECONDS + 1 + 's')
    stage.append(slide)
    slides.push(slide)
    requestAnimationFrame(() => slide.classList.add('is-on'))
    while (slides.length > 2) slides.shift().remove()
    elapsed = 0
    started = performance.now()
    const next = photos[i + 1]
    if (next) { const pre = new Image(); pre.src = photoURL(next, 'p') }
  }

  function tick(now) {
    frame = requestAnimationFrame(tick)
    if (paused) return
    const t = elapsed + (now - started) / 1000
    const bar = bars.children[i] && bars.children[i].firstChild
    if (bar) bar.style.transform = `scaleX(${Math.min(1, t / SECONDS)})`
    if (t >= SECONDS) step(1)
  }

  function step(d) {
    const bar = bars.children[i] && bars.children[i].firstChild
    if (bar) bar.style.transform = d > 0 ? 'scaleX(1)' : 'scaleX(0)'
    const k = i + d
    if (k >= photos.length) return close()
    if (k < 0) { show(0); return }
    show(k)
    haptic(4)
  }

  function toggle(on = !paused) {
    if (on === paused) return
    paused = on
    if (paused) elapsed += (performance.now() - started) / 1000
    else started = performance.now()
    root.classList.toggle('is-paused', paused)
    pauseBtn.replaceChildren(ic(paused ? 'play' : 'pause', 20, 2.2))
  }

  let down = null
  stage.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), hold: setTimeout(() => { down && (down.held = true); toggle(true) }, 220) }
  })
  stage.addEventListener('pointermove', (e) => {
    if (!down) return
    const dy = e.clientY - down.y
    if (dy > 10) { clearTimeout(down.hold); root.style.transform = `translateY(${dy}px) scale(${Math.max(0.85, 1 - dy / 2000)})`; root.style.borderRadius = Math.min(24, dy / 6) + 'px' }
  })
  const up = (e) => {
    if (!down) return
    clearTimeout(down.hold)
    const dy = e.clientY - down.y
    const held = down.held
    down = null
    if (dy > 110) return close()
    root.style.transform = ''
    root.style.borderRadius = ''
    if (held) { toggle(false); return }
    if (Math.abs(dy) > 10) return
    step(e.clientX < innerWidth * 0.33 ? -1 : 1)
  }
  stage.addEventListener('pointerup', up)
  stage.addEventListener('pointercancel', up)

  function onKey(e) {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === ' ') { e.preventDefault(); toggle() }
  }
  document.addEventListener('keydown', onKey)

  function close() {
    cancelAnimationFrame(frame)
    document.removeEventListener('keydown', onKey)
    document.documentElement.classList.remove('is-viewing')
    root.classList.remove('is-open')
    setTimeout(() => root.remove(), reduced() ? 0 : 320)
  }

  if (from && !reduced()) {
    const r = from.getBoundingClientRect()
    root.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`
  }
  show(0)
  requestAnimationFrame(() => root.classList.add('is-open'))
  frame = requestAnimationFrame(tick)
}
