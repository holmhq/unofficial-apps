// Release check for Sandesh's text rules and vault (not deployed):
//   node tools/check.mjs
// It fails if api/sms.js and web/src/sms.js differ, or any case below
// gives the wrong answer. CASES and run() are exported so the same cases
// can be run inside a scratch Holm app, whose JavaScript engine differs
// from Node's (see the README).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import * as sms from '../web/src/sms.js'

const root = fileURLToPath(new URL('..', import.meta.url))
assert.equal(readFileSync(root + 'api/sms.js', 'utf8'), readFileSync(root + 'web/src/sms.js', 'utf8'), 'api/sms.js must be an exact copy of web/src/sms.js')

export const CASES = [
  // Phone numbers
  ['normalizePhone', ['98765 43210'], '+919876543210'],
  ['normalizePhone', ['+91 98765-43210'], '+919876543210'],
  ['normalizePhone', ['09876543210'], '+919876543210'],
  ['normalizePhone', ['919876543210'], '+919876543210'],
  ['normalizePhone', ['0091 98765 43210'], '+919876543210'],
  ['normalizePhone', ['5876543210'], null],
  ['normalizePhone', ['+44 7700 900123'], '+447700900123'],
  ['normalizePhone', ['12345'], null],
  ['normalizePhone', ['call me'], null],
  ['formatPhone', ['+919876543210'], '+91 98765 43210'],
  // SMS parts
  ['segments', ['Hello'], { encoding: 'GSM-7', units: 5, parts: 1, perPart: 160, left: 155, culprit: null }],
  ['segments', ['a'.repeat(160)], { encoding: 'GSM-7', units: 160, parts: 1, perPart: 160, left: 0, culprit: null }],
  ['segments', ['a'.repeat(161)], { encoding: 'GSM-7', units: 161, parts: 2, perPart: 153, left: 145, culprit: null }],
  ['segments', ['Price €5 [ok]'], { encoding: 'GSM-7', units: 16, parts: 1, perPart: 160, left: 144, culprit: null }],
  ['segments', ['नमस्ते'], { encoding: 'Unicode', units: 6, parts: 1, perPart: 70, left: 64, culprit: 'न' }],
  ['segments', ['See you 👍'], { encoding: 'Unicode', units: 10, parts: 1, perPart: 70, left: 60, culprit: '👍' }],
  ['segments', ['x'.repeat(71) + '’'], { encoding: 'Unicode', units: 72, parts: 2, perPart: 67, left: 62, culprit: '’' }],
  ['segments', [''], { encoding: 'GSM-7', units: 0, parts: 0, perPart: 160, left: 0, culprit: null }],
  // Same or similar
  ['similarityKey', ['Hi Asha, your table for 4 at 8pm is ready'], 'hi asha your table for at pm is ready'],
  ['similarityKey', ['ok'], null],
  ['similarityKey', ['नमस्ते! आज शाम 7 बजे मिलते हैं, ठीक है?'], 'नमस्ते आज शाम बजे मिलते हैं ठीक है'],
  ['similarityKey', ['Visit https://example.com/x?y=1 for the menu, friend'], 'visit for the menu friend'],
  ['similarityKey', ['வணக்கம்! நாளை மாலை 5 மணிக்கு சந்திப்போம்'], 'வணக்கம் நாளை மாலை மணிக்கு சந்திப்போம்'],
  ['similarityKey', ['আজ রাতে দেখা হবে। ঠিক আছে তো?'], 'আজ রাতে দেখা হবে ঠিক আছে তো'],
  ['similarityKey', ['مرحبا، نلتقي غدا في الساعة 5 مساء'], 'مرحبا نلتقي غدا في الساعة مساء'],
  ['similarityKey', ['สวัสดีครับ พรุ่งนี้เจอกัน 9 โมง'], 'สวัสดีครับ พรุ่งนี้เจอกัน โมง'],
  // Business signals
  ['signals', ['Your OTP is 482913. Do not share it.'], { otp: true, promo: false, business: true, links: [] }],
  ['signals', ['Use code is 1234 to log in'], { otp: true, promo: false, business: true, links: [] }],
  ['signals', ['Flat 50% off on all kurtas this Diwali!'], { otp: false, promo: true, business: true, links: [] }],
  ['signals', ['Big sale and a coupon for you'], { otp: false, promo: true, business: true, links: [] }],
  ['signals', ['Great deal on the flat, will tell you later'], { otp: false, promo: false, business: false, links: [] }],
  ['signals', ['Are you coming to Diwali dinner on Sunday?'], { otp: false, promo: false, business: false, links: [] }],
  ['signals', ['Photos at photos.example.com/diwali'], { otp: false, promo: false, business: false, links: ['photos.example.com/diwali'] }],
  // Opt-out replies
  ['optKeyword', ['STOP'], 'stop'],
  ['optKeyword', ['Stop.'], 'stop'],
  ['optKeyword', ['stop all'], 'stop'],
  ['optKeyword', ['Stop by later?'], null],
  ['optKeyword', ['START'], 'start'],
  // Templates
  ['checkTemplate', ['Hi {#var#}, your order {#numeric#} is ready at the counter.'], 'ready'],
  ['checkTemplate', ['{#var#} {#var#} {#var#} {#var#}'], 'warn:too_many_vars,fixed_share'],
  ['checkTemplate', ['Hello {#name#}'], 'error+warn:unknown_var,fixed_share'],
  ['checkTemplate', ['Reached home, call me back'], 'ready'],
  ['checkTemplate', ['Get 20% off at shop.example.com, {#var#}!'], 'note:links,business'],
  ['fillTemplate', ['Hi {#var#}, table for {#numeric#}', ['Asha', '4']], { text: 'Hi Asha, table for 4', errors: {} }],
  ['fillTemplate', ['Hi {#var#}, table for {#numeric#}', ['Asha', 'four']], { text: 'Hi Asha, table for four', errors: { 1: 'Numbers only.' } }],
  ['fillTemplate', ['Code {#alphanumeric#}', ['AB 12']], { text: 'Code AB 12', errors: {} }],
  ['fillTemplate', ['Code {#alphanumeric#}', ['AB-12']], { text: 'Code AB-12', errors: { 0: 'Letters and numbers only.' } }],
  ['fillTemplate', ['Code {#alphanumeric#}', ['कोड १२']], { text: 'Code कोड १२', errors: {} }],
  ['fillTemplate', ['Hi {#var#}', ['x'.repeat(31)]], { text: 'Hi ' + 'x'.repeat(31), errors: { 0: 'At most 30 characters.' } }],
  // India Standard Time
  ['ist', [Date.UTC(2026, 9, 26, 16, 0)], { hour: 21, minute: 30, day: '2026-10-26' }],
  ['nextIstHour', [Date.UTC(2026, 9, 26, 16, 0), 8], Date.UTC(2026, 9, 27, 2, 30)],
  ['nextIstHour', [Date.UTC(2026, 9, 26, 1, 0), 8], Date.UTC(2026, 9, 26, 2, 30)]
]

// checkTemplate is summarised as 'ready', or the levels and codes of its issues.
export function run(lib, [name, args]) {
  const value = lib[name](...args)
  if (name !== 'checkTemplate') return value
  if (value.ready && !value.issues.length) return 'ready'
  const levels = [...new Set(value.issues.map(i => i.level))]
  return `${levels.join('+')}:${value.issues.map(i => i.code).join(',')}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0
  for (const c of CASES) {
    try {
      assert.deepEqual(run(sms, c), c[2])
    } catch (error) {
      failed++
      console.error(`✗ ${c[0]}(${JSON.stringify(c[1]).slice(0, 60)}):`, error.message.split('\n').slice(0, 6).join(' '))
    }
  }

  // The vault: a sealed value opens with its own context only.
  const { seal, open } = await import('../api/vault.js')
  const env = { holm: { secrets: { get: () => 'k'.repeat(64) }, app: { id: 'test' } } }
  const sealed = await seal(env, 'user:pässword', 'm1\nphone')
  assert.equal(await open(env, sealed, 'm1\nphone'), 'user:pässword')
  await assert.rejects(open(env, sealed, 'm2\nphone'), /can't read/)
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')
  await assert.rejects(open(env, tampered, 'm1\nphone'), /can't read/)
  await assert.rejects(open({ ...env, holm: { ...env.holm, secrets: { get: () => 'j'.repeat(64) } } }, sealed, 'm1\nphone'), /can't read/)
  await assert.rejects(open(env, 'v1.' + sealed.slice(3), 'm1\nphone'), /can't read/)
  assert.match(sealed, /^v2\.[\w-]+$/)
  assert.notEqual(await seal(env, 'same', 'c'), await seal(env, 'same', 'c'))
  const longer = 'x'.repeat(100)
  assert.equal(await open(env, await seal(env, longer, 'c'), 'c'), longer)

  if (failed) {
    console.error(`${failed} of ${CASES.length} cases failed`)
    process.exit(1)
  }
  console.log(`✓ ${CASES.length} text-rule cases and the vault checks pass; api/sms.js matches web/src/sms.js`)
}
