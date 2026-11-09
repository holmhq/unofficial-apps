// Checks SwarmChat's release invariants (not deployed): node swarmchat/tools/check.mjs
//  - sw.js precaches every page file, each one exists, and its VERSION matches holm.json;
//  - sw.js treats file addresses as files and page addresses as pages (the viewer at /s/<swarm> gets its own
//    page), and lets Holm's own pages (/_…), /api/, /v1/, /mcp, /auth/ and the agent client through;
//  - every MCP tool for people checks the caller itself (auth "user");
//  - contract.json is what tools/contract.py writes;
//  - nothing private: no home paths, and no local hosts outside tests and tools.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const web = new URL('web/', root)
const version = JSON.parse(readFileSync(new URL('holm.json', root), 'utf8')).version
const sw = readFileSync(new URL('sw.js', web), 'utf8')

const walk = (dir, base = '') => readdirSync(new URL(dir, web)).flatMap((name) => {
  const rel = base + name
  return statSync(new URL(dir + name, web)).isDirectory() ? walk(dir + name + '/', rel + '/') : [rel]
})
const code = [...walk('src/', 'src/'), ...walk('vendor/', 'vendor/').filter((f) => /\.(js|css)$/.test(f))].map((f) => '/' + f)
const listed = new Set(JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\])/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']')))
for (const file of code) assert.ok(listed.has(file), `sw.js doesn't list ${file}`)
for (const file of listed) if (file !== '/' && file !== '/viewer') statSync(new URL('.' + file, web))
if (listed.has('/viewer')) statSync(new URL('viewer.html', web))
assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], version, 'sw.js VERSION must match holm.json')

const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
const PASS = new RegExp(sw.match(/const PASS = \/(.+)\/\n/)[1])
const VIEWER = new RegExp(sw.match(/const VIEWER = \/(.+)\/\n/)[1])
for (const path of ['/icon-512.png', '/manifest.webmanifest', '/favicon.svg', '/fonts/inter-latin.woff2', '/swarmchat.mjs']) assert.ok(FILE.test(path), `sw.js opens the shell for the file ${path}`)
for (const path of ['/', '/w/w0123456789ab', '/s/s0123456789abcd', '/s/s0123456789abcd/manage', '/admin', '/i/' + 'a'.repeat(32)]) assert.ok(!FILE.test(path), `sw.js treats the page ${path} as a file`)
for (const path of ['/_holm/mcp', '/_analytics', '/api/me', '/v1/send', '/mcp', '/auth/login', '/sw.js', '/swarmchat.mjs', '/dev/swarm']) assert.ok(PASS.test(path), `sw.js must let ${path} through`)
for (const path of ['/', '/w/w0123456789ab', '/src/main.js', '/icon-512.png']) assert.ok(!PASS.test(path), `sw.js must answer ${path}`)
assert.ok(VIEWER.test('/s/s0123456789abcd') && !VIEWER.test('/s/s0123456789abcd/manage'), 'only /s/<swarm> is the viewer')

const contract = JSON.parse(readFileSync(new URL('api/contract.json', root), 'utf8'))
for (const [key, op] of Object.entries(contract.operations)) assert.equal(op.auth, 'user', `${key} must check the caller itself (auth "user")`)
const fresh = execFileSync('python3', [new URL('tools/contract.py', root).pathname, '--print'], { encoding: 'utf8' })
assert.equal(fresh.trim(), JSON.stringify(contract, null, 2), 'api/contract.json is stale: run python3 tools/contract.py')

const all = execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', '.'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
for (const f of all) {
  if (!/\.(js|mjs|json|md|html|css|py)$/.test(f)) continue
  const text = readFileSync(new URL(f, root), 'utf8')
  assert.ok(!/\/home\/|\/scratch\//.test(text), `${f} mentions a private path`)
  if (!f.startsWith('test/') && !f.startsWith('tools/')) assert.ok(!/localhost:8080|swarmchat-port/.test(text), `${f} names a local host`)
}
console.log(`ok: ${listed.size} files at ${version}; ${Object.keys(contract.operations).length} tools`)
