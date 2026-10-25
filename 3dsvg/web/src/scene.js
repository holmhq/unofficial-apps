// The 3D view: renderer, camera, lights, environment, contact shadow, the
// extruded shape and its controls. It ports the scene of the 3dsvg engine
// (see ./LICENSE) from React Three Fiber to plain three.js; the contact
// shadow and the environment follow @react-three/drei's ContactShadows and
// Environment (MIT, see ./LICENSE-drei). Same props, same look.

import * as THREE from 'three'
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js'
import { createExtruder, STALE } from './geometry.js'
import { materialFor } from './materials.js'

const VIEW_DEFAULTS = {
  svg: '',
  depth: 1,
  smoothness: 0.2,
  color: '#ffffff',
  material: { preset: 'default', metalness: 0.15, roughness: 0.35, opacity: 1, wireframe: false },
  texture: null, // an image URL
  textureRepeat: [1, 1],
  textureRotation: 0,
  textureOffset: [0, 0],
  rotationX: 0,
  rotationY: 0,
  zoom: 8,
  lightPosition: [5, 8, 5],
  lightIntensity: 1.2,
  ambientIntensity: 0.3,
  shadow: true,
  cursorOrbit: true,
  orbitStrength: 0.15,
  draggable: true,
  scrollZoom: false,
  resetOnIdle: false,
  resetDelay: 2,
  animate: 'none',
  animateSpeed: 1,
  animateReverse: false,
  intro: 'zoom',
  introDuration: 2.5,
  introFrom: 18,
  background: '#0a0a0a',
  backdrop: null, // colour of the plane behind the shape, or null for none
  showLightHelper: false
}

// One loop of each animation at speed 1, in seconds.
export const CYCLE_SECONDS = {
  spin: (2 * Math.PI) / 0.5,
  float: (2 * Math.PI) / 1.5,
  pulse: (2 * Math.PI) / 2,
  wobble: (2 * Math.PI) / 2,
  swing: (2 * Math.PI) / 1.5,
  spinFloat: (2 * Math.PI) / 0.4
}

// ── Contact shadow (after drei's ContactShadows) ──

function contactShadow(renderer, { scale = 10, opacity = 1, blur = 1, far = 10, resolution = 512 }) {
  const target = new THREE.WebGLRenderTarget(resolution, resolution)
  const targetBlur = new THREE.WebGLRenderTarget(resolution, resolution)
  target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false
  const plane = new THREE.PlaneGeometry(scale, scale).rotateX(Math.PI / 2)
  const blurPlane = new THREE.Mesh(plane)
  const depth = new THREE.MeshDepthMaterial()
  depth.depthTest = depth.depthWrite = false
  depth.onBeforeCompile = shader => {
    shader.uniforms.ucolor = { value: new THREE.Color('#000000') }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
      .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );')
  }
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader)
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader)
  hBlur.depthTest = vBlur.depthTest = false

  const group = new THREE.Group()
  group.rotation.x = Math.PI / 2
  const shown = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true, map: target.texture, opacity, depthWrite: false }))
  shown.scale.set(1, -1, 1)
  shown.rotation.set(-Math.PI / 2, 0, 0)
  const camera = new THREE.OrthographicCamera(-scale / 2, scale / 2, scale / 2, -scale / 2, 0, far)
  group.add(shown, camera)

  function blurPass(amount) {
    blurPlane.visible = true
    blurPlane.material = hBlur
    hBlur.uniforms.tDiffuse.value = target.texture
    hBlur.uniforms.h.value = amount / 256
    renderer.setRenderTarget(targetBlur)
    renderer.render(blurPlane, camera)
    blurPlane.material = vBlur
    vBlur.uniforms.tDiffuse.value = targetBlur.texture
    vBlur.uniforms.v.value = amount / 256
    renderer.setRenderTarget(target)
    renderer.render(blurPlane, camera)
    blurPlane.visible = false
  }

  return {
    group,
    update(scene) {
      if (!group.visible) return
      const background = scene.background
      const override = scene.overrideMaterial
      group.visible = false
      scene.background = null
      scene.overrideMaterial = depth
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      blurPass(blur)
      blurPass(blur * 0.4)
      renderer.setRenderTarget(null)
      group.visible = true
      scene.overrideMaterial = override
      scene.background = background
    }
  }
}

// ── Light helper: a small orb with a warm glow where the key light is ──

let glowTexture = null
function glow() {
  if (glowTexture) return glowTexture
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255, 248, 200, 1)')
  g.addColorStop(0.1, 'rgba(255, 220, 100, 0.8)')
  g.addColorStop(0.3, 'rgba(255, 190, 50, 0.3)')
  g.addColorStop(0.6, 'rgba(255, 170, 30, 0.08)')
  g.addColorStop(1, 'rgba(255, 150, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}

// ── The viewer ──

export function createViewer(container, initial = {}) {
  const props = { ...VIEW_DEFAULTS, ...initial }
  const listeners = { loading: [], ready: [] }
  const emit = (name, ...args) => listeners[name].forEach(fn => fn(...args))

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, preserveDrawingBuffer: true,
    powerPreference: 'default', failIfMajorPerformanceCaveat: false
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  const canvas = renderer.domElement
  canvas.className = 'stage-canvas'
  canvas.style.opacity = '0'
  container.append(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(0, 0, props.zoom)

  // Lights, as the engine places them.
  const ambient = new THREE.AmbientLight(0xffffff, props.ambientIntensity)
  const key = new THREE.DirectionalLight(0xffffff, props.lightIntensity)
  const back = new THREE.DirectionalLight(0xffffff, 0.4)
  back.position.set(-5, 3, -3)
  const below = new THREE.DirectionalLight(0xffffff, 0.2)
  below.position.set(0, -4, 6)
  const top = new THREE.PointLight(0xffffff, 0.3)
  top.position.set(0, 5, 0)
  const sky = new THREE.HemisphereLight('#b1e1ff', '#b97a20', 0.5)
  scene.add(ambient, key, back, below, top, sky)

  // A studio environment drawn once into a cube map: a dark room with one
  // bright light above and two dim ones, for reflections on metal and glass.
  const room = new THREE.Scene()
  const ball = (radius, color, side, position) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 32), new THREE.MeshBasicMaterial({ color, side }))
    if (position) mesh.position.set(...position)
    room.add(mesh)
    return mesh
  }
  ball(1, '#0a0a12', THREE.BackSide).scale.setScalar(50)
  ball(20, '#ffffff', THREE.FrontSide, [0, 25, 0])
  ball(15, '#444444', THREE.FrontSide, [0, 0, 30])
  ball(10, '#333333', THREE.FrontSide, [-20, 5, 10])
  const cube = new THREE.WebGLCubeRenderTarget(256)
  cube.texture.type = THREE.HalfFloatType
  new THREE.CubeCamera(0.1, 1000, cube).update(renderer, room)
  scene.environment = cube.texture
  scene.environmentIntensity = 1.5

  // Shape: the outer group animates, the inner one turns with the controls.
  const animGroup = new THREE.Group()
  const shapeGroup = new THREE.Group()
  animGroup.add(shapeGroup)
  scene.add(animGroup)
  const material = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, clearcoatRoughness: 0.05 })
  let mesh = null

  const shadow = contactShadow(renderer, { scale: 10, opacity: 0.4, blur: 2, far: 4 })
  shadow.group.position.set(0, -3, 0)
  scene.add(shadow.group)

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }))
  backdrop.position.set(0, 0, -3)
  scene.add(backdrop)

  const helper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  sprite.renderOrder = -1
  helper.add(sprite)
  scene.add(helper)

  // ── Geometry ──

  const extrude = createExtruder()
  let loading = false
  async function rebuild() {
    loading = true
    emit('loading', true, 0)
    const result = await extrude(props.svg, props.depth, props.smoothness, p => emit('loading', true, p))
    if (result === STALE) return
    if (mesh) { shapeGroup.remove(mesh); mesh.geometry.dispose(); mesh = null }
    if (result) {
      mesh = new THREE.Mesh(result.geometry, material)
      mesh.position.set(-result.center.x, -result.center.y, -result.center.z)
      shapeGroup.scale.set(result.scale, -result.scale, result.scale)
      shapeGroup.add(mesh)
    }
    loading = false
    emit('loading', false, 100)
  }
  let geometryKey = ''
  function maybeRebuild() {
    const k = `${props.depth}|${props.smoothness}|${props.svg}`
    if (k === geometryKey) return
    geometryKey = k
    rebuild()
  }

  // ── Material and texture ──

  let texture = null
  let textureURL = null
  function loadTexture() {
    if (props.texture === textureURL) return
    textureURL = props.texture
    if (!textureURL) { texture?.dispose(); texture = null; applyMaterial(); return }
    const wanted = textureURL
    new THREE.TextureLoader().load(wanted, tex => {
      if (wanted !== textureURL) { tex.dispose(); return }
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      texture?.dispose()
      texture = tex
      applyMaterial()
    }, undefined, () => {})
  }

  let programKey = ''
  function applyMaterial() {
    const m = props.material
    const preset = materialFor(m.preset)
    const clear = preset.transparent || m.opacity < 1
    const gold = m.preset === 'gold'
    const emissive = m.preset === 'emissive'
    material.color.set(texture ? '#ffffff' : gold ? '#d4a017' : props.color)
    material.map = texture
    material.metalness = m.metalness
    material.roughness = clear ? Math.max(0.02, m.roughness * 0.3) : m.roughness
    material.transmission = clear ? 1 - m.opacity : 0
    material.thickness = clear ? 2.5 : 0
    material.ior = clear ? 1.5 : 1.45
    material.wireframe = !!m.wireframe
    material.emissive.set(emissive ? props.color : '#000000')
    material.emissiveIntensity = preset.emissiveIntensity ?? 0
    material.clearcoat = clear ? 1 : (preset.clearcoat ?? 0)
    if (texture) {
      texture.offset.set(props.textureOffset[0], props.textureOffset[1])
      texture.repeat.set(props.textureRepeat[0], props.textureRepeat[1])
      texture.rotation = props.textureRotation
      texture.center.set(0.5, 0.5)
    }
    const k = `${!!texture}|${m.preset}|${clear}|${material.wireframe}`
    if (k !== programKey) { programKey = k; material.needsUpdate = true }
  }

  function applyScene() {
    scene.background = props.background && props.background !== 'transparent' ? new THREE.Color(props.background) : null
    backdrop.visible = !!props.backdrop
    if (props.backdrop) backdrop.material.color.set(props.backdrop)
    ambient.intensity = props.ambientIntensity
    key.intensity = props.lightIntensity
    key.position.set(...props.lightPosition)
    shadow.group.visible = !!props.shadow
    helper.visible = !!props.showLightHelper
    helper.position.set(...props.lightPosition)
    const s = 1.5 + props.lightIntensity * 0.8
    sprite.scale.set(s, s, 1)
    sprite.material.opacity = Math.min(1, props.lightIntensity * 0.4)
  }

  // ── Intro: zoom in from afar while fading in ──

  // Narrow or portrait screens pull the camera back so the shape fits.
  const fitFor = aspect => (aspect < 1 ? 1 / aspect : 1)
  const fit = () => fitFor(canvas.clientWidth / (canvas.clientHeight || 1))
  let introT = props.intro === 'none' ? 1 : 0
  let introDone = props.intro === 'none'
  if (introDone) canvas.style.opacity = '1'
  camera.position.z = (introDone ? props.zoom : props.introFrom) * fit()
  function stepIntro(delta) {
    if (introDone) return
    introT = Math.min(1, introT + delta / props.introDuration)
    const t = 1 - Math.pow(1 - introT, 4)
    const to = props.zoom * fit()
    if (props.intro === 'zoom') {
      const from = props.introFrom * fit()
      camera.position.z = from + (to - from) * t
      canvas.style.opacity = String(Math.min(1, t * 1.5))
    } else {
      camera.position.z = to
      canvas.style.opacity = String(t)
    }
    if (introT >= 1) { introDone = true; canvas.style.opacity = '1'; camera.position.z = to }
  }

  // ── Controls: drag with momentum, cursor orbit, wheel and pinch zoom ──

  const base = { x: props.rotationX, y: props.rotationY }
  const velocity = { x: 0, y: 0 }
  const cursor = { x: 0, y: 0 }
  let targetZoom = props.zoom
  let dragging = false
  let lastPos = { x: 0, y: 0 }
  let lastActive = performance.now()
  let cursorInWindow = true
  const markActive = () => { lastActive = performance.now() }

  function resetPosition() {
    base.x = props.rotationX
    base.y = props.rotationY
    velocity.x = velocity.y = 0
  }

  function stepControls() {
    let resetting = false
    if (props.resetOnIdle && introDone) {
      resetting = !dragging && (!cursorInWindow || performance.now() - lastActive > props.resetDelay * 1000)
    }
    if (!dragging && !resetting) {
      velocity.x *= 0.92
      velocity.y *= 0.92
      if (Math.abs(velocity.x) > 0.0001 || Math.abs(velocity.y) > 0.0001) { base.x += velocity.x; base.y += velocity.y }
    }
    if (resetting) {
      velocity.x = velocity.y = 0
      base.x += (props.rotationX - base.x) * 0.03
      base.y += (props.rotationY - base.y) * 0.03
      cursor.x += -cursor.x * 0.03
      cursor.y += -cursor.y * 0.03
      targetZoom += (props.zoom - targetZoom) * 0.03
    }
    const orbit = props.cursorOrbit
    const tx = base.x + (orbit ? cursor.x : 0)
    const ty = base.y + (orbit ? cursor.y : 0)
    const damping = orbit && !dragging ? 0.04 : 0.08
    shapeGroup.rotation.x += (tx - shapeGroup.rotation.x) * damping
    shapeGroup.rotation.y += (ty - shapeGroup.rotation.y) * damping
    if (introDone) camera.position.z += (targetZoom * fit() - camera.position.z) * 0.08
  }

  const touches = new Set()
  canvas.addEventListener('pointerdown', e => {
    touches.add(e.pointerId)
    if (!props.draggable || touches.size >= 2) return
    dragging = true
    lastPos = { x: e.clientX, y: e.clientY }
    velocity.x = velocity.y = 0
    canvas.setPointerCapture(e.pointerId)
    markActive()
  })
  canvas.addEventListener('pointermove', e => {
    if (!dragging || touches.size >= 2) return
    const dx = e.clientX - lastPos.x, dy = e.clientY - lastPos.y
    lastPos = { x: e.clientX, y: e.clientY }
    base.x += dy * 0.01
    base.y += dx * 0.01
    velocity.x = dy * 0.01
    velocity.y = dx * 0.01
  })
  const pointerEnd = e => {
    touches.delete(e.pointerId)
    if (!dragging) return
    if (touches.size > 0) velocity.x = velocity.y = 0
    dragging = false
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    markActive()
  }
  canvas.addEventListener('pointerup', pointerEnd)
  canvas.addEventListener('pointercancel', pointerEnd)
  canvas.addEventListener('wheel', e => {
    if (!props.scrollZoom) return
    e.preventDefault()
    targetZoom = Math.max(2, Math.min(20, targetZoom + e.deltaY * 0.01))
    markActive()
  }, { passive: false })
  let pinch = 0
  const pinchDistance = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2 && props.scrollZoom) { e.preventDefault(); pinch = pinchDistance(e) }
  }, { passive: false })
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !props.scrollZoom) return
    e.preventDefault()
    const d = pinchDistance(e)
    targetZoom = Math.max(2, Math.min(20, targetZoom + (pinch - d) * 0.03))
    pinch = d
    markActive()
  }, { passive: false })
  const onMouseMove = e => {
    if (props.resetOnIdle) markActive()
    if (!props.cursorOrbit || dragging) return
    const nx = (e.clientX / innerWidth - 0.5) * 2
    const ny = (e.clientY / innerHeight - 0.5) * 2
    cursor.x = ny * props.orbitStrength
    cursor.y = nx * props.orbitStrength
  }
  addEventListener('mousemove', onMouseMove)
  const onLeave = () => { cursorInWindow = false }
  const onEnter = () => { cursorInWindow = true; markActive() }
  document.addEventListener('mouseleave', onLeave)
  document.addEventListener('mouseenter', onEnter)

  // ── Loop animation ──

  let elapsed = 0
  let animType = props.animate
  function stepAnimation(delta) {
    if (props.animate !== animType) {
      // A new animation starts from rest, keeping the turn a spin left.
      animType = props.animate
      elapsed = 0
      animGroup.position.y = 0
      animGroup.scale.setScalar(1)
      animGroup.rotation.z = 0
      if (animType === 'swing') animGroup.rotation.y = 0
    }
    if (animType === 'none') return
    const speed = props.animateSpeed
    const dir = props.animateReverse ? -1 : 1
    elapsed += delta * speed
    const t = elapsed
    switch (animType) {
      case 'spin': animGroup.rotation.y += delta * 0.5 * speed * dir; break
      case 'float': animGroup.position.y = Math.sin(t * 1.5) * 0.3; break
      case 'pulse': animGroup.scale.setScalar(1 + Math.sin(t * 2) * 0.05); break
      case 'wobble': animGroup.rotation.z = Math.sin(t * 2) * 0.1 * dir; break
      case 'swing': animGroup.rotation.y = Math.sin(t * 1.5) * 0.26 * dir; break
      case 'spinFloat':
        animGroup.rotation.y += delta * 0.4 * speed * dir
        animGroup.position.y = Math.sin(t * 1.2) * 0.25
        break
    }
  }

  // ── Size and frame loop ──

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let raf = 0, last = performance.now(), ready = false, lost = false
  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (lost) return
    const delta = Math.min((now - last) / 1000, 0.1)
    last = now
    stepIntro(delta)
    stepControls()
    stepAnimation(delta)
    shadow.update(scene)
    renderer.render(scene, camera)
    if (!ready) { ready = true; emit('ready') }
  }
  raf = requestAnimationFrame(frame)

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; canvas.style.visibility = 'hidden' })
  canvas.addEventListener('webglcontextrestored', () => { lost = false; canvas.style.visibility = 'visible' })

  // ── Still image: render once at the asked size, optionally without the
  // backdrop and cropped to the shape ──

  function capture(resolution, withBackground, aspectRatio = null) {
    const prev = { background: scene.background, shadow: shadow.group.visible, backdrop: backdrop.visible, helper: helper.visible, ratio: renderer.getPixelRatio(), z: camera.position.z }
    const width = canvas.width, height = canvas.height
    const aspect = aspectRatio || width / height
    // Frame the shape for the picture's own shape, not the screen's.
    camera.position.z = (prev.z / fit()) * fitFor(aspect)
    const w = Math.round(resolution), h = Math.round(resolution / aspect)
    helper.visible = false
    if (!withBackground) { shadow.group.visible = false; backdrop.visible = false; scene.background = null }
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    renderer.setClearColor(0x000000, 0)
    if (withBackground && prev.shadow) shadow.update(scene)
    renderer.render(scene, camera)
    let url
    if (aspectRatio || withBackground) url = canvas.toDataURL('image/png')
    else url = cropToContent(canvas, w, h)
    renderer.setPixelRatio(prev.ratio)
    camera.position.z = prev.z
    resize()
    scene.background = prev.background
    shadow.group.visible = prev.shadow
    backdrop.visible = prev.backdrop
    helper.visible = prev.helper
    renderer.render(scene, camera)
    return url
  }

  // ── 3D model files ──

  function exportGroup() {
    const group = new THREE.Group()
    if (!mesh) return group
    mesh.updateWorldMatrix(true, false)
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    // The flipped scale turns triangles inside out; turn them back.
    if (mesh.matrixWorld.determinant() < 0 && geometry.index) {
      const idx = geometry.index.array
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t }
    } else if (mesh.matrixWorld.determinant() < 0) {
      flipNonIndexed(geometry)
    }
    group.add(new THREE.Mesh(geometry, material.clone()))
    return group
  }

  async function exportModel(format) {
    const group = exportGroup()
    if (!group.children.length) return null
    if (format === 'stl') return new Blob([new STLExporter().parse(group, { binary: true })], { type: 'model/stl' })
    if (format === 'obj') return new Blob([new OBJExporter().parse(group)], { type: 'text/plain' })
    if (format === 'ply') {
      const data = new PLYExporter().parse(group, () => {}, { binary: true })
      return data ? new Blob([data], { type: 'application/octet-stream' }) : null
    }
    const result = await new GLTFExporter().parseAsync(group, { binary: true })
    return new Blob([result], { type: 'model/gltf-binary' })
  }

  // ── Updates ──

  function update(next = {}) {
    const before = { rotationX: props.rotationX, rotationY: props.rotationY, zoom: props.zoom }
    Object.assign(props, next)
    if ('rotationX' in next || 'rotationY' in next) {
      if (props.rotationX !== before.rotationX || props.rotationY !== before.rotationY) resetPosition()
    }
    if ('zoom' in next && props.zoom !== before.zoom) targetZoom = props.zoom
    if ('cursorOrbit' in next && !props.cursorOrbit) cursor.x = cursor.y = 0
    maybeRebuild()
    loadTexture()
    applyMaterial()
    applyScene()
  }
  update()

  return {
    canvas,
    update,
    // Back to the set rotation and zoom, even when they did not change.
    reset() { resetPosition(); targetZoom = props.zoom },
    capture,
    exportModel,
    hasShape: () => !!mesh,
    isLoading: () => loading,
    on(name, fn) { listeners[name].push(fn) },
    destroy() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
      renderer.dispose()
      canvas.remove()
    }
  }
}

function flipNonIndexed(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name]
    const n = attr.itemSize
    const a = attr.array
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const j1 = (i + 1) * n + k, j2 = (i + 2) * n + k
        const t = a[j1]; a[j1] = a[j2]; a[j2] = t
      }
    }
    attr.needsUpdate = true
  }
}

// Trims a transparent capture to the shape, with a little room around it.
function cropToContent(source, w, h) {
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const ctx = tmp.getContext('2d')
  ctx.drawImage(source, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return tmp.toDataURL('image/png')
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  const pad = Math.max(10, Math.round(Math.max(cw, ch) * 0.05))
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad)
  const x1 = Math.min(w, maxX + 1 + pad), y1 = Math.min(h, maxY + 1 + pad)
  const out = document.createElement('canvas')
  out.width = x1 - x0
  out.height = y1 - y0
  out.getContext('2d').drawImage(tmp, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
  return out.toDataURL('image/png')
}
