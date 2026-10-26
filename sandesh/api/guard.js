// Limits that keep a personal SIM looking like a person, not a bulk sender.
// Each text to one number counts once: a text to three people counts three.
//
// - TRAI's "bulk": more than 20 texts on the same or similar subject in
//   24 hours, 100 in 7 days or 300 in 30 days (TCCCPR 2018, regulation 2).
//   Sandesh stops at those numbers.
// - A daily cap on texts and on different people texted, because operators
//   flag numbers that text many people and hear back from few. To change
//   them for your own copy, edit DAILY_TEXTS and DAILY_PEOPLE below.
// - At most 10 numbers in one text and 10 texts a minute.

import { HttpError, DAY, now } from './lib.js'

const DAILY_TEXTS = 100
const DAILY_PEOPLE = 50

export function limits() {
  return {
    perText: 10,
    perMinute: 10,
    perDay: DAILY_TEXTS,
    people: DAILY_PEOPLE,
    similar: [
      { window: DAY, max: 20, label: '24 hours' },
      { window: 7 * DAY, max: 100, label: '7 days' },
      { window: 30 * DAY, max: 300, label: '30 days' }
    ]
  }
}

// Texts sent and people texted in the last 24 hours.
export function usage(env, ownerId) {
  const rows = env.holm.app.ds.find('messages', { ownerId, dir: 'out', at: { $gte: now() - DAY } }, { limit: 2000 })
  const people = new Set(rows.map(r => r.number))
  return { texts: rows.length, people: people.size, numbers: people }
}

export function check(env, ownerId, numbers, similarKey) {
  const l = limits()
  if (numbers.length > l.perText) {
    throw new HttpError(400, 'too_many_numbers', `Send to at most ${l.perText} numbers at a time. More than that is a bulk message.`)
  }
  const use = usage(env, ownerId)
  if (use.texts + numbers.length > l.perDay) {
    throw new HttpError(429, 'daily_limit', `That would pass ${l.perDay} texts in 24 hours (you've sent ${use.texts}). Personal texting rarely needs more; try again later.`)
  }
  const fresh = numbers.filter(n => !use.numbers.has(n)).length
  if (use.people + fresh > l.people) {
    throw new HttpError(429, 'people_limit', `That would pass ${l.people} different people in 24 hours. Operators watch for numbers that text many people, so Sandesh stops here.`)
  }
  const kv = env.holm.app.kv
  const minute = `rate:${ownerId}:${Math.floor(now() / 60000)}`
  const recent = Number(kv.get(minute) || 0)
  if (recent + numbers.length > l.perMinute) {
    throw new HttpError(429, 'slow_down', `That's more than ${l.perMinute} texts in a minute. Wait a moment.`)
  }
  if (similarKey) {
    for (const rule of l.similar) {
      const sent = env.holm.app.ds.count('messages', { ownerId, dir: 'out', similar: similarKey, at: { $gte: now() - rule.window } })
      if (sent + numbers.length > rule.max) {
        throw new HttpError(429, 'bulk_limit',
          `You've sent this text, or one very like it, ${sent} times in ${rule.label}. ` +
          `TRAI counts more than ${rule.max} as bulk, which a personal SIM must not send.`,
          { sent, max: rule.max, window: rule.label })
      }
    }
  }
  kv.set(minute, recent + numbers.length, 120000)
}
