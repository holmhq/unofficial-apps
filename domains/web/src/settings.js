// What you chose, remembered in this browser: extensions, how short, which ideas to make,
// what to show, and which provider looks names up.

const KEY = 'domains:settings'

export const DEFAULTS = {
  preset: 'short',
  custom: [],
  max: 8,
  kinds: { short: true, sound: true, ai: true, hack: true, affix: false },
  onlyFree: false,
  hidePremium: false,
  maxPrice: 0,
  provider: 'namecheap',
}

export const MAX_ANY = 16

function load() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch {}
  return { ...DEFAULTS, ...saved, kinds: { ...DEFAULTS.kinds, ...(saved.kinds || {}) } }
}

export const settings = load()
const listeners = new Set()

export function set(patch) {
  Object.assign(settings, patch)
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {}
  for (const fn of listeners) fn(patch)
}

export function setKind(kind, on) {
  set({ kinds: { ...settings.kinds, [kind]: on } })
}

export function on(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Changes that call for new names to check, rather than only showing what's there differently.
export const SEARCH_KEYS = ['preset', 'custom', 'max', 'kinds', 'provider']

// How many filters differ from the defaults, for the badge on the Filters button.
export function changed() {
  let n = 0
  if (settings.preset !== DEFAULTS.preset) n++
  if (settings.max !== DEFAULTS.max) n++
  for (const k of Object.keys(DEFAULTS.kinds)) if (settings.kinds[k] !== DEFAULTS.kinds[k]) n++
  if (settings.onlyFree) n++
  if (settings.hidePremium) n++
  if (settings.maxPrice) n++
  return n
}
