// SVG markup in, one extruded three.js geometry out. Filled paths become
// shapes, strokes become ribbons as wide as the stroke, and a rectangle that
// fills the whole viewBox (a background some exporters add) is dropped.
// Shapes are extruded in batches, yielding between them, so a complex SVG
// never freezes the page; a newer request cancels an older one.

import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const BATCH = 20
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0))

function isViewBoxRect(shape, vbW, vbH) {
  const pts = shape.getPoints(4)
  if (pts.length !== 4 && pts.length !== 5) return false
  const box = new THREE.Box2()
  for (const p of pts) box.expandByPoint(p)
  const size = box.getSize(new THREE.Vector2())
  return Math.abs(size.x - vbW) / vbW < 0.01 && Math.abs(size.y - vbH) / vbH < 0.01
}

function strokeShapes(path, style) {
  const half = parseFloat(style?.strokeWidth ?? '2') / 2
  const shapes = []
  for (const sub of path.subPaths) {
    const points = sub.getPoints(12)
    if (points.length < 2) continue
    const left = [], right = []
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]
      const dx = next.x - prev.x, dy = next.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len, ny = dx / len
      left.push(new THREE.Vector2(points[i].x + nx * half, points[i].y + ny * half))
      right.push(new THREE.Vector2(points[i].x - nx * half, points[i].y - ny * half))
    }
    const shape = new THREE.Shape()
    shape.moveTo(left[0].x, left[0].y)
    for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y)
    for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y)
    shape.closePath()
    shapes.push(shape)
  }
  return shapes
}

function parseShapes(svg) {
  let data
  try { data = new SVGLoader().parse(svg) } catch { return [] }
  const vb = svg.match(/viewBox\s*=\s*["']\s*([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)/)
  const vbW = vb ? parseFloat(vb[3]) : 0
  const vbH = vb ? parseFloat(vb[4]) : 0
  const shapes = []
  for (const path of data.paths) {
    const style = path.userData?.style
    const hasFill = style?.fill && style.fill !== 'none' && style.fill !== 'transparent'
    const hasStroke = style?.stroke && style.stroke !== 'none' && style.stroke !== 'transparent'
    if (hasFill) {
      for (const shape of SVGLoader.createShapes(path)) {
        if (vbW && vbH && isViewBoxRect(shape, vbW, vbH)) continue
        shapes.push(shape)
      }
    }
    if (hasStroke) shapes.push(...strokeShapes(path, style))
    if (!hasFill && !hasStroke) shapes.push(...SVGLoader.createShapes(path))
  }
  return shapes
}

// Texture coordinates by the face's main direction, so a texture lies flat
// on the front and wraps the sides without stretching.
function triplanarUVs(geo, box) {
  const size = box.getSize(new THREE.Vector3())
  const uv = geo.attributes.uv, pos = geo.attributes.position, normal = geo.attributes.normal
  const span = Math.max(size.x, size.y, size.z) || 1
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i))
    let u, v
    if (nz >= nx && nz >= ny) { u = (px - box.min.x) / span; v = 1 - (py - box.min.y) / span }
    else if (nx >= ny) { u = (pz - box.min.z) / span; v = 1 - (py - box.min.y) / span }
    else { u = (px - box.min.x) / span; v = (pz - box.min.z) / span }
    uv.setXY(i, u, v)
  }
  uv.needsUpdate = true
}

// What extrude() resolves to when a newer call replaced it.
export const STALE = Symbol('stale')

// Each viewer has its own extruder. Its extrude() resolves to
// { geometry, center, scale }, null when there is nothing to show, or STALE.
// onProgress gets 0–100.
export function createExtruder() {
  let version = 0
  return (svg, depth, smoothness, onProgress) => {
    const mine = ++version
    return build(svg, depth, smoothness, onProgress || (() => {}), () => mine !== version)
  }
}

async function build(svg, depth, smoothness, onProgress, stale) {
  if (!svg) return null
  const shapes = parseShapes(svg)
  if (stale()) return STALE
  if (!shapes.length) return null

  const flat = new THREE.ShapeGeometry(shapes)
  flat.computeBoundingBox()
  const flatSize = flat.boundingBox.getSize(new THREE.Vector3())
  flat.dispose()
  const maxFlat = Math.max(flatSize.x, flatSize.y, 1)

  // Complex drawings get fewer segments so they stay responsive.
  const quality = shapes.length > 200 ? 0.3 : shapes.length > 50 ? 0.6 : 1
  const bevel = Math.min(maxFlat * 0.02, 1) * (0.15 + smoothness * 0.2)
  const settings = {
    depth: (depth / 10) * maxFlat,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.round((3 + smoothness * 20) * quality),
    curveSegments: Math.round((24 + smoothness * 176) * quality)
  }

  const parts = []
  const drop = () => { parts.forEach(g => g.dispose()); return STALE }
  for (let i = 0; i < shapes.length; i++) {
    if (stale()) return drop()
    parts.push(new THREE.ExtrudeGeometry(shapes[i], settings))
    if ((i + 1) % BATCH === 0) {
      onProgress(Math.round(((i + 1) / shapes.length) * 90))
      await nextTask()
    }
  }
  if (stale()) return drop()
  onProgress(92)
  await nextTask()

  const merged = mergeGeometries(parts, false)
  drop()
  if (stale()) { merged?.dispose(); return STALE }
  if (!merged) return null
  onProgress(96)
  await nextTask()

  merged.computeBoundingBox()
  merged.computeVertexNormals()
  triplanarUVs(merged, merged.boundingBox)
  const box = merged.boundingBox
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (stale()) { merged.dispose(); return STALE }
  onProgress(100)
  return { geometry: merged, center, scale: maxDim > 0 ? 4 / maxDim : 1 }
}
