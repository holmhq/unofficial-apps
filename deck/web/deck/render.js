// Deck's slide renderer, shared by the viewer, the studio and every thumbnail. A slide is
// built from its JSON as DOM; text is always set as text, never as HTML. With edit: true the
// words become editable in place: each editable element carries data-path, the field it
// writes (such as "title" or "cards.1.bullets.0"), and the studio listens for input.

export const ACCENTS = ['cobalt', 'pine', 'plum', 'amber', 'coral', 'graphite'];
export const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="4.5" width="12" height="9" rx="1.8" fill="currentColor" opacity=".5"/><rect x="4.5" y="9" width="12" height="10" rx="1.8" fill="currentColor"/></svg>';

// ---- Small DOM helper ----

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'vars') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, String(v));
    else if (key === 'html') el.innerHTML = value; // constant icon strings only
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}
export const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
export const mark = () => h('span', { class: 'mark', 'aria-hidden': 'true', html: MARK });

export function safeHref(value) {
  const v = text(value);
  if (!v) return '';
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (/^#\d+$/.test(v)) return v;
  return '';
}
export function safeSrc(value) {
  const v = text(value);
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) return '';
  return v.startsWith('/') ? v : '/' + v.replace(/^\.\//, '');
}
function safeColor(value) {
  const v = text(value);
  return v && CSS.supports('color', v) && !/url\(|var\(/i.test(v) ? v : '';
}
function hostOf(href) {
  try { return new URL(href, location.href).host.replace(/^www\./, ''); } catch { return ''; }
}
function link(value, fallbackLabel) {
  // A link is "https://..." or { "href": "...", "label": "..." }.
  const href = safeHref(typeof value === 'object' && value ? value.href : value);
  if (!href) return null;
  const label = text(value && value.label) || fallbackLabel || hostOf(href);
  const external = /^https?:/i.test(href) && hostOf(href) !== location.host;
  return { href, label, external };
}
const pct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

export function accentOf(content) {
  return content && ACCENTS.includes(content.accent) ? content.accent : 'cobalt';
}

// A library picture comes in several widths; let the browser pick.
const MEDIA = /^\/media\/([a-z0-9]{6,20})\.(jpg|png|webp|avif)$/;
function srcset(src) {
  const m = MEDIA.exec(src);
  if (!m) return null;
  const ext = m[2] === 'png' ? 'png' : 'jpg';
  return [640, 1280, 2048].map((w) => `/media/${m[1]}-w${w}.${ext} ${w}w`).join(', ');
}

// ---- Editable text ----

// The element shows a field's words; in edit mode it can be typed into. Empty optional fields
// are left out of the slide (the inspector fills them); required ones show a placeholder.
function words(tag, attrs, value, ctx, path, placeholder) {
  const el = h(tag, attrs, value);
  if (ctx.edit && path) {
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'true');
    el.dataset.path = path;
    if (placeholder) el.dataset.ph = placeholder;
  }
  return el;
}
const shown = (value, ctx, required) => !!value || (ctx.edit && required);

function head(s, ctx, opts = {}) {
  const kicker = text(s.kicker), title = text(s.title), lead = text(s.lead);
  if (!kicker && !title && !lead && !ctx.edit) return null;
  return h('div', { class: 'head' },
    kicker && words('span', { class: 'kicker a' }, kicker, ctx, 'kicker'),
    shown(title, ctx, true) && words(opts.tag || 'h2', { class: `h a ${opts.titleClass || ''}` }, title, ctx, 'title', 'Title'),
    lead && words('p', { class: 'lead a' }, lead, ctx, 'lead'),
  );
}

// ---- Layouts ----

const layouts = {
  title(s, ctx) {
    const byline = text(s.byline), date = text(s.date);
    return [
      h('div', { class: 'title-top a' }, mark(), ctx.brand),
      h('div', { class: 'title-main' },
        text(s.kicker) && words('span', { class: 'kicker a' }, text(s.kicker), ctx, 'kicker'),
        words('h1', { class: 'hero a' }, text(s.title) || (ctx.edit ? '' : text(ctx.content.title)), ctx, 'title', 'Title'),
        text(s.subtitle) && words('p', { class: 'subtitle a' }, text(s.subtitle), ctx, 'subtitle'),
        (byline || date) && h('p', { class: 'byline a' }, h('i', { class: 'rule' }),
          byline && words('span', {}, byline, ctx, 'byline'),
          date && words('span', { class: 'date' }, date, ctx, 'date')),
      ),
    ];
  },

  statement(s, ctx) {
    const sentence = text(s.text);
    const emphasis = text(s.emphasis);
    const p = words('p', { class: 'statement a' }, '', ctx, 'text', 'One sentence the room should remember');
    const at = emphasis ? sentence.indexOf(emphasis) : -1;
    if (at >= 0) p.append(sentence.slice(0, at), h('mark', { class: 'emph' }, emphasis), sentence.slice(at + emphasis.length));
    else p.append(sentence);
    return [
      text(s.kicker) && words('span', { class: 'kicker a' }, text(s.kicker), ctx, 'kicker'),
      p,
      text(s.source) && words('p', { class: 'source a' }, text(s.source), ctx, 'source'),
    ];
  },

  three(s, ctx) {
    const cards = list(s.cards).slice(0, 4);
    return [
      head(s, ctx),
      h('div', { class: 'cards', vars: { '--n': cards.length || 3 } }, cards.map((card, k) => {
        card = card || {};
        const name = text(card.name);
        const accent = safeColor(card.accent);
        const l = link(card.link, text(card.linkLabel));
        const bullets = list(card.bullets);
        return h('article', { class: 'card a', vars: accent ? { '--c': accent } : null },
          h('div', { class: 'card-top' },
            h('span', { class: 'card-mark', 'aria-hidden': 'true' }, h('span', {}, (name[0] || '•').toUpperCase())),
            words('h3', { class: 'card-name' }, name, ctx, `cards.${k}.name`, 'Name')),
          shown(text(card.role), ctx, false) && words('p', { class: 'card-role' }, text(card.role), ctx, `cards.${k}.role`),
          bullets.length > 0 && h('ul', { class: 'card-list' }, bullets.map((b, j) => words('li', {}, text(b), ctx, `cards.${k}.bullets.${j}`, 'A short point'))),
          l && h('a', { class: 'card-link', href: l.href, target: l.external ? '_blank' : null, rel: l.external ? 'noopener' : null },
            h('span', {}, l.label), l.external && l.label !== hostOf(l.href) && h('span', { class: 'host' }, hostOf(l.href))),
        );
      })),
    ];
  },

  flow(s, ctx) {
    const steps = list(s.steps).slice(0, 6);
    return [
      head(s, ctx),
      h('ol', { class: 'flow', vars: { '--n': steps.length || 4 } }, steps.map((step, k) => h('li', { class: 'step' },
        h('div', { class: 'step-track' },
          h('span', { class: 'node a pop', 'aria-hidden': 'true' }, k + 1),
          k < steps.length - 1 && h('span', { class: 'wire', vars: { '--k': k } }, h('i'))),
        words('h3', { class: 'step-label a' }, text(step && step.label), ctx, `steps.${k}.label`, 'Step'),
        text(step && step.detail) && words('p', { class: 'step-detail a' }, text(step.detail), ctx, `steps.${k}.detail`),
      ))),
    ];
  },

  shot(s, ctx) {
    const callouts = list(s.callouts).filter((c) => c && c.x != null && c.y != null);
    const caption = text(s.caption);
    const side = caption || callouts.some((c) => text(c.label));
    const src = safeSrc(s.image);
    const set = src && srcset(src);
    const frame = h('figure', { class: 'shot-frame a' },
      src
        ? h('img', { src, srcset: set, sizes: set ? ctx.imgSizes || '(max-width: 900px) 100vw, 64vw' : null, alt: text(s.alt) || caption || text(s.title), decoding: 'async', loading: ctx.lazy ? 'lazy' : null, draggable: 'false' })
        : h('span', { class: 'shot-empty' }, ctx.edit ? 'Choose a picture' : ''),
      callouts.map((c, k) => {
        const box = c.w != null && c.h != null;
        return h('span', {
          class: `co a pop ${box ? 'box' : 'pin'}`, 'data-callout': k,
          vars: { left: pct(c.x) + '%', top: pct(c.y) + '%', ...(box ? { width: pct(c.w) + '%', height: pct(c.h) + '%' } : {}) },
          'aria-hidden': 'true',
        }, h('span', { class: 'pin-n' }, k + 1));
      }),
    );
    return [
      head(s, ctx),
      h('div', { class: `shot${side ? ' has-side' : ''}` },
        h('div', { class: 'shot-area' }, frame),
        side && h('div', { class: 'shot-side' },
          caption && words('p', { class: 'shot-caption a' }, caption, ctx, 'caption'),
          callouts.length > 0 && h('ol', { class: 'shot-legend' }, callouts.map((c, k) => (text(c.label) || ctx.edit) && h('li', { class: 'a' }, h('span', { class: 'pin-n' }, k + 1), words('span', {}, text(c.label), ctx, `callouts.${list(s.callouts).indexOf(c)}.label`, 'What to notice')))),
        ),
      ),
    ];
  },

  numbers(s, ctx) {
    const stats = list(s.stats).slice(0, 4);
    return [
      head(s, ctx),
      h('div', { class: 'stats', 'data-n': stats.length, vars: { '--n': stats.length || 3 } }, stats.map((stat, k) => h('div', { class: 'stat a' },
        ctx.edit ? words('p', { class: 'stat-value' }, text(stat && stat.value), ctx, `stats.${k}.value`, '42%') : statValue(text(stat && stat.value)),
        shown(text(stat && stat.label), ctx, true) && words('p', { class: 'stat-label' }, text(stat && stat.label), ctx, `stats.${k}.label`, 'What it measures'),
        text(stat && stat.source) && words('p', { class: 'stat-source' }, text(stat.source), ctx, `stats.${k}.source`),
      ))),
    ];
  },

  cta(s, ctx) {
    const steps = list(s.steps);
    const buttons = list(s.buttons).slice(0, 2).map((b, k) => {
      const l = link(b, text(b && b.label));
      if (!l) return null;
      const primary = b.style ? b.style === 'primary' : k === 0;
      return h('a', { class: `btn${primary ? ' primary' : ''}`, href: l.href, target: l.external ? '_blank' : null, rel: l.external ? 'noopener' : null }, l.label);
    }).filter(Boolean);
    return [
      h('div', { class: 'cta-main' },
        text(s.kicker) && words('span', { class: 'kicker a' }, text(s.kicker), ctx, 'kicker'),
        words('h2', { class: 'h cta-title a' }, text(s.title), ctx, 'title', 'The ask'),
        text(s.lead) && words('p', { class: 'lead a' }, text(s.lead), ctx, 'lead'),
        buttons.length > 0 && h('div', { class: 'cta-buttons a' }, buttons),
      ),
      steps.length > 0 && h('ol', { class: 'cta-steps' }, steps.map((step, k) => h('li', { class: 'cta-step a' },
        h('span', { class: 'cta-n', 'aria-hidden': 'true' }, k + 1),
        words('span', { class: 'cta-text' }, text(step && step.text), ctx, `steps.${k}.text`, 'A concrete step'),
        (text(step && step.owner) || text(step && step.date)) && h('span', { class: 'cta-meta' },
          text(step.owner) && words('span', { class: 'owner' }, text(step.owner), ctx, `steps.${k}.owner`),
          text(step.date) && words('span', { class: 'when' }, text(step.date), ctx, `steps.${k}.date`)),
      ))),
    ];
  },

  // Unknown layouts still show their words instead of a blank sheet.
  plain(s, ctx) {
    const bullets = list(s.bullets);
    return [
      head(s, { ...ctx, edit: false }),
      text(s.text) && h('p', { class: 'plain-text a' }, text(s.text)),
      bullets.length > 0 && h('ul', { class: 'plain-list' }, bullets.map((b) => h('li', { class: 'a' }, text(b)))),
    ];
  },
};

// "42%", "NOK 1,200", "3×", "18 months": the number counts up; the rest is its unit.
function statValue(value) {
  const el = h('p', { class: 'stat-value' });
  const m = value.match(/^(\D*?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(.*)$/s);
  if (!m) { el.append(value); return el; }
  const [, pre, num, suf] = m;
  const affix = (s, side) => {
    const t = s.trim();
    if (!t) return null;
    return h('span', { class: t.length <= 1 ? 'affix' : `unit${side === 'pre' ? ' pre' : ''}` }, t);
  };
  const decimals = (num.split('.')[1] || '').length;
  el.append(
    affix(pre, 'pre') || '',
    h('span', { class: 'stat-num', 'data-to': num.replace(/,/g, ''), 'data-dec': decimals, 'data-sep': num.includes(',') ? '1' : '', 'data-final': num }, num),
    affix(suf, 'suf') || '',
  );
  return el;
}

export function slideTitle(s) {
  return text(s && s.title) || text(s && s.text) || text(s && s.layout) || 'Untitled';
}
export const known = (s) => !!s && Object.hasOwn(layouts, s.layout) && s.layout !== 'plain';

// One slide of a deck as a <section class="slide">. opts: edit (words become editable),
// fan (a cover shows the next slides beside it; default true), imgSizes, lazy.
export function renderSlide(content, i, opts = {}) {
  const slides = list(content.slides);
  const s = slides[i] || {};
  const n = slides.length;
  const kind = known(s) ? s.layout : 'plain';
  const ctx = { content, brand: text(content.brand), edit: !!opts.edit, imgSizes: opts.imgSizes, lazy: opts.lazy };
  const sheet = h('div', { class: 'sheet' },
    h('div', { class: 'body' }, layouts[kind](s, ctx)),
    kind !== 'title' && h('footer', { class: 'foot' },
      h('span', { class: 'foot-brand' }, ctx.brand && [mark(), ctx.brand]),
      h('span', { class: 'foot-n' }, h('b', {}, i + 1), ` / ${n}`)),
  );
  const el = h('section', { class: `slide l-${kind}`, 'data-accent': accentOf(content), 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${n}` }, sheet);
  el.querySelectorAll('.a').forEach((a, k) => a.style.setProperty('--i', k));
  if (kind === 'title' && s.preview !== false && opts.fan !== false) addFan(el, content, i, opts);
  return el;
}

// The cover shows what is coming: live miniatures of the next three slides, fanned like a
// hand of cards. Slides size everything in container units, so a miniature scales cleanly.
function addFan(cover, content, index, opts) {
  const upcoming = [];
  const slides = list(content.slides);
  for (let k = index + 1; k < slides.length && upcoming.length < 3; k++) if (slides[k] && slides[k].layout !== 'title') upcoming.push(k);
  if (upcoming.length < 2) return;
  const fan = h('div', { class: 'fan', 'aria-hidden': 'true' }, upcoming.map((k, j) => {
    const copy = renderSlide(content, k, { fan: false, imgSizes: '30vw', lazy: true });
    copy.removeAttribute('aria-label');
    copy.removeAttribute('aria-roledescription');
    copy.querySelectorAll('a, button').forEach((a) => { a.setAttribute('tabindex', '-1'); a.removeAttribute('href'); });
    copy.querySelectorAll('.stat-num').forEach((x) => x.classList.remove('stat-num'));
    copy.querySelectorAll('img').forEach((img) => { img.alt = ''; });
    return h('div', { class: 'fan-card', vars: { '--k': j } }, copy);
  }).reverse());
  cover.querySelector('.sheet').append(fan);
  cover.classList.add('has-fan');
}

// A slide at a fixed 16:9 size, for lists and the studio.
export function thumb(content, i, opts = {}) {
  const box = h('div', { class: `frame${opts.class ? ' ' + opts.class : ''}` });
  box.append(renderSlide(content, i, { imgSizes: opts.imgSizes || '320px', lazy: true, fan: opts.fan }));
  return box;
}

// ---- Counting numbers ----

const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
function formatNumber(v, dec, sep) {
  return sep ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
}
export function countUp(slide) {
  slide.querySelectorAll('.stat-num').forEach((el, k) => {
    cancelAnimationFrame(el._raf);
    const to = Number(el.dataset.to), dec = Number(el.dataset.dec), sep = !!el.dataset.sep, final = el.dataset.final;
    if (reduceMQ.matches || !(to >= 2)) { el.textContent = final; return; }
    const t0 = performance.now() + 260 + k * 110, dur = 1150;
    el.textContent = formatNumber(0, dec, sep);
    const tick = (t) => {
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = p >= 1 ? final : formatNumber(to * eased, dec, sep);
      if (p < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  });
}
export function finishCounters(root = document) {
  root.querySelectorAll('.stat-num').forEach((el) => { cancelAnimationFrame(el._raf); el.textContent = el.dataset.final; });
}
