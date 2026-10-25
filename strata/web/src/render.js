// Strata — canvas renderer. Draws the field (faint sediment bands, the
// stack, the ghost and the falling piece) and the small hold and next
// previews. The piece glides between rows instead of jumping, full rows
// dissolve from the middle out, and the stack above them settles down
// smoothly. All of that is drawing only: the game itself moves in whole cells.

import { COLS, ROWS, CLEAR_FRAMES, shapeCells } from './rules.js'
import { PALETTES, shade, hexToRgba, effectiveDark } from './theme.js'

const GAP = 0.07     // fraction of a cell left as the gap on each side
const RADIUS = 0.16  // corner radius as a fraction of a cell
const GLIDE_MS = 30  // how quickly the drawn piece catches up with the real one
const SETTLE_MS = 190
const FLASH_MS = 220
const TRAIL_MS = 260
// Heights of the faint bands behind the field, top to bottom.
const BANDS = [3, 2, 4, 1, 3, 2, 3, 2]

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t) => Math.max(0, Math.min(1, t))

export function createRenderer({ field, hold, next }) {
  const fctx = field.getContext('2d')
  const hctx = hold.getContext('2d')
  const nctx = next.getContext('2d')

  let cell = 24
  let mini = 9
  const cfg = { paletteId: 'sandstone', ghost: true, dark: effectiveDark() }

  // Drawing state that the game never sees.
  let drawn = null      // { serial, row, col }: where the falling piece is drawn
  let last = 0
  let settling = null   // { offsets, start }
  let flashes = []      // { cells, start }
  let trails = []       // { cells, from, type, start }

  function size(canvas, ctx, cols, rows, px) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    canvas.width = Math.round(cols * px * dpr)
    canvas.height = Math.round(rows * px * dpr)
    canvas.style.width = cols * px + 'px'
    canvas.style.height = rows * px + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function resize(fieldCell, miniCell) {
    cell = fieldCell
    mini = miniCell
    size(field, fctx, COLS, ROWS, cell)
    size(hold, hctx, 4, 2, mini)
    size(next, nctx, 4, 2, mini)
  }

  function setConfig(patch) {
    Object.assign(cfg, patch)
    cfg.dark = effectiveDark()
  }

  function tiles() {
    return (PALETTES.find((x) => x.id === cfg.paletteId) || PALETTES[0]).tiles
  }

  /* ---- effects, started by the game's events ---- */

  // After full rows go: each remaining row falls from where it was.
  function settle(rows) {
    if (reduceMotion.matches) return
    const offsets = new Array(ROWS).fill(0)
    for (let r = 0; r < ROWS; r++) {
      if (rows.includes(r)) continue
      const below = rows.filter((x) => x > r).length
      offsets[r + below] = below
    }
    settling = { offsets, start: performance.now() }
  }
  function flash(cells) {
    if (!reduceMotion.matches) flashes.push({ cells, start: performance.now() })
  }
  function trail(cells, from, type) {
    if (!reduceMotion.matches) trails.push({ cells, from, type, start: performance.now() })
  }
  function busy(now) {
    return !!settling || flashes.length > 0 || trails.length > 0 || now - last < 100
  }

  /* ---- shapes ---- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function block(ctx, px, py, s, color, { ghost = false, faded = false, scale = 1, alpha = 1, lift = 0 } = {}) {
    const inset = s * GAP + (s * (1 - scale)) / 2
    const x = px + inset
    const y = py + inset
    const w = s - inset * 2
    if (w <= 0.5) return
    const r = w * RADIUS
    ctx.save()
    ctx.globalAlpha = alpha
    if (ghost) {
      ctx.lineWidth = Math.max(1.5, s * 0.07)
      ctx.strokeStyle = hexToRgba(color, cfg.dark ? 0.5 : 0.55)
      roundRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth, r)
      ctx.stroke()
      ctx.fillStyle = hexToRgba(color, cfg.dark ? 0.08 : 0.12)
      ctx.fill()
      ctx.restore()
      return
    }
    let fill = faded ? shade(color, cfg.dark ? -0.35 : 0.35) : color
    if (lift) fill = shade(fill, lift)
    roundRect(ctx, x, y, w, w, r)
    ctx.fillStyle = fill
    ctx.fill()
    // a soft top light and a faint edge, so neighbours of one colour still read as tiles
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (cfg.dark ? 0.07 : 0.16) + ')'
    ctx.fillRect(x, y, w, w * 0.32)
    ctx.restore()
    ctx.lineWidth = Math.max(1, s * 0.045)
    ctx.strokeStyle = hexToRgba(shade(color, -0.35), cfg.dark ? 0.55 : 0.28)
    ctx.stroke()
    ctx.restore()
  }

  /* ---- the field ---- */

  function background() {
    const w = COLS * cell
    fctx.clearRect(0, 0, w, ROWS * cell)
    // sediment: alternate bands, barely there
    let r = 0
    let i = 0
    fctx.fillStyle = cfg.dark ? 'rgba(255, 228, 186, 0.022)' : 'rgba(120, 84, 30, 0.035)'
    while (r < ROWS) {
      const hgt = BANDS[i % BANDS.length]
      if (i % 2 === 1) fctx.fillRect(0, r * cell, w, Math.min(hgt, ROWS - r) * cell)
      r += hgt
      i++
    }
    // the empty cells
    fctx.fillStyle = cfg.dark ? 'rgba(255, 240, 220, 0.025)' : 'rgba(70, 48, 16, 0.035)'
    const inset = cell * GAP
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        roundRect(fctx, x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2, cell * RADIUS * 0.8)
        fctx.fill()
      }
    }
  }

  function draw(game, now = performance.now()) {
    const t = tiles()
    const dt = last ? Math.min(100, now - last) : 16
    last = now
    background()

    // the stack, settling after a clear
    let offsets = null
    if (settling) {
      const k = clamp01((now - settling.start) / SETTLE_MS)
      if (k >= 1) settling = null
      else offsets = settling.offsets.map((o) => o * (1 - easeOut(k)))
    }
    const clearing = game.phase === 'clearing' ? game.clearing : null
    const k = clearing ? 1 - game.clearTimer / CLEAR_FRAMES : 0
    for (let r = 0; r < ROWS; r++) {
      const y = (r - (offsets ? offsets[r] : 0)) * cell
      const dissolving = clearing && clearing.includes(r)
      for (let c = 0; c < COLS; c++) {
        const type = game.grid[r][c]
        if (!type) continue
        if (dissolving) {
          // from the middle out
          const delay = (Math.abs(c - 4.5) / 4.5) * 0.4
          const p = clamp01((k - delay) / 0.6)
          block(fctx, c * cell, y, cell, t[type], { lift: 0.5 * Math.min(1, k * 3), scale: 1 - 0.35 * p, alpha: 1 - p })
        } else {
          block(fctx, c * cell, y, cell, t[type])
        }
      }
    }
    if (clearing) {
      fctx.save()
      fctx.globalAlpha = 0.5 * (1 - k)
      fctx.fillStyle = cfg.dark ? 'rgba(255, 236, 205, 0.5)' : 'rgba(255, 252, 244, 0.85)'
      for (const r of clearing) fctx.fillRect(0, r * cell + cell * 0.2, COLS * cell, cell * 0.6)
      fctx.restore()
    }

    // a freshly locked piece glows for a moment
    flashes = flashes.filter((f) => now - f.start < FLASH_MS)
    for (const f of flashes) {
      const p = 1 - (now - f.start) / FLASH_MS
      fctx.save()
      fctx.globalAlpha = 0.45 * p
      fctx.fillStyle = cfg.dark ? '#fff4e0' : '#ffffff'
      for (const [r, c] of f.cells) {
        if (r < 0 || !game.grid[r] || !game.grid[r][c]) continue
        const inset = cell * GAP
        roundRect(fctx, c * cell + inset, r * cell + inset, cell - inset * 2, cell - inset * 2, cell * RADIUS)
        fctx.fill()
      }
      fctx.restore()
    }

    // a hard drop leaves a fading trail above where the piece landed
    trails = trails.filter((tr) => now - tr.start < TRAIL_MS)
    for (const tr of trails) {
      const p = 1 - (now - tr.start) / TRAIL_MS
      const tops = new Map()
      for (const [r, c] of tr.cells) if (!tops.has(c) || r < tops.get(c)) tops.set(c, r)
      for (const [c, top] of tops) {
        const y0 = Math.max(0, tr.from) * cell
        const y1 = top * cell
        if (y1 <= y0) continue
        const g = fctx.createLinearGradient(0, y0, 0, y1)
        const color = t[tr.type] || '#ffffff'
        g.addColorStop(0, hexToRgba(color, 0))
        g.addColorStop(1, hexToRgba(color, 0.32 * p))
        fctx.fillStyle = g
        fctx.fillRect(c * cell + cell * 0.18, y0, cell * 0.64, y1 - y0)
      }
    }

    // ghost and falling piece
    const piece = game.piece
    if (piece && game.phase === 'falling') {
      const targetRow = piece.row + game.progress
      if (!drawn || drawn.serial !== game.serial || reduceMotion.matches) {
        drawn = { serial: game.serial, row: targetRow, col: piece.col }
      } else {
        const follow = 1 - Math.exp(-dt / GLIDE_MS)
        drawn.row += (targetRow - drawn.row) * follow
        drawn.col += (piece.col - drawn.col) * follow
        if (Math.abs(targetRow - drawn.row) < 0.01) drawn.row = targetRow
        if (Math.abs(piece.col - drawn.col) < 0.01) drawn.col = piece.col
      }
      const cells = shapeCells(piece.type, piece.rot)
      if (cfg.ghost) {
        const gr = game.ghostRow()
        if (gr > piece.row) for (const [r, c] of cells) {
          if (gr + r >= 0) block(fctx, (piece.col + c) * cell, (gr + r) * cell, cell, t[piece.type], { ghost: true })
        }
      }
      for (const [r, c] of cells) {
        const y = (drawn.row + r) * cell
        if (y <= -cell) continue
        block(fctx, (drawn.col + c) * cell, y, cell, t[piece.type])
      }
    } else {
      drawn = null
    }

    drawPreview(hctx, game.hold, mini, t, !game.canHold)
    drawPreview(nctx, game.next[0], mini, t, false)
  }

  function drawPreview(ctx, type, px, t, faded) {
    ctx.clearRect(0, 0, 4 * px, 2 * px)
    if (!type) return
    const cells = shapeCells(type, 0)
    let minR = 4, maxR = -1, minC = 4, maxC = -1
    for (const [r, c] of cells) {
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    }
    const offX = (4 * px - (maxC - minC + 1) * px) / 2 - minC * px
    const offY = (2 * px - (maxR - minR + 1) * px) / 2 - minR * px
    for (const [r, c] of cells) block(ctx, offX + c * px, offY + r * px, px, t[type], { faded })
  }

  // Before the first game: the empty field.
  function drawEmpty() {
    background()
    hctx.clearRect(0, 0, 4 * mini, 2 * mini)
    nctx.clearRect(0, 0, 4 * mini, 2 * mini)
  }

  return { resize, setConfig, draw, drawEmpty, settle, flash, trail, busy, get cell() { return cell } }
}
