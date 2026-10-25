#!/usr/bin/env node
// Checks the game's rules before a release:
//  - api/rules.js is an exact copy of web/src/rules.js;
//  - a game's record survives encode and decode;
//  - games played by a simple bot replay to exactly the same result, the
//    same check the server runs before a score counts, and that replay
//    (which jumps from move to move) matches playing frame by frame;
//  - a game ends at two hours, stepped or advanced;
//  - broken records are refused, or replay to another score.
// Usage: node tools/check.mjs [games]   (default 40 bot games)

import { readFileSync } from 'node:fs'
import { Game, COLS, ROWS, CELLS, encode, decode, replay, MAX_FRAMES } from '../web/src/rules.js'

const here = (path) => new URL('../' + path, import.meta.url)
let failed = 0
const fail = (message) => { failed++; console.log('FAIL  ' + message) }
const ok = (message) => console.log('ok    ' + message)

if (readFileSync(here('web/src/rules.js'), 'utf8') !== readFileSync(here('api/rules.js'), 'utf8')) {
  fail('api/rules.js differs from web/src/rules.js: copy it across')
}

/* ---- encode and decode ---- */
{
  const inputs = [[0, 'U'], [9, 'L'], [107, 'D'], [107, 'R'], [5000, 'U']]
  const text = encode(inputs)
  const back = decode(text)
  if (text !== 'U9L2qDR3rxU' || JSON.stringify(back) !== JSON.stringify(inputs)) fail(`encode/decode: ${text}`)
  else if (decode('U9Q') !== null || decode('U9') !== null || decode('1234567L') !== null) fail('decode accepted bad text')
  else ok('records encode and decode')
}

/* ---- the two-hour end ---- */
{
  const a = new Game(7)
  const b = new Game(7)
  a.frame = b.frame = MAX_FRAMES - 45
  for (let i = 0; i < 60; i++) a.step()
  b.advance(60)
  if (!a.over || !b.over || a.frame !== MAX_FRAMES || b.frame !== MAX_FRAMES || a.score !== b.score) fail('a game did not end at two hours')
  else ok('a game ends at two hours, stepped or advanced')
}

/* ---- a bot that looks for the berry ---- */

const DIRS = [['U', 0, -1], ['D', 0, 1], ['L', -1, 0], ['R', 1, 0]]
const nextCell = (cell, dx, dy) => {
  const x = (cell % COLS + dx + COLS) % COLS
  const y = (Math.floor(cell / COLS) + dy + ROWS) % ROWS
  return y * COLS + x
}

// Breadth-first from the head to the berry, around the body. Returns the
// first turn, or the move that leaves the most room when there is no path.
function plan(game) {
  const blocked = new Uint8Array(CELLS)
  const cells = game.cells()
  for (let i = 0; i < cells.length - 1; i++) blocked[cells[i]] = 1
  const head = game.head
  const first = new Int8Array(CELLS).fill(-1)
  const queue = []
  for (let d = 0; d < 4; d++) {
    const n = nextCell(head, DIRS[d][1], DIRS[d][2])
    if (blocked[n] || first[n] >= 0) continue
    first[n] = d
    queue.push(n)
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]
    if (c === game.food) return DIRS[first[c]][0]
    for (const [, dx, dy] of DIRS) {
      const n = nextCell(c, dx, dy)
      if (blocked[n] || first[n] >= 0) continue
      first[n] = first[c]
      queue.push(n)
    }
  }
  let best = null
  for (let d = 0; d < 4; d++) {
    const n = nextCell(head, DIRS[d][1], DIRS[d][2])
    if (blocked[n]) continue
    const room = queue.filter((c) => first[c] === d).length
    if (!best || room > best.room) best = { dir: DIRS[d][0], room }
  }
  return best ? best.dir : game.dir
}

function play(seed, rnd, skill) {
  const inputs = []
  const game = new Game(seed)
  let steps = -1
  let wait = 0
  let want = null
  while (!game.over && game.frame < MAX_FRAMES - 10) {
    if (game.steps !== steps) {
      steps = game.steps
      want = rnd() < skill ? plan(game) : 'UDLR'[rnd() * 4 | 0]
      wait = rnd() * Math.max(1, game.every - 2) | 0
    }
    if (want && wait-- <= 0) {
      if (game.input(want)) inputs.push([game.frame, want])
      want = null
    }
    game.step()
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
    game.step()
  }
  if (i < inputs.length) return null
  return { score: game.score, length: game.length, level: game.level, eaten: game.eaten, won: game.won, frames: game.frame }
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
  const { inputs, game } = play(seed, rng(seed ^ 0x9e3779b9), i % 4 === 0 ? 0.9 : 0.995)
  if (!game.over) { fail(`seed ${seed}: the bot's game did not end`); continue }
  const log = encode(inputs)
  const t0 = performance.now()
  const result = replay(seed, log)
  const ms = performance.now() - t0
  const want = { score: game.score, length: game.length, level: game.level, eaten: game.eaten, won: game.won, frames: game.frame }
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
  ok(`longest: ${longest.score} points, length ${longest.length}, level ${longest.level}, ${minutes} min, ${longest.log.length} chars, replayed in ${longest.ms.toFixed(1)} ms`)

  /* ---- broken records ---- */
  const { seed, log } = longest
  const cases = [
    ['another seed', replay(seed + 1, log)],
    ['an input after the end', replay(seed, log + '9U9L')],
    ['an input that changes nothing', replay(seed, 'R' + log)],
    ['a seed out of range', replay(-1, log)],
    ['an unknown letter', replay(seed, log.replace('U', 'Q'))]
  ].filter(([, result]) => result && result.score === longest.score)
  if (cases.length) fail('accepted: ' + cases.map(([name]) => name).join(', '))
  else ok('broken records are refused')
}

process.exit(failed ? 1 : 0)
