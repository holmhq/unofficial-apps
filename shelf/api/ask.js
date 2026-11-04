// Asking while you read. Look up needs no AI: it reads Wikipedia's summary of a term and
// Wiktionary's definitions. Everything else uses the node's AI (env.holm.ai.chat): explain or
// translate a passage, takeaways and questions for an article, a question about it answered
// from its words, a question across everything on your shelf answered from what search finds,
// and tags to suggest. Answers name the passages they lean on, so the reader can show them.
//
//   GET    /api/lookup?q=&lang=           Wikipedia and Wiktionary on a word or two
//   POST   /api/items/:id/ask             { task, selection?, question?, lang? }
//   POST   /api/ask                       { question }: your whole shelf
//   GET    /api/prompts                   your saved prompts
//   PUT    /api/prompts                   { prompts: [...] }

import { json, err, readJSON, ITEMS, TEXT, MARKS, getItem, clip, host } from './lib.js'

const ASK_CAP = 150 // AI answers per person per day, summaries included
const NODE_CAP = 3000
const UA = 'Shelf (a read-later app on a Holm server; https://holmhq.com)'

const TASKS = {
  explain: 'Explain the selected passage simply, in two to four short sentences, for someone reading this article. Say what it means in context; don\'t repeat it.',
  define: 'Say what the selected word or phrase means here, in this article, in one or two sentences.',
  translate: 'Translate the selected passage into {lang}. Reply with the translation only.',
  takeaways: 'List the four to six most important takeaways of the article as short, plain sentences.',
  questions: 'Write four thought-provoking questions the article raises for a careful reader. Each is one sentence.',
  ask: 'Answer the question from the article. Be brief and plain. If the article doesn\'t say, say so.'
}

const today = () => new Date().toISOString().slice(0, 10)

function budget(env, k) {
  const { kv } = env.holm.app
  const mine = 'ai:' + k + ':' + today()
  const all = 'ai:all:' + today()
  if ((Number(kv.get(mine)) || 0) >= ASK_CAP || (Number(kv.get(all)) || 0) >= NODE_CAP) return false
  kv.increment(mine)
  kv.increment(all)
  return true
}

function chat(env, system, user, max = 700) {
  const answer = env.holm.ai.chat({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.3, max_tokens: max })
  const raw = String(answer && answer.content || '')
  try { return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { return { answer: raw.trim() } }
}

const failed = (error) => {
  const code = String(error && (error.code || error.message) || error)
  console.warn('shelf: ask failed: ' + code.slice(0, 200))
  return /not_configured/.test(code) ? err(503, 'ai_unavailable', 'This server has no AI set up, so Ask isn’t available. Look up still works.') : err(503, 'ai_unavailable', 'The AI didn’t answer. Try again in a moment.')
}

// An article's words, cut to fit: the start, the part around the selection, and the end.
function excerpt(text, around = '', max = 14000) {
  if (text.length <= max) return text
  if (around) {
    const at = text.indexOf(around.slice(0, 80))
    if (at >= 0) {
      const start = Math.max(0, at - max / 2)
      return (start ? '…' : '') + text.slice(start, start + max) + '…'
    }
  }
  return text.slice(0, max * 0.7) + '\n…\n' + text.slice(-max * 0.3)
}

export async function ask(request, env, url, { k }) {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const { ds, kv } = env.holm.app

  if (path === '/api/lookup' && method === 'GET') return lookup(env, url)

  if (path === '/api/prompts') {
    if (method === 'GET') return json({ prompts: kv.get('prompts:' + k) || [] })
    if (method === 'PUT') {
      const input = await readJSON(request, 20_000)
      const prompts = (Array.isArray(input.prompts) ? input.prompts : []).map((p) => ({ name: clip(p && p.name, 40), text: clip(p && p.text, 600) })).filter((p) => p.name && p.text).slice(0, 12)
      kv.set('prompts:' + k, prompts)
      return json({ prompts })
    }
  }

  // A question across the shelf: search finds the articles and highlights, the AI reads them.
  if (path === '/api/ask' && method === 'POST') {
    const input = await readJSON(request, 8000)
    const question = clip(input.question, 400)
    if (question.length < 3) return err(400, 'empty', 'Ask a question.')
    // Search matches whole words, all of them; so each word (and a rough stem of it) is looked
    // for alone, and what matches the most words comes first.
    const words = [...new Set(question.toLowerCase().replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))].slice(0, 6)
    const stems = new Set(words)
    for (const w of words) { const s = w.replace(/(ings?|edly|ed|es|s|ly)$/, ''); if (s.length >= 4) { stems.add(s); stems.add(s + 'e') } }
    const found = new Map()
    const hit = (key, make) => { const f = found.get(key) || { score: 0, make }; f.score++; found.set(key, f) }
    try {
      for (const term of [...stems].slice(0, 12)) {
        for (const r of ds.search(MARKS(k), term, { limit: 8 }).results || []) { const mk = r.doc || r; hit('m' + mk.id, () => mk) }
        for (const r of ds.search(TEXT(k), term, { limit: 6 }).results || []) { const t = r.doc || r; hit('i' + t.item, () => t) }
      }
    } catch (e) { console.warn('shelf: ask search: ' + String(e && e.message).slice(0, 160)) }
    const sources = []
    // A highlight is the reader's own choice of words, so it counts a little more.
    const rank = ([key, f]) => f.score + (key[0] === 'm' ? 0.5 : 0)
    for (const [key, f] of [...found.entries()].sort((a, b) => rank(b) - rank(a)).slice(0, 10)) {
      const row = f.make()
      const doc = getItem(env, k, row.item)
      if (!doc) continue
      if (key[0] === 'm') sources.push({ item: doc.id, mark: row.id, title: doc.title || doc.host || 'Untitled', text: String(row.quote).slice(0, 600) + (row.note ? '\nNote: ' + String(row.note).slice(0, 300) : '') })
      else sources.push({ item: doc.id, title: doc.title || doc.host || 'Untitled', text: passage(String(row.text || ''), [...stems], 1400) || String(doc.excerpt || '') })
    }
    if (!sources.length) return json({ answer: 'Nothing on your shelf seems to talk about that. Try other words, or search for them.', sources: [] })
    if (!budget(env, k)) return err(429, 'slow_down', 'Ask is resting for today. It’ll be back tomorrow.')
    let out
    try {
      out = chat(env,
        'You answer questions from the person\'s own saved reading and highlights. Use only the numbered sources. Cite them with their numbers in square brackets, like [2]. Be brief and plain. If the sources don\'t answer it, say so. Reply with JSON only. TASK: shelf',
        `Question: ${question}\n\nSources:\n` + sources.map((s, n) => `[${n + 1}] ${s.title}\n${s.text}`).join('\n\n') + '\n\nReply with JSON only: {"answer":"…","used":[1,2]}', 900)
    } catch (e) { return failed(e) }
    const used = Array.isArray(out.used) ? out.used.map(Number).filter((n) => n >= 1 && n <= sources.length) : []
    return json({ answer: clip(String(out.answer || ''), 4000) || 'No answer came back.', sources: sources.map((s, n) => ({ n: n + 1, item: s.item, mark: s.mark || null, title: s.title, quote: s.mark ? s.text.split('\nNote:')[0].slice(0, 280) : '', used: used.includes(n + 1) })) })
  }

  const m = /^\/api\/items\/([A-Za-z0-9_-]+)\/(ask|tags)$/.exec(path)
  if (!m || method !== 'POST') return err(404, 'not_found', 'There’s nothing at that address.')
  const doc = getItem(env, k, m[1])
  if (!doc) return err(404, 'not_found', 'That isn’t on your shelf any more.')
  const input = await readJSON(request, 20_000)
  const words = ds.find(TEXT(k), { item: doc.id }, { limit: 1 })[0]
  const text = words && words.text ? String(words.text) : ''

  // Tags to suggest: a few, preferring ones already in use.
  if (m[2] === 'tags') {
    const known = new Set()
    for (const i of ds.find(ITEMS(k), {}, { limit: 1000, order: 'desc' })) for (const t of i.tags || []) known.add(t)
    if (!budget(env, k)) return err(429, 'slow_down', 'Suggestions are resting for today.')
    let out
    try {
      out = chat(env, 'You suggest short lowercase tags for a saved article. Reply with JSON only. TASK: tags',
        `Title: ${doc.title || ''}\nSite: ${doc.site || doc.host || ''}\nStart: ${(text || doc.excerpt || '').slice(0, 2500)}\n\nTags already used on this shelf (prefer these when they fit): ${[...known].slice(0, 80).join(', ') || 'none'}\n\nSuggest three to five tags, one or two words each, hyphenated. Reply with JSON only: {"tags":["",""]}`, 200)
    } catch (e) { return failed(e) }
    const tags = (Array.isArray(out.tags) ? out.tags : []).map((t) => String(t).toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 32)).filter(Boolean).slice(0, 5)
    return json({ tags })
  }

  const task = TASKS[input.task] ? input.task : 'ask'
  const selection = clip(input.selection, 3000)
  const question = clip(input.question, 600)
  if ((task === 'explain' || task === 'define' || task === 'translate') && !selection) return err(400, 'empty', 'Select some words first.')
  if (task === 'ask' && !question) return err(400, 'empty', 'Ask a question.')
  if (!text && task !== 'translate' && task !== 'define') return err(422, 'no_text', 'This one has no words Shelf can read yet.')
  if (!budget(env, k)) return err(429, 'slow_down', 'Ask is resting for today. It’ll be back tomorrow.')
  const lang = clip(input.lang, 40) || 'English'
  const instruction = TASKS[task].replace('{lang}', lang)
  const listy = task === 'takeaways' || task === 'questions'
  let out
  try {
    out = chat(env,
      'You help someone read an article they saved. Be plain and brief, no marketing words, no emoji. Reply with JSON only. TASK: ' + task,
      [
        `Title: ${doc.title || ''}`,
        doc.author ? `Author: ${doc.author}` : '',
        `Article:\n${excerpt(text, selection)}`,
        selection ? `\nSelected: "${selection}"` : '',
        question ? `\nQuestion: ${question}` : '',
        '',
        instruction,
        task === 'ask' ? 'Quote up to three short passages from the article, word for word, that the answer rests on.' : '',
        listy ? 'Reply with JSON only: {"items":["",""]}' : task === 'ask' ? 'Reply with JSON only: {"answer":"…","quotes":["…"]}' : 'Reply with JSON only: {"answer":"…"}'
      ].filter((l) => l !== '').join('\n'), task === 'translate' ? 1500 : 800)
  } catch (e) { return failed(e) }
  const items = listy ? (Array.isArray(out.items) ? out.items : []).map((x) => clip(String(x), 400)).filter(Boolean).slice(0, 8) : null
  // Only passages really in the article come back, so the reader can find each one.
  const flat = text.replace(/\s+/g, ' ')
  const quotes = task === 'ask' && Array.isArray(out.quotes) ? out.quotes.map((q) => String(q).replace(/\s+/g, ' ').trim()).filter((q) => q.length > 12 && flat.includes(q)).slice(0, 3) : []
  return json({ task, answer: items ? '' : clip(String(out.answer || ''), 6000), items, quotes })
}

/* ---- Look up, from Wikipedia and Wiktionary --------------------------------------------------- */

function lookup(env, url) {
  const q = clip(url.searchParams.get('q'), 80).replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
  if (!q) return err(400, 'empty', 'Select a word or two to look up.')
  const lang = /^[a-z]{2,3}$/.test(url.searchParams.get('lang') || '') ? url.searchParams.get('lang') : 'en'
  const { kv } = env.holm.app
  const key = 'lk2:' + lang + ':' + q.toLowerCase().slice(0, 80)
  const kept = kv.get(key)
  if (kept) return json(kept)
  const get = (u) => {
    try {
      const r = env.holm.net.fetch(u, { timeout: 2200, headers: { 'user-agent': UA, accept: 'application/json' } })
      return r.ok ? JSON.parse(r.text()) : null
    } catch { return null }
  }
  const out = { term: q, wiki: null, senses: [] }
  const page = encodeURIComponent(q.replace(/\s+/g, '_'))
  const w = get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${page}?redirect=true`)
  if (w && w.extract && w.type !== 'disambiguation') {
    out.wiki = { title: w.title, extract: String(w.extract).slice(0, 900), url: w.content_urls && w.content_urls.desktop && w.content_urls.desktop.page, image: w.thumbnail && /^https:\/\//.test(w.thumbnail.source) ? w.thumbnail.source : null }
  }
  if (q.split(/\s+/).length <= 2) {
    const d = get(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q.toLowerCase())}`)
    const list = d && (d[lang] || d.en)
    if (Array.isArray(list)) {
      for (const part of list.slice(0, 3)) {
        for (const def of (part.definitions || []).slice(0, 2)) {
          const t = String(def.definition || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
          // "Alternative letter-case form of …" says nothing to a reader.
          if (t && !/^(alternative|obsolete|archaic|plural|misspelling)\b.*\bof\b/i.test(t)) out.senses.push({ part: String(part.partOfSpeech || ''), text: t.slice(0, 300) })
        }
      }
    }
  }
  try { kv.set(key, out, 14 * 864e5) } catch {}
  return json(out)
}

// The stretch of an article where the most of the asked-about words are.
function passage(text, words, size) {
  if (text.length <= size) return text
  const lower = text.toLowerCase()
  let best = 0
  let bestScore = -1
  for (let at = 0; at < text.length; at += Math.round(size / 3)) {
    const chunk = lower.slice(at, at + size)
    let score = 0
    for (const w of words) if (chunk.includes(w)) score++
    if (score > bestScore) { bestScore = score; best = at }
  }
  return (best ? '…' : '') + text.slice(best, best + size) + '…'
}

const STOP = new Set('what when where which while with would about after again also because been before being between both could does doing each from have having here into more most other over same should some such than that their them then there these they this those through under until very were what your yours just like does didn shelf article articles'.split(' '))

export { host }
