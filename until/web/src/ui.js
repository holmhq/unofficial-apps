// Small DOM helpers: elements, bottom sheets and the status line.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue
    if (key === 'class') el.className = value
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, value)
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

// A sheet rises from the bottom over a dimmed page. Escape, the backdrop or
// close() put it away and hand focus back to whatever opened it.
const open = []

export function openSheet(className, label, ...children) {
  const opener = document.activeElement
  const sheet = h('section', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, ...children)
  const overlay = h('div', { class: 'overlay' }, sheet)
  sheet.tabIndex = -1
  const entry = {
    sheet,
    onclose: null,
    close() {
      const i = open.indexOf(entry)
      if (i < 0) return
      open.splice(i, 1)
      overlay.remove()
      entry.onclose?.()
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }
  overlay.addEventListener('pointerdown', event => { if (event.target === overlay) entry.close() })
  document.body.append(overlay)
  open.push(entry)
  ;(sheet.querySelector('[autofocus]') || sheet).focus({ preventScroll: true })
  return entry
}

export const closeTopSheet = () => {
  if (!open.length) return false
  open.at(-1).close()
  return true
}

// One line at the top of the list for things that went wrong; it fades on
// its own unless it says something lasting.
let statusTimer = 0
export function say(message, { lasting = false } = {}) {
  const line = document.getElementById('status')
  clearTimeout(statusTimer)
  line.textContent = message || ''
  line.hidden = !message
  if (message && !lasting) statusTimer = setTimeout(() => { line.hidden = true }, 6000)
}
