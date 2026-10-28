// Sounds: the volume, the sound for each kind of notification, and the whole library.
import { h, ic, fill, sheet, toast, haptic, reveal } from '../ui.js'
import { state, kindOf, soundName, KIND_ICON, failure } from '../shell.js'
import { on } from '../inbox.js'
import * as api from '../api.js'
import * as audio from '../audio.js'

export function soundsTab() {
  const cat = state.catalog
  const kinds = h('div.group')
  const el = h('div.tab-page',
    h('h1.large-title', 'Sounds'),
    volumeCard(),
    h('h2.group-title', 'When Claude says…'),
    kinds,
    h('p.group-note', 'Claude can also name any sound from the library, or send one silently.'),
    h('h2.group-title', 'Library'),
    library())

  function paintKinds() {
    const prefs = state.me.prefs
    fill(kinds, cat.kinds.map((k) => {
      const current = prefs.sounds[k.id]
      return h('div.row',
        h('span.kind-ic', { 'data-tone': k.tone }, ic(KIND_ICON[k.icon] || 'info', 18, 2.2)),
        h('button.row-main', { type: 'button', onclick: () => pick(k) }, h('b', k.label), h('small', k.blurb)),
        h('button.row-value', { type: 'button', onclick: () => pick(k) }, soundName(current), ic('chevronRight', 15, 2.2)),
        playButton(current))
    }))
  }

  async function pick(kind) {
    const prefs = state.me.prefs
    let chosen = prefs.sounds[kind.id]
    const list = h('div.pick-list')
    const paint = () => fill(list, [{ id: 'none', name: 'Silent', blurb: 'Only the card and the notification', group: null }, ...cat.sounds].map((s) => soundRow(s, { on: s.id === chosen, pick: () => { chosen = s.id; paint(); if (s.id !== 'none') audio.play(s.id, { force: true }) } })))
    paint()
    await sheet({
      title: kind.label,
      done: 'Save',
      onDone: async (close) => {
        try {
          const { prefs: next } = await api.patch('/api/prefs', { sounds: { [kind.id]: chosen } })
          state.me.prefs = next
          paintKinds()
          toast(`${kind.label}: ${soundName(chosen)}`)
          close(true)
        } catch (e) { failure(e) }
      },
      body: () => [h('p.sheet-lead', `Tap a sound to hear it; it plays when Claude sends “${kind.label.toLowerCase()}”.`), list],
    })
  }

  const off = on((type) => { if (type === 'prefs') paintKinds() })
  paintKinds()
  return { el, leave: off }
}

function volumeCard() {
  const value = h('span.num.volume-value', Math.round(audio.getVolume() * 100) + '%')
  const input = h('input.slider', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(audio.getVolume() * 100)), 'aria-label': 'Volume' })
  let tick = 0
  input.addEventListener('input', () => {
    audio.setVolume(Number(input.value) / 100)
    value.textContent = input.value + '%'
    input.style.setProperty('--p', input.value + '%')
    clearTimeout(tick)
    tick = setTimeout(() => audio.play('pro_hover_tick/soft', { force: true }), 120)
  })
  input.style.setProperty('--p', input.value + '%')
  return h('section.card.volume', h('div.card-head', ic('volume2', 18, 2), h('b', 'Volume'), value), input,
    h('p.card-note', 'For this device. Sounds and the voice follow it; the switch in the account menu mutes it all.'))
}

function playButton(id) {
  if (!id || id === 'none') return h('span.round-btn.small.ghost', ic('volumeX', 15, 2))
  const b = h('button.round-btn.small', { type: 'button', 'aria-label': 'Play ' + soundName(id) }, ic('play', 14, 2.4))
  b.addEventListener('click', async () => {
    haptic(5)
    await audio.arm()
    b.classList.add('on')
    fill(b, h('span.bars', h('i'), h('i'), h('i'), h('i')))
    try { await audio.play(id, { force: true, tag: id }) } catch (e) { failure(e) }
    b.classList.remove('on')
    fill(b, ic('play', 14, 2.4))
  })
  return b
}

function soundRow(s, { on = false, pick = null } = {}) {
  const row = h('div.row.sound' + (on ? '.on' : ''), { 'data-key': s.id },
    h('button.row-main', { type: 'button', onclick: () => { if (pick) pick(); else playRow() } }, h('b', s.name), h('small', s.blurb + (s.dur ? ` · ${s.dur < 1 ? Math.round(s.dur * 1000) + ' ms' : s.dur.toFixed(1) + ' s'}` : ''))),
    on ? h('span.row-check', ic('check', 17, 2.6)) : null,
    s.id === 'none' ? null : playButton(s.id))
  const playRow = () => row.querySelector('.round-btn') && row.querySelector('.round-btn').click()
  return row
}

function library() {
  const cat = state.catalog
  return h('div.library', cat.groups.map((g) => {
    const sounds = cat.sounds.filter((s) => s.group === g.id)
    if (!sounds.length) return null
    return [h('div.lib-head', h('b', g.label), h('span', g.blurb)), h('div.group', sounds.map((s) => soundRow(s)))]
  }))
}

export { soundRow, playButton }
export const _reveal = reveal
