// Reading pages, rendered on the server through the active theme: home, a blog, a post,
// the team feed, tags, errors, feeds and the sitemap. Everything a reader needs is in the
// HTML; /margin/reader.js only adds comments, claps, the account menu and link previews.
import { escapeHTML, dates, rfc822, int } from './lib/util.js';
import { siteRev } from './lib/store.js';
import { siteSettings, homeHandle } from './settings.js';
import { allBlogs, blogByHandle, blogDTO, avatarSVG, HANDLE } from './blogs.js';
import { published, findByPath, postById, bodyOf, cardDTO, canEdit, postPath } from './posts.js';
import { publicComments } from './comments.js';
import { loadTheme, renderPage, settingValues } from './themes.js';
import { EMBED_ORIGINS } from './markdown.js';

export const VERSION = '0.1.0';
const PAGE_SIZE = 12;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

// ---------- Holm's injected head (icons, manifest, analytics, sign-in sync) ----------

async function holmBits(env, origin, nonce) {
  let html = '';
  try {
    const res = await env.holm.web.fetch(new Request(origin + '/shell', { headers: { accept: 'text/html' } }));
    if (res.ok) html = await res.text();
  } catch { html = ''; }
  const head = [];
  const foot = [];
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']?(icon|apple-touch-icon|manifest|mask-icon)["']?[^>]*>/gi)) head.push(m[0]);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(m[1])) continue;
    foot.push(`<script nonce="${nonce}"${m[1].replace(/\snonce=["'][^"']*["']/i, '')}>${m[2]}</script>`);
  }
  // Holm may point icons and the analytics beacon at the node's admin host; allow its origin.
  const origins = new Set();
  for (const m of (head.join(' ') + foot.join(' ')).matchAll(/https?:\/\/[a-z0-9.:-]+/gi)) origins.add(m[0]);
  return { head: head.join('\n'), foot: foot.join('\n'), origins: [...origins] };
}

function nonceValue() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
}

function csp(nonce, host, extra = []) {
  const more = extra.length ? ' ' + extra.join(' ') : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${more}`,
    "media-src 'self' https:",
    "font-src 'self' data:",
    `frame-src ${EMBED_ORIGINS.join(' ')}`,
    `connect-src 'self' wss://${host} ws://${host}${more}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// ---------- shared view ----------

function lazy(target, name, compute) {
  let value;
  let done = false;
  Object.defineProperty(target, name, { enumerable: true, get() { if (!done) { value = compute(); done = true; } return value; } });
}

function query(env, ctx, settings, q, current) {
  let list = published(env, ctx);
  if (q.blog) list = list.filter((p) => p.blog === String(q.blog).replace(/^@/, ''));
  if (q.tag) list = list.filter((p) => (p.tags || []).includes(String(q.tag)));
  if (q.featured) list = list.filter((p) => p.featured);
  if (q.exclude_current && current) list = list.filter((p) => p.id !== current.id);
  const offset = int(q.offset, 0, 0, 500);
  const limit = int(q.limit, 6, 1, 24);
  return list.slice(offset, offset + limit).map((p) => cardDTO(env, ctx, p, settings));
}

function related(env, ctx, settings, post, limit) {
  const tags = new Set(post.tags || []);
  const scored = published(env, ctx).filter((p) => p.id !== post.id).map((p) => {
    let score = (p.tags || []).filter((t) => tags.has(t)).length * 3;
    if (p.blog === post.blog) score += 1;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.p.publishedAt - a.p.publishedAt);
  return scored.slice(0, limit).map((x) => cardDTO(env, ctx, x.p, settings));
}

function baseView(env, ctx, settings, theme, origin, template, extra) {
  const view = {
    site: {
      name: settings.name, initial: (settings.name || '?').trim().charAt(0).toUpperCase(), tagline: settings.tagline || '', description: settings.description || '',
      url: origin, home_url: '/', latest_url: '/latest', feed_url: '/feed.xml', locale: 'en',
      home_is_blog: !!homeHandle(settings), logo: settings.logo ? `/media/${settings.logo}` : null,
      nav: (settings.nav || []).map((n) => ({ label: n.label, url: n.url })), has_nav: !!(settings.nav && settings.nav.length),
    },
    theme: { id: theme.id, name: theme.name, assets: theme.assets, settings: settingValues(theme, (settings.themeSettings || {})[theme.id]) },
    year: new Date().getUTCFullYear(),
    ...extra,
  };
  lazy(view, 'latest', () => query(env, ctx, settings, { limit: 12 }));
  lazy(view, 'featured', () => query(env, ctx, settings, { featured: true, limit: 6 }));
  lazy(view, 'writers', () => {
    const counts = new Map();
    for (const p of published(env, ctx)) counts.set(p.blog, (counts.get(p.blog) || 0) + 1);
    return allBlogs(env).filter((b) => counts.has(b.handle))
      .map((b) => ({ ...blogDTO(b, settings), posts: counts.get(b.handle), posts_label: `${counts.get(b.handle)} post${counts.get(b.handle) === 1 ? '' : 's'}` }))
      .sort((a, b) => b.posts - a.posts);
  });
  lazy(view, 'tags', () => {
    const counts = new Map();
    for (const p of published(env, ctx)) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, posts]) => ({ name, url: `/tag/${name}`, posts }));
  });
  const q = {};
  for (const [name, spec] of Object.entries((theme.queries || {})[template] || {})) lazy(q, name, () => query(env, ctx, settings, spec, extra.__current));
  view.q = q;
  delete view.__current;
  return view;
}

function absolute(origin, url) { return !url ? '' : /^https?:/.test(url) ? url : origin + url; }

function head(env, ctx, settings, theme, origin, page, bits, nonce, ld) {
  const colors = theme.settings.filter((s) => s.type === 'color').map((s) => `--${s.key.replace(/_/g, '-')}:${settingValues(theme, (settings.themeSettings || {})[theme.id])[s.key]}`).join(';');
  const tags = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHTML(page.title)}</title>`,
    `<meta name="description" content="${escapeHTML(page.description || '')}">`,
    `<link rel="canonical" href="${escapeHTML(page.canonical)}">`,
    `<meta property="og:site_name" content="${escapeHTML(settings.name)}">`,
    `<meta property="og:type" content="${page.type === 'post' ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${escapeHTML(page.og_title || page.title)}">`,
    `<meta property="og:description" content="${escapeHTML(page.description || '')}">`,
    `<meta property="og:url" content="${escapeHTML(page.canonical)}">`,
    page.image ? `<meta property="og:image" content="${escapeHTML(absolute(origin, page.image))}">` : `<meta property="og:image" content="${escapeHTML(origin)}/social_preview.png">`,
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
    page.published ? `<meta property="article:published_time" content="${page.published}">` : '',
    page.noindex ? '<meta name="robots" content="noindex">' : '',
    `<link rel="alternate" type="application/rss+xml" title="${escapeHTML(settings.name)}" href="/feed.xml">`,
    page.feed ? `<link rel="alternate" type="application/rss+xml" title="${escapeHTML(page.feed_title || '')}" href="${escapeHTML(page.feed)}">` : '',
    bits.head,
    `<link rel="stylesheet" href="/margin/ui.css?v=${VERSION}">`,
    colors ? `<style>:root{${colors}}</style>` : '',
    `<script nonce="${nonce}">try{var t=localStorage.getItem('margin.theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}</script>`,
    ld ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
  ];
  return tags.filter(Boolean).join('\n');
}

function foot(boot, bits, nonce) {
  return [
    `<script type="application/json" id="m-boot">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>`,
    `<script type="module" src="/margin/reader.js?v=${VERSION}" nonce="${nonce}"></script>`,
    bits.foot,
  ].join('\n');
}

const ACCOUNT = '<div class="m-account" data-m-account><a class="m-avatar-button" href="/auth/login" aria-label="Sign in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></a></div>';

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
    + (card.cover ? `<span class="m-postcard-cover"><img src="${escapeHTML(card.cover.url)}" alt="" loading="lazy"></span>` : '')
    + `<span class="m-postcard-text"><span class="m-postcard-blog">${escapeHTML(card.blog.name)}</span>`
    + `<span class="m-postcard-title">${escapeHTML(card.title)}</span>`
    + `<span class="m-postcard-desc">${escapeHTML(card.description)}</span>`
    + `<span class="m-postcard-meta">${escapeHTML(card.date)} · ${escapeHTML(card.reading_time)}</span></span></a>`;
}

// Resolve /@h/slug or /slug to a published post, honouring the home blog.
export function postAtPath(env, settings, path) {
  let m = /^\/@([a-z0-9_-]+)\/([a-z0-9-]+)$/.exec(path);
  if (m) return findByPath(env, m[1], m[2]);
  m = /^\/([a-z0-9-]+)$/.exec(path);
  const home = homeHandle(settings);
  if (m && home) return findByPath(env, home, m[1]);
  return null;
}

function fillCards(env, ctx, settings, html) {
  if (!html.includes('<!--m-card:')) return html;
  return html.replace(/<!--m-card:([^>]*?)-->[\s\S]*?<!--\/m-card-->/g, (all, path) => {
    const post = postAtPath(env, settings, path);
    if (!post || post.status !== 'published') return all.replace(/<!--[\s\S]*?-->/g, '');
    return cardHTML(cardDTO(env, ctx, post, settings));
  });
}

// ---------- page builders ----------

async function respond(env, ctx, request, settings, template, data) {
  const url = new URL(request.url);
  const origin = url.origin;
  let themeId = settings.theme;
  const preview = url.searchParams.get('theme');
  if (preview && ctx.admin) themeId = preview;
  const theme = loadTheme(env, ctx, themeId);
  const nonce = nonceValue();
  const bits = await holmBits(env, origin, nonce);
  const signin = env.holm.auth.getLoginURL(url.pathname + url.search);
  const page = { type: template, ...data.page, url: url.pathname, canonical: origin + (data.page.path || url.pathname) };
  const boot = { page: template, layout: theme.comments, signin, home_blog: !!homeHandle(settings), ...(data.boot || {}) };
  const view = baseView(env, ctx, settings, theme, origin, template, data.view);
  view.page = page;
  view.margin = {
    head: head(env, ctx, settings, theme, origin, page, bits, nonce, data.ld),
    foot: foot(boot, bits, nonce),
    account: ACCOUNT,
    actions: data.actions || '',
    comments: data.comments || '',
  };
  let html;
  try { html = renderPage(theme, template, view); } catch (error) {
    console.error('theme render failed', theme.id, template, String(error && error.message || error).slice(0, 300));
    const fallback = loadTheme(env, ctx, 'quiet');
    view.theme = { ...view.theme, id: fallback.id, assets: fallback.assets };
    html = renderPage(fallback, template, view);
  }
  return new Response(html, {
    status: data.status || 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': preview || data.private ? 'private, no-store' : 'public, max-age=0, must-revalidate',
      'Content-Security-Policy': csp(nonce, url.host, bits.origins),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Margin-Rev': String(siteRev(env)),
    },
  });
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

async function homePage(env, ctx, request, settings) {
  const url = new URL(request.url);
  const { slice, pagination } = paginate(published(env, ctx), url);
  return respond(env, ctx, request, settings, 'home', {
    page: { title: settings.tagline ? `${settings.name} — ${settings.tagline}` : settings.name, description: settings.description, path: '/' },
    view: { posts: slice.map((p) => cardDTO(env, ctx, p, settings)), pagination },
    ld: { '@context': 'https://schema.org', '@type': 'WebSite', name: settings.name, description: settings.description, url: url.origin },
  });
}

async function blogPage(env, ctx, request, settings, blog) {
  const url = new URL(request.url);
  const list = published(env, ctx).filter((p) => p.blog === blog.handle);
  const { slice, pagination } = paginate(list, url);
  const dto = blogDTO(blog, settings);
  const isHome = homeHandle(settings) === blog.handle;
  return respond(env, ctx, request, settings, 'blog', {
    page: {
      title: isHome ? (settings.tagline ? `${settings.name} — ${settings.tagline}` : settings.name) : `${blog.name} — ${settings.name}`,
      description: blog.bio || settings.description, path: dto.url, image: null, feed: dto.feed_url, feed_title: blog.name,
    },
    view: { blog: { ...dto, posts: list.length }, posts: slice.map((p) => cardDTO(env, ctx, p, settings)), pagination },
    ld: { '@context': 'https://schema.org', '@type': 'Blog', name: blog.name, description: blog.bio || '', url: url.origin + dto.url },
  });
}

async function listPage(env, ctx, request, settings, kind, value) {
  const url = new URL(request.url);
  let list = published(env, ctx);
  let title = 'Latest';
  let description = `Everything new on ${settings.name}.`;
  if (kind === 'tag') {
    list = list.filter((p) => (p.tags || []).includes(value));
    title = value.replace(/-/g, ' ');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    description = `Posts tagged ${title} on ${settings.name}.`;
    if (!list.length) return errorPage(env, ctx, request, settings, 404);
  }
  const { slice, pagination } = paginate(list, url);
  return respond(env, ctx, request, settings, 'list', {
    page: { title: `${title} — ${settings.name}`, description, path: url.pathname },
    view: { list: { title, description, kind, tag: kind === 'tag' ? value : null, count: list.length }, posts: slice.map((p) => cardDTO(env, ctx, p, settings)), pagination },
  });
}

export async function postPage(env, ctx, request, settings, post, options = {}) {
  const url = new URL(request.url);
  const blog = blogByHandle(env, post.blog);
  const card = cardDTO(env, ctx, post, settings);
  const body = bodyOf(env, post);
  const html = fillCards(env, ctx, settings, body ? body.html : '');
  const comments = post.status === 'published' ? publicComments(env, ctx, post, settings) : [];
  const signin = env.holm.auth.getLoginURL(url.pathname);
  const list = published(env, ctx).filter((p) => p.blog === post.blog);
  const index = list.findIndex((p) => p.id === post.id);
  const neighbour = (p) => (p ? cardDTO(env, ctx, p, settings) : null);
  const view = {
    post: { ...card, body: `<div class="m-body" data-m-body>${html}</div>`, is_updated: post.updatedAt - (post.publishedAt || 0) > 86400000 },
    blog: blog ? blogDTO(blog, settings) : card.blog,
    newer: index > 0 ? neighbour(list[index - 1]) : null,
    older: index >= 0 ? neighbour(list[index + 1]) : null,
    comments: { count: card.comments, list: comments },
    __current: post,
  };
  const out = {
    page: {
      title: `${post.title} — ${blog ? blog.name : settings.name}`, og_title: post.title,
      description: card.description, path: card.url, image: card.cover ? card.cover.url : null,
      published: card.date_iso, noindex: !!options.preview, feed: blog ? blogDTO(blog, settings).feed_url : null, feed_title: blog ? blog.name : '',
    },
    view,
    actions: post.status === 'published' ? actions(card) : '',
    comments: post.status === 'published' ? commentsSection(comments, card, signin) : '',
    boot: { post: post.id, blog: post.blog, title: post.title, draft: post.status !== 'published' },
    private: !!options.preview,
    ld: {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: card.description,
      datePublished: card.date_iso, dateModified: card.updated_iso, mainEntityOfPage: url.origin + card.url,
      image: card.cover ? absolute(url.origin, card.cover.url) : undefined,
      author: { '@type': blog && blog.kind === 'persona' ? 'Organization' : 'Person', name: card.blog.name, url: url.origin + card.blog.url },
      publisher: { '@type': 'Organization', name: settings.name },
      wordCount: post.words || undefined,
    },
  };
  lazy(view, 'related', () => related(env, ctx, settings, post, 3));
  lazy(view, 'more', () => list.filter((p) => p.id !== post.id).slice(0, 3).map((p) => cardDTO(env, ctx, p, settings)));
  return respond(env, ctx, request, settings, 'post', out);
}

export async function errorPage(env, ctx, request, settings, status) {
  const messages = {
    404: ['Page not found', "We couldn't find that page. It may have moved, or the link may be wrong."],
    403: ['Not available', "You don't have access to this page."],
  };
  const [title, message] = messages[status] || ['Something went wrong', 'Try again in a moment.'];
  return respond(env, ctx, request, settings, 'error', {
    status,
    page: { title: `${title} — ${settings.name}`, description: message, noindex: true },
    view: { error: { status, title, message } },
    private: true,
  });
}

function redirect(location, status = 301) {
  return new Response(null, { status, headers: { Location: location, 'Cache-Control': 'public, max-age=300' } });
}

// ---------- feeds, sitemap, robots, avatars ----------

function absolutize(html, origin) {
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
}

function feed(env, ctx, request, settings, blog) {
  const origin = new URL(request.url).origin;
  let list = published(env, ctx);
  if (blog) list = list.filter((p) => p.blog === blog.handle);
  list = list.slice(0, 30);
  const title = blog ? `${blog.name} — ${settings.name}` : settings.name;
  const link = origin + (blog ? blogDTO(blog, settings).url : '/');
  const items = list.map((p) => {
    const card = cardDTO(env, ctx, p, settings);
    const body = bodyOf(env, p);
    const content = absolutize(fillCards(env, ctx, settings, body ? body.html : ''), origin);
    const coverTag = card.cover ? `<p><img src="${escapeHTML(absolute(origin, card.cover.url))}" alt=""></p>` : '';
    return `<item><title>${escapeHTML(p.title)}</title><link>${origin}${card.url}</link><guid isPermaLink="false">${p.id}</guid>`
      + `<pubDate>${rfc822(p.publishedAt)}</pubDate><dc:creator>${escapeHTML(card.blog.name)}</dc:creator>`
      + `<description>${escapeHTML(card.description)}</description>`
      + (p.tags || []).map((t) => `<category>${escapeHTML(t)}</category>`).join('')
      + `<content:encoded><![CDATA[${(coverTag + content).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>`
    + `<title>${escapeHTML(title)}</title><link>${link}</link><description>${escapeHTML((blog && blog.bio) || settings.description || '')}</description>`
    + `<atom:link href="${origin}${new URL(request.url).pathname}" rel="self" type="application/rss+xml"/><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

function sitemap(env, ctx, request, settings) {
  const origin = new URL(request.url).origin;
  const urls = [`${origin}/`, `${origin}/latest`];
  const list = published(env, ctx);
  const blogs = new Set(list.map((p) => p.blog));
  for (const b of allBlogs(env)) if (blogs.has(b.handle) && homeHandle(settings) !== b.handle) urls.push(`${origin}/@${b.handle}`);
  const entries = urls.map((u) => `<url><loc>${escapeHTML(u)}</loc></url>`);
  for (const p of list) entries.push(`<url><loc>${origin}${postPath(p, settings)}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod></url>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

function robots(request) {
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *\nDisallow: /studio\nDisallow: /api/\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

// ---------- router ----------

export async function page(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  const settings = siteSettings(env);
  const home = homeHandle(settings);

  if (path === '/') {
    if (home) {
      const blog = blogByHandle(env, home);
      if (blog) return blogPage(env, ctx, request, settings, blog);
    }
    return homePage(env, ctx, request, settings);
  }
  if (path === '/latest') return listPage(env, ctx, request, settings, 'latest');
  if (path === '/feed.xml') return feed(env, ctx, request, settings, null);
  if (path === '/sitemap.xml') return sitemap(env, ctx, request, settings);
  if (path === '/robots.txt') return robots(request);

  let m = /^\/tag\/([a-z0-9-]{1,30})$/.exec(path);
  if (m) return listPage(env, ctx, request, settings, 'tag', m[1]);

  m = /^\/a\/([a-z0-9_-]+)\.svg$/.exec(path);
  if (m) {
    return new Response(avatarSVG(blogByHandle(env, m[1]) || { handle: m[1], name: m[1] }), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    });
  }

  m = /^\/@([a-z0-9_-]+)(?:\/(feed\.xml|[a-z0-9-]+))?$/.exec(path);
  if (m && HANDLE.test(m[1])) {
    const blog = blogByHandle(env, m[1]);
    if (!blog) return errorPage(env, ctx, request, settings, 404);
    if (m[2] === 'feed.xml') return feed(env, ctx, request, settings, blog);
    if (!m[2]) return home === blog.handle ? redirect('/' + url.search) : blogPage(env, ctx, request, settings, blog);
    const post = findByPath(env, blog.handle, m[2]);
    if (!post) return errorPage(env, ctx, request, settings, 404);
    if (post.status !== 'published') return canEdit(env, ctx, post) ? redirect(`/studio/preview/${post.id}`, 302) : errorPage(env, ctx, request, settings, 404);
    const canonical = postPath(post, settings);
    if (canonical !== path) return redirect(canonical + url.search);
    return postPage(env, ctx, request, settings, post);
  }

  m = /^\/studio\/preview\/([A-Za-z0-9_-]+)$/.exec(path);
  if (m) {
    const post = postById(env, m[1]);
    if (!post || !canEdit(env, ctx, post)) return errorPage(env, ctx, request, settings, 404);
    return postPage(env, ctx, request, settings, post, { preview: true });
  }

  // A single segment: a post on the home blog, or an older address that moved.
  m = /^\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (m && home && SLUG.test(m[1])) {
    const post = findByPath(env, home, m[1]);
    if (post && post.status === 'published') {
      const canonical = postPath(post, settings);
      if (canonical !== path) return redirect(canonical + url.search);
      return postPage(env, ctx, request, settings, post);
    }
  }
  const moved = env.holm.app.kv.get('redirect:' + path);
  if (moved) {
    const target = typeof moved === 'string' && moved.startsWith('post:') ? postById(env, moved.slice(5)) : null;
    if (target && target.status === 'published') return redirect(postPath(target, settings));
    if (typeof moved === 'string' && moved.startsWith('/')) return redirect(moved);
  }
  return null;
}

// Link previews: the card for any post address on this site.
export function cards(env, ctx, request) {
  const url = new URL(request.url);
  const settings = siteSettings(env);
  const out = [];
  for (const raw of url.searchParams.getAll('url').slice(0, 20)) {
    let path;
    try { path = new URL(raw, url.origin).pathname.replace(/\/+$/, ''); } catch { continue; }
    const post = postAtPath(env, settings, path);
    if (post && post.status === 'published') out.push({ url: raw, card: cardDTO(env, ctx, post, settings) });
  }
  return out;
}
