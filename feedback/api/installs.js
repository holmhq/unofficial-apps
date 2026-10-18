// Where a project's button is live: the sites that loaded it lately, by
// origin, so the set-up page can say it's working and suggest which sites to
// allow. The button's script says where it is; a write happens at most every
// ten minutes per site, and a site not seen for 90 days drops off.
import { kv, now, iso } from './lib.js'

const FRESH = 10 * 60 * 1000
const KEEP = 90 * 86400000
const MAX_SITES = 20
const prefix = projectId => `seen:${projectId}:`

// Noting a site must never break the request it rides on.
export function seen(projectId, value) {
  try {
    const url = new URL(String(value || '').slice(0, 300))
    if (!/^https?:$/.test(url.protocol)) return
    const key = prefix(projectId) + url.origin
    const last = Number(kv().get(key)) || 0
    if (last && now() - last < FRESH) return
    if (!last && (kv().list(prefix(projectId)) || []).length >= MAX_SITES) return
    kv().set(key, now(), KEEP)
  } catch (error) { console.warn('seen', String(error)) }
}

export function installs(projectId) {
  return (kv().list(prefix(projectId)) || [])
    .map(entry => ({ origin: entry.key.slice(prefix(projectId).length), seenAt: iso(Number(entry.value)) }))
    .sort((a, b) => b.seenAt.localeCompare(a.seenAt))
}

export function removeInstalls(projectId) {
  for (const entry of kv().list(prefix(projectId)) || []) kv().delete(entry.key)
}
