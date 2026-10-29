// Kalendar: share one link and let people book a time with you, no sign-up.
// http.js serves the page and its JSON API; ops.js with contract.json holds
// booking and cancelling, behind Holm's challenge and rate limits, and the
// host's tools for Claude (Holm's MCP endpoint, /_holm/mcp). The modules
// load with import() so Holm's contract scan reads only this file.

export default {
  async fetch(request, env) {
    const http = await import('./http.js')
    return http.default.fetch(request, env)
  }
}

const ops = () => import('./ops.js')
export async function opBook(input, env) { return (await ops()).opBook(input, env) }
export async function opCancel(input, env) { return (await ops()).opCancel(input, env) }
export async function opGuide(input, env) { return (await ops()).opGuide(input, env) }
export async function opMe(input, env) { return (await ops()).opMe(input, env) }
export async function opProfile(input, env) { return (await ops()).opProfile(input, env) }
export async function opHoursGet(input, env) { return (await ops()).opHoursGet(input, env) }
export async function opHoursUpdate(input, env) { return (await ops()).opHoursUpdate(input, env) }
export async function opEventsList(input, env) { return (await ops()).opEventsList(input, env) }
export async function opEventsCreate(input, env) { return (await ops()).opEventsCreate(input, env) }
export async function opEventsUpdate(input, env) { return (await ops()).opEventsUpdate(input, env) }
export async function opEventsDelete(input, env) { return (await ops()).opEventsDelete(input, env) }
export async function opMeetingsList(input, env) { return (await ops()).opMeetingsList(input, env) }
export async function opMeetingsCancel(input, env) { return (await ops()).opMeetingsCancel(input, env) }
export async function opRequestsAccept(input, env) { return (await ops()).opRequestsAccept(input, env) }
export async function opRequestsDecline(input, env) { return (await ops()).opRequestsDecline(input, env) }
export async function opSlotsList(input, env) { return (await ops()).opSlotsList(input, env) }
export async function opStats(input, env) { return (await ops()).opStats(input, env) }
export async function opLinksList(input, env) { return (await ops()).opLinksList(input, env) }
export async function opLinksCreate(input, env) { return (await ops()).opLinksCreate(input, env) }
export async function opLinksDelete(input, env) { return (await ops()).opLinksDelete(input, env) }
