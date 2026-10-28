// The deck format and its check. shape() refuses what is not a deck at all (a 400 for
// anyone); check() lists what will look wrong or not show. Claude's saves must have no
// errors; a person's saves from the studio keep going and show the list instead, since a
// half-typed slide is normal while editing. guide.md describes the same format in prose.
import { reject } from './lib/util.js';

export const LAYOUTS = ['title', 'statement', 'three', 'flow', 'shot', 'numbers', 'cta'];
export const ACCENTS = ['cobalt', 'pine', 'plum', 'amber', 'coral', 'graphite'];
export const MAX_SLIDES = 60;
export const MAX_BYTES = 200 * 1024;
// Pictures that ship with the app, usable in any deck.
export const BUILT_IN = ['/img/sample-shot.webp'];
export const MEDIA = /^\/media\/([a-z0-9]{6,20})(?:-(?:w\d{3,4}|og))?\.[a-z0-9]{2,5}$/;

const LIMIT = { notes: 4000, text: 600, default: 400 };

// A deep copy with plain JSON values only, bounded in depth and string length.
function plain(value, key, depth) {
  if (depth > 6) reject(400, 'invalid_deck', 'The deck is nested too deeply.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const max = LIMIT[key] || LIMIT.default;
    if (value.length > max) reject(400, 'invalid_deck', `A "${key}" is ${value.length} characters; ${max} at most.`);
    return value.replace(/\r\n?/g, '\n');
  }
  if (Array.isArray(value)) {
    if (value.length > 40) reject(400, 'invalid_deck', `A list ("${key}") has ${value.length} items; 40 at most.`);
    return value.map((v) => plain(v, key, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (v !== undefined) out[k] = plain(v, k, depth + 1);
    }
    return out;
  }
  return null;
}

export function shape(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) reject(400, 'invalid_deck', 'A deck is a JSON object with "title" and "slides".');
  const size = JSON.stringify(content).length;
  if (size > MAX_BYTES) reject(413, 'too_large', `This deck is ${Math.round(size / 1024)} KB; ${MAX_BYTES / 1024} KB at most.`);
  const deck = plain(content, 'deck', 0);
  for (const key of ['title', 'description', 'lang', 'brand', 'accent']) {
    if (deck[key] != null && typeof deck[key] !== 'string') reject(400, 'invalid_deck', `"${key}" must be text.`);
  }
  if (deck.title && deck.title.length > 120) reject(400, 'invalid_deck', 'The title is 120 characters at most.');
  if (!Array.isArray(deck.slides) || !deck.slides.length) reject(400, 'invalid_deck', '"slides" must be a list with at least one slide.');
  if (deck.slides.length > MAX_SLIDES) reject(400, 'invalid_deck', `A deck has ${MAX_SLIDES} slides at most.`);
  deck.slides.forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) reject(400, 'invalid_deck', `Slide ${i + 1} must be an object with a "layout".`);
  });
  return deck;
}

const str = (v) => typeof v === 'string' && v.trim() !== '';
export function hrefOK(v) {
  return typeof v === 'string' && (/^(https?:|mailto:|tel:)/i.test(v) || /^\/(?!\/)/.test(v) || /^#\d+$/.test(v));
}
const linkHref = (link) => (link && typeof link === 'object' ? link.href : link);

// hasMedia(id): whether a /media file belongs to the deck's workspace.
export function check(deck, { hasMedia = () => true } = {}) {
  const errors = [];
  const warnings = [];
  if (!str(deck.title)) warnings.push('The deck has no "title" (shown in the tab and in link previews).');
  if (!str(deck.description)) warnings.push('The deck has no "description" (shown in link previews).');
  if (deck.accent != null && !ACCENTS.includes(deck.accent)) errors.push(`"accent" is one of ${ACCENTS.join(', ')}.`);
  const n = deck.slides.length;
  const image = (at, src) => {
    if (!str(src)) return errors.push(`${at}: needs "image".`);
    if (/^https:\/\//i.test(src)) return;
    const m = MEDIA.exec(src);
    if (m) { if (!hasMedia(m[1])) errors.push(`${at}: ${src} is not in this workspace's library (assets_list shows what is).`); return; }
    if (!BUILT_IN.includes(src)) errors.push(`${at}: "image" is a /media address from the library, ${BUILT_IN.join(', ')}, or an https:// URL.`);
  };
  const jump = (at, href) => {
    const m = /^#(\d+)$/.exec(href || '');
    if (m && (Number(m[1]) < 1 || Number(m[1]) > n)) warnings.push(`${at}: link ${href} points past the last slide (${n}).`);
  };
  deck.slides.forEach((s, i) => {
    const at = `Slide ${i + 1} (${s.layout || 'no layout'})`;
    const need = (cond, msg) => { if (!cond) errors.push(`${at}: ${msg}`); };
    const warn = (cond, msg) => { if (!cond) warnings.push(`${at}: ${msg}`); };
    if (!LAYOUTS.includes(s.layout)) { errors.push(`${at}: unknown layout; use ${LAYOUTS.join(', ')}.`); return; }
    if (s.notes != null) need(typeof s.notes === 'string', '"notes" must be text.');
    for (const key of ['kicker', 'title', 'lead']) if (s[key] != null) need(typeof s[key] === 'string', `"${key}" must be text.`);
    switch (s.layout) {
      case 'title':
        need(str(s.title), 'needs "title".');
        break;
      case 'statement':
        need(str(s.text), 'needs "text".');
        if (str(s.emphasis)) need(typeof s.text === 'string' && s.text.includes(s.emphasis), '"emphasis" must appear word for word in "text".');
        warn(!str(s.text) || s.text.length <= 140, `"text" is ${String(s.text).length} characters; over 140 gets crowded.`);
        break;
      case 'three': {
        const cards = s.cards;
        need(Array.isArray(cards) && cards.length >= 2 && cards.length <= 4, '"cards" needs 2–4 items (3 is the design).');
        for (const [k, c] of (Array.isArray(cards) ? cards : []).entries()) {
          need(c && typeof c === 'object', `card ${k + 1} must be an object.`);
          if (!c || typeof c !== 'object') continue;
          need(str(c.name), `card ${k + 1} needs "name".`);
          if (c.bullets != null) need(Array.isArray(c.bullets) && c.bullets.every((b) => typeof b === 'string'), `card ${k + 1} "bullets" is a list of text.`);
          warn(!Array.isArray(c.bullets) || c.bullets.length <= 3, `card ${k + 1} has more than 3 bullets.`);
          if (c.link) { need(hrefOK(linkHref(c.link)), `card ${k + 1} link must be https://, mailto:, /path or #n.`); jump(`${at} card ${k + 1}`, linkHref(c.link)); }
        }
        break;
      }
      case 'flow': {
        const steps = s.steps;
        need(Array.isArray(steps) && steps.length >= 2 && steps.length <= 6, '"steps" needs 2–6 items (3–5 is the design).');
        for (const [k, st] of (Array.isArray(steps) ? steps : []).entries()) need(st && str(st.label), `step ${k + 1} needs "label".`);
        break;
      }
      case 'shot': {
        image(at, s.image);
        warn(str(s.alt) || str(s.caption), 'add "alt" or "caption" to describe the image.');
        if (s.callouts != null) need(Array.isArray(s.callouts) && s.callouts.length <= 8, '"callouts" is a list of up to 8.');
        for (const [k, c] of (Array.isArray(s.callouts) ? s.callouts : []).entries()) {
          if (!c || typeof c !== 'object') { errors.push(`${at}: callout ${k + 1} must be an object.`); continue; }
          for (const key of ['x', 'y', 'w', 'h']) {
            if (c[key] == null) continue;
            need(typeof c[key] === 'number' && c[key] >= 0 && c[key] <= 100, `callout ${k + 1} "${key}" must be a number 0–100 (percent of the image).`);
          }
          need(c.x != null && c.y != null, `callout ${k + 1} needs "x" and "y".`);
          need((c.w == null) === (c.h == null), `callout ${k + 1} needs both "w" and "h" for a box, or neither for a pin.`);
        }
        break;
      }
      case 'numbers': {
        const stats = s.stats;
        need(Array.isArray(stats) && stats.length >= 1 && stats.length <= 4, '"stats" needs 1–4 items (2–4 is the design).');
        for (const [k, st] of (Array.isArray(stats) ? stats : []).entries()) {
          need(st && str(st.value), `stat ${k + 1} needs "value".`);
          warn(st && str(st.source), `stat ${k + 1} has no "source".`);
        }
        break;
      }
      case 'cta': {
        need(str(s.title), 'needs "title" (the ask).');
        if (s.steps != null) need(Array.isArray(s.steps) && s.steps.length <= 6, '"steps" is a list of up to 6.');
        for (const [k, st] of (Array.isArray(s.steps) ? s.steps : []).entries()) need(st && str(st.text), `step ${k + 1} needs "text".`);
        need(s.buttons == null || (Array.isArray(s.buttons) && s.buttons.length <= 2), 'at most 2 "buttons".');
        for (const [k, b] of (Array.isArray(s.buttons) ? s.buttons : []).entries()) {
          need(b && str(b.label), `button ${k + 1} needs "label".`);
          need(b && hrefOK(b.href), `button ${k + 1} "href" must be https://, mailto:, /path or #n.`);
          if (b) jump(`${at} button ${k + 1}`, b.href);
        }
        break;
      }
    }
  });
  return { ok: !errors.length, errors, warnings };
}

// Every /media id a deck uses, for the library's "used in" counts and link previews.
export function mediaIds(deck) {
  const ids = [];
  for (const s of deck.slides || []) {
    const m = s && typeof s.image === 'string' ? MEDIA.exec(s.image) : null;
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// A one-line name for a slide, for history, notes and Claude's summaries.
export function slideName(s) {
  const t = (v) => (typeof v === 'string' ? v.trim() : '');
  return t(s && s.title) || t(s && s.text) || (s && s.layout) || 'Untitled';
}
