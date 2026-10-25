#!/usr/bin/env node
// Checks the game's rules before a release:
//  - api/rules.js is an exact copy of web/src/rules.js;
//  - every bag deals all seven pieces, and a seed always deals the same ones;
//  - a game's record survives encode and decode;
//  - games played by a simple bot replay to exactly the same result, the
//    same check the server runs before a score counts, and that replay
//    (which jumps from event to event) matches playing frame by frame;
//  - broken records are refused, or replay to another score: a changed seed
//    or input timing, an input that changes nothing, an input after the end.
// Usage: node tools/check.mjs [games]   (default 40 bot games)

import { readFileSync } from 'node:fs'
import { Game, COLS, ROWS, encode, decode, replay, MAX_FRAMES } from '../web/src/rules.js'

const here = (path) => new URL('../' + path, import.meta.url)
let failed = 0
const fail = (message) => { failed++; console.log('FAIL  ' + message) }
const ok = (message) => console.log('ok    ' + message)

if (readFileSync(here('web/src/rules.js'), 'utf8') !== readFileSync(here('api/rules.js'), 'utf8')) {
  fail('api/rules.js differs from web/src/rules.js: copy it across')
}

/* ---- the bag ---- */
{
  const a = new Game(12345)
  const b = new Game(12345)
  const dealt = []
  for (let i = 0; i < 70; i++) dealt.push(i === 0 ? a.piece.type : a.take())
  const again = []
  for (let i = 0; i < 70; i++) again.push(i === 0 ? b.piece.type : b.take())
  let bags = true
  for (let i = 0; i < 70; i += 7) if (new Set(dealt.slice(i, i + 7)).size !== 7) bags = false
  if (!bags) fail('a bag of seven did not hold all seven pieces')
  else if (dealt.join('') !== again.join('')) fail('the same seed dealt different pieces')
  else ok('bags of seven, the same for the same seed')
}

/* ---- the two-hour end ---- */
{
  const a = new Game(7)
  const b = new Game(7)
  a.frame = b.frame = MAX_FRAMES - 45
  for (let i = 0; i < 60; i++) a.step()
  b.advance(60)
  if (!a.over || !b.over || a.frame !== MAX_FRAMES || b.frame !== MAX_FRAMES) fail('a game did not end at two hours')
  else ok('a game ends at two hours, stepped or advanced')
}

/* ---- encode and decode ---- */
{
  const inputs = [[0, 'C'], [9, 'L'], [12, 'L'], [32, 'H'], [32, 'X'], [5000, 'D'], [5003, 'U']]
  const text = encode(inputs)
  const back = decode(text)
  if (text !== 'C9L3LkHX3u0D3U' || JSON.stringify(back) !== JSON.stringify(inputs)) fail(`encode/decode: ${text}`)
  else if (decode('C9Q') !== null || decode('C9') !== null || decode('1234567L') !== null) fail('decode accepted bad text')
  else ok('records encode and decode')
}

/* ---- a bot that plays well enough to clear lines ---- */

// Scores a grid the way simple Tetris bots do: low, flat, few holes.
function rate(grid, lines) {
  let height = 0
  let holes = 0
  let bump = 0
  let prev = -1
  for (let c = 0; c < COLS; c++) {
    let top = ROWS
    for (let r = 0; r < ROWS; r++) if (grid[r][c]) { top = r; break }
    const h = ROWS - top
    height += h
    for (let r = top + 1; r < ROWS; r++) if (!grid[r][c]) holes++
    if (prev >= 0) bump += Math.abs(h - prev)
    prev = h
  }
  return -0.51 * height + 0.76 * lines - 0.36 * holes - 0.18 * bump
}

function choose(game) {
  const p = game.piece
  let best = null
  for (let rot = 0; rot < 4; rot++) {
    for (let col = -2; col < COLS; col++) {
      const t = { ...p, rot, col }
      if (!game.fits(t)) continue
      let d = 0
      while (game.fits(t, d + 1)) d++
      const grid = game.grid.map((row) => row.slice())
      let above = false
      for (const [r, c] of game.cells({ ...t, row: t.row + d })) {
        if (r < 0) above = true
        else grid[r][c] = p.type
      }
      if (above) continue
      const full = grid.filter((row) => row.every(Boolean)).length
      const kept = grid.filter((row) => !row.every(Boolean))
      while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null))
      const value = rate(kept, full)
      if (!best || value > best.value) best = { rot, col, value }
    }
  }
  return best || { rot: p.rot, col: p.col }
}

// Plays one game, keeping only the inputs that changed something, as the
// page does. Returns the record and the result the game reached.
function play(seed, rnd, skill) {
  const inputs = []
  const game = new Game(seed)
  const act = (a) => {
    const done = game.input(a)
    if (done) inputs.push([game.frame, a])
    return done
  }
  let target = null
  let piece = null
  let wait = 0
  while (!game.over && game.frame < MAX_FRAMES - 10) {
    if (game.phase === 'falling' && game.serial !== piece) {
      piece = game.serial
      if (rnd() < 0.08) act('X')
      if (game.over) break
      piece = game.serial
      target = rnd() < skill ? choose(game) : { rot: rnd() * 4 | 0, col: rnd() * COLS | 0 }
      wait = rnd() * 8 | 0
    }
    if (game.phase === 'falling' && target && wait-- <= 0) {
      const p = game.piece
      wait = rnd() * 5 | 0
      if (p.rot !== target.rot) {
        if (!act(rnd() < 0.3 ? 'A' : 'C')) target.rot = p.rot
      } else if (p.col !== target.col) {
        if (!act(p.col < target.col ? 'R' : 'L')) target.col = p.col
      } else if (rnd() < 0.15) {
        act(game.soft ? 'U' : 'D')
      } else {
        act('H')
        if (game.over) break
      }
    }
    if (!game.over) game.step()
  }
  return { inputs, game }
}

// The plain way to replay, one frame at a time, as the page plays.
function replaySteps(seed, log) {
  const inputs = decode(log)
  if (!inputs) return null
  const game = new Game(seed)
  let i = 0
  while (!game.over) {
    while (i < inputs.length && inputs[i][0] === game.frame && !game.over) {
      if (!game.input(inputs[i][1])) return null
      i++
    }
    if (game.over) break
    if (i < inputs.length && inputs[i][0] < game.frame) return null
    if (game.frame >= MAX_FRAMES) return null
    game.step()
  }
  if (i < inputs.length) return null
  return { score: game.score, lines: game.lines, level: game.level, pieces: game.pieces, frames: game.frame }
}

// mulberry32 again, for the bot's own choices.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const games = Number(process.argv[2]) || 40
let replayed = 0
let longest = null
for (let i = 0; i < games; i++) {
  const seed = (i * 2654435761) >>> 0
  const rnd = rng(seed ^ 0x9e3779b9)
  const { inputs, game } = play(seed, rnd, i % 4 === 0 ? 0.6 : 0.97)
  if (!game.over) { fail(`seed ${seed}: the bot's game did not end`); continue }
  const log = encode(inputs)
  const t0 = performance.now()
  const result = replay(seed, log)
  const ms = performance.now() - t0
  const want = { score: game.score, lines: game.lines, level: game.level, pieces: game.pieces, frames: game.frame }
  if (JSON.stringify(result) !== JSON.stringify(want)) {
    fail(`seed ${seed}: replay gave ${JSON.stringify(result)}, the game ${JSON.stringify(want)}`)
    continue
  }
  if (JSON.stringify(replaySteps(seed, log)) !== JSON.stringify(want)) {
    fail(`seed ${seed}: frame-by-frame replay differs`)
    continue
  }
  replayed++
  if (!longest || game.frame > longest.frames) longest = { seed, log, ...want, ms }
}
if (replayed === games) ok(`${games} bot games replay exactly`)
if (longest) {
  const minutes = (longest.frames / 3600).toFixed(1)
  ok(`longest: ${longest.score} points, ${longest.lines} lines, level ${longest.level}, ${minutes} min, ${longest.log.length} chars, replayed in ${longest.ms.toFixed(1)} ms`)

  /* ---- broken records ---- */
  const { seed, log } = longest
  const cases = [
    ['another seed', replay(seed + 1, log)],
    ['an input after the end', replay(seed, log + 'L')],
    ['an input that changes nothing', replay(seed, 'U' + log)],
    ['a seed out of range', replay(-1, log)],
    ['an unknown letter', replay(seed, log.replace('H', 'Q'))]
  ].filter(([, result]) => result && result.score === longest.score)
  // Another seed may happen to be a legal game too, just not this one.
  // Changing one input's timing should either fail or give another game.
  const nudged = log.replace(/^([0-9a-z]*)([LRCADUHX])/, (_, gap, a) => (parseInt(gap || '0', 36) + 1).toString(36) + a)
  const r = replay(seed, nudged)
  if (r && r.score === longest.score && r.frames === longest.frames) fail('a changed record replayed to the same game')
  const accepted = cases.map(([name]) => name)
  if (accepted.length) fail('accepted: ' + accepted.join(', '))
  else ok('broken records are refused')
}

process.exit(failed ? 1 : 0)
