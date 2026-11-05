#!/usr/bin/env node
// Checks 3dsvg's app shell before a release: the service worker installs a
// version all or nothing, so it must list every page file (all but the
// video converter, which loads the first time a video is made), carry the
// app's version so a deploy installs the new set, open a typed file address
// as that file, and let Holm's own pages, the server and share pages through.
// Usage: node tools/check.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'

const here = (path) => new URL('../' + path, import.meta.url)
let failed = 0
const fail = (message) => { failed++; console.log('FAIL  ' + message) }
const ok = (message) => console.log('ok    ' + message)

function walk(dir, out = []) {
  for (const name of readdirSync(here('web/' + dir))) {
    const path = dir + '/' + name
    if (statSync(here('web/' + path)).isDirectory()) walk(path, out)
    else out.push('/' + path)
  }
  return out
}

const sw = readFileSync(here('web/sw.js'), 'utf8')
const listed = new Set([...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
const wanted = [...walk('src'), ...walk('fonts'), ...walk('vendor')]
  .filter((path) => /\.(js|mjs|css|ttf|woff2)$/.test(path) && !path.startsWith('/vendor/ffmpeg/'))
const missing = wanted.filter((path) => !listed.has(path))
const absent = [...listed].filter((path) => { if (path === '/') return false; try { readFileSync(here('web' + path)); return false } catch { return true } })
if (missing.length) fail(`sw.js doesn't list ${missing.join(', ')}`)
else if (absent.length) fail(`sw.js lists missing files ${absent.join(', ')}`)
else ok(`sw.js lists all ${listed.size} page files`)

const version = JSON.parse(readFileSync(here('holm.json'), 'utf8')).version
if ((sw.match(/const VERSION = '([^']+)'/) || [])[1] !== version) fail(`sw.js VERSION must match holm.json (${version})`)
else ok(`sw.js VERSION is ${version}`)

const regex = (name) => { const [, body, flags] = sw.match(new RegExp(`const ${name} = \\/(.+)\\/([a-z]*)\\n`)); return new RegExp(body, flags) }
const FILE = regex('FILE')
const PASS = regex('PASS')
const files = ['/icon-512.png', '/manifest.webmanifest', '/fonts/text/oswald.ttf', '/vendor/three/three.module.min.js']
const pages = ['/', '/anything']
const through = ['/_holm/login', '/_a/analytics', '/api/me', '/auth/login', '/s/abcdefghijk', '/vendor/ffmpeg/core/ffmpeg-core.wasm', '/sw.js']
if (!files.every((path) => FILE.test(path))) fail('sw.js opens the shell for a file address')
else if (pages.some((path) => FILE.test(path))) fail('sw.js treats a page address as a file')
else if (!through.every((path) => PASS.test(path)) || PASS.test('/') || PASS.test('/src/app.js')) fail("sw.js must let Holm's pages, the server and share pages through, and only those")
else ok('sw.js tells files, pages and pass-through addresses apart')

process.exit(failed ? 1 : 0)
