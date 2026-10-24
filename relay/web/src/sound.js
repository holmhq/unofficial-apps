// Relay — light synthesized sounds via Web Audio (no asset files).
// Respects the sounds preference. Call unlock() on the first user gesture
// to satisfy autoplay policies.

import { prefs } from './state.js';

let ctx = null;

function ensure() {
  if (ctx) return ctx;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  } catch (_e) { ctx = null; }
  return ctx;
}

export function unlock() {
  var c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

function tone(freqStart, freqEnd, dur, gainPeak) {
  var c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  var t = c.currentTime;
  var o = c.createOscillator();
  var g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freqStart, t);
  o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(type) {
  if (!prefs.sounds) return;
  if (type === 'send') tone(620, 880, 0.12, 0.16);
  else if (type === 'receive') tone(440, 560, 0.14, 0.13);
  else if (type === 'tap') tone(520, 520, 0.05, 0.06);
}
