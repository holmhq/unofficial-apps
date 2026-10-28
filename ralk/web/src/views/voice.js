// Voice: which voice reads your lines, say something yourself, and what this month cost.
import { h, ic, fill, sheet, toast, haptic, nope } from '../ui.js'
import { state, failure } from '../shell.js'
import { on, waitForVoice, inbox, playVoice } from '../inbox.js'
import * as api from '../api.js'
import * as audio from '../audio.js'

const SAMPLE = 'Hi, this is how I sound on Ralk. Your build finished, and everything passed.'

// $0.0007, $0.012, $1.20: as many places as the amount needs.
const usd = (v) => '$' + (v < .01 ? v.toFixed(4).replace(/0+$/, '') : v < 1 ? v.toFixed(3).replace(/0+$/, '') : v.toFixed(2))

export function voiceTab() {
  const cat = state.catalog
  const voiceCard = h('section.card.voice-card')
  const usage = h('section.card.usage')
  const el = h('div.tab-page', h('h1.large-title', 'Voice'), voiceCard, sayCard(), usage)

  const voiceOf = (id) => { for (const l of cat.voices) for (const v of l.voices) if (v.id === id) return { ...v, language: l.language }; return { id, name: id, language: '' } }

  function paintVoice() {
    const v = voiceOf(state.me.prefs.voice)
    fill(voiceCard,
      h('div.voice-top',
        h('span.voice-orb', ic('audioLines', 22, 2)),
        h('div.grow', h('b', v.name), h('small', `${v.language} · Inworld TTS on fal.ai`)),
        h('button.btn.small.tinted', { type: 'button', onclick: pick }, 'Change')),
      state.me.voice_ready
        ? h('div.voice-actions', sampleButton(state.me.prefs.voice, 'Hear a sample'))
        : h('p.status-note', ic('circleAlert', 14, 2.2), 'Voice is not set up on this node yet: its owner sets the FAL_KEY secret for this app. Sounds and notifications work without it.'))
  }

  function paintUsage() {
    const u = state.me.usage || { chars: 0, lines: 0, usd: 0 }
    const cap = state.me.limits.charsPerMonth * (state.me.admin ? 10 : 1)
    const pct = Math.min(100, Math.round(u.chars / cap * 100))
    fill(usage,
      h('div.card-head', ic('activity', 18, 2), h('b', 'This month'), h('span.num', usd(u.usd))),
      h('div.meter', h('i', { style: { width: pct + '%' } })),
      h('p.card-note', `${u.chars.toLocaleString()} of ${cap.toLocaleString()} characters · ${u.lines} line${u.lines === 1 ? '' : 's'} · about $0.01 per 1,000 characters. A line said before plays again for free.`))
  }

  async function pick() {
    let chosen = state.me.prefs.voice
    const list = h('div.pick-list')
    const search = h('input.search-input', { type: 'search', placeholder: 'Search voices', 'aria-label': 'Search voices' })
    const paint = () => {
      const q = search.value.trim().toLowerCase()
      fill(list, cat.voices.map((l) => {
        const voices = l.voices.filter((v) => !q || v.name.toLowerCase().includes(q) || l.language.toLowerCase().includes(q))
        if (!voices.length) return null
        return [h('div.lib-head', h('b', l.language)), h('div.group', voices.map((v) => h('div.row.sound' + (v.id === chosen ? '.on' : ''),
          h('button.row-main', { type: 'button', onclick: () => { chosen = v.id; paint() } }, h('b', v.name), h('small', l.language)),
          v.id === chosen ? h('span.row-check', ic('check', 17, 2.6)) : null,
          state.me.voice_ready ? sampleButton(v.id) : null)))]
      }))
    }
    search.addEventListener('input', paint)
    paint()
    await sheet({
      title: 'Voice',
      done: 'Save',
      wide: true,
      onDone: async (close) => {
        try {
          const { prefs } = await api.patch('/api/prefs', { voice: chosen })
          state.me.prefs = prefs
          paintVoice()
          toast(`Voice: ${voiceOf(chosen).name}`)
          close(true)
        } catch (e) { failure(e) }
      },
      body: () => [h('div.search', ic('search', 16, 2.2), search), h('p.sheet-lead', 'Samples are made once and kept, so trying voices costs almost nothing.'), list],
    })
  }

  function sayCard() {
    const input = h('textarea.input', { rows: '3', placeholder: 'Type a line and hear it on every device you have open.', 'aria-label': 'Say something', maxlength: String(state.me.limits.say) })
    const count = h('span.num.count', `0 / ${state.me.limits.say}`)
    const btn = h('button.btn.primary', { type: 'button' }, ic('audioLines', 17, 2.2), 'Say it')
    input.addEventListener('input', () => { count.textContent = `${input.value.length} / ${state.me.limits.say}` })
    btn.addEventListener('click', async () => {
      const text = input.value.trim()
      if (!text) { nope(input); input.focus(); return }
      haptic()
      await audio.arm()
      btn.classList.add('busy')
      try {
        await api.post('/api/notes', { kind: 'say', say: text })
        input.value = ''
        count.textContent = `0 / ${state.me.limits.say}`
        toast('Sent. The voice follows in a few seconds.', { kind: 'info' })
      } catch (e) { failure(e) } finally { btn.classList.remove('busy') }
    })
    if (!state.me.voice_ready) btn.disabled = true
    return h('section.card.say', h('div.card-head', ic('speech', 18, 2), h('b', 'Say something'), count), input, h('div.card-actions', btn))
  }

  const off = on((type) => { if (type === 'prefs') paintVoice(); if (type === 'note') api.get('/api/me').then((me) => { state.me = me; paintUsage() }).catch(() => {}) })
  paintVoice()
  paintUsage()
  return { el, leave: off }
}

// Plays a short sample of a voice; made once per voice on the node, then free.
function sampleButton(voice, label = null) {
  const idle = () => label ? [ic('play', 15, 2.4), label] : ic('play', 14, 2.4)
  const b = h(label ? 'button.btn.small' : 'button.round-btn.small', { type: 'button', 'aria-label': 'Hear ' + voice }, idle())
  b.addEventListener('click', async () => {
    haptic(5)
    if (!(await audio.arm())) return
    b.classList.add('busy')
    fill(b, h('span.spin.small'), label ? 'Making…' : null)
    try {
      const { note } = await api.post('/api/notes', { kind: 'say', say: SAMPLE, sound: 'none', sample: true, voice })
      let final = note
      if (!note.audio && note.speech !== 'failed') {
        inbox.notes.unshift(note)
        await waitForVoice(note.id)
        final = inbox.notes.find((n) => n.id === note.id) || note
        inbox.notes = inbox.notes.filter((n) => n.id !== note.id)
      }
      if (final.speech === 'failed' || !final.audio) throw new Error(final.error || 'The sample could not be made.')
      fill(b, h('span.bars', h('i'), h('i'), h('i'), h('i')), label ? 'Playing' : null)
      await playVoice(final)
    } catch (e) { failure(e) } finally { b.classList.remove('busy'); fill(b, idle()) }
  })
  return b
}
