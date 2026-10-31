// Reads what a camera wrote into a photo: when it was taken (and the time zone, when the
// camera said), the camera and lens, the exposure and where. JPEG keeps it in an APP1
// segment near the start; HEIC and AVIF keep it as an "Exif" item that the file's meta box
// points to. Only those few bytes are read, and anything unexpected gives up quietly: the
// photo goes in without it.

export async function readExif(file) {
  try {
    const buffer = await file.slice(0, 262144).arrayBuffer()
    const view = new DataView(buffer)
    if (view.getUint16(0) === 0xffd8) return fromJpeg(view)
    if (view.byteLength > 12 && view.getUint32(4) === 0x66747970) return await fromHeif(view, file)
  } catch {}
  return {}
}

function fromJpeg(view) {
  let at = 2
  while (at + 4 < view.byteLength) {
    if (view.getUint8(at) !== 0xff) return {}
    const marker = view.getUint8(at + 1)
    const length = view.getUint16(at + 2)
    if (marker === 0xe1 && view.getUint32(at + 4) === 0x45786966) return parseTiff(view, at + 10)
    if (marker === 0xda || marker === 0xd9) return {}
    at += 2 + length
  }
  return {}
}

// ISO base media boxes: [size][type], a size of 1 meaning a 64-bit size follows.
function boxes(view, start, end) {
  const out = []
  let at = start
  while (at + 8 <= end) {
    let size = view.getUint32(at)
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7))
    let head = 8
    if (size === 1) { size = Number(view.getBigUint64(at + 8)); head = 16 }
    if (size === 0) size = end - at
    if (size < head) break
    out.push({ type, start: at + head, end: Math.min(end, at + size) })
    at += size
  }
  return out
}

async function fromHeif(view, file) {
  const meta = boxes(view, 0, view.byteLength).find((b) => b.type === 'meta')
  if (!meta) return {}
  const inner = boxes(view, meta.start + 4, meta.end)
  const iinf = inner.find((b) => b.type === 'iinf')
  const iloc = inner.find((b) => b.type === 'iloc')
  if (!iinf || !iloc) return {}
  // Which item is the Exif block.
  const v = view.getUint8(iinf.start)
  let id = null
  for (const infe of boxes(view, iinf.start + 4 + (v === 0 ? 2 : 4), iinf.end)) {
    if (infe.type !== 'infe') continue
    const iv = view.getUint8(infe.start)
    if (iv < 2) continue
    const itemId = iv === 2 ? view.getUint16(infe.start + 4) : view.getUint32(infe.start + 4)
    const typeAt = infe.start + 4 + (iv === 2 ? 2 : 4) + 2
    const type = String.fromCharCode(view.getUint8(typeAt), view.getUint8(typeAt + 1), view.getUint8(typeAt + 2), view.getUint8(typeAt + 3))
    if (type === 'Exif') { id = itemId; break }
  }
  if (id == null) return {}
  // Where that item's bytes are.
  let at = iloc.start
  const lv = view.getUint8(at)
  at += 4
  const sizes = view.getUint16(at)
  at += 2
  const offSize = sizes >> 12
  const lenSize = (sizes >> 8) & 15
  const baseSize = (sizes >> 4) & 15
  const idxSize = lv === 1 || lv === 2 ? sizes & 15 : 0
  const read = (n) => {
    let value = 0
    if (n === 4) value = view.getUint32(at)
    else if (n === 8) value = Number(view.getBigUint64(at))
    else if (n === 2) value = view.getUint16(at)
    at += n
    return value
  }
  const count = lv < 2 ? read(2) : read(4)
  for (let k = 0; k < count; k++) {
    const itemId = lv < 2 ? read(2) : read(4)
    if (lv === 1 || lv === 2) read(2)
    read(2)
    const base = read(baseSize)
    const extents = read(2)
    let first = null
    for (let e = 0; e < extents; e++) {
      if (idxSize) read(idxSize)
      const offset = read(offSize)
      const length = read(lenSize)
      if (!first) first = { offset: base + offset, length }
    }
    if (itemId !== id || !first || first.length < 12 || first.length > 1048576) continue
    const block = new DataView(await file.slice(first.offset, first.offset + first.length).arrayBuffer())
    return parseTiff(block, 4 + block.getUint32(0))
  }
  return {}
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949
  const u16 = (o) => view.getUint16(start + o, little)
  const u32 = (o) => view.getUint32(start + o, little)
  const i32 = (o) => view.getInt32(start + o, little)
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

  function value(entry) {
    const type = u16(entry + 2)
    const count = u32(entry + 4)
    const size = (SIZE[type] || 1) * count
    const at = size > 4 ? u32(entry + 8) : entry + 8
    if (start + at + size > view.byteLength) return null
    if (type === 2) {
      let s = ''
      for (let i = 0; i < count; i++) { const c = view.getUint8(start + at + i); if (!c) break; s += String.fromCharCode(c) }
      return s.trim()
    }
    const one = (k) => {
      if (type === 3) return u16(at + k * 2)
      if (type === 4) return u32(at + k * 4)
      if (type === 9) return i32(at + k * 4)
      if (type === 5) { const d = u32(at + k * 8 + 4); return d ? u32(at + k * 8) / d : 0 }
      if (type === 10) { const d = i32(at + k * 8 + 4); return d ? i32(at + k * 8) / d : 0 }
      return view.getUint8(start + at + k)
    }
    if (count === 1) return one(0)
    const list = []
    for (let k = 0; k < Math.min(count, 8); k++) list.push(one(k))
    return list
  }

  function ifd(offset) {
    const out = {}
    if (!offset || start + offset + 2 > view.byteLength) return out
    const n = u16(offset)
    for (let i = 0; i < n; i++) {
      const entry = offset + 2 + i * 12
      if (start + entry + 12 > view.byteLength) break
      try { out[u16(entry)] = value(entry) } catch {}
    }
    return out
  }

  const zero = ifd(u32(4))
  const exif = ifd(zero[0x8769])
  const gpsIfd = ifd(zero[0x8825])
  const out = {}

  const stamp = exif[0x9003] || exif[0x9004] || zero[0x132]
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(stamp || '')
  if (m && m[1] !== '0000') out.taken = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  const offset = exif[0x9011] || exif[0x9010]
  if (typeof offset === 'string' && /^[+-]\d\d:\d\d$/.test(offset)) out.offset = offset

  const make = clean(zero[0x10f])
  const model = clean(zero[0x110])
  if (model) out.camera = make && !/^(apple|google|samsung|oneplus|xiaomi|huawei)$/i.test(make) && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? `${pretty(make)} ${MODELS[model] || model}` : MODELS[model] || model
  const lens = clean(exif[0xa434])
  if (lens) out.lens = lens

  const exp = {}
  if (exif[0x829d]) exp.f = exif[0x829d]
  if (exif[0x829a]) exp.s = exif[0x829a]
  const iso = Array.isArray(exif[0x8827]) ? exif[0x8827][0] : exif[0x8827]
  if (iso) exp.iso = iso
  if (exif[0x920a]) exp.mm = exif[0x920a]
  if (exif[0xa405]) exp.mm35 = exif[0xa405]
  if (Object.keys(exp).length) out.exp = exp

  const lat = degrees(gpsIfd[2], gpsIfd[1])
  const lon = degrees(gpsIfd[4], gpsIfd[3])
  if (lat != null && lon != null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.gps = [round(lat), round(lon)]
  return out
}

function degrees(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 3) return null
  const v = parts[0] + parts[1] / 60 + parts[2] / 3600
  if (!Number.isFinite(v)) return null
  return ref === 'S' || ref === 'W' ? -v : v
}

// Sony names its cameras by code; people know them by these.
const MODELS = { 'ILCE-7M4': 'α7 IV', 'ILCE-7M3': 'α7 III', 'ILCE-7RM5': 'α7R V', 'ILCE-7RM4': 'α7R IV', 'ILCE-7CM2': 'α7C II', 'ILCE-7C': 'α7C', 'ILCE-6700': 'α6700', 'ILCE-6400': 'α6400', 'ILCE-1': 'α1', 'ILCE-9M3': 'α9 III' }
const round = (v) => Math.round(v * 1e5) / 1e5
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')
const pretty = (make) => {
  const known = { 'NIKON CORPORATION': 'Nikon', 'OLYMPUS IMAGING CORP.': 'Olympus', 'OM Digital Solutions': 'OM System', FUJIFILM: 'Fujifilm', SONY: 'Sony', 'Canon': 'Canon', 'LEICA CAMERA AG': 'Leica', 'Panasonic': 'Panasonic', 'RICOH IMAGING COMPANY, LTD.': 'Ricoh', 'HUAWEI': 'Huawei', 'samsung': 'Samsung' }
  return known[make] || (make === make.toUpperCase() && make.length > 3 ? make[0] + make.slice(1).toLowerCase() : make)
}
