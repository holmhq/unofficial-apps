// Named operations (contract.json). Booking takes no account, so it sits
// behind Holm's challenge and rate limit, plus the caps in bookings.js.
import { origin } from './lib.js'
import { createBooking, cancelByInvitee } from './bookings.js'

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 410: 'APP_GONE', 413: 'APP_INVALID_INPUT', 429: 'APP_RATE_LIMITED' }

async function op(run) {
  try {
    return await run()
  } catch (error) {
    if (error && error.public) error.code = CODES[error.status] || 'APP_INVALID_INPUT'
    throw error
  }
}

export function opBook(input, env) {
  return op(() => createBooking(env, input, Date.now(), origin(env)))
}

export function opCancel(input, env) {
  return op(() => cancelByInvitee(env, input, Date.now(), origin(env)))
}
