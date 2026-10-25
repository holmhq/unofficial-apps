// The tool rail at the top left and the panel beside it: four ways to make
// a shape (draw, text, SVG code, a file) and the member's saved shapes.

import { h, isPhone } from './ui.js'
import { icon } from './icons.js'
import { state, setDesign, on } from './state.js'
import { FONTS } from './fonts.js'
import { GRID, emptyPixels } from './pixels.js'
import { shapesPanel } from './shapes.js'

const SOURCES = [
  { id: 'draw', icon: 'pencil', label: 'Draw' },
  { id: 'text', icon: 'type', label: 'Text' },
  { id: 'code', icon: 'code', label: 'SVG code' },
  { id: 'file', icon: 'file-up', label: 'Upload file' }
]

const STAR = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="black"/></svg>'

export function createTools(root) {
  let panel = state.design.tab // which panel the rail shows
  let expanded = !isPhone()

  const buttons = {}
  const rail = h('nav', { class: 'rail glass', 'aria-label': 'Make a shape' })
  const addButton = (id, iconName, label) => {
    const b = h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label }, icon(iconName, 18))
    b.addEventListener('click', () => select(id))
    buttons[id] = b
    rail.append(b)
  }
  SOURCES.forEach(s => addButton(s.id, s.icon, s.label))
  rail.append(h('hr'))
  addButton('shapes', 'folder-open', 'My shapes')

  const views = {
    draw: drawView(),
    text: textView(),
    code: codeView(),
    file: fileView(),
    shapes: shapesPanel({ onOpen: () => { if (isPhone()) setExpanded(false) } })
  }
  const box = h('div', { class: 'tool-panel glass' }, Object.values(views).map(v => v.el))
  root.append(rail, box)

  function paint() {
    box.classList.toggle('closed', !expanded)
    box.setAttribute('aria-hidden', String(!expanded))
    box.inert = !expanded
    for (const [id, b] of Object.entries(buttons)) {
      const isSource = id !== 'shapes'
      b.classList.toggle('active', id === panel && expanded)
      b.classList.toggle('selected', isSource && id === state.design.tab && !(id === panel && expanded))
      b.setAttribute('aria-pressed', String(id === panel && expanded))
    }
    for (const [id, v] of Object.entries(views)) {
      v.el.hidden = id !== panel
      if (id === panel && expanded) v.shown?.()
    }
  }

  function setExpanded(value) { expanded = value; paint() }

  function select(id) {
    if (id === panel && expanded) return setExpanded(false)
    panel = id
    expanded = true
    if (id !== 'shapes' && id !== state.design.tab) setDesign({ tab: id })
    paint()
  }

  // A click or tap outside the rail and panel folds the panel away.
  document.addEventListener('pointerdown', e => {
    if (!expanded || root.contains(e.target) || e.target.closest?.('.overlay, .popover')) return
    setExpanded(false)
  })

  on('design', patch => { if (!patch || 'tab' in patch) paint() })
  on('replaced', () => { Object.values(views).forEach(v => v.sync?.()); if (panel !== 'shapes') panel = state.design.tab; paint() })
  paint()

  return {
    // Shows a panel, as when a file is dropped on the page.
    show(id) { panel = id; expanded = true; paint() },
    hide: () => setExpanded(false)
  }
}

// ── Draw: a 16 × 16 pixel grid ──

function drawView() {
  let tool = 'draw'
  const cells = []
  const grid = h('div', { class: 'pixel-grid', role: 'grid', 'aria-label': 'Pixel grid, 16 by 16' })
  for (let i = 0; i < GRID * GRID; i++) cells.push(grid.appendChild(h('span')))
  const sync = () => {
    const p = state.design.pixels
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', p[i] === '1')
  }

  const toolBtn = (id, iconName, label) => h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: () => { tool = id; paintTools() } }, icon(iconName, 14))
  const pen = toolBtn('draw', 'paintbrush', 'Draw')
  const eraser = toolBtn('erase', 'eraser', 'Erase')
  const clear = h('button', { class: 'icon-btn', type: 'button', title: 'Clear', 'aria-label': 'Clear', onclick: () => setDesign({ pixels: emptyPixels() }) }, icon('rotate-ccw', 14))
  const paintTools = () => {
    pen.classList.toggle('active', tool === 'draw')
    eraser.classList.toggle('active', tool === 'erase')
    pen.setAttribute('aria-pressed', String(tool === 'draw'))
    eraser.setAttribute('aria-pressed', String(tool === 'erase'))
  }
  paintTools()

  // One drag paints every cell it crosses; the stage updates as it goes.
  let painting = false
  const cellAt = e => {
    const r = grid.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * GRID)
    const y = Math.floor(((e.clientY - r.top) / r.height) * GRID)
    return x >= 0 && x < GRID && y >= 0 && y < GRID ? y * GRID + x : -1
  }
  const paintCell = i => {
    if (i < 0) return
    const v = tool === 'draw' ? '1' : '0'
    const p = state.design.pixels
    if (p[i] === v) return
    setDesign({ pixels: p.slice(0, i) + v + p.slice(i + 1) })
  }
  grid.addEventListener('pointerdown', e => {
    e.preventDefault()
    painting = true
    paintCell(cellAt(e))
    try { grid.setPointerCapture(e.pointerId) } catch {}
  })
  grid.addEventListener('pointermove', e => { if (painting) paintCell(cellAt(e)) })
  const stop = () => { painting = false }
  grid.addEventListener('pointerup', stop)
  grid.addEventListener('pointercancel', stop)

  on('design', patch => { if (!patch || 'pixels' in patch) sync() })
  sync()
  const el = h('div', { class: 'stack' }, h('div', { class: 'pixel-tools' }, pen, eraser, clear), grid)
  return { el, sync }
}

// ── Text in one of ten fonts ──

function textView() {
  const input = h('input', { class: 'field', type: 'text', placeholder: 'Type something…', maxlength: 60, 'aria-label': 'Text' })
  const font = h('select', { class: 'select', 'aria-label': 'Font' }, FONTS.map(f => h('option', { value: f.name }, f.name)))
  const hint = h('p', { class: 'hint pulse', hidden: true }, 'Loading font…')
  input.addEventListener('input', () => setDesign({ text: input.value }))
  font.addEventListener('change', () => setDesign({ font: font.value }))
  on('font', loading => { hint.hidden = !loading })
  const sync = () => {
    if (input.value !== state.design.text) input.value = state.design.text
    font.value = state.design.font
  }
  sync()
  return {
    el: h('div', { class: 'stack' }, input, font, hint),
    sync,
    shown: () => { if (!isPhone()) setTimeout(() => input.focus({ preventScroll: true }), 0) }
  }
}

// ── SVG markup typed or pasted ──

function codeView() {
  const area = h('textarea', {
    class: 'code-area', spellcheck: 'false', 'aria-label': 'SVG code',
    placeholder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <path d="..." fill="black"/>\n</svg>'
  })
  const example = h('button', { class: 'btn small block', type: 'button', onclick: () => setDesign({ code: STAR }) }, 'Load example (star)')
  area.addEventListener('input', () => setDesign({ code: area.value }))
  const sync = () => {
    if (area.value !== state.design.code) area.value = state.design.code
    example.hidden = !!state.design.code
  }
  on('design', patch => { if (patch && 'code' in patch) sync() })
  sync()
  return { el: h('div', { class: 'stack' }, area, example), sync }
}

// ── An SVG file from the device ──

export async function readSvgFile(file) {
  if (!file) return null
  if (!(file.type === 'image/svg+xml' || /\.svg$/i.test(file.name))) return { error: 'Choose an SVG file.' }
  if (file.size > 2_000_000) return { error: 'That SVG is larger than 2 MB.' }
  return { name: file.name, svg: await file.text() }
}

function fileView() {
  const input = h('input', { type: 'file', accept: '.svg,image/svg+xml', hidden: true })
  const body = h('div', { class: 'stack' })
  input.addEventListener('change', async () => {
    const got = await readSvgFile(input.files[0])
    input.value = ''
    if (got?.error) { problem.textContent = got.error; problem.hidden = false; return }
    if (got) setDesign({ file: got, tab: 'file' })
  })
  const problem = h('p', { class: 'hint', hidden: true })
  const sync = () => {
    const f = state.design.file
    problem.hidden = true
    if (!f) {
      body.replaceChildren(h('div', { class: 'drop-box' },
        icon('upload', 28),
        h('p', { class: 'hint' }, 'Upload an SVG file, or drop one anywhere on the page.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, 'Choose file')), problem)
      return
    }
    // The preview is an <img> of a data URL, so scripts inside an SVG
    // never run on this page.
    body.replaceChildren(
      h('img', { class: 'file-preview', src: `data:image/svg+xml;utf8,${encodeURIComponent(f.svg)}`, alt: f.name }),
      h('div', { class: 'file-row' }, icon('file-check', 18), h('span', { class: 'grow' }, f.name),
        h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Remove file', title: 'Remove', onclick: () => setDesign({ file: null }) }, icon('x', 14))),
      problem)
  }
  on('design', patch => { if (patch && 'file' in patch) sync() })
  sync()
  return { el: h('div', {}, body, input), sync }
}
