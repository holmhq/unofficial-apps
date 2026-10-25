// Strata — what this browser remembers, with a tiny pub/sub. The theme and
// palette keys are the ones the pre-paint script in index.html reads, so the
// first paint matches the saved look.

import { better } from './rules.js'

const KEYS = {
  theme: 'strata:theme',
  palette: 'strata:palette',
  sound: 'strata:sound',
  ghost: 'strata:ghost',
  hintSeen: 'strata:hintSeen',
  best: 'strata:best',
  current: 'strata:current'
}

const DEFAULTS = {
  theme: 'system',      // light | dark | system
  palette: 'sandstone', // sandstone | canyon | shore | ash
  sound: true,
  ghost: true,          // show where the piece will land
  hintSeen: false
}

const listeners = new Set()

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(KEYS[key])
    if (raw === null) return fallback
    if (typeof fallback === 'boolean') return raw === '1'
    return raw
  } catch (_e) {
    return fallback
  }
}

function write(key, value) {
  try {
    const v = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
    localStorage.setItem(KEYS[key], v)
  } catch (_e) { /* private mode etc. */ }
}

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(KEYS[key]) || 'null')
  } catch (_e) {
    return null
  }
}

function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(KEYS[key])
    else localStorage.setItem(KEYS[key], JSON.stringify(value))
  } catch (_e) {}
}

export const prefs = {
  ...DEFAULTS,
  theme: read('theme', DEFAULTS.theme),
  palette: read('palette', DEFAULTS.palette),
  sound: read('sound', DEFAULTS.sound),
  ghost: read('ghost', DEFAULTS.ghost),
  hintSeen: read('hintSeen', DEFAULTS.hintSeen),

  // The best game played here, or the member's best from the server:
  // { score, lines, level, frames, seed?, log?, synced }. A game with its
  // seed and log can still be sent to the leaderboard; synced says it was.
  best: readJSON('best'),

  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  emit() {
    for (const fn of listeners) {
      try { fn(this) } catch (_e) {}
    }
  },

  set(key, value) {
    if (!(key in DEFAULTS)) return
    this[key] = value
    write(key, value)
    this.emit()
  },

  // Keeps a finished game if it beats the best one. Returns true when it does.
  recordGame(game) {
    if (!better(game, this.best)) return false
    this.saveBest({ ...game, synced: false })
    return true
  },

  // After the server has the best game.
  markSynced() {
    if (this.best && !this.best.synced) this.saveBest({ ...this.best, synced: true })
  },

  // Folds in the member's best from the server when it beats this device's.
  merge(best) {
    if (!best || !better(best, this.best)) return false
    this.saveBest({ ...best, synced: true })
    return true
  },

  // The best game, if the server hasn't seen it yet.
  unsent() {
    const b = this.best
    return b && !b.synced && typeof b.log === 'string' && Number.isInteger(b.seed) ? b : null
  },

  saveBest(best) {
    this.best = best
    writeJSON('best', best)
    this.emit()
  },

  // The game in progress, so a reload or a closed tab can carry on:
  // { seed, log, frame }.
  current: readJSON('current'),
  saveCurrent(current) {
    this.current = current
    writeJSON('current', current)
  }
}
