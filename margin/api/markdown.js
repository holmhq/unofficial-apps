// Markdown in, safe HTML out. Raw HTML is shown as text, links are checked, and a few
// conventions turn plain Markdown into richer blocks:
//   > [!NOTE] …              a callout (NOTE, TIP, IMPORTANT, WARNING, CAUTION)
//   a URL alone on a line   an embed (YouTube, Vimeo, Loom, CodePen, Figma, Spotify),
//                           a card for another post on this blog, or a bookmark
//   ![alt](src "caption")   a figure; add #wide or #full to the address for width
//   ![alt](clip.mp4)        a video (by extension, or an uploaded video)
import { Marked } from './vendor/marked/marked.js';
import { escapeHTML, slugify } from './lib/util.js';

const CALLOUT = /^\s*\[!(note|tip|important|warning|caution)\][ \t]*\n?/i;
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

function safeHref(href, allowRelative = true) {
  const value = String(href || '').trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (allowRelative && /^(\/(?!\/)|#|\.\/|\.\.\/|[a-z0-9_-]+(\/|$))/i.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return null;
}

export function embedFor(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let m;
  if (host === 'youtube.com' && url.pathname === '/watch' && url.searchParams.get('v')) return yt(url.searchParams.get('v'), url);
  if (host === 'youtube.com' && (m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/))) return yt(m[2], url);
  if (host === 'youtu.be' && (m = url.pathname.match(/^\/([\w-]{6,})/))) return yt(m[1], url);
  if (host === 'vimeo.com' && (m = url.pathname.match(/^\/(\d{5,})/))) return { kind: 'vimeo', title: 'Vimeo video', src: `https://player.vimeo.com/video/${m[1]}?dnt=1`, ratio: '16 / 9' };
  if (host === 'loom.com' && (m = url.pathname.match(/^\/(share|embed)\/([\w-]+)/))) return { kind: 'loom', title: 'Loom video', src: `https://www.loom.com/embed/${m[2]}`, ratio: '16 / 9' };
  if (host === 'codepen.io' && (m = url.pathname.match(/^\/([\w-]+)\/(pen|full|details)\/([\w-]+)/))) return { kind: 'codepen', title: 'CodePen', src: `https://codepen.io/${m[1]}/embed/${m[3]}?default-tab=result`, ratio: '4 / 3' };
  if (host === 'figma.com' && /^\/(file|design|proto|board)\//.test(url.pathname)) return { kind: 'figma', title: 'Figma', src: `https://www.figma.com/embed?embed_host=margin&url=${encodeURIComponent(url.href)}`, ratio: '4 / 3' };
  if (host === 'open.spotify.com' && (m = url.pathname.match(/^\/(track|album|playlist|episode|show)\/(\w+)/))) return { kind: 'spotify', title: 'Spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 };
  return null;
}
function yt(id, url) {
  const start = Number.parseInt(url.searchParams.get('t') || url.searchParams.get('start') || '', 10);
  return { kind: 'youtube', title: 'YouTube video', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${start > 0 ? `?start=${start}` : ''}`, ratio: '16 / 9' };
}
export const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.loom.com', 'https://codepen.io', 'https://www.figma.com', 'https://embed.figma.com', 'https://open.spotify.com'];

// A post on this site, by path: /@handle/slug or /slug (when that blog is home).
export function localPostPath(href, origin) {
  let url;
  try { url = new URL(href, origin || 'http://local.invalid'); } catch { return null; }
  if (origin && url.origin !== new URL(origin).origin) return null;
  if (!origin && !href.startsWith('/')) return null;
  if (/^\/@[a-z0-9_-]+\/[a-z0-9-]+\/?$/.test(url.pathname) || /^\/[a-z0-9][a-z0-9-]*\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, '');
  return null;
}

function plain(tokens) {
  let out = '';
  for (const t of tokens || []) {
    if (t.tokens) out += plain(t.tokens);
    else if (t.type === 'image') out += '';
    else if (t.type === 'br') out += ' ';
    else if (typeof t.text === 'string') out += t.text;
  }
  return out;
}

const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);

// options.media(id) returns { width, height, mime } for /media/<id> sources.
export function render(md, options = {}) {
  const origin = options.origin || '';
  const media = options.media || (() => null);
  const seen = new Map();
  const images = [];
  const cards = [];

  function figure(href, title, alt) {
    let src = safeHref(href);
    if (!src) return `<p>${escapeHTML(alt || '')}</p>`;
    let width = '';
    const hash = src.match(/#(wide|full)$/i);
    if (hash) { width = ` m-${hash[1].toLowerCase()}`; src = src.slice(0, hash.index); }
    const id = (src.match(/^\/media\/([a-z0-9]+)/) || [])[1];
    const info = id ? media(id) : null;
    const isVideo = info ? /^video\//.test(info.mime || '') : VIDEO.test(src);
    const caption = title ? `<figcaption>${escapeHTML(title)}</figcaption>` : '';
    const size = info && info.width ? ` width="${info.width}" height="${info.height}"` : '';
    if (isVideo) return `<figure class="m-figure m-video${width}"><video src="${escapeHTML(src)}" controls playsinline preload="metadata"${size}></video>${caption}</figure>\n`;
    images.push(src);
    return `<figure class="m-figure${width}"><img src="${escapeHTML(src)}" alt="${escapeHTML(alt || '')}" loading="lazy" decoding="async"${size}>${caption}</figure>\n`;
  }

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      html({ text }) { return escapeHTML(text); },
      heading({ tokens, depth }) {
        const label = decode(plain(tokens)).trim();
        let id = slugify(label, 60) || 'section';
        const n = seen.get(id) || 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n + 1}`;
        const level = Math.min(6, Math.max(2, depth));
        return `<h${level} id="${id}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      paragraph({ tokens }) {
        const items = tokens.filter((t) => !(t.type === 'text' && !t.text.trim()) && t.type !== 'br');
        if (items.length === 1 && items[0].type === 'image') return figure(items[0].href, items[0].title, items[0].text);
        if (items.length === 1 && items[0].type === 'text' && /^\/@[a-z0-9_-]+\/[a-z0-9-]+\/?$/.test(items[0].text.trim())) {
          const local = items[0].text.trim().replace(/\/$/, '');
          cards.push(local);
          return `<!--m-card:${local}--><p><a href="${escapeHTML(local)}">${escapeHTML(local)}</a></p><!--/m-card-->\n`;
        }
        if (items.length === 1 && items[0].type === 'link' && decode(plain(items[0].tokens)).trim() === items[0].href) {
          const href = items[0].href;
          const embed = embedFor(href);
          if (embed) {
            const box = embed.height ? `height:${embed.height}px` : `aspect-ratio:${embed.ratio}`;
            return `<figure class="m-embed m-embed-${embed.kind}"><iframe src="${escapeHTML(embed.src)}" title="${embed.title}" style="${box}" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>\n`;
          }
          const local = localPostPath(href, origin);
          if (local) {
            cards.push(local);
            return `<!--m-card:${local}--><p><a href="${escapeHTML(local)}">${escapeHTML(href)}</a></p><!--/m-card-->\n`;
          }
          const safe = safeHref(href, false);
          if (safe) {
            let host = '';
            try { host = new URL(safe).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
            return `<a class="m-bookmark" href="${escapeHTML(safe)}" rel="noopener"><span class="m-bookmark-host">${escapeHTML(host)}</span><span class="m-bookmark-url">${escapeHTML(safe)}</span></a>\n`;
          }
        }
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      image({ href, title, text }) {
        const src = safeHref(href);
        if (!src) return escapeHTML(text || '');
        images.push(src);
        return `<img src="${escapeHTML(src.replace(/#(wide|full)$/i, ''))}" alt="${escapeHTML(text || '')}"${title ? ` title="${escapeHTML(title)}"` : ''} loading="lazy">`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const safe = safeHref(href);
        if (!safe) return inner;
        const external = /^https?:/i.test(safe) && !(origin && safe.startsWith(origin));
        return `<a href="${escapeHTML(safe)}"${title ? ` title="${escapeHTML(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${inner}</a>`;
      },
      blockquote(token) {
        const first = token.tokens && token.tokens[0];
        const lead = first && first.type === 'paragraph' && first.tokens && first.tokens[0];
        const match = first && first.type === 'paragraph' ? CALLOUT.exec(first.raw || '') : null;
        if (match && lead) {
          const kind = match[1].toLowerCase();
          // Drop the marker from the paragraph's inline tokens.
          let rest = match[0].length;
          const inline = [];
          for (const t of first.tokens) {
            if (rest <= 0) { inline.push(t); continue; }
            const raw = t.raw || '';
            if (raw.length <= rest) { rest -= raw.length; continue; }
            const keep = raw.slice(rest);
            inline.push({ type: 'text', raw: keep, text: keep, escaped: false });
            rest = 0;
          }
          const head = inline.length ? `<p>${this.parser.parseInline(inline)}</p>\n` : '';
          const body = this.parser.parse(token.tokens.slice(1));
          return `<aside class="m-callout m-callout-${kind}" role="note"><div class="m-callout-body">${head}${body}</div></aside>\n`;
        }
        return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
      },
      code({ text, lang }) {
        const language = String(lang || '').trim().split(/\s+/)[0].replace(/[^\w+#.-]/g, '').slice(0, 20);
        const cls = language ? ` class="language-${escapeHTML(language)}"` : '';
        return `<pre class="m-code"${language ? ` data-lang="${escapeHTML(language)}"` : ''}><code${cls}>${escapeHTML(text)}</code></pre>\n`;
      },
      table(token) {
        let head = '';
        for (const cell of token.header) head += this.tablecell(cell);
        let body = '';
        for (const row of token.rows) {
          let cells = '';
          for (const cell of row) cells += this.tablecell(cell);
          body += `<tr>${cells}</tr>\n`;
        }
        return `<div class="m-table"><table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody></table></div>\n`;
      },
    },
  });

  const source = String(md || '');
  const tokens = marked.lexer(source);
  let excerpt = '';
  for (const t of tokens) {
    if (t.type === 'paragraph' && !(t.tokens.length === 1 && (t.tokens[0].type === 'image' || t.tokens[0].type === 'link'))) {
      const value = decode(plain(t.tokens)).replace(/\s+/g, ' ').trim();
      if (value.length > 40 && !CALLOUT.test(t.raw)) { excerpt = value; break; }
    }
  }
  const html = marked.parser(tokens);
  const textOnly = decode(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const words = textOnly ? textOnly.split(' ').length : 0;
  if (excerpt.length > 240) excerpt = excerpt.slice(0, 237).replace(/\s+\S*$/, '') + '…';
  return { html, excerpt, words, minutes: Math.max(1, Math.round(words / 230)), images, cards };
}

// Comments are short and plain: paragraphs, line breaks and links, nothing else.
export function renderComment(body) {
  const paragraphs = String(body || '').trim().split(/\n{2,}/);
  return paragraphs.map((p) => {
    const linked = escapeHTML(p).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (url) => `<a href="${url}" rel="nofollow ugc noopener">${url}</a>`);
    return `<p>${linked.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
