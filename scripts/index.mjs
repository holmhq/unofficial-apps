#!/usr/bin/env node
// Build or check the repository index: one entry per app folder, with what a
// store needs to list it and the h1 fingerprint of the files Holm would deploy.
//
//   node scripts/index.mjs           rewrite index.json
//   node scripts/index.mjs --check   fail if index.json is stale, or an app changed
//                                    after its version was tagged
//   node scripts/index.mjs --tag     tag HEAD as <app>/v<version> where missing
//
// h1 is Go's dirhash.Hash1 with no prefix: for each file in byte order, the
// SHA-256 hex of its contents, two spaces, its path and a newline; then
// "h1:" and the base64 SHA-256 of that summary. Nodes keep it to notice a
// release tag that later points at different files; it is not shown to people.
//
// Each app also carries its version history, from its earlier release tags.
//
// An app's store listing lives in <app>/listing/ (listing.json, its
// screenshots and an optional 1200x630 cover.png from scripts/covers.mjs), kept
// out of the deploy with "publish": {"exclude": ["/listing/"]}. Each image
// carries a short content hash, so a store can cache it under a URL that
// changes whenever the image does.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const INDEX = join(ROOT, 'index.json')
const REPOSITORY = 'github.com/holmhq/unofficial-apps'
const EXT = 'com.holmhq.unofficial'
const SCREENSHOT_MAX = 600 * 1024

const git = (args, options = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 << 20, ...options })
const sha256 = bytes => createHash('sha256').update(bytes).digest()
const shortHash = bytes => sha256(bytes).toString('hex').slice(0, 12)
const fail = message => { throw new Error(message) }

// The subset of publish.exclude this script understands: plain names and
// paths, a leading "/" to anchor at the app root, a trailing "/" for folders.
function excluder(manifest, where) {
  const publish = manifest.publish || {}
  if (publish.include) fail(`${where}: "publish.include" is not handled by this script yet`)
  const patterns = (publish.exclude || []).map(pattern => {
    if (/[*?[\]!]/.test(pattern)) fail(`${where}: publish pattern "${pattern}" uses syntax this script doesn't handle yet`)
    const anchored = pattern.startsWith('/') || pattern.replace(/\/$/, '').includes('/')
    return { name: pattern.replace(/^\//, '').replace(/\/$/, ''), anchored }
  })
  return path => patterns.some(({ name, anchored }) => anchored
    ? path === name || path.startsWith(name + '/')
    : path.split('/').includes(name))
}

// Holm skips hidden paths (except a root .well-known/), node_modules, *.log
// and anything the manifest excludes.
function deployable(path, excluded) {
  const parts = path.split('/')
  if (parts.some((part, i) => part.startsWith('.') && !(i === 0 && part === '.well-known'))) return false
  return !parts.includes('node_modules') && !path.endsWith('.log') && !excluded(path)
}

function h1(files) {
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  let summary = ''
  for (const file of sorted) {
    if (file.path.includes('\n')) fail(`${file.path}: newline in file name`)
    summary += sha256(file.bytes()).toString('hex') + '  ' + file.path + '\n'
  }
  return 'h1:' + sha256(summary).toString('base64')
}

// Tracked and untracked-but-not-ignored files, as a directory deploy would see them.
function workingFiles(dir) {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', dir + '/']).toString()
  const paths = [...new Set(out.split('\0').filter(Boolean))].filter(path => existsSync(join(ROOT, path)))
  return paths.map(full => {
    if (!lstatSync(join(ROOT, full)).isFile()) fail(`${full}: only regular files can be deployed`)
    return { path: full.slice(dir.length + 1), bytes: () => readFileSync(join(ROOT, full)) }
  })
}

function taggedFiles(tag, dir) {
  const out = git(['ls-tree', '-r', '-z', '--full-tree', tag, '--', dir + '/']).toString()
  return out.split('\0').filter(Boolean).map(line => {
    const [meta, full] = line.split('\t')
    const [mode, , object] = meta.split(' ')
    if (mode === '120000') fail(`${tag}: ${full} is a symlink`)
    return { path: full.slice(dir.length + 1), bytes: () => git(['cat-file', 'blob', object]) }
  })
}

function manifestOf(files, dir) {
  const file = ['holm.json', 'manifest.json'].map(name => files.find(f => f.path === name)).find(Boolean)
  if (!file) fail(`${dir}: no holm.json or manifest.json`)
  return { manifest: JSON.parse(file.bytes().toString('utf8')), where: `${dir}/${file.path}` }
}

function deployed(files, dir) {
  const { manifest, where } = manifestOf(files, dir)
  const excluded = excluder(manifest, where)
  return files.filter(file => deployable(file.path, excluded))
}

function tagExists(tag) {
  try { git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { stdio: 'pipe' }); return true } catch { return false }
}

// holm.symbol.svg: one black path in a 24x24 frame. This checks the form only;
// Holm will also check the outline's bounds.
function symbol(dir) {
  const path = join(ROOT, dir, 'holm.symbol.svg')
  if (!existsSync(path)) return null
  const match = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"><path d="([MLHVCSQTAZ0-9. -]+)" fill="#000000" fill-rule="nonzero"\/><\/svg>\n$/.exec(readFileSync(path, 'utf8'))
  if (!match) fail(`${dir}/holm.symbol.svg: expected one black path in a 24x24 viewBox, in canonical form`)
  return match[1]
}

// Pixel size of a PNG or WebP screenshot, so the store can lay it out before it loads.
function imageSize(bytes, where) {
  if (bytes.readUInt32BE(0) === 0x89504e47) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
    if (chunk === 'VP8L') { const b = bytes.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1] }
    if (chunk === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1]
  }
  fail(`${where}: screenshots must be PNG or WebP`)
}

function listing(dir) {
  const path = join(ROOT, dir, 'listing', 'listing.json')
  if (!existsSync(path)) return null
  const where = `${dir}/listing/listing.json`
  const data = JSON.parse(readFileSync(path, 'utf8'))
  for (const key of ['subtitle', 'category', 'description']) if (typeof data[key] !== 'string' || !data[key]) fail(`${where}: needs "${key}"`)
  const screenshots = (data.screenshots || []).map(shot => {
    const file = join(ROOT, dir, 'listing', shot.file || '')
    if (!shot.file || shot.file.includes('/') || !existsSync(file)) fail(`${where}: screenshot "${shot.file}" not found in listing/`)
    const bytes = readFileSync(file)
    if (bytes.length > SCREENSHOT_MAX) fail(`${dir}/listing/${shot.file}: over ${SCREENSHOT_MAX / 1024} KB`)
    const [width, height] = imageSize(bytes, `${dir}/listing/${shot.file}`)
    return { path: `listing/${shot.file}`, alt: shot.alt || '', width, height, hash: shortHash(bytes) }
  })
  const coverFile = join(ROOT, dir, 'listing', 'cover.png')
  let cover = null
  if (existsSync(coverFile)) {
    const bytes = readFileSync(coverFile)
    if (bytes.length > SCREENSHOT_MAX) fail(`${dir}/listing/cover.png: over ${SCREENSHOT_MAX / 1024} KB`)
    const [width, height] = imageSize(bytes, `${dir}/listing/cover.png`)
    cover = { path: 'listing/cover.png', width, height, hash: shortHash(bytes) }
  }
  return {
    subtitle: data.subtitle,
    category: data.category,
    description: data.description,
    whatsNew: data.whatsNew || '',
    featured: data.featured === true,
    screenshots,
    ...(cover ? { cover } : {})
  }
}

// Earlier releases, newest first: each version tagged below the current one,
// with its commit's date and the whatsNew its listing had then. A note carried
// unchanged into later releases is listed once, under the release that
// introduced it, and notes the current listing still shows are left out.
const semver = version => version.split('.').map(Number)
const older = (a, b) => { const x = semver(a), y = semver(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }
const HISTORY_MAX = 30

function history(dir, current, whatsNew) {
  const tags = git(['tag', '-l', `${dir}/v*`]).toString().split('\n').filter(Boolean)
    .map(tag => ({ tag, version: tag.slice(dir.length + 2) }))
    .filter(({ version }) => /^\d+\.\d+\.\d+$/.test(version) && older(version, current) < 0)
    .sort((a, b) => older(a.version, b.version))
  const notes = []
  let previous = null
  for (const { tag, version } of tags) {
    let text = ''
    try { text = JSON.parse(git(['show', `${tag}:${dir}/listing/listing.json`], { stdio: 'pipe' }).toString()).whatsNew || '' } catch {}
    text = text.trim()
    if (text && text !== previous) notes.push({ version, date: git(['log', '-1', '--format=%cs', tag]).toString().trim(), whatsNew: text })
    previous = text
  }
  return notes.filter(note => note.whatsNew !== whatsNew.trim()).reverse().slice(0, HISTORY_MAX)
}

// The first request in PROMPT.md: the opening ```text block.
function prompt(dir) {
  const path = join(ROOT, dir, 'PROMPT.md')
  if (!existsSync(path)) return null
  const match = /```text\n([\s\S]*?)\n```/.exec(readFileSync(path, 'utf8'))
  return match ? match[1] : null
}

function readApp(dir) {
  const files = workingFiles(dir)
  const { manifest, where } = manifestOf(files, dir)
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) fail(`${where}: needs a "version" like 0.1.0`)
  const set = deployed(files, dir)
  const ext = (manifest.ext && manifest.ext[EXT]) || {}
  const entry = {
    name: manifest.name || dir,
    path: dir,
    version: manifest.version,
    tag: `${dir}/v${manifest.version}`,
    h1: h1(set),
    files: set.length,
    size: set.reduce((total, file) => total + file.bytes().length, 0),
    title: manifest.title || manifest.name || dir,
    description: manifest.description || '',
    themeColor: manifest.themeColor || (manifest.display && manifest.display.color) || null,
    symbol: symbol(dir),
    demo: ext.demo || null,
    listing: listing(dir),
    prompt: prompt(dir)
  }
  entry.history = history(dir, manifest.version, (entry.listing && entry.listing.whatsNew) || '')
  for (const key of Object.keys(entry)) if (entry[key] === null) delete entry[key]
  return entry
}

// An app folder is a top-level directory with a holm.json or manifest.json.
function appDirs() {
  return readdirSync(ROOT).filter(name => !name.startsWith('.') && statSync(join(ROOT, name)).isDirectory())
    .filter(name => existsSync(join(ROOT, name, 'holm.json')) || existsSync(join(ROOT, name, 'manifest.json')))
    .sort()
}

const render = index => JSON.stringify(index, null, 2) + '\n'
const mode = process.argv[2] || ''
const index = { schema: 1, repository: REPOSITORY, apps: appDirs().map(readApp) }

if (mode === '') {
  writeFileSync(INDEX, render(index))
  for (const app of index.apps) console.log(`${app.tag}  ${app.h1}  ${app.files} files, ${Math.round(app.size / 1024)} KB`)
} else if (mode === '--check') {
  const problems = []
  if (!existsSync(INDEX) || readFileSync(INDEX, 'utf8') !== render(index)) {
    problems.push('index.json is stale: run `node scripts/index.mjs` and commit it')
  }
  for (const app of index.apps) {
    if (!tagExists(app.tag)) { console.log(`${app.tag}: no such tag here (unreleased, or not fetched)`); continue }
    const tagged = h1(deployed(taggedFiles(app.tag, app.path), app.path))
    if (tagged === app.h1) console.log(`${app.tag}: matches`)
    else problems.push(`${app.path} changed since ${app.tag}; bump "version" in its manifest`)
  }
  for (const problem of problems) console.error(problem)
  process.exit(problems.length ? 1 : 0)
} else if (mode === '--tag') {
  for (const app of index.apps) {
    if (tagExists(app.tag)) continue
    if (h1(deployed(taggedFiles('HEAD', app.path), app.path)) !== app.h1) {
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
