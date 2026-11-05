#!/usr/bin/env node
// Checks that need no browser, for the store's service worker (web/sw.js): its VERSION is
// holm.json's, it keeps every file the pages load and lists nothing that isn't in web/,
// page addresses get the kept page while file addresses stay files, and Holm's own
// addresses (/_…), the API and sign-in always go to the network. Not deployed.
//
//   node catalog/tools/check.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import assert from 'node:assert/strict'

const WEB = new URL('../web/', import.meta.url).pathname
const holm = JSON.parse(readFileSync(new URL('../holm.json', import.meta.url), 'utf8'))
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8')

assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], holm.version, 'sw.js VERSION must match holm.json')
const files = [...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
for (const f of files) if (f !== '/') assert.ok(existsSync(join(WEB, f)), `sw.js lists ${f}, which isn't in web/`)
const walk = (dir) => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])
for (const f of [...walk(join(WEB, 'src')), ...walk(join(WEB, 'assets')).filter((f) => !f.endsWith('.txt')), join(WEB, 'vendor/feedback/embed.js'), join(WEB, 'vendor/hairline/kernel.js')]) {
  assert.ok(files.includes('/' + relative(WEB, f)), `sw.js doesn't keep ${relative(WEB, f)}`)
}
const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
const PASS = new RegExp(sw.match(/const PASS = \/(.+)\/\n/)[1])
for (const p of ['/', '/apps/shelf', '/apps/3dsvg', '/start', '/admin']) assert.ok(!FILE.test(p) && !PASS.test(p), `${p} should get the kept page`)
for (const p of ['/icon-512.png', '/llms.txt', '/manifest.webmanifest', '/assets/fonts/fragment-mono.woff2']) assert.ok(FILE.test(p), `${p} should stay a file`)
for (const p of ['/_holm/mcp', '/_analytics/', '/api/index', '/api/media/shelf/cover.png', '/auth/login', '/sw.js']) assert.ok(PASS.test(p), `${p} should go to the network`)

console.log(`sw.js is version ${holm.version} and keeps all ${files.length} files`)
