// AI ideas: short labels that keep the sense or sound of what was typed, from the node's AI
// provider, plus one line on how the model read the input. A second round ("more like
// these") asks for names in the style of the ones that came back available or were starred.
// Kept 30 days per text, length and round, so the same name gets them at once, and capped
// per day across everyone, since the route is open to all (Holm hands raw routes no client
// address to count per person).

const KINDS = ['nickname', 'spelling', 'short', 'related', 'blend', 'coined']
const DAY_CAP = 3000
const COUNT = 24
const MORE = 16

export function ideas(input, env) {
  const text = String(input.text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 60)
  const max = Math.max(2, Math.min(20, Math.round(input.max || 8)))
  const like = (input.like || []).slice(0, 12)
  const avoid = new Set(input.avoid || [])
  if (!text) return { ideas: [], read: '', cached: false }
  const kv = env.holm.app.kv
  const key = 'ideas:v5:' + hash(text.toLowerCase() + '|' + max + '|' + [...like].sort().join(','))
  const kept = kv.get(key)
  if (kept) {
    const doc = JSON.parse(kept)
    return { ideas: doc.ideas.filter((i) => !avoid.has(i.label)), read: doc.read || '', cached: true }
  }

  const day = 'ideas:day:' + new Date().toISOString().slice(0, 10)
  if ((Number(kv.get(day)) || 0) >= DAY_CAP) return { ideas: [], read: '', cached: false, note: 'AI ideas are resting for today. The other ideas still work.' }
  kv.increment(day)

  let answer
  try {
    answer = env.holm.ai.chat({
      messages: [
        { role: 'system', content: 'You name things. You suggest short, memorable domain name labels that people can say out loud, and answer with JSON only.' },
        { role: 'user', content: like.length ? morePrompt(text, max, like, avoid) : prompt(text, max) },
      ],
      temperature: 0.9,
      max_tokens: 500,
    })
  } catch (error) {
    console.error('ideas: ai failed', String(error && (error.code || error.message) || error).slice(0, 200))
    return { ideas: [], read: '', cached: false, note: 'AI ideas aren’t available right now.' }
  }
  const doc = parse(answer && answer.content, text, max, like.length ? MORE : COUNT, new Set([...avoid, ...like]))
  if (doc.ideas.length) kv.set(key, JSON.stringify(doc), 30 * 24 * 3600 * 1000)
  return { ...doc, cached: false }
}

const RULES = (max) => `Labels: lowercase a-z and 0-9 only, no hyphens, no extension, at most ${max} letters, mostly 3 to 6. Every label must be easy to say and spell after hearing it once: no strings of consonants (never "zchr" or "phtn"), no random letters. Leave out the exact input, famous brands, other people's names and anything rude.`

function prompt(text, max) {
  return [
    `Name or idea: "${text.replace(/"/g, "'")}"`,
    `First, in "read", one short line of at most 14 words on how you read it, written like a caption, not about yourself: "A first name meaning happiness" or "A harbour-side company; words from the sea". Never write "I".`,
    `Then suggest about ${COUNT} labels someone could register as a domain, about four of each kind:`,
    'nickname: real nicknames and short forms people already use (for Katherine: kate, kat, kit)',
    'spelling: other spellings that sound the same',
    'short: clipped forms or initials that still read naturally',
    'related: short real words from the same world or meaning (for harbour: quay, berth, moor)',
    'blend: parts joined, or a short natural ending such as -o, -y or -ly',
    'coined: a few invented words that still suggest it and sound good',
    RULES(max),
    'Best and shortest first in each group.',
    'Reply with JSON only: {"read":"","nickname":[],"spelling":[],"short":[],"related":[],"blend":[],"coined":[]}',
  ].join('\n')
}

function morePrompt(text, max, like, avoid) {
  return [
    `Name or idea: "${text.replace(/"/g, "'")}"`,
    `These labels came back available or were picked as favourites: ${like.join(', ')}.`,
    `Suggest ${MORE} new labels in the same spirit: similar length, sound and feel, still suggesting the idea. Use the kinds below.`,
    avoid.size ? `Already tried, so leave out: ${[...avoid].slice(0, 40).join(', ')}.` : '',
    'related: short real words from the same world · blend: parts joined or a friendly ending · coined: invented words · spelling: other spellings',
    RULES(max),
    'Reply with JSON only: {"read":"","related":[],"blend":[],"coined":[],"spelling":[]}',
  ].filter(Boolean).join('\n')
}

const WHY = { nickname: 'A nickname people use', spelling: 'Sounds the same', short: 'Clipped to read naturally', related: 'From the same world', blend: 'Parts joined', coined: 'A new word' }

// Easy to say: has a vowel, no run of four consonants, and runs of three only where English
// has them (str, chr, nch…). The model is asked for this; this makes sure.
export function sayable(w) {
  if (!/[aeiouy]/.test(w) || /[^aeiouy0-9]{4,}/.test(w)) return false
  const re = /[^aeiouy0-9]{3}/g
  let m
  while ((m = re.exec(w))) {
    if (/^(chr|sch|str|spr|scr|thr|shr|nch|ght|tch|rst|ngs|nks|lts|rds|rks|cks|ndr|ntr|mpl|nst|rld|rth|lth)$/.test(m[0])) continue
    if (m.index + 3 === w.length && m[0].endsWith('r')) continue // a dropped last vowel: flickr, harbr
    return false
  }
  return true
}

function parse(content, text, max, count, skip) {
  if (typeof content !== 'string') return { ideas: [], read: '' }
  const raw = content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
  let data
  try { data = JSON.parse(raw) } catch { return { ideas: [], read: '' } }
  const exact = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const seen = new Set([exact, ...skip])
  const out = []
  const take = (label, kind) => {
    label = String(label || '').toLowerCase().trim()
    if (!/^[a-z0-9]+$/.test(label) || label.length < 2 || label.length > max || seen.has(label) || out.length >= count || !sayable(label)) return
    seen.add(label)
    out.push({ label, kind, why: WHY[kind] })
  }
  // Round-robin across the kinds, so a short list still has some of each.
  const lists = KINDS.map((k) => [k, Array.isArray(data && data[k]) ? data[k] : []])
  for (let i = 0; i < count; i++) for (const [k, list] of lists) if (i < list.length) take(list[i], k)
  const read = typeof data.read === 'string' ? data.read.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
  return { ideas: out, read }
}

function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36) + s.length.toString(36)
}
