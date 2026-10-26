// Snake — canvas renderer. Draws the field (a faint grid of dots), the berry
// and the bloom, and the snake as one soft line from head to tail that
// narrows towards the tail. The snake is drawn where the game has it, a
// whole cell at a time. Where it crosses an edge it is drawn on both sides,
// so it steps off one edge and back on at the other.

import { COLS, ROWS } from './rules.js'
import { PALETTES, hexToRgb, rgbToHex, hexToRgba, effectiveDark } from './theme.js'

const POP_MS = 420

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t) => Math.max(0, Math.min(1, t))

function mix(a, b, t) {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t)
}

export function createRenderer({ field }) {
  const ctx = field.getContext('2d')
  let cell = 24
  const cfg = { paletteId: 'coral', dark: effectiveDark() }

  let pops = []     // { cell, color, start }

  function resize(px) {
    cell = px
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    field.width = Math.round(COLS * cell * dpr)
    field.height = Math.round(ROWS * cell * dpr)
    field.style.width = COLS * cell + 'px'
    field.style.height = ROWS * cell + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function setConfig(patch) {
    Object.assign(cfg, patch)
    cfg.dark = effectiveDark()
  }

  function palette() {
    return PALETTES.find((x) => x.id === cfg.paletteId) || PALETTES[0]
  }

  // A soft ring where something was eaten.
  function pop(at, kind) {
    if (reduceMotion.matches) return
    const p = palette()
    pops.push({ cell: at, color: kind === 'bloom' ? p.bloom : p.berry, start: performance.now() })
  }

  function busy() {
    return pops.length > 0
  }

  const cx = (c) => (c % COLS) + 0.5
  const cy = (c) => Math.floor(c / COLS) + 0.5

  function background() {
    ctx.clearRect(0, 0, COLS * cell, ROWS * cell)
    ctx.fillStyle = cfg.dark ? 'rgba(255, 225, 230, 0.07)' : 'rgba(90, 30, 45, 0.09)'
    const r = Math.max(1, cell * 0.05)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.beginPath()
        ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Calls fn(dx, dy) for each copy of a shape near (x, y) that the wrapping
  // edges make visible, in cells.
  function copies(x, y, reach, fn) {
    const xs = [0]
    const ys = [0]
    if (x - reach < 0) xs.push(COLS)
    if (x + reach > COLS) xs.push(-COLS)
    if (y - reach < 0) ys.push(ROWS)
    if (y + reach > ROWS) ys.push(-ROWS)
    for (const ox of xs) for (const oy of ys) fn(ox, oy)
  }

  function berry(at, now, color) {
    const x = cx(at)
    const y = cy(at)
    const breathe = reduceMotion.matches ? 1 : 1 + 0.06 * Math.sin(now / 420)
    const r = cell * 0.31 * breathe
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x * cell, y * cell + cell * 0.04, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.beginPath()
    ctx.arc(x * cell - r * 0.35, y * cell - r * 0.25, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
    // a small leaf
    ctx.fillStyle = cfg.dark ? '#8fb08a' : '#7f9f74'
    ctx.beginPath()
    ctx.ellipse(x * cell + r * 0.45, y * cell - r * 1.05, r * 0.45, r * 0.2, -0.6, 0, Math.PI * 2)
    ctx.fill()
  }

  function bloom(at, left, now, color) {
    const x = cx(at) * cell
    const y = cy(at) * cell
    const spin = reduceMotion.matches ? 0 : now / 2400
    ctx.fillStyle = color
    for (let i = 0; i < 5; i++) {
      const a = spin + (i * Math.PI * 2) / 5
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(a) * cell * 0.17, y + Math.sin(a) * cell * 0.17, cell * 0.15, cell * 0.1, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = cfg.dark ? '#f6e3a8' : '#fff4cf'
    ctx.beginPath()
    ctx.arc(x, y, cell * 0.09, 0, Math.PI * 2)
    ctx.fill()
    // how long it will stay
    ctx.strokeStyle = hexToRgba(color, 0.55)
    ctx.lineWidth = Math.max(1.2, cell * 0.05)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x, y, cell * 0.44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(left / 40))
    ctx.stroke()
  }

  function draw(game, now = performance.now()) {
    const p = palette()
    background()
    if (game.food >= 0) berry(game.food, now, p.berry)
    if (game.bloom >= 0) bloom(game.bloom, game.bloomLeft, now, p.bloom)

    // The snake's points, head first, in cells. Each is placed next to the
    // one before it, so a line never jumps across the field at an edge.
    const cells = game.cells()
    const pts = []
    const near = (x, prev, size) => {
      let v = x
      while (v - prev > 1.5) v -= size
      while (prev - v > 1.5) v += size
      return v
    }
    let px = cx(cells[0])
    let py = cy(cells[0])
    pts.push([px, py])
    for (let i = 1; i < cells.length; i++) {
      px = near(cx(cells[i]), px, COLS)
      py = near(cy(cells[i]), py, ROWS)
      pts.push([px, py])
    }
    // The way the head faces, one cell from the cell behind it.
    const dx = pts.length > 1 ? pts[0][0] - pts[1][0] : 1
    const dy = pts.length > 1 ? pts[0][1] - pts[1][1] : 0

    const [head, tail] = p.snake
    const n = pts.length
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (game.over && !game.won) ctx.globalAlpha = 0.55
    for (let i = n - 1; i > 0; i--) {
      const t = (i - 0.5) / Math.max(1, n - 1)
      ctx.strokeStyle = mix(head, tail, t)
      ctx.lineWidth = cell * (0.62 - 0.2 * t)
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i - 1]
      copies(Math.min(ax, bx), Math.min(ay, by), 1.5 + Math.abs(ax - bx) + Math.abs(ay - by), (ox, oy) => {
        ctx.beginPath()
        ctx.moveTo((ax + ox) * cell, (ay + oy) * cell)
        ctx.lineTo((bx + ox) * cell, (by + oy) * cell)
        ctx.stroke()
      })
    }
    // the head, with eyes looking the way it goes
    const [hx, hy] = pts[0]
    copies(hx, hy, 0.6, (ox, oy) => {
      const x = (hx + ox) * cell
      const y = (hy + oy) * cell
      ctx.fillStyle = head
      ctx.beginPath()
      ctx.arc(x, y, cell * 0.36, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = cfg.dark ? '#1b1214' : '#2c1a1f'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(x + (dx * 0.12 - dy * 0.17 * side) * cell, y + (dy * 0.12 + dx * 0.17 * side) * cell, cell * 0.065, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    ctx.restore()

    // where it ran into itself
    if (game.over && game.crash >= 0) {
      ctx.strokeStyle = hexToRgba(head, 0.8)
      ctx.lineWidth = Math.max(1.5, cell * 0.08)
      ctx.beginPath()
      ctx.arc(cx(game.crash) * cell, cy(game.crash) * cell, cell * 0.46, 0, Math.PI * 2)
      ctx.stroke()
    }

    pops = pops.filter((o) => now - o.start < POP_MS)
    for (const o of pops) {
      const t = (now - o.start) / POP_MS
      ctx.strokeStyle = hexToRgba(o.color, 0.5 * (1 - t))
      ctx.lineWidth = Math.max(1.2, cell * 0.07 * (1 - t))
      ctx.beginPath()
      ctx.arc(cx(o.cell) * cell, cy(o.cell) * cell, cell * (0.3 + 0.55 * easeOut(t)), 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Before the first game: the empty field.
  function drawEmpty() {
    background()
  }

  return { resize, setConfig, draw, drawEmpty, pop, busy, get cell() { return cell } }
}
