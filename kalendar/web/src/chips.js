// An address field like the To: line in Mail. A comma, a space, Return or
// Tab (or leaving the field) turns what's typed into a bubble, and a pasted
// list becomes one bubble each. An address that doesn't look right stays as
// a red bubble; tap it to fix it. Backspace in the empty field selects the
// last bubble and a second press removes it; a tap selects any bubble, and
// its × or Backspace removes it.
import { h, ic, nope, reduced } from './ui.js'
import { sound } from './sound.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SPLIT = /[\s,;]+/

export function chipField({ values = [], max = 5, placeholder = '', label = 'Email addresses', mine = () => '', onchange = () => {} } = {}) {
  const chips = []
  let picked = null
  const input = h('input.chips-input', {
    type: 'text', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false,
    enterkeyhint: 'next', 'aria-label': label, placeholder
  })
  const box = h('div.chips-field', input)
  box.addEventListener('click', (e) => { if (e.target === box) input.focus() })

  const changed = () => {
    box.classList.toggle('full', chips.length >= max)
    input.placeholder = chips.length ? '' : placeholder
    onchange(box.values())
  }

  function pick(chip) {
    if (picked) picked.el.classList.remove('picked')
    picked = chip
    if (chip) chip.el.classList.add('picked')
  }

  function remove(chip, { quiet = false } = {}) {
    const i = chips.indexOf(chip)
    if (i < 0) return
    chips.splice(i, 1)
    if (picked === chip) picked = null
    const el = chip.el
    if (reduced()) el.remove()
    else {
      el.classList.add('leaving')
      el.addEventListener('animationend', () => el.remove(), { once: true })
    }
    if (!quiet) sound.remove()
    changed()
  }

  function add(text, { quiet = false } = {}) {
    const address = text.trim().replace(/^<|>$/g, '').toLowerCase()
    if (!address) return
    const twin = chips.find((c) => c.address === address)
    if (twin) { nope(twin.el); return }
    if (address === String(mine() || '').toLowerCase()) { nope(box); return }
    if (chips.length >= max) { nope(box); return }
    const ok = EMAIL.test(address)
    const chip = { address, ok, el: null }
    const x = h('button.chip-x', { type: 'button', tabindex: '-1', 'aria-label': `Remove ${address}`, onclick: (e) => { e.stopPropagation(); remove(chip); input.focus() } }, ic('x', 12, 2.6))
    chip.el = h('span.mail-chip' + (ok ? '' : '.bad'), { title: ok ? address : 'That address doesn’t look right. Tap to fix it.' }, h('span.mail-chip-text', address), x)
    chip.el.addEventListener('mousedown', (e) => e.preventDefault())
    chip.el.addEventListener('click', () => {
      if (!chip.ok) {
        // Back into the field to fix.
        remove(chip, { quiet: true })
        input.value = chip.address
        input.focus()
        return
      }
      pick(picked === chip ? null : chip)
      input.focus()
    })
    chips.push(chip)
    box.insertBefore(chip.el, input)
    if (!quiet) (ok ? sound.tick : sound.error)()
    changed()
  }

  // Turns what's typed into bubbles; true if anything was there.
  function take() {
    const parts = input.value.split(SPLIT).filter(Boolean)
    input.value = ''
    for (const part of parts) add(part)
    return parts.length > 0
  }

  input.addEventListener('input', () => {
    pick(null)
    if (!SPLIT.test(input.value)) return
    // Keep whatever follows the last separator in the field.
    const parts = input.value.split(SPLIT)
    const rest = parts.pop()
    for (const part of parts) add(part)
    input.value = rest
  })
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === 'Tab') && input.value.trim()) {
      take()
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !input.value) {
      if (picked) { e.preventDefault(); remove(picked) }
      else if (e.key === 'Backspace' && chips.length) { e.preventDefault(); pick(chips[chips.length - 1]) }
      return
    }
    if (e.key === 'ArrowLeft' && !input.value && chips.length) {
      e.preventDefault()
      const i = picked ? chips.indexOf(picked) : chips.length
      pick(chips[Math.max(0, i - 1)])
      return
    }
    if (e.key === 'ArrowRight' && picked) {
      e.preventDefault()
      const i = chips.indexOf(picked)
      pick(chips[i + 1] || null)
      return
    }
    if (e.key === 'Escape' && picked) { e.preventDefault(); pick(null) }
  })
  input.addEventListener('focus', () => box.classList.add('focus'))
  input.addEventListener('blur', () => {
    box.classList.remove('focus')
    pick(null)
    take()
  })

  box.values = () => chips.filter((c) => c.ok).map((c) => c.address)
  box.bad = () => chips.find((c) => !c.ok) || null
  box.take = take
  box.input = input
  for (const v of values) add(v, { quiet: true })
  changed()
  return box
}
