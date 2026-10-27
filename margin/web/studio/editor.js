// The editor: title, subtitle and a block editor that reads and writes Margin's Markdown.
// Slash menu for blocks, a bar for formatting, handles to move blocks, drop-in photos and
// video, embeds from a pasted link, callouts, and autosave for drafts.
import {
  Editor, Node, Extension, mergeAttributes, StarterKit, Placeholder, CharacterCount, TaskList, TaskItem, TableKit,
  Markdown, Suggestion, BubbleMenu, Image, Plugin, PluginKey, NodeSelection, nodeInputRule, InputRule,
} from '/vendor/editor/tiptap.js';
import { api, esc, h, $, $$, toast, icons, sheet, menu, copy, upload, pickFile, ago } from './lib.js';

const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const KINDS = ['note', 'tip', 'important', 'warning', 'caution'];
const KIND_LABEL = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

let css = null;
function loadCSS() {
  if (css) return;
  css = h('<link rel="stylesheet" href="/studio/editor.css">');
  document.head.append(css, h('<link rel="stylesheet" href="/margin/ui.css">'));
}

const I = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const BI = {
  text: I('<path d="M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6"/>'),
  h2: I('<path d="M4 12h8m-8 6V6m8 12V6m9 12h-4c0-4 4-3 4-6c0-1.5-2-2.5-4-1"/>'),
  h3: I('<path d="M4 12h8m-8 6V6m8 12V6m5.5-1.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2m-2 4c1.7 1 3.5 0 3.5-1.5a2 2 0 0 0-2-2"/>'),
  bullet: I('<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>'),
  ordered: I('<path d="M11 5h10m-10 7h10m-10 7h10M4 4h1v5M4 9h2m.5 11H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/>'),
  todo: I('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m16 9l-5.5 5.5L8 12"/>'),
  quote: I('<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1a6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2a1 1 0 0 1 1 1v1a2 2 0 0 1-2 2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1a6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'),
  callout: I('<path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4"/>'),
  code: I('<path d="m16 18l6-6l-6-6M8 6l-6 6l6 6"/>'),
  divider: I('<path d="M5 12h14"/>'),
  math: I('<path d="M18 7V5H6l6 7l-6 7h12v-2"/>'),
  table: I('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  image: I('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
  video: I('<path d="m16 13l5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect width="14" height="12" x="2" y="6" rx="2"/>'),
  embed: I('<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>'),
  card: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6M7 12h10M7 16h4"/>'),
  bold: I('<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>'),
  italic: I('<path d="M19 4h-9m4 16H5M15 4L9 20"/>'),
  strike: I('<path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6m-2-8h16"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  grip: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
};

// ---------- custom blocks ----------

const FIGURE_RE = /^ {0,3}!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"\n]*)")?\s*\)[ \t]*(?:\n[ \t]*\n|\n*$)/;
const EMBED_RE = /^ {0,3}(https?:\/\/[^\s<>]+|\/@[a-z0-9_-]+\/[a-z0-9-]+)[ \t]*(?:\n[ \t]*\n|\n*$)/;
const CALLOUT_RE = /^ {0,3}> ?\[!(note|tip|important|warning|caution)\][ \t]*(.*)(?:\n|$)((?: {0,3}>.*(?:\n|$))*)/i;

function splitWidth(src) {
  const m = /#(wide|full)$/i.exec(src || '');
  return m ? { src: src.slice(0, m.index), width: m[1].toLowerCase() } : { src: src || '', width: '' };
}

const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' }, caption: { default: '' }, width: { default: '' }, w: { default: 0 }, h: { default: 0 }, uploading: { default: false } };
  },
  parseHTML() { return [{ tag: 'figure[data-figure]' }]; },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes({ 'data-figure': '' }), ['img', { src: HTMLAttributes.src, alt: HTMLAttributes.alt }]]; },
  markdownTokenName: 'figure',
  markdownTokenizer: {
    name: 'figure', level: 'block', start: () => -1,
    tokenize(src) {
      const m = FIGURE_RE.exec(src);
      if (!m) return undefined;
      return { type: 'figure', raw: m[0], alt: m[1], href: m[2], title: m[3] || '' };
    },
  },
  parseMarkdown(token, helpers) {
    const { src, width } = splitWidth(token.href);
    return helpers.createNode('figure', { src, alt: token.alt || '', caption: token.title || '', width });
  },
  renderMarkdown(node) {
    const a = node.attrs || {};
    if (!a.src) return '';
    const alt = String(a.alt || '').replace(/[\[\]\n]/g, ' ');
    const caption = a.caption ? ` "${String(a.caption).replace(/"/g, '”').replace(/\n/g, ' ')}"` : '';
    return `![${alt}](${a.src}${a.width ? '#' + a.width : ''}${caption})`;
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = h(`<figure class="ed-figure" data-width="${esc(node.attrs.width)}" contenteditable="false">
        <div class="ed-figure-media"></div>
        <div class="ed-figure-bar"><div class="ed-seg">${['', 'wide', 'full'].map((w) => `<button type="button" data-w="${w}">${w ? w[0].toUpperCase() + w.slice(1) : 'Text width'}</button>`).join('')}</div>
        <button type="button" class="ed-chip" data-alt>Alt text</button><button type="button" class="ed-chip" data-replace>Replace</button><button type="button" class="ed-chip ed-danger" data-remove aria-label="Remove">${icons.trash}</button></div>
        <input class="ed-caption" placeholder="Add a caption (optional)" maxlength="300"></figure>`);
      const media = dom.querySelector('.ed-figure-media');
      const caption = dom.querySelector('.ed-caption');
      let current = node;
      const paint = () => {
        const a = current.attrs;
        dom.dataset.width = a.width || '';
        $$('[data-w]', dom).forEach((b) => b.setAttribute('aria-pressed', String((a.width || '') === b.dataset.w)));
        const video = VIDEO.test(a.src);
        const key = `${a.src}|${video}|${a.uploading}`;
        if (media.dataset.key !== key) {
          media.dataset.key = key;
          if (a.uploading) media.innerHTML = `<div class="ed-uploading"${a.w ? ` style="aspect-ratio:${a.w}/${a.h}"` : ''}><span class="spinner"></span><span>Uploading…</span></div>`;
          else if (video) media.innerHTML = `<video src="${esc(a.src)}" controls playsinline preload="metadata"></video>`;
          else media.innerHTML = `<img src="${esc(a.src)}" alt="${esc(a.alt)}">`;
        }
        if (document.activeElement !== caption) caption.value = a.caption || '';
      };
      const set = (attrs) => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }); return true; }).run();
      };
      dom.addEventListener('click', async (e) => {
        const w = e.target.closest('[data-w]');
        if (w) return set({ width: w.dataset.w });
        if (e.target.closest('[data-remove]')) { const pos = getPos(); editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run(); return; }
        if (e.target.closest('[data-alt]')) { const alt = prompt('Describe this for people who can’t see it', current.attrs.alt || ''); if (alt !== null) set({ alt: alt.trim().slice(0, 200) }); return; }
        if (e.target.closest('[data-replace]')) {
          const file = await pickFile('image/*,video/mp4,video/webm,video/quicktime');
          if (!file) return;
          set({ uploading: true });
          try { const m = await upload(file); set({ src: m.url, w: m.width, h: m.height, uploading: false }); } catch (error) { toast(error.message); set({ uploading: false }); }
        }
      });
      caption.addEventListener('input', () => set({ caption: caption.value }));
      caption.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const pos = getPos() + current.nodeSize; editor.chain().focus().insertContentAt(pos, { type: 'paragraph' }).setTextSelection(pos + 1).run(); } });
      paint();
      return {
        dom,
        update(next) { if (next.type.name !== 'figure') return false; current = next; paint(); return true; },
        selectNode() { dom.classList.add('is-selected'); },
        deselectNode() { dom.classList.remove('is-selected'); },
        stopEvent(e) { return !!e.target.closest('.ed-caption, .ed-figure-bar'); },
        ignoreMutation: () => true,
      };
    };
  },
});

const cardCache = new Map();
function cardFor(url) {
  if (!cardCache.has(url)) cardCache.set(url, api('/api/cards?url=' + encodeURIComponent(url)).then((d) => d.cards[0]?.card || null).catch(() => null));
  return cardCache.get(url);
}
function providerOf(url) {
  try {
    const host = new URL(url, location.origin).hostname.replace(/^www\./, '');
    if (/youtube\.com|youtu\.be/.test(host)) return 'YouTube';
    if (/vimeo\.com/.test(host)) return 'Vimeo';
    if (/loom\.com/.test(host)) return 'Loom';
    if (/codepen\.io/.test(host)) return 'CodePen';
    if (/figma\.com/.test(host)) return 'Figma';
    if (/spotify\.com/.test(host)) return 'Spotify';
    return null;
  } catch { return null; }
}
function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/);
    return m ? m[2] : null;
  } catch { return null; }
}

const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() { return { url: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-embed]', getAttrs: (el) => ({ url: el.getAttribute('data-url') }) }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { 'data-embed': '', 'data-url': HTMLAttributes.url }]; },
  markdownTokenName: 'embed',
  markdownTokenizer: {
    name: 'embed', level: 'block', start: () => -1,
    tokenize(src) {
      const m = EMBED_RE.exec(src);
      if (!m) return undefined;
      return { type: 'embed', raw: m[0], url: m[1] };
    },
  },
  parseMarkdown(token, helpers) { return helpers.createNode('embed', { url: token.url }); },
  renderMarkdown(node) { return (node.attrs && node.attrs.url) || ''; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = h('<div class="ed-embed" contenteditable="false"><div class="ed-embed-body"></div><button type="button" class="ed-chip ed-danger ed-embed-remove" aria-label="Remove">' + icons.trash + '</button></div>');
      const body = dom.querySelector('.ed-embed-body');
      const url = node.attrs.url;
      const local = /^\/@|^\/[a-z0-9-]+$/.test(url) || url.startsWith(location.origin + '/');
      const provider = providerOf(url);
      if (local) {
        body.innerHTML = `<div class="m-postcard ed-loading"><span class="m-postcard-text"><span class="m-postcard-blog">Post on this blog</span><span class="m-postcard-title">${esc(url)}</span></span></div>`;
        cardFor(url.replace(location.origin, '')).then((card) => {
          if (!card) { body.innerHTML = `<div class="m-bookmark"><span class="m-bookmark-host">Post not found (yet)</span><span class="m-bookmark-url">${esc(url)}</span></div>`; return; }
          body.innerHTML = `<div class="m-postcard">${card.cover ? `<span class="m-postcard-cover"><img src="${esc(card.cover.url)}" alt=""></span>` : ''}<span class="m-postcard-text"><span class="m-postcard-blog">${esc(card.blog.name)}</span><span class="m-postcard-title">${esc(card.title)}</span><span class="m-postcard-desc">${esc(card.description)}</span><span class="m-postcard-meta">${esc(card.date)} · ${esc(card.reading_time)}</span></span></div>`;
        });
      } else if (provider === 'YouTube' && youtubeId(url)) {
        body.innerHTML = `<div class="ed-embed-video" style="background-image:url('https://i.ytimg.com/vi/${encodeURIComponent(youtubeId(url))}/hqdefault.jpg')"><span>${BI.embed}YouTube</span></div>`;
      } else if (provider) {
        body.innerHTML = `<div class="ed-embed-provider">${BI.embed}<span><b>${provider}</b><small>${esc(url)}</small></span></div>`;
      } else {
        let host = url;
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
        body.innerHTML = `<div class="m-bookmark"><span class="m-bookmark-host">${esc(host)}</span><span class="m-bookmark-url">${esc(url)}</span></div>`;
      }
      dom.querySelector('.ed-embed-remove').addEventListener('click', () => { const pos = getPos(); editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run(); });
      return { dom, selectNode() { dom.classList.add('is-selected'); }, deselectNode() { dom.classList.remove('is-selected'); }, ignoreMutation: () => true };
    };
  },
});

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() { return { kind: { default: 'note' } }; },
  parseHTML() { return [{ tag: 'aside[data-callout]', getAttrs: (el) => ({ kind: el.getAttribute('data-kind') || 'note' }) }]; },
  renderHTML({ node }) { return ['aside', { 'data-callout': '', 'data-kind': node.attrs.kind, class: `m-callout m-callout-${node.attrs.kind}` }, 0]; },
  markdownTokenName: 'callout',
  markdownTokenizer: {
    name: 'callout', level: 'block', start: () => -1,
    tokenize(src, tokens, lexer) {
      const m = CALLOUT_RE.exec(src);
      if (!m) return undefined;
      const lines = [m[2], ...m[3].split('\n').map((l) => l.replace(/^ {0,3}> ?/, ''))];
      const inner = lines.join('\n').trim();
      return { type: 'callout', raw: m[0], kind: m[1].toLowerCase(), tokens: lexer.blockTokens(inner) };
    },
  },
  parseMarkdown(token, helpers) {
    const parse = helpers.parseBlockChildren || helpers.parseChildren;
    const children = parse(token.tokens || []);
    return helpers.createNode('callout', { kind: token.kind }, children.length ? children : [helpers.createNode('paragraph')]);
  },
  renderMarkdown(node, helpers) {
    const body = (node.content || []).map((child, i) => (helpers.renderChild ? helpers.renderChild(child, i) : helpers.renderChildren([child]))).join('\n\n');
    return `> [!${String(node.attrs.kind || 'note').toUpperCase()}]\n` + body.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = h(`<aside class="m-callout m-callout-${esc(node.attrs.kind)} ed-callout"><button type="button" class="ed-callout-kind" contenteditable="false" aria-label="Callout type"></button><div class="ed-callout-content"></div></aside>`);
      const content = dom.querySelector('.ed-callout-content');
      const kindBtn = dom.querySelector('.ed-callout-kind');
      kindBtn.addEventListener('mousedown', (e) => e.preventDefault());
      kindBtn.addEventListener('click', (e) => {
        menu(e.currentTarget, KINDS.map((k) => ({ label: KIND_LABEL[k], run: () => { const pos = getPos(); editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { kind: k }); return true; }).run(); } })));
      });
      return {
        dom, contentDOM: content,
        update(next) { if (next.type.name !== 'callout') return false; dom.className = `m-callout m-callout-${next.attrs.kind} ed-callout`; return true; },
      };
    };
  },
});

// ---------- maths ----------
// $…$ and $$ … $$ stay TeX in the Markdown (never escaped); here they show typeset by KaTeX,
// and a click opens the formula to edit. The same Pandoc rules as the server: "$5 and $10"
// is text.

const MATH_INLINE_RE = /^\$(?![\s$])((?:\\[\s\S]|[^\\$\n])*?[^\s\\$])\$(?!\d)|^\$([^\s$\\])\$(?!\d)/;
const MATH_BLOCK_RE = /^ {0,3}\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n+|$)/;
let katexReady = null;
function loadKatex() {
  if (!katexReady) {
    document.head.append(h('<link rel="stylesheet" href="/vendor/katex/katex.css">'));
    katexReady = import('/vendor/katex/katex.mjs').then((m) => m.default);
  }
  return katexReady;
}
async function typeset(el, tex, display) {
  const source = String(tex || '').trim();
  if (!source) { el.innerHTML = `<span class="ed-math-empty">${display ? 'Add a formula' : 'formula'}</span>`; return; }
  try {
    const katex = await loadKatex();
    el.innerHTML = katex.renderToString(source, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
  } catch { el.textContent = source; }
}

// A sheet to write the formula, with the result as you type.
function mathSheet(tex, display, done) {
  const box = h(`<div class="ed-math-sheet"><textarea class="ed-math-input" rows="${display ? 4 : 2}" spellcheck="false" autocapitalize="off" placeholder="${display ? '\\int_0^1 x^2\\,dx = \\frac{1}{3}' : 'e^{i\\pi} + 1 = 0'}" aria-label="Formula in LaTeX"></textarea>
    <div class="ed-math-preview" aria-live="polite"></div>
    <p class="ed-math-help">LaTeX, as in <code>\\frac{a}{b}</code>, <code>x^2</code>, <code>\\sqrt{x}</code>, <code>\\sum_{i=1}^n</code>. Readers see it typeset.</p>
    <div class="ed-math-actions"><button type="button" class="btn danger" data-remove>Remove</button><span class="grow"></span><button type="button" class="btn primary" data-done>Done</button></div></div>`);
  const input = $('textarea', box);
  const preview = $('.ed-math-preview', box);
  input.value = tex || '';
  const paint = () => typeset(preview, input.value, display);
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !display)) { e.preventDefault(); finish(); } });
  paint();
  let settled = false;
  const s2 = sheet(display ? 'Formula' : 'Inline formula', box);
  const finish = (value = input.value.trim()) => { settled = true; s2.close(); done(value); };
  $('[data-done]', box).addEventListener('click', () => finish());
  $('[data-remove]', box).addEventListener('click', () => finish(''));
  s2.onClose = () => { if (!settled) done(String(tex || '').trim() || input.value.trim()); };
  setTimeout(() => input.focus(), 60);
}

function mathView(display) {
  return ({ node, editor, getPos }) => {
    const dom = display ? h('<div class="ed-math-block" contenteditable="false" role="button" tabindex="0"></div>') : h('<span class="ed-math-inline" contenteditable="false" role="button" tabindex="0"></span>');
    let current = node;
    const open = () => {
      if (!editor.isEditable) return;
      mathSheet(current.attrs.tex, display, (tex) => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        if (!tex) { editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run(); return; }
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, tex }));
      });
    };
    dom.addEventListener('click', open);
    dom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
    typeset(dom, node.attrs.tex, display);
    if (!node.attrs.tex) setTimeout(open, 0);
    return {
      dom,
      update(next) { if (next.type !== current.type) return false; if (next.attrs.tex !== current.attrs.tex) typeset(dom, next.attrs.tex, display); current = next; return true; },
      stopEvent: () => false,
      ignoreMutation: () => true,
    };
  };
}

const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() { return { tex: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-math-block]', getAttrs: (el) => ({ tex: el.getAttribute('data-tex') || '' }) }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { 'data-math-block': '', 'data-tex': HTMLAttributes.tex }]; },
  markdownTokenName: 'mathBlock',
  markdownTokenizer: {
    name: 'mathBlock', level: 'block', start: () => -1,
    tokenize(src) {
      const m = MATH_BLOCK_RE.exec(src);
      return m ? { type: 'mathBlock', raw: m[0], text: m[1] } : undefined;
    },
  },
  parseMarkdown(token, helpers) { return helpers.createNode('mathBlock', { tex: String(token.text || '').trim() }); },
  renderMarkdown(node) { const tex = String(node.attrs.tex || '').trim(); return tex ? `$$\n${tex}\n$$` : ''; },
  addNodeView() { return mathView(true); },
  addInputRules() {
    // $$ and a space on an empty line starts a formula.
    return [nodeInputRule({ find: /^\$\$\s$/, type: this.type, getAttributes: () => ({ tex: '' }) })];
  },
});

const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() { return { tex: { default: '' } }; },
  parseHTML() { return [{ tag: 'span[data-math]', getAttrs: (el) => ({ tex: el.getAttribute('data-tex') || '' }) }]; },
  renderHTML({ HTMLAttributes }) { return ['span', { 'data-math': '', 'data-tex': HTMLAttributes.tex }]; },
  markdownTokenName: 'mathInline',
  markdownTokenizer: {
    name: 'mathInline', level: 'inline',
    start(src) { const i = src.indexOf('$'); return i; },
    tokenize(src) {
      const m = MATH_INLINE_RE.exec(src);
      return m ? { type: 'mathInline', raw: m[0], text: m[1] || m[2] } : undefined;
    },
  },
  parseMarkdown(token, helpers) { return helpers.createNode('mathInline', { tex: token.text || '' }); },
  renderMarkdown(node) { const tex = String(node.attrs.tex || '').trim(); return tex ? `$${tex}$` : ''; },
  addNodeView() { return mathView(false); },
  addInputRules() {
    // Typing $x^2$ turns into a formula once the closing $ is in.
    // The closing $ is being typed, so it isn't in the document yet: replace from the opening one.
    const type = this.type;
    return [new InputRule({
      find: /(?:^|\s)(\$([^\s$](?:[^$]*[^\s$])?)\$)$/,
      handler: ({ state, range, match }) => {
        const from = range.from + match[0].indexOf(match[1]);
        state.tr.replaceWith(from, range.to, type.create({ tex: match[2] }));
      },
    })];
  },
});

// ---------- slash menu ----------

const BLOCKS = [
  { group: 'Basic', key: 'text', label: 'Text', hint: '', icon: BI.text, run: (c) => c.setParagraph() },
  { group: 'Basic', key: 'h2', label: 'Heading', hint: '##', icon: BI.h2, run: (c) => c.setHeading({ level: 2 }) },
  { group: 'Basic', key: 'h3', label: 'Subheading', hint: '###', icon: BI.h3, run: (c) => c.setHeading({ level: 3 }) },
  { group: 'Basic', key: 'bullet', label: 'Bulleted list', hint: '-', icon: BI.bullet, run: (c) => c.toggleBulletList() },
  { group: 'Basic', key: 'ordered', label: 'Numbered list', hint: '1.', icon: BI.ordered, run: (c) => c.toggleOrderedList() },
  { group: 'Basic', key: 'todo', label: 'To-do list', hint: '[]', icon: BI.todo, run: (c) => c.toggleTaskList() },
  { group: 'Basic', key: 'quote', label: 'Quote', hint: '>', icon: BI.quote, run: (c) => c.toggleBlockquote() },
  { group: 'Basic', key: 'callout', label: 'Callout', hint: '', icon: BI.callout, run: (c) => c.wrapIn('callout', { kind: 'note' }) },
  { group: 'Basic', key: 'code', label: 'Code', hint: '```js', icon: BI.code, run: (c) => c.toggleCodeBlock() },
  { group: 'Basic', key: 'math', label: 'Formula', hint: '$$', icon: BI.math, run: (c) => c.insertContent({ type: 'mathBlock', attrs: { tex: '' } }) },
  { group: 'Basic', key: 'mathinline', label: 'Inline formula', hint: '$x$', icon: BI.math, run: (c) => c.insertContent({ type: 'mathInline', attrs: { tex: '' } }) },
  { group: 'Basic', key: 'divider', label: 'Divider', hint: '---', icon: BI.divider, run: (c) => c.setHorizontalRule() },
  { group: 'Basic', key: 'table', label: 'Table', hint: '', icon: BI.table, run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { group: 'Media', key: 'image', label: 'Photo', hint: 'Upload', icon: BI.image, media: 'image/*' },
  { group: 'Media', key: 'video', label: 'Video', hint: '20 MB', icon: BI.video, media: 'video/mp4,video/webm,video/quicktime' },
  { group: 'Media', key: 'embed', label: 'Embed a link', hint: 'YouTube, Figma…', icon: BI.embed, ask: 'Paste a YouTube, Vimeo, Loom, CodePen, Figma or Spotify link, or any web address' },
  { group: 'Media', key: 'card', label: 'Card for a post', hint: '/@blog/post', icon: BI.card, ask: 'Paste the address of a post on this blog' },
];

function slashMenu(editorRef) {
  let el = null;
  let items = [];
  let index = 0;
  let props = null;
  const paint = () => {
    if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="ed-slash-empty">No matching blocks</div>'; return; }
    let html = '';
    let group = '';
    items.forEach((it, i) => {
      if (it.group !== group) { group = it.group; html += `<div class="ed-slash-group">${group}</div>`; }
      html += `<button type="button" class="ed-slash-item${i === index ? ' on' : ''}" data-i="${i}"><span class="ed-slash-icon">${it.icon}</span><span class="ed-slash-label">${esc(it.label)}</span><span class="ed-slash-hint">${esc(it.hint)}</span></button>`;
    });
    el.innerHTML = html;
    el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const place = () => {
    if (!el || !props) return;
    const r = props.clientRect && props.clientRect();
    if (!r) return;
    const below = r.bottom + 8 + el.offsetHeight < window.innerHeight;
    el.style.left = Math.max(10, Math.min(r.left, window.innerWidth - el.offsetWidth - 10)) + 'px';
    el.style.top = (below ? r.bottom + 8 : Math.max(10, r.top - el.offsetHeight - 8)) + 'px';
  };
  const choose = (it) => {
    if (!it || !props) return;
    const ed = editorRef();
    ed.chain().focus().deleteRange(props.range).run();
    runBlock(ed, it);
  };
  return {
    char: '/',
    startOfLine: false,
    allowSpaces: false,
    items: ({ query }) => {
      const q = query.toLowerCase();
      return BLOCKS.filter((b) => !q || b.label.toLowerCase().includes(q) || b.key.includes(q) || (b.group.toLowerCase().startsWith(q)));
    },
    command: ({ props: it }) => choose(it),
    render: () => ({
      onStart(p) {
        props = p;
        items = p.items;
        index = 0;
        el = h('<div class="ed-slash" role="listbox" aria-label="Insert a block"></div>');
        el.addEventListener('mousedown', (e) => e.preventDefault());
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
        document.body.append(el);
        paint();
        place();
      },
      onUpdate(p) { props = p; items = p.items; index = Math.min(index, Math.max(0, items.length - 1)); paint(); place(); },
      onKeyDown({ event }) {
        if (!el) return false;
        if (event.key === 'ArrowDown') { index = (index + 1) % Math.max(1, items.length); paint(); return true; }
        if (event.key === 'ArrowUp') { index = (index - 1 + items.length) % Math.max(1, items.length); paint(); return true; }
        // Enter or Tab takes the highlighted block, as in Notion.
        if (event.key === 'Enter' || event.key === 'Tab') { if (items[index]) choose(items[index]); return true; }
        if (event.key === 'Escape') { el.remove(); el = null; return true; }
        return false;
      },
      onExit() { el?.remove(); el = null; props = null; },
    }),
  };
}

async function runBlock(ed, it) {
  if (it.run) { it.run(ed.chain().focus()).run(); return; }
  if (it.media) {
    const file = await pickFile(it.media);
    if (file) insertFiles(ed, [file]);
    return;
  }
  if (it.ask) {
    const url = (prompt(it.ask) || '').trim();
    if (!url) return;
    let value = url;
    if (value.startsWith(location.origin + '/')) value = value.slice(location.origin.length);
    if (!/^(https?:\/\/\S+|\/\S+)$/.test(value)) { toast('That doesn’t look like a link.'); return; }
    ed.chain().focus().insertContent([{ type: 'embed', attrs: { url: value } }, { type: 'paragraph' }]).run();
  }
}

async function insertFiles(ed, files, pos) {
  for (const file of files) {
    if (!/^(image|video)\//.test(file.type)) { toast(`${file.name} isn’t a photo or video.`); continue; }
    const marker = 'up-' + Math.random().toString(36).slice(2);
    const at = typeof pos === 'number' ? pos : ed.state.selection.to;
    ed.chain().focus().insertContentAt(at, [{ type: 'figure', attrs: { src: marker, uploading: true } }, { type: 'paragraph' }]).run();
    const find = () => {
      let found = null;
      ed.state.doc.descendants((n, p) => { if (n.type.name === 'figure' && n.attrs.src === marker) found = { n, p }; return !found; });
      return found;
    };
    try {
      const media = await upload(file);
      const f = find();
      if (f) ed.chain().command(({ tr }) => { tr.setNodeMarkup(f.p, undefined, { ...f.n.attrs, src: media.url, w: media.width, h: media.height, uploading: false }); return true; }).run();
    } catch (error) {
      toast(error.message);
      const f = find();
      if (f) ed.chain().deleteRange({ from: f.p, to: f.p + f.n.nodeSize }).run();
    }
  }
}

// Paste or drop files; paste Markdown as formatted blocks.
const Drop = Extension.create({
  name: 'marginDrop',
  addProseMirrorPlugins() {
    const ed = this.editor;
    return [new Plugin({
      key: new PluginKey('marginDrop'),
      props: {
        handlePaste(view, event) {
          const files = [...(event.clipboardData?.files || [])];
          if (files.length) { insertFiles(ed, files); return true; }
          const text = event.clipboardData?.getData('text/plain') || '';
          const html = event.clipboardData?.getData('text/html') || '';
          const trimmed = text.trim();
          if (!html && /^(https?:\/\/\S+)$/.test(trimmed) && view.state.selection.$from.parent.content.size === 0 && (providerOf(trimmed) || trimmed.startsWith(location.origin + '/@'))) {
            const url = trimmed.startsWith(location.origin) ? trimmed.slice(location.origin.length) : trimmed;
            ed.chain().focus().insertContent([{ type: 'embed', attrs: { url } }, { type: 'paragraph' }]).run();
            return true;
          }
          if (!html && /(^|\n)(#{1,6} |[-*] |\d+\. |> |```|!\[|\|.*\|)/.test(text) && ed.markdown) {
            ed.chain().focus().insertContent(ed.markdown.parse(text)).run();
            return true;
          }
          return false;
        },
        handleDrop(view, event, slice, moved) {
          if (moved) return false;
          const files = [...(event.dataTransfer?.files || [])];
          if (!files.length) return false;
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          event.preventDefault();
          insertFiles(ed, files, coords ? coords.pos : undefined);
          return true;
        },
      },
    })];
  },
});

// ---------- the view ----------

const MOTIF_LABEL = { week: 'Week', energy: 'Energy', people: 'People', network: 'Sync', stack: 'Layers', inbox: 'Inbox', bars: 'Numbers', rings: 'Quiet' };

// A drawing as a 1280×720 PNG, uploaded, for link previews and feeds.
async function drawingPNG(covers, spec) {
  const svg = covers.render(spec, null, { labels: true }).replace('<svg ', '<svg width="1280" height="720" ');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new window.Image(); // "Image" here is the editor extension
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvas.getContext('2d').drawImage(img, 0, 0, 1280, 720);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return upload(new File([blob], `${spec.motif}-${spec.seed}.png`, { type: 'image/png' }));
  } finally { URL.revokeObjectURL(url); }
}

export async function editorView(root, { me, id, go }) {
  loadCSS();
  let post = null;
  if (id) {
    try { post = await api(`/api/posts/${id}`); } catch (error) {
      root.innerHTML = `<div class="center"><div class="welcome"><h1>Can’t open this post</h1><p>${esc(error.message)}</p><a class="btn primary" href="/studio" data-nav>Back to posts</a></div></div>`;
      return;
    }
  }
  const blogs = me.blogs;
  const ws = me.workspace;
  const home = `/studio/${ws.slug}`;
  const prefixFor = (handle) => (handle === ws.slug ? `${location.host}/${ws.slug}/` : `${location.host}/${ws.slug}/@${handle}/`);
  let as = post ? post.as : (blogs.find((b) => b.own) || blogs[0] || {}).handle;
  const covers = await import('/margin/covers.js');
  const live = await import('/margin/live-covers.js');
  // A cover is the writer's choice: a photo, a drawing in the workspace's style, or none.
  const freshDrawing = () => covers.normalize({ motif: covers.MOTIFS[Math.floor(Math.random() * covers.MOTIFS.length)], look: ws.cover.look, tone: ws.cover.tone, seed: Math.floor(Math.random() * 10000) });
  let drawing = post && !post.bare && post.drawing ? post.drawing : null;
  const published = () => post && post.status === 'published';
  document.title = `${post ? post.title : 'New post'} — Studio`;

  root.innerHTML = `<div class="ed">
    <header class="ed-top">
      <a class="ed-back" href="${home}" data-nav aria-label="Back to posts">${icons.back}<span>Posts</span></a>
      <button type="button" class="ed-as" data-as></button>
      <span class="ed-status" data-status></span>
      <span class="ed-grow"></span>
      <span class="ed-count" data-count></span>
      <a class="icon-btn" data-preview target="_blank" rel="noopener" aria-label="Preview" title="Preview">${icons.eye}</a>
      <button type="button" class="btn primary small" data-publish></button>
    </header>
    <div class="ed-scroll">
      <div class="ed-page">
        <div class="ed-cover" data-cover></div>
        <textarea class="ed-title" rows="1" placeholder="Title" maxlength="160" aria-label="Title"></textarea>
        <textarea class="ed-subtitle" rows="1" placeholder="Subtitle (optional)" maxlength="280" aria-label="Subtitle"></textarea>
        <div class="ed-body" data-body></div>
      </div>
    </div>
    <div class="ed-handle" data-handle hidden><button type="button" class="ed-handle-add" aria-label="Add a block">${icons.plus}</button><button type="button" class="ed-handle-grip" draggable="true" aria-label="Drag to move, click for options">${BI.grip}</button></div>
    <div class="ed-bubble" data-bubble>
      <button type="button" data-mark="bold" aria-label="Bold">${BI.bold}</button><button type="button" data-mark="italic" aria-label="Italic">${BI.italic}</button><button type="button" data-mark="strike" aria-label="Strikethrough">${BI.strike}</button><button type="button" data-mark="code" aria-label="Code">${BI.code}</button>
      <span class="ed-bubble-sep"></span><button type="button" data-mark="link" aria-label="Link">${BI.link}</button><button type="button" data-mark="h2" aria-label="Heading">${BI.h2}</button><button type="button" data-mark="quote" aria-label="Quote">${BI.quote}</button>
    </div>
  </div>`;

  const titleEl = $('.ed-title', root);
  const subEl = $('.ed-subtitle', root);
  const statusEl = $('[data-status]', root);
  const countEl = $('[data-count]', root);
  const publishBtn = $('[data-publish]', root);
  const previewBtn = $('[data-preview]', root);
  const scroll = $('.ed-scroll', root);
  titleEl.value = post ? post.title : '';
  subEl.value = post ? post.subtitle : '';
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  let coverId = post ? post.cover_id || post.cover_url : null;
  let coverURL = post ? post.cover_url : null;

  const editor = new Editor({
    element: $('[data-body]', root),
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, underline: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }, trailingNode: true }),
      Image.configure({ inline: true }),
      Figure, Embed, Callout, MathBlock, MathInline,
      TaskList, TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Write, or press / for blocks…'), includeChildren: false }),
      CharacterCount,
      Markdown.configure({ markedOptions: { gfm: true } }),
      Extension.create({ name: 'slash', addProseMirrorPlugins() { return [Suggestion({ editor: this.editor, pluginKey: new PluginKey('slash'), ...slashMenu(() => editor) })]; } }),
      BubbleMenu.configure({
        element: $('[data-bubble]', root),
        shouldShow: ({ editor: ed, state }) => {
          const { selection } = state;
          if (selection.empty || selection instanceof NodeSelection) return false;
          if (ed.isActive('codeBlock') || ed.isActive('figure') || ed.isActive('embed')) return false;
          return true;
        },
      }),
      Drop,
    ],
    content: post ? post.markdown : '',
    contentType: 'markdown',
    autofocus: false,
    editorProps: { attributes: { class: 'ed-prose m-body', spellcheck: 'true' } },
  });

  // Markdown wrapped at a fixed width keeps its newlines inside paragraphs; outside code
  // they are just spaces, so fold them before anyone edits.
  const unwrap = (node, inCode) => {
    if (node.type === 'text' && !inCode && node.text && node.text.includes('\n')) node.text = node.text.replace(/[ \t]*\n[ \t]*/g, ' ');
    for (const child of node.content || []) unwrap(child, inCode || node.type === 'codeBlock');
    return node;
  };
  if (post) editor.commands.setContent(unwrap(editor.getJSON(), false), { emitUpdate: false });

  // ---------- saving ----------
  let dirty = false;
  let saving = false;
  let timer = null;
  let lastSaved = post ? post.updated_at : null;
  const snapshot = () => ({ title: titleEl.value.trim() || 'Untitled', subtitle: subEl.value.trim(), markdown: editor.getMarkdown(), as });
  let saved = post ? JSON.stringify({ title: post.title, subtitle: post.subtitle, markdown: editor.getMarkdown(), as: post.as }) : JSON.stringify(snapshot());

  const paintStatus = () => {
    const words = editor.storage.characterCount ? editor.storage.characterCount.words() : 0;
    countEl.textContent = words ? `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 230))} min` : '';
    if (saving) statusEl.textContent = 'Saving…';
    else if (dirty) statusEl.textContent = published() ? 'Unpublished changes' : 'Draft';
    else if (post) statusEl.textContent = published() ? 'Published' : `Draft · Saved${lastSaved ? ' ' + ago(lastSaved).replace('just now', 'now') : ''}`;
    else statusEl.textContent = 'New draft';
    publishBtn.textContent = published() ? (dirty ? 'Update' : 'Published') : 'Publish';
    publishBtn.disabled = published() && !dirty && false;
    previewBtn.href = post ? (published() ? post.url : `/studio/preview/${post.id}`) : '#';
    previewBtn.toggleAttribute('hidden', !post);
  };
  const paintAs = () => {
    const blog = blogs.find((b) => b.handle === as);
    $('[data-as]', root).innerHTML = blog ? `<img src="${esc(blog.avatar)}" alt=""><span>@${esc(blog.handle)}</span>${blogs.length > 1 ? icons.down : ''}` : '<span>No blog</span>';
  };

  async function save(extra = {}) {
    const now = snapshot();
    const key = JSON.stringify(now);
    if (key === saved && !Object.keys(extra).length) { dirty = false; paintStatus(); return post; }
    if (!post && !titleEl.value.trim() && !editor.getText().trim() && !Object.keys(extra).length) return null;
    saving = true;
    paintStatus();
    try {
      if (!post) {
        if (!coverURL && drawing && !('drawing' in extra)) extra.drawing = { motif: drawing.motif, seed: drawing.seed };
        post = await api('/api/posts', { method: 'POST', body: { ...now, ...extra } });
        history.replaceState({}, '', `/studio/write/${post.id}`);
      } else {
        post = await api(`/api/posts/${post.id}`, { method: 'PATCH', body: { ...now, ...extra } });
      }
      saved = key;
      dirty = JSON.stringify(snapshot()) !== saved;
      lastSaved = post.updated_at;
      document.title = `${post.title} — Studio`;
      return post;
    } catch (error) {
      toast(error.message);
      throw error;
    } finally {
      saving = false;
      paintStatus();
    }
  }
  const changed = () => {
    dirty = JSON.stringify(snapshot()) !== saved;
    paintStatus();
    clearTimeout(timer);
    if (dirty && !published()) timer = setTimeout(() => save().catch(() => {}), 1200);
  };
  editor.on('update', changed);
  for (const ta of [titleEl, subEl]) {
    ta.addEventListener('input', () => { grow(ta); changed(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (ta === titleEl) subEl.focus(); else editor.commands.focus('start'); }
    });
  }
  requestAnimationFrame(() => { grow(titleEl); grow(subEl); });
  window.addEventListener('beforeunload', (e) => { if (dirty && published()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function onKey(e) {
    if (!root.contains(titleEl)) { document.removeEventListener('keydown', onKey); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save().then(() => toast('Saved')).catch(() => {}); }
  });
  $('.ed-back', root).addEventListener('click', async (e) => {
    if (dirty) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (published()) { if (!confirm('Leave without updating the published post? Your changes will be lost.')) return; }
      else await save().catch(() => {});
      editor.destroy();
      go(home);
    } else editor.destroy();
  }, true);

  // ---------- cover ----------
  const coverBox = $('[data-cover]', root);
  const paintCover = () => {
    if (coverURL) {
      coverBox.innerHTML = `<div class="ed-cover-img"><img src="${esc(coverURL)}" alt=""><div class="ed-cover-tools"><button type="button" class="ed-chip" data-cover-change>Change photo</button><button type="button" class="ed-chip" data-use-drawing>Use a drawing</button><button type="button" class="ed-chip" data-cover-none>Remove</button></div></div>`;
      return;
    }
    if (!drawing) {
      coverBox.innerHTML = `<div class="ed-cover-add"><button type="button" class="ed-ghost" data-cover-add>${icons.image}<span>Add a photo</span></button><button type="button" class="ed-ghost" data-drawing>${icons.drawing}<span>Add a drawing</span></button></div>`;
      return;
    }
    coverBox.innerHTML = `<div class="ed-cover-img ed-drawn"><div class="ed-drawing"></div><div class="ed-cover-tools"><button type="button" class="ed-chip" data-drawing>Change drawing</button><button type="button" class="ed-chip" data-cover-add>Use a photo</button><button type="button" class="ed-chip" data-cover-none>Remove</button></div></div>`;
    live.mount($('.ed-drawing', coverBox), drawing);
  };
  paintCover();
  const drawingSheet = () => {
    const first = !drawing;
    if (first) drawing = freshDrawing();
    const box = h(`<div><p style="margin:0 4px 14px;color:var(--muted)">Pick what the cover draws. Move over it to see it work. ${esc(ws.name)} draws in its ${esc(ws.cover.look)} style; owners change that in Workspace.</p>
      <div class="ed-motifs">${covers.MOTIFS.map((m) => `<button type="button" class="ed-motif${m === drawing.motif ? ' on' : ''}" data-motif="${m}" aria-pressed="${m === drawing.motif}"><span class="ed-motif-art">${covers.render(covers.normalize({ ...drawing, motif: m }), null, { labels: false })}</span><span>${esc(MOTIF_LABEL[m] || m)}</span></button>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-shuffle>New variation</button></div></div>`);
    const s2 = sheet('Cover drawing', box);
    let picked = false;
    const pick = async (next) => {
      picked = true;
      drawing = covers.normalize(next);
      paintCover();
      $$('.ed-motif', box).forEach((b) => { const on = b.dataset.motif === drawing.motif; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      await save({ drawing: { motif: drawing.motif, seed: drawing.seed } }).catch(() => {});
    };
    // Opening the sheet with no cover yet shows the drawing it would add; closing without a pick keeps none.
    if (first) {
      s2.onClose = () => { if (!picked) { drawing = null; paintCover(); } };
      paintCover();
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-motif]');
      if (b) { pick({ ...drawing, motif: b.dataset.motif }); s2.close(); }
      if (e.target.closest('[data-shuffle]')) pick({ ...drawing, seed: Math.floor(Math.random() * 10000) });
    });
  };
  coverBox.addEventListener('click', async (e) => {
    if (e.target.closest('[data-drawing]')) { drawingSheet(); return; }
    if (e.target.closest('[data-use-drawing]')) { coverId = null; coverURL = null; drawing = drawing || freshDrawing(); paintCover(); await save({ cover: null, drawing: { motif: drawing.motif, seed: drawing.seed } }).catch(() => {}); return; }
    if (e.target.closest('[data-cover-none]')) { coverId = null; coverURL = null; drawing = null; paintCover(); if (post) await save({ cover: null, drawing: null }).catch(() => {}); return; }
    if (!e.target.closest('[data-cover-add], [data-cover-change]')) return;
    const file = await pickFile('image/*');
    if (!file) return;
    coverBox.innerHTML = '<div class="ed-cover-img ed-uploading"><span class="spinner"></span><span>Uploading…</span></div>';
    try {
      const media = await upload(file);
      coverId = media.url;
      coverURL = media.url;
      paintCover();
      await save({ cover: media.url });
    } catch (error) { toast(error.message); paintCover(); }
  });

  // ---------- who it is posted as ----------
  paintAs();
  $('[data-as]', root).addEventListener('click', (e) => {
    if (blogs.length < 2) return;
    menu(e.currentTarget, blogs.map((b) => ({ label: b.name, note: `@${b.handle}`, checked: b.handle === as, icon: `<img src="${esc(b.avatar)}" alt="" style="width:22px;height:22px;border-radius:50%">`, run: () => { as = b.handle; paintAs(); changed(); } })));
  });

  // ---------- formatting bar ----------
  $('[data-bubble]', root).addEventListener('mousedown', (e) => e.preventDefault());
  $('[data-bubble]', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-mark]');
    if (!b) return;
    const c = editor.chain().focus();
    const m = b.dataset.mark;
    if (m === 'bold') c.toggleBold().run();
    else if (m === 'italic') c.toggleItalic().run();
    else if (m === 'strike') c.toggleStrike().run();
    else if (m === 'code') c.toggleCode().run();
    else if (m === 'h2') c.toggleHeading({ level: 2 }).run();
    else if (m === 'quote') c.toggleBlockquote().run();
    else if (m === 'link') {
      const prev = editor.getAttributes('link').href || '';
      const url = prompt('Link address', prev);
      if (url === null) return;
      if (!url.trim()) c.extendMarkRange('link').unsetLink().run();
      else c.extendMarkRange('link').setLink({ href: url.trim() }).run();
    }
    paintBubble();
  });
  const paintBubble = () => {
    for (const b of $$('[data-mark]', root)) {
      const m = b.dataset.mark;
      const on = m === 'h2' ? editor.isActive('heading', { level: 2 }) : m === 'quote' ? editor.isActive('blockquote') : editor.isActive(m);
      b.classList.toggle('on', on);
    }
  };
  editor.on('selectionUpdate', paintBubble);

  // ---------- block handle ----------
  const handle = $('[data-handle]', root);
  let hoverPos = null;
  const blockAt = (y) => {
    const view = editor.view;
    const rect = view.dom.getBoundingClientRect();
    const hit = view.posAtCoords({ left: rect.left + 24, top: y });
    if (!hit) return null;
    const $pos = view.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
    const depth = $pos.depth >= 1 ? 1 : $pos.depth;
    const pos = depth === 0 ? hit.inside : $pos.before(1);
    if (pos == null || pos < 0) return null;
    const dom = view.nodeDOM(pos);
    return dom && dom.nodeType === 1 ? { pos, dom } : null;
  };
  scroll.addEventListener('mousemove', (e) => {
    const editorRect = editor.view.dom.getBoundingClientRect();
    if (e.clientX < editorRect.left - 80 || e.clientX > editorRect.right) { if (!handle.matches(':hover')) handle.hidden = true; return; }
    const b = blockAt(e.clientY);
    if (!b) return;
    hoverPos = b.pos;
    const r = b.dom.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(b.dom).lineHeight) || 28;
    handle.hidden = false;
    handle.style.top = `${r.top + Math.min(lh, r.height) / 2 - 14}px`;
    handle.style.left = `${editorRect.left - 62}px`;
  });
  scroll.addEventListener('scroll', () => { handle.hidden = true; }, { passive: true });
  $('.ed-handle-add', handle).addEventListener('click', () => {
    if (hoverPos == null) return;
    const node = editor.state.doc.nodeAt(hoverPos);
    const after = hoverPos + node.nodeSize;
    editor.chain().focus().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).insertContent('/').run();
  });
  const grip = $('.ed-handle-grip', handle);
  grip.addEventListener('click', (e) => {
    if (hoverPos == null) return;
    const pos = hoverPos;
    editor.chain().setNodeSelection(pos).run();
    const turn = (fn) => () => { editor.chain().focus().setTextSelection(pos + 1).run(); fn(editor.chain().focus()).run(); };
    menu(e.currentTarget, [
      { label: 'Text', icon: BI.text, run: turn((c) => c.setParagraph()) },
      { label: 'Heading', icon: BI.h2, run: turn((c) => c.setHeading({ level: 2 })) },
      { label: 'Subheading', icon: BI.h3, run: turn((c) => c.setHeading({ level: 3 })) },
      { label: 'Bulleted list', icon: BI.bullet, run: turn((c) => c.toggleBulletList()) },
      { label: 'Quote', icon: BI.quote, run: turn((c) => c.toggleBlockquote()) },
      { label: 'Callout', icon: BI.callout, run: turn((c) => c.wrapIn('callout', { kind: 'note' })) },
      '-',
      { label: 'Duplicate', icon: icons.copy, run: () => { const n = editor.state.doc.nodeAt(pos); editor.chain().focus().insertContentAt(pos + n.nodeSize, n.toJSON()).run(); } },
      { label: 'Move up', icon: I('<path d="m18 15l-6-6l-6 6"/>'), run: () => move(pos, -1) },
      { label: 'Move down', icon: icons.down, run: () => move(pos, 1) },
      { label: 'Delete', icon: icons.trash, danger: true, run: () => { const n = editor.state.doc.nodeAt(pos); editor.chain().focus().deleteRange({ from: pos, to: pos + n.nodeSize }).run(); } },
    ]);
  });
  const move = (pos, dir) => {
    const { state } = editor;
    const $pos = state.doc.resolve(pos);
    const index = $pos.index(0);
    const node = state.doc.child(index);
    const target = index + dir;
    if (target < 0 || target >= state.doc.childCount) return;
    const other = state.doc.child(target);
    const tr = state.tr;
    if (dir < 0) {
      const from = pos - other.nodeSize;
      tr.delete(pos, pos + node.nodeSize).insert(from, node);
    } else {
      tr.delete(pos, pos + node.nodeSize).insert(pos + other.nodeSize, node);
    }
    editor.view.dispatch(tr.scrollIntoView());
  };
  grip.addEventListener('dragstart', (e) => {
    if (hoverPos == null) return;
    const view = editor.view;
    const sel = NodeSelection.create(view.state.doc, hoverPos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = sel.content();
    view.dragging = { slice, move: true };
    const dom = view.nodeDOM(hoverPos);
    if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });

  // ---------- publish ----------
  publishBtn.addEventListener('click', () => publishSheet());
  function publishSheet() {
    const blog = blogs.find((b) => b.handle === as) || { handle: as };
    const form = h(`<form novalidate>
      <div class="group">
        <div class="field"><label>Post as</label><select class="select" data-f-as>${blogs.map((b) => `<option value="${esc(b.handle)}"${b.handle === as ? ' selected' : ''}>${esc(b.name)} (@${esc(b.handle)})</option>`).join('')}</select></div>
        <div class="field"><label for="f-slug">Address</label><div class="ed-slug"><span data-prefix>${esc(prefixFor(blog.handle))}</span><input id="f-slug" class="input" maxlength="100" autocapitalize="none" spellcheck="false" value="${esc(post ? post.slug : '')}" placeholder="from-the-title"></div><small>${published() ? 'Changing it keeps the old address working.' : 'Made from the title until you publish.'}</small></div>
        <div class="field"><label for="f-desc">Search and social description</label><textarea id="f-desc" class="textarea" rows="2" maxlength="300" placeholder="${esc(post ? post.excerpt || '' : '')}">${esc(post ? post.description && post.description !== post.subtitle && post.description !== post.excerpt ? post.description : '' : '')}</textarea></div>
        <div class="field"><label for="f-tags">Topics</label><input id="f-tags" class="input" maxlength="200" placeholder="design, engineering" value="${esc(post ? post.tags.map((t) => t.name).join(', ') : '')}"><small>Up to 8, separated by commas.</small></div>
        ${coverURL ? `<div class="field"><label for="f-alt">Cover description</label><input id="f-alt" class="input" maxlength="200" value="${esc(post && post.cover ? post.cover.alt : '')}" placeholder="What the cover shows"></div>` : ''}
        ${ws.admin ? `<label class="row link"><span class="row-main"><span class="row-title" style="font-weight:500">Pin on ${esc(ws.name)}’s home</span></span><span class="switch"><input type="checkbox" data-f-featured${post && post.featured ? ' checked' : ''}><span></span></span></label>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${published() ? '<button type="button" class="btn" data-unpublish>Unpublish</button><span style="flex:1"></span>' : ''}<button class="btn primary" type="submit">${published() ? 'Update post' : 'Publish now'}</button></div>
    </form>`);
    const s = sheet(published() ? 'Update post' : 'Publish', form);
    $('[data-f-as]', form).addEventListener('change', (e) => { $('[data-prefix]', form).textContent = prefixFor(e.target.value); });
    $('#f-slug', form).addEventListener('input', (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'); });
    $('[data-unpublish]', form)?.addEventListener('click', async () => {
      if (!confirm('Take this post down? It becomes a draft again, and its address stops working until you publish.')) return;
      try { await save({ status: 'draft' }); s.close(); toast('Unpublished'); } catch { /* toast shown */ }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!titleEl.value.trim()) { s.close(); titleEl.focus(); toast('Give it a title first.'); return; }
      as = $('[data-f-as]', form).value;
      paintAs();
      const extra = { status: 'published', tags: $('#f-tags', form).value.split(',').map((t) => t.trim()).filter(Boolean), description: $('#f-desc', form).value.trim() };
      const slug = $('#f-slug', form).value.replace(/^-+|-+$/g, '');
      if (slug && (!post || slug !== post.slug)) extra.slug = slug;
      if ($('#f-alt', form)) extra.cover_alt = $('#f-alt', form).value;
      if (ws.admin) extra.featured = $('[data-f-featured]', form).checked;
      try {
        const was = published();
        // Link previews need a plain image: save the drawing as one.
        if (!coverURL && drawing) {
          const png = await drawingPNG(covers, drawing).catch((error) => { console.warn('cover image', error); return null; });
          if (png) extra.cover_png = png.id;
          extra.drawing = { motif: drawing.motif, seed: drawing.seed };
        }
        await save(extra);
        s.close();
        const url = location.origin + post.url;
        const done = h(`<div style="text-align:center;padding:8px 8px 4px"><div class="empty-icon" style="margin:0 auto 14px">${icons.check}</div>
          <h2 style="margin:0 0 6px;font-size:21px">${was ? 'Updated' : 'Published'}</h2><p style="margin:0 0 18px;color:var(--muted)">It’s live at</p>
          <div class="code-box" style="margin-bottom:16px;text-align:left"><span>${esc(url)}</span><button class="btn small" data-copy>${icons.copy}</button></div>
          <div style="display:flex;gap:8px;justify-content:center"><a class="btn primary" href="${esc(post.url)}" target="_blank" rel="noopener">View post</a><a class="btn" href="${home}" data-nav>Back to posts</a></div></div>`);
        const s2 = sheet(post.title, done);
        $('[data-copy]', done).addEventListener('click', () => copy(url, 'Link copied'));
        $$('[data-nav]', done).forEach((a) => a.addEventListener('click', () => { s2.close(); editor.destroy(); }));
      } catch { /* toast shown */ }
    });
  }

  paintStatus();
  // The workspace's style changed since this post's image was saved: make a fresh one.
  if (published() && !coverURL && drawing && post.cover && post.cover.stale_image) {
    drawingPNG(covers, drawing).then((png) => png && api(`/api/posts/${post.id}`, { method: 'PATCH', body: { cover_png: png.id } })).catch((error) => console.warn('cover image', error));
  }
  window.marginEditor = editor;
  if (!post) setTimeout(() => titleEl.focus(), 50);
}
