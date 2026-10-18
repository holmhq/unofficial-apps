// QR codes for a project's page, from the vendored qrcode-generator: an SVG
// to put anywhere, and a poster to print and pin up.
import qrcode from '../vendor/qrcode/qrcode.mjs'
import { inkOn } from './lib.js'

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

// Scanners want dark on light: a light project colour falls back to ink.
export const qrColor = color => inkOn(color) === '#ffffff' ? color : '#26233a'

export function qrSVG(text, color = '#000000', margin = 4) {
  const { d, count } = path(text)
  const size = count + margin * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect x="${-margin}" y="${-margin}" width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="${color}"/></svg>`
}

// Shrinks a line of text until it fits the width.
function fit(context, text, weight, family, size, width) {
  while (size > 24) {
    context.font = `${weight} ${size}px ${family}`
    if (context.measureText(text).width <= width) break
    size -= 4
  }
  return size
}

// A 3:4 card: the project's name on its colour, the code, and the address.
export async function poster(text, { name, color }) {
  try { await Promise.all([document.fonts.load('700 80px Bricolage'), document.fonts.load('400 32px "Fragment Mono"')]) } catch {}
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1600
  const c = canvas.getContext('2d')
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, 1200, 1600)
  c.fillStyle = color
  c.fillRect(0, 0, 1200, 340)
  c.fillStyle = inkOn(color)
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  c.font = '600 40px Bricolage, system-ui, sans-serif'
  c.globalAlpha = 0.82
  c.fillText('Feedback for', 600, 140)
  c.globalAlpha = 1
  fit(c, name, 750, 'Bricolage, system-ui, sans-serif', 96, 1060)
  c.fillText(name, 600, 250)

  const { count, dark } = matrix(text)
  const box = 760, cell = Math.floor(box / count), side = cell * count
  const left = Math.round((1200 - side) / 2), top = 420 + Math.round((box - side) / 2)
  c.fillStyle = qrColor(color)
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (dark(row, col)) c.fillRect(left + col * cell, top + row * cell, cell, cell)

  c.fillStyle = '#26233a'
  c.font = '750 64px Bricolage, system-ui, sans-serif'
  c.fillText('Scan to send feedback', 600, 1330)
  c.fillStyle = '#57536b'
  c.font = '500 34px Bricolage, system-ui, sans-serif'
  c.fillText('Bugs, ideas and questions are all welcome.', 600, 1395)
  c.fillStyle = '#8a869a'
  fit(c, text.replace(/^https?:\/\//, ''), 400, '"Fragment Mono", ui-monospace, monospace', 34, 1040)
  c.fillText(text.replace(/^https?:\/\//, ''), 600, 1500)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
