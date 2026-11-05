// Domains: find a short domain that's still available.
//
// The page does the searching. It makes the names to try, asks a lookup provider which are
// available and shows them as they come in; providers are adapters in web/src/providers/. The
// server here only does what a page can't: AI ideas, registry lookups for the RDAP adapter,
// who is signed in, their saved names and lists, and shared lists (http.js). The named
// operations at the end are the tools Claude uses through Holm's MCP endpoint (/_holm/mcp);
// contract.json describes them, and their code is in ops.js.
//
// This file stays small, since Holm loads it for every request; the routes load with
// import(). Static files in web/ are served by Holm without running any of this.

// Addresses that open the app: the shell from web/shell.html, with this origin in its
// social tags and its own Content-Security-Policy. The Namecheap adapter talks to Namecheap's
// search socket from the browser, so connect-src names that one origin; everything else
// stays on this origin.
const PAGES = new Set(['/', '/saved', '/lists', '/about'])
const isPage = (path) => PAGES.has(path) || /^\/lists\/[a-z0-9-]{1,48}$/.test(path) || /^\/s\/[A-Za-z0-9]{6,16}$/.test(path)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' wss://domain-search.namecheap.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if ((request.method === 'GET' || request.method === 'HEAD') && isPage(url.pathname)) return shell(request, env)
    if (url.pathname.startsWith('/api/')) {
      const http = await import('./http.js')
      return http.default.fetch(request, env)
    }
    return env.holm.web.fetch(request)
  },
}

async function shell(request, env) {
  const response = await env.holm.web.fetch(new Request(new URL('/shell', request.url), { method: 'GET', headers: request.headers }))
  const url = new URL(request.url)
  const origin = url.origin
  let html = (await response.text()).replaceAll('__ORIGIN__', origin)
  // A shared list unfurls as itself: its name and how many names, with its own address.
  if (url.pathname.startsWith('/s/')) {
    const { readShare } = await import('./http.js')
    const shared = readShare(env, url.pathname.slice(3))
    if (shared) {
      const n = shared.list.items.length
      const title = esc(`${shared.list.name} · ${n} ${n === 1 ? 'domain' : 'domains'}`)
      const text = esc(shared.list.note || `${n} short ${n === 1 ? 'domain' : 'domains'}, picked for you and checked live.`)
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, `$1${text}`)
        .replace(/(<meta name="description" content=")[^"]*/, `$1${text}`)
        .replace(/(<meta property="og:url" content=")[^"]*/, `$1${origin}${url.pathname}`)
        .replace(/(<link rel="canonical" href=")[^"]*/, `$1${origin}${url.pathname}`)
    }
  }
  // Holm's page-view beacon posts to the node's own address; let it through.
  let csp = CSP
  const beacon = /var u="(https?:\/\/[^"/]+)\/track"/.exec(html)
  if (beacon && beacon[1] !== origin) csp = csp.replace("connect-src 'self'", `connect-src 'self' ${beacon[1]}`)
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', csp)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('Cache-Control', 'no-cache')
  return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers })
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

const ops = () => import('./ops.js')
export async function namesSuggest(input, env, ctx) { return (await ops()).namesSuggest(input, env, ctx) }
export async function savedList(input, env, ctx) { return (await ops()).savedList(input, env, ctx) }
export async function savedUpdate(input, env, ctx) { return (await ops()).savedUpdate(input, env, ctx) }
export async function listsList(input, env, ctx) { return (await ops()).listsList(input, env, ctx) }
export async function listsGet(input, env, ctx) { return (await ops()).listsGet(input, env, ctx) }
export async function listsCreate(input, env, ctx) { return (await ops()).listsCreate(input, env, ctx) }
export async function listsUpdate(input, env, ctx) { return (await ops()).listsUpdate(input, env, ctx) }
export async function listsDelete(input, env, ctx) { return (await ops()).listsDelete(input, env, ctx) }
