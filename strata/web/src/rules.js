// Strata — the rules, shared by the page and the server (api/rules.js is an
// exact copy). A game is a seed and a list of inputs, each stamped with the
// frame it happened on: the same seed and inputs always play out the same
// way, so the server can replay a whole game to check its score.
//
// Time runs in frames, 60 to a second, and only while the game is playing;
// the page decides when a frame passes. Nothing here reads the clock, the
// DOM or Math.random.
//
// Modern falling-block rules: a bag of all seven pieces at a time, rotation
// with wall kicks, a hold slot (one swap per piece), a short grace before a
// grounded piece locks, soft and hard drops, T-spins, back-to-back and combo
// points. The pace is gentle and levels off at level 15, and a game that
// lasts two hours of play ends there.

export const COLS = 10
export const ROWS = 20
export const FPS = 60
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
export const MAX_LEVEL = 15
export const MAX_FRAMES = FPS * 60 * 120 // a game ends after two hours of play
export const MAX_LOG = 600000           // characters of input text a game may send

// The inputs, one letter each: move Left, move Right, rotate Clockwise,
// rotate Anticlockwise, soft drop Down (starts) and Up (stops), Hard drop,
// and eXchange with the hold slot.
export const ACTIONS = 'LRCADUHX'

const LOCK_FRAMES = 30  // a grounded piece locks after half a second
const MAX_RESETS = 15   // moves that may restart that half second, per row reached
export const CLEAR_FRAMES = 18 // full rows linger a moment before the stack settles
// Frames per row of fall at each level: one second at level 1, a tenth at 15.
const GRAVITY = [60, 60, 50, 42, 35, 29, 24, 20, 17, 14, 12, 10, 9, 8, 7, 6]

// Each piece's cells at spawn in its own box, as [row, col], and the column
// the box starts in. The other three turns are made by rotating in the box.
const SPAWN = {
  I: { box: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]], col: 3 },
  O: { box: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]], col: 4 },
  T: { box: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]], col: 3 },
  S: { box: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]], col: 3 },
  Z: { box: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]], col: 3 },
  J: { box: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]], col: 3 },
  L: { box: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]], col: 3 }
}

// SHAPES holds the same cells as [row, col] pairs; FLAT as one flat list per
// turn, [r0, c0, r1, c1, ...], which the server's replay reads every frame
// without allocating anything.
const SHAPES = {}
const FLAT = {}
for (const type of TYPES) {
  const { box, cells } = SPAWN[type]
  const turns = [cells]
  for (let i = 1; i < 4; i++) turns.push(turns[i - 1].map(([r, c]) => [c, box - 1 - r]))
  SHAPES[type] = turns
  FLAT[type] = turns.map((turn) => turn.flat())
}

// A piece's cells for a turn (0 to 3), for drawing previews.
export function shapeCells(type, rot = 0) {
  return SHAPES[type] ? SHAPES[type][((rot % 4) + 4) % 4] : []
}

// Wall kicks to try, in order, when turning from one state to the next:
// [right, up] in cells. 0 is the spawn state, 1 a clockwise turn from it.
const KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
}
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
}
// The same tables as flat lists [dx0, dy0, dx1, dy1, ...], found by
// TURNS[I ? 1 : 0][from * 2 + (clockwise ? 0 : 1)] without building a key.
const TURNS = [KICKS, KICKS_I].map((table) => {
  const out = []
  for (let from = 0; from < 4; from++) {
    out.push(table[`${from}>${(from + 1) % 4}`].flat(), table[`${from}>${(from + 3) % 4}`].flat())
  }
  return out
})

const POINTS = [0, 100, 300, 500, 800]
const TSPIN_POINTS = [400, 800, 1200, 1600]

// A small seeded generator (mulberry32) giving whole numbers below 2^32.
function generator(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }
}

export class Game {
  // onEvent(type, detail) hears what happens, for sound and animation:
  // spawn, move, rotate, fall, drop, hold, lock, clear, level, over.
  constructor(seed, onEvent = null) {
    this.seed = seed >>> 0
    this.random = generator(this.seed)
    this.onEvent = onEvent
    this.grid = []
    for (let r = 0; r < ROWS; r++) this.grid.push(new Array(COLS).fill(null))
    this.queue = []
    this.bag = TYPES.slice()
    this.hold = null
    this.canHold = true
    this.active = { type: 'I', rot: 0, row: 0, col: 0 }
    this.piece = null      // the active piece, { type, rot, row, col }, or null between pieces
    this.serial = 0        // counts pieces as they enter
    this.score = 0
    this.lines = 0
    this.level = 1
    this.pieces = 0
    this.combo = -1
    this.b2b = false
    this.frame = 0
    this.phase = 'falling' // falling | clearing | over
    this.clearing = []     // full rows waiting to clear, top to bottom
    this.clearTimer = 0
    this.soft = false
    this.fall = 0          // frames since the piece last fell a row
    this.lockTimer = 0
    this.resets = 0
    this.lowest = 0        // the lowest row this piece has reached
    this.twist = false     // the piece's last move was a turn (for T-spins)
    this.spawn(this.take())
  }

  // Callers build an event's details only when someone listens, so a
  // replay on the server allocates as little as it can.
  emit(type, detail) {
    if (this.onEvent) this.onEvent(type, detail)
  }

  get over() { return this.phase === 'over' }
  get next() { return this.queue.slice(0, 3) }
  get gravity() { return GRAVITY[this.level] }

  take() {
    while (this.queue.length <= 7) {
      const bag = this.bag
      for (let i = 0; i < 7; i++) bag[i] = TYPES[i]
      for (let i = 6; i > 0; i--) {
        const j = this.random() % (i + 1)
        const t = bag[i]
        bag[i] = bag[j]
        bag[j] = t
      }
      for (let i = 0; i < 7; i++) this.queue.push(bag[i])
    }
    return this.queue.shift()
  }

  spawn(type) {
    const p = this.active
    p.type = type
    p.rot = 0
    p.row = 0
    p.col = SPAWN[type].col
    this.piece = p
    this.serial++
    this.fall = 0
    this.lockTimer = 0
    this.resets = 0
    this.lowest = 0
    this.twist = false
    if (!this.fitsAt(type, 0, 0, SPAWN[type].col)) return this.end()
    if (this.onEvent) this.emit('spawn', { type })
  }

  end() {
    this.phase = 'over'
    this.soft = false
    if (this.onEvent) this.emit('over', { score: this.score, lines: this.lines, level: this.level })
  }

  cells(piece = this.piece) {
    if (!piece) return []
    return SHAPES[piece.type][piece.rot].map(([r, c]) => [piece.row + r, piece.col + c])
  }

  fits(piece, dRow = 0, dCol = 0, rot = piece.rot) {
    return this.fitsAt(piece.type, rot, piece.row + dRow, piece.col + dCol)
  }

  // The same test with every value given: the replay calls this many times
  // a piece, and the runtime makes a scope for each call with defaults.
  fitsAt(type, rot, row, col) {
    const cells = FLAT[type][rot]
    for (let i = 0; i < 8; i += 2) {
      const y = row + cells[i]
      const x = col + cells[i + 1]
      if (x < 0 || x >= COLS || y >= ROWS) return false
      if (y >= 0 && this.grid[y][x] !== null) return false
    }
    return true
  }

  // Whether the piece can fall one more row.
  airborne() {
    const p = this.piece
    return this.fitsAt(p.type, p.rot, p.row + 1, p.col)
  }

  // The row the piece would land on.
  ghostRow() {
    const p = this.piece
    if (!p) return 0
    let d = 0
    while (this.fitsAt(p.type, p.rot, p.row + d + 1, p.col)) d++
    return p.row + d
  }

  // Applies one input now. Returns false when it changes nothing, and only
  // inputs that change something are kept in a game's record.
  input(action) {
    if (this.phase === 'over') return false
    if (action === 'D' || action === 'U') {
      const soft = action === 'D'
      if (this.soft === soft) return false
      this.soft = soft
      return true
    }
    if (this.phase !== 'falling') return false
    switch (action) {
      case 'L': return this.shift(-1)
      case 'R': return this.shift(1)
      case 'C': return this.rotate(1)
      case 'A': return this.rotate(-1)
      case 'H': return this.hardDrop()
      case 'X': return this.swap()
      default: return false
    }
  }

  shift(d) {
    const p = this.piece
    if (!this.fitsAt(p.type, p.rot, p.row, p.col + d)) return false
    this.piece.col += d
    this.twist = false
    this.grounded()
    if (this.onEvent) this.emit('move', { d })
    return true
  }

  rotate(dir) {
    const p = this.piece
    if (p.type === 'O') return false
    const to = (p.rot + dir + 4) % 4
    const kicks = TURNS[p.type === 'I' ? 1 : 0][p.rot * 2 + (dir > 0 ? 0 : 1)]
    for (let i = 0; i < kicks.length; i += 2) {
      const dx = kicks[i]
      const dy = kicks[i + 1]
      if (!this.fitsAt(p.type, to, p.row - dy, p.col + dx)) continue
      p.rot = to
      p.col += dx
      p.row -= dy
      this.twist = true
      this.grounded()
      if (this.onEvent) this.emit('rotate', { dir })
      return true
    }
    return false
  }

  // A move on the ground restarts the lock grace, a limited number of times.
  grounded() {
    if (!this.airborne() && this.resets < MAX_RESETS) {
      this.lockTimer = 0
      this.resets++
    }
  }

  hardDrop() {
    const p = this.piece
    const from = p.row
    let d = 0
    while (this.fitsAt(p.type, p.rot, p.row + d + 1, p.col)) d++
    p.row += d
    this.score += d * 2
    if (d) this.twist = false
    if (this.onEvent) this.emit('drop', { rows: d, from, cells: this.cells(p) })
    this.lock()
    return true
  }

  swap() {
    if (!this.canHold) return false
    const out = this.hold
    this.hold = this.piece.type
    this.canHold = false
    if (this.onEvent) this.emit('hold', { type: this.hold })
    this.spawn(out || this.take())
    return true
  }

  // One frame of play.
  step() {
    if (this.phase === 'over') return
    this.frame++
    if (this.frame >= MAX_FRAMES) return this.end()
    if (this.phase === 'clearing') {
      if (--this.clearTimer > 0) return
      this.settle()
      return
    }
    if (this.airborne()) {
      this.lockTimer = 0
      const every = this.soft ? Math.max(1, Math.floor(GRAVITY[this.level] / 20)) : GRAVITY[this.level]
      if (++this.fall >= every) this.fallRow()
    } else {
      this.fall = 0
      if (++this.lockTimer >= LOCK_FRAMES) this.lock()
    }
  }

  // n frames at once, the same as calling step() n times with no input in
  // between, but jumping from one event to the next (a row of fall, a lock,
  // the end of a clear), so replaying a long game stays quick and lean.
  advance(n) {
    while (n > 0 && this.phase !== 'over') {
      const room = MAX_FRAMES - 1 - this.frame
      if (room <= 0) {
        this.frame++
        return this.end()
      }
      const most = Math.min(n, room)
      if (this.phase === 'clearing') {
        const k = Math.min(most, this.clearTimer)
        this.frame += k
        this.clearTimer -= k
        n -= k
        if (this.clearTimer === 0) this.settle()
        continue
      }
      if (this.airborne()) {
        const every = this.soft ? Math.max(1, Math.floor(GRAVITY[this.level] / 20)) : GRAVITY[this.level]
        const k = Math.max(1, Math.min(most, every - this.fall))
        this.frame += k
        this.fall += k
        this.lockTimer = 0
        n -= k
        if (this.fall >= every) this.fallRow()
      } else {
        const k = Math.max(1, Math.min(most, LOCK_FRAMES - this.lockTimer))
        this.frame += k
        this.fall = 0
        this.lockTimer += k
        n -= k
        if (this.lockTimer >= LOCK_FRAMES) this.lock()
      }
    }
  }

  fallRow() {
    const p = this.piece
    this.fall = 0
    p.row++
    this.twist = false
    if (this.soft) this.score++
    if (p.row > this.lowest) {
      this.lowest = p.row
      this.resets = 0
    }
    if (this.onEvent) this.emit('fall')
  }

  lock() {
    const p = this.piece
    let above = false
    const cells = FLAT[p.type][p.rot]
    for (let i = 0; i < 8; i += 2) {
      const r = p.row + cells[i]
      const c = p.col + cells[i + 1]
      if (r < 0) above = true
      else this.grid[r][c] = p.type
    }
    const tspin = this.isTSpin(p)
    const full = this.clearing
    full.length = 0
    for (let r = 0; r < ROWS; r++) if (this.grid[r].indexOf(null) < 0) full.push(r)
    const points = this.award(full.length, tspin)
    this.pieces++
    this.piece = null
    this.canHold = true
    if (this.onEvent) this.emit('lock', { type: p.type, cells: this.cells(p), rows: full.slice(), tspin, points })
    if (above) return this.end()
    if (full.length) {
      this.phase = 'clearing'
      this.clearTimer = CLEAR_FRAMES
      if (this.onEvent) this.emit('clear', { rows: full.slice(), tspin, b2b: this.b2b && (full.length === 4 || tspin), combo: this.combo, points })
    } else {
      this.spawn(this.take())
    }
  }

  // The full rows go and the stack above them settles down.
  settle() {
    const rows = this.clearing
    const grid = this.grid
    let to = ROWS - 1
    for (let from = ROWS - 1; from >= 0; from--) {
      if (rows.indexOf(from) >= 0) continue
      if (to !== from) for (let c = 0; c < COLS; c++) grid[to][c] = grid[from][c]
      to--
    }
    for (; to >= 0; to--) for (let c = 0; c < COLS; c++) grid[to][c] = null
    this.phase = 'falling'
    rows.length = 0
    this.spawn(this.take())
  }

  // Three of the four corners round a T's centre filled, after a turn.
  isTSpin(p) {
    if (p.type !== 'T' || !this.twist) return false
    let filled = 0
    for (let i = 0; i < 4; i++) {
      const r = p.row + (i < 2 ? 0 : 2)
      const c = p.col + (i % 2 ? 2 : 0)
      if (c < 0 || c >= COLS || r >= ROWS || (r >= 0 && this.grid[r][c])) filled++
    }
    return filled >= 3
  }

  award(n, tspin) {
    const level = this.level
    let points = (tspin ? TSPIN_POINTS[n] : POINTS[n]) * level
    if (n > 0) {
      const hard = n === 4 || tspin
      if (hard && this.b2b) points = Math.floor(points * 3 / 2)
      this.b2b = hard
      this.combo++
      points += 50 * this.combo * level
      this.lines += n
      const next = Math.min(MAX_LEVEL, 1 + Math.floor(this.lines / 10))
      if (next > this.level) {
        this.level = next
        if (this.onEvent) this.emit('level', { level: next })
      }
    } else {
      this.combo = -1
    }
    this.score += points
    return points
  }
}

/* ---- a game's record ------------------------------------------------- */

// Inputs travel as text: for each one, the frames since the one before in
// base 36 (left out when none), then its letter. "C9L3LkH" means turn on
// frame 0, left on frame 9 and again on 12, then a hard drop on frame 32.
export function encode(inputs) {
  let out = ''
  let last = 0
  for (const [frame, action] of inputs) {
    const gap = frame - last
    out += (gap ? gap.toString(36) : '') + action
    last = frame
  }
  return out
}

const LETTERS = {}
for (const action of ACTIONS) LETTERS[action.charCodeAt(0)] = action

// The value of one base-36 digit, or -1.
function digit(code) {
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 97 && code <= 122) return code - 87
  return -1
}

export function decode(text) {
  if (typeof text !== 'string' || text.length > MAX_LOG) return null
  const inputs = []
  let frame = 0
  let gap = 0
  let digits = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const action = LETTERS[code]
    if (action) {
      frame += gap
      gap = digits = 0
      inputs.push([frame, action])
    } else if (digit(code) >= 0 && digits < 6) {
      gap = gap * 36 + digit(code)
      digits++
    } else {
      return null
    }
  }
  return digits ? null : inputs
}

// Plays a recorded game from its seed to the end. Returns its result, or
// null if the record breaks the rules: an input that changes nothing, or an
// input after the end. It reads the record as it goes and jumps from event
// to event, allocating next to nothing, because the server's runtime counts
// every allocation against a small budget.
export function replay(seed, log) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null
  if (typeof log !== 'string' || log.length > MAX_LOG) return null
  const game = new Game(seed)
  let frame = 0
  let gap = 0
  let digits = 0
  for (let i = 0; i < log.length; i++) {
    const code = log.charCodeAt(i)
    const action = LETTERS[code]
    if (action) {
      frame += gap
      gap = digits = 0
      if (frame > MAX_FRAMES) return null
      game.advance(frame - game.frame)
      if (game.over || game.frame !== frame || !game.input(action)) return null
    } else if (digit(code) >= 0 && digits < 6) {
      gap = gap * 36 + digit(code)
      digits++
    } else {
      return null
    }
  }
  if (digits) return null
  game.advance(MAX_FRAMES - game.frame)
  if (!game.over) return null
  return { score: game.score, lines: game.lines, level: game.level, pieces: game.pieces, frames: game.frame }
}

// Whether result a beats b: a higher score, then more lines, then sooner.
export function better(a, b) {
  if (!a) return false
  if (!b) return true
  return a.score > b.score || (a.score === b.score && (a.lines > b.lines || (a.lines === b.lines && a.frames < b.frames)))
}
