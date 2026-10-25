// Sokoban's server: who is signed in, the leaderboard, and each member's
// solved levels. A solution counts only after this file replays it on its
// own copy of the level (rules.js), so a made-up score can't reach the board.
//
//   GET  /api/me            the signed-in member, with sign-in and sign-out URLs
//   GET  /api/leaderboard   the top scores, and the caller's own rank
//   GET  /api/progress      the member's best result on each level
//   POST /api/progress      { solutions: [{ level, path }] } replayed and kept if better

import { LEVELS, check, better, totals } from './rules.js'

const BOARD = 'scores'     // shared: one row per member, their best total so far
const PROGRESS = 'progress' // member KV: { [levelId]: { moves, pushes, path, at } }
const BOARD_SIZE = 50
const SCAN_LIMIT = 500
const MAX_SOLUTIONS = 100
const BY_ID = new Map(LEVELS.map((level) => [level.id, level]))

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

    if (url.pathname === '/api/progress') {
      if (!auth.isLoggedIn()) return fail(401, 'Sign in to keep your solved levels in your account.')
      const store = env.holm.app.member.kv
      const bests = store.get(PROGRESS) || {}
      if (request.method === 'GET') return json({ bests: publicBests(bests) })
      if (request.method !== 'POST') return fail(405, 'Use GET or POST.')

      const body = await request.json().catch(() => null)
      const solutions = body && Array.isArray(body.solutions) ? body.solutions : null
      if (!solutions || solutions.length > MAX_SOLUTIONS) return fail(400, `Send { solutions: [{ level, path }] }, at most ${MAX_SOLUTIONS}.`)

      // Replay each solution; keep it only if it solves the level and beats
      // what the member already has there.
      const saved = []
      const rejected = []
      for (const item of solutions) {
        const level = item && BY_ID.get(item.level)
        const result = level && check(level, item.path)
        if (!result) { rejected.push(item && typeof item.level === 'string' ? item.level.slice(0, 20) : null); continue }
        if (better(result, bests[level.id])) {
          bests[level.id] = { ...result, at: Date.now() }
          if (!saved.includes(level.id)) saved.push(level.id)
        }
      }
      if (saved.length) store.set(PROGRESS, bests)
      const board = updateBoard(env.holm, auth.getMember(), bests)
      return json({ bests: publicBests(bests), saved, rejected, board })
    }

    return fail(404, 'No such route.')
  }
}

function displayName(member) {
  const name = typeof member.name === 'string' ? member.name.trim().slice(0, 40) : ''
  return name || 'Player'
}

// The member's bests with their solutions, for the page to keep a copy.
function publicBests(bests) {
  const out = {}
  for (const [id, best] of Object.entries(bests)) {
    if (BY_ID.has(id)) out[id] = { moves: best.moves, pushes: best.pushes, path: best.path }
  }
  return out
}

// Raises the member's board row when their verified total beats it. Rows
// written before solutions were checked keep their score until a verified
// total passes it. The name and picture follow the member's profile.
function updateBoard(holm, member, bests) {
  const { ds } = holm.app
  const sum = totals(bests)
  const name = displayName(member)
  const picture = member.picture || null
  const row = ds.find(BOARD, { memberId: member.id }, { limit: 1 })[0] || null
  const improved = sum.levels > 0 && (!row || sum.score > row.score || (sum.score === row.score && sum.pushes < row.pushes))
  const now = Date.now()
  if (improved && row) {
    ds.update(BOARD, { id: row.id }, { $set: { ...sum, name, picture, updatedAt: now } })
  } else if (improved) {
    ds.insert(BOARD, { memberId: member.id, ...sum, name, picture, updatedAt: now, createdAt: now })
  } else if (row && (row.name !== name || row.picture !== picture)) {
    ds.update(BOARD, { id: row.id }, { $set: { name, picture } })
  }
  return { improved, score: improved ? sum.score : row ? row.score : 0 }
}

function leaderboard(holm) {
  const member = holm.auth.getMember()
  const rows = holm.app.ds.find(BOARD, {}, { limit: SCAN_LIMIT })
  rows.sort((a, b) => b.score - a.score || a.pushes - b.pushes || (a.createdAt || 0) - (b.createdAt || 0))
  const entry = (row, i) => ({
    rank: i + 1,
    name: row.name || 'Player',
    picture: row.picture || null,
    score: row.score | 0,
    levels: row.levels | 0,
    pushes: row.pushes | 0,
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
