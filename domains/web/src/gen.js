// Names to try. From what someone typed, make labels (the part before the dot) that keep its
// sense or its sound but get shorter: clipped forms, other spellings, initials, a dropped
// vowel; then pair them with extensions, shortest whole name first. Pure functions, no DOM,
// so tools/check.mjs can run them in Node.
//
//   parse('Zacharia')            -> { words: ['zacharia'], typedTld: null }
//   labels(parsed, { max, kinds }) -> [{ label, kind, why, score }]
//   expand(labels, tlds, { hacks }) -> [{ domain, label, tld, kind, why, score, group }]

export const KIND = {
  exact: { name: 'What you typed', weight: 0 },
  short: { name: 'Shorter', weight: 3 },
  sound: { name: 'Sounds the same', weight: 5 },
  affix: { name: 'Prefix or suffix', weight: 9 },
  hack: { name: 'Domain hack', weight: 2 },
  ai: { name: 'AI idea', weight: 3 },
}

const VOWELS = 'aeiou'
const isVowel = (c) => VOWELS.includes(c)
const isLetter = (c) => c >= 'a' && c <= 'z'
const isConsonant = (c) => isLetter(c) && !isVowel(c)
const hasVowel = (s) => /[aeiouy]/.test(s)
export const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const ok = (s) => s.length >= 2 && LABEL.test(s) && !/^..--/.test(s)

// What was typed, as words of a-z, 0-9 and hyphens. Accents fold away (Zoë -> zoe), a
// pasted address loses its scheme and www, and a typed extension (zack.io) is kept aside
// when `isTld` knows it.
export function parse(input, isTld = () => false) {
  let s = String(input || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  s = s.replace(/^\s*[a-z]+:\/\//, '').replace(/^\s*www\./, '').replace(/&/g, ' and ').replace(/['’`]/g, '')
  let typedTld = null
  const words = []
  for (let w of s.split(/[\s,;_/+|]+/)) {
    if (!w) continue
    const dot = w.indexOf('.')
    if (dot >= 0) {
      const tail = w.slice(dot + 1).replace(/[^a-z0-9.-]/g, '').replace(/^\.+|\.+$/g, '')
      if (!typedTld && tail && isTld(tail)) typedTld = tail
      w = dot > 0 ? w.slice(0, dot) : ''
    }
    w = w.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')
    if (w) words.push(w.slice(0, 63))
  }
  return { words: words.slice(0, 5), typedTld }
}

// Ways to say the same name with other letters. Each is tried once on a word; a second
// round runs on the short results, so zach -> zak -> zack.
const SWAPS = [
  [/ch/g, 'k', 'k for ch'],
  [/ch$/, 'ck', 'ck for ch'],
  [/ck/g, 'k', 'k for ck'],
  [/c(?=[aour]|$)/g, 'k', 'k for c'],
  [/(?<![ck])k(?=[aour]|$)/g, 'c', 'c for k'],
  [/([aeiou])k$/, '$1ck', 'ck for k'],
  [/ph/g, 'f', 'f for ph'],
  [/qu/g, 'kw', 'kw for qu'],
  [/qu/g, 'q', 'q for qu'],
  [/c?ks/g, 'x', 'x for ks'],
  [/ee/g, 'i', 'i for ee'],
  [/oo/g, 'u', 'u for oo'],
  [/ou/g, 'u', 'u for ou'],
  [/ight/g, 'ite', 'ite for ight'],
  [/([^aeiou])er$/, '$1r', 'no e before r'],
  [/ia$/, 'ya', 'ya for ia'],
  [/y$/, 'i', 'i for y'],
  [/ie$/, 'y', 'y for ie'],
  [/([^aeiou])i$/, '$1y', 'y for i'],
  [/ey$/, 'y', 'y for ey'],
  [/s$/, 'z', 'z for s'],
  [/z$/, 's', 's for z'],
  [/([a-z])\1/g, '$1', 'one letter, not two'],
]

// Prefixes of a word that end where a syllable could: zacharia -> zac, zach, zacha, zachar.
// Two letters only for a single word (za.io is short; ha.io from "harbour labs" is noise).
function clips(word, two = true) {
  const out = []
  for (let n = 2; n < word.length; n++) {
    const p = word.slice(0, n)
    const last = p[n - 1]
    const next = word[n]
    if (!hasVowel(p)) continue
    const closed = isConsonant(last) && hasVowel(p.slice(0, -1))
    const open = n >= 3 && n < word.length - 1 && isVowel(last) && isConsonant(p[n - 2]) && isConsonant(next)
    if (closed || open || (n === 2 && two)) out.push({ label: p, extra: closed ? 0 : open ? 2 : 6 })
  }
  return out
}

// The word without its vowels, keeping the first letter: zacharia -> zchr.
function skeleton(word) {
  let s = word[0]
  for (const c of word.slice(1)) if (!isVowel(c) && c !== s[s.length - 1]) s += c
  return s
}

// flicker -> flickr, harbour -> harbor: the vowel before a final consonant goes.
function dropLastVowel(word) {
  const i = word.length - 2
  return i > 1 && isVowel(word[i]) && isConsonant(word[i + 1]) ? word.slice(0, i) + word.slice(i + 1) : word
}

const PREFIXES = ['get', 'try', 'go', 'use', 'hey', 'my', 'the']
const SUFFIXES = ['hq', 'app', 'labs', 'ly', 'ify', 'hub', 'kit']

// The labels to try, best first. `max` caps generated labels (what was typed is always
// tried); `kinds` switches families off ({ short, sound, affix }); `limit` caps the list.
export function labels({ words }, { max = 63, kinds = {}, limit = 30 } = {}) {
  const found = new Map()
  const add = (label, kind, why, extra = 0) => {
    if (!ok(label)) return
    if (kind !== 'exact' && label.length > max) return
    const score = label.length * 10 + KIND[kind].weight + extra
    const was = found.get(label)
    if (!was || score < was.score) found.set(label, { label, kind, why, score })
  }
  if (!words.length) return []
  const joined = words.join('')
  const on = (k) => kinds[k] !== false

  add(joined, 'exact', words.length > 1 ? 'Your words, joined' : 'Your word')
  if (words.length > 1) add(words.join('-'), 'exact', 'With hyphens', 14)

  // The words to shorten: the whole word, or each word when there are several.
  const bases = words.length > 1 ? words : [joined]
  const shorts = []
  if (on('short')) {
    if (words.length > 1) {
      const initials = words.map((w) => w[0]).join('')
      add(initials, 'short', 'Initials', -4)
      add(initials.slice(0, -1) + words[words.length - 1], 'short', 'Initials and the last word', 1)
      for (const w of words) add(w, 'short', 'One of your words', 0)
    }
    for (const base of bases) {
      for (const c of clips(base, words.length === 1)) {
        add(c.label, 'short', 'The start of ' + base, c.extra)
        if (!c.extra && c.label.length <= 6) shorts.push(c.label)
      }
      if (base.length > 4) add(skeleton(base), 'short', 'Without vowels', 4)
      const dropped = dropLastVowel(base)
      if (dropped !== base) add(dropped, 'short', 'Last vowel dropped', 1)
    }
  }

  if (on('sound')) {
    const first = new Map()
    const sources = words.length > 1 ? [...bases, joined] : [...bases, ...shorts]
    const fromShort = new Set()
    for (const src of sources) {
      for (const [re, to, why] of SWAPS) {
        re.lastIndex = 0
        const out = src.replace(re, to)
        if (out !== src && !first.has(out)) { first.set(out, why); if (shorts.includes(src)) fromShort.add(out) }
      }
    }
    for (const [label, why] of first) add(label, 'sound', why, (label.length > 6 ? 2 : 0) + (fromShort.has(label) ? 2 : 0))
    // A second round on the short ones, and a doubled last letter for the shortest.
    for (const [label] of first) {
      if (label.length > 6) continue
      for (const [re, to, why] of SWAPS) {
        re.lastIndex = 0
        const out = label.replace(re, to)
        if (out !== label) add(out, 'sound', why, 2)
      }
    }
    for (const s of [...shorts, ...first.keys()]) {
      if (s.length < 3 || s.length > 4) continue
      const last = s[s.length - 1]
      const vowelBefore = isVowel(s[s.length - 2])
      if (vowelBefore && 'klmnrxz'.includes(last)) add(s + last, 'sound', 'Doubled last letter', 3)
      if ((vowelBefore && 'bdgklmnprtx'.includes(last)) || /(ck|sh|ch)$/.test(s)) add(s + 'y', 'sound', 'A friendly ending', 4)
    }
  }

  if (on('affix')) {
    const roots = [joined, ...shorts.filter((s) => s.length >= 4 && s !== joined).slice(0, 1)]
    for (const r of roots) {
      for (const p of PREFIXES) add(p + r, 'affix', `“${p}” in front`, 0)
      for (const s of SUFFIXES) add(r + s, 'affix', `“${s}” after`, 0)
    }
    if (!joined.endsWith('s')) add(joined + 's', 'affix', 'Plural', -6)
  }

  const list = [...found.values()].sort((a, b) => a.score - b.score || (a.label < b.label ? -1 : 1))
  const exact = list.filter((l) => l.kind === 'exact')
  return [...exact, ...list.filter((l) => l.kind !== 'exact').slice(0, Math.max(0, limit - exact.length))]
}

// Labels from the AI, already checked to be a-z/0-9 and short enough by the server.
export function aiLabels(ideas, have, max) {
  const out = []
  for (const idea of ideas || []) {
    const label = String(idea.label || '')
    if (!ok(label) || label.length > max || have.has(label)) continue
    have.add(label)
    out.push({ label, kind: 'ai', why: idea.why || 'An AI idea', aiKind: idea.kind, score: label.length * 10 + KIND.ai.weight + (idea.kind === 'coined' ? 3 : 0) })
  }
  return out
}

// Whole names to check: every label with every extension, plus domain hacks (inter.net)
// where a label ends in an extension from `hackTlds`. Ordered so the shortest whole names,
// in the order the extensions were chosen, come first.
export function expand(list, tlds, { hackTlds = [], typed = null } = {}) {
  const cells = []
  const seen = new Set()
  const push = (cell) => { if (!seen.has(cell.domain)) { seen.add(cell.domain); cells.push(cell) } }
  const order = typed && !tlds.includes(typed) ? [typed, ...tlds] : tlds
  for (const l of list) {
    order.forEach((tld, i) => {
      const first = typed === tld && l.kind === 'exact' ? -1000 : 0
      push({ domain: l.label + '.' + tld, label: l.label, tld, kind: l.kind, why: l.why, group: l.label, score: first + (l.label.length + tld.length) * 10 + (l.score - l.label.length * 10) + i * 1.5 })
    })
  }
  for (const l of list) {
    if (l.kind === 'affix') continue
    for (const tld of hackTlds) {
      if (tld.includes('.') || !l.label.endsWith(tld) || l.label.length - tld.length < 2) continue
      const left = l.label.slice(0, -tld.length)
      if (left.endsWith('-')) continue
      push({ domain: left + '.' + tld, label: left, tld, kind: 'hack', why: `${l.label} as ${left}.${tld}`, group: '·hacks', score: (l.label.length) * 10 + KIND.hack.weight })
    }
  }
  return cells.sort((a, b) => a.score - b.score)
}

// "zack.io" -> { label: 'zack', tld: 'io' }, with the longest known extension (co.uk).
export function split(domain, isTld) {
  const parts = String(domain).toLowerCase().split('.')
  for (let i = 1; i < parts.length; i++) {
    const tld = parts.slice(i).join('.')
    if (isTld(tld)) return { label: parts.slice(0, i).join('.'), tld }
  }
  return { label: parts[0], tld: parts.slice(1).join('.') }
}
