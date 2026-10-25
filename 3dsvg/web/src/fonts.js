// Text becomes SVG: one path per glyph, set in one of ten fonts served from
// /fonts/text/ (licences beside them), scaled to fit a 200 × 200 box.

import { parse } from '../vendor/opentype/opentype.module.js'

export const FONTS = [
  { name: 'DM Sans', file: 'dm-sans' },
  { name: 'Bebas Neue', file: 'bebas-neue' },
  { name: 'Playfair Display', file: 'playfair-display' },
  { name: 'Righteous', file: 'righteous' },
  { name: 'Black Ops One', file: 'black-ops-one' },
  { name: 'Permanent Marker', file: 'permanent-marker' },
  { name: 'Rubik Mono One', file: 'rubik-mono-one' },
  { name: 'Pacifico', file: 'pacifico' },
  { name: 'Oswald', file: 'oswald' },
  { name: 'Archivo Black', file: 'archivo-black' }
]

export const DEFAULT_FONT = 'Rubik Mono One'

const cache = new Map()

export function loadFont(name) {
  const def = FONTS.find(f => f.name === name) || FONTS.find(f => f.name === DEFAULT_FONT)
  if (!cache.has(def.name)) {
    const pending = fetch(`/fonts/text/${def.file}.ttf`)
      .then(r => { if (!r.ok) throw new Error(`Font ${def.name} did not load.`); return r.arrayBuffer() })
      .then(buffer => parse(buffer))
    pending.catch(() => cache.delete(def.name))
    cache.set(def.name, pending)
  }
  return cache.get(def.name)
}

export function textToSvg(text, font) {
  const size = 200
  const room = size - 20
  let fontSize = 180
  let bb = font.getPath(text, 0, 0, fontSize).getBoundingBox()
  let w = bb.x2 - bb.x1, h = bb.y2 - bb.y1
  while ((w > room || h > room) && fontSize > 8) {
    fontSize -= 4
    bb = font.getPath(text, 0, 0, fontSize).getBoundingBox()
    w = bb.x2 - bb.x1
    h = bb.y2 - bb.y1
  }
  const offsetY = (size - h) / 2 - bb.y1
  let x = (size - w) / 2 - bb.x1
  const unit = fontSize / (font.unitsPerEm || 1000)
  // One <path> per glyph, so the loader finds the holes in A, O and M.
  const glyphs = font.stringToGlyphs(text)
  const paths = []
  for (let i = 0; i < glyphs.length; i++) {
    const d = glyphs[i].getPath(x, offsetY, fontSize).toPathData(2)
    if (d) paths.push(`<path d="${d}" fill="black" fill-rule="evenodd"/>`)
    x += (glyphs[i].advanceWidth || 0) * unit
    if (i < glyphs.length - 1) x += font.getKerningValue(glyphs[i], glyphs[i + 1]) * unit
  }
  if (!paths.length) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join('')}</svg>`
}
