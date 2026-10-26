// Small sounds, made on the spot with Web Audio and kept quiet: a soft
// whoosh when a text leaves, a tick when it's delivered, two notes when a
// reply arrives. Off with the switch in the account menu.

const KEY = 'zend:sound'
let ctx = null
let noise = null
let on = true
try { on = localStorage.getItem(KEY) !== 'off' } catch {}

function audio() {
  const C = window.AudioContext || window.webkitAudioContext
  if (!C) return null
  if (!ctx) ctx = new C()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Browsers start audio only after a touch or a key.
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { if (on) audio() }, { once: true, capture: true })

function tone(c, at, freq, dur, { type = 'sine', gain = .05, to = null, attack = .006 } = {}) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur * .8)
  g.gain.setValueAtTime(.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + attack)
  g.gain.exponentialRampToValueAtTime(.0001, at + dur)
  o.connect(g).connect(c.destination)
  o.start(at)
  o.stop(at + dur + .03)
}

function whoosh(c, at, { from = 700, to = 4200, dur = .2, gain = .045 } = {}) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * .4), c.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const g = c.createGain()
  src.buffer = noise
  filter.type = 'bandpass'
  filter.Q.value = 1.1
  filter.frequency.setValueAtTime(from, at)
  filter.frequency.exponentialRampToValueAtTime(to, at + dur)
  g.gain.setValueAtTime(.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + dur * .35)
  g.gain.exponentialRampToValueAtTime(.0001, at + dur)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(at)
  src.stop(at + dur + .02)
}

function play(fn) {
  if (!on || document.hidden && fn !== cues.received) return
  const c = audio()
  if (c && c.state === 'running') fn(c, c.currentTime + .005)
}

const cues = {
  send: (c, t) => { whoosh(c, t); tone(c, t + .02, 520, .16, { gain: .022, to: 1180 }) },
  delivered: (c, t) => { tone(c, t, 1760, .07, { gain: .014 }); tone(c, t + .07, 2349, .11, { gain: .012 }) },
  received: (c, t) => { tone(c, t, 784, .24, { type: 'triangle', gain: .05 }); tone(c, t + .1, 1175, .34, { type: 'triangle', gain: .04 }) },
  error: (c, t) => { tone(c, t, 220, .18, { type: 'triangle', gain: .05, to: 160 }) },
  tap: (c, t) => { tone(c, t, 1400, .025, { gain: .008, attack: .002 }) },
  on: (c, t) => { tone(c, t, 880, .1, { gain: .02 }); tone(c, t + .08, 1320, .14, { gain: .018 }) }
}

export const sound = {
  get on() { return on },
  set(value) {
    on = value
    try { localStorage.setItem(KEY, value ? 'on' : 'off') } catch {}
    if (value) play(cues.on)
  },
  send: () => play(cues.send),
  delivered: () => play(cues.delivered),
  received: () => play(cues.received),
  error: () => play(cues.error),
  tap: () => play(cues.tap)
}
