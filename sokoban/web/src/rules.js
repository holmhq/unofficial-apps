// Sokoban's rules, levels and scoring. Nothing here touches the page: the
// browser plays with this file and the server replays every submitted
// solution with it before the solution counts. The server can import only
// files under api/, so api/rules.js is an exact copy; after editing this
// file, copy it there and run `node tools/check.mjs`.
//
// Levels use the classic notation: # wall, . goal, $ box, * box on a goal,
// @ player, + player on a goal. A solution is the LURD string Sokoban
// players share: one letter per step, upper case when the step pushes a box.

export const DIRS = {
  up: { dx: 0, dy: -1, key: 'u' },
  down: { dx: 0, dy: 1, key: 'd' },
  left: { dx: -1, dy: 0, key: 'l' },
  right: { dx: 1, dy: 0, key: 'r' }
}
const BY_KEY = { u: 'up', d: 'down', l: 'left', r: 'right' }
const MAX_PATH = 20000

export function parseLevel(grid) {
  const height = grid.length
  const width = Math.max(...grid.map((row) => row.length))
  const walls = new Set()
  const goals = new Set()
  const boxes = new Set()
  let player = -1
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      const k = y * width + x
      if (c === '#') walls.add(k)
      if (c === '.' || c === '*' || c === '+') goals.add(k)
      if (c === '$' || c === '*') boxes.add(k)
      if (c === '@' || c === '+') player = k
    }
  })
  return { width, height, walls, goals, boxes, player }
}

export function createGame(level) {
  const base = parseLevel(level.grid)
  const { width, height, walls, goals } = base
  let boxes = new Set(base.boxes)
  let player = base.player
  let pushes = 0
  let steps = [] // { dir, from, boxFrom, boxTo } per step, for undo and the path

  const cell = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x)
  const open = (k) => k >= 0 && !walls.has(k) && !boxes.has(k)

  // The cell one step from k in a direction, or -1 off the board.
  function next(k, dir) {
    const d = DIRS[dir]
    const x = k % width
    return cell(x + d.dx, (k - x) / width + d.dy)
  }

  function isWon() {
    for (const b of boxes) if (!goals.has(b)) return false
    return true
  }

  // One step. Returns 'move', 'push', or null when a wall or a stuck box is in the way.
  function move(dir) {
    if (!DIRS[dir]) return null
    const to = next(player, dir)
    if (to < 0 || walls.has(to)) return null
    if (boxes.has(to)) {
      const beyond = next(to, dir)
      if (!open(beyond)) return null
      boxes.delete(to)
      boxes.add(beyond)
      steps.push({ dir, from: player, boxFrom: to, boxTo: beyond })
      player = to
      pushes++
      return 'push'
    }
    steps.push({ dir, from: player, boxFrom: -1, boxTo: -1 })
    player = to
    return 'move'
  }

  function undo() {
    const step = steps.pop()
    if (!step) return false
    if (step.boxTo >= 0) {
      boxes.delete(step.boxTo)
      boxes.add(step.boxFrom)
      pushes--
    }
    player = step.from
    return true
  }

  function reset() {
    boxes = new Set(base.boxes)
    player = base.player
    pushes = 0
    steps = []
  }

  // Plays a LURD string from the start. False if any step can't be made.
  function replay(path) {
    reset()
    for (const c of path) {
      const dir = BY_KEY[c.toLowerCase()]
      if (!dir || !move(dir)) return false
    }
    return true
  }

  // The shortest walk to a cell without pushing anything, as a list of
  // directions, or null when boxes or walls cut it off.
  function route(target) {
    if (target === player) return []
    if (!open(target)) return null
    const came = new Map([[player, null]])
    const queue = [player]
    while (queue.length) {
      const k = queue.shift()
      for (const dir in DIRS) {
        const n = next(k, dir)
        if (!open(n) || came.has(n)) continue
        came.set(n, { from: k, dir })
        if (n === target) {
          const dirs = []
          for (let at = n; came.get(at); at = came.get(at).from) dirs.unshift(came.get(at).dir)
          return dirs
        }
        queue.push(n)
      }
    }
    return null
  }

  return {
    level,
    width,
    height,
    walls,
    goals,
    get boxes() { return boxes },
    get player() { return player },
    get moves() { return steps.length },
    get pushes() { return pushes },
    get path() { return steps.map((s) => (s.boxTo >= 0 ? DIRS[s.dir].key.toUpperCase() : DIRS[s.dir].key)).join('') },
    next,
    move,
    undo,
    reset,
    replay,
    route,
    isWon
  }
}

// Replays a solution on a fresh copy of the level. Returns its moves, pushes
// and tidied path when it solves the level, otherwise null.
export function check(level, path) {
  if (!level || typeof path !== 'string' || path.length > MAX_PATH || !/^[udlr]+$/i.test(path)) return null
  const game = createGame(level)
  if (!game.replay(path) || !game.isWon()) return null
  return { moves: game.moves, pushes: game.pushes, path: game.path }
}

// One result beats another with fewer pushes, then fewer moves.
export function better(a, b) {
  return !b || a.pushes < b.pushes || (a.pushes === b.pushes && a.moves < b.moves)
}

// A solved level is worth up to 1000 points; every push over par costs 50,
// down to 100, so any solve still counts. A player's score is the sum of
// their best result on each level.
export function levelPoints(par, pushes) {
  return Math.max(100, Math.min(1000, 1000 - 50 * Math.max(0, pushes - par)))
}

// bests: { [levelId]: { moves, pushes } }
export function totals(bests) {
  let score = 0
  let levels = 0
  let pushes = 0
  let moves = 0
  for (const level of LEVELS) {
    const best = bests[level.id]
    if (!best) continue
    levels++
    score += levelPoints(level.par, best.pushes)
    pushes += best.pushes
    moves += best.moves
  }
  return { score, levels, pushes, moves }
}

// Play order runs roughly from easy to hard. Ids never change, because saved
// progress is keyed by them. par is the fewest pushes that solve the level,
// found by tools/check.mjs. Levels credited to David W. Skinner come from his
// Microban set, which he allows to be shared freely with credit; the rest
// were made for this game.
export const LEVELS = [
  { id: 'L01', name: 'First Steps', par: 1, grid: [
    '#######',
    '#     #',
    '# @$. #',
    '#     #',
    '#######'
  ] },
  { id: 'L02', name: 'Side by Side', par: 2, grid: [
    '########',
    '#  ..  #',
    '#  $$  #',
    '#      #',
    '#  @   #',
    '########'
  ] },
  { id: 'L03', name: 'Crossroads', par: 3, grid: [
    '#########',
    '#       #',
    '# .$@$. #',
    '#   $   #',
    '#   .   #',
    '#########'
  ] },
  { id: 'L04', name: 'Twin Cells', par: 3, credit: 'Microban #2, David W. Skinner', grid: [
    '######',
    '#    #',
    '# #@ #',
    '# $* #',
    '# .* #',
    '#    #',
    '######'
  ] },
  { id: 'L05', name: 'Warehouse', par: 3, grid: [
    '#########',
    '#       #',
    '#  $ $  #',
    '#  ...  #',
    '#   $   #',
    '#   @   #',
    '#########'
  ] },
  { id: 'L06', name: 'Double Down', par: 4, grid: [
    '#######',
    '#. $@ #',
    '#     #',
    '#. $  #',
    '#     #',
    '#######'
  ] },
  { id: 'L07', name: 'Around the Corner', par: 4, grid: [
    '########',
    '#      #',
    '# ###  #',
    '# #  $ #',
    '# # @  #',
    '# #.   #',
    '########'
  ] },
  { id: 'L12', name: 'Compass', par: 4, grid: [
    '#########',
    '#       #',
    '#  .#.  #',
    '#  $ $  #',
    '# # @ # #',
    '#  $ $  #',
    '#  .#.  #',
    '#       #',
    '#########'
  ] },
  { id: 'L18', name: 'Checkerboard', par: 6, credit: 'Microban, David W. Skinner', grid: [
    '#######',
    '#     #',
    '# .$. #',
    '# $.$ #',
    '# .$. #',
    '# $.$ #',
    '#  @  #',
    '#######'
  ] },
  { id: 'L08', name: 'Conveyor', par: 7, credit: 'Microban #4, David W. Skinner', grid: [
    '########',
    '#      #',
    '# .**$@#',
    '#      #',
    '#####  #',
    '    ####'
  ] },
  { id: 'L09', name: 'The Pocket', par: 8, credit: 'Microban #1, David W. Skinner', grid: [
    '####',
    '# .#',
    '#  ###',
    '#*@  #',
    '#  $ #',
    '#  ###',
    '####'
  ] },
  { id: 'L13', name: 'Triple Stack', par: 8, grid: [
    '#######',
    '#  .  #',
    '#  .  #',
    '#  .  #',
    '# $$$ #',
    '#  @  #',
    '#######'
  ] },
  { id: 'L14', name: 'Four Corners', par: 8, grid: [
    '#########',
    '#.     .#',
    '# $   $ #',
    '#   @   #',
    '# $   $ #',
    '#.     .#',
    '#########'
  ] },
  { id: 'L15', name: 'Corridor Shuffle', par: 8, grid: [
    '########',
    '#.     #',
    '#.$$$  #',
    '#.     #',
    '#  @   #',
    '########'
  ] },
  { id: 'L16', name: 'The U-Turn', par: 10, grid: [
    '#########',
    '#   #   #',
    '# $ # . #',
    '#   #   #',
    '#   #   #',
    '#       #',
    '#@      #',
    '#########'
  ] },
  { id: 'L17', name: 'Pinwheel', par: 12, grid: [
    '#########',
    '#   .   #',
    '# $   $ #',
    '#       #',
    '#.  @  .#',
    '#       #',
    '# $   $ #',
    '#   .   #',
    '#########'
  ] },
  { id: 'L10', name: 'The Hook', par: 13, credit: 'Microban #3, David W. Skinner', grid: [
    '  ####',
    '###  ####',
    '#     $ #',
    '# #  #$ #',
    '# . .#@ #',
    '#########'
  ] },
  { id: 'L11', name: 'Two Rooms', par: 15, grid: [
    '##########',
    '#   ##   #',
    '# $ ## . #',
    '# @ ## . #',
    '# $      #',
    '#   ##   #',
    '##########'
  ] },
  { id: 'L19', name: 'Long Haul', par: 20, grid: [
    '############',
    '#         .#',
    '#  $  $   .#',
    '#         .#',
    '#  $   @   #',
    '#          #',
    '############'
  ] }
]
