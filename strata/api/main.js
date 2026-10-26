// Strata's server: who is signed in, the leaderboard, and each member's best
// game. A score counts only after this file replays the whole game from its
// seed and inputs (rules.js), so a made-up score can't reach the board.
//
//   GET  /api/me            the signed-in member, with sign-in and sign-out URLs
//   GET  /api/leaderboard   the top scores, and the caller's own rank
//   GET  /api/best          the member's best game
//   POST /api/games         { seed, log, score } replayed, and kept if it is a new best

import { replay, better } from './rules.js'

const BOARD = 'scores' // shared: one row per member, their best game
const BEST = 'best'    // member KV: { score, lines, level, frames, pieces, seed, log, at }
const BOARD_SIZE = 50
const SCAN_LIMIT = 500

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const fail = (status, error) => json({ error }, status)

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.holm.web.fetch(request)
    const { auth } = env.holm
    const route = `${request.method} ${url.pathname}`

    if (route === 'GET /api/health') return json({ ok: true })

    if (route === 'GET /api/me') {
      const next = url.searchParams.get('next') || '/'
      const member = auth.getMember()
      return json({
        member: member ? { name: displayName(member), picture: member.picture || null } : null,
        loginURL: auth.getLoginURL(next.startsWith('/') && !next.startsWith('//') ? next : '/'),
        logoutURL: auth.getLogoutURL()
      })
    }

    if (route === 'GET /api/leaderboard') return json(leaderboard(env.holm))

    if (route === 'GET /api/best') {
      if (!auth.isLoggedIn()) return fail(401, 'Sign in to keep your best game in your account.')
      return json({ best: publicBest(env.holm.app.member.kv.get(BEST)) })
    }

    if (url.pathname === '/api/games') {
      if (request.method !== 'POST') return fail(405, 'Use POST.')
      if (!auth.isLoggedIn()) return fail(401, 'Sign in to put your games on the leaderboard.')
      const body = await request.json().catch(() => null)
      const seed = body && body.seed
      const log = body && body.log
      if (!Number.isInteger(seed) || typeof log !== 'string' || !Number.isInteger(body.score)) {
        return fail(400, 'Send { seed, log, score } for a finished game.')
      }

      // Play the game again from its seed; it must end, by the rules, on
      // the score the page saw.
      const result = replay(seed, log)
      if (!result || result.score !== body.score) return fail(422, 'That game did not replay to the same score.')

      const store = env.holm.app.member.kv
      const before = store.get(BEST)
      const improved = result.score > 0 && better(result, before)
      if (improved) store.set(BEST, { ...result, seed, log, at: Date.now() })
      const board = updateBoard(env.holm, auth.getMember(), improved ? result : before)
      return json({ result, best: publicBest(improved ? result : before), improved, board })
    }

    return fail(404, 'No such route.')
  }
}

function displayName(member) {
  const name = typeof member.name === 'string' ? member.name.trim().slice(0, 40) : ''
  return name || 'Player'
}

function publicBest(best) {
  if (!best) return null
  return { score: best.score, lines: best.lines, level: best.level, frames: best.frames }
}

// Raises the member's board row to their best game. The name and picture
// follow the member's profile.
function updateBoard(holm, member, best) {
  const { ds } = holm.app
  const name = displayName(member)
  const picture = member.picture || null
  const row = ds.find(BOARD, { memberId: member.id }, { limit: 1 })[0] || null
  const raise = best && (!row || better(best, row))
  const now = Date.now()
  const fields = { score: best ? best.score : 0, lines: best ? best.lines : 0, level: best ? best.level : 1, frames: best ? best.frames : 0 }
  if (raise && row) {
    ds.update(BOARD, { id: row.id }, { $set: { ...fields, name, picture, updatedAt: now } })
  } else if (raise) {
    ds.insert(BOARD, { memberId: member.id, ...fields, name, picture, updatedAt: now, createdAt: now })
  } else if (row && (row.name !== name || row.picture !== picture)) {
    ds.update(BOARD, { id: row.id }, { $set: { name, picture } })
  }
  return { improved: !!raise, score: raise ? fields.score : row ? row.score : 0 }
}

function leaderboard(holm) {
  const member = holm.auth.getMember()
  const rows = holm.app.ds.find(BOARD, {}, { limit: SCAN_LIMIT })
  rows.sort((a, b) => b.score - a.score || b.lines - a.lines || a.frames - b.frames || (a.createdAt || 0) - (b.createdAt || 0))
  const entry = (row, i) => ({
    rank: i + 1,
    name: row.name || 'Player',
    picture: row.picture || null,
    score: row.score | 0,
    lines: row.lines | 0,
    level: row.level | 0,
    frames: row.frames | 0,
    updatedAt: row.updatedAt || null,
    me: !!member && row.memberId === member.id
  })
  const mine = member ? rows.findIndex((row) => row.memberId === member.id) : -1
  return {
    entries: rows.slice(0, BOARD_SIZE).map(entry),
    me: mine >= 0 ? entry(rows[mine], mine) : null,
    total: rows.length
  }
}
