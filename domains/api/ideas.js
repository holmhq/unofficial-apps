// AI ideas: short labels that keep the sense or sound of what was typed, from the node's AI
// provider. Kept 30 days per text and length, so the same name gets them at once, and capped
// per day across everyone, since the route is open to all (Holm hands raw routes no client
// address to count per person).

const KINDS = new Set(['nickname', 'spelling', 'short', 'blend', 'coined'])
const DAY_CAP = 3000
const COUNT = 24

export function ideas(input, env) {
  const text = String(input.text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 60)
  const max = Math.max(2, Math.min(20, Math.round(input.max || 8)))
  if (!text) return { ideas: [], cached: false }
  const kv = env.holm.app.kv
  const key = 'ideas:v3:' + hash(text.toLowerCase() + '|' + max)
  const kept = kv.get(key)
  if (kept) return { ideas: JSON.parse(kept), cached: true }

  const day = 'ideas:day:' + new Date().toISOString().slice(0, 10)
  if ((Number(kv.get(day)) || 0) >= DAY_CAP) return { ideas: [], cached: false, note: 'AI ideas are resting for today. The other ideas still work.' }
  kv.increment(day)

  let answer
  try {
    answer = env.holm.ai.chat({
      messages: [
        { role: 'system', content: 'You name things. You suggest short domain name labels and answer with JSON only.' },
        { role: 'user', content: prompt(text, max) },
      ],
      temperature: 0.9,
      max_tokens: 400,
    })
  } catch (error) {
    console.error('ideas: ai failed', String(error && (error.code || error.message) || error).slice(0, 200))
    return { ideas: [], cached: false, note: 'AI ideas aren’t available right now.' }
  }
  const list = parse(answer && answer.content, text, max)
  if (list.length) kv.set(key, JSON.stringify(list), 30 * 24 * 3600 * 1000)
  return { ideas: list, cached: false }
}

function prompt(text, max) {
  return [
    `Name or idea: "${text.replace(/"/g, "'")}"`,
    `Suggest about ${COUNT} labels, around five of each kind, that someone could register as a domain: lowercase a-z and 0-9 only, no hyphens, no extension, at most ${max} letters, mostly 3 to 5.`,
    'Group them by kind:',
    'nickname: real nicknames and short forms people already use (for Katherine: kate, kat, kathy, kit)',
    'spelling: other spellings that sound the same',
    'short: clipped forms or initials that still read naturally',
    'blend: parts joined, or a short natural ending such as -o, -y or -ly',
    'coined: a few invented, pronounceable words that still suggest it',
    'Shortest and most natural first in each group. Leave out the exact input, real brands, other people’s names and anything rude.',
    'Reply with JSON only: {"nickname":[],"spelling":[],"short":[],"blend":[],"coined":[]}',
  ].join('\n')
}

const WHY = { nickname: 'a short form people use', spelling: 'sounds the same', short: 'clipped to read naturally', blend: 'parts joined', coined: 'a new word' }

function parse(content, text, max) {
  if (typeof content !== 'string') return []
  const raw = content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
  let data
  try { data = JSON.parse(raw) } catch { return [] }
  const exact = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const seen = new Set([exact])
  const out = []
  const take = (label, kind) => {
    label = String(label || '').toLowerCase().trim()
    if (!/^[a-z0-9]+$/.test(label) || label.length < 2 || label.length > max || seen.has(label) || out.length >= COUNT) return
    seen.add(label)
    out.push({ label, kind, why: WHY[kind] })
  }
  // Round-robin across the kinds, so a short list still has some of each.
  const lists = [...KINDS].map((k) => [k, Array.isArray(data && data[k]) ? data[k] : []])
  for (let i = 0; i < COUNT; i++) for (const [k, list] of lists) if (i < list.length) take(list[i], k)
  return out
}

function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36) + s.length.toString(36)
}
