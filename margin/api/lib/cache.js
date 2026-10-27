// The fast path: main.js asks here first, before loading the rest of Margin. It answers what
// needs no rendering: Margin's versioned CSS, scripts and theme files, the prefetch rules,
// photos, and reading pages that are already rendered (or that the browser already holds: a 304).
import { sha256 } from './util.js';
import { siteRev } from './store.js';

export const VERSION = '0.5.0';

const LOCAL = /^(127\.|localhost|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/;
// Addresses that may be a rendered page (no file extension, not one of Margin's own areas).
const PAGE = /^\/(?!(?:api|media|t|v|margin|themes|vendor|studio|_holm|auth|c|a|new|join|upload)(?:\/|$))[^.]*$/;
const VERSIONED = /^\/v\/([a-f0-9]{10})(\/(?:margin|themes)\/[a-z0-9][a-z0-9/._-]*)$/i;
// Chrome and Edge fetch a page while the pointer rests on its link (or as a finger goes down).
const SPECULATION = JSON.stringify({
  prefetch: [{
    source: 'document',
    where: { and: [{ href_matches: '/*' }, { not: { href_matches: ['/studio*', '/api/*', '/auth/*', '/_holm/*', '/media/*', '/new', '/join/*', '/*.xml'] } }, { not: { selector_matches: '[download], [rel~=nofollow]' } }] },
    eagerness: 'moderate',
  }],
});

export async function quick(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = url.pathname;
  const m = VERSIONED.exec(path);
  if (m && !m[2].includes('..')) return versioned(request, env, url, m[1], m[2]);
  // Photos and their smaller copies: no need for the rest of Margin.
  const media = /^\/media\/([a-z0-9]+)(?:-(w\d{3,4}|og))?(?:\.[a-z0-9]{2,5})?$/.exec(path);
  if (media) return (await import('../media.js')).serve(env, request, media[1], media[2]);
  if (path === '/margin/speculation.json') return new Response(SPECULATION, { headers: { 'Content-Type': 'application/speculationrules+json', 'Cache-Control': 'public, max-age=3600' } });
  if (!PAGE.test(path)) return null;
  // Other addresses redirect to the primary one; the full handler does that.
  const origin = env.holm.app.kv.get('site:origin');
  if (!LOCAL.test(url.host) && (!origin || new URL(origin).host !== url.host)) return null;
  return cachedPage(env, request, url);
}

// ---------- versioned files ----------
// Margin's own CSS, scripts and built-in theme files load under /v/<fingerprint>/, cached for a
// year; the fingerprint changes with Margin's version or any of those files. Working it out
// reads them all, so it is kept for two minutes: a deploy reaches readers within that.

const FINGERPRINTED = ['/margin/ui.css', '/margin/reader.js', '/margin/live-covers.js', '/margin/landing.css', '/themes/editorial/theme.css', '/themes/quiet/theme.css'];

export async function assetVersion(env, origin) {
  const saved = env.holm.app.kv.get('assets:fingerprint');
  if (saved && saved.version === VERSION) return saved.value;
  const tags = [VERSION, await sha256(env.holm.private.read('covers.js'))];
  for (const path of FINGERPRINTED) {
    try {
      const res = await env.holm.web.fetch(new Request(origin + path, { method: 'HEAD' }));
      tags.push(res.headers.get('etag') || '');
    } catch { tags.push(''); }
  }
  const value = (await sha256(tags.join('|'))).slice(0, 10);
  env.holm.app.kv.set('assets:fingerprint', { version: VERSION, value }, 120000);
  return value;
}

async function versioned(request, env, url, v, file) {
  const current = v === await assetVersion(env, url.origin);
  const cache = current ? 'public, max-age=31536000, immutable' : 'no-cache';
  // The cover drawings' code lives in api/ (the server draws with it too).
  if (file === '/margin/covers.js') {
    return new Response(request.method === 'HEAD' ? null : env.holm.private.read('covers.js'), { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' } });
  }
  const res = await env.holm.web.fetch(new Request(url.origin + file, { method: request.method, headers: request.headers }));
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('Cache-Control', res.status === 200 ? cache : 'no-cache');
  return new Response(request.method === 'HEAD' || res.status === 304 ? null : await res.arrayBuffer(), { status: res.status, headers });
}

// ---------- rendered pages ----------
// A page's tag names Margin's assets, the site revision (every visible change bumps it) and the
// address. Browsers revalidate with it and get a 304 with nothing rendered; one rendering
// serves every reader until something changes. Pages carry nothing about who is reading.

const PAGE_TTL = 6 * 3600 * 1000;

export async function pageTag(env, url) {
  const v = await assetVersion(env, url.origin);
  const where = (await sha256(url.host + url.pathname + url.search)).slice(0, 16);
  return `"m-${v}-${siteRev(env)}-${where}"`;
}

async function cachedPage(env, request, url) {
  const tag = await pageTag(env, url);
  const asked = (request.headers.get('if-none-match') || '').split(',').map((t) => t.trim().replace(/^W\//, ''));
  if (asked.includes(tag)) return new Response(null, { status: 304, headers: { ETag: tag, 'Cache-Control': 'public, max-age=0, must-revalidate' } });
  const hit = env.holm.app.kv.get('page:' + tag.slice(1, -1));
  if (!hit || typeof hit.html !== 'string') return null;
  return new Response(request.method === 'HEAD' ? null : hit.html, { headers: pageHeaders(tag, hit.csp, 'hit') });
}

export function storePage(env, tag, html, policy) {
  try { env.holm.app.kv.set('page:' + tag.slice(1, -1), { html, csp: policy }, PAGE_TTL); } catch (error) {
    console.warn('page cache write failed', String(error && error.message || error).slice(0, 200));
  }
}

export function pageHeaders(tag, policy, state) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Speculation-Rules': '"/margin/speculation.json"',
  };
  if (tag) headers.ETag = tag;
  if (state) headers['X-Margin-Cache'] = state;
  return headers;
}
