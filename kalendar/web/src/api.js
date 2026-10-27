// Same-origin calls to Kalendar's server. Errors arrive as
// { error: { code, message, details } } and are thrown as ApiError.
// Booking and cancelling are Holm operations behind a small proof of work,
// solved in the background (/_holm/challenge.js) while the form is filled in.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function send(method, path, body, headers = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'offline', 'You seem to be offline. Check your connection and try again.')
  }
  const data = await response.json().catch(() => null)
  return { response, data }
}

function fail(response, data) {
  const e = (data && data.error) || {}
  return new ApiError(response.status, e.code || 'error', e.message || `Something went wrong (${response.status}).`, e.details)
}

export async function call(method, path, body) {
  const { response, data } = await send(method, path, body)
  if (!response.ok) throw fail(response, data)
  return data
}

export const get = (path) => call('GET', path)
export const post = (path, body = {}) => call('POST', path, body)
export const patch = (path, body = {}) => call('PATCH', path, body)
export const del = (path) => call('DELETE', path)

let solver = null
const loadSolver = () => (solver ||= import('/_holm/challenge.js'))
const ready = new Map()
const FRESH = 40000

// The proof needs Web Crypto, which browsers give only to secure pages, and
// gets twenty seconds before the page says so instead of waiting forever.
function solveNow(name) {
  if (!globalThis.crypto || !crypto.subtle) return Promise.reject(new ApiError(0, 'insecure', 'Booking needs a secure (https) page. Open this link with https:// and try again.'))
  const work = loadSolver().then(({ fetchChallenge, solve }) => fetchChallenge(name).then((c) => solve(c)))
  const late = new Promise((resolve, reject) => setTimeout(() => reject(new ApiError(0, 'slow', 'This is taking too long. Check your connection and try again.')), 20000))
  return Promise.race([work, late])
}

// Start on the proof before it's needed, so the button answers at once.
export function prepare(name) {
  const p = ready.get(name)
  if (p && Date.now() - p.at < FRESH) return
  const promise = solveNow(name)
  promise.catch(() => {})
  ready.set(name, { promise, at: Date.now() })
}

async function proof(name) {
  const p = ready.get(name)
  ready.delete(name)
  if (p && Date.now() - p.at < FRESH) {
    try { return await p.promise } catch {}
  }
  return solveNow(name)
}

export async function op(name, input, { challenge = false, key = null } = {}) {
  const extra = key ? { 'Idempotency-Key': key } : {}
  let headers = challenge ? await proof(name) : {}
  let { response, data } = await send('POST', '/api/' + name, input, { ...extra, ...headers })
  if (response.status === 428 && data && data.error && data.error.details) {
    const { solve } = await loadSolver()
    headers = await solve(data.error.details)
    ;({ response, data } = await send('POST', '/api/' + name, input, { ...extra, ...headers }))
  }
  if (!response.ok) throw fail(response, data)
  return data
}
