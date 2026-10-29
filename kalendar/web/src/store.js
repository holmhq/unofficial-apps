// What the page last saw from the server, kept in this browser so every
// page draws at once and then catches up, the way an app on a phone opens on
// what it showed last time. Answers are kept by name: "me", a public page
// ("u:avery", "u:avery/intro"), or a host's own lists, which carry the
// member's id so someone else signing in here never sees them. Signing out
// forgets everything.

const PREFIX = 'kalendar:c:'
const memory = new Map()

export function peek(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const value = JSON.parse(raw)
      memory.set(key, value)
      return value
    }
  } catch {}
  return undefined
}

// Keep a fresh answer. Says whether it differs from what was kept, so a page
// redraws only when something really changed.
export function keep(key, value) {
  const raw = JSON.stringify(value)
  let before
  try { before = memory.has(key) ? JSON.stringify(memory.get(key)) : localStorage.getItem(PREFIX + key) } catch {}
  memory.set(key, value)
  if (raw === before) return false
  try { localStorage.setItem(PREFIX + key, raw) } catch {
    // Full: drop the host's older lists and try once more.
    forget((k) => k.startsWith('m:'))
    try { localStorage.setItem(PREFIX + key, raw) } catch {}
  }
  return true
}

export function drop(key) {
  memory.delete(key)
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

export function forget(test = () => true) {
  for (const key of [...memory.keys()]) if (test(key)) memory.delete(key)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX) && test(k.slice(PREFIX.length))) localStorage.removeItem(k)
    }
  } catch {}
}

// Draw from what's kept, then from the server when it answers, but only if
// it changed. fresh(data, changed) runs once with the server's answer.
export async function swr(key, load, { draw, fresh } = {}) {
  const kept = peek(key)
  if (kept !== undefined && draw) draw(kept, true)
  const data = await load()
  const changed = keep(key, data)
  if (draw && (changed || kept === undefined)) draw(data, false)
  if (fresh) fresh(data, changed)
  return data
}
