// Snake — the rules, shared by the page and the server (api/rules.js is an
// exact copy). A game is a seed and a list of turns, each stamped with the
// frame it happened on: the same seed and turns always play out the same
// way, so the server can replay a whole game to check its score.
//
// Time runs in frames, 60 to a second, and only while the game is playing;
// the page decides when a frame passes. Nothing here reads the clock, the
// DOM or Math.random, and the hot paths allocate nothing, because the
// server's runtime counts every allocation against a small budget.
//
// The field wraps at its edges, so only the snake itself is in the way.
// Each berry adds a cell and points; every few berries a bloom opens for a
// while, worth more. The pace rises a little every five berries and levels
// off. A game ends when the snake runs into itself, fills the field, or has
// lasted two hours of play.

export const COLS = 15
export const ROWS = 25
export const CELLS = COLS * ROWS
export const FPS = 60
export const MAX_LEVEL = 10
export const MAX_FRAMES = FPS * 60 * 120
export const MAX_LOG = 300000 // characters of input text a game may send

// The inputs, one letter each: turn Up, Down, Left or Right.
export const ACTIONS = 'UDLR'
const DX = { U: 0, D: 0, L: -1, R: 1 }
const DY = { U: -1, D: 1, L: 0, R: 0 }
const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L' }

// Frames per step at each level: from five and a half cells a second to ten.
const STEPS = [11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6]
const START_LENGTH = 3
const BERRIES_PER_LEVEL = 5
const BLOOM_EVERY = 6  // a bloom opens after every sixth berry
const BLOOM_STEPS = 40 // and stays for this many steps
const BLOOM_POINTS = 50
const BERRY_POINTS = 10
const MAX_TURNS = 3    // turns that can wait for the next step

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
  // turn, eat, bloom, wilt, level, over.
  constructor(seed, onEvent = null) {
    this.seed = seed >>> 0
    this.random = generator(this.seed)
    this.onEvent = onEvent
    this.taken = new Uint8Array(CELLS) // 1 where the snake is
    this.body = new Int16Array(CELLS)  // a ring of cells; the head is at headAt
    this.headAt = -1
    this.length = 0
    this.dir = 'R'
    this.turns = []        // turns waiting for the next step
    this.food = -1
    this.bloom = -1
    this.bloomLeft = 0
    this.eaten = 0
    this.blooms = 0
    this.score = 0
    this.level = 1
    this.frame = 0
    this.timer = 0         // frames since the last step
    this.steps = 0
    this.phase = 'playing' // playing | over
    this.won = false
    this.crash = -1        // the cell the snake ran into
    this.left = -1         // the cell the tail left on the last step, for drawing
    const start = (ROWS >> 1) * COLS + (COLS >> 1) - START_LENGTH + 1
    for (let i = 0; i < START_LENGTH; i++) this.push(start + i)
    this.food = this.pick()
  }

  emit(type, detail) {
    if (this.onEvent) this.onEvent(type, detail)
  }

  get over() { return this.phase === 'over' }
  get head() { return this.body[this.headAt] }
  get every() { return STEPS[this.level] }

  // The i-th cell from the head.
  cellAt(i) { return this.body[(this.headAt - i + CELLS) % CELLS] }

  // The snake's cells, head first, for drawing.
  cells() {
    const out = []
    for (let i = 0; i < this.length; i++) out.push(this.cellAt(i))
    return out
  }

  push(cell) {
    this.headAt = (this.headAt + 1) % CELLS
    this.body[this.headAt] = cell
    this.taken[cell] = 1
    this.length++
  }

  // A free cell chosen by the seed, or -1 when there is none.
  pick() {
    let free = CELLS - this.length - (this.food >= 0 ? 1 : 0) - (this.bloom >= 0 ? 1 : 0)
    if (free <= 0) return -1
    let r = this.random() % free
    for (let c = 0; c < CELLS; c++) {
      if (this.taken[c] === 1 || c === this.food || c === this.bloom) continue
      if (r === 0) return c
      r--
    }
    return -1
  }

  // Asks to turn at the next step. Returns false when it changes nothing
  // (the way it already goes, straight back, or too many waiting), and only
  // turns that change something are kept in a game's record.
  input(action) {
    if (this.phase === 'over' || ACTIONS.indexOf(action) < 0 || action.length !== 1) return false
    const last = this.turns.length ? this.turns[this.turns.length - 1] : this.dir
    if (action === last || action === OPPOSITE[last] || this.turns.length >= MAX_TURNS) return false
    this.turns.push(action)
    if (this.onEvent) this.emit('turn', { dir: action })
    return true
  }

  // One frame of play.
  step() {
    if (this.phase === 'over') return
    this.frame++
    if (this.frame >= MAX_FRAMES) return this.end()
    if (++this.timer >= STEPS[this.level]) this.move()
  }

  // n frames at once, the same as calling step() n times with no input in
  // between, but jumping from one move to the next.
  advance(n) {
    while (n > 0 && this.phase !== 'over') {
      const room = MAX_FRAMES - 1 - this.frame
      if (room <= 0) {
        this.frame++
        return this.end()
      }
      const k = Math.max(1, Math.min(n, room, STEPS[this.level] - this.timer))
      this.frame += k
      this.timer += k
      n -= k
      if (this.timer >= STEPS[this.level]) this.move()
    }
  }

  move() {
    this.timer = 0
    this.steps++
    if (this.turns.length) this.dir = this.turns.shift()
    const head = this.head
    const x = (head % COLS + DX[this.dir] + COLS) % COLS
    const y = ((head - head % COLS) / COLS + DY[this.dir] + ROWS) % ROWS
    const next = y * COLS + x
    const eats = next === this.food
    const tail = this.cellAt(this.length - 1)
    // The tail moves on this step unless the snake grows, so the head may
    // take the cell it leaves.
    if (this.taken[next] === 1 && (eats || next !== tail)) {
      this.crash = next
      return this.end()
    }
    if (eats) {
      this.left = -1
    } else {
      this.taken[tail] = 0
      this.length--
      this.left = tail
    }
    this.push(next)

    if (this.bloom >= 0) {
      if (next === this.bloom) {
        const points = BLOOM_POINTS * this.level
        this.score += points
        this.blooms++
        if (this.onEvent) this.emit('bloom', { cell: next, points })
        this.bloom = -1
      } else if (--this.bloomLeft <= 0) {
        if (this.onEvent) this.emit('wilt', { cell: this.bloom })
        this.bloom = -1
      }
    }

    if (eats) {
      const points = BERRY_POINTS * this.level
      this.eaten++
      this.score += points
      if (this.onEvent) this.emit('eat', { cell: next, points, eaten: this.eaten })
      const level = Math.min(MAX_LEVEL, 1 + Math.floor(this.eaten / BERRIES_PER_LEVEL))
      if (level > this.level) {
        this.level = level
        if (this.onEvent) this.emit('level', { level })
      }
      this.food = -1
      if (this.eaten % BLOOM_EVERY === 0 && this.bloom < 0) {
        this.bloom = this.pick()
        this.bloomLeft = BLOOM_STEPS
      }
      this.food = this.pick()
      if (this.food < 0) {
        this.won = true
        return this.end()
      }
    }
  }

  end() {
    this.phase = 'over'
    this.turns.length = 0
    if (this.onEvent) this.emit('over', { won: this.won, score: this.score, length: this.length })
  }
}

/* ---- a game's record ------------------------------------------------- */

// Inputs travel as text: for each one, the frames since the one before in
// base 36 (left out when none), then its letter. "U9Lk2D" means up on frame
// 0, left on frame 9, then down on frame 107.
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
// input after the end. It reads the record as it goes and jumps from move
// to move, allocating next to nothing.
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
  return { score: game.score, length: game.length, level: game.level, eaten: game.eaten, won: game.won, frames: game.frame }
}

// Whether result a beats b: a higher score, then a longer snake, then sooner.
export function better(a, b) {
  if (!a) return false
  if (!b) return true
  return a.score > b.score || (a.score === b.score && (a.length > b.length || (a.length === b.length && a.frames < b.frames)))
}
