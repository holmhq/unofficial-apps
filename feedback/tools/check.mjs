// Checks the app shell before a release:
//  - sw.js keeps every file the page can load (installed with the app, or kept on first use),
//    and its VERSION matches holm.json, so each deploy installs a fresh set.
//  - sw.js treats file addresses as files and page addresses as pages, and never answers
//    for anything sent through the API, sign-in or Holm's own pages.
// Run: node feedback/tools/check.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const web = join(app, 'web')
const sw = readFileSync(join(web, 'sw.js'), 'utf8')
const list = (name) => new Set(eval(sw.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\])`))[1]))
const files = new Set([...list('FILES'), ...[...list('DOCS')].map((path) => path + '.html')])
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
// Holm redirects /x.html to /x, and a redirected response can't answer a page: the
// worker must keep no .html address.
for (const path of list('FILES')) assert.ok(!path.endsWith('.html'), `sw.js keeps ${path}, which Holm redirects`)
const version = JSON.parse(readFileSync(join(app, 'holm.json'), 'utf8')).version
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')

const FILE = eval(sw.match(/const FILE = (\/.*\/[a-z]*)\n/)[1])
const PASS = eval(sw.match(/const PASS = (\/.*\/[a-z]*)\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/embed.js', '/changelog.json', '/src/app.js']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/projects/ab12cd34', '/projects/ab12cd34/items/12', '/b/ab12cd34', '/my-cafe', '/changelog', '/mine', '/v/0123456789abcdef0123456789abcdef']) assert.ok(!FILE.test(path) && !PASS.test(path), `sw.js doesn't open the shell for the page ${path}`)
for (const path of ['/api/projects', '/auth/login', '/_holm/mcp', '/_a/x', '/sw.js', '/.well-known/x', '/llms.txt', '/widget.html', '/preview.html']) assert.ok(PASS.test(path), `sw.js must pass ${path} straight through`)
console.log('feedback: sw.js ok (' + files.size + ' files, ' + lazy.size + ' kept on first use)')
