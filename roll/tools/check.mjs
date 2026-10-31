// Checks Roll's release invariants: node tools/check.mjs
//  - sw.js precaches every page file, and its VERSION matches holm.json;
//  - index.html loads its code at that version;
//  - sw.js treats file addresses as files and page addresses as pages.
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
const code = [...walk('src/', 'src/'), ...walk('vendor/', 'vendor/').filter((f) => f.endsWith('.js') && !f.includes('feedback'))].map((f) => '/' + f)
const listed = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"')))
for (const file of code) assert.ok(listed.has(file), `sw.js doesn't list ${file}`)
for (const file of listed) if (file !== '/') statSync(new URL('.' + file, web))
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')
for (const m of index.matchAll(/\?v=([\d.]+)/g)) assert.equal(m[1], version, 'index.html must load ?v=' + version)

const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/samples/01.jpg', '/s/abc/cover.jpg']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/albums', '/albums/abc-123', '/places/Lisbon, Portugal', '/search', '/trash']) assert.ok(!FILE.test(path), `sw.js treats the page ${path} as a file`)
console.log(`ok: ${listed.size} files at ${version}`)
