// Listening: the browser's own voices read the article aloud, a sentence at a time, starting
// from where you are. The sentence being read is tinted with the CSS Custom Highlight API, so
// the article itself isn't touched, and the panel follows along.

import { h, ic, reduced } from './ui.js'

const RATES = [1, 1.2, 1.4, 1.7, 2, 0.85]
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt, td, th, pre'

function bestVoice(lang) {
  const voices = speechSynthesis.getVoices()
  const want = (lang || document.documentElement.lang || 'en').toLowerCase().split('-')[0]
  const fit = voices.filter((v) => v.lang.toLowerCase().startsWith(want))
  const pool = fit.length ? fit : voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const score = (v) => (/premium|enhanced|natural|neural/i.test(v.name) ? 8 : 0) + (/siri|google|samantha|daniel|ava|zoe|serena/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0) + (v.default ? 1 : 0)
  return pool.sort((a, b) => score(b) - score(a))[0] || null
}

// Sentences, each with the text nodes and offsets it covers.
function sentences(body) {
  const out = []
  for (const block of body.querySelectorAll(BLOCKS)) {
    if (block.closest('pre') && block.tagName !== 'PRE') continue
    if (block.querySelector(BLOCKS)) continue
    const nodes = []
    let text = ''
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n, at: text.length }); text += n.nodeValue }
    if (!text.trim()) continue
    const re = /[^.!?…。！？]+(?:[.!?…。！？]+["'”’)\]]*|$)\s*/g
    let m
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue }
      const s = m[0]
      const lead = s.length - s.trimStart().length
      const trail = s.length - s.trimEnd().length
      if (!s.trim()) continue
      out.push({ block, nodes, start: m.index + lead, end: m.index + s.length - trail, text: s.trim() })
    }
  }
  return out
}

function rangeOf(sentence) {
  const range = document.createRange()
  let started = false
  for (const { n, at } of sentence.nodes) {
    const len = n.nodeValue.length
    if (!started && sentence.start < at + len) { range.setStart(n, Math.max(0, sentence.start - at)); started = true }
    if (started && sentence.end <= at + len) { range.setEnd(n, Math.max(0, sentence.end - at)); return range }
  }
  return started ? range : null
}

export function createSpeaker({ body, panel, lang, title, site, onEnd }) {
  const list = sentences(body)
  let at = 0
  let playing = false
  let rate = Number(localStorage.getItem('shelf:rate')) || 1
  let current = null
  const canTint = typeof Highlight !== 'undefined' && CSS.highlights

  const playBtn = h('button.icon-btn.play', { type: 'button', 'aria-label': 'Pause', title: 'Pause', onclick: () => toggle() })
  const rateBtn = h('button.rate', { type: 'button', 'aria-label': 'Speed', title: 'Speed', onclick: () => cycleRate() })
  const el = h('div.listen', { role: 'region', 'aria-label': 'Listening' },
    h('button.icon-btn', { type: 'button', 'aria-label': 'Back a sentence', title: 'Back', onclick: () => skip(-1) }, ic('skipBack', 18, 2)),
    playBtn,
    h('button.icon-btn', { type: 'button', 'aria-label': 'Next sentence', title: 'Next', onclick: () => skip(1) }, ic('skipForward', 18, 2)),
    h('span.eq', h('i'), h('i'), h('i')),
    rateBtn,
    h('button.icon-btn', { type: 'button', 'aria-label': 'Stop listening', title: 'Stop', onclick: () => onEnd() }, ic('x', 18, 2.2)))

  const drawState = () => {
    playBtn.replaceChildren(ic(playing ? 'pause' : 'play', 18, 2))
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
    el.classList.toggle('is-playing', playing)
    rateBtn.textContent = (rate % 1 ? rate.toFixed(rate * 10 % 1 ? 2 : 1).replace(/0$/, '') : rate) + '×'
  }

  // Start at the first sentence that's on screen.
  function firstVisible() {
    const top = panel.getBoundingClientRect().top + 70
    for (let i = 0; i < list.length; i++) {
      const r = rangeOf(list[i])
      if (r && r.getBoundingClientRect().bottom > top) return i
    }
    return 0
  }

  function tint(i) {
    if (!canTint) return
    const r = rangeOf(list[i])
    if (r) CSS.highlights.set('shelf-speak', new Highlight(r))
    // Follow along: keep the sentence in the upper part of the panel.
    if (!r) return
    const box = r.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    if (box.top < p.top + 70 || box.bottom > p.bottom - 120) panel.scrollBy({ top: box.top - p.top - p.height * 0.3, behavior: reduced() ? 'auto' : 'smooth' })
  }

  function speak(i) {
    if (i >= list.length) { stop(); onEnd(); return }
    at = i
    tint(i)
    const u = new SpeechSynthesisUtterance(list[i].text)
    const voice = bestVoice(lang)
    if (voice) { u.voice = voice; u.lang = voice.lang } else if (lang) u.lang = lang
    u.rate = rate
    u.onend = () => { if (current === u && playing) speak(at + 1) }
    u.onerror = (e) => { if (current === u && playing && e.error !== 'interrupted' && e.error !== 'canceled') speak(at + 1) }
    current = u
    speechSynthesis.speak(u)
  }

  function start() {
    if (!list.length) { onEnd(); return }
    playing = true
    drawState()
    speechSynthesis.cancel()
    const go = () => speak(firstVisible())
    if (!speechSynthesis.getVoices().length) {
      let done = false
      const once = () => { if (done) return; done = true; go() }
      speechSynthesis.addEventListener('voiceschanged', once, { once: true })
      setTimeout(once, 600)
    } else go()
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist: site, album: 'Shelf' })
        navigator.mediaSession.setActionHandler('play', () => { if (!playing) toggle() })
        navigator.mediaSession.setActionHandler('pause', () => { if (playing) toggle() })
        navigator.mediaSession.setActionHandler('nexttrack', () => skip(1))
        navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1))
      } catch {}
    }
  }

  function toggle() {
    playing = !playing
    drawState()
    if (playing) { speechSynthesis.cancel(); speak(at) } else { current = null; speechSynthesis.cancel() }
  }

  function skip(d) {
    const next = Math.max(0, Math.min(list.length - 1, at + d))
    at = next
    if (playing) { current = null; speechSynthesis.cancel(); speak(next) } else tint(next)
  }

  function cycleRate() {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] || 1
    try { localStorage.setItem('shelf:rate', String(rate)) } catch {}
    drawState()
    if (playing) { current = null; speechSynthesis.cancel(); speak(at) }
  }

  function stop() {
    playing = false
    current = null
    try { speechSynthesis.cancel() } catch {}
    if (canTint) CSS.highlights.delete('shelf-speak')
  }

  drawState()
  return { el, start, stop, toggle }
}
