// Frame a picture before it goes up: drag it to move it, zoom with a pinch,
// the scroll wheel, the slider or the keyboard, and get back a JPEG the size
// it's shown at. A photo is framed in a circle; a cover in the shape a
// shared link shows. The picture always fills the frame, so there's never an
// empty edge to explain.
import { h, ic, sheet, toast, haptic } from './ui.js'
import { sound } from './sound.js'

const ZOOM = 4

// The file picker, as a promise: the file, or null when it's dismissed.
export function choose() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif' })
    input.addEventListener('change', () => resolve(input.files && input.files[0] || null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

// A picture the browser can draw, the right way up, no larger than it
// needs to be. Some browsers can't open HEIC photos; they say so.
async function open(file, longest) {
  let bitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bitmap = null }
  if (!bitmap) return null
  const k = Math.min(1, longest / Math.max(bitmap.width, bitmap.height))
  if (k === 1) return bitmap
  const c = document.createElement('canvas')
  c.width = Math.round(bitmap.width * k)
  c.height = Math.round(bitmap.height * k)
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close && bitmap.close()
  return c
}

// shape: 'round' (a square, shown in a circle) or 'wide' (out's shape).
// out: [width, height] of the JPEG. Resolves to a Blob, or null.
export async function frame(file, { shape = 'round', out = [512, 512], title = 'Move and zoom', quality = 0.86 } = {}) {
  const img = await open(file, Math.max(...out) * ZOOM)
  if (!img) {
    sound.error()
    toast('That picture can’t be opened here. Try a JPEG or PNG.', { kind: 'bad' })
    return null
  }
  const iw = img.width
  const ih = img.height
  const ratio = out[0] / out[1]
  // The frame, in CSS pixels; z is the zoom over "just fills it"; (cx, cy)
  // is the point of the picture at the frame's centre, in picture pixels.
  const v = { fw: 0, fh: 0, z: 1, cx: iw / 2, cy: shape === 'round' ? ih * 0.42 : ih / 2 }
  const scaleAt = (fw, fh, z = v.z) => Math.max(fw / iw, fh / ih) * z

  const canvas = h('canvas.framer-canvas')
  const stage = h('div.framer-stage.' + shape, {
    tabindex: '0', role: 'img', 'aria-label': `${title}. Drag to move, scroll or pinch to zoom; arrow keys move, + and − zoom.`,
    style: { aspectRatio: `${out[0]} / ${out[1]}` }
  }, canvas, h('div.framer-mask', { 'aria-hidden': 'true' }))
  const slider = h('input.framer-zoom', { type: 'range', min: '1', max: String(ZOOM), step: '0.01', value: '1', 'aria-label': 'Zoom' })

  function clamp() {
    const s = scaleAt(v.fw, v.fh)
    const hx = v.fw / 2 / s
    const hy = v.fh / 2 / s
    v.cx = Math.min(iw - hx, Math.max(hx, v.cx))
    v.cy = Math.min(ih - hy, Math.max(hy, v.cy))
  }

  // Draw the picture as it sits in a frame fw × fh, onto g at k pixels a unit.
  function drawInto(g, fw, fh, k) {
    const s = scaleAt(fw, fh) * k
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, fw * k / 2 - v.cx * s, fh * k / 2 - v.cy * s, iw * s, ih * s)
  }

  let raf = 0
  function paint() {
    raf = 0
    const r = stage.getBoundingClientRect()
    if (!r.width) return
    v.fw = r.width
    v.fh = r.width / ratio
    clamp()
    const dpr = Math.min(3, devicePixelRatio || 1)
    const w = Math.round(v.fw * dpr)
    const hgt = Math.round(v.fh * dpr)
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt }
    const g = canvas.getContext('2d')
    g.clearRect(0, 0, w, hgt)
    drawInto(g, v.fw, v.fh, dpr)
    slider.value = String(v.z)
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(paint) }

  // Zoom to z, keeping the picture's point under (fx, fy) where it is.
  function zoomTo(z, fx = v.fw / 2, fy = v.fh / 2) {
    z = Math.min(ZOOM, Math.max(1, z))
    const s1 = scaleAt(v.fw, v.fh)
    const px = v.cx + (fx - v.fw / 2) / s1
    const py = v.cy + (fy - v.fh / 2) / s1
    v.z = z
    const s2 = scaleAt(v.fw, v.fh)
    v.cx = px - (fx - v.fw / 2) / s2
    v.cy = py - (fy - v.fh / 2) / s2
    later()
  }
  function pan(dx, dy) {
    const s = scaleAt(v.fw, v.fh)
    v.cx -= dx / s
    v.cy -= dy / s
    later()
  }

  // One finger or the mouse moves it; two fingers pinch.
  const points = new Map()
  let pinch = null
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId)
    points.set(e.pointerId, { x: e.clientX, y: e.clientY })
    stage.classList.add('held')
    if (points.size === 2) {
      const [a, b] = [...points.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z }
    }
  })
  stage.addEventListener('pointermove', (e) => {
    const p = points.get(e.pointerId)
    if (!p) return
    const r = stage.getBoundingClientRect()
    if (points.size === 2 && pinch) {
      p.x = e.clientX
      p.y = e.clientY
      const [a, b] = [...points.values()]
      zoomTo(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
      return
    }
    pan(e.clientX - p.x, e.clientY - p.y)
    p.x = e.clientX
    p.y = e.clientY
  })
  const lift = (e) => {
    points.delete(e.pointerId)
    if (points.size < 2) pinch = null
    if (!points.size) stage.classList.remove('held')
  }
  stage.addEventListener('pointerup', lift)
  stage.addEventListener('pointercancel', lift)
  stage.addEventListener('wheel', (e) => {
    e.preventDefault()
    const r = stage.getBoundingClientRect()
    zoomTo(v.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top)
  }, { passive: false })
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key]) { e.preventDefault(); pan(...moves[e.key]) } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(v.z * 1.15) } else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(v.z / 1.15) }
  })
  slider.addEventListener('input', () => zoomTo(Number(slider.value)))
  const fit = new ResizeObserver(later)
  fit.observe(stage)

  const step = (dir) => h('button.icon-btn.small', { type: 'button', 'aria-label': dir > 0 ? 'Zoom in' : 'Zoom out', onclick: () => { zoomTo(v.z * (dir > 0 ? 1.25 : 0.8)); haptic(4) } }, ic(dir > 0 ? 'zoomIn' : 'zoomOut', 18, 2))

  const blob = await sheet({
    title,
    done: 'Save',
    onDone: async (close) => {
      if (!v.fw) return
      const c = document.createElement('canvas')
      c.width = out[0]
      c.height = out[1]
      const g = c.getContext('2d')
      // JPEG has no transparency: a see-through picture sits on white.
      g.fillStyle = '#fff'
      g.fillRect(0, 0, out[0], out[1])
      drawInto(g, v.fw, v.fh, out[0] / v.fw)
      close(await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality)))
    },
    body: () => [
      h('div.framer', stage,
        h('div.framer-bar', step(-1), slider, step(1)),
        h('p.framer-hint', shape === 'round'
          ? 'Drag to move, pinch or slide to zoom. It shows in a circle on your page and booking pages.'
          : 'Drag to move, pinch or slide to zoom. Messages and posts show it this shape with a link to your page.'))
    ]
  })
  fit.disconnect()
  if (raf) cancelAnimationFrame(raf)
  if (img.close) img.close()
  return blob || null
}
