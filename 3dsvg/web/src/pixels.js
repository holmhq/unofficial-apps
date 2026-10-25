// Pixel art becomes SVG. The grid is a string of '0' and '1', row by row.
// Edges between filled and empty cells are traced into closed outlines, so
// a drawing is one clean shape with no inner faces (which glass would show).

export const GRID = 16

// A space invader, centred.
const INVADER = [
  '0000100000010000',
  '0000010000100000',
  '0000111111110000',
  '0001101111011000',
  '0011111111111100',
  '0010111111110100',
  '0010100000010100',
  '0000011001100000'
]

export const defaultPixels = () => '0'.repeat(GRID * 4) + INVADER.join('') + '0'.repeat(GRID * 4)
export const emptyPixels = () => '0'.repeat(GRID * GRID)

export function pixelsToSvg(pixels, grid = GRID) {
  const cell = Math.floor(200 / grid)
  const total = cell * grid
  const filled = (x, y) => x >= 0 && x < grid && y >= 0 && y < grid && pixels[y * grid + x] === '1'
  const edges = []
  for (let y = 0; y <= grid; y++) {
    for (let x = 0; x <= grid; x++) {
      if (filled(x, y - 1) !== filled(x, y)) edges.push({ x1: x * cell, y1: y * cell, x2: (x + 1) * cell, y2: y * cell })
      if (filled(x - 1, y) !== filled(x, y)) edges.push({ x1: x * cell, y1: y * cell, x2: x * cell, y2: (y + 1) * cell })
    }
  }
  if (!edges.length) return ''
  const key = (x, y) => `${x},${y}`
  const at = new Map()
  for (const e of edges) {
    for (const k of [key(e.x1, e.y1), key(e.x2, e.y2)]) {
      if (!at.has(k)) at.set(k, [])
      at.get(k).push(e)
    }
  }
  const used = new Set()
  let d = ''
  for (const first of edges) {
    if (used.has(first)) continue
    const loop = [{ x: first.x1, y: first.y1 }]
    let edge = first, px = first.x1, py = first.y1
    for (;;) {
      used.add(edge)
      const [nx, ny] = edge.x1 === px && edge.y1 === py ? [edge.x2, edge.y2] : [edge.x1, edge.y1]
      loop.push({ x: nx, y: ny })
      if (nx === first.x1 && ny === first.y1 && loop.length > 2) break
      const next = (at.get(key(nx, ny)) || []).find(e => !used.has(e))
      if (!next) break
      edge = next
      px = nx
      py = ny
    }
    if (loop.length > 2) d += `M${loop[0].x},${loop[0].y}` + loop.slice(1).map(p => `L${p.x},${p.y}`).join('') + 'Z '
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}"><path d="${d.trim()}" fill="black" fill-rule="evenodd"/></svg>`
}
