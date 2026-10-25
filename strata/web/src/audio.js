// Strata — Web Audio sounds. Soft sine and triangle tones on a pentatonic
// scale, so clears chime rather than buzz; no music loop. Gated by
// prefs.sound and by the first tap or key press, as browsers require.

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

// D major pentatonic, from D4 up two octaves.
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66]

export const sfx = {
  move() { tone({ freq: 440, dur: 0.03, gain: 0.025 }) },
  rotate() { tone({ freq: 587.33, dur: 0.045, gain: 0.03 }) },
  lock() { tone({ freq: 196, type: 'triangle', dur: 0.09, gain: 0.055, slideTo: 150 }) },
  drop() { tone({ freq: 164.81, type: 'triangle', dur: 0.12, gain: 0.07, slideTo: 110 }) },
  hold() { tone({ freq: 369.99, dur: 0.07, gain: 0.04, slideTo: 493.88 }) },
  // n full rows: n rising notes, and a higher start the longer the combo.
  clear(n, combo = 0) {
    const from = Math.min(combo, 2)
    for (let i = 0; i < n; i++) {
      tone({ freq: SCALE[from + i * 2], dur: 0.32, gain: 0.05, at: i * 0.07 })
    }
    if (n === 4) tone({ freq: SCALE[from + 8], type: 'triangle', dur: 0.5, gain: 0.04, at: 0.3 })
  },
  level() {
    tone({ freq: 659.25, dur: 0.18, gain: 0.05 })
    tone({ freq: 987.77, dur: 0.3, gain: 0.045, at: 0.12 })
  },
  over() {
    ;[587.33, 440, 369.99, 293.66].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.05, at: i * 0.16 }))
  }
}
