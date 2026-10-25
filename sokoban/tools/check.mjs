#!/usr/bin/env node
// Checks the game's rules before a release:
//  - api/rules.js is an exact copy of web/src/rules.js;
//  - every level can be solved, and in exactly `par` pushes at best;
//  - the full solution (walking included) passes check(), the same replay
//    the server runs before a solution counts.
// Usage: node tools/check.mjs [--solutions]   (prints one LURD solution per level)

import { readFileSync } from 'node:fs'
import { LEVELS, parseLevel, createGame, check } from '../web/src/rules.js'

const here = (path) => new URL('../' + path, import.meta.url)
let failed = 0
const fail = (message) => { failed++; console.log('FAIL  ' + message) }

if (readFileSync(here('web/src/rules.js'), 'utf8') !== readFileSync(here('api/rules.js'), 'utf8')) {
  fail('api/rules.js differs from web/src/rules.js: copy it across')
}

const STEPS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]

// Cells the player can walk to without pushing.
function reachable(walls, boxes, from, width, height) {
  const seen = new Set([from])
  const stack = [from]
  while (stack.length) {
    const k = stack.pop()
    const x = k % width
    const y = (k - x) / width
    for (const [dx, dy] of STEPS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nk = ny * width + nx
      if (walls.has(nk) || boxes.has(nk) || seen.has(nk)) continue
      seen.add(nk)
      stack.push(nk)
    }
  }
  return seen
}

// A box in a corner off a goal can never move again.
function cornered(k, walls, goals, width) {
  if (goals.has(k)) return false
  const x = k % width
  const y = (k - x) / width
  const wall = (dx, dy) => walls.has((y + dy) * width + (x + dx))
  return (wall(0, -1) || wall(0, 1)) && (wall(-1, 0) || wall(1, 0))
}

// Breadth-first over pushes, so the first solution found has the fewest.
// Returns the pushes as [box cell, direction] pairs, or a reason it failed.
function solve(level) {
  const { walls, goals, boxes, player, width, height } = parseLevel(level.grid)
  if (player < 0) return { reason: 'no player' }
  if (boxes.size !== goals.size) return { reason: `${boxes.size} boxes for ${goals.size} goals` }
  const solved = (bs) => [...bs].every((k) => goals.has(k))
  const key = (bs, region) => [...bs].sort((a, b) => a - b).join(',') + '|' + Math.min(...region)
  if (solved(boxes)) return { pushes: [] }

  const seen = new Set([key(boxes, reachable(walls, boxes, player, width, height))])
  let states = [{ boxes, player, pushes: [] }]
  let expanded = 0
  while (states.length) {
    const next = []
    for (const s of states) {
      if (++expanded > 2_000_000) return { reason: 'search limit reached' }
      const region = reachable(walls, s.boxes, s.player, width, height)
      for (const bk of s.boxes) {
        const bx = bk % width
        const by = (bk - bx) / width
        for (const [dx, dy, dir] of STEPS) {
          const behind = (by - dy) * width + (bx - dx)
          const target = (by + dy) * width + (bx + dx)
          if (!region.has(behind) || walls.has(target) || s.boxes.has(target)) continue
          if (cornered(target, walls, goals, width)) continue
          const nb = new Set(s.boxes)
          nb.delete(bk)
          nb.add(target)
          const k = key(nb, reachable(walls, nb, bk, width, height))
          if (seen.has(k)) continue
          seen.add(k)
          const pushes = [...s.pushes, [bk, dir]]
          if (solved(nb)) return { pushes }
          next.push({ boxes: nb, player: bk, pushes })
        }
      }
    }
    states = next
  }
  return { reason: 'unsolvable' }
}

// Turns the pushes into a full LURD path by walking to each box first.
function lurd(level, pushes) {
  const game = createGame(level)
  for (const [box, dir] of pushes) {
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' }[dir]
    const walk = game.route(game.next(box, opposite))
    if (!walk) return null
    for (const step of walk) game.move(step)
    if (game.move(dir) !== 'push') return null
  }
  return game.path
}

const ids = new Set()
for (const level of LEVELS) {
  if (ids.has(level.id)) fail(`${level.id} is used twice`)
  ids.add(level.id)
  const result = solve(level)
  if (!result.pushes) { fail(`${level.id} "${level.name}": ${result.reason}`); continue }
  const path = lurd(level, result.pushes)
  const replayed = path && check(level, path)
  if (!replayed) { fail(`${level.id} "${level.name}": the solution did not replay`); continue }
  if (replayed.pushes !== level.par) { fail(`${level.id} "${level.name}": par is ${level.par}, fewest pushes ${replayed.pushes}`); continue }
  const shown = process.argv.includes('--solutions') ? `  ${path}` : ''
  console.log(`ok    ${level.id}  par ${String(level.par).padStart(2)}  ${level.name}${shown}`)
}
process.exit(failed ? 1 : 0)
