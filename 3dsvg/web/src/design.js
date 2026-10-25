// A design is everything that makes the picture: where the shape comes from
// (drawing, text, SVG code or a file) and every setting. It is plain JSON,
// kept in this browser between visits and in a member's saved shapes.

import { MATERIALS, presetSettings } from './materials.js'
import { FONTS, DEFAULT_FONT } from './fonts.js'
import { GRID, defaultPixels } from './pixels.js'
import { TEXTURES, textureURL } from './textures.js'

const TABS = ['draw', 'text', 'code', 'file']
export const ANIMATIONS = [
  { value: 'none', label: 'None' },
  { value: 'spin', label: 'Spin' },
  { value: 'float', label: 'Float' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'wobble', label: 'Wobble' },
  { value: 'swing', label: 'Swing' },
  { value: 'spinFloat', label: 'Spin + Float' }
]
const LIGHT_DEFAULTS = { x: 2, y: 2, z: 4, intensity: 1.2, ambient: 0.3, shadow: true }
export const TEXTURE_DEFAULTS = { preset: null, image: null, repeatX: 1, repeatY: 1, rotation: 0, offsetX: 0, offsetY: 0 }

export function defaultDesign() {
  return {
    v: 1,
    tab: 'draw',
    pixels: defaultPixels(),
    text: '3DSVG',
    font: DEFAULT_FONT,
    code: '',
    file: null, // { name, svg }
    depth: 1,
    smoothness: 0.6,
    color: '#4f46e5',
    bgColor: '#6961ff',
    material: presetSettings('default'),
    texture: { ...TEXTURE_DEFAULTS },
    animate: 'float',
    animateSpeed: 1,
    animateReverse: false,
    rotationX: 0,
    rotationY: 0,
    zoom: 8,
    cursorOrbit: false,
    orbitStrength: 0.15,
    resetOnIdle: false,
    resetDelay: 2,
    light: { ...LIGHT_DEFAULTS }
  }
}

const num = (v, min, max, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback)
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback)

// Reads a design from anywhere (this browser, a save, a share) and returns a
// complete, valid one; unknown or broken fields fall back to the defaults.
export function normalize(input) {
  const d = defaultDesign()
  if (!input || typeof input !== 'object') return d
  const m = input.material || {}
  const t = input.texture || {}
  const l = input.light || {}
  const preset = MATERIALS[m.preset] ? m.preset : 'default'
  const base = presetSettings(preset)
  const pixels = typeof input.pixels === 'string' && /^[01]+$/.test(input.pixels) && input.pixels.length === GRID * GRID ? input.pixels : d.pixels
  return {
    v: 1,
    tab: TABS.includes(input.tab) ? input.tab : d.tab,
    pixels,
    text: str(input.text, 60, d.text),
    font: FONTS.some(f => f.name === input.font) ? input.font : d.font,
    code: str(input.code, 2_000_000),
    file: input.file && typeof input.file.svg === 'string' ? { name: str(input.file.name, 120, 'shape.svg') || 'shape.svg', svg: input.file.svg } : null,
    depth: num(input.depth, 0.5, 10, d.depth),
    smoothness: num(input.smoothness, 0, 1, d.smoothness),
    color: hex(input.color, d.color),
    bgColor: hex(input.bgColor, d.bgColor),
    material: {
      preset,
      metalness: num(m.metalness, 0, 1, base.metalness),
      roughness: num(m.roughness, 0, 1, base.roughness),
      opacity: num(m.opacity, 0, 1, base.opacity),
      wireframe: !!m.wireframe
    },
    texture: {
      preset: TEXTURES.includes(t.preset) ? t.preset : null,
      image: typeof t.image === 'string' && /^(data:image\/|\/api\/)/.test(t.image) ? t.image : null,
      repeatX: num(t.repeatX, 0.1, 5, 1),
      repeatY: num(t.repeatY, 0.1, 5, 1),
      rotation: num(t.rotation, -Math.PI, Math.PI, 0),
      offsetX: num(t.offsetX, -2, 2, 0),
      offsetY: num(t.offsetY, -2, 2, 0)
    },
    animate: ANIMATIONS.some(a => a.value === input.animate) ? input.animate : d.animate,
    animateSpeed: num(input.animateSpeed, 0.1, 5, 1),
    animateReverse: !!input.animateReverse,
    rotationX: num(input.rotationX, -360, 360, 0),
    rotationY: num(input.rotationY, -360, 360, 0),
    zoom: num(input.zoom, 2, 20, 8),
    cursorOrbit: !!input.cursorOrbit,
    orbitStrength: num(input.orbitStrength, 0.01, 0.5, 0.15),
    resetOnIdle: !!input.resetOnIdle,
    resetDelay: num(input.resetDelay, 0.5, 10, 2),
    light: {
      x: num(l.x, -10, 10, LIGHT_DEFAULTS.x),
      y: num(l.y, -10, 10, LIGHT_DEFAULTS.y),
      z: num(l.z, -10, 10, LIGHT_DEFAULTS.z),
      intensity: num(l.intensity, 0, 5, LIGHT_DEFAULTS.intensity),
      ambient: num(l.ambient, 0, 2, LIGHT_DEFAULTS.ambient),
      shadow: l.shadow !== false
    }
  }
}

const textureOf = d => (d.texture.preset ? textureURL(d.texture.preset) : d.texture.image)

// The viewer's props for a design and the SVG it shows.
export function viewProps(d, svg) {
  return {
    svg,
    depth: d.depth,
    smoothness: d.smoothness,
    color: d.color,
    material: { ...d.material },
    texture: textureOf(d),
    textureRepeat: [d.texture.repeatX, d.texture.repeatY],
    textureRotation: d.texture.rotation,
    textureOffset: [d.texture.offsetX, d.texture.offsetY],
    rotationX: d.rotationX,
    rotationY: d.rotationY,
    zoom: d.zoom,
    lightPosition: [d.light.x, d.light.y, d.light.z],
    lightIntensity: d.light.intensity,
    ambientIntensity: d.light.ambient,
    shadow: d.light.shadow,
    cursorOrbit: d.cursorOrbit,
    orbitStrength: d.orbitStrength,
    resetOnIdle: d.resetOnIdle,
    resetDelay: d.resetDelay,
    animate: d.animate,
    animateSpeed: d.animateSpeed,
    animateReverse: d.animateReverse,
    backdrop: d.bgColor
  }
}

// ── Embed code for the 3dsvg React component on npm ──

const round = n => Math.round(n * 100) / 100

function embedProps(d) {
  const lines = []
  const def = presetSettings('default')
  if (d.tab === 'text') {
    lines.push(`  text=${JSON.stringify(d.text)}`)
    if (d.font !== 'DM Sans') lines.push(`  font="${d.font}"`)
  } else lines.push('  svg={mySvg}')
  if (d.depth !== 1) lines.push(`  depth={${d.depth}}`)
  if (d.smoothness !== 0.2) lines.push(`  smoothness={${d.smoothness}}`)
  if (d.color !== '#ffffff') lines.push(`  color="${d.color}"`)
  const m = d.material
  if (m.preset !== 'default') lines.push(`  material="${m.preset}"`)
  if (m.metalness !== def.metalness) lines.push(`  metalness={${m.metalness}}`)
  if (m.roughness !== def.roughness) lines.push(`  roughness={${m.roughness}}`)
  if (m.opacity !== def.opacity) lines.push(`  opacity={${m.opacity}}`)
  if (m.wireframe) lines.push('  wireframe')
  const t = d.texture
  if (t.preset || t.image) {
    lines.push('  texture="/your-texture.png"')
    if (t.repeatX !== 1) lines.push(`  textureRepeat={${t.repeatX}}`)
    if (t.rotation !== 0) lines.push(`  textureRotation={${round(t.rotation)}}`)
    if (t.offsetX !== 0 || t.offsetY !== 0) lines.push(`  textureOffset={[${t.offsetX}, ${t.offsetY}]}`)
  }
  if (d.animate !== 'none') {
    lines.push(`  animate="${d.animate}"`)
    if (d.animateSpeed !== 1) lines.push(`  animateSpeed={${d.animateSpeed}}`)
    if (d.animateReverse) lines.push('  animateReverse')
  }
  if (d.rotationX !== 0) lines.push(`  rotationX={${round(d.rotationX)}}`)
  if (d.rotationY !== 0) lines.push(`  rotationY={${round(d.rotationY)}}`)
  if (d.zoom !== 8) lines.push(`  zoom={${d.zoom}}`)
  if (d.cursorOrbit) {
    lines.push('  cursorOrbit')
    if (d.orbitStrength !== 0.15) lines.push(`  orbitStrength={${d.orbitStrength}}`)
  }
  if (d.resetOnIdle) {
    lines.push('  resetOnIdle')
    if (d.resetDelay !== 2) lines.push(`  resetDelay={${d.resetDelay}}`)
  }
  const l = d.light, dl = LIGHT_DEFAULTS
  if (l.x !== dl.x || l.y !== dl.y || l.z !== dl.z) lines.push(`  lightPosition={[${l.x}, ${l.y}, ${l.z}]}`)
  if (l.intensity !== dl.intensity) lines.push(`  lightIntensity={${l.intensity}}`)
  if (l.ambient !== dl.ambient) lines.push(`  ambientIntensity={${l.ambient}}`)
  if (!l.shadow) lines.push('  shadow={false}')
  return lines.join('\n')
}

export function embedSnippet(d, svg) {
  const props = embedProps(d)
  const tag = props ? `<SVG3D\n${props}\n/>` : '<SVG3D />'
  const head = 'import { SVG3D } from "3dsvg";'
  if (d.tab === 'text') return `${head}\n\n${tag}`
  return `${head}\n\nconst mySvg = \`${svg.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`;\n\n${tag}`
}
