/* Snake — input.
   Touch and mouse, anywhere in the play area: swipe the way to go. One drag
   can turn more than once: after each turn, keep moving the finger the new
   way. The buttons below the field turn left and right.
   Keyboard: arrows or WASD turn, P, Esc or Space pause, Enter plays or
   resumes. */

const SWIPE_PX = 22

export function attachControls(surface, handlers) {
  const isEnabled = handlers.isEnabled || (() => true)
  const isBlocked = handlers.isBlocked || (() => false)

  /* ---- pointer ---- */
  let tracking = false
  let ox = 0
  let oy = 0

  function down(e) {
    if (e.button > 0 || isBlocked() || e.target.closest('button, a, .ov-card')) return
    tracking = true
    ox = e.clientX
    oy = e.clientY
    try { surface.setPointerCapture(e.pointerId) } catch (_e) {}
  }
  function move(e) {
    if (!tracking || !isEnabled()) return
    const dx = e.clientX - ox
    const dy = e.clientY - oy
    if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')
    handlers.act(dir)
    // A fresh origin, so the same drag can turn again.
    ox = e.clientX
    oy = e.clientY
  }
  function up() {
    tracking = false
  }
  surface.addEventListener('pointerdown', down)
  surface.addEventListener('pointermove', move)
  surface.addEventListener('pointerup', up)
  surface.addEventListener('pointercancel', up)

  /* ---- keyboard ---- */
  const KEYS = {
    ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
    w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R'
  }
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isBlocked()) return
    const tag = (e.target && e.target.tagName) || ''
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const k = e.key
    if (k === 'p' || k === 'P' || k === 'Escape' || (k === ' ' && isEnabled())) {
      if (handlers.onPause()) e.preventDefault()
      return
    }
    if (!isEnabled()) {
      // A focused button answers Enter and Space itself.
      if ((k === 'Enter' || k === ' ') && tag !== 'BUTTON' && tag !== 'A' && handlers.onEnter()) e.preventDefault()
      return
    }
    if (KEYS[k]) {
      e.preventDefault()
      if (!e.repeat) handlers.act(KEYS[k])
    }
  }
  window.addEventListener('keydown', onKey)
}
