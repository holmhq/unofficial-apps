// The settings panel on the right: shape, background, material, texture,
// animation, interaction and lighting, one section open at a time.

import { h, binder, slider, toggle, choice, colorField, accordion, disclosure, toast } from './ui.js'
import { icon } from './icons.js'
import { state, setDesign, on } from './state.js'
import { MATERIALS, presetSettings } from './materials.js'
import { TEXTURES, textureURL } from './textures.js'
import { ANIMATIONS, TEXTURE_DEFAULTS } from './design.js'

const COLORS = [
  { hex: '#000000', name: 'Black' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#8b5cf6', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#ffffff', name: 'White' }
]

const d = () => state.design
const setIn = (key, patch) => setDesign({ [key]: { ...d()[key], ...patch } })

// Uploaded textures are shrunk to 1024 px so they save quickly.
async function shrinkImage(file, maxSide = 1024) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const c = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) })
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

export function createSettings(root, { onClose, onReset, onLighting }) {
  const b = binder()
  const acc = accordion()
  const fixed = n => v => v.toFixed(n)

  const object = acc.section('object', 'box', 'Object',
    colorField(b, { label: 'Colour', presets: COLORS, get: () => d().color, set: v => setDesign({ color: v }) }),
    slider(b, { label: 'Depth', min: 0.5, max: 10, step: 0.1, format: fixed(1), get: () => d().depth, set: v => setDesign({ depth: v }) }),
    slider(b, { label: 'Smoothness', min: 0, max: 1, step: 0.05, format: v => `${Math.round(v * 100)}%`, get: () => d().smoothness, set: v => setDesign({ smoothness: v }) }),
    slider(b, { label: 'Zoom', min: 2, max: 20, step: 0.5, format: fixed(1), get: () => d().zoom, set: v => setDesign({ zoom: v }) }),
    h('button', { class: 'btn small block', type: 'button', onclick: () => { setDesign({ rotationX: 0, rotationY: 0, zoom: 8 }); onReset(); b.sync() } }, icon('rotate-ccw', 14), 'Reset position'))

  const background = acc.section('background', 'paintbrush', 'Background',
    colorField(b, { label: 'Background colour', presets: COLORS, get: () => d().bgColor, set: v => setDesign({ bgColor: v }) }))

  const material = acc.section('material', 'palette', 'Material',
    choice(b, {
      label: 'Material',
      options: Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label })),
      get: () => d().material.preset,
      set: v => { setDesign({ material: presetSettings(v, d().material.wireframe) }); b.sync() }
    }),
    disclosure('Advanced',
      slider(b, { label: 'Metalness', min: 0, max: 1, step: 0.01, format: fixed(2), get: () => d().material.metalness, set: v => setIn('material', { metalness: v }) }),
      slider(b, { label: 'Roughness', min: 0, max: 1, step: 0.01, format: fixed(2), get: () => d().material.roughness, set: v => setIn('material', { roughness: v }) }),
      slider(b, { label: 'Opacity', min: 0, max: 1, step: 0.01, format: fixed(2), get: () => d().material.opacity, set: v => setIn('material', { opacity: v }) }),
      toggle(b, { label: 'Wireframe', get: () => d().material.wireframe, set: v => setIn('material', { wireframe: v }) })))

  // Texture: ten drawn presets, or an image from the device.
  const dots = TEXTURES.map(name => {
    const dot = h('button', { class: 'texture-dot', type: 'button', title: name, 'aria-label': `${name} texture` })
    dot.addEventListener('click', () => {
      const active = d().texture.preset === name
      setIn('texture', { preset: active ? null : name, image: null })
      b.sync()
    })
    return dot
  })
  // Drawing the previews takes a moment, so it waits until the section opens.
  let drawn = false
  const drawDots = () => {
    if (drawn) return
    drawn = true
    dots.forEach((dot, i) => dot.append(h('img', { src: textureURL(TEXTURES[i]), alt: '' })))
  }
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true })
  file.addEventListener('change', async () => {
    const f = file.files[0]
    file.value = ''
    if (!f) return
    try { setIn('texture', { preset: null, image: await shrinkImage(f) }); b.sync() } catch { toast('That image could not be read.', { tone: 'error' }) }
  })
  const hasTexture = () => !!(d().texture.preset || d().texture.image)
  const clearBtn = b.showIf(h('button', { class: 'btn small', type: 'button', onclick: () => { setDesign({ texture: { ...TEXTURE_DEFAULTS } }); b.sync() } }, icon('eraser', 14), 'Clear'), hasTexture)
  const texture = acc.section('texture', 'image', 'Texture',
    b.bind(h('div', { class: 'texture-dots' }, dots), () => dots.forEach((dot, i) => dot.classList.toggle('active', d().texture.preset === TEXTURES[i]))),
    h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, icon('upload', 14), 'Upload'), clearBtn, file),
    b.showIf(disclosure('Transform',
      slider(b, { label: 'Repeat X', min: 0.1, max: 5, step: 0.05, format: v => `${v.toFixed(2)}x`, get: () => d().texture.repeatX, set: v => setIn('texture', { repeatX: v }) }),
      slider(b, { label: 'Repeat Y', min: 0.1, max: 5, step: 0.05, format: v => `${v.toFixed(2)}x`, get: () => d().texture.repeatY, set: v => setIn('texture', { repeatY: v }) }),
      slider(b, { label: 'Rotation', min: -Math.PI, max: Math.PI, step: 0.01, format: v => `${Math.round((v * 180) / Math.PI)}°`, get: () => d().texture.rotation, set: v => setIn('texture', { rotation: v }) }),
      slider(b, { label: 'Offset X', min: -2, max: 2, step: 0.01, format: fixed(2), get: () => d().texture.offsetX, set: v => setIn('texture', { offsetX: v }) }),
      slider(b, { label: 'Offset Y', min: -2, max: 2, step: 0.01, format: fixed(2), get: () => d().texture.offsetY, set: v => setIn('texture', { offsetY: v }) })), hasTexture))

  const moving = () => d().animate !== 'none'
  const turning = () => ['spin', 'spinFloat', 'wobble', 'swing'].includes(d().animate)
  const animation = acc.section('animation', 'play', 'Animation',
    choice(b, { label: 'Animation', options: ANIMATIONS, get: () => d().animate, set: v => { setDesign({ animate: v }); b.sync() } }),
    b.showIf(slider(b, { label: 'Speed', min: 0.1, max: 5, step: 0.1, format: v => `${v.toFixed(1)}x`, get: () => d().animateSpeed, set: v => setDesign({ animateSpeed: v }) }), moving),
    b.showIf(toggle(b, { label: 'Reverse direction', get: () => d().animateReverse, set: v => setDesign({ animateReverse: v }) }), turning))

  const interaction = acc.section('interaction', 'mouse-pointer', 'Interaction',
    toggle(b, { label: 'Follow cursor', get: () => d().cursorOrbit, set: v => { setDesign({ cursorOrbit: v }); b.sync() } }),
    b.showIf(slider(b, { label: 'Strength', min: 0.01, max: 0.5, step: 0.01, format: fixed(2), get: () => d().orbitStrength, set: v => setDesign({ orbitStrength: v }) }), () => d().cursorOrbit),
    toggle(b, { label: 'Reset on idle', get: () => d().resetOnIdle, set: v => { setDesign({ resetOnIdle: v }); b.sync() } }),
    b.showIf(slider(b, { label: 'Delay', min: 0.5, max: 10, step: 0.5, format: v => `${v.toFixed(1)}s`, get: () => d().resetDelay, set: v => setDesign({ resetDelay: v }) }), () => d().resetOnIdle))

  const L = key => v => setIn('light', { [key]: v })
  const lighting = acc.section('lighting', 'sun', 'Lighting',
    slider(b, { label: 'Key light X', min: -10, max: 10, step: 0.5, format: fixed(1), get: () => d().light.x, set: L('x') }),
    slider(b, { label: 'Key light Y', min: -10, max: 10, step: 0.5, format: fixed(1), get: () => d().light.y, set: L('y') }),
    slider(b, { label: 'Key light Z', min: -10, max: 10, step: 0.5, format: fixed(1), get: () => d().light.z, set: L('z') }),
    slider(b, { label: 'Key intensity', min: 0, max: 5, step: 0.1, format: fixed(1), get: () => d().light.intensity, set: L('intensity') }),
    slider(b, { label: 'Ambient', min: 0, max: 2, step: 0.05, format: fixed(2), get: () => d().light.ambient, set: L('ambient') }),
    toggle(b, { label: 'Shadows', get: () => d().light.shadow, set: L('shadow') }))

  acc.onChange(id => { if (id === 'texture') drawDots(); onLighting(id === 'lighting') })

  root.replaceChildren(
    h('header', { class: 'settings-head' }, h('span', {}, 'Settings'),
      h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Close settings', title: 'Close', onclick: onClose }, icon('x', 16))),
    h('div', { class: 'settings-body' }, object, background, material, texture, animation, interaction, lighting))
  acc.open('object')

  on('replaced', b.sync)
  return { sync: b.sync, isLighting: () => acc.current === 'lighting' }
}
