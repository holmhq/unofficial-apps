// Checks Deck's release invariants: node tools/check.mjs (not deployed)
//  - sw.js precaches every file the app and its shared pages load, or names it as left out,
//    and its VERSION matches holm.json;
//  - every ?v= in the pages and the code asks for that version;
//  - sw.js treats file addresses as files, app addresses as the shell, and leaves the pages
//    the server writes (shared decks, presenting, upload links) and Holm's own to the network.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const version = JSON.parse(readFileSync(new URL('holm.json', root), 'utf8')).version
const sw = readFileSync(new URL('sw.js', web), 'utf8')

const walk = (dir) => readdirSync(new URL(dir, web)).flatMap((name) => {
  const rel = dir + name
  return statSync(new URL(rel, web)).isDirectory() ? walk(rel + '/') : [rel]
})
const all = walk('').map((f) => '/' + f)
// Left out on purpose: the upload page (opened once, on a phone), the 404 page, the feedback
// script (loaded only when someone asks for it), store and home-screen pictures, licences.
const OUT = [/^\/upload\.(html|css|js)$/, /^\/src\/upload\.(css|js)$/, /^\/404\.html$/, /^\/vendor\//, /^\/fonts\/OFL/, /^\/(icon-512|icon-maskable-512|social_preview)\.png$/, /^\/sw\.js$/, /^\/(index|view)\.html$/]
const listed = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"')))
for (const file of all) assert.ok(listed.has(file) || OUT.some((re) => re.test(file)), `sw.js doesn't list ${file}`)
for (const file of listed) if (file !== '/') statSync(new URL('.' + file, web))
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')

for (const file of all.filter((f) => /\.(html|js|css)$/.test(f) && !f.startsWith('/vendor/'))) {
  const text = readFileSync(new URL('.' + file, web), 'utf8')
  for (const m of text.matchAll(/\?v=([\d.]+)/g)) assert.equal(m[1], version, `${file} asks for ?v=${m[1]}, not ${version}`)
}

const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
const PASS = new RegExp(sw.match(/const PASS = \/(.+)\/\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/img/sample-shot.webp', '/fonts/inter-latin-opsz-normal.woff2']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/w/afwo4qgmwb', '/w/afwo4qgmwb/library', '/d/ntdo4vvmzdrd', '/join/abcdefghij', '/new']) assert.ok(!FILE.test(path) && !PASS.test(path), `sw.js doesn't open the shell for the page ${path}`)
for (const path of ['/s/abcdefghijklmnop', '/e/abcdefghijklmnop', '/p/ntdo4vvmzdrd', '/sample', '/upload/abcdefghijklmnopqrstuvwx', '/api/me', '/_holm/mcp', '/_ws', '/_a1/analytics', '/auth/login', '/media/abc123-w320', '/sw.js']) assert.ok(PASS.test(path), `sw.js must leave ${path} to the network`)
console.log(`ok: ${listed.size} files at ${version}`)
