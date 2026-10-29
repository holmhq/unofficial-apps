// Small sounds, made on the spot with Web Audio and kept quiet: a tick for
// a day, two notes for a time, a page turn for a month, a chime when a
// booking is made. Off with the switch in the account menu.

const KEY = 'kalendar:sound'
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

function tone(c, at, freq, dur, { type = 'sine', gain = .04, to = null, attack = .005 } = {}) {
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

function swish(c, at, { from = 900, to = 3200, dur = .16, gain = .03, q = 1.2 } = {}) {
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
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, at)
  filter.frequency.exponentialRampToValueAtTime(to, at + dur)
  g.gain.setValueAtTime(.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + dur * .3)
  g.gain.exponentialRampToValueAtTime(.0001, at + dur)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(at)
  src.stop(at + dur + .02)
}

function play(fn) {
  if (!on || document.hidden) return
  const c = audio()
  if (c && c.state === 'running') fn(c, c.currentTime + .005)
}

const cues = {
  tap: (c, t) => tone(c, t, 1500, .03, { gain: .012, attack: .002 }),
  pick: (c, t) => { tone(c, t, 1318.5, .07, { gain: .018 }); tone(c, t + .055, 1760, .11, { gain: .015 }) },
  flip: (c, t) => swish(c, t, { from: 2400, to: 900, dur: .12, gain: .018, q: .9 }),
  push: (c, t) => swish(c, t, { from: 700, to: 2600, dur: .18, gain: .022 }),
  booked: (c, t) => {
    const notes = [1046.5, 1318.5, 1568, 2093]
    notes.forEach((f, i) => tone(c, t + i * .085, f, .5 - i * .06, { type: 'triangle', gain: .03 - i * .004 }))
    tone(c, t + .34, 2637, .6, { gain: .008 })
  },
  error: (c, t) => tone(c, t, 233, .2, { type: 'triangle', gain: .045, to: 165 }),
  on: (c, t) => { tone(c, t, 880, .08, { gain: .016 }); tone(c, t + .06, 1320, .12, { gain: .014 }) },
  off: (c, t) => { tone(c, t, 1100, .08, { gain: .014 }); tone(c, t + .06, 740, .12, { gain: .012 }) },
  pop: (c, t) => tone(c, t, 700, .09, { gain: .03, to: 1400 }),
  tick: (c, t) => tone(c, t, 2200, .018, { gain: .008, attack: .001 }),
  sent: (c, t) => { tone(c, t, 880, .14, { type: 'triangle', gain: .022 }); tone(c, t + .1, 1318.5, .3, { type: 'triangle', gain: .018 }) },
  remove: (c, t) => { tone(c, t, 660, .09, { type: 'triangle', gain: .03 }); tone(c, t + .07, 440, .16, { type: 'triangle', gain: .026 }) }
}

export const sound = {
  get on() { return on },
  set(value) {
    on = value
    try { localStorage.setItem(KEY, value ? 'on' : 'off') } catch {}
    if (value) play(cues.on)
  },
  tap: () => play(cues.tap),
  pick: () => play(cues.pick),
  flip: () => play(cues.flip),
  push: () => play(cues.push),
  booked: () => play(cues.booked),
  error: () => play(cues.error),
  toggle: (value) => play(value ? cues.on : cues.off),
  pop: () => play(cues.pop),
  tick: () => play(cues.tick),
  sent: () => play(cues.sent),
  remove: () => play(cues.remove)
}
