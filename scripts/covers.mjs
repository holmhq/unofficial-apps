#!/usr/bin/env node
// Draw each app's 1200x630 cover, the store's featured card in landscape: the
// app's colour, its icon, title and subtitle, and its first screenshot rising
// from the bottom edge. The store uses it as the app page's social preview.
//
//   node scripts/covers.mjs            every app with a listing
//   node scripts/covers.mjs relay      only these apps
//
// It writes <app>/listing/cover.png with a headless Chrome or Chromium: set
// CHROME to its path, or have chrome-headless-shell, chromium or google-chrome
// on PATH (Playwright's downloads are found too). Run node scripts/index.mjs
// afterwards. Covers live in listing/, so a new one needs no version bump.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const FONT = join(ROOT, 'catalog/web/assets/fonts/bricolage-grotesque-opsz.woff2')
const WIDTH = 1200
const HEIGHT = 630
const HOLM = 'M4.667 0h22.666A4.667 4.667 0 0 1 32 4.667v22.666A4.667 4.667 0 0 1 27.333 32H4.667A4.667 4.667 0 0 1 0 27.333V4.667A4.667 4.667 0 0 1 4.667 0ZM6.75 16h18.5c.414 0 .75.336.75.75v10.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75v4.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-10.5c0-.414.336-.75.75-.75Zm0-12h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Zm14 0h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Z'

const fail = message => { console.error(message); process.exit(1) }
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const dataURL = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`

function chrome() {
  if (process.env.CHROME) return process.env.CHROME
  const onPath = name => { try { return execFileSync('which', [name], { encoding: 'utf8' }).trim() } catch { return '' } }
  if (onPath('chrome-headless-shell')) return onPath('chrome-headless-shell')
  // Playwright's headless shell before a system Chromium, which may be a snap that can't read the temp folder.
  const cache = join(homedir(), '.cache/ms-playwright')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of readdirSync(join(cache, dir))) {
        const bin = join(cache, dir, sub, 'chrome-headless-shell')
        if (existsSync(bin)) return bin
      }
    }
  }
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) if (onPath(name)) return onPath(name)
  fail('No headless Chrome found. Set CHROME to a Chrome, Chromium or chrome-headless-shell binary.')
}

function page(app) {
  const shot = app.listing.screenshots[0]
  const type = shot.file.endsWith('.png') ? 'image/png' : 'image/webp'
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: Bricolage; src: url(${dataURL(FONT, 'font/woff2')}) format("woff2"); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body { position: relative; background: ${app.themeColor}; color: #fff; font-family: Bricolage, sans-serif; -webkit-font-smoothing: antialiased; }
.store { position: absolute; left: 84px; top: 58px; display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; color: rgba(255, 255, 255, 0.78); }
.store svg { width: 28px; height: 28px; fill: currentColor; }
.text { position: absolute; left: 84px; top: 118px; bottom: 64px; width: ${shot ? 600 : 1030}px; display: flex; flex-direction: column; justify-content: center; }
.icon { width: 124px; height: 124px; border-radius: 28px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.14); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25); }
.icon svg { width: 100%; height: 100%; fill: #fff; }
h1 { margin-top: 30px; font-size: 92px; font-weight: 700; line-height: 1; letter-spacing: -0.035em; }
p { margin-top: 18px; font-size: 36px; line-height: 1.2; text-wrap: balance; color: rgba(255, 255, 255, 0.84); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.get { margin-top: 32px; align-self: flex-start; padding: 12px 40px; border-radius: 999px; background: #fff; color: ${app.themeColor}; font-size: 28px; font-weight: 700; }
.shot { position: absolute; right: 100px; top: 74px; bottom: 0; width: 388px; overflow: hidden; border-radius: 34px 34px 0 0; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18), 0 -16px 60px rgba(0, 0, 0, 0.28); }
.shot img { display: block; width: 100%; height: auto; }
</style></head><body>
<div class="store"><svg viewBox="0 0 32 32"><path d="${HOLM}" fill-rule="evenodd"/></svg>Unofficial Holm apps</div>
<div class="text">
  <div class="icon"><svg viewBox="-7 -7 38 38"><path d="${escape(app.symbol)}"/></svg></div>
  <h1>${escape(app.title)}</h1>
  <p>${escape(app.listing.subtitle)}</p>
  <div class="get">Get</div>
</div>
${shot ? `<div class="shot"><img src="${dataURL(join(ROOT, app.dir, 'listing', shot.file), type)}" alt=""></div>` : ''}
</body></html>
`
}

function readApp(dir) {
  const manifest = JSON.parse(readFileSync(join(ROOT, dir, 'holm.json'), 'utf8'))
  const listingPath = join(ROOT, dir, 'listing', 'listing.json')
  if (!existsSync(listingPath)) return null
  const svg = readFileSync(join(ROOT, dir, 'holm.symbol.svg'), 'utf8')
  const symbol = (/ d="([^"]+)"/.exec(svg) || [])[1]
  if (!symbol) fail(`${dir}/holm.symbol.svg: no path`)
  if (!/^#[0-9a-fA-F]{6}$/.test(manifest.themeColor || '')) fail(`${dir}/holm.json: needs a themeColor`)
  return { dir, title: manifest.title || manifest.name || dir, themeColor: manifest.themeColor, symbol, listing: JSON.parse(readFileSync(listingPath, 'utf8')) }
}

const wanted = process.argv.slice(2)
const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.') && existsSync(join(ROOT, d.name, 'holm.json')))
  .map(d => d.name)
  .filter(name => !wanted.length || wanted.includes(name))
for (const name of wanted) if (!dirs.includes(name)) fail(`No app folder called ${name}`)

const bin = chrome()
const work = mkdtempSync(join(tmpdir(), 'covers-'))
try {
  for (const dir of dirs) {
    const app = readApp(dir)
    if (!app) continue
    const html = join(work, `${dir}.html`)
    const out = join(ROOT, dir, 'listing', 'cover.png')
    writeFileSync(html, page(app))
    execFileSync(bin, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`, '--virtual-time-budget=3000', `--screenshot=${out}`, 'file://' + html], { stdio: 'ignore' })
    if (!existsSync(out)) fail(`${bin} wrote no ${dir}/listing/cover.png; set CHROME to another browser`)
    const png = readFileSync(out)
    if (png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) fail(`${dir}/listing/cover.png: Chrome drew ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, not ${WIDTH}x${HEIGHT}`)
    console.log(`${dir}/listing/cover.png  ${Math.round(png.length / 1024)} KB`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
