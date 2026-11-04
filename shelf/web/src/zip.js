// ZIP files without a library: reading (EPUB books, exports from other apps) with the
// browser's own DecompressionStream, and writing (the Markdown export) without compression,
// which every unzip tool opens.

const td = new TextDecoder()

// The entries of a ZIP file, by name, each read only when asked for.
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The central directory's end record sits in the last 64 KB.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('This isn’t a ZIP file.')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = td.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    entries.set(name, { name, method, size, local })
  }
  async function raw(entry) {
    const off = entry.local
    const start = off + 30 + view.getUint16(off + 26, true) + view.getUint16(off + 28, true)
    const data = bytes.subarray(start, start + entry.size)
    if (entry.method === 0) return data
    if (entry.method !== 8) throw new Error('This file is packed in a way Shelf can’t open.')
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    async bytes(name) { const e = entries.get(name); return e ? raw(e) : null },
    async text(name) { const e = entries.get(name); return e ? td.decode(await raw(e)) : null }
  }
}

/* ---- Writing ---------------------------------------------------------------------------------- */

let table = null
function crc32(data) {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// files: [{ name, data: string | Uint8Array, date? }] → a Blob of a ZIP file.
export function writeZip(files) {
  const te = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = te.encode(f.name)
    const data = typeof f.data === 'string' ? te.encode(f.data) : f.data
    const crc = crc32(data)
    const d = f.date ? new Date(f.date) : new Date()
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true)
    head.setUint16(4, 20, true)
    head.setUint16(6, 0x0800, true) // names are UTF-8
    head.setUint16(10, time, true)
    head.setUint16(12, date, true)
    head.setUint32(14, crc, true)
    head.setUint32(18, data.length, true)
    head.setUint32(22, data.length, true)
    head.setUint16(26, name.length, true)
    parts.push(head.buffer, name, data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(12, time, true)
    dir.setUint16(14, date, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(dir.buffer, name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}
