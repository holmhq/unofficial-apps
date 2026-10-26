// Snake — the play screen. Owns the game, the frame loop, the record of
// turns, and the cards shown at the start, on pause and at the end. The
// game in progress is saved as it goes, so a reload or a closed tab carries
// on where it stopped. Talking to the server belongs to app.js.

import { Game, FPS, COLS, ROWS, MAX_FRAMES, encode, decode } from './rules.js'
import { createRenderer } from './render.js'
import { attachControls } from './controls.js'
import { sfx } from './audio.js'
import { prefs } from './state.js'
import { icon } from './icons.js'

const STEP_MS = 1000 / FPS
const OVER_CALM_MS = 900 // the end card ignores keys and taps this long, so a turn meant for the game can't restart it
const LEFT_OF = { U: 'L', L: 'D', D: 'R', R: 'U' }
const RIGHT_OF = { U: 'R', R: 'D', D: 'L', L: 'U' }

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
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
  /* ---- HUD pill in the navbar: score | length | level ---- */
  const hud = el('div', { class: 'hud' })
  const cellOf = (label) => {
    const v = el('div', { class: 'v' }, '0')
    const cell = el('div', { class: 'hud-cell' }, el('div', { class: 'k' }, label), v)
    hud.appendChild(cell)
    return v
  }
  const scoreV = cellOf('Score')
  const lengthV = cellOf('Length')
  const levelV = cellOf('Level')
  handlers.hudSlot.appendChild(hud)

  /* ---- play area: field, callouts, cards, action bar ---- */
  const canvas = el('canvas', { class: 'field' })
  const callout = el('div', { class: 'callout', 'aria-live': 'polite' })
  const fieldWrap = el('div', { class: 'field-wrap' }, canvas, callout)
  const board = el('div', { class: 'board-area' }, fieldWrap)
  const hint = el('div', { class: 'hint', hidden: '' })
  const cards = el('div', { class: 'cards' })
  const stage = el('div', { class: 'stage' }, board, hint, cards)

  const leftBtn = actionBtn('turnLeft', 'Turn left', () => turn(LEFT_OF))
  const pauseBtn = actionBtn('pause', 'Pause (P)', () => togglePause(), 'icon-btn action main')
  const rightBtn = actionBtn('turnRight', 'Turn right', () => turn(RIGHT_OF))
  const actions = el('div', { class: 'action-bar' }, leftBtn, pauseBtn, rightBtn)
  container.append(stage, actions)

  const renderer = createRenderer({ field: canvas })

  let game = new Game(newSeed())
  let inputs = []
  let status = 'idle' // idle | playing | paused | over
  let raf = 0
  let lastTs = 0
  let acc = 0
  let overAt = 0

  /* ---- the game ---- */
  function onEvent(type, d) {
    switch (type) {
      case 'turn': sfx.turn(); break
      case 'eat':
        sfx.eat(d.eaten)
        renderer.pop(d.cell, 'berry')
        haptic(6)
        break
      case 'bloom':
        sfx.bloom()
        renderer.pop(d.cell, 'bloom')
        haptic([8, 30, 8])
        say('Bloom', d.points)
        break
      case 'wilt': sfx.wilt(); break
      case 'level':
        setTimeout(() => { sfx.level(); say(`Level ${d.level}`) }, 250)
        break
      case 'over': setTimeout(finish, d.won ? 300 : 650); break
      default:
    }
  }

  // Applies a turn and, if it changed anything, keeps it in the record.
  function act(action) {
    if (status !== 'playing') return false
    if (!game.input(action)) return false
    inputs.push([game.frame, action])
    if (!hint.hidden) dismissHint()
    return true
  }

  // The buttons turn left or right of the way the snake will be going.
  function turn(table) {
    const last = game.turns.length ? game.turns[game.turns.length - 1] : game.dir
    act(table[last])
  }

  function start() {
    game = new Game(newSeed(), onEvent)
    inputs = []
    acc = 0
    status = 'playing'
    hideCard()
    showHint()
    save()
    sync()
    kick()
  }

  function pause() {
    if (status !== 'playing') return
    status = 'paused'
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
    if (game.won) sfx.won()
    else sfx.over()
    haptic([10, 40, 16])
    const record = { score: game.score, length: game.length, level: game.level, frames: game.frame, seed: game.seed, log: encode(inputs) }
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

  // Rebuilds a saved game by playing its turns again.
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

  let lastSave = 0
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
      if (now - lastSave > 2000) {
        lastSave = now
        save()
      }
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
    renderer.resize(clamp(Math.min(Math.floor(h / ROWS), Math.floor(w / COLS)), 10, 40))
    if (status === 'idle') renderer.drawEmpty()
    else renderer.draw(game)
  }

  /* ---- HUD ---- */
  let shown = { score: -1, length: -1, level: -1 }
  function syncStats() {
    if (game.score !== shown.score) {
      if (shown.score >= 0 && game.score > shown.score) flash(scoreV.parentNode)
      shown.score = game.score
      scoreV.textContent = game.score.toLocaleString()
    }
    if (game.length !== shown.length) lengthV.textContent = shown.length = game.length
    if (game.level !== shown.level) levelV.textContent = shown.level = game.level
  }
  function sync() {
    const playing = status === 'playing'
    pauseBtn.innerHTML = icon(playing ? 'pause' : 'play', 22)
    const label = playing ? 'Pause (P)' : status === 'paused' ? 'Resume' : 'Play'
    pauseBtn.setAttribute('aria-label', label)
    pauseBtn.title = label
    leftBtn.disabled = rightBtn.disabled = !playing
    syncStats()
    kick()
  }
  function flash(node) {
    node.classList.add('flash')
    setTimeout(() => node.classList.remove('flash'), 160)
  }

  /* ---- callouts ---- */
  let calloutTimer = null
  function say(words, points) {
    const line = el('div', { class: 'line' }, el('span', {}, words))
    if (points) line.append(el('b', {}, '+' + points.toLocaleString()))
    callout.replaceChildren(line)
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
    return `Length ${g.length} · level ${g.level} · ${duration(g.frames != null ? g.frames : g.frame)}`
  }

  function showCard(kind, info = {}) {
    hideCard()
    const card = el('div', { class: 'ov-card', role: 'dialog', 'aria-live': 'polite' })
    let first = null
    if (kind === 'start') {
      const best = prefs.best
      card.append(
        el('img', { class: 'ov-mark', src: '/icon-192.png', alt: '', width: '56', height: '56' }),
        el('div', { class: 'ov-title' }, 'Snake'),
        el('div', { class: 'ov-sub' }, 'Guide the snake to the berries; each one makes it longer. The edges wrap around, so only your own tail is in the way.')
      )
      first = cta('Play', 'play', start)
      card.append(first)
      if (best) card.append(el('div', { class: 'ov-note' }, `Your best: ${best.score.toLocaleString()} points`))
      card.append(el('div', { class: 'ov-hint' }, finePointer.matches
        ? 'Arrow keys or WASD turn · P or Space pause'
        : 'Swipe the way to go, or use the turn buttons below.'))
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
      const why = game.won ? 'The field is full' : record.frames >= MAX_FRAMES ? 'Two hours: time for a rest' : 'The snake ran into itself'
      card.append(
        el('div', { class: 'ov-kicker' }, why),
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
      ? '<span><b>Arrows</b> turn</span><span><b>P</b> pause</span>'
      : '<span><b>Swipe</b> to turn</span><span><b>Buttons</b> turn left or right</span>'
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
    act,
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

  prefs.on(() => { renderer.setConfig({ paletteId: prefs.palette }); sync() })
  renderer.setConfig({ paletteId: prefs.palette })
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
