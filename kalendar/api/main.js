// Kalendar: share one link and let people book a time with you, no sign-up.
// http.js serves the page and its JSON API; ops.js with contract.json holds
// booking and cancelling, behind Holm's challenge and rate limits. The
// modules load with import() so Holm's contract scan reads only this file.
const http = await import('./http.js')
const ops = await import('./ops.js')

export default {
  fetch(request, env) { return http.default.fetch(request, env) }
}

export function opBook(input, env) { return ops.opBook(input, env) }
export function opCancel(input, env) { return ops.opCancel(input, env) }
