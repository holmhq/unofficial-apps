// Ten textures drawn on a canvas, as 3dsvg makes them. A design stores the
// preset's name; the image is drawn again whenever it is needed.

function canvas(size = 512) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')]
}

// A small seeded generator, so every texture comes out the same each time.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function noise(ctx, size, scale, seed = 42) {
  const rng = seeded(seed)
  const image = ctx.getImageData(0, 0, size, size)
  const d = image.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.floor(rng() * scale)
    d[i] += v
    d[i + 1] += v
    d[i + 2] += v
  }
  ctx.putImageData(image, 0, 0)
}

// A linear gradient from the top left corner towards (x, y).
function gradient(stops, x = 512, y = 512, grain = null) {
  const [c, ctx] = canvas()
  const g = ctx.createLinearGradient(0, 0, x, y)
  stops.forEach(([at, color]) => g.addColorStop(at, color))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  if (grain) noise(ctx, 512, grain[0], grain[1])
  return c
}

const DRAW = {
  Marble() {
    const c = gradient([[0, '#f0f0f0'], [0.3, '#e8e8e8'], [0.5, '#d0d0d0'], [0.7, '#e8e8e8'], [1, '#f5f5f5']])
    const ctx = c.getContext('2d')
    const rng = seeded(123)
    ctx.strokeStyle = 'rgba(180,180,190,0.3)'
    ctx.lineWidth = 1
    for (let i = 0; i < 20; i++) {
      ctx.beginPath()
      let x = rng() * 512, y = rng() * 512
      ctx.moveTo(x, y)
      for (let j = 0; j < 8; j++) {
        x += (rng() - 0.5) * 120
        y += (rng() - 0.3) * 80
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    noise(ctx, 512, 15, 77)
    return c
  },
  Wood() {
    const [c, ctx] = canvas()
    ctx.fillStyle = '#c4956a'
    ctx.fillRect(0, 0, 512, 512)
    const rng = seeded(99)
    for (let i = 0; i < 60; i++) {
      const y = i * 8.5 + rng() * 4
      ctx.strokeStyle = `rgba(${100 + rng() * 40}, ${60 + rng() * 30}, ${30 + rng() * 20}, ${0.15 + rng() * 0.2})`
      ctx.lineWidth = 1 + rng() * 3
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x < 512; x += 20) ctx.lineTo(x, y + (rng() - 0.5) * 3)
      ctx.stroke()
    }
    noise(ctx, 512, 12, 55)
    return c
  },
  Concrete() {
    const [c, ctx] = canvas()
    ctx.fillStyle = '#b0b0b0'
    ctx.fillRect(0, 0, 512, 512)
    noise(ctx, 512, 40, 33)
    const rng = seeded(200)
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(${140 + rng() * 40}, ${140 + rng() * 40}, ${140 + rng() * 40}, 0.3)`
      const x = rng() * 512, y = rng() * 512
      ctx.fillRect(x, y, 2 + rng() * 8, 2 + rng() * 8)
    }
    return c
  },
  Gradient: () => gradient([[0, '#667eea'], [1, '#764ba2']], 0, 512),
  Sunset: () => gradient([[0, '#f093fb'], [0.5, '#f5576c'], [1, '#fda085']]),
  Ocean: () => gradient([[0, '#2193b0'], [1, '#6dd5ed']], 256, 512, [20, 88]),
  Dots() {
    const [c, ctx] = canvas()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#333333'
    for (let y = 12; y < 512; y += 24) {
      for (let x = 12; x < 512; x += 24) {
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    return c
  },
  Stripes() {
    const [c, ctx] = canvas()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#1a1a2e'
    for (let i = 0; i < 512; i += 20) ctx.fillRect(i, 0, 10, 512)
    return c
  },
  Checker() {
    const [c, ctx] = canvas()
    for (let y = 0; y < 512; y += 32) {
      for (let x = 0; x < 512; x += 32) {
        ctx.fillStyle = (x / 32 + y / 32) % 2 === 0 ? '#ffffff' : '#222222'
        ctx.fillRect(x, y, 32, 32)
      }
    }
    return c
  },
  Noise() {
    const [c, ctx] = canvas()
    const image = ctx.createImageData(512, 512)
    const rng = seeded(42)
    for (let i = 0; i < image.data.length; i += 4) {
      const v = Math.floor(rng() * 255)
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return c
  }
}

export const TEXTURES = Object.keys(DRAW)

const urls = new Map()
// A data URL of the preset, drawn once per page.
export function textureURL(name) {
  if (!DRAW[name]) return null
  if (!urls.has(name)) urls.set(name, DRAW[name]().toDataURL())
  return urls.get(name)
}
