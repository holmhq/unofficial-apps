// Checks Margin's release invariants: node tools/check.mjs (not deployed)
//  - sw.js precaches every file Studio loads, or keeps it on first use, and its VERSION
//    matches holm.json;
//  - Studio's page asks for its code at that version;
//  - sw.js answers Studio's addresses with the shell and leaves every reader page (home,
//    workspaces, writers, posts, previews) and Holm's own to the network.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const version = JSON.parse(readFileSync(new URL('holm.json', root), 'utf8')).version
const sw = readFileSync(new URL('sw.js', web), 'utf8')
const studio = readFileSync(new URL('studio.html', web), 'utf8')

const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"'))
const LAZY = new RegExp(sw.match(/const LAZY = \/(.+)\/\n/)[1])
const STUDIO = new RegExp(sw.match(/const STUDIO = \/(.+)\/\n/)[1])
for (const file of files) if (file !== '/studio') statSync(new URL('.' + file, web))
for (const name of readdirSync(new URL('studio/', web))) assert.ok(files.includes('/studio/' + name), `sw.js doesn't list /studio/${name}`)
for (const name of readdirSync(new URL('vendor/editor/', web)).filter((f) => f.endsWith('.js'))) assert.ok(files.includes('/vendor/editor/' + name), `sw.js doesn't list /vendor/editor/${name}`)
for (const path of ['/vendor/katex/katex.mjs', '/vendor/katex/katex.css', '/vendor/katex/fonts/KaTeX_Main-Regular.woff2', '/margin/covers.js']) assert.ok(LAZY.test(path), `sw.js doesn't keep ${path}`)
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')
const server = readFileSync(new URL('api/lib/cache.js', root), 'utf8')
assert.equal(server.match(/export const VERSION = '([^']+)'/)[1], version, 'api/lib/cache.js VERSION must match holm.json')
for (const m of studio.matchAll(/\?v=([\d.]+)/g)) assert.equal(m[1], version, 'studio.html must load ?v=' + version)

for (const path of ['/studio', '/studio/bodesk', '/studio/bodesk/comments', '/studio/write', '/studio/write/3f1fca6c-45f3', '/studio/you', '/new', '/join/abc123']) assert.ok(STUDIO.test(path), `sw.js doesn't open Studio at ${path}`)
for (const path of ['/', '/bodesk', '/@bo', '/bodesk/@bo/published-by-bo', '/studio/preview/3f1fca6c-45f3', '/studios', '/api/me', '/_holm/mcp', '/auth/login', '/upload/abcdefghijklmnopqrstuvwx', '/icon-512.png']) assert.ok(!STUDIO.test(path), `sw.js must leave ${path} to the network`)
console.log(`ok: ${files.length} files at ${version}`)
