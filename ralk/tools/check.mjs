// Checks Ralk's release invariants (not deployed): node ralk/tools/check.mjs
//  - sw.js precaches every page file, each one exists, and its VERSION matches holm.json;
//  - index.html loads its code without a version of its own (sw.js is the version);
//  - sw.js treats file addresses as files and page addresses as pages, and lets Holm's own
//    pages (/_…), /api/ and /auth/ through untouched;
//  - every MCP tool checks the caller itself, except the guide and the sound catalog, which
//    anyone may read.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const version = JSON.parse(readFileSync(new URL('holm.json', root), 'utf8')).version
const sw = readFileSync(new URL('sw.js', web), 'utf8')
const index = readFileSync(new URL('index.html', web), 'utf8')

const walk = (dir, base = '') => readdirSync(new URL(dir, web)).flatMap((name) => {
  const rel = base + name
  return statSync(new URL(dir + name, web)).isDirectory() ? walk(dir + name + '/', rel + '/') : [rel]
})
const code = [...walk('src/', 'src/'), ...walk('vendor/', 'vendor/').filter((f) => f.endsWith('.js'))].map((f) => '/' + f)
const listed = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"')))
for (const file of code) assert.ok(listed.has(file), `sw.js doesn't list ${file}`)
for (const file of listed) if (file !== '/') statSync(new URL('.' + file, web))
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')
assert.ok(!/\?v=/.test(index), 'index.html loads its files by their plain addresses, which sw.js keeps')

const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
const PASS = new RegExp(sw.match(/const PASS = \/(.+)\/\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/favicon.svg', '/fonts/inter-latin.woff2']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/sounds', '/voice', '/connect']) assert.ok(!FILE.test(path), `sw.js treats the page ${path} as a file`)
for (const path of ['/_holm/mcp', '/_analytics', '/_analytics/x', '/api/me', '/auth/login', '/sw.js']) assert.ok(PASS.test(path), `sw.js must let ${path} through`)
for (const path of ['/', '/sounds', '/src/main.js', '/icon-512.png']) assert.ok(!PASS.test(path), `sw.js must answer ${path}`)

const contract = JSON.parse(readFileSync(new URL('api/contract.json', root), 'utf8'))
const OPEN = new Set(['guide.get', 'sounds.list'])
for (const [key, op] of Object.entries(contract.operations)) assert.equal(op.auth, OPEN.has(key) ? 'public' : 'user', `${key} must check the caller itself (auth "user")`)
console.log(`ok: ${listed.size} files at ${version}; ${Object.keys(contract.operations).length} tools`)
