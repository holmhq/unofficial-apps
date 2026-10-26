// Sandesh's text rules, shared by the page and the server: api/sms.js is an
// exact copy of this file (tools/check.mjs fails if they differ). Nothing
// here reads a clock, storage or the network. It covers phone numbers, how
// many SMS a text takes, the key TRAI's "bulk" limits count by, signs that
// a text is really a business message, and DLT-style templates.

/* ---- Phone numbers --------------------------------------------------- */

// India first: a 10-digit mobile number (starting 6–9), with or without
// 0, 91 or +91 in front, becomes +91XXXXXXXXXX. Other countries need a
// leading + (or 00) and their code. Anything else is not a number.
export function normalizePhone(input) {
  const raw = String(input ?? '').trim()
  if (!raw || /[a-z]/i.test(raw)) return null
  const plus = raw.startsWith('+') || raw.startsWith('00')
  let digits = raw.replace(/\D/g, '')
  if (raw.startsWith('00')) digits = digits.slice(2)
  if (!plus) {
    if (digits.length === 11 && digits[0] === '0') digits = digits.slice(1)
    if (digits.length === 10 && /^[6-9]/.test(digits)) return '+91' + digits
    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) return '+' + digits
    return null
  }
  if (digits.startsWith('91')) return digits.length === 12 && /^[6-9]/.test(digits[2]) ? '+' + digits : null
  if (digits.length < 8 || digits.length > 15 || digits[0] === '0') return null
  return '+' + digits
}

export function isIndian(phone) {
  return typeof phone === 'string' && phone.startsWith('+91')
}

// +919876543210 → "+91 98765 43210"; other numbers stay as they are.
export function formatPhone(phone) {
  if (!phone) return ''
  if (isIndian(phone) && phone.length === 13) return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`
  return phone
}

/* ---- How many SMS a text takes ---------------------------------------- */

// GSM 03.38: the basic set costs one unit a character, the extension set
// two. Anything outside both (Hindi, most emoji, curly quotes) switches the
// whole text to UCS-2, counted in UTF-16 code units. A single SMS holds 160
// GSM units or 70 UCS-2 units; a longer text is split into parts of 153 or
// 67, because each part carries a small header.
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXT = '^{}\\[~]|€\f'

export function segments(text) {
  const value = String(text ?? '')
  let units = 0
  let culprit = null
  for (const ch of value) {
    if (GSM.includes(ch)) units += 1
    else if (GSM_EXT.includes(ch)) units += 2
    else { culprit = ch; break }
  }
  if (culprit === null) return count('GSM-7', units, 160, 153, null)
  return count('Unicode', value.length, 70, 67, culprit)
}

function count(encoding, units, single, multi, culprit) {
  const per = units <= single ? single : multi
  const parts = units === 0 ? 0 : Math.ceil(units / per)
  return { encoding, units, parts, perPart: per, left: Math.max(0, parts * per - units), culprit }
}

/* ---- Same or similar ------------------------------------------------- */

// TRAI counts "bulk" as more than 20 messages on the same or similar
// subject in 24 hours (100 in 7 days, 300 in 30). Texts are compared by
// their words alone: case, numbers, links and punctuation are ignored, so
// "Hi Asha, your table for 4 at 8pm" and "Hi Ravi, your table for 2 at 9pm"
// differ only by the names. Very short texts ("ok", "on my way") are
// everyday replies, not campaigns, and are not counted.
export const SIMILAR_MIN_LENGTH = 20

export function similarityKey(text) {
  const core = wordsOnly(String(text ?? '').normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+|www\.\S+/g, ' '))
  return core.length >= SIMILAR_MIN_LENGTH ? core : null
}

// Letters only, every other run of characters becoming one space. A letter
// is any Unicode letter or combining mark, so the vowel signs of Indian
// scripts stay inside their words; digits, the danda and punctuation in
// every script are gaps.
const LETTERS = /[\p{L}\p{M}]+/gu

export function isLetter(ch) {
  return /^[\p{L}\p{M}]$/u.test(ch)
}

export function isDigit(ch) {
  return /^\p{Nd}$/u.test(ch)
}

function wordsOnly(value) {
  return (value.match(LETTERS) || []).join(' ')
}

/* ---- Business messages ----------------------------------------------- */

// Signs that a text is commercial communication, which in India must go
// through a DLT-registered sender, never a personal SIM: one-time codes and
// promotions. These are hints for a person, not a legal test; the page asks
// them to confirm the text is personal, and the API refuses it.
const OTP = [
  /\botp\b/i,
  /\bone[\s-]?time[\s-]?(pass(word|code)?|code|pin)\b/i,
  /\b(verification|security|login|authentication|auth|confirmation)\s+code\b/i,
  /\b(code|pin)\s*(is|:|-)\s*\d{4,8}\b/i
]
const PROMO = [
  { re: /\b\d{1,3}\s?%\s?(off|discount|cashback)\b/i, strong: true },
  { re: /(₹|\brs\.?|\binr)\s?\d[\d,]*\s?(off|cashback)\b/i, strong: true },
  { re: /\b(buy|shop|order|book|apply|register|subscribe|download|install)\s+now\b/i, strong: true },
  { re: /\b(lottery|jackpot|you\s+(have\s+)?won|winner|claim\s+your)\b/i, strong: true },
  { re: /\b(pre[\s-]?approved|instant)\s+(loan|credit)\b/i, strong: true },
  { re: /\b(discount|cashback|coupon|promo\s?code|voucher)s?\b/i },
  { re: /\b(sale|offer|deal)s?\b/i },
  { re: /\blimited\s+(time|period|stock|offer)\b/i },
  { re: /\b(hurry|last\s+day|ends\s+(today|tonight|soon))\b/i },
  { re: /\bfree\s+(gift|trial|delivery|shipping)\b/i },
  { re: /\b(loan|emi|credit\s+card)\b/i },
  { re: /\bt\s?&\s?c\b/i },
  { re: /\bclick\s+(here|the\s+link|below)\b/i },
  { re: /\b(unsubscribe|opt[\s-]?out)\b/i }
]
const LINK = /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|co|io|app|ly|me|net|org|xyz|link|page|site|shop|store|info|biz)(?:\/[^\s]*)?/gi

export function signals(text) {
  const value = String(text ?? '')
  const otp = OTP.some(re => re.test(value))
  const hits = PROMO.filter(p => p.re.test(value))
  const promo = hits.some(p => p.strong) || hits.length >= 2
  const links = value.match(LINK) || []
  return { otp, promo, business: otp || promo, links }
}

/* ---- Replies that opt out -------------------------------------------- */

// A reply that is only one of these words opts the sender out of your
// texts (or back in). "Stop by later" is a sentence, not an opt-out.
const STOP_WORDS = ['stop', 'stop all', 'stopall', 'unsubscribe', 'opt out', 'optout', 'cancel', 'end', 'quit', 'revoke']
const START_WORDS = ['start', 'unstop', 'subscribe']

export function optKeyword(text) {
  const word = wordsOnly(String(text ?? '').toLowerCase())
  if (STOP_WORDS.includes(word)) return 'stop'
  if (START_WORDS.includes(word)) return 'start'
  return null
}

/* ---- DLT-style templates ---------------------------------------------- */

// Registered business senders in India send only pre-approved templates,
// with blanks written {#var#} (or a typed blank such as {#numeric#}). On a
// personal SIM a template is just a shortcut, but writing it the same way
// means it is ready to register if the use ever becomes a business one.
export const VAR_TYPES = {
  var: 'Any text',
  numeric: 'Numbers',
  alphanumeric: 'Letters and numbers',
  url: 'Web address',
  urlott: 'App link',
  cbn: 'Call-back number',
  email: 'Email address'
}
export const VAR_MAX = 30
export const VAR_LIMIT = 3
export const FIXED_SHARE = 0.3

const TOKEN = /\{#([a-z]*)#\}/gi

export function parseTemplate(body) {
  const value = String(body ?? '')
  const parts = []
  const unknown = []
  let last = 0
  for (const match of value.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ text: value.slice(last, match.index) })
    const type = match[1].toLowerCase()
    if (!VAR_TYPES[type]) unknown.push(match[0])
    parts.push({ type: VAR_TYPES[type] ? type : 'var', index: parts.filter(p => p.type).length })
    last = match.index + match[0].length
  }
  if (last < value.length) parts.push({ text: value.slice(last) })
  const fixed = parts.filter(p => p.text).map(p => p.text).join('')
  return { parts, vars: parts.filter(p => p.type), fixed, unknown }
}

// Each issue is { level: 'error' | 'warn' | 'note', code, text }. A template
// with no errors can be used; with no errors or warnings it also meets the
// DLT rules on blanks and fixed text ("DLT-ready").
export function checkTemplate(body) {
  const value = String(body ?? '')
  const { parts, vars, fixed, unknown } = parseTemplate(value)
  const issues = []
  if (!value.trim()) issues.push({ level: 'error', code: 'empty', text: 'Write the message first.' })
  for (const token of unknown) {
    issues.push({ level: 'error', code: 'unknown_var', text: `${token} isn't a DLT blank. Use {#var#}, {#numeric#}, {#alphanumeric#}, {#url#}, {#cbn#} or {#email#}.` })
  }
  if (vars.length > VAR_LIMIT) {
    issues.push({ level: 'warn', code: 'too_many_vars', text: `${vars.length} blanks: DLT allows ${VAR_LIMIT} without a justified exception.` })
  }
  // Worst case: every blank filled to its 30-character limit.
  const worst = fixed.length + vars.length * VAR_MAX
  const share = worst ? fixed.trim().length / worst : 0
  if (value.trim() && vars.length && share < FIXED_SHARE) {
    issues.push({ level: 'warn', code: 'fixed_share', text: `Only ${Math.round(share * 100)}% fixed text: DLT needs at least ${FIXED_SHARE * 100}%.` })
  }
  const sig = signals(fixed)
  if (sig.links.length) {
    issues.push({ level: 'note', code: 'links', text: 'A business sender must whitelist every link and call-back number on DLT.' })
  }
  if (sig.business) {
    issues.push({ level: 'note', code: 'business', text: 'This reads like a business message. From your own SIM, send only personal texts.' })
  }
  const longest = parts.map(p => (p.text != null ? p.text : 'x'.repeat(VAR_MAX))).join('')
  const ready = !issues.some(i => i.level === 'error' || i.level === 'warn')
  return { ok: !issues.some(i => i.level === 'error'), ready, issues, vars, share, worst: segments(longest) }
}

// Fill a template's blanks in order. Returns { text, errors } where errors
// maps a blank's index to what is wrong with its value.
export function fillTemplate(body, values) {
  const { parts } = parseTemplate(body)
  const list = Array.isArray(values) ? values : []
  const errors = {}
  const text = parts.map(part => {
    if (part.text != null) return part.text
    const value = String(list[part.index] ?? '').trim()
    const problem = checkValue(part.type, value)
    if (problem) errors[part.index] = problem
    return value
  }).join('')
  return { text, errors }
}

export function checkValue(type, value) {
  if (!value) return 'Fill this in.'
  if (value.length > VAR_MAX) return `At most ${VAR_MAX} characters.`
  if (type === 'numeric' && !/^\d+$/.test(value)) return 'Numbers only.'
  if (type === 'alphanumeric' && ![...value].every(ch => ch === ' ' || isLetter(ch) || isDigit(ch))) return 'Letters and numbers only.'
  if ((type === 'url' || type === 'urlott') && !/^(https?:\/\/)?[^\s.]+\.[^\s]+$/i.test(value)) return 'A web address.'
  if (type === 'cbn' && !normalizePhone(value) && !/^1[89]00\d{6,7}$/.test(value.replace(/\D/g, ''))) return 'A phone number.'
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'An email address.'
  return null
}

/* ---- India Standard Time --------------------------------------------- */

// IST is UTC+5:30 all year. Given a time in ms, the hour and a day key.
const IST = 330 * 60000

export function ist(ms) {
  const d = new Date(ms + IST)
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), day: d.toISOString().slice(0, 10) }
}

// The next time it is `hour`:00 in India, after `ms`.
export function nextIstHour(ms, hour) {
  const d = new Date(ms + IST)
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - IST
  return at > ms ? at : at + 86400000
}
