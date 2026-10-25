/* Sokoban — input.
   Keyboard: arrows or WASD walk, Z, U or Backspace undo, R restarts, and
   Enter, Space or N take the next level once one is solved.
   Touch and mouse, anywhere in the play area: drag to walk, one step every
   STEP_PX along the main axis, cell by cell for as long as the drag goes on;
   or tap a square to walk there, or a box beside the player to push it. */

const STEP_PX = 30
const TAP_PX = 10

export function attachControls(surface, handlers) {
  const isEnabled = handlers.isEnabled || (() => true)
  const isBlocked = handlers.isBlocked || (() => false)

  /* ---- keyboard ---- */
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || isBlocked()) return
    const tag = (e.target && e.target.tagName) || ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const dir = KEYS[e.key]
    if (dir) {
      e.preventDefault()
      handlers.onMove(dir, e.repeat)
    } else if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U' || e.key === 'Backspace') {
      e.preventDefault()
      handlers.onUndo()
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      handlers.onReset()
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'n' || e.key === 'N') {
      // A focused button answers Enter and Space itself.
      if ((e.key === 'Enter' || e.key === ' ') && (tag === 'BUTTON' || tag === 'A')) return
      if (handlers.onNext()) e.preventDefault()
    }
  }
  window.addEventListener('keydown', onKey)

  /* ---- pointer (touch and mouse) ---- */
  let tracking = false
  let walked = false
  let sx = 0
  let sy = 0
  let ox = 0
  let oy = 0

  function down(e) {
    if (!isEnabled() || e.button > 0 || e.target.closest('button, a')) return
    tracking = true
    walked = false
    sx = ox = e.clientX
    sy = oy = e.clientY
    try { surface.setPointerCapture(e.pointerId) } catch (_e) {}
  }
  function move(e) {
    if (!tracking || !isEnabled()) return
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_PX) walked = true
    const dx = e.clientX - ox
    const dy = e.clientY - oy
    if (Math.abs(dx) < STEP_PX && Math.abs(dy) < STEP_PX) return
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    handlers.onMove(dir, false)
    // A fresh origin, so a long drag keeps walking one cell per STEP_PX.
    ox = e.clientX
    oy = e.clientY
  }
  function up(e) {
    if (!tracking) return
    tracking = false
    if (!walked && e.type === 'pointerup' && isEnabled()) handlers.onTap(e.clientX, e.clientY)
  }

  surface.addEventListener('pointerdown', down)
  surface.addEventListener('pointermove', move)
  surface.addEventListener('pointerup', up)
  surface.addEventListener('pointercancel', up)
}
