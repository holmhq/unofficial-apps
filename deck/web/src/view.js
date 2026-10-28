// The viewer. /s/<sid> shows a shared deck, /e/<sid> the same inside another site's iframe,
// and /p/<did> lets a workspace member present (from the studio's Present button). A deck
// that follows its latest save reloads in place when it changes, on the same slide.
import { h, text, mark, renderSlide, slideTitle, countUp, finishCounters, accentOf } from '/deck/render.js?v=0.2.0';
import { subscribe } from '/src/live.js?v=0.2.0';

const root = document.documentElement;
const deckEl = document.getElementById('deck');
const notesEl = document.getElementById('notes');
const controlsEl = document.getElementById('controls');
const progressEl = document.querySelector('#progress i');

const stackMQ = matchMedia('screen and (orientation: portrait) and (max-width: 900px)');
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const embedded = root.hasAttribute('data-embed');

const ICONS = {
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
  notes: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 6h6M5 8.5h6M5 11h3.5"/></svg>',
  full: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M13.5 2.5 8 8M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
};

// ---- Theme ----

function systemTheme() { return darkMQ.matches ? 'dark' : 'light'; }
darkMQ.addEventListener('change', () => { if (!root.dataset.forced) root.dataset.theme = systemTheme(); });
// Paper and PDFs print light unless ?theme=dark asked for dark.
addEventListener('beforeprint', () => {
  if (new URLSearchParams(location.search).get('theme') !== 'dark') root.dataset.theme = 'light';
  finishCounters();
});
addEventListener('afterprint', () => { root.dataset.theme = root.dataset.forced || systemTheme(); });

// ---- Routing ----

let source = null; // { kind: 's' | 'p', id, rev }

function route() {
  const path = location.pathname.replace(/\/+$/, '');
  let m = /^\/(s|e)\/([a-z0-9]{16})$/.exec(path);
  if (m) { source = { kind: 's', id: m[2] }; return load(); }
  if (path === '/sample') { source = { kind: 'sample', id: 'sample' }; return load(); }
  m = /^\/p\/([a-z0-9]{12})$/.exec(path);
  if (m) {
    const rev = new URLSearchParams(location.search).get('rev');
    source = { kind: 'p', id: m[1], rev: /^\d+$/.test(rev || '') ? rev : null };
    return load();
  }
  notFound();
}

function endpoint() {
  if (source.kind === 's') return `/api/s/${source.id}`;
  if (source.kind === 'sample') return '/api/sample';
  return `/api/decks/${source.id}/present${source.rev ? `?rev=${source.rev}` : ''}`;
}

let live = null;
async function load(again = false) {
  let res;
  try { res = await fetch(endpoint(), { cache: 'no-store', headers: { accept: 'application/json' }, credentials: 'same-origin' }); } catch {
    if (!again) message('This deck could not load', 'The connection dropped before the deck arrived. Check the network and reload the page.');
    return;
  }
  if (res.status === 401 && source.kind === 'p') { location.href = `/auth/login?return_to=${encodeURIComponent(location.pathname + location.search)}`; return; }
  if (!res.ok) { if (!again || res.status === 404) notFound(); return; }
  const data = await res.json().catch(() => null);
  if (!data || !data.content || !Array.isArray(data.content.slides) || !data.content.slides.length) { message('This deck is empty', 'It has no slides yet.'); return; }
  start(data.content, again);
  if (data.live && data.channel && !live) live = subscribe(data.channel, onLive);
  if (!again && source.kind === 's' && !new URLSearchParams(location.search).has('print')) startReading();
}

let reloadTimer = 0;
function onLive(m) {
  if (m.type === 'ready') { if (m.again) load(true); return; }
  if (m.type === 'gone') { live?.(); live = null; message('This link was turned off', 'Whoever shared this deck stopped sharing it. Ask them for a new link.'); return; }
  if (m.type === 'saved') {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      await load(true);
      if (source.kind === 'p') cue(m.by === 'claude' ? `<b>Claude</b> updated the deck${m.message ? `: ${esc(m.message)}` : ''}` : `<b>${esc(m.name || 'A teammate')}</b> updated the deck`);
    }, 250);
    return;
  }
  if (m.type === 'show' && source.kind === 'p') {
    go(m.slide - 1, { instant: true });
    cue(`<b>Claude</b>${m.message ? ` · ${esc(m.message)}` : ` points at slide ${m.slide}`}`, 6000);
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let cueTimer = 0;
function cue(html, ms = 3600) {
  document.querySelector('.cue')?.remove();
  const el = h('div', { class: 'cue', role: 'status' }, mark(), h('span', { html }));
  document.body.append(el);
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

function message(title, body, action) {
  root.classList.add('is-message');
  controlsEl.hidden = true;
  document.title = 'Deck';
  deckEl.replaceChildren(h('div', { class: 'msg' }, h('div', { class: 'msg-card', role: 'status' },
    h('a', { class: 'msg-brand', href: '/' }, mark(), 'Deck'),
    h('h1', {}, title),
    body && h('p', {}, body),
    action,
  )));
}
function notFound() {
  if (source && source.kind === 'p') return message('This deck isn’t here', 'It may have been deleted, or you are not on its workspace.', h('a', { class: 'btn', href: '/' }, 'Go to your decks'));
  message('This deck isn’t here', 'The link may be mistyped, or whoever shared it stopped sharing it. Check the address with the person who sent it.');
}

// ---- Viewer ----

let deck = null;
let slides = [];
let current = 0;
let stacked = stackMQ.matches;

function start(content, again) {
  deck = content;
  root.classList.remove('is-message');
  root.dataset.accent = accentOf(content);
  if (text(deck.lang)) root.lang = text(deck.lang);
  document.title = text(deck.title) || 'Deck';
  slides = deck.slides.map((s, i) => {
    const el = renderSlide(deck, i, { imgSizes: '100vw' });
    el.id = `s${i + 1}`;
    return el;
  });
  deckEl.replaceChildren(...slides);
  if (!again) {
    buildControls(); buildNotes(); bindInput();
    // The studio's "Print or save as PDF" opens the deck with ?print.
    if (new URLSearchParams(location.search).has('print')) document.fonts.ready.then(() => setTimeout(() => print(), 400));
  }
  const first = again ? Math.min(current, slides.length - 1) : slideFromHash() ?? 0;
  current = first;
  if (stacked) enterStack(!again);
  else show(first, 0, again);
}

function slideFromHash() {
  const m = location.hash.match(/^#(\d+)$/);
  if (!m || !slides.length) return null;
  return Math.max(0, Math.min(slides.length - 1, Number(m[1]) - 1));
}

function show(i, dir, quiet) {
  slides.forEach((el, k) => { if (k !== i) el.classList.remove('is-active', 'play'); });
  const el = slides[i];
  el.classList.add('is-active');
  el.style.setProperty('--dir', dir || 0);
  if (!quiet) {
    el.classList.remove('play');
    void el.offsetWidth;
    el.classList.add('play');
    countUp(el);
  } else {
    finishCounters(el);
  }
  current = i;
  sync();
}

function go(i, opts = {}) {
  if (!slides.length) return;
  i = Math.max(0, Math.min(slides.length - 1, i));
  if (stacked) {
    slides[i].scrollIntoView({ behavior: opts.instant || reduceMQ.matches ? 'auto' : 'smooth', block: 'start' });
    current = i;
    sync();
    return;
  }
  if (i === current && slides[i].classList.contains('is-active')) return;
  show(i, i > current ? 1 : -1);
}
const next = () => go(current + 1);
const prev = () => go(current - 1);

function sync() {
  reading?.on(current);
  const n = slides.length;
  progressEl.style.transform = `scaleX(${n ? (current + 1) / n : 0})`;
  const hash = `#${current + 1}`;
  if (location.hash !== hash && (current > 0 || location.hash)) history.replaceState(null, '', location.pathname + location.search + hash);
  const count = controlsEl.querySelector('.count');
  if (count) count.replaceChildren(h('b', {}, current + 1), ` / ${n}`);
  const prevBtn = controlsEl.querySelector('[data-act="prev"]');
  const nextBtn = controlsEl.querySelector('[data-act="next"]');
  if (prevBtn) prevBtn.disabled = current === 0;
  if (nextBtn) nextBtn.disabled = current === n - 1;
  renderNotes();
}

// ---- Stacked mode (portrait phones) ----

let seenObserver = null;
function enterStack(initial) {
  stacked = true;
  slides.forEach((el) => el.classList.remove('is-active', 'play'));
  seenObserver?.disconnect();
  seenObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !e.target.classList.contains('seen')) {
        e.target.classList.add('seen');
        countUp(e.target);
        seenObserver.unobserve(e.target);
      }
    }
  }, { threshold: 0.18 });
  slides.forEach((el) => { if (!el.classList.contains('seen')) seenObserver.observe(el); });
  requestAnimationFrame(() => {
    if (current > 0 && initial) slides[current].scrollIntoView({ block: 'start' });
    else if (initial) scrollTo(0, 0);
    sync();
  });
}
function leaveStack() {
  stacked = false;
  seenObserver?.disconnect();
  scrollTo(0, 0);
  show(current, 0);
}
stackMQ.addEventListener('change', (e) => { if (slides.length) (e.matches ? enterStack(false) : leaveStack()); });

let scrollTick = 0;
addEventListener('scroll', () => {
  if (!stacked || scrollTick) return;
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0;
    const line = innerHeight * 0.4;
    let i = 0;
    slides.forEach((el, k) => { if (el.getBoundingClientRect().top <= line) i = k; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = slides.length - 1;
    if (i !== current) { current = i; sync(); }
  });
}, { passive: true });

// ---- Reading time (shared links and embeds) ----
// The deck's workspace sees how many people opened it and how long each slide stayed on
// screen (Stats in the studio). Time counts only while the page is visible and the reader
// has moved, tapped, scrolled or pressed a key in the last two minutes. A random id kept in
// this browser tells a returning reader from a new one; nothing here says who they are.

const IDLE = 120000;
let reading = null;

function visitorId() {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => 'abcdefghijkmnopqrstuvwxyz23456789'[b % 33]).join('');
  try {
    let id = localStorage.getItem('deck.visitor');
    if (!/^[a-z0-9]{16}$/.test(id || '')) { id = fresh(); localStorage.setItem('deck.visitor', id); }
    return id;
  } catch { return fresh(); }
}

async function startReading() {
  const now = performance.now();
  const r = { vid: null, slide: current, since: now, active: now, visible: document.visibilityState === 'visible', pending: {} };
  // Add up the time on the slide shown, to now or to two minutes after the last sign of life.
  r.tally = (at = performance.now()) => {
    const end = Math.min(at, r.active + IDLE);
    if (r.visible && end > r.since) r.pending[r.slide] = (r.pending[r.slide] || 0) + Math.round(end - r.since);
    r.since = at;
  };
  r.on = (i) => { r.tally(); r.slide = i; };
  r.send = (final) => {
    if (!r.vid) return;
    r.tally();
    if (!Object.keys(r.pending).length && !final) return;
    const body = JSON.stringify({ t: r.pending, at: current });
    r.pending = {};
    fetch(`/api/s/${source.id}/views/${r.vid}`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  };
  reading = r;
  const device = matchMedia('(pointer: coarse)').matches ? (Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone') : 'desktop';
  let ref = '';
  try { const from = document.referrer ? new URL(document.referrer) : null; if (from && from.host !== location.host) ref = from.host; } catch { ref = ''; }
  try {
    const res = await fetch(`/api/s/${source.id}/views`, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ visitor: visitorId(), device, ref, embed: embedded, at: current }),
    });
    const data = res.ok ? await res.json() : null;
    if (!data || !data.view) { reading = null; return; }
    r.vid = data.view;
  } catch { reading = null; return; }
  const alive = () => { r.tally(); r.active = performance.now(); };
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart']) addEventListener(type, alive, { passive: true });
  document.addEventListener('visibilitychange', () => {
    r.tally();
    r.visible = document.visibilityState === 'visible';
    if (r.visible) r.active = performance.now();
    else r.send(true);
  });
  addEventListener('pagehide', () => r.send(true));
  setInterval(() => r.send(false), 20000);
}

// ---- Controls, notes, input ----

function studioURL() { return `/d/${source.id}${current ? `#${current + 1}` : ''}`; }

function buildControls() {
  const btn = (act, label, icon, extra = '') => h('button', { class: `btn ghost icon${extra}`, type: 'button', 'data-act': act, 'aria-label': label, title: label, html: icon });
  controlsEl.replaceChildren(...[
    source.kind === 'p' && h('button', { class: 'btn ghost back', type: 'button', 'data-act': 'back', title: 'Back to editing (Esc)', html: ICONS.back + '<span>Edit</span>' }),
    source.kind === 'p' && h('span', { class: 'sep', 'aria-hidden': 'true' }),
    btn('prev', 'Previous slide (←)', ICONS.prev),
    h('span', { class: 'count', 'aria-live': 'polite' }),
    btn('next', 'Next slide (→)', ICONS.next),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    btn('notes', 'Speaker notes (N)', ICONS.notes),
    btn('full', 'Full screen (F)', ICONS.full),
    embedded && h('a', { class: 'btn ghost icon open-full', href: `/s/${source.id}`, target: '_blank', rel: 'noopener', 'aria-label': 'Open in a new tab', title: 'Open in a new tab', html: ICONS.open }),
  ].filter(Boolean));
  controlsEl.hidden = false;
  controlsEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'prev') prev();
    else if (act === 'next') next();
    else if (act === 'notes') toggleNotes();
    else if (act === 'full') toggleFullscreen();
    else if (act === 'back') location.href = studioURL();
  });
}

let clockStart = 0;
let clockTimer = 0;
function buildNotes() {
  notesEl.replaceChildren(
    h('div', { class: 'notes-main' }, h('p', { class: 'notes-label' }), h('div', { class: 'notes-text' })),
    h('div', { class: 'notes-side' }, h('p', { class: 'label' }, 'Next'), h('p', { class: 'notes-next' }), h('p', { class: 'notes-clock', title: 'Time since notes opened' }, '0:00')),
  );
  notesEl.hidden = false;
}
function renderNotes() {
  if (!root.classList.contains('notes-open') || !deck) return;
  const s = deck.slides[current] || {};
  const notes = text(s.notes);
  notesEl.querySelector('.notes-label').textContent = `Slide ${current + 1} of ${slides.length}`;
  const body = notesEl.querySelector('.notes-text');
  body.textContent = notes || 'No notes for this slide.';
  body.classList.toggle('empty', !notes);
  body.scrollTop = 0;
  const after = deck.slides[current + 1];
  notesEl.querySelector('.notes-next').textContent = after ? slideTitle(after) : 'End of deck';
}
function tickClock() {
  const s = Math.floor((Date.now() - clockStart) / 1000);
  notesEl.querySelector('.notes-clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function toggleNotes() {
  if (embedded) return;
  const open = root.classList.toggle('notes-open');
  controlsEl.querySelector('[data-act="notes"]')?.setAttribute('aria-pressed', String(open));
  clearInterval(clockTimer);
  if (open) {
    if (!clockStart) clockStart = Date.now();
    tickClock();
    clockTimer = setInterval(tickClock, 1000);
    renderNotes();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else root.requestFullscreen?.().catch(() => {});
}
document.addEventListener('fullscreenchange', () => root.classList.toggle('fs', !!document.fullscreenElement));

let idleTimer = 0;
function wake() {
  root.classList.add('show-ui');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!controlsEl.matches(':hover')) root.classList.remove('show-ui'); }, 2400);
}

let bound = false;
function bindInput() {
  if (bound) return;
  bound = true;

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable]')) return;
    if ((e.key === ' ' || e.key === 'Enter') && t.closest?.('a, button')) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': next(); break;
      case ' ': (e.shiftKey ? prev() : next()); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': prev(); break;
      case 'Home': go(0); break;
      case 'End': go(slides.length - 1); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'Escape': if (source.kind === 'p' && !document.fullscreenElement) location.href = studioURL(); else return; break;
      default: return;
    }
    e.preventDefault();
  });

  // Click or tap: the left third goes back, the rest goes forward.
  deckEl.addEventListener('click', (e) => {
    if (stacked || !slides.length) return;
    if (e.target.closest('a, button, .notes, .controls')) return;
    if (String(getSelection()).length) return;
    const box = deckEl.getBoundingClientRect();
    if (e.clientX - box.left < box.width * 0.3) prev();
    else next();
  });

  let touch = null;
  deckEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  deckEl.addEventListener('touchend', (e) => {
    if (!touch || stacked) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? next() : prev());
  }, { passive: true });

  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') wake(); });
  controlsEl.addEventListener('focusin', wake);
  addEventListener('hashchange', () => {
    const i = slideFromHash();
    if (i != null && i !== current) go(i, { instant: true });
  });
}

route();
