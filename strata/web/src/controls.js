/* Strata — input.
   Touch and mouse, anywhere in the play area:
     tap               turn clockwise
     two-finger tap    turn anticlockwise
     drag sideways     move, one column per cell dragged
     drag down         soft drop, for as long as the finger stays down
     flick down        hard drop
     swipe up          hold
   Once a downward pull starts, the column stays put, so a drifting thumb
   can't nudge the piece sideways on its way down.
   Keyboard: ←/→ or A/D move (held keys repeat), ↓ or S soft drop,
   ↑, X or W turn clockwise, Z or Ctrl anticlockwise, Space hard drop,
   C or Shift hold, P or Esc pause, Enter plays or resumes. */

const TAP_PX = 11          // beyond this a touch is a drag, not a tap
const TAP_MS = 280
const SOFT_PX = 22         // downward pull before soft drop starts
const HARD_PX = 46         // downward travel a flick needs
const HARD_SPEED = 1.9     // px per ms at release for a flick
const UP_PX = 46           // upward swipe for hold
const DROP_COOLDOWN = 280  // ms after a hard drop before another flick counts
const REPEAT_DELAY = 170   // a held arrow key starts repeating after this
const REPEAT_EVERY = 50

export function attachControls(surface, handlers) {
  const isEnabled = handlers.isEnabled || (() => true)
  const isBlocked = handlers.isBlocked || (() => false)
  const act = handlers.act

  /* ---- pointer ---- */
  const pointers = new Map()
  let primary = null
  let multitouch = false
  let moved = false
  let soft = false
  let columnLocked = false
  let startX = 0, startY = 0, startCol = 0, startTime = 0
  let lastY = 0, lastT = 0, speed = 0
  let lastDrop = 0

  function stopSoft() {
    if (soft) act('U')
    soft = false
  }

  function down(e) {
    if (e.button > 0 || isBlocked() || e.target.closest('button, a, .ov-card')) return
    try { surface.setPointerCapture(e.pointerId) } catch (_e) {}
    pointers.set(e.pointerId, true)
    if (pointers.size === 2) {
      multitouch = true
      stopSoft()
      return
    }
    if (pointers.size !== 1) return
    primary = e.pointerId
    multitouch = false
    moved = false
    columnLocked = false
    startX = e.clientX
    startY = lastY = e.clientY
    startTime = lastT = performance.now()
    speed = 0
    const piece = handlers.piece()
    startCol = piece ? piece.col : 0
  }

  function move(e) {
    if (e.pointerId !== primary || multitouch || !isEnabled()) return
    const now = performance.now()
    speed = (e.clientY - lastY) / Math.max(1, now - lastT)
    lastY = e.clientY
    lastT = now
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (Math.abs(dx) > TAP_PX || Math.abs(dy) > TAP_PX) moved = true

    // Sideways: the piece follows the finger column by column.
    const piece = handlers.piece()
    if (piece && !columnLocked) {
      const target = startCol + Math.round(dx / handlers.cell())
      for (let guard = 0; piece.col < target && guard < COLS_MAX; guard++) if (!act('R')) break
      for (let guard = 0; piece.col > target && guard < COLS_MAX; guard++) if (!act('L')) break
    }

    // Down: soft drop while the pull lasts.
    if (dy > SOFT_PX) {
      if (!soft && now - lastDrop > DROP_COOLDOWN) {
        soft = act('D') || soft
        columnLocked = true
      }
    } else if (dy < SOFT_PX * 0.4) {
      stopSoft()
    }
  }

  function up(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    if (multitouch) {
      if (pointers.size === 0) {
        if (!moved && isEnabled() && e.type === 'pointerup') act('A')
        multitouch = false
        primary = null
      }
      return
    }
    if (e.pointerId !== primary) return
    primary = null
    stopSoft()
    if (!isEnabled() || e.type !== 'pointerup') return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const now = performance.now()
    if (dy <= -UP_PX && Math.abs(dx) < Math.abs(dy)) {
      act('X')
    } else if (dy >= HARD_PX && speed > HARD_SPEED && now - lastDrop > DROP_COOLDOWN) {
      act('H')
      lastDrop = now
    } else if (!moved && now - startTime < TAP_MS) {
      act('C')
    }
  }

  surface.addEventListener('pointerdown', down)
  surface.addEventListener('pointermove', move)
  surface.addEventListener('pointerup', up)
  surface.addEventListener('pointercancel', up)

  /* ---- keyboard ---- */
  const repeats = {}
  function hold(key, action) {
    if (repeats[key]) return
    act(action)
    const timer = setTimeout(() => {
      repeats[key] = { interval: setInterval(() => { if (isEnabled()) act(action) }, REPEAT_EVERY) }
    }, REPEAT_DELAY)
    repeats[key] = { timer }
  }
  function release(key) {
    const r = repeats[key]
    if (!r) return
    clearTimeout(r.timer)
    clearInterval(r.interval)
    delete repeats[key]
  }
  let keySoft = false

  const MOVES = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R' }
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.altKey || isBlocked()) return
    const tag = (e.target && e.target.tagName) || ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const k = e.key
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (handlers.onPause()) e.preventDefault()
      return
    }
    if (!isEnabled()) {
      // A focused button answers Enter and Space itself.
      if ((k === 'Enter' || k === ' ') && tag !== 'BUTTON' && tag !== 'A' && handlers.onEnter()) e.preventDefault()
      return
    }
    if (e.ctrlKey && k !== 'Control') return
    if (MOVES[k]) {
      e.preventDefault()
      if (!e.repeat) hold(k.toLowerCase(), MOVES[k])
      return
    }
    switch (k) {
      case 'ArrowDown': case 's': case 'S':
        e.preventDefault()
        if (!keySoft) { act('D'); keySoft = true }
        break
      case 'ArrowUp': case 'x': case 'X': case 'w': case 'W':
        e.preventDefault()
        if (!e.repeat) act('C')
        break
      case 'z': case 'Z': case 'Control':
        e.preventDefault()
        if (!e.repeat) act('A')
        break
      case ' ':
        e.preventDefault()
        if (!e.repeat) act('H')
        break
      case 'c': case 'C': case 'Shift':
        e.preventDefault()
        if (!e.repeat) act('X')
        break
      default:
    }
  }
  function onKeyUp(e) {
    const k = e.key
    if (MOVES[k]) release(k.toLowerCase())
    if ((k === 'ArrowDown' || k === 's' || k === 'S') && keySoft) {
      keySoft = false
      act('U')
    }
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', reset)

  // Lets go of everything: on pause, game over or a lost focus.
  function reset() {
    for (const key of Object.keys(repeats)) release(key)
    if (keySoft) act('U')
    keySoft = false
    stopSoft()
    pointers.clear()
    primary = null
    multitouch = false
  }

  return { reset }
}

const COLS_MAX = 12
