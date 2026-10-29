// QR codes for a tracked link, from the vendored qrcode-generator (MIT,
// web/vendor/qrcode/): an SVG to show and save, and a PNG for anything that
// won't take an SVG. Dark on white with a quiet margin, so every scanner reads it.
import qrcode from '../vendor/qrcode/qrcode.mjs'

function matrix(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return { count: qr.getModuleCount(), dark: (row, col) => qr.isDark(row, col) }
}

// Each row's runs of dark modules become one rectangle, all in one path.
function path(text) {
  const { count, dark } = matrix(text)
  let d = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!dark(row, col)) continue
      let end = col
      while (end + 1 < count && dark(row, end + 1)) end++
      d += `M${col} ${row}h${end - col + 1}v1h${col - end - 1}z`
      col = end
    }
  }
  return { d, count }
}

export function qrSVG(text, margin = 4) {
  const { d, count } = path(text)
  const size = count + margin * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect x="${-margin}" y="${-margin}" width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="#111111"/></svg>`
}

export function qrPNG(text, px = 1200) {
  const { count, dark } = matrix(text)
  const margin = 4
  const cell = Math.floor(px / (count + margin * 2))
  const size = cell * (count + margin * 2)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#111111'
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (dark(row, col)) g.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export function save(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
