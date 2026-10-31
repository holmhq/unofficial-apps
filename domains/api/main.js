// Domains: find a short domain that's actually free.
//
// The page does the searching. It makes the names to try, asks a lookup provider which are
// free and shows them as they come in; providers are adapters in web/src/providers/. The
// server here only does what a page can't: AI ideas, registry lookups for the RDAP adapter,
// who is signed in and their saved names (http.js).
//
// This file stays small, since Holm loads it for every request; the routes load with
// import(). Static files in web/ are served by Holm without running any of this.

// Addresses that open the app: the shell from web/shell.html, with this origin in its
// social tags and its own Content-Security-Policy. The Namecheap adapter talks to Namecheap's
// search socket from the browser, so connect-src names that one origin; everything else
// stays on this origin.
const PAGES = new Set(['/', '/saved', '/about'])
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
    if ((request.method === 'GET' || request.method === 'HEAD') && PAGES.has(url.pathname)) return shell(request, env)
    if (url.pathname.startsWith('/api/')) {
      const http = await import('./http.js')
      return http.default.fetch(request, env)
    }
    return env.holm.web.fetch(request)
  },
}

async function shell(request, env) {
  const response = await env.holm.web.fetch(new Request(new URL('/shell', request.url), { method: 'GET', headers: request.headers }))
  const origin = new URL(request.url).origin
  const html = (await response.text()).replaceAll('__ORIGIN__', origin)
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
