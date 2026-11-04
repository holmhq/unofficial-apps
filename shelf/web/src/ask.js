// Ask, in the reader and on the search page. A selection can be looked up (Wikipedia and
// Wiktionary, no AI), explained or translated; an article can be asked about in a panel beside
// it, with takeaways, questions to think about and prompts you saved; and a question can go to
// your whole shelf, answered from what search finds there, with its sources. Answers that lean
// on a passage name it, and the passage can be shown in the article.

import { h, ic, fill, toast, menu, sheet, wide, copyText, reduced } from './ui.js'
import * as api from './api.js'
import { lib, summarize } from './store.js'
import { go, failure } from './shell.js'

const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Swedish', 'Polish', 'Turkish', 'Russian', 'Arabic', 'Hindi', 'Japanese', 'Chinese', 'Korean']
function deviceLanguage() {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(navigator.language.split('-')[0]) || 'English' } catch { return 'English' }
}
const kept = (key, fallback) => { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
const keep = (key, value) => { try { localStorage.setItem(key, value) } catch {} }

const shimmer = () => h('div.ask-wait', h('span.shimmer'), h('span.shimmer'), h('span.shimmer'))
const lines = (text) => String(text || '').split(/\n{2,}/).map((p) => h('p', p.trim())).filter((p) => p.textContent)

/* ---- A selection: look up, explain, translate --------------------------------------------------- */

let card = null
function closeCard() { if (card) { card.close(); card = null } }

// A small card by the selection on a desk, a sheet on a phone.
function place({ rect, title, build }) {
  closeCard()
  if (!wide()) {
    let closer
    sheet({ title, cancel: null, done: 'Done', body: (close) => { closer = close; const box = h('div.ask-sheet'); build(box, close); return box } })
    card = { close: () => closer && closer() }
    return
  }
  const body = h('div.ask-body')
  const box = h('div.ask-card', { role: 'dialog', 'aria-label': title },
    h('div.ask-card-h', h('b', title), h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Close', onclick: () => closeCard() }, ic('x', 17, 2.2))),
    body)
  document.body.append(box)
  const w = box.offsetWidth
  box.style.left = Math.max(12, Math.min(innerWidth - w - 12, rect.left + rect.width / 2 - w / 2)) + 'px'
  const below = rect.bottom + 12
  box.style.top = (below + 300 < innerHeight ? below : Math.max(70, rect.top - 12 - Math.min(420, innerHeight * 0.6))) + 'px'
  const away = (e) => {
    if (e.type === 'keydown') { if (e.key === 'Escape') closeCard(); return }
    if (!box.contains(e.target) && !e.target.closest('.menu, .layer')) closeCard()
  }
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', away, true) })
  card = { close: () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', away, true); box.remove() } }
  build(body, () => closeCard())
}

const quoteOf = (text) => h('blockquote.ask-q', text.length > 220 ? text.slice(0, 210).trim() + '…' : text)

export function selectionActions(anchor, { item, text, rect, onNote }) {
  const words = text.trim().split(/\s+/).length
  menu(anchor, [
    words <= 4 ? { label: 'Look up', icon: 'bookA', onclick: () => lookUp({ item, text, rect, onNote }) } : null,
    { label: 'Explain', icon: 'lightbulb', onclick: () => answer({ item, text, rect, task: words <= 3 ? 'define' : 'explain', onNote }) },
    { label: 'Translate', icon: 'languages', onclick: () => answer({ item, text, rect, task: 'translate', onNote }) }
  ], { align: 'start' })
}

function lookUp({ item, text, rect, onNote }) {
  place({
    rect,
    title: 'Look up',
    build: async (body) => {
      fill(body, quoteOf(text), shimmer())
      let r
      try { r = await api.get('/api/lookup?q=' + encodeURIComponent(text.trim()) + '&lang=' + encodeURIComponent((item.lang || 'en').slice(0, 2))) } catch (e) { fill(body, quoteOf(text), h('p.ask-bad', e.message)); return }
      const parts = []
      if (r.senses.length) {
        parts.push(h('div.ask-senses', r.senses.slice(0, 4).map((s) => h('p', s.part ? h('i', s.part.toLowerCase() + ' ') : null, s.text))))
      }
      if (r.wiki) {
        parts.push(h('div.ask-wiki',
          r.wiki.image ? h('img', { src: r.wiki.image, alt: '', onerror: (e) => e.target.remove() }) : null,
          r.wiki.title.toLowerCase() !== text.trim().toLowerCase() ? h('b', r.wiki.title) : null,
          h('p', r.wiki.extract),
          r.wiki.url ? h('a.ask-link', { href: r.wiki.url, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia', ic('arrowUpRight', 13, 2.2)) : null))
      }
      if (!parts.length) parts.push(h('p.ask-quiet', `Nothing found for “${text.trim()}”. Try Explain, which reads it in this article.`))
      const note = [r.senses[0] && r.senses[0].text, r.wiki && r.wiki.extract.split(/(?<=\.)\s/)[0]].filter(Boolean).join(' ')
      fill(body, h('div.ask-term', text.trim()), ...parts, footer(note, onNote, [h('button.btn.small.plain', { type: 'button', onclick: () => answer({ item, text, rect, task: 'define', onNote }) }, ic('lightbulb', 15, 2.1), 'Explain here')]))
    }
  })
}

function answer({ item, text, rect, task, onNote }) {
  let lang = kept('shelf:translate', deviceLanguage())
  if (task === 'translate' && (item.lang || 'en').slice(0, 2) === 'en' && lang === 'English') lang = 'Spanish'
  const titles = { explain: 'Explain', define: 'What it means here', translate: 'Translate' }
  place({
    rect,
    title: titles[task],
    build: async (body) => {
      const run = async () => {
        const langBtn = task === 'translate' ? h('button.chip.ask-lang', { type: 'button', onclick: (e) => menu(e.currentTarget, LANGS.map((l) => ({ label: (l === lang ? '✓ ' : '') + l, onclick: () => { lang = l; keep('shelf:translate', l); run() } })), { align: 'start' }) }, 'Into ' + lang, ic('chevronDown', 13, 2.4)) : null
        fill(body, quoteOf(text), langBtn, shimmer())
        let r
        try { r = await api.post('/api/items/' + item.id + '/ask', { task, selection: text, lang }) } catch (e) { fill(body, quoteOf(text), langBtn, h('p.ask-bad', e.message)); return }
        fill(body, quoteOf(text), langBtn, h('div.ask-text', lines(r.answer)), footer(r.answer, onNote))
      }
      run()
    }
  })
}

function footer(note, onNote, more = []) {
  return h('div.ask-foot',
    note && onNote ? h('button.btn.small', { type: 'button', onclick: () => { closeCard(); onNote(note) } }, ic('highlighter', 15, 2.1), 'Highlight, with this as a note') : null,
    ...more,
    note ? h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Copy', title: 'Copy', onclick: () => copyText(note, 'Copied') }, ic('copy', 16, 2)) : null)
}

/* ---- Asking about an article -------------------------------------------------------------------- */

const talks = new Map()
let prompts = null
async function savedPrompts() {
  if (prompts) return prompts
  try { prompts = (await api.get('/api/prompts')).prompts } catch { prompts = [] }
  return prompts
}

// The panel beside the article (over it on a phone). `jump(quote)` shows a passage.
export function askPanel({ host, item, jump, onClose = () => {} }) {
  const talk = talks.get(item.id) || []
  talks.set(item.id, talk)
  const list = h('div.ask-talk')
  const chips = h('div.ask-chips')
  const field = h('textarea.ask-field', { rows: 1, placeholder: 'Ask about this…', 'aria-label': 'Ask about this', maxlength: '600', enterkeyhint: 'send' })
  const send = h('button.icon-btn.ask-send', { type: 'button', 'aria-label': 'Ask', title: 'Ask', disabled: true, onclick: () => submit() }, ic('send', 18, 2.1))
  const sum = h('div.ask-sum')
  const scroller = h('div.ask-scroll', sum, chips, list)
  const panel = h('aside.ask-panel', { 'aria-label': 'Ask' },
    h('div.ask-head', ic('sparkles', 17, 2), h('b', 'Ask'), h('span.grow'), h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => close() }, ic('x', 19, 2.2))),
    scroller,
    h('div.ask-input', field, send),
    h('small.ask-note', 'From your server’s AI, which can be wrong.'))
  host.append(panel)
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-in')))
  if (wide()) setTimeout(() => field.focus({ preventScroll: true }), 300)

  function close() {
    panel.classList.remove('is-in')
    setTimeout(() => panel.remove(), reduced() ? 0 : 320)
    document.removeEventListener('keydown', onKey, true)
    onClose()
  }
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.layer, .menu')) { e.stopPropagation(); close() } }
  document.addEventListener('keydown', onKey, true)

  field.addEventListener('input', () => {
    send.disabled = !field.value.trim()
    field.style.height = 'auto'
    field.style.height = Math.min(120, field.scrollHeight) + 'px'
  })
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } })

  function drawSummary() {
    const it = lib.items.get(item.id) || item
    if (it.summary && it.summary.length) fill(sum, h('div.a-sum', h('div.a-sum-h', ic('sparkles', 13, 2), 'Summary'), h('ul', it.summary.map((p) => h('li', p)))))
    else if ((it.words || 0) >= 120) fill(sum, h('button.btn.small.ask-sum-btn', { type: 'button', onclick: async (e) => {
      const b = e.currentTarget
      fill(sum, shimmer())
      try { await summarize(item.id); drawSummary() } catch (err) { fill(sum, b); failure(err) }
    } }, ic('sparkles', 15, 2.1), 'Summarise'))
    else fill(sum)
  }

  async function drawChips() {
    const mine = await savedPrompts()
    fill(chips,
      h('button.chip', { type: 'button', onclick: () => run({ task: 'takeaways', label: 'Key takeaways' }) }, 'Key takeaways'),
      h('button.chip', { type: 'button', onclick: () => run({ task: 'questions', label: 'Questions to think about' }) }, 'Questions to think about'),
      mine.map((p) => h('button.chip.is-mine', { type: 'button', title: p.text, onclick: () => run({ task: 'ask', question: p.text, label: p.name }), oncontextmenu: (e) => { e.preventDefault(); forget(p) } }, p.name)))
  }

  async function forget(p) {
    prompts = (prompts || []).filter((x) => x !== p)
    try { await api.put('/api/prompts', { prompts }); toast('Prompt removed', { kind: 'info' }) } catch (e) { failure(e) }
    drawChips()
  }

  async function savePrompt(text) {
    const mine = await savedPrompts()
    const name = text.replace(/[?.!]+$/, '').split(/\s+/).slice(0, 4).join(' ')
    prompts = [...mine.filter((p) => p.text !== text), { name, text }].slice(-12)
    try { await api.put('/api/prompts', { prompts }); toast('Saved as a prompt. Right-click a prompt to remove it.', { kind: 'info' }) } catch (e) { failure(e) }
    drawChips()
  }

  function entryEl(e) {
    const q = h('div.ask-me', e.label || e.question)
    let a
    if (e.wait) a = shimmer()
    else if (e.error) a = h('p.ask-bad', e.error)
    else {
      a = h('div.ask-a',
        e.items && e.items.length ? h(e.task === 'questions' ? 'ol' : 'ul', e.items.map((x) => h('li', x))) : null,
        e.answer ? lines(e.answer) : null,
        e.quotes && e.quotes.length ? h('div.ask-quotes', e.quotes.map((qt) => h('button.ask-quote', { type: 'button', title: 'Show in the article', onclick: () => jump(qt) }, h('span', '“' + qt + '”'), ic('arrowRight', 14, 2.2)))) : null,
        h('div.ask-a-foot',
          h('button.icon-btn.is-quiet', { type: 'button', 'aria-label': 'Copy', title: 'Copy', onclick: () => copyText([...(e.items || []), e.answer || ''].filter(Boolean).join('\n'), 'Copied') }, ic('copy', 15, 2)),
          e.task === 'ask' && e.question && !(prompts || []).some((p) => p.text === e.question) ? h('button.btn.small.plain', { type: 'button', onclick: () => savePrompt(e.question) }, ic('pin', 14, 2.1), 'Save as a prompt') : null))
    }
    return h('div.ask-entry', q, a)
  }

  function draw() {
    fill(list, talk.map(entryEl))
    scroller.scrollTop = scroller.scrollHeight
  }

  async function run({ task, question = '', label = '' }) {
    const e = { task, question, label, wait: true }
    talk.push(e)
    draw()
    try {
      const r = await api.post('/api/items/' + item.id + '/ask', { task, question })
      Object.assign(e, { wait: false, answer: r.answer, items: r.items, quotes: r.quotes })
    } catch (err) {
      Object.assign(e, { wait: false, error: err.message })
    }
    if (panel.isConnected) draw()
  }

  function submit() {
    const q = field.value.trim()
    if (!q) return
    field.value = ''
    field.style.height = ''
    send.disabled = true
    run({ task: 'ask', question: q })
  }

  drawSummary()
  drawChips()
  draw()
  return { close, panel, refresh: drawSummary }
}

/* ---- Asking your whole shelf -------------------------------------------------------------------- */

export async function askShelf(question, box) {
  fill(box, h('div.ask-answer', h('div.ask-answer-h', ic('sparkles', 15, 2.1), h('b', 'From your shelf')), shimmer()))
  let r
  try { r = await api.post('/api/ask', { question }) } catch (e) {
    fill(box, h('div.ask-answer', h('div.ask-answer-h', ic('sparkles', 15, 2.1), h('b', 'From your shelf')), h('p.ask-bad', e.message)))
    return
  }
  // [2] in the answer points at the second source.
  const withCites = (text) => {
    const out = []
    let last = 0
    for (const m of text.matchAll(/\[(\d+)\]/g)) {
      out.push(text.slice(last, m.index))
      const s = r.sources[Number(m[1]) - 1]
      out.push(s ? h('button.ask-cite', { type: 'button', title: s.title, onclick: () => openSource(s) }, m[1]) : m[0])
      last = m.index + m[0].length
    }
    out.push(text.slice(last))
    return out
  }
  const used = r.sources.filter((s) => s.used)
  fill(box, h('div.ask-answer',
    h('div.ask-answer-h', ic('sparkles', 15, 2.1), h('b', 'From your shelf')),
    String(r.answer || '').split(/\n{2,}/).map((p) => h('p', withCites(p.trim()))),
    (used.length ? used : r.sources.slice(0, 4)).length ? h('div.ask-sources', (used.length ? used : r.sources.slice(0, 4)).map((s) => h('button.ask-source', { type: 'button', onclick: () => openSource(s) },
      h('span.ask-n', String(s.n)), h('div.grow', h('b', s.title), s.quote ? h('small', '“' + s.quote + '”') : null)))) : null,
    h('small.ask-note', 'From your server’s AI, which can be wrong.')))
}

function openSource(s) {
  go('/read/' + s.item + (s.mark ? '?at=' + s.mark : ''))
}

/* ---- Tags to suggest ---------------------------------------------------------------------------- */

export async function suggestTags(id) {
  const r = await api.post('/api/items/' + id + '/tags')
  return r.tags || []
}

export { closeCard }
