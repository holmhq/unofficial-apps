// Strata — the play screen. Owns the game, the frame loop, the record of
// inputs, and the cards shown at the start, on pause and at the end. The
// game in progress is saved as it goes, so a reload or a closed tab carries
// on where it stopped. Talking to the server belongs to app.js.

import { Game, FPS, encode, decode } from './rules.js'
import { createRenderer } from './render.js'
import { attachControls } from './controls.js'
import { sfx } from './audio.js'
import { prefs } from './state.js'
import { icon } from './icons.js'

const STEP_MS = 1000 / FPS
const OVER_CALM_MS = 900 // the end card ignores keys and taps this long, so a drop meant for the game can't restart it
const CLEARS = ['', 'Single', 'Double', 'Triple', 'Four lines']
const TWISTS = ['T-spin', 'T-spin single', 'T-spin double', 'T-spin triple']

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')

export function duration(frames) {
  const s = Math.floor(frames / FPS)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function newSeed() {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]
}

export function mountPlay(container, handlers) {
  /* ---- HUD pill in the navbar: score | level | lines | next | hold ---- */
  const hud = el('div', { class: 'hud' })
  const cellOf = (label, value) => {
    const cell = el('div', { class: 'hud-cell' }, el('div', { class: 'k' }, label), value)
    hud.appendChild(cell)
    return cell
  }
  const scoreV = el('div', { class: 'v' }, '0')
  const levelV = el('div', { class: 'v' }, '1')
  const linesV = el('div', { class: 'v' }, '0')
  const nextCanvas = el('canvas', { class: 'mini' })
  const holdCanvas = el('canvas', { class: 'mini' })
  const scoreCell = cellOf('Score', scoreV)
  cellOf('Level', levelV)
  cellOf('Lines', linesV)
  cellOf('Next', nextCanvas)
  const holdCell = cellOf('Hold', holdCanvas)
  holdCell.classList.add('hold')
  handlers.hudSlot.appendChild(hud)

  /* ---- play area: board, callouts, cards, action bar ---- */
  const canvas = el('canvas', { class: 'field' })
  const callout = el('div', { class: 'callout', 'aria-live': 'polite' })
  const fieldWrap = el('div', { class: 'field-wrap' }, canvas, callout)
  const board = el('div', { class: 'board-area' }, fieldWrap)
  const hint = el('div', { class: 'hint', hidden: '' })
  const cards = el('div', { class: 'cards' })
  const stage = el('div', { class: 'stage' }, board, hint, cards)

  const holdBtn = actionBtn('swap', 'Hold (C)', () => act('X'))
  const pauseBtn = actionBtn('pause', 'Pause (P)', () => togglePause(), 'icon-btn action main')
  const turnBtn = actionBtn('rotateCcw', 'Turn anticlockwise (Z)', () => act('A'))
  const actions = el('div', { class: 'action-bar' }, holdBtn, pauseBtn, turnBtn)
  container.append(stage, actions)

  const renderer = createRenderer({ field: canvas, hold: holdCanvas, next: nextCanvas })

  let game = new Game(newSeed())
  let inputs = []
  let status = 'idle' // idle | playing | paused | over
  let raf = 0
  let lastTs = 0
  let acc = 0
  let dropFrame = -1
  let overAt = 0

  /* ---- the game ---- */
  function onEvent(type, d) {
    switch (type) {
      case 'move': sfx.move(); break
      case 'rotate': sfx.rotate(); break
      case 'hold': sfx.hold(); break
      case 'drop':
        dropFrame = game.frame
        if (d.rows > 0) {
          sfx.drop()
          renderer.trail(d.cells, d.from, game.piece.type)
          haptic(8)
        }
        break
      case 'lock':
        if (dropFrame !== game.frame) sfx.lock()
        renderer.flash(d.cells)
        if (d.tspin && !d.rows.length) say(TWISTS[0], d.points)
        save()
        break
      case 'clear': {
        const n = d.rows.length
        sfx.clear(n, d.combo)
        haptic(n === 4 ? [12, 30, 18] : 10)
        const extra = []
        if (d.b2b) extra.push('back to back')
        if (d.combo > 0) extra.push(`${d.combo + 1} in a row`)
        say(d.tspin ? TWISTS[n] : CLEARS[n], d.points, extra.join(' · '))
        break
      }
      case 'level':
        setTimeout(() => { sfx.level(); say(`Level ${d.level}`) }, 380)
        break
      case 'over': setTimeout(finish, 450); break
      default:
    }
  }

  // Applies an input and, if it changed anything, keeps it in the record.
  function act(action) {
    if (status !== 'playing') return false
    if (!game.input(action)) return false
    inputs.push([game.frame, action])
    kick()
    return true
  }

  function start() {
    game = new Game(newSeed(), onEvent)
    inputs = []
    acc = 0
    status = 'playing'
    hideCard()
    controls.reset()
    showHint()
    save()
    sync()
    kick()
  }

  function pause() {
    if (status !== 'playing') return
    status = 'paused'
    controls.reset()
    save()
    showCard('paused')
    sync()
  }

  function resume() {
    if (status !== 'paused') return
    status = 'playing'
    acc = 0
    lastTs = 0
    hideCard()
    sync()
    kick()
  }

  function togglePause() {
    if (status === 'playing') pause()
    else if (status === 'paused') resume()
    else start()
  }

  function finish() {
    if (status !== 'playing' && status !== 'paused') return
    status = 'over'
    overAt = performance.now()
    controls.reset()
    sfx.over()
    haptic([10, 40, 16])
    const record = { score: game.score, lines: game.lines, level: game.level, frames: game.frame, seed: game.seed, log: encode(inputs) }
    const before = prefs.best
    const isBest = record.score > 0 && prefs.recordGame(record)
    prefs.saveCurrent(null)
    showCard('over', { record, before, isBest })
    sync()
    handlers.onOver(record, isBest)
  }

  // The game in progress, kept so a reload can carry on.
  function save() {
    if (status === 'playing' || status === 'paused') {
      prefs.saveCurrent({ seed: game.seed, log: encode(inputs), frame: game.frame })
    }
  }

  // Rebuilds a saved game by playing its inputs again, frame by frame.
  function restore(saved) {
    const list = saved && Number.isInteger(saved.seed) ? decode(saved.log) : null
    if (!list || !(saved.frame >= 0)) return false
    const g = new Game(saved.seed)
    for (const [f, action] of list) {
      if (f > saved.frame) return false
      g.advance(f - g.frame)
      if (g.over || g.frame !== f || !g.input(action)) return false
    }
    g.advance(saved.frame - g.frame)
    if (g.over || g.frame !== saved.frame) return false
    g.onEvent = onEvent
    game = g
    inputs = list
    status = 'paused'
    return true
  }

  /* ---- the frame loop ---- */
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function frame(now) {
    raf = 0
    if (status === 'playing' && handlers.isBlocked()) pause()
    if (status === 'playing') {
      const dt = lastTs ? Math.min(250, now - lastTs) : STEP_MS
      acc += dt
      let n = 0
      while (acc >= STEP_MS && n < 10 && status === 'playing' && !game.over) {
        game.step()
        acc -= STEP_MS
        n++
      }
      if (n === 10) acc = 0
    }
    lastTs = now
    if (status === 'idle') renderer.drawEmpty()
    else renderer.draw(game, now)
    syncStats()
    if (status === 'playing' || renderer.busy()) kick()
    else lastTs = 0
  }

  function measure() {
    const w = board.clientWidth
    const h = board.clientHeight
    if (!w || !h) return
    renderer.resize(clamp(Math.min(Math.floor(h / 20), Math.floor(w / 10)), 12, 44), 9)
    if (status === 'idle') renderer.drawEmpty()
    else renderer.draw(game)
  }

  /* ---- HUD ---- */
  let shown = { score: -1, level: -1, lines: -1 }
  function syncStats() {
    if (game.score !== shown.score) {
      if (shown.score >= 0 && game.score > shown.score + 2) flash(scoreCell)
      shown.score = game.score
      scoreV.textContent = game.score.toLocaleString()
    }
    if (game.level !== shown.level) levelV.textContent = shown.level = game.level
    if (game.lines !== shown.lines) linesV.textContent = shown.lines = game.lines
    holdCell.classList.toggle('on', !!game.hold && status !== 'idle')
  }
  function sync() {
    const playing = status === 'playing'
    pauseBtn.innerHTML = icon(playing ? 'pause' : 'play', 22)
    const label = playing ? 'Pause (P)' : status === 'paused' ? 'Resume' : 'Play'
    pauseBtn.setAttribute('aria-label', label)
    pauseBtn.title = label
    holdBtn.disabled = turnBtn.disabled = !playing
    if (status === 'idle') {
      shown = { score: -1, level: -1, lines: -1 }
      renderer.drawEmpty()
    }
    syncStats()
    kick()
  }
  function flash(node) {
    node.classList.add('flash')
    setTimeout(() => node.classList.remove('flash'), 160)
  }

  /* ---- callouts: a quiet word when rows clear ---- */
  let calloutTimer = null
  function say(words, points, extra) {
    const line = el('div', { class: 'line' }, el('span', {}, words))
    if (points) line.append(el('b', {}, '+' + points.toLocaleString()))
    callout.replaceChildren(line)
    if (extra) callout.append(el('div', { class: 'extra' }, extra))
    callout.classList.remove('show')
    void callout.offsetWidth
    callout.classList.add('show')
    clearTimeout(calloutTimer)
    calloutTimer = setTimeout(() => callout.classList.remove('show'), 1300)
  }
  function haptic(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern) } catch (_e) {} }
  }

  /* ---- cards ---- */
  function cta(label, ico, fn, ghost = false) {
    const b = el('button', { class: 'btn ov-cta' + (ghost ? ' ghost' : ''), type: 'button' })
    b.innerHTML = icon(ico, 18) + '<span>' + label + '</span>'
    b.addEventListener('click', fn)
    return b
  }

  function summary(g) {
    return `Level ${g.level} · ${plural(g.lines, 'line', 'lines')} · ${duration(g.frames != null ? g.frames : g.frame)}`
  }

  function showCard(kind, info = {}) {
    hideCard()
    const card = el('div', { class: 'ov-card', role: 'dialog', 'aria-live': 'polite' })
    let first = null
    if (kind === 'start') {
      const best = prefs.best
      card.append(
        el('img', { class: 'ov-mark', src: '/icon-192.png', alt: '', width: '56', height: '56' }),
        el('div', { class: 'ov-title' }, 'Strata'),
        el('div', { class: 'ov-sub' }, 'Fit the falling pieces into full rows. Each full row clears, and the layers above settle down.')
      )
      first = cta('Play', 'play', start)
      card.append(first)
      if (best) card.append(el('div', { class: 'ov-note' }, `Your best: ${best.score.toLocaleString()} points`))
      card.append(el('div', { class: 'ov-hint' }, finePointer.matches
        ? '← → move · ↑ turn · ↓ soft drop · Space drop · C hold · P pause'
        : 'Tap to turn, drag to move, flick down to drop, swipe up to hold.'))
    } else if (kind === 'paused' || kind === 'welcome') {
      card.append(
        el('div', { class: 'ov-kicker' }, kind === 'welcome' ? 'Welcome back' : 'Paused'),
        el('div', { class: 'ov-score' }, game.score.toLocaleString()),
        el('div', { class: 'ov-meta' }, summary(game))
      )
      first = cta('Resume', 'play', resume)
      card.append(first, cta('New game', 'rotateCcw', start, true))
      if (finePointer.matches) card.append(el('div', { class: 'ov-hint' }, 'Enter or P to resume'))
    } else if (kind === 'over') {
      const { record, before, isBest } = info
      card.append(
        el('div', { class: 'ov-kicker' }, 'The stack reached the top'),
        el('div', { class: 'ov-score' }, record.score.toLocaleString()),
        el('div', { class: 'ov-meta' }, summary(record))
      )
      if (isBest && before) card.append(el('div', { class: 'ov-badge' }, 'New personal best'))
      else if (isBest) card.append(el('div', { class: 'ov-badge' }, 'Your first best'))
      else if (before) card.append(el('div', { class: 'ov-note' }, `Your best is ${before.score.toLocaleString()}`))
      first = cta('Play again', 'play', start)
      card.append(first)
      if (handlers.isSignedIn()) card.append(cta('Leaderboard', 'trophy', () => handlers.openLeaderboard(), true))
      else if (!handlers.isOffline()) card.append(cta('Join the leaderboard', 'login', () => handlers.signIn(), true))
      if (finePointer.matches) card.append(el('div', { class: 'ov-hint' }, 'Enter to play again'))
    }
    const overlay = el('div', { class: 'overlay' + (kind === 'over' ? ' calm' : '') }, card)
    cards.appendChild(overlay)
    cards.classList.add('on')
    // The card's first button takes the focus, so Enter goes on from here;
    // at the end of a game, only after a moment.
    const focus = () => { if (first && first.isConnected) first.focus({ preventScroll: true }) }
    if (kind === 'over') {
      setTimeout(() => { overlay.classList.remove('calm'); focus() }, OVER_CALM_MS)
    } else {
      focus()
    }
  }
  function hideCard() {
    cards.replaceChildren()
    cards.classList.remove('on')
  }

  /* ---- first-play hint ---- */
  let hintTimer = null
  function showHint() {
    if (prefs.hintSeen) return
    prefs.set('hintSeen', true)
    hint.innerHTML = finePointer.matches
      ? '<span><b>← →</b> move</span><span><b>↑</b> turn</span><span><b>Space</b> drop</span>'
      : '<span><b>Tap</b> turn</span><span><b>Drag</b> move</span><span><b>Flick</b> drop</span>'
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
  const controls = attachControls(stage, {
    isEnabled: () => status === 'playing',
    isBlocked: handlers.isBlocked,
    piece: () => game.piece,
    cell: () => renderer.cell,
    act: (a) => {
      if (status === 'playing' && !hint.hidden && a !== 'U') dismissHint()
      return act(a)
    },
    onPause: () => {
      if (status !== 'playing' && status !== 'paused') return false
      togglePause()
      return true
    },
    onEnter: () => {
      if (status === 'over' && performance.now() - overAt < OVER_CALM_MS) return true
      if (status === 'paused') resume()
      else start()
      return true
    }
  })

  prefs.on(() => { renderer.setConfig({ paletteId: prefs.palette, ghost: prefs.ghost }); sync() })
  renderer.setConfig({ paletteId: prefs.palette, ghost: prefs.ghost })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderer.setConfig({}); sync() })
  new ResizeObserver(measure).observe(board)

  // A hidden tab pauses the game; leaving the page keeps it for next time.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); save() }
  })
  window.addEventListener('pagehide', save)

  if (restore(prefs.current)) {
    showCard('welcome')
  } else {
    prefs.saveCurrent(null)
    showCard('start')
  }
  sync()
  measure()

  return {
    pause,
    get status() { return status }
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
