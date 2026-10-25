// Sokoban — what this browser remembers, with a tiny pub/sub. The theme and
// palette keys are the ones the pre-paint script in index.html reads, so the
// first paint matches the saved look.

import { better } from './rules.js'

const KEYS = {
  theme: 'sokoban:theme',
  palette: 'sokoban:palette',
  sound: 'sokoban:sound',
  level: 'sokoban:level',
  progress: 'sokoban:progress',
  hintSeen: 'sokoban:hintSeen'
}

const DEFAULTS = {
  theme: 'system',   // light | dark | system
  palette: 'bloom',  // bloom | mist | sage | soda | mono
  sound: true,
  level: 0,          // the level to open on next launch
  hintSeen: false
}

const listeners = new Set()

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(KEYS[key])
    if (raw === null) return fallback
    if (typeof fallback === 'boolean') return raw === '1'
    if (typeof fallback === 'number') return Number(raw) || 0
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

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.progress) || '{}') || {}
  } catch (_e) {
    return {}
  }
}

export const prefs = {
  ...DEFAULTS,
  theme: read('theme', DEFAULTS.theme),
  palette: read('palette', DEFAULTS.palette),
  sound: read('sound', DEFAULTS.sound),
  level: read('level', DEFAULTS.level),
  hintSeen: read('hintSeen', DEFAULTS.hintSeen),

  // { [levelId]: { moves, pushes, path } }: the best result on each level.
  // Results saved before solutions were kept have no path; they still count
  // here but can't be sent to the leaderboard.
  progress: readProgress(),

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

  // Keeps a finished level's result if it beats the saved one. Returns true
  // when it does.
  recordWin(levelId, result) {
    if (!better(result, this.progress[levelId])) return false
    this.saveProgress({ ...this.progress, [levelId]: { moves: result.moves, pushes: result.pushes, path: result.path } })
    return true
  },

  // Folds in the bests the server has for this member, keeping whichever
  // result is better on each level.
  merge(bests) {
    let changed = false
    const next = { ...this.progress }
    for (const [id, best] of Object.entries(bests || {})) {
      if (better(best, next[id])) { next[id] = best; changed = true }
    }
    if (changed) this.saveProgress(next)
    return changed
  },

  saveProgress(progress) {
    this.progress = progress
    try { localStorage.setItem(KEYS.progress, JSON.stringify(progress)) } catch (_e) {}
    this.emit()
  },

  // The solutions worth sending to the server.
  solutions() {
    return Object.entries(this.progress)
      .filter(([, best]) => best && typeof best.path === 'string' && best.path)
      .map(([level, best]) => ({ level, path: best.path }))
  }
}
