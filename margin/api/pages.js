// Reading pages, rendered on the server: Margin's landing page, and every workspace's
// home, writers, posts, topics, feeds and errors through the workspace's theme. A page is
// complete HTML; /margin/reader.js only adds comments, claps, the account menu, live
// drawn covers and link previews.
import { escapeHTML, dates, rfc822, int } from './lib/util.js';
import { assetVersion, pageTag, pageHeaders, storePage } from './lib/cache.js';
import { marginSettings } from './settings.js';
import { blogByHandle, blogDTO, avatarSVG, HANDLE } from './blogs.js';
import { published, findByPath, postById, bodyOf, cardDTO, canEdit, postPath, wsCached } from './posts.js';
import { publicComments } from './comments.js';
import { loadTheme, renderPage, settingValues } from './themes.js';
import { EMBED_ORIGINS } from './markdown.js';
import { workspaceBySlug, useWorkspace, logoURL, teamHandles } from './workspaces.js';
import { render as renderDrawing, normalize as normalizeDrawing, MOTIFS, LOOKS, TONES } from './covers.js';
import { landingPage } from './landing.js';
import { srcsetFor } from './media.js';

const PAGE_SIZE = 12;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

// ---------- Holm's injected head (icons, manifest, analytics, sign-in sync) ----------

export async function holmBits(env, origin) {
  let html = '';
  try {
    const res = await env.holm.web.fetch(new Request(origin + '/shell', { headers: { accept: 'text/html' } }));
    if (res.ok) html = await res.text();
  } catch { html = ''; }
  const head = [];
  const foot = [];
  const scripts = [];
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']?(icon|apple-touch-icon|manifest|mask-icon)["']?[^>]*>/gi)) head.push(m[0]);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(m[1])) continue;
    foot.push(`<script${m[1].replace(/\snonce=["'][^"']*["']/i, '')}>${m[2]}</script>`);
    scripts.push(m[2]);
  }
  // Holm may point icons and the analytics beacon at the node's admin host; allow its origin.
  const origins = new Set();
  for (const m of (head.join(' ') + foot.join(' ')).matchAll(/https?:\/\/[a-z0-9.:-]+/gi)) origins.add(m[0]);
  return { head: head.join('\n'), foot: foot.join('\n'), scripts, origins: [...origins] };
}

// Pages allow their inline scripts by hash, not a per-response nonce, so one rendering can be
// cached and answered with 304s.
export const THEME_SCRIPT = "try{var t=localStorage.getItem('margin.theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}";
const hashes = new Map();
export async function scriptHashes(codes) {
  const out = [];
  for (const code of codes) {
    if (!hashes.has(code)) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
      hashes.set(code, `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
    }
    out.push(hashes.get(code));
  }
  return out;
}

// The feedback form (feedback.zyt.app): Margin keeps a copy of its embed.js, loaded on demand.
export const FEEDBACK_ORIGIN = 'https://feedback.zyt.app';

export function csp(hashList, host, extra = []) {
  const more = extra.length ? ' ' + extra.join(' ') : '';
  return [
    "default-src 'self'",
    `script-src 'self' ${hashList.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${more}`,
    "media-src 'self' https:",
    "font-src 'self' data:",
    `frame-src ${EMBED_ORIGINS.join(' ')} ${FEEDBACK_ORIGIN}`,
    `connect-src 'self' wss://${host} ws://${host} ${FEEDBACK_ORIGIN}${more}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// ---------- scope: a workspace, or Margin itself (for /@handle pages) ----------

function wsScope(env, ws) {
  return {
    ws, slug: ws.slug, name: ws.name, tagline: ws.tagline || '', description: ws.description || '',
    theme: ws.theme || 'quiet', themeSettings: ws.themeSettings || {}, logo: logoURL(ws), nav: ws.nav || [],
    home_url: `/${ws.slug}`, latest_url: `/${ws.slug}/latest`, feed_url: `/${ws.slug}/feed.xml`, home_is_blog: String(ws.home || '').startsWith('@'),
  };
}

function marginScope(env) {
  const m = marginSettings(env);
  return {
    ws: null, slug: null, name: m.name, tagline: m.tagline || '', description: m.tagline || '',
    theme: m.theme || 'quiet', themeSettings: {}, logo: '/favicon.svg', nav: [], home_url: '/', latest_url: '/', feed_url: null, home_is_blog: false,
  };
}

// ---------- shared view ----------

function lazy(target, name, compute) {
  let value;
  let done = false;
  Object.defineProperty(target, name, { enumerable: true, get() { if (!done) { value = compute(); done = true; } return value; } });
}

function featuredPosts(env, ctx, scope) {
  if (!scope.ws) return [];
  const byId = new Map(published(env, ctx, scope.slug).map((p) => [p.id, p]));
  return (scope.ws.featured || []).map((id) => byId.get(id)).filter(Boolean);
}

function query(env, ctx, scope, q, current) {
  let list = q.featured ? featuredPosts(env, ctx, scope) : published(env, ctx, scope.slug);
  if (q.blog) list = list.filter((p) => p.blog === String(q.blog).replace(/^@/, ''));
  if (q.tag) list = list.filter((p) => (p.tags || []).includes(String(q.tag)));
  if (q.exclude_current && current) list = list.filter((p) => p.id !== current.id);
  const offset = int(q.offset, 0, 0, 500);
  const limit = int(q.limit, 6, 1, 24);
  return list.slice(offset, offset + limit).map((p) => cardDTO(env, ctx, p));
}

function related(env, ctx, post, limit) {
  const tags = new Set(post.tags || []);
  const scored = published(env, ctx, post.ws).filter((p) => p.id !== post.id).map((p) => {
    let score = (p.tags || []).filter((t) => tags.has(t)).length * 3;
    if (p.blog === post.blog) score += 1;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.p.publishedAt - a.p.publishedAt);
  return scored.slice(0, limit).map((x) => cardDTO(env, ctx, x.p));
}

function baseView(env, ctx, scope, theme, origin, template, extra) {
  const margin = marginSettings(env);
  const view = {
    site: {
      name: scope.name, initial: (scope.name || '?').trim().charAt(0).toUpperCase(), tagline: scope.tagline, description: scope.description,
      url: origin + scope.home_url, home_url: scope.home_url, latest_url: scope.latest_url, feed_url: scope.feed_url || null, locale: 'en',
      home_is_blog: scope.home_is_blog, logo: scope.logo, slug: scope.slug,
      nav: (scope.nav || []).map((n) => ({ label: n.label, url: n.url })), has_nav: !!(scope.nav && scope.nav.length),
    },
    platform: { name: margin.name, url: '/', start_url: '/new' },
    theme: { id: theme.id, name: theme.name, assets: theme.assets, settings: settingValues(theme, (scope.themeSettings || {})[theme.id]) },
    year: new Date().getUTCFullYear(),
    ...extra,
  };
  lazy(view, 'latest', () => query(env, ctx, scope, { limit: 12 }));
  lazy(view, 'featured', () => query(env, ctx, scope, { featured: true, limit: 6 }));
  lazy(view, 'writers', () => {
    if (!scope.ws) return [];
    const counts = new Map();
    for (const p of published(env, ctx, scope.slug)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
    return [...counts.keys()].map((h) => blogByHandle(env, h)).filter(Boolean)
      .map((b) => ({ ...blogDTO(b, scope.slug), posts: counts.get(b.handle), posts_label: `${counts.get(b.handle)} post${counts.get(b.handle) === 1 ? '' : 's'}` }))
      .sort((a, b) => b.posts - a.posts);
  });
  lazy(view, 'tags', () => {
    if (!scope.ws) return [];
    const counts = new Map();
    for (const p of published(env, ctx, scope.slug)) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, posts]) => ({ name, url: `/${scope.slug}/tag/${name}`, posts }));
  });
  const q = {};
  for (const [name, spec] of Object.entries((theme.queries || {})[template] || {})) lazy(q, name, () => query(env, ctx, scope, spec, extra.__current));
  view.q = q;
  delete view.__current;
  return view;
}

export function absolute(origin, url) { return !url ? '' : /^https?:/.test(url) ? url : origin + url; }

function head(env, ctx, scope, theme, origin, page, bits, v, ld) {
  const values = settingValues(theme, (scope.themeSettings || {})[theme.id]);
  const colors = theme.settings.filter((s) => s.type === 'color').map((s) => `--${s.key.replace(/_/g, '-')}:${values[s.key]}`).join(';');
  // A workspace with a logo uses it as the tab icon.
  const icons = scope.logo ? bits.head.replace(/<link\b[^>]*\brel=["']?icon["']?[^>]*>/gi, '') + `\n<link rel="icon" href="${escapeHTML(scope.logo)}">` : bits.head;
  const tags = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHTML(page.title)}</title>`,
    `<meta name="description" content="${escapeHTML(page.description || '')}">`,
    `<link rel="canonical" href="${escapeHTML(page.canonical)}">`,
    `<meta property="og:site_name" content="${escapeHTML(scope.name)}">`,
    `<meta property="og:type" content="${page.type === 'post' ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${escapeHTML(page.og_title || page.title)}">`,
    `<meta property="og:description" content="${escapeHTML(page.description || '')}">`,
    `<meta property="og:url" content="${escapeHTML(page.canonical)}">`,
    page.image ? `<meta property="og:image" content="${escapeHTML(absolute(origin, page.image))}">` : `<meta property="og:image" content="${escapeHTML(origin)}/social_preview.png">`,
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
    page.published ? `<meta property="article:published_time" content="${page.published}">` : '',
    page.noindex ? '<meta name="robots" content="noindex">' : '',
    scope.feed_url ? `<link rel="alternate" type="application/rss+xml" title="${escapeHTML(scope.name)}" href="${escapeHTML(scope.feed_url)}">` : '',
    page.feed && page.feed !== scope.feed_url ? `<link rel="alternate" type="application/rss+xml" title="${escapeHTML(page.feed_title || '')}" href="${escapeHTML(page.feed)}">` : '',
    icons,
    `<link rel="stylesheet" href="/v/${v}/margin/ui.css">`,
    ...(page.styles || []).map((href) => `<link rel="stylesheet" href="/v/${v}${href}">`),
    colors ? `<style>:root{${colors}}</style>` : '',
    `<script>${THEME_SCRIPT}</script>`,
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
  ];
  return tags.filter(Boolean).join('\n');
}

export function foot(boot, bits, v) {
  return [
    `<script type="application/json" id="m-boot">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>`,
    `<script type="module" src="/v/${v}/margin/reader.js"></script>`,
    bits.foot,
  ].join('\n');
}

const HOLM_MARK = '<svg viewBox="0 0 32 32" width="12" height="12" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4.667 0h22.666A4.667 4.667 0 0 1 32 4.667v22.666A4.667 4.667 0 0 1 27.333 32H4.667A4.667 4.667 0 0 1 0 27.333V4.667A4.667 4.667 0 0 1 4.667 0ZM6.75 16h18.5c.414 0 .75.336.75.75v10.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75v4.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-10.5c0-.414.336-.75.75-.75Zm0-12h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Zm14 0h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Z"/></svg>';
export const HOLM_LINK = `<a class="m-holm" href="https://holmhq.com" target="_blank" rel="noopener">${HOLM_MARK}<span>A Holm app</span></a>`;
export const FEEDBACK_BUTTON = '<button type="button" class="m-feedback" data-m-feedback aria-label="Send feedback"><span class="m-long">Send feedback</span><span class="m-short">Feedback</span></button>';

// {{{margin.credit}}}: the line every theme's footer carries.
function credit(margin) {
  return `<span class="m-credit"><a href="/">Written on ${escapeHTML(margin.name)}</a>${HOLM_LINK}${FEEDBACK_BUTTON}</span>`;
}

export const ACCOUNT = '<div class="m-account" data-m-account><a class="m-avatar-button" href="/auth/login" aria-label="Sign in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></a></div>';

const CLAP_ICON = '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M188.87 65a18 18 0 0 0-31.25 18l-24.26-42a18 18 0 0 0-31.22 18L96.4 49a18 18 0 0 0-31.22 18l3.34 5.77A26 26 0 0 0 39.74 111l3 5.2A26 26 0 0 0 23.5 155l35.27 61a80.14 80.14 0 0 0 149.52-39.57a71.92 71.92 0 0 0 1.71-74.85Zm1.2 127.56A64.12 64.12 0 0 1 72.65 208l-35.27-61a10 10 0 0 1 17.34-10L75 172a8 8 0 0 0 13.87-8l-35.25-61A10 10 0 0 1 71 93l31.81 55a8 8 0 0 0 13.87-8l-26-45a10 10 0 0 1 17.35-10l36.5 63a8 8 0 0 0 13.87-8l-12.6-21.75a10 10 0 0 1 17.64-9.25l20.22 35a63.52 63.52 0 0 1 6.41 48.57ZM160.22 24V8a8 8 0 0 1 16 0v16a8 8 0 0 1-16 0m33.22 6l8-13.1a8 8 0 0 1 13.68 8.33l-8 13.11a8 8 0 0 1-6.84 3.83A8 8 0 0 1 193.44 30m45 33.66l-15.05 4.85a8.2 8.2 0 0 1-2.46.39a8 8 0 0 1-2.46-15.62l15.06-4.85a8 8 0 1 1 4.91 15.23"/></svg>';
const COMMENT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092a10 10 0 1 0-4.777-4.719"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v13m4-9l-4-4l-4 4m-4 6v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>';

function actions(card) {
  return `<div class="m-actions" data-m-actions data-post="${card.id}">`
    + `<button type="button" class="m-action m-clap" data-m-clap aria-label="Clap"><span class="m-clap-icon">${CLAP_ICON}</span><span class="m-count" data-m-clap-count>${card.claps || ''}</span></button>`
    + `<a class="m-action m-comment-count" href="#responses" data-m-open-comments aria-label="Responses">${COMMENT_ICON}<span class="m-count">${card.comments || ''}</span></a>`
    + `<span class="m-actions-gap"></span>`
    + `<button type="button" class="m-action m-share" data-m-share aria-label="Share">${SHARE_ICON}</button>`
    + '</div>';
}

function avatarImg(author, size = 32) {
  const src = author.avatar;
  return src ? `<img class="m-avatar" src="${escapeHTML(src)}" alt="" width="${size}" height="${size}" loading="lazy">`
    : `<span class="m-avatar m-avatar-empty" style="width:${size}px;height:${size}px"></span>`;
}

function commentsSection(list, card, signin) {
  const roots = list.filter((c) => !c.parent_id);
  const replies = new Map();
  for (const c of list) if (c.parent_id) (replies.get(c.parent_id) || replies.set(c.parent_id, []).get(c.parent_id)).push(c);
  const one = (c, reply) => `<article class="m-response${reply ? ' m-reply' : ''}" id="c-${c.id}" data-comment="${c.id}">`
    + `<header class="m-response-head">${avatarImg(c.author, reply ? 24 : 32)}<span class="m-response-name">${c.author.url ? `<a href="${escapeHTML(c.author.url)}">${escapeHTML(c.author.name)}</a>` : escapeHTML(c.author.name)}</span>${c.author.is_author ? '<span class="m-badge">Author</span>' : ''}<time datetime="${c.created_at}">${dates(Date.parse(c.created_at)).short}</time></header>`
    + (c.quote ? `<blockquote class="m-response-quote">${escapeHTML(c.quote.exact)}</blockquote>` : '')
    + `<div class="m-response-body">${c.body_html}</div></article>`;
  let html = '';
  for (const c of roots) {
    html += `<div class="m-thread">${one(c, false)}${(replies.get(c.id) || []).map((r) => one(r, true)).join('')}</div>`;
  }
  return `<section class="m-responses" id="responses" data-m-comments data-post="${card.id}">`
    + `<h2 class="m-responses-title">Responses${card.comments ? ` <span class="m-count">(${card.comments})</span>` : ''}</h2>`
    + `<div class="m-composer-slot" data-m-composer><a class="m-signin-link" href="${escapeHTML(signin)}">Sign in to respond</a></div>`
    + `<div class="m-thread-list" data-m-threads>${html || '<p class="m-empty" data-m-empty>No responses yet.</p>'}</div>`
    + '</section>';
}

function cardHTML(card) {
  return `<a class="m-postcard" href="${escapeHTML(card.url)}">`
    + (card.cover ? `<span class="m-postcard-cover"><img src="${escapeHTML(card.cover.url)}"${card.cover.srcset ? ` srcset="${escapeHTML(card.cover.srcset)}" sizes="160px"` : ''} alt="" loading="lazy"></span>` : '')
    + `<span class="m-postcard-text"><span class="m-postcard-blog">${escapeHTML(card.blog.name)}</span>`
    + `<span class="m-postcard-title">${escapeHTML(card.title)}</span>`
    + `<span class="m-postcard-desc">${escapeHTML(card.description)}</span>`
    + `<span class="m-postcard-meta">${escapeHTML(card.date)} · ${escapeHTML(card.reading_time)}</span></span></a>`;
}

// Resolve any post address on Margin: /ws/@h/slug, /ws/slug or the short /@h/slug.
export function postAtPath(env, path) {
  let m = /^\/(?:([a-z0-9_-]+)\/)?@([a-z0-9_-]+)\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const post = findByPath(env, m[2], m[3]);
    return post && (!m[1] || post.ws === m[1]) ? post : null;
  }
  m = /^\/([a-z0-9_-]+)\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const post = findByPath(env, m[1], m[2]);
    return post && post.ws === m[1] && post.blog === m[1] ? post : null;
  }
  return null;
}

function fillCards(env, ctx, html) {
  if (!html.includes('<!--m-card:')) return html;
  return html.replace(/<!--m-card:([^>]*?)-->[\s\S]*?<!--\/m-card-->/g, (all, path) => {
    const post = postAtPath(env, path);
    if (!post || post.status !== 'published') return all.replace(/<!--[\s\S]*?-->/g, '');
    return cardHTML(cardDTO(env, ctx, post));
  });
}

// ---------- page builders ----------

async function respond(env, ctx, request, scope, template, data) {
  const url = new URL(request.url);
  const origin = url.origin;
  let themeId = scope.theme;
  const preview = url.searchParams.get('theme');
  // Studio's Preview links here; the workspace's owners and admins may try any theme.
  if (preview && !ctx.admin && ctx.member && scope.slug && !ctx.ws) {
    const ws = workspaceBySlug(env, scope.slug);
    if (ws) useWorkspace(env, ctx, ws);
  }
  if (preview && (ctx.admin || ctx.wsAdmin)) themeId = preview;
  const theme = loadTheme(env, ctx, themeId);
  const v = await assetVersion(env, origin);
  const tag = preview || data.private ? null : await pageTag(env, url);
  const bits = await holmBits(env, origin);
  const signin = env.holm.auth.getLoginURL(url.pathname + url.search);
  const page = { type: template, ...data.page, url: url.pathname, canonical: origin + (data.page.path || url.pathname) };
  const boot = { page: template, layout: theme.comments, signin, ws: scope.slug, ...(data.boot || {}) };
  const view = baseView(env, ctx, scope, theme, origin, template, data.view);
  const assets = (t) => (t.builtIn ? `/v/${v}${t.assets}` : t.assets);
  view.theme.assets = assets(theme);
  view.page = page;
  view.margin = {
    head: head(env, ctx, scope, theme, origin, page, bits, v, data.ld),
    foot: foot(boot, bits, v),
    account: ACCOUNT,
    credit: credit(marginSettings(env)),
    actions: data.actions || '',
    comments: data.comments || '',
  };
  let html;
  try { html = renderPage(theme, template, view); } catch (error) {
    console.error('theme render failed', theme.id, template, String(error && error.message || error).slice(0, 300));
    const fallback = loadTheme(env, ctx, 'quiet');
    view.theme = { ...view.theme, id: fallback.id, assets: assets(fallback) };
    html = renderPage(fallback, template, view);
  }
  const policy = csp(await scriptHashes([THEME_SCRIPT, ...bits.scripts]), url.host, bits.origins);
  const status = data.status || 200;
  if (!tag) {
    return new Response(html, { status, headers: { ...pageHeaders(null, policy), 'Cache-Control': 'private, no-store' } });
  }
  // Margin's admins also see suspended workspaces, so their pages never fill the cache.
  if (status === 200 && !ctx.admin && request.method === 'GET') storePage(env, tag, html, policy);
  return new Response(html, { status, headers: pageHeaders(status === 200 ? tag : null, policy, 'miss') });
}

function paginate(list, url) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = int(url.searchParams.get('page'), 1, 1, pages);
  const at = (n) => (n === 1 ? url.pathname : `${url.pathname}?page=${n}`);
  return {
    slice: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    pagination: { page, pages, has_prev: page > 1, has_next: page < pages, prev_url: page > 1 ? at(page - 1) : null, next_url: page < pages ? at(page + 1) : null, many: pages > 1 },
  };
}

function titleOf(scope) { return scope.tagline ? `${scope.name} — ${scope.tagline}` : scope.name; }

async function wsHomePage(env, ctx, request, scope) {
  const url = new URL(request.url);
  const home = String(scope.ws.home || 'latest');
  if (home.startsWith('@')) {
    const blog = blogByHandle(env, home.slice(1));
    if (blog) return blogPage(env, ctx, request, scope, blog, { home: true });
  }
  let list = published(env, ctx, scope.slug);
  if (home === 'curated') {
    const pinned = featuredPosts(env, ctx, scope);
    const ids = new Set(pinned.map((p) => p.id));
    list = [...pinned, ...list.filter((p) => !ids.has(p.id))];
  }
  const { slice, pagination } = paginate(list, url);
  return respond(env, ctx, request, scope, 'home', {
    page: { title: titleOf(scope), description: scope.description || scope.tagline, path: scope.home_url },
    view: { posts: slice.map((p) => cardDTO(env, ctx, p)), pagination },
    ld: { '@context': 'https://schema.org', '@type': 'Blog', name: scope.name, description: scope.description, url: url.origin + scope.home_url },
  });
}

async function blogPage(env, ctx, request, scope, blog, options = {}) {
  const url = new URL(request.url);
  const list = scope.ws ? published(env, ctx, scope.slug).filter((p) => p.blog === blog.handle) : published(env, ctx, null).filter((p) => p.blog === blog.handle);
  const { slice, pagination } = paginate(list, url);
  const dto = blogDTO(blog, scope.slug);
  const path = options.home ? scope.home_url : dto.url;
  return respond(env, ctx, request, scope, 'blog', {
    page: {
      title: options.home ? titleOf(scope) : `${blog.name} — ${scope.name}`,
      description: blog.bio || scope.description, path, image: null, feed: dto.feed_url, feed_title: blog.name,
    },
    view: { blog: { ...dto, posts: list.length }, posts: slice.map((p) => cardDTO(env, ctx, p)), pagination },
    ld: { '@context': 'https://schema.org', '@type': 'ProfilePage', name: blog.name, description: blog.bio || '', url: url.origin + path },
  });
}

async function listPage(env, ctx, request, scope, kind, value) {
  const url = new URL(request.url);
  let list = published(env, ctx, scope.slug);
  let title = 'Latest';
  let description = `Everything new on ${scope.name}.`;
  if (kind === 'tag') {
    list = list.filter((p) => (p.tags || []).includes(value));
    title = value.replace(/-/g, ' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    description = `Posts tagged ${title} on ${scope.name}.`;
    if (!list.length) return errorPage(env, ctx, request, scope, 404);
  }
  const { slice, pagination } = paginate(list, url);
  return respond(env, ctx, request, scope, 'list', {
    page: { title: `${title} — ${scope.name}`, description, path: url.pathname },
    view: { list: { title, description, kind, tag: kind === 'tag' ? value : null, count: list.length }, posts: slice.map((p) => cardDTO(env, ctx, p)), pagination },
  });
}

// Photos in a post choose from their smaller copies, however long ago the post was saved.
const FIGURE_IMG = /<figure class="m-figure( m-wide| m-full)?"><img src="\/media\/([a-z0-9]{6,20})\.(jpg|png|webp)" ([^>]*?)width="(\d+)" height="(\d+)">/g;
const SIZES = { '': '(min-width: 760px) 720px, 100vw', ' m-wide': '(min-width: 1100px) 1080px, 100vw', ' m-full': '100vw' };
function responsive(html) {
  return html.replace(FIGURE_IMG, (all, wide = '', id, ext, rest, w) => {
    const srcset = /srcset=/.test(rest) ? '' : srcsetFor(id, { width: Number(w), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' });
    return srcset ? all.replace(' width=', ` srcset="${srcset}" sizes="${SIZES[wide]}" width=`) : all;
  });
}

export async function postPage(env, ctx, request, scope, post, options = {}) {
  const url = new URL(request.url);
  const blog = blogByHandle(env, post.blog);
  const card = cardDTO(env, ctx, post);
  const body = bodyOf(env, post);
  const html = responsive(fillCards(env, ctx, body ? body.html : ''));
  const comments = post.status === 'published' ? publicComments(env, ctx, post) : [];
  const signin = env.holm.auth.getLoginURL(url.pathname);
  const list = published(env, ctx, post.ws).filter((p) => p.blog === post.blog);
  const index = list.findIndex((p) => p.id === post.id);
  const neighbour = (p) => (p ? cardDTO(env, ctx, p) : null);
  const view = {
    post: { ...card, cover: card.cover && card.cover.drawn ? { ...card.cover, url: card.cover.full_url } : card.cover, body: `<div class="m-body" data-m-body>${html}</div>`, is_updated: post.updatedAt - (post.publishedAt || 0) > 86400000 },
    blog: blog ? blogDTO(blog, post.ws) : card.blog,
    newer: index > 0 ? neighbour(list[index - 1]) : null,
    older: index >= 0 ? neighbour(list[index + 1]) : null,
    comments: { count: card.comments, list: comments },
    __current: post,
  };
  const image = card.cover ? card.cover.image : null;
  const out = {
    page: {
      title: `${post.title} — ${blog ? blog.name : scope.name}`, og_title: post.title,
      description: card.description, path: card.url, image,
      published: card.date_iso, noindex: !!options.preview, styles: html.includes('class="katex') ? ['/vendor/katex/katex.css'] : [], feed: blog ? blogDTO(blog, post.ws).feed_url : null, feed_title: blog ? blog.name : '',
    },
    view,
    actions: post.status === 'published' ? actions(card) : '',
    comments: post.status === 'published' ? commentsSection(comments, card, signin) : '',
    boot: { post: post.id, blog: post.blog, title: post.title, draft: post.status !== 'published', drawing: card.cover && card.cover.drawn ? card.cover.drawing : null },
    private: !!options.preview,
    ld: {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: card.description,
      datePublished: card.date_iso, dateModified: card.updated_iso, mainEntityOfPage: url.origin + card.url,
      image: image ? absolute(url.origin, image) : undefined,
      author: { '@type': blog && blog.kind === 'workspace' ? 'Organization' : 'Person', name: card.blog.name, url: url.origin + card.blog.url },
      publisher: { '@type': 'Organization', name: scope.name },
      wordCount: post.words || undefined,
    },
  };
  lazy(view, 'related', () => related(env, ctx, post, 3));
  lazy(view, 'more', () => list.filter((p) => p.id !== post.id).slice(0, 3).map((p) => cardDTO(env, ctx, p)));
  return respond(env, ctx, request, scope, 'post', out);
}

export async function errorPage(env, ctx, request, scope, status) {
  const messages = {
    404: ['Page not found', "We couldn't find that page. It may have moved, or the link may be wrong."],
    403: ['Not available', "You don't have access to this page."],
  };
  const [title, message] = messages[status] || ['Something went wrong', 'Try again in a moment.'];
  const s = scope || marginScope(env);
  return respond(env, ctx, request, s, 'error', {
    status,
    page: { title: `${title} — ${s.name}`, description: message, noindex: true },
    view: { error: { status, title, message } },
    private: true,
  });
}

function redirect(location, status = 301) {
  return new Response(null, { status, headers: { Location: location, 'Cache-Control': 'public, max-age=300' } });
}

// ---------- feeds, sitemap, robots, avatars, drawings ----------

function absolutize(html, origin) {
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
}

function feed(env, ctx, request, scope, blog) {
  const origin = new URL(request.url).origin;
  let list = published(env, ctx, scope.slug);
  if (blog) list = list.filter((p) => p.blog === blog.handle);
  list = list.slice(0, 30);
  const title = blog ? `${blog.name} — ${scope.name}` : scope.name;
  const link = origin + (blog ? blogDTO(blog, scope.slug).url : scope.home_url);
  const items = list.map((p) => {
    const card = cardDTO(env, ctx, p);
    const body = bodyOf(env, p);
    const content = absolutize(fillCards(env, ctx, body ? body.html : ''), origin);
    const img = !card.cover ? null : card.cover.drawn ? card.cover.image || card.cover.url : card.cover.url;
    const coverTag = img ? `<p><img src="${escapeHTML(absolute(origin, img))}" alt=""></p>` : '';
    return `<item><title>${escapeHTML(p.title)}</title><link>${origin}${card.url}</link><guid isPermaLink="false">${p.id}</guid>`
      + `<pubDate>${rfc822(p.publishedAt)}</pubDate><dc:creator>${escapeHTML(card.blog.name)}</dc:creator>`
      + `<description>${escapeHTML(card.description)}</description>`
      + (p.tags || []).map((t) => `<category>${escapeHTML(t)}</category>`).join('')
      + `<content:encoded><![CDATA[${(coverTag + content).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>`
    + `<title>${escapeHTML(title)}</title><link>${link}</link><description>${escapeHTML((blog && blog.bio) || scope.description || '')}</description>`
    + `<atom:link href="${origin}${new URL(request.url).pathname}" rel="self" type="application/rss+xml"/><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

function sitemap(env, ctx, request) {
  const origin = new URL(request.url).origin;
  const list = published(env, ctx, null);
  const urls = new Set([`${origin}/`]);
  for (const p of list) urls.add(`${origin}/${p.ws}`);
  const entries = [...urls].map((u) => `<url><loc>${escapeHTML(u)}</loc></url>`);
  for (const p of list) entries.push(`<url><loc>${origin}${postPath(p)}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

function robots(request) {
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nDisallow: /studio\nDisallow: /api/\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

const DRAWING = new RegExp(`^/c/(${MOTIFS.join('|')})-(${LOOKS.join('|')})-(${Object.keys(TONES).join('|')})-(\\d{1,4})\\.svg$`);

function drawingResponse(spec, labels) {
  return new Response(renderDrawing(normalizeDrawing(spec), null, { labels }), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---------- router ----------

function suspendedFor(ctx, ws) { return ws.suspended && !ctx.admin; }

export async function page(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  const margin = marginSettings(env);

  if (path === '/') {
    if (margin.home.startsWith('ws:')) {
      const ws = workspaceBySlug(env, margin.home.slice(3));
      if (ws && !suspendedFor(ctx, ws)) return wsHomePage(env, ctx, request, wsScope(env, ws));
    }
    if (margin.home.startsWith('@')) {
      const blog = blogByHandle(env, margin.home.slice(1));
      if (blog) return blogPage(env, ctx, request, marginScope(env), blog);
    }
    return landingPage(env, ctx, request, { holmBits, scriptHashes, THEME_SCRIPT, assetVersion, pageHeaders, csp, foot, ACCOUNT, HOLM_LINK, FEEDBACK_BUTTON });
  }
  if (path === '/sitemap.xml') return sitemap(env, ctx, request);
  if (path === '/robots.txt') return robots(request);

  let m = /^\/a\/([a-z0-9_-]+)\.svg$/.exec(path);
  if (m) {
    return new Response(avatarSVG(blogByHandle(env, m[1]) || { handle: m[1], name: m[1] }), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    });
  }
  m = DRAWING.exec(path);
  if (m) return drawingResponse({ motif: m[1], look: m[2], tone: m[3], seed: Number(m[4]) }, url.searchParams.get('labels') !== '0');

  // /@handle: a writer across Margin, and the short address of their posts.
  m = /^\/@([a-z0-9_-]+)(?:\/(feed\.xml|[a-z0-9-]+))?$/.exec(path);
  if (m && HANDLE.test(m[1])) {
    const blog = blogByHandle(env, m[1]);
    if (!blog) return errorPage(env, ctx, request, null, 404);
    if (blog.kind === 'workspace') return redirect(`/${blog.ws}${m[2] === 'feed.xml' ? '/feed.xml' : m[2] ? '/' + m[2] : ''}`);
    if (m[2] === 'feed.xml') return feed(env, ctx, request, marginScope(env), blog);
    if (!m[2]) return blogPage(env, ctx, request, marginScope(env), blog);
    const post = findByPath(env, blog.handle, m[2]);
    if (!post || post.status !== 'published') return errorPage(env, ctx, request, null, 404);
    return redirect(postPath(post) + url.search);
  }

  m = /^\/studio\/preview\/([A-Za-z0-9_-]+)$/.exec(path);
  if (m) {
    const post = postById(env, m[1]);
    if (!post || !canEdit(env, ctx, post)) return errorPage(env, ctx, request, null, 404);
    const ws = wsCached(env, ctx, post.ws);
    return postPage(env, ctx, request, wsScope(env, ws), post, { preview: true });
  }

  // /<workspace>/…
  m = /^\/([a-z0-9_-]+)(?:\/(.*))?$/.exec(path);
  if (!m || !HANDLE.test(m[1])) return null;
  const ws = workspaceBySlug(env, m[1]);
  if (!ws) return movedOrNull(env, path);
  if (suspendedFor(ctx, ws)) return errorPage(env, ctx, request, null, 404);
  ctx.cache.set('ws:' + ws.slug, ws);
  const scope = wsScope(env, ws);
  const rest = m[2] || '';
  if (!rest) return wsHomePage(env, ctx, request, scope);
  if (rest === 'latest') return listPage(env, ctx, request, scope, 'latest');
  if (rest === 'feed.xml') return feed(env, ctx, request, scope, null);
  let r = /^tag\/([a-z0-9-]{1,30})$/.exec(rest);
  if (r) return listPage(env, ctx, request, scope, 'tag', r[1]);
  r = /^@([a-z0-9_-]+)(?:\/(feed\.xml|[a-z0-9-]+))?$/.exec(rest);
  if (r && HANDLE.test(r[1])) {
    const blog = blogByHandle(env, r[1]);
    if (!blog) return errorPage(env, ctx, request, scope, 404);
    if (blog.kind === 'workspace') return redirect(`/${blog.ws}${r[2] && r[2] !== 'feed.xml' ? '/' + r[2] : ''}`);
    if (r[2] === 'feed.xml') return feed(env, ctx, request, scope, blog);
    if (!r[2]) {
      if (!teamHandles(env, ctx, ws.slug).has(blog.handle)) return errorPage(env, ctx, request, scope, 404);
      return blogPage(env, ctx, request, scope, blog);
    }
    const post = findByPath(env, blog.handle, r[2]);
    return servePost(env, ctx, request, scope, post, path, url);
  }
  r = /^([a-z0-9][a-z0-9-]*)$/.exec(rest);
  if (r && SLUG.test(r[1])) {
    const post = findByPath(env, ws.slug, r[1]);
    return servePost(env, ctx, request, scope, post && post.ws === ws.slug ? post : null, path, url);
  }
  return movedOrNull(env, path) || errorPage(env, ctx, request, scope, 404);
}

function servePost(env, ctx, request, scope, post, path, url) {
  if (!post) return movedOrNull(env, path) || errorPage(env, ctx, request, scope, 404);
  if (post.status !== 'published') return canEdit(env, ctx, post) ? redirect(`/studio/preview/${post.id}`, 302) : errorPage(env, ctx, request, scope, 404);
  const canonical = postPath(post);
  if (canonical !== path) return redirect(canonical + url.search);
  return postPage(env, ctx, request, scope, post);
}

function movedOrNull(env, path) {
  const moved = env.holm.app.kv.get('redirect:' + path);
  if (!moved) return null;
  const target = typeof moved === 'string' && moved.startsWith('post:') ? postById(env, moved.slice(5)) : null;
  if (target && target.status === 'published') return redirect(postPath(target));
  if (typeof moved === 'string' && moved.startsWith('/')) return redirect(moved);
  return null;
}

// Link previews: the card for any post address on Margin.
export function cards(env, ctx, request) {
  const url = new URL(request.url);
  const out = [];
  for (const raw of url.searchParams.getAll('url').slice(0, 20)) {
    let path;
    try { path = new URL(raw, url.origin).pathname.replace(/\/+$/, ''); } catch { continue; }
    const post = postAtPath(env, path);
    if (post && post.status === 'published') out.push({ url: raw, card: cardDTO(env, ctx, post) });
  }
  return out;
}
