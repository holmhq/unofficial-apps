// A ZIP file of photos, made here: stored, not compressed (photos are compressed already),
// so it's quick and needs no library.

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

// files: [{ name, data: Uint8Array, date: Date }] → Blob
export function zip(files) {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  const used = new Set()
  for (const f of files) {
    let name = f.name.replace(/[\\/:*?"<>|]+/g, '_')
    for (let n = 2; used.has(name.toLowerCase()); n++) name = f.name.replace(/(\.[^.]*)?$/, ` ${n}$1`)
    used.add(name.toLowerCase())
    const nameBytes = enc.encode(name)
    const crc = crc32(f.data)
    const { time, date } = dosTime(f.date || new Date())
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true)
    head.setUint16(4, 20, true)
    head.setUint16(6, 0x0800, true)
    head.setUint16(8, 0, true)
    head.setUint16(10, time, true)
    head.setUint16(12, date, true)
    head.setUint32(14, crc, true)
    head.setUint32(18, f.data.length, true)
    head.setUint32(22, f.data.length, true)
    head.setUint16(26, nameBytes.length, true)
    head.setUint16(28, 0, true)
    parts.push(head, nameBytes, f.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true)
    c.setUint16(12, time, true)
    c.setUint16(14, date, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, f.data.length, true)
    c.setUint32(24, f.data.length, true)
    c.setUint16(28, nameBytes.length, true)
    c.setUint32(42, offset, true)
    central.push(c, nameBytes)
    offset += 30 + nameBytes.length + f.data.length
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}
