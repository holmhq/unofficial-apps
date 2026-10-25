// Sokoban — Web Audio SFX. Soft, short tones; no music loop. Gated by
// prefs.sound and the AudioContext unlock on first user gesture.

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

function blip({ freq = 440, type = 'sine', dur = 0.08, gain = 0.05, slideTo = null, at = 0 }) {
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
  g.gain.linearRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

export const sfx = {
  move() { blip({ freq: 300, type: 'sine', dur: 0.03, gain: 0.032 }) },
  push() { blip({ freq: 180, type: 'triangle', dur: 0.07, gain: 0.065, slideTo: 130 }) },
  blocked() { blip({ freq: 120, type: 'square', dur: 0.05, gain: 0.04, slideTo: 90 }) },
  goal() {
    blip({ freq: 523.25, type: 'sine', dur: 0.09, gain: 0.06 })
    blip({ freq: 783.99, type: 'sine', dur: 0.11, gain: 0.055, at: 0.06 })
  },
  undo() { blip({ freq: 420, type: 'sine', dur: 0.05, gain: 0.04, slideTo: 300 }) },
  win() {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      blip({ freq: f, type: 'triangle', dur: 0.16, gain: 0.08, at: i * 0.07 }))
  }
}
