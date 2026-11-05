// Checks Until's release invariants: node tools/check.mjs
//  - sw.js precaches every page file, and its VERSION matches holm.json;
//  - sw.js treats file addresses as files and page addresses as pages, and leaves Holm's own
//    paths, the API and sign-in alone;
//  - every MCP tool checks its caller (auth "user").
import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const version = JSON.parse(readFileSync(new URL('holm.json', root), 'utf8')).version
const sw = readFileSync(new URL('sw.js', web), 'utf8')

const code = [
  ...readdirSync(new URL('src/', web)).map((f) => 'src/' + f),
  ...readdirSync(new URL('fonts/', web)).filter((f) => f.endsWith('.woff2')).map((f) => 'fonts/' + f)
].map((f) => '/' + f)
const listed = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"')))
for (const file of code) assert.ok(listed.has(file), `sw.js doesn't list ${file}`)
for (const file of listed) if (file !== '/') statSync(new URL('.' + file, web))
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')

const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
const PASS = new RegExp(sw.match(/const PASS = \/(.+)\/\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/social_preview.png', '/fonts/manrope-latin.woff2']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/anything']) assert.ok(!FILE.test(path) && !PASS.test(path), `sw.js doesn't give the page ${path} the shell`)
for (const path of ['/_holm/mcp', '/_analytics/x', '/api/countdowns', '/auth/login', '/sw.js']) assert.ok(PASS.test(path), `sw.js answers ${path} itself`)
console.log(`ok: ${listed.size} files at ${version}`)

const contract = JSON.parse(readFileSync(new URL('api/contract.json', root), 'utf8'))
for (const [key, op] of Object.entries(contract.operations)) assert.equal(op.auth, 'user', `${key} must check the caller itself (auth "user")`)
console.log(`ok: ${Object.keys(contract.operations).length} tools`)
