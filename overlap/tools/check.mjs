// Checks the app shell before a release:
//  - sw.js keeps every file the page can load (installed with the app, or kept on first use),
//    and its VERSION matches holm.json, so each deploy installs a fresh set.
//  - sw.js treats file addresses as files and page addresses as pages, and never answers
//    for plans, the live socket, sign-in or Holm's own pages.
// Run: node overlap/tools/check.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const web = join(app, 'web')
const sw = readFileSync(join(web, 'sw.js'), 'utf8')
const list = (name) => new Set(eval(sw.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\])`))[1]))
const files = list('FILES')
const lazy = list('LAZY')
const walk = (dir) => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])
const skip = /(^\/sw\.js$|^\/index\.html$|LICENSE$|\.txt$)/
for (const path of walk(web).map((f) => '/' + relative(web, f).split('\\').join('/'))) {
  if (skip.test(path)) continue
  assert.ok(files.has(path) || lazy.has(path), `sw.js doesn't list ${path}`)
}
for (const path of [...files, ...lazy]) {
  if (path === '/') continue
  assert.ok(statSync(join(web, path)).isFile(), `sw.js lists ${path}, which isn't in web/`)
}
const version = JSON.parse(readFileSync(join(app, 'holm.json'), 'utf8')).version
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')

const FILE = eval(sw.match(/const FILE = (\/.*\/[a-z]*)\n/)[1])
const PASS = eval(sw.match(/const PASS = (\/.*\/[a-z]*)\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/social_preview.png', '/js/app.js']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/new', '/p/ab3de9xyz2']) assert.ok(!FILE.test(path) && !PASS.test(path), `sw.js doesn't open the shell for the page ${path}`)
for (const path of ['/api/plans', '/auth/login', '/_holm/mcp', '/_ws', '/_a/x', '/sw.js', '/.well-known/x']) assert.ok(PASS.test(path), `sw.js must pass ${path} straight through`)
console.log('overlap: sw.js ok (' + files.size + ' files, ' + lazy.size + ' kept on first use)')
