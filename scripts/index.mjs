#!/usr/bin/env node
// Build or check the repository index: one entry per app folder, pinned by the
// h1 fingerprint of the files Holm would deploy.
//
//   node scripts/index.mjs           rewrite index.json
//   node scripts/index.mjs --check   fail if index.json is stale, or an app changed
//                                    after its version was tagged
//   node scripts/index.mjs --tag     tag HEAD as <app>/v<version> where missing
//
// h1 is Go's dirhash.Hash1 with no prefix: for each file in byte order, the
// SHA-256 hex of its contents, two spaces, its path and a newline; then
// "h1:" and the base64 SHA-256 of that summary.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const INDEX = join(ROOT, 'index.json')
const REPOSITORY = 'github.com/holmhq/unofficial-apps'
const EXT = 'com.holmhq.unofficial'

const git = (args, options = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 << 20, ...options })
const sha256 = bytes => createHash('sha256').update(bytes).digest()

// Holm skips hidden paths (except a root .well-known/), node_modules and *.log.
function deployable(path) {
  const parts = path.split('/')
  if (parts.some((part, i) => part.startsWith('.') && !(i === 0 && part === '.well-known'))) return false
  return !parts.includes('node_modules') && !path.endsWith('.log')
}

function h1(files) {
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  let summary = ''
  for (const file of sorted) {
    if (file.path.includes('\n')) throw new Error(`${file.path}: newline in file name`)
    summary += sha256(file.bytes()).toString('hex') + '  ' + file.path + '\n'
  }
  return 'h1:' + sha256(summary).toString('base64')
}

// Tracked and untracked-but-not-ignored files, as a directory deploy would see them.
function workingFiles(dir) {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir + '/']).toString()
  const paths = [...new Set(out.split('\0').filter(Boolean))].filter(path => existsSync(join(ROOT, path)))
  return paths.map(full => {
    if (!lstatSync(join(ROOT, full)).isFile()) throw new Error(`${full}: only regular files can be deployed`)
    return { path: full.slice(dir.length + 1), bytes: () => readFileSync(join(ROOT, full)) }
  }).filter(file => deployable(file.path))
}

function taggedFiles(tag, dir) {
  const out = git(['ls-tree', '-r', '-z', '--full-tree', tag, '--', dir + '/']).toString()
  return out.split('\0').filter(Boolean).map(line => {
    const [meta, full] = line.split('\t')
    const [mode, , object] = meta.split(' ')
    if (mode === '120000') throw new Error(`${tag}: ${full} is a symlink`)
    return { path: full.slice(dir.length + 1), bytes: () => git(['cat-file', 'blob', object]) }
  }).filter(file => deployable(file.path))
}

function tagExists(tag) {
  try { git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { stdio: 'pipe' }); return true } catch { return false }
}

function readApp(dir) {
  const manifestPath = ['holm.json', 'manifest.json'].map(name => join(ROOT, dir, name)).find(existsSync)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const where = `${dir}/${manifestPath.split('/').pop()}`
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) throw new Error(`${where}: needs a "version" like 0.1.0`)
  if (manifest.publish) throw new Error(`${where}: "publish" filters are not handled by this script yet`)
  const files = workingFiles(dir)
  const ext = (manifest.ext && manifest.ext[EXT]) || {}
  const entry = {
    name: manifest.name || dir,
    path: dir,
    version: manifest.version,
    tag: `${dir}/v${manifest.version}`,
    h1: h1(files),
    files: files.length,
    title: manifest.title || manifest.name || dir,
    description: manifest.description || '',
    themeColor: manifest.themeColor || (manifest.display && manifest.display.color) || null,
    demo: ext.demo || null
  }
  for (const key of Object.keys(entry)) if (entry[key] === null) delete entry[key]
  return entry
}

// An app folder is a top-level directory with a holm.json or manifest.json.
function appDirs() {
  return readdirSync(ROOT).filter(name => !name.startsWith('.') && statSync(join(ROOT, name)).isDirectory())
    .filter(name => existsSync(join(ROOT, name, 'holm.json')) || existsSync(join(ROOT, name, 'manifest.json')))
    .sort()
}

function build() {
  return { schema: 1, repository: REPOSITORY, apps: appDirs().map(readApp) }
}

const render = index => JSON.stringify(index, null, 2) + '\n'
const mode = process.argv[2] || ''
const index = build()

if (mode === '') {
  writeFileSync(INDEX, render(index))
  for (const app of index.apps) console.log(`${app.tag}  ${app.h1}  ${app.files} files`)
} else if (mode === '--check') {
  const problems = []
  if (!existsSync(INDEX) || readFileSync(INDEX, 'utf8') !== render(index)) {
    problems.push('index.json is stale: run `node scripts/index.mjs` and commit it')
  }
  for (const app of index.apps) {
    if (!tagExists(app.tag)) { console.log(`${app.tag}: no such tag here (unreleased, or not fetched)`); continue }
    const tagged = h1(taggedFiles(app.tag, app.path))
    if (tagged === app.h1) console.log(`${app.tag}: matches ${app.h1}`)
    else problems.push(`${app.path} changed since ${app.tag} (${tagged}); bump "version" in its manifest`)
  }
  for (const problem of problems) console.error(problem)
  process.exit(problems.length ? 1 : 0)
} else if (mode === '--tag') {
  for (const app of index.apps) {
    if (tagExists(app.tag)) continue
    if (h1(taggedFiles('HEAD', app.path)) !== app.h1) {
      console.error(`${app.path}: uncommitted changes; commit before tagging`)
      process.exit(1)
    }
    git(['tag', '-a', app.tag, '-m', `${app.name} ${app.version}\n\n${app.h1}`])
    console.log(`tagged ${app.tag}`)
  }
} else {
  console.error('usage: node scripts/index.mjs [--check | --tag]')
  process.exit(2)
}
