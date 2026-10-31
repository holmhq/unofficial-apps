#!/usr/bin/env node
// Checks that need no browser: the names made from a few inputs, and the service worker's
// file list against web/ (every page file precached, nothing listed that isn't there, page
// addresses shelled and file addresses spared).
//
//   node tools/check.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse, labels, expand } from '../web/src/gen.js'

const WEB = new URL('../web/', import.meta.url).pathname
const holm = JSON.parse(readFileSync(new URL('../holm.json', import.meta.url), 'utf8'))
const catalog = JSON.parse(readFileSync(join(WEB, 'data/tlds.json'), 'utf8')).tlds.map((t) => t.t)
const isTld = (t) => catalog.includes(t)
let failed = 0
const check = (ok, what) => { if (!ok) { failed++; console.error('FAIL', what) } }

// Names.
const zach = labels(parse('Zacharia', isTld), { max: 8, kinds: { affix: false } }).map((l) => l.label)
for (const want of ['zacharia', 'zach', 'zack', 'zak', 'zac', 'zchr']) check(zach.includes(want), `Zacharia gives ${want}`)
check(!zach.includes('sac'), 'Zacharia does not give sac')
check(labels(parse('flicker', isTld)).some((l) => l.label === 'flickr'), 'flicker gives flickr')
check(labels(parse('harbour labs', isTld)).some((l) => l.label === 'hl'), 'harbour labs gives hl')
const typed = parse('https://www.Zoë.io', isTld)
check(typed.words[0] === 'zoe' && typed.typedTld === 'io', 'a pasted address folds to zoe + io')
const hacks = expand(labels(parse('internet', isTld)), ['com'], { hackTlds: catalog.filter((t) => t.length <= 3) })
check(hacks.some((c) => c.domain === 'inter.net'), 'internet gives inter.net')
check(expand(labels(parse('zack.io', isTld)), ['com'], { typed: 'io' })[0].domain === 'zack.io', 'a typed name is checked first')
check(zach.every((l) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l)), 'every label is a valid label')

// Service worker.
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8')
check(sw.includes(`const VERSION = '${holm.version}'`), `sw.js VERSION is ${holm.version}`)
const files = [...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
for (const f of files) {
  if (f === '/') continue
  const path = f.split('?')[0]
  check(existsSync(join(WEB, path)), `${f} exists in web/`)
  if (f.includes('?v=')) check(f.endsWith('?v=' + holm.version), `${f} carries the version`)
}
const walk = (dir) => readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])
for (const f of walk(join(WEB, 'src'))) check(files.includes('/' + relative(WEB, f)) || files.some((x) => x.startsWith('/' + relative(WEB, f) + '?')), `${relative(WEB, f)} is precached`)
const shell = readFileSync(join(WEB, 'shell.html'), 'utf8')
for (const m of shell.matchAll(/\?v=([\d.]+)/g)) check(m[1] === holm.version, `shell.html asks for ?v=${holm.version}`)
const FILE = new RegExp(sw.match(/const FILE = \/(.+)\/i/)[1], 'i')
for (const p of ['/', '/saved', '/about']) check(!FILE.test(p), `${p} opens the app`)
for (const p of ['/icon-512.png', '/manifest.webmanifest', '/data/tlds.json']) check(FILE.test(p), `${p} is a file`)

console.log(failed ? `${failed} failed` : 'all checks passed')
process.exit(failed ? 1 : 0)
