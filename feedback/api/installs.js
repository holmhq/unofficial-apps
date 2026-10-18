// Where a project's button is live: the sites that loaded it lately, by
// origin, so the set-up page can say it's working and suggest which sites to
// allow. The button's script says where it is; a write happens at most every
// ten minutes per site, and a site not seen for 90 days drops off. Pages on
// localhost or a private network are someone's own copy, not a site: they're
// marked local, kept a week, and can't crowd out sites.
import { kv, now, iso } from './lib.js'

const FRESH = 10 * 60 * 1000
const KEEP = 90 * 86400000
const MAX_SITES = 20
const LOCAL_KEEP = 7 * 86400000
const MAX_LOCAL = 5
const prefix = projectId => `seen:${projectId}:`

// Loopback, private and link-local addresses, local-only names, and wildcard
// DNS names (like nip.io) that point at a private address.
const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$)/
export function isLocal(origin) {
  let host
  try { host = new URL(origin).hostname.toLowerCase() } catch { return false }
  if (host === 'localhost' || /\.(localhost|local|test|internal|home\.arpa)$/.test(host)) return true
  if (host.startsWith('[')) return /^\[(::1?|f[cd][0-9a-f]*:.*|fe80:.*)\]$/.test(host)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return PRIVATE_V4.test(host)
  const embedded = /(?:^|[.-])(\d+[.-]\d+[.-]\d+[.-]\d+)\.(?:nip\.io|sslip\.io)$/.exec(host)
  return !!embedded && PRIVATE_V4.test(embedded[1].replace(/-/g, '.'))
}

// Noting a site must never break the request it rides on.
export function seen(projectId, value) {
  try {
    const url = new URL(String(value || '').slice(0, 300))
    if (!/^https?:$/.test(url.protocol)) return
    const key = prefix(projectId) + url.origin
    const last = Number(kv().get(key)) || 0
    if (last && now() - last < FRESH) return
    const local = isLocal(url.origin)
    const alike = installs(projectId).filter(entry => entry.local === local).length
    if (!last && alike >= (local ? MAX_LOCAL : MAX_SITES)) return
    kv().set(key, now(), local ? LOCAL_KEEP : KEEP)
  } catch (error) { console.warn('seen', String(error)) }
}

export function installs(projectId) {
  return (kv().list(prefix(projectId)) || [])
    .map(entry => {
      const origin = entry.key.slice(prefix(projectId).length)
      return { origin, seenAt: iso(Number(entry.value)), local: isLocal(origin) }
    })
    .sort((a, b) => b.seenAt.localeCompare(a.seenAt))
}

export function removeInstalls(projectId) {
  for (const entry of kv().list(prefix(projectId)) || []) kv().delete(entry.key)
}
