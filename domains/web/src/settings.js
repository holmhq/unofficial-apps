// What you chose, remembered in this browser: extensions, how short, which ideas to make,
// the price, and which provider looks names up (Namecheap, falling back to RDAP).

const KEY = 'domains:settings'

export const DEFAULTS = {
  preset: 'short',
  custom: [],
  max: 8,
  kinds: { short: true, sound: true, ai: true, hack: true, affix: false },
  hidePremium: false,
  maxPrice: 0,
  provider: 'namecheap',
}

export const MAX_ANY = 16

function load() {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch {}
  const out = { ...DEFAULTS, ...saved, kinds: { ...DEFAULTS.kinds, ...(saved.kinds || {}) } }
  delete out.onlyFree
  return out
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

export function reset() {
  set({ preset: DEFAULTS.preset, max: DEFAULTS.max, kinds: { ...DEFAULTS.kinds }, hidePremium: false, maxPrice: 0 })
}

export function on(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Changes that call for new names to check, rather than only showing what's there differently.
export const SEARCH_KEYS = ['preset', 'custom', 'max', 'kinds', 'provider']

const kindsKey = (k) => Object.keys(DEFAULTS.kinds).filter((x) => k[x]).join(',')

// Whether anything differs from the defaults, for the dot on the Filters button.
export function changed() {
  return settings.preset !== DEFAULTS.preset || settings.max !== DEFAULTS.max || kindsKey(settings.kinds) !== kindsKey(DEFAULTS.kinds) || settings.hidePremium || !!settings.maxPrice
}
