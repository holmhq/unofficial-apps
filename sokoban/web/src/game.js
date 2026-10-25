// Sokoban — the play screen. Owns the board, the move queue and its slide
// animation, undo and restart, and the cards shown at the start and after a
// win. Saving results and talking to the server belong to app.js.

import { createGame, DIRS, LEVELS, levelPoints, totals } from './rules.js'
import { createRenderer } from './render.js'
import { attachControls } from './controls.js'
import { sfx } from './audio.js'
import { prefs } from './state.js'
import { icon } from './icons.js'

const STEP_MS = 105 // one step's slide
const WALK_MS = 62  // a step in a tapped walk, so long walks don't drag
const POP_MS = 180
const QUEUE_MAX = 2 // keys pressed ahead of the animation

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const easeOut = (t) => 1 - (1 - t) * (1 - t)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

export function mountPlay(container, handlers) {
  /* ---- HUD pill in the navbar: level | moves | pushes | points ---- */
  const hud = el('div', { class: 'hud' })
  const [levelV, movesV, pushesV, ptsV] = ['Level', 'Moves', 'Pushes', 'Points'].map((label) => {
    const cell = el('div', { class: 'hud-cell' }, el('div', { class: 'k' }, label))
    const v = el('div', { class: 'v' }, '0')
    cell.appendChild(v)
    hud.appendChild(cell)
    return v
  })
  handlers.hudSlot.appendChild(hud)

  /* ---- play area: caption, board, cards, action bar ---- */
  const prevBtn = actionBtn('chevronLeft', 'Previous level', () => setLevel(index - 1), 'icon-btn ghost-btn')
  const nextBtn = actionBtn('chevronRight', 'Next level', () => setLevel(index + 1), 'icon-btn ghost-btn')
  const titleV = el('div', { class: 'cap-title' })
  const metaV = el('div', { class: 'cap-meta' })
  const caption = el('div', { class: 'caption' }, prevBtn, el('div', { class: 'cap-text' }, titleV, metaV), nextBtn)

  const canvas = el('canvas', { class: 'field' })
  const fieldWrap = el('div', { class: 'field-wrap' }, canvas)
  const board = el('div', { class: 'board-area' }, fieldWrap)
  const hint = el('div', { class: 'hint', hidden: '' })
  const cards = el('div', { class: 'cards' })
  const stage = el('div', { class: 'stage' }, caption, board, hint, cards)

  const undoBtn = actionBtn('undo', 'Undo (Z)', () => undo())
  const resetBtn = actionBtn('rewind', 'Restart level (R)', () => restart())
  const levelsBtn = actionBtn('list', 'Levels', () => handlers.openLevels())
  const actions = el('div', { class: 'action-bar' }, undoBtn, resetBtn, levelsBtn)

  container.append(stage, actions)

  const renderer = createRenderer({ field: canvas })

  let index = 0
  let game = null
  let status = 'playing' // start | playing | won
  let facing = 'down'
  let queue = []      // steps waiting for the animation, each { dir, ms }
  let anim = null     // the step being drawn
  let pop = null      // a box that just landed on a goal
  let marks = []      // game.moves at the start of each action, for undo
  let restarts = []   // { path, marks } saved by Restart, so undo can bring them back
  let restartTold = false
  let raf = 0

  /* ---- levels ---- */
  function setLevel(i) {
    index = (i + LEVELS.length) % LEVELS.length
    prefs.set('level', index)
    game = createGame(LEVELS[index])
    facing = 'down'
    queue = []
    anim = pop = null
    marks = []
    restarts = []
    status = 'playing'
    renderer.setLevel(game)
    measure()
    hideCard()
    syncCaption()
    syncStats()
    draw()
  }

  // Where to go after solving level i: the next one, and after the last,
  // the first level not yet solved.
  function nextIndex(i) {
    if (i + 1 < LEVELS.length) return i + 1
    const open = LEVELS.findIndex((level) => !prefs.progress[level.id])
    return open >= 0 ? open : 0
  }

  function measure() {
    if (!game) return
    const w = board.clientWidth
    const h = board.clientHeight
    if (!w || !h) return
    renderer.resize(clamp(Math.min(Math.floor(w / renderer.cols), Math.floor(h / renderer.rows)), 14, 64))
    draw()
  }

  /* ---- moves ---- */
  // Starts an action: everything in it is undone together.
  function act(dirs, ms = STEP_MS) {
    if (status !== 'playing' || !dirs.length) return
    marks.push(game.moves)
    for (const dir of dirs) queue.push({ dir, ms: reduceMotion.matches ? 1 : ms })
    if (!anim) advance()
  }

  // Takes the next queued step, if the last one has finished sliding.
  function advance() {
    const next = queue.shift()
    if (!next) return
    const { dir, ms } = next
    const d = DIRS[dir]
    const w = game.width
    const from = { x: game.player % w, y: Math.floor(game.player / w) }
    facing = dir
    const result = game.move(dir)
    if (!result) {
      queue = []
      if (marks[marks.length - 1] === game.moves) marks.pop() // nothing happened
      sfx.blocked()
      shake()
      draw()
      return
    }
    const to = { x: game.player % w, y: Math.floor(game.player / w) }
    anim = { start: performance.now(), ms, from, to, boxKey: null }
    if (result === 'push') {
      const key = (to.y + d.dy) * w + (to.x + d.dx)
      Object.assign(anim, { boxKey: key, boxFrom: to, boxTo: { x: to.x + d.dx, y: to.y + d.dy } })
      if (game.goals.has(key)) {
        sfx.goal()
        pop = { key, start: performance.now() + ms }
        haptic(14)
      } else {
        sfx.push()
        haptic(8)
      }
    } else if (ms === STEP_MS) {
      sfx.move()
    }
    syncStats()
    if (game.isWon()) {
      queue = []
      win()
    }
    draw()
  }

  function onMove(dir, repeat) {
    if (status !== 'playing') return
    dismissHint()
    // A held key walks at the animation's pace instead of racing ahead.
    if ((repeat && (anim || queue.length)) || queue.length >= QUEUE_MAX) return
    act([dir])
  }

  // A tap walks to a square, or pushes a box standing next to the player.
  function onTap(clientX, clientY) {
    if (status !== 'playing') return
    dismissHint()
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left) / renderer.cell)
    const y = Math.floor((clientY - rect.top) / renderer.cell)
    if (x < 0 || y < 0 || x >= game.width || y >= game.height) return
    queue = []
    const target = y * game.width + x
    if (game.boxes.has(target)) {
      const dir = Object.keys(DIRS).find((d) => game.next(game.player, d) === target)
      if (dir) act([dir])
      else shake()
      return
    }
    const path = game.route(target)
    if (path === null) shake()
    else act(path, path.length > 1 ? WALK_MS : STEP_MS)
  }

  function undo() {
    if (!game || status === 'start') return
    queue = []
    anim = pop = null
    if (marks.length) {
      const mark = marks.pop()
      while (game.moves > mark) game.undo()
    } else if (restarts.length) {
      const saved = restarts.pop()
      game.replay(saved.path)
      marks = saved.marks
    } else {
      return
    }
    if (status === 'won') {
      status = 'playing'
      prefs.set('level', index)
      hideCard()
    }
    sfx.undo()
    syncStats()
    draw()
  }

  function restart() {
    if (!game || status === 'start' || !game.moves) return
    restarts.push({ path: game.path, marks })
    game.reset()
    queue = []
    anim = pop = null
    marks = []
    status = 'playing'
    hideCard()
    sfx.undo()
    syncStats()
    draw()
    if (!restartTold) {
      restartTold = true
      handlers.toast('Restarted. Undo brings your moves back.')
    }
  }

  function shake() {
    fieldWrap.classList.remove('shake')
    void fieldWrap.offsetWidth
    fieldWrap.classList.add('shake')
  }
  function haptic(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern) } catch (_e) {} }
  }

  /* ---- win ---- */
  function win() {
    status = 'won'
    sfx.win()
    haptic([10, 30, 16])
    const level = LEVELS[index]
    const result = { moves: game.moves, pushes: game.pushes, path: game.path }
    const before = prefs.progress[level.id]
    const allBefore = totals(prefs.progress).levels === LEVELS.length
    const isBest = prefs.recordWin(level.id, result)
    const sum = totals(prefs.progress)
    // A reload from here opens the next level, not the one just solved.
    prefs.set('level', nextIndex(index))
    syncStats()
    syncCaption()
    const kind = sum.levels === LEVELS.length && !allBefore ? 'alldone' : 'won'
    setTimeout(() => {
      if (status === 'won') showCard(kind, { level, result, before, isBest, sum })
    }, STEP_MS + 240)
    handlers.onWin(level, result, isBest)
  }

  /* ---- drawing ---- */
  function draw() {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function frame(now) {
    raf = 0
    if (!game) return
    const w = game.width
    let player = { x: game.player % w, y: Math.floor(game.player / w) }
    let moving = null
    if (anim) {
      const t = clamp((now - anim.start) / anim.ms, 0, 1)
      const k = easeOut(t)
      player = { x: anim.from.x + (anim.to.x - anim.from.x) * k, y: anim.from.y + (anim.to.y - anim.from.y) * k }
      if (anim.boxKey != null) {
        moving = {
          key: anim.boxKey,
          x: anim.boxFrom.x + (anim.boxTo.x - anim.boxFrom.x) * k,
          y: anim.boxFrom.y + (anim.boxTo.y - anim.boxFrom.y) * k
        }
      }
      if (t >= 1) anim = null
    }

    const boxes = []
    for (const key of game.boxes) {
      if (moving && key === moving.key) {
        boxes.push({ x: moving.x, y: moving.y, onGoal: false })
        continue
      }
      let scale = 1
      if (pop && pop.key === key) {
        const t = (now - pop.start) / POP_MS
        if (t >= 0 && t <= 1) scale = 1 + 0.14 * Math.sin(t * Math.PI)
        else if (t > 1) pop = null
      }
      boxes.push({ x: key % w, y: Math.floor(key / w), onGoal: game.goals.has(key), pop: scale })
    }
    renderer.draw({ boxes, player, facing })

    if (!anim && queue.length) advance()
    if (anim || pop || queue.length) draw()
  }

  /* ---- HUD and caption ---- */
  let lastPts = -1
  function syncStats() {
    if (!game) return
    levelV.textContent = `${index + 1}/${LEVELS.length}`
    movesV.textContent = game.moves
    pushesV.textContent = game.pushes
    const pts = totals(prefs.progress).score
    if (pts !== lastPts) {
      if (lastPts >= 0) flash(ptsV.parentNode)
      lastPts = pts
      ptsV.textContent = pts.toLocaleString()
    }
    undoBtn.disabled = status === 'start' || (!game.moves && !restarts.length)
    resetBtn.disabled = status === 'start' || !game.moves
  }
  function syncCaption() {
    const level = LEVELS[index]
    const best = prefs.progress[level.id]
    titleV.textContent = `${index + 1} · ${level.name}`
    metaV.textContent = best
      ? `par ${level.par} · your best ${plural(best.pushes, 'push', 'pushes')}`
      : `par ${level.par} · not solved yet`
    metaV.classList.toggle('done', !!best)
  }
  function flash(node) {
    node.classList.add('flash')
    setTimeout(() => node.classList.remove('flash'), 160)
  }

  /* ---- cards ---- */
  function cta(label, ico, fn, ghost = false) {
    const b = el('button', { class: 'btn ov-cta' + (ghost ? ' ghost' : ''), type: 'button' })
    b.innerHTML = icon(ico, 18) + '<span>' + label + '</span>'
    b.addEventListener('click', fn)
    return b
  }

  function showCard(kind, info = {}) {
    hideCard()
    const card = el('div', { class: 'ov-card', role: 'dialog', 'aria-live': 'polite' })
    let first = null
    if (kind === 'start') {
      card.append(
        el('img', { class: 'ov-mark', src: '/icon-192.png', alt: '', width: '56', height: '56' }),
        el('div', { class: 'ov-title' }, 'Sokoban'),
        el('div', { class: 'ov-sub' }, 'Push every box onto a ring. Boxes only move when pushed, and never two at once.')
      )
      first = cta('Play', 'play', () => { status = 'playing'; hideCard(); syncStats(); showHint() })
      card.append(first, el('div', { class: 'ov-hint' }, finePointer.matches
        ? 'Arrow keys walk · Z undo · R restart · or click a square to walk there'
        : 'Swipe to walk, or tap a square to walk there. Tap a box beside you to push it.'))
    } else if (kind === 'won') {
      const { level, result, before, isBest } = info
      card.append(
        el('div', { class: 'ov-kicker' }, `Level ${index + 1} solved`),
        el('div', { class: 'ov-score' }, '+' + levelPoints(level.par, result.pushes).toLocaleString()),
        el('div', { class: 'ov-meta' }, `${plural(result.pushes, 'push', 'pushes')} · par ${level.par} · ${plural(result.moves, 'move', 'moves')}`)
      )
      if (result.pushes <= level.par) card.append(el('div', { class: 'ov-badge' }, 'Par: perfect'))
      else if (isBest && before) card.append(el('div', { class: 'ov-badge' }, 'New personal best'))
      else if (!isBest && before) card.append(el('div', { class: 'ov-note' }, `Your best is ${plural(before.pushes, 'push', 'pushes')}`))
      first = cta(nextLabel(), 'chevronRight', () => setLevel(nextIndex(index)))
      card.append(first, cta('Replay', 'rewind', () => setLevel(index), true))
      if (finePointer.matches) card.append(el('div', { class: 'ov-hint' }, 'Enter for the next level · Z to undo the last push'))
    } else if (kind === 'alldone') {
      const { sum } = info
      card.append(
        el('div', { class: 'ov-kicker' }, `All ${LEVELS.length} levels solved`),
        el('div', { class: 'ov-score' }, sum.score.toLocaleString()),
        el('div', { class: 'ov-meta' }, `${plural(sum.pushes, 'push', 'pushes')} in all · par is ${LEVELS.reduce((n, l) => n + l.par, 0)}`)
      )
      first = cta('Leaderboard', 'trophy', () => handlers.openLeaderboard())
      card.append(first)
      if (!handlers.isSignedIn()) card.append(cta('Sign in to join it', 'login', () => handlers.signIn(), true))
      card.append(cta(nextLabel(), 'chevronRight', () => setLevel(nextIndex(index)), true))
    }
    cards.appendChild(el('div', { class: 'overlay' }, card))
    cards.classList.add('on')
    // The card's first button takes the focus, so Enter and Space go on
    // from here rather than pressing whatever button was clicked last.
    if (first) first.focus({ preventScroll: true })
  }
  function nextLabel() {
    const n = nextIndex(index)
    return n === index + 1 ? 'Next level' : `Level ${n + 1}`
  }
  function hideCard() {
    cards.innerHTML = ''
    cards.classList.remove('on')
  }

  /* ---- first-play hint ---- */
  let hintTimer = null
  function showHint() {
    if (prefs.hintSeen) return
    prefs.set('hintSeen', true)
    hint.innerHTML = finePointer.matches
      ? '<span><b>Arrows</b> walk</span><span><b>Z</b> undo</span><span><b>R</b> restart</span>'
      : '<span><b>Swipe</b> or <b>tap</b> to walk</span><span><b>Tap a box</b> to push</span>'
    hint.hidden = false
    hintTimer = setTimeout(dismissHint, 5000)
  }
  function dismissHint() {
    if (hint.hidden) return
    clearTimeout(hintTimer)
    hint.classList.add('out')
    setTimeout(() => { hint.hidden = true; hint.classList.remove('out') }, 300)
  }

  /* ---- wiring ---- */
  attachControls(stage, {
    isEnabled: () => status === 'playing',
    isBlocked: handlers.isBlocked,
    onMove,
    onTap,
    onUndo: undo,
    onReset: restart,
    // Enter, Space or N on a solved level: the card's next step.
    onNext: () => {
      if (status !== 'won') return false
      setLevel(nextIndex(index))
      return true
    }
  })

  prefs.on(() => { renderer.setConfig({ paletteId: prefs.palette }); draw() })
  renderer.setConfig({ paletteId: prefs.palette })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderer.setConfig({}); draw() })
  new ResizeObserver(measure).observe(board)

  setLevel(clamp(prefs.level | 0, 0, LEVELS.length - 1))
  if (!prefs.hintSeen) {
    status = 'start'
    syncStats()
    showCard('start')
  }

  return {
    setLevel,
    get index() { return index },
    // After the server's bests are folded in.
    refresh() { syncCaption(); syncStats() }
  }

  function actionBtn(ico, label, fn, cls = 'icon-btn action') {
    const b = el('button', { class: cls, type: 'button', 'aria-label': label, title: label })
    b.innerHTML = icon(ico, 20)
    // A click leaves the focus where it was, so Enter and Space never press
    // this button by accident later.
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', fn)
    return b
  }
}

/* ---- tiny DOM helper local to the play screen ---- */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v
    else n.setAttribute(k, v)
  }
  for (const kid of kids) n.append(kid)
  return n
}
