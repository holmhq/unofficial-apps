// Snake — Web Audio sounds. Soft sine and triangle tones on a pentatonic
// scale; no music loop. Gated by prefs.sound and by the first tap or key
// press, as browsers require.

import { prefs } from './state.js'

let ctx = null

function ac() {
  if (!ctx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (Ctor) ctx = new Ctor()
    } catch (_e) { ctx = null }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Call on the first user gesture so iOS/Safari allow audio.
export function unlock() {
  ac()
}

function tone({ freq = 440, type = 'sine', dur = 0.08, gain = 0.05, slideTo = null, at = 0 }) {
  if (!prefs.sound) return
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

// D major pentatonic, from D4 up two octaves: each berry plays the next
// note, so a run of berries becomes a slow tune.
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66]
const TUNE = [0, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10, 7, 5, 3]

export const sfx = {
  turn() { tone({ freq: 440, dur: 0.03, gain: 0.018 }) },
  eat(n) { tone({ freq: SCALE[TUNE[(n - 1) % TUNE.length]], dur: 0.28, gain: 0.05 }) },
  bloom() {
    tone({ freq: 739.99, dur: 0.22, gain: 0.045 })
    tone({ freq: 987.77, dur: 0.3, gain: 0.04, at: 0.09 })
    tone({ freq: 1174.66, type: 'triangle', dur: 0.4, gain: 0.03, at: 0.18 })
  },
  wilt() { tone({ freq: 493.88, dur: 0.25, gain: 0.025, slideTo: 369.99 }) },
  level() {
    tone({ freq: 659.25, dur: 0.18, gain: 0.045 })
    tone({ freq: 987.77, dur: 0.3, gain: 0.04, at: 0.12 })
  },
  over() {
    ;[587.33, 440, 369.99, 293.66].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.05, at: i * 0.16 }))
  },
  won() {
    ;[293.66, 369.99, 440, 587.33, 739.99, 880].forEach((f, i) => tone({ freq: f, dur: 0.35, gain: 0.045, at: i * 0.1 }))
  }
}
