// Sokoban — canvas renderer. Draws the level (floor, goal pads, walls), the
// boxes, and the player. Positions arrive as cell floats so the game loop can
// tween movement; nothing here reads DOM beyond the one canvas.

import { PALETTES, shade, hexToRgba, effectiveDark } from './theme.js'

const GAP = 0.07 // fraction of a cell reserved as the grid gap on each side
const RADIUS = 0.12 // corner radius as a fraction of a cell

export function createRenderer({ field }) {
  const ctx = field.getContext('2d')

  let cell = 32
  let cols = 0
  let rows = 0
  let level = null // { walls, goals, interior, width, height }

  const cfg = {
    paletteId: 'bloom',
    dark: effectiveDark()
  }

  function palette() {
    return PALETTES.find((x) => x.id === cfg.paletteId) || PALETTES[0]
  }

  function setConfig(patch) {
    Object.assign(cfg, patch)
    cfg.dark = effectiveDark()
  }

  // Precomputes the interior (floor flood-filled from the player start) so
  // ragged rows outside the walls stay blank and the level reads as a shape.
  function setLevel(game) {
    const interior = new Set()
    const stack = [game.player]
    interior.add(game.player)
    while (stack.length) {
      const k = stack.pop()
      const x = k % game.width
      const y = (k - x) / game.width
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= game.width || ny >= game.height) continue
        const nk = ny * game.width + nx
        if (game.walls.has(nk) || interior.has(nk)) continue
        interior.add(nk)
        stack.push(nk)
      }
    }
    level = { walls: game.walls, goals: game.goals, interior, width: game.width, height: game.height }
    cols = game.width
    rows = game.height
  }

  function resize(cellPx) {
    cell = cellPx
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    field.width = Math.round(cols * cell * dpr)
    field.height = Math.round(rows * cell * dpr)
    field.style.width = cols * cell + 'px'
    field.style.height = rows * cell + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  function tile(cx, cy, color, scale = 1, gap = GAP) {
    const s = cell * scale
    const inset = s * gap
    const x = cx * cell + (cell - s) / 2 + inset
    const y = cy * cell + (cell - s) / 2 + inset
    const w = s - inset * 2
    ctx.save()
    roundRect(x, y, w, w, w * RADIUS)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = Math.max(1, s * 0.045)
    ctx.strokeStyle = hexToRgba(shade(color, cfg.dark ? -0.4 : -0.22), cfg.dark ? 0.5 : 0.3)
    roundRect(x, y, w, w, w * RADIUS)
    ctx.stroke()
    ctx.restore()
  }

  function wallNearInterior(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        if (level.interior.has(ny * cols + nx)) return true
      }
    }
    return false
  }

  // view: { boxes: [{x, y, onGoal, pop}], player: {x, y}, facing }
  function draw(view) {
    if (!level) return
    const p = palette()
    ctx.clearRect(0, 0, cols * cell, rows * cell)

    // floor + goal pads + walls
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x
        if (level.walls.has(k)) {
          // chunky near-solid tiles so structure reads clearly against floor
          if (wallNearInterior(x, y)) tile(x, y, cfg.dark ? '#31313e' : '#bcb8cc', 1, 0.025)
          continue
        }
        if (!level.interior.has(k)) continue
        // floor pad — visibly lighter than walls, darker than the void
        ctx.save()
        ctx.fillStyle = cfg.dark ? 'rgba(255,255,255,0.05)' : 'rgba(20,18,40,0.05)'
        roundRect(x * cell + cell * GAP, y * cell + cell * GAP, cell - cell * GAP * 2, cell - cell * GAP * 2, cell * RADIUS)
        ctx.fill()
        ctx.restore()
        if (level.goals.has(k)) {
          // goal pad: soft accent ring
          ctx.save()
          ctx.lineWidth = Math.max(1.5, cell * 0.08)
          ctx.strokeStyle = hexToRgba(p.accent, cfg.dark ? 0.55 : 0.5)
          ctx.beginPath()
          ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // boxes
    for (const b of view.boxes) {
      const color = b.onGoal ? p.tiles.boxDone : p.tiles.box
      tile(b.x, b.y, color, b.pop || 1)
      if (b.onGoal) {
        // small settled dot so a done box reads at a glance
        ctx.save()
        ctx.fillStyle = hexToRgba(shade(color, cfg.dark ? -0.45 : -0.3), 0.55)
        ctx.beginPath()
        ctx.arc((b.x + 0.5) * cell, (b.y + 0.5) * cell, cell * 0.09, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // player: soft round body + facing eyes
    const px = (view.player.x + 0.5) * cell
    const py = (view.player.y + 0.5) * cell
    const pr = cell * 0.34
    ctx.save()
    ctx.fillStyle = p.tiles.player
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = Math.max(1, cell * 0.045)
    ctx.strokeStyle = hexToRgba(shade(p.tiles.player, cfg.dark ? -0.4 : -0.22), cfg.dark ? 0.5 : 0.35)
    ctx.stroke()
    // two eyes shifted toward the facing direction, spread perpendicular to it
    const [fx, fy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[view.facing] || [0, 1]
    const cx = px + fx * pr * 0.35
    const cy = py + fy * pr * 0.35
    const spread = pr * 0.38
    ctx.fillStyle = cfg.dark ? 'rgba(16,16,20,0.75)' : 'rgba(28,27,34,0.7)'
    ctx.beginPath()
    ctx.arc(cx - fy * spread, cy + fx * spread, cell * 0.05, 0, Math.PI * 2)
    ctx.arc(cx + fy * spread, cy - fx * spread, cell * 0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  return { setLevel, resize, setConfig, draw, get cols() { return cols }, get rows() { return rows }, get cell() { return cell } }
}
