// Soft, synthesised sounds (no audio files). Painting plays a pentatonic
// note for the row you reach, so dragging across a day sounds like a little
// melody; other people's changes arrive as a quiet drop.

const KEY = 'overlap:sound'
let ctx = null
let master = null
let last = 0

export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export function setSound(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch {} }

function audio() {
  if (!soundOn()) return null
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.9
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp).connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch { return null }
}

// One plucked, marimba-like note.
function pluck(freq, { gain = 0.07, decay = 0.42, at = 0, bright = 1 } = {}) {
  const c = audio()
  if (!c) return
  const t = c.currentTime + at
  const out = c.createGain()
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = Math.min(9000, freq * 5 * bright)
  filter.Q.value = 0.4
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  out.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  out.connect(filter).connect(master)
  const tones = [[1, 1], [2.0, 0.22], [3.98, 0.05]]
  for (const [ratio, level] of tones) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = ratio === 1 ? 'sine' : 'triangle'
    osc.frequency.value = freq * ratio
    g.gain.value = level
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

const PENTA = [0, 2, 4, 7, 9]
const note = step => 523.25 * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)

// Row 0 is the earliest slot; later times sit lower, like the sun going down.
export function paint(row, rows, adding) {
  const now = performance.now()
  if (now - last < 28) return
  last = now
  const span = 9
  const step = span - Math.round((row / Math.max(1, rows - 1)) * span)
  if (adding) pluck(note(step), { gain: 0.06, decay: 0.38 })
  else pluck(note(step) / 2, { gain: 0.035, decay: 0.16, bright: 0.5 })
  try { navigator.vibrate?.(3) } catch {}
}

export function drop() {
  const now = performance.now()
  if (now - last < 500 || document.hidden) return
  last = now
  pluck(392, { gain: 0.03, decay: 0.3, bright: 0.6 })
  pluck(587.33, { gain: 0.02, decay: 0.3, at: 0.06, bright: 0.6 })
}

export function join() {
  pluck(523.25, { gain: 0.06, decay: 0.5 })
  pluck(783.99, { gain: 0.06, decay: 0.7, at: 0.09 })
}

export function tick() { pluck(1567.98, { gain: 0.035, decay: 0.12 }) }

export function settle() {
  ;[523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => pluck(f, { gain: 0.06, decay: 0.9, at: i * 0.075 }))
}

// Browsers only allow sound after a gesture; the first tap anywhere unlocks it.
addEventListener('pointerdown', () => audio(), { once: true, capture: true })
