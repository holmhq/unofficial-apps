import { holm } from "./_holm.js";
// Reads the repository's index.json at a ref, the way a node reading a trusted
// repository would, and keeps the last good copy in KV. Screenshots named in
// the index are fetched the same way and cached in blob storage.
export const SOURCE = 'https://raw.githubusercontent.com/holmhq/unofficial-apps/'
export const REF = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/
const FRESH_MS = 5 * 60 * 1000
const H1 = /^h1:[A-Za-z0-9+/]{43}=$/
const COLOR = /^#[0-9a-fA-F]{6}$/
const SYMBOL = /^[MLHVCSQTAZ0-9. -]{1,8000}$/
const SHOT = /^listing\/[A-Za-z0-9._-]{1,80}\.(png|webp)$/
const TYPES = { png: 'image/png', webp: 'image/webp' }

const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''
const size = value => Number.isInteger(value) && value > 0 && value < 1e9 ? value : null
const publicError = message => Object.assign(new Error(message), { public: true })

function cleanListing(listing) {
  if (!listing || typeof listing !== 'object') return null
  return {
    subtitle: text(listing.subtitle, 60),
    category: text(listing.category, 40),
    description: text(listing.description, 4000),
    whatsNew: text(listing.whatsNew, 2000),
    featured: listing.featured === true,
    screenshots: (Array.isArray(listing.screenshots) ? listing.screenshots : []).slice(0, 10)
      .filter(shot => shot && SHOT.test(shot.path || '') && size(shot.width) && size(shot.height))
      .map(shot => ({ path: shot.path, alt: text(shot.alt, 200), width: shot.width, height: shot.height }))
  }
}

// Keep only fields the store understands, in the shapes it expects.
function clean(index) {
  if (!index || index.schema !== 1 || !Array.isArray(index.apps)) throw publicError('index.json is not schema 1')
  const apps = index.apps.slice(0, 200).map(app => ({
    name: text(app.name, 48),
    path: /^[a-z0-9][a-z0-9-]{0,63}$/.test(app.path || '') ? app.path : '',
    version: /^\d+\.\d+\.\d+$/.test(app.version || '') ? app.version : '',
    tag: text(app.tag, 120),
    h1: H1.test(app.h1 || '') ? app.h1 : '',
    files: size(app.files),
    size: size(app.size),
    title: text(app.title, 80),
    description: text(app.description, 400),
    themeColor: COLOR.test(app.themeColor || '') ? app.themeColor : null,
    symbol: SYMBOL.test(app.symbol || '') ? app.symbol : null,
    demo: /^https:\/\/[^\s"'<>]+$/.test(app.demo || '') ? app.demo : null,
    listing: cleanListing(app.listing),
    prompt: text(app.prompt, 4000) || null
  })).filter(app => app.path && app.version && app.h1)
  return { schema: 1, repository: text(index.repository, 200), apps }
}

export function readIndex(ref) {
  const key = 'index:' + ref
  const cached = holm.app.kv.get(key)
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return { ...cached, ref }
  try {
    const response = holm.net.fetch(SOURCE + ref + '/index.json', { timeout: 8000 })
    if (!response.ok) throw publicError(`GitHub answered ${response.status} for index.json at "${ref}"`)
    const fresh = { index: clean(response.json()), fetchedAt: Date.now() }
    holm.app.kv.set(key, fresh)
    return { ...fresh, ref }
  } catch (error) {
    if (cached) return { ...cached, ref, stale: true }
    throw error
  }
}

// A screenshot listed in the index at this ref, from the blob cache or GitHub.
// Blobs written from a fetched file can't expire on their own, so a KV key
// with a TTL marks the cached copy fresh; a stale copy still serves if GitHub
// doesn't answer.
export function readScreenshot(ref, appPath, path) {
  const app = readIndex(ref).index.apps.find(app => app.path === appPath)
  const shot = app && app.listing && app.listing.screenshots.find(shot => shot.path === path)
  if (!shot) throw Object.assign(publicError('No such screenshot in the index.'), { status: 404 })
  const key = `screenshots/${ref}/${appPath}/${path}`
  const type = TYPES[path.split('.').pop()]
  const cached = holm.app.s3.get(key)
  if (cached && holm.app.kv.get('fresh:' + key)) return { data: cached.data, type }
  try {
    const remote = holm.net.fetch(`${SOURCE}${ref}/${appPath}/${path}`, { timeout: 10000, responseType: 'file' })
    if (!remote.ok) throw publicError(`GitHub answered ${remote.status} for ${appPath}/${path}`)
    holm.app.s3.put(key, remote.file, type)
    holm.app.kv.set('fresh:' + key, true, ref === 'main' ? 3600000 : 86400000)
    return { data: holm.app.s3.get(key).data, type }
  } catch (error) {
    if (cached) return { data: cached.data, type }
    throw error
  }
}
