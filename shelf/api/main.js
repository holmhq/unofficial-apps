// Shelf's server. Holm loads this module on every request, so it stays small: pictures kept
// from articles (/i/…), shared highlights (/q/…, /s/…) and the JSON API (/api/…) load their code
// only when asked for, and everything else is the app's own static files. The named
// operations below are the tools Claude uses through Holm's MCP endpoint (/_holm/mcp);
// contract.json describes them, and their code is in ops.js.

const PICTURE = /^\/i\/([a-f0-9]{32})(\/t)?$/
const QUOTE = /^\/(q\/[A-Za-z0-9]{8,32}(\/card\.png)?|s\/[A-Za-z0-9]{8,32})\/?$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const picture = PICTURE.exec(path)
    if (picture && (request.method === 'GET' || request.method === 'HEAD')) return (await import('./images.js')).image(request, env, picture[1], !!picture[2])
    if (path.startsWith('/api/') || QUOTE.test(path)) return (await import('./http.js')).handle(request, env, url)
    return env.holm.web.fetch(request)
  }
}

const ops = () => import('./ops.js')
export async function opList(input, env, ctx) { return (await ops()).opList(input, env, ctx) }
export async function opRead(input, env, ctx) { return (await ops()).opRead(input, env, ctx) }
export async function opSearch(input, env, ctx) { return (await ops()).opSearch(input, env, ctx) }
export async function opSave(input, env, ctx) { return (await ops()).opSave(input, env, ctx) }
export async function opUpdate(input, env, ctx) { return (await ops()).opUpdate(input, env, ctx) }
export async function opHighlights(input, env, ctx) { return (await ops()).opHighlights(input, env, ctx) }
export async function opHighlightSave(input, env, ctx) { return (await ops()).opHighlightSave(input, env, ctx) }
export async function opHighlightUpdate(input, env, ctx) { return (await ops()).opHighlightUpdate(input, env, ctx) }
export async function opReview(input, env, ctx) { return (await ops()).opReview(input, env, ctx) }
