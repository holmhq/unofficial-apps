// Reads the repository's index.json at a ref, the way a node reading a trusted
// repository would, and keeps the last good copy in KV.
export const SOURCE = 'https://raw.githubusercontent.com/holmhq/unofficial-apps/'
export const REF = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/
const FRESH_MS = 5 * 60 * 1000
const H1 = /^h1:[A-Za-z0-9+/]{43}=$/
const COLOR = /^#[0-9a-fA-F]{6}$/

const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''

// Keep only fields the catalog understands, in the shapes it expects.
function clean(index) {
  if (!index || index.schema !== 1 || !Array.isArray(index.apps)) throw Object.assign(new Error('index.json is not schema 1'), { public: true })
  const apps = index.apps.slice(0, 200).map(app => ({
    name: text(app.name, 48),
    path: /^[a-z0-9][a-z0-9-]{0,63}$/.test(app.path || '') ? app.path : '',
    version: /^\d+\.\d+\.\d+$/.test(app.version || '') ? app.version : '',
    tag: text(app.tag, 120),
    h1: H1.test(app.h1 || '') ? app.h1 : '',
    files: Number.isInteger(app.files) ? app.files : null,
    title: text(app.title, 80),
    description: text(app.description, 400),
    themeColor: COLOR.test(app.themeColor || '') ? app.themeColor : null,
    demo: /^https:\/\/[^\s"'<>]+$/.test(app.demo || '') ? app.demo : null
  })).filter(app => app.path && app.version && app.h1)
  return { schema: 1, repository: text(index.repository, 200), apps }
}

export function readIndex(ref) {
  const key = 'index:' + ref
  const cached = holm.app.kv.get(key)
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return { ...cached, ref }
  try {
    const response = holm.net.fetch(SOURCE + ref + '/index.json', { timeout: 8000 })
    if (!response.ok) throw Object.assign(new Error(`GitHub answered ${response.status} for index.json at "${ref}"`), { public: true })
    const fresh = { index: clean(response.json()), fetchedAt: Date.now() }
    holm.app.kv.set(key, fresh)
    return { ...fresh, ref }
  } catch (error) {
    if (cached) return { ...cached, ref, stale: true }
    throw error
  }
}
