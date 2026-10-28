// The studio: one deck, edited in place. The rail lists the slides; the canvas shows the
// chosen one with its words editable where they sit; the inspector holds every field,
// including lists, links, colours and pictures. Edits save a moment after typing stops.
// Saves from Claude (or a teammate) arrive over realtime and reload the deck in place on
// the same slide; if you were mid-edit, a banner asks which version to keep.
import { api, esc, $, $$, html, toast, ago, icons, sheet, menu, copy, confirmSheet, uploadTo, pickFiles, chime, kb } from './lib.js?v=0.2.0';
import { renderSlide, thumb, slideTitle } from '/deck/render.js?v=0.2.0';
import { LAYOUTS, TEMPLATES, switchLayout, ACCENT_NAMES, CARD_COLORS } from './schema.js?v=0.2.0';
import { subscribe } from './live.js?v=0.2.0';

const CLIENT = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const clone = (v) => JSON.parse(JSON.stringify(v));

let S = null; // the open deck's state

export async function open(root, did, app) {
  let data;
  try { data = await api(`/api/decks/${did}`); } catch (error) {
    root.innerHTML = `<div class="card-page"><div class="solo"><h1>This deck isn’t here</h1><p>${esc(error.status === 404 ? 'It may have been deleted, or you’re not on its workspace.' : error.message)}</p><form><a class="btn primary" href="/" data-nav>Go to your decks</a></form></div></div>`;
    return;
  }
  const ws = app.me.workspaces.find((w) => w.id === data.deck.workspace) || { id: data.deck.workspace, name: 'Decks' };
  app.rememberWorkspace(ws.id);
  const fromHash = /^#(\d+)$/.exec(location.hash);
  S = {
    root, app, ws, did, deck: data.deck, content: data.revision.content, base: data.base, check: data.check,
    sel: fromHash ? Math.max(0, Math.min(data.revision.content.slides.length - 1, Number(fromHash[1]) - 1)) : 0,
    dirty: false, inflight: null, timer: 0, tab: 'slide', banner: null,
  };
  document.body.classList.add('in-studio');
  shell();
  paintAll();
  requestAnimationFrame(() => { const item = S && $(`.rail-item[data-i="${S.sel}"]`, S.root); if (item) scrollRail(item); });
  const unsub = subscribe(data.deck.channel, onLive);
  const onKey = (e) => keys(e);
  const onUnload = () => flush();
  addEventListener('keydown', onKey);
  addEventListener('pagehide', onUnload);
  app.onLeave(() => { flush(); unsub(); removeEventListener('keydown', onKey); removeEventListener('pagehide', onUnload); S = null; });
}

// ---------- shell ----------

function shell() {
  const { root, ws } = S;
  root.innerHTML = `<div class="studio">
    <header class="st-bar">
      <a class="st-back" href="/w/${ws.id}" data-nav aria-label="Back to ${esc(ws.name)}">${icons.back}<span class="btn-label">Decks</span></a>
      <input class="st-title" aria-label="Deck title" maxlength="120" spellcheck="true">
      <span class="st-status saved" role="status"><i class="dot"></i><span>Saved</span></span>
      <div class="st-actions">
        <button type="button" class="btn ghost icon insp-toggle" data-act="inspector" aria-label="Details" title="Details">${icons.sliders}</button>
        <button type="button" class="btn ghost icon" data-act="stats" aria-label="Stats" title="Stats">${icons.chart}</button>
        <button type="button" class="btn ghost icon" data-act="history" aria-label="History" title="History">${icons.history}</button>
        <button type="button" class="btn" data-act="share">${icons.share}<span class="btn-label">Share</span></button>
        <button type="button" class="btn primary" data-act="present" title="Present (P)">${icons.play}<span class="btn-label">Present</span></button>
        <button type="button" class="btn ghost icon" data-act="more" aria-label="More" aria-haspopup="menu">${icons.more}</button>
        <span data-account></span>
      </div>
    </header>
    <aside class="rail" aria-label="Slides"></aside>
    <main class="stage">
      <div class="canvas-wrap">
        <div class="frame canvas"></div>
        <div class="stage-tools">
          <span data-where></span><span class="spacer"></span>
          <button type="button" class="btn ghost icon" data-slide="up" aria-label="Move slide up" title="Move up">${icons.up}</button>
          <button type="button" class="btn ghost icon" data-slide="down" aria-label="Move slide down" title="Move down">${icons.down}</button>
          <button type="button" class="btn ghost icon" data-slide="duplicate" aria-label="Duplicate slide" title="Duplicate">${icons.duplicate}</button>
          <button type="button" class="btn ghost icon" data-slide="delete" aria-label="Delete slide" title="Delete">${icons.trash}</button>
        </div>
        <label class="notes-edit"><textarea class="textarea" data-notes placeholder="Speaker notes: what you’ll say on this slide" aria-label="Speaker notes"></textarea></label>
        <div data-issues></div>
      </div>
    </main>
    <aside class="inspector" aria-label="Details">
      <div class="insp-tabs"><div class="seg" role="tablist"><button type="button" data-tab="slide">Slide</button><button type="button" data-tab="deck">Deck</button></div><button type="button" class="icon-btn insp-close" data-act="inspector" aria-label="Close details">${icons.close}</button></div>
      <div class="insp-body"></div>
    </aside>
  </div>`;
  $('[data-account]', root).replaceWith(S.app.accountButton());
  const title = $('.st-title', root);
  title.value = S.content.title || '';
  title.addEventListener('input', () => { S.content.title = title.value; changed(); syncDeckField('title', title.value); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  $('.st-actions', root).addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'present') present();
    else if (act === 'share') shareSheet();
    else if (act === 'history') historySheet();
    else if (act === 'stats') statsSheet();
    else if (act === 'more') moreMenu(e.target.closest('[data-act]'));
    else if (act === 'inspector') $('.studio', root).classList.toggle('insp-open');
  });
  $('.insp-close', root).addEventListener('click', () => $('.studio', root).classList.remove('insp-open'));
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; paintInspector(); }));
  $('.stage-tools', root).addEventListener('click', (e) => {
    const act = e.target.closest('[data-slide]')?.dataset.slide;
    if (act === 'up') moveSlide(S.sel, S.sel - 1);
    else if (act === 'down') moveSlide(S.sel, S.sel + 1);
    else if (act === 'duplicate') duplicateSlide(S.sel);
    else if (act === 'delete') deleteSlide(S.sel);
  });
  const notes = $('[data-notes]', root);
  notes.addEventListener('input', () => { setField(slide(), 'notes', notes.value); changed(); });
  bindCanvas($('.canvas', root));
  bindRail($('.rail', root));
}

const slide = () => S.content.slides[S.sel];

function paintAll() {
  document.title = `${S.content.title || 'Untitled deck'} — Deck`;
  paintRail();
  paintCanvas();
  paintInspector();
  paintIssues();
}

// ---------- the rail ----------

function paintRail() {
  const rail = $('.rail', S.root);
  const items = S.content.slides.map((s, i) => railItem(i));
  const add = html(`<button type="button" class="add-slide">${icons.plus}<span>Add slide</span></button>`);
  add.addEventListener('click', () => layoutSheet('add'));
  rail.replaceChildren(...items, add);
  markIssues();
}

function railItem(i) {
  const item = html(`<div class="rail-item${i === S.sel ? ' on' : ''}" draggable="true" data-i="${i}" role="button" tabindex="0" aria-label="Slide ${i + 1}: ${esc(slideTitle(S.content.slides[i]))}"><span class="n">${i + 1}</span></div>`);
  item.append(thumb(S.content, i, { imgSizes: '200px', fan: S.content.slides[i].layout === 'title' ? undefined : false }));
  return item;
}

let railTimer = 0;
function refreshRailItem(i = S.sel) {
  clearTimeout(railTimer);
  railTimer = setTimeout(() => {
    const old = $(`.rail-item[data-i="${i}"]`, S.root);
    if (!old) return;
    old.replaceWith(railItem(i));
    // A cover shows the next slides, so its miniature changes with them.
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
      if (S.content.slides[k] && S.content.slides[k].layout === 'title') $(`.rail-item[data-i="${k}"]`, S.root)?.replaceWith(railItem(k));
    }
    markIssues();
  }, 220);
}

function bindRail(rail) {
  rail.addEventListener('click', (e) => {
    const item = e.target.closest('.rail-item');
    if (item) select(Number(item.dataset.i));
  });
  rail.addEventListener('keydown', (e) => {
    const item = e.target.closest('.rail-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(Number(item.dataset.i)); }
  });
  rail.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.rail-item');
    if (!item) return;
    e.preventDefault();
    const i = Number(item.dataset.i);
    select(i);
    menu(item, slideMenu(i));
  });
  let from = null;
  rail.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.rail-item');
    if (!item) return;
    from = Number(item.dataset.i);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
  });
  const clear = () => $$('.drop-before, .drop-after', rail).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  rail.addEventListener('dragover', (e) => {
    if (from == null) return;
    const item = e.target.closest('.rail-item');
    if (!item) return;
    e.preventDefault();
    clear();
    const r = item.getBoundingClientRect();
    const horizontal = getComputedStyle(rail).display === 'flex';
    const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    item.classList.add(after ? 'drop-after' : 'drop-before');
  });
  rail.addEventListener('drop', (e) => {
    const item = $('.drop-before, .drop-after', rail);
    if (from == null || !item) return;
    e.preventDefault();
    let to = Number(item.dataset.i) + (item.classList.contains('drop-after') ? 1 : 0);
    if (to > from) to--;
    clear();
    const f = from;
    from = null;
    moveSlide(f, to);
  });
  rail.addEventListener('dragend', () => { from = null; clear(); $$('.dragging', rail).forEach((x) => x.classList.remove('dragging')); });
}

function slideMenu(i) {
  const n = S.content.slides.length;
  return [
    { label: 'Duplicate', icon: icons.duplicate, run: () => duplicateSlide(i) },
    { label: 'Move up', icon: icons.up, disabled: i === 0, run: () => moveSlide(i, i - 1) },
    { label: 'Move down', icon: icons.down, disabled: i === n - 1, run: () => moveSlide(i, i + 1) },
    { label: 'Change layout…', icon: icons.decks, run: () => layoutSheet('switch') },
    '-',
    { label: 'Delete slide', icon: icons.trash, danger: true, disabled: n <= 1, run: () => deleteSlide(i) },
  ];
}

function select(i, opts = {}) {
  if (!S) return;
  i = Math.max(0, Math.min(S.content.slides.length - 1, i));
  const same = i === S.sel;
  S.sel = i;
  $$('.rail-item', S.root).forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === i));
  const item = $(`.rail-item[data-i="${i}"]`, S.root);
  if (item && !opts.noScroll) scrollRail(item);
  history.replaceState(null, '', `${location.pathname}#${i + 1}`);
  if (!same || opts.force) { paintCanvas(); paintInspector(); }
}

// Scroll the rail itself, not the page around it.
function scrollRail(item) {
  const rail = $('.rail', S.root);
  const horizontal = getComputedStyle(rail).display === 'flex';
  const r = item.getBoundingClientRect();
  const box = rail.getBoundingClientRect();
  if (horizontal) {
    if (r.left < box.left + 8) rail.scrollBy({ left: r.left - box.left - 14, behavior: 'smooth' });
    else if (r.right > box.right - 8) rail.scrollBy({ left: r.right - box.right + 14, behavior: 'smooth' });
  } else if (r.top < box.top + 8) rail.scrollBy({ top: r.top - box.top - 14, behavior: 'smooth' });
  else if (r.bottom > box.bottom - 8) rail.scrollBy({ top: r.bottom - box.bottom + 14, behavior: 'smooth' });
}

function moveSlide(from, to) {
  const slides = S.content.slides;
  if (to < 0 || to >= slides.length || from === to) return;
  const [s] = slides.splice(from, 1);
  slides.splice(to, 0, s);
  S.sel = to;
  changed();
  paintAll();
  scrollRail($(`.rail-item[data-i="${to}"]`, S.root));
}
function duplicateSlide(i) {
  if (S.content.slides.length >= 60) return toast('A deck has 60 slides at most.');
  S.content.slides.splice(i + 1, 0, clone(S.content.slides[i]));
  S.sel = i + 1;
  changed();
  paintAll();
  toast('Slide duplicated');
}
async function deleteSlide(i) {
  if (S.content.slides.length <= 1) return toast('A deck keeps at least one slide.');
  const removed = S.content.slides.splice(i, 1)[0];
  S.sel = Math.min(i, S.content.slides.length - 1);
  changed();
  paintAll();
  toast('Slide deleted', { label: 'Undo', run: () => { if (!S) return; S.content.slides.splice(i, 0, removed); S.sel = i; changed(); paintAll(); } });
}

// ---------- the canvas: words edited where they sit ----------

function paintCanvas() {
  const canvas = $('.canvas', S.root);
  const el = renderSlide(S.content, S.sel, { edit: true, imgSizes: '(max-width: 760px) 100vw, 60vw' });
  // Replacing the slide blurs whatever was focused in it; that blur is not someone leaving.
  S.repainting = true;
  try { canvas.replaceChildren(el); } finally { S.repainting = false; }
  // Browsers without plaintext-only editing get ordinary editing; paste is made plain below.
  for (const e of $$('[contenteditable]', el)) if (e.contentEditable !== 'plaintext-only') e.contentEditable = 'true';
  $('[data-where]', S.root).textContent = `Slide ${S.sel + 1} of ${S.content.slides.length} · ${LAYOUTS[slide().layout]?.label || slide().layout}`;
  $('[data-slide="up"]', S.root).disabled = S.sel === 0;
  $('[data-slide="down"]', S.root).disabled = S.sel === S.content.slides.length - 1;
  $('[data-slide="delete"]', S.root).disabled = S.content.slides.length <= 1;
  const notes = $('[data-notes]', S.root);
  if (document.activeElement !== notes) notes.value = slide().notes || '';
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let k = 0; k < keys.length - 1; k++) {
    if (o[keys[k]] == null) o[keys[k]] = /^\d+$/.test(keys[k + 1]) ? [] : {};
    o = o[keys[k]];
  }
  const last = keys[keys.length - 1];
  if (value === '' || value == null) { if (Array.isArray(o)) o[last] = ''; else delete o[last]; } else o[last] = value;
}
function setField(target, path, value) {
  const s = slide();
  // A new deck's title follows its cover until someone names the deck.
  if (target === s && path === 'title' && S.sel === 0 && s.layout === 'title') {
    const before = s.title || '';
    if (!S.content.title || S.content.title === before || S.content.title === 'Untitled deck') {
      S.content.title = value;
      const t = $('.st-title', S.root);
      if (t && document.activeElement !== t) t.value = value;
    }
  }
  setPath(target, path, value);
}

function bindCanvas(canvas) {
  canvas.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const value = el.textContent.replace(/\s*\n\s*/g, ' ');
    setField(slide(), el.dataset.path, value.trim() ? value : '');
    syncField(el.dataset.path, value);
    changed();
    refreshRailItem();
  });
  canvas.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const path = el.dataset.path;
    const bullet = /^(cards\.\d+\.bullets)\.(\d+)$/.exec(path);
    if (e.key === 'Enter') {
      e.preventDefault();
      if (bullet && !e.shiftKey) {
        const list = getPath(slide(), bullet[1]);
        const at = Number(bullet[2]) + 1;
        if (list.length >= 6) return;
        list.splice(at, 0, '');
        changed();
        paintCanvas();
        refreshRailItem();
        focusPath(`${bullet[1]}.${at}`);
      } else el.blur();
    } else if (e.key === 'Backspace' && bullet && !el.textContent) {
      e.preventDefault();
      const list = getPath(slide(), bullet[1]);
      const at = Number(bullet[2]);
      list.splice(at, 1);
      if (!list.length) delete getPath(slide(), bullet[1].replace(/\.bullets$/, '')).bullets;
      changed();
      paintCanvas();
      refreshRailItem();
      if (at > 0) focusPath(`${bullet[1]}.${at - 1}`, true);
    } else if (e.key === 'Escape') el.blur();
  });
  canvas.addEventListener('paste', (e) => {
    if (!e.target.closest('[data-path]')) return;
    e.preventDefault();
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  });
  // Statements re-draw their highlight, and empty list lines tidy up, once you leave them.
  canvas.addEventListener('focusout', (e) => {
    if (S.repainting || (e.relatedTarget && canvas.contains(e.relatedTarget))) return;
    setTimeout(() => {
      if (!S || S.repainting || canvas.contains(document.activeElement)) return;
      const s = slide();
      let tidied = false;
      for (const card of s.cards || []) {
        if (!Array.isArray(card.bullets)) continue;
        const kept = card.bullets.filter((b) => String(b).trim());
        if (kept.length !== card.bullets.length) { tidied = true; if (kept.length) card.bullets = kept; else delete card.bullets; }
      }
      if (tidied) changed();
      if (tidied || s.layout === 'statement' || s.layout === 'numbers') { paintCanvas(); refreshRailItem(); }
    }, 0);
  });
  canvas.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
    if (e.target.closest('.shot-empty')) pickImage();
  });
  canvas.addEventListener('dblclick', (e) => { if (e.target.closest('.shot-frame img')) pickImage(); });
  // Callouts move with the pointer; their place is kept in percent of the picture.
  canvas.addEventListener('pointerdown', (e) => {
    const co = e.target.closest('.co');
    const img = $('.shot-frame img', canvas);
    if (!co || !img || e.button) return;
    e.preventDefault();
    const k = Number(co.dataset.callout);
    const c = (slide().callouts || [])[k];
    if (!c) return;
    const box = img.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, cx: Number(c.x) || 0, cy: Number(c.y) || 0 };
    co.classList.add('dragging');
    co.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const round = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
      c.x = round(start.cx + ((ev.clientX - start.x) / box.width) * 100);
      c.y = round(start.cy + ((ev.clientY - start.y) / box.height) * 100);
      co.style.left = c.x + '%';
      co.style.top = c.y + '%';
    };
    const up = () => {
      co.classList.remove('dragging');
      co.removeEventListener('pointermove', move);
      co.removeEventListener('pointerup', up);
      co.removeEventListener('pointercancel', up);
      if (c.x !== start.cx || c.y !== start.cy) { changed(); refreshRailItem(); syncField(`callouts.${k}.x`, c.x); syncField(`callouts.${k}.y`, c.y); }
    };
    co.addEventListener('pointermove', move);
    co.addEventListener('pointerup', up);
    co.addEventListener('pointercancel', up);
  });
}

function focusPath(path, atEnd) {
  const el = $(`.canvas [data-path="${path}"]`, S.root);
  if (!el) return;
  el.focus();
  if (atEnd) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
}

// Keep the inspector's copy of a field in step with typing on the slide.
function syncField(path, value) {
  const input = $(`.inspector [data-field="${CSS.escape(path)}"]`, S.root);
  if (input && document.activeElement !== input) input.value = value ?? '';
  const lines = /^(cards\.\d+\.bullets)\.\d+$/.exec(path);
  if (lines) {
    const area = $(`.inspector [data-field="${CSS.escape(lines[1])}"]`, S.root);
    if (area && document.activeElement !== area) area.value = (getPath(slide(), lines[1]) || []).join('\n');
  }
}
function syncDeckField(key, value) {
  const input = $(`.inspector [data-deck="${key}"]`, S.root);
  if (input && document.activeElement !== input) input.value = value;
}

// ---------- the inspector ----------

let canvasTimer = 0;
function canvasSoon() {
  clearTimeout(canvasTimer);
  canvasTimer = setTimeout(() => { if (S) { paintCanvas(); refreshRailItem(); } }, 140);
}

function paintInspector() {
  const body = $('.insp-body', S.root);
  $$('[data-tab]', S.root).forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  body.replaceChildren(S.tab === 'deck' ? deckFields() : slideFields());
}

function slideFields() {
  const s = slide();
  const def = LAYOUTS[s.layout];
  const box = html('<div></div>');
  const pick = html(`<button type="button" class="layout-pick"><span class="pick-thumb"></span><span><b>${esc(def ? def.label : s.layout)}</b><small>${esc(def ? def.blurb : 'An unknown layout')}</small></span>${icons.chev}</button>`);
  $('.pick-thumb', pick).replaceWith(thumb({ ...S.content, slides: [s] }, 0, { fan: false, imgSizes: '80px' }));
  pick.addEventListener('click', () => layoutSheet('switch'));
  box.append(pick);
  if (!def) { box.append(html('<p class="hint">This slide uses a layout Deck doesn’t know. Pick one of the layouts to fix it.</p>')); return box; }
  for (const f of def.fields) box.append(fieldEl(f, s, f.key));
  return box;
}

function fieldEl(f, obj, path) {
  const value = getPath(slide(), path);
  const label = (text) => `<span>${esc(text)}</span>`;
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  if (f.type === 'text' || f.type === 'long') {
    const el = html(`<label class="field">${label(f.label)}${f.type === 'long' ? '<textarea class="textarea" rows="2"></textarea>' : '<input class="input">'}${hint}</label>`);
    const input = $('input, textarea', el);
    input.value = typeof value === 'string' || typeof value === 'number' ? value : '';
    input.dataset.field = path;
    input.addEventListener('input', () => { setField(slide(), path, input.value.replace(/\s*\n\s*/g, ' ')); changed(); canvasSoon(); });
    return el;
  }
  if (f.type === 'lines') {
    const el = html(`<label class="field">${label(f.label)}<textarea class="textarea" rows="3"></textarea>${hint}</label>`);
    const input = $('textarea', el);
    input.value = Array.isArray(value) ? value.join('\n') : '';
    input.dataset.field = path;
    input.addEventListener('input', () => {
      const lines = input.value.split('\n').map((l) => l.trim()).filter(Boolean);
      setPath(slide(), path, lines.length ? lines : null);
      changed();
      canvasSoon();
    });
    return el;
  }
  if (f.type === 'number') {
    const el = html(`<label class="field">${label(f.label)}<input class="input" type="number" min="0" max="100" step="0.5" inputmode="decimal"></label>`);
    const input = $('input', el);
    input.value = value ?? '';
    input.dataset.field = path;
    input.addEventListener('input', () => { const v = input.value === '' ? null : Math.max(0, Math.min(100, Number(input.value))); setPath(slide(), path, Number.isFinite(v) ? v : null); changed(); canvasSoon(); });
    return el;
  }
  if (f.type === 'bool') {
    const on = value !== false && (value === true || f.default === true);
    const el = html(`<label class="check" style="margin:2px 0 14px"><input type="checkbox"${on ? ' checked' : ''}> ${esc(f.label)}</label>`);
    $('input', el).addEventListener('change', (e) => { setPath(slide(), path, e.target.checked === !!f.default ? null : e.target.checked); changed(); canvasSoon(); });
    return el;
  }
  if (f.type === 'select') {
    const el = html(`<label class="field">${label(f.label)}<select class="select">${f.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`);
    const input = $('select', el);
    input.value = value || '';
    input.addEventListener('change', () => { setPath(slide(), path, input.value || null); changed(); canvasSoon(); });
    return el;
  }
  if (f.type === 'link') {
    const href = value && typeof value === 'object' ? value.href || '' : value || '';
    const text = value && typeof value === 'object' ? value.label || '' : '';
    const el = html(`<div class="field"><span>${esc(f.label)}</span><input class="input" placeholder="https://…, mailto:… or #3" data-href><input class="input" placeholder="Label (optional)" data-label></div>`);
    $('[data-href]', el).value = href;
    $('[data-label]', el).value = text;
    const update = () => {
      const h = $('[data-href]', el).value.trim();
      const l = $('[data-label]', el).value.trim();
      setPath(slide(), path, h ? (l ? { href: h, label: l } : h) : null);
      changed();
      canvasSoon();
    };
    $('[data-href]', el).addEventListener('input', update);
    $('[data-label]', el).addEventListener('input', update);
    return el;
  }
  if (f.type === 'color') {
    const el = html(`<div class="field"><span>${esc(f.label)}</span><div class="swatches"><button type="button" class="swatch none" data-c="" aria-label="The deck’s accent" title="The deck’s accent"></button>${CARD_COLORS.map((c) => `<button type="button" class="swatch" data-c="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}</div></div>`);
    const paint = () => $$('.swatch', el).forEach((b) => b.classList.toggle('on', (b.dataset.c || '') === (getPath(slide(), path) || '')));
    $$('.swatch', el).forEach((b) => b.addEventListener('click', () => { setPath(slide(), path, b.dataset.c || null); paint(); changed(); canvasSoon(); }));
    paint();
    return el;
  }
  if (f.type === 'image') {
    const el = html(`<div class="field"><span>${esc(f.label)}</span><div class="image-field"><span class="pic">${value ? `<img src="${esc(value)}" alt="">` : icons.image}</span><div style="display:flex;flex-direction:column;gap:6px"><button type="button" class="btn">${icons.image}Choose…</button><small class="hint">${value ? esc(String(value).split('/').pop()) : 'From the library, or upload'}</small></div></div></div>`);
    $('button', el).addEventListener('click', () => pickImage());
    return el;
  }
  if (f.type === 'list') {
    const items = Array.isArray(value) ? value : [];
    const el = html(`<div class="list-field"><div class="list-head"><span class="btn-label">${esc(f.label)}</span><button type="button" class="btn ghost" data-add${items.length >= f.max ? ' disabled' : ''}>${icons.plus}Add</button></div></div>`);
    items.forEach((item, k) => {
      const box = html(`<div class="list-item"><div class="list-item-head"><span>${esc(f.item)} ${k + 1}</span>
        <button type="button" class="icon-btn" data-up aria-label="Move up"${k === 0 ? ' disabled' : ''}>${icons.up}</button>
        <button type="button" class="icon-btn" data-down aria-label="Move down"${k === items.length - 1 ? ' disabled' : ''}>${icons.down}</button>
        <button type="button" class="icon-btn" data-remove aria-label="Remove"${items.length <= f.min ? ' disabled' : ''}>${icons.close}</button></div></div>`);
      const nums = f.fields.filter((x) => x.type === 'number');
      for (const sub of f.fields.filter((x) => x.type !== 'number')) box.append(fieldEl(sub, item, `${path}.${k}.${sub.key}`));
      if (nums.length) {
        const grid = html('<div class="nums"></div>');
        for (const sub of nums) grid.append(fieldEl(sub, item, `${path}.${k}.${sub.key}`));
        box.append(grid);
      }
      const list = () => getPath(slide(), path);
      $('[data-up]', box).addEventListener('click', () => { const l = list(); [l[k - 1], l[k]] = [l[k], l[k - 1]]; structural(); });
      $('[data-down]', box).addEventListener('click', () => { const l = list(); [l[k + 1], l[k]] = [l[k], l[k + 1]]; structural(); });
      $('[data-remove]', box).addEventListener('click', () => { const l = list(); l.splice(k, 1); if (!l.length) setPath(slide(), path, null); structural(); });
      el.append(box);
    });
    $('[data-add]', el).addEventListener('click', () => {
      let l = getPath(slide(), path);
      if (!Array.isArray(l)) { setPath(slide(), path, []); l = getPath(slide(), path); }
      if (l.length >= f.max) return;
      l.push(f.make());
      structural();
    });
    return el;
  }
  return html('<span></span>');
}

function structural() {
  changed();
  paintCanvas();
  paintInspector();
  refreshRailItem();
}

function deckFields() {
  const c = S.content;
  const box = html(`<div>
    <label class="field"><span>Title</span><input class="input" data-deck="title" maxlength="120"><small>In the tab and in link previews.</small></label>
    <label class="field"><span>Description</span><textarea class="textarea" data-deck="description" rows="2" maxlength="300"></textarea><small>One or two sentences for link previews.</small></label>
    <label class="field"><span>Footer label</span><input class="input" data-deck="brand" maxlength="60" placeholder="Your team or product"><small>On the cover and at the foot of every slide.</small></label>
    <div class="field"><span>Accent</span><div class="accent-pick">${Object.entries(ACCENT_NAMES).map(([k, v]) => `<button type="button" data-accent="${k}"><i></i>${esc(v)}</button>`).join('')}</div></div>
    <label class="field"><span>Language</span><input class="input" data-deck="lang" maxlength="12" placeholder="en"><small>For spelling and screen readers, such as en, nb or de.</small></label>
    <div class="section-title">${c.slides.length} slides · revision ${S.deck.revision}</div>
  </div>`);
  for (const key of ['title', 'description', 'brand', 'lang']) {
    const input = $(`[data-deck="${key}"]`, box);
    input.value = c[key] || '';
    input.addEventListener('input', () => {
      const v = input.value.replace(/\s*\n\s*/g, ' ');
      if (v.trim()) c[key] = v; else delete c[key];
      if (key === 'title') $('.st-title', S.root).value = v;
      changed();
      if (key === 'brand') canvasSoon();
    });
  }
  const paintAccent = () => $$('.accent-pick button', box).forEach((b) => b.classList.toggle('on', b.dataset.accent === (c.accent || 'cobalt')));
  $$('.accent-pick button', box).forEach((b) => b.addEventListener('click', () => {
    c.accent = b.dataset.accent;
    paintAccent();
    changed();
    paintCanvas();
    paintRail();
  }));
  paintAccent();
  return box;
}

// ---------- layouts ----------

function layoutSheet(mode) {
  const current = slide().layout;
  const sample = { ...S.content, slides: Object.keys(LAYOUTS).map((k) => TEMPLATES[k]()) };
  const grid = html('<div class="layout-grid"></div>');
  Object.entries(LAYOUTS).forEach(([key, def], i) => {
    const b = html(`<button type="button" class="layout-option${mode === 'switch' && key === current ? ' on' : ''}"><b>${esc(def.label)}</b><small>${esc(def.blurb)}</small></button>`);
    b.prepend(thumb(sample, i, { fan: false, imgSizes: '200px' }));
    b.addEventListener('click', () => {
      s.close();
      if (mode === 'add') {
        if (S.content.slides.length >= 60) return toast('A deck has 60 slides at most.');
        S.content.slides.splice(S.sel + 1, 0, TEMPLATES[key]());
        S.sel += 1;
        S.tab = 'slide';
      } else if (key !== current) {
        S.content.slides[S.sel] = switchLayout(slide(), key);
      } else return;
      changed();
      paintAll();
      scrollRail($(`.rail-item[data-i="${S.sel}"]`, S.root));
    });
    grid.append(b);
  });
  const s = sheet(mode === 'add' ? 'Add a slide' : 'Change layout', grid, { wide: true, focus: false });
}

// ---------- pictures ----------

async function pickImage() {
  const box = html(`<div><div style="display:flex;gap:8px;margin-bottom:14px"><button type="button" class="btn primary" data-upload>${icons.upload}Upload</button><span class="uploading" hidden style="margin:0"><span class="spinner"></span><span></span></span></div><div class="media-grid"><div class="spinner"></div></div></div>`);
  const s = sheet('Choose a picture', box, { wide: true, focus: false });
  const grid = $('.media-grid', box);
  const choose = (m) => {
    const sl = slide();
    sl.image = m.url;
    if (m.alt && !sl.alt) sl.alt = m.alt;
    s.close();
    structural();
  };
  const load = async () => {
    const { media } = await api(`/api/w/${S.ws.id}/media`);
    const builtIn = { url: '/img/sample-shot.webp', name: 'Sample screenshot', alt: 'A slide from the sample deck', width: 1536, height: 864, size: 43896 };
    const all = [...media, builtIn];
    grid.replaceChildren(...all.map((m) => {
      const card = html(`<button type="button" class="media-card pickable${slide().image === m.url ? ' on' : ''}" style="padding:0;border:0;text-align:left"><span class="pic"><img src="${esc(m.sizes && m.sizes.w320 ? m.sizes.w320 : m.url)}" alt="" loading="lazy"></span><span class="cap"><span class="cap-main"><b>${esc(m.name || m.alt || 'Picture')}</b><small>${m.width ? `${m.width} × ${m.height} · ` : ''}${kb(m.size)}</small></span></span></button>`);
      card.addEventListener('click', () => choose(m));
      return card;
    }));
  };
  $('[data-upload]', box).addEventListener('click', async () => {
    const files = await pickFiles('image/*,.svg,.heic', false);
    if (!files.length) return;
    const status = $('.uploading', box);
    status.hidden = false;
    $('span:last-child', status).textContent = `Uploading ${files[0].name}…`;
    try { const m = await uploadTo(`/api/w/${S.ws.id}/media`, files[0]); choose(m); toast('Added to the library'); } catch (error) { status.hidden = true; toast(error.message); }
  });
  try { await load(); } catch (error) { grid.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
}

// ---------- saving ----------

function status(state, text) {
  const el = $('.st-status', S.root);
  if (!el) return;
  el.className = `st-status ${state}`;
  $('span', el).textContent = text || { editing: 'Edited', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[state];
  if (state === 'error') el.title = text || ''; else el.removeAttribute('title');
}

function changed() {
  S.dirty = true;
  status('editing');
  clearTimeout(S.timer);
  S.timer = setTimeout(save, 900);
  document.title = `${S.content.title || 'Untitled deck'} — Deck`;
}

async function save() {
  if (!S) return;
  clearTimeout(S.timer);
  if (S.inflight) { S.again = true; return; }
  if (!S.dirty) return;
  const mine = S;
  mine.dirty = false;
  status('saving');
  const body = { base: mine.base, content: clone(mine.content), amend: true, client: CLIENT };
  mine.inflight = api(`/api/decks/${mine.did}`, { method: 'POST', body });
  try {
    const r = await mine.inflight;
    mine.base = r.base;
    mine.check = r.check;
    mine.deck = { ...mine.deck, ...r.deck, channel: mine.deck.channel };
    if (S === mine) { status(mine.dirty ? 'editing' : 'saved'); paintIssues(); markIssues(); }
  } catch (error) {
    mine.dirty = true;
    if (S !== mine) return;
    if (error.status === 409) { status('error', 'Changed elsewhere'); conflictBanner(); }
    else { status('error', error.status === 0 ? 'Offline — retrying' : error.message); clearTimeout(mine.timer); mine.timer = setTimeout(save, 4000); }
  } finally {
    mine.inflight = null;
    if (S === mine && mine.again) { mine.again = false; if (mine.dirty) save(); }
  }
}

// Leaving the page: send what's unsaved even as the tab closes.
function flush() {
  if (!S || !S.dirty) return;
  clearTimeout(S.timer);
  S.dirty = false;
  try {
    fetch(`/api/decks/${S.did}`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ base: S.base, content: S.content, amend: true, client: CLIENT }) });
  } catch { /* nothing more to do */ }
}

function paintIssues() {
  const box = $('[data-issues]', S.root);
  if (!box || !S.check) return;
  const prefix = `Slide ${S.sel + 1} `;
  const mine = (list) => list.filter((m) => m.startsWith(prefix)).map((m) => m.replace(/^Slide \d+ \([^)]*\): /, ''));
  const errors = mine(S.check.errors || []);
  const warnings = mine(S.check.warnings || []);
  if (!errors.length && !warnings.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="issues${errors.length ? ' bad' : ''}"><b>${errors.length ? 'This slide won’t show as meant' : 'Worth a look'}</b><ul>${[...errors, ...warnings].map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}
function markIssues() {
  if (!S || !S.check) return;
  const bad = new Set();
  for (const m of [...(S.check.errors || [])]) { const k = /^Slide (\d+)/.exec(m); if (k) bad.add(Number(k[1]) - 1); }
  $$('.rail-item', S.root).forEach((x) => {
    const has = bad.has(Number(x.dataset.i));
    const dot = $('.warn-dot', x);
    if (has && !dot) x.append(html('<span class="warn-dot" title="Something on this slide won’t show"></span>'));
    if (!has && dot) dot.remove();
  });
}

// ---------- live: Claude and teammates ----------

async function reload(m) {
  const mine = S;
  const data = await api(`/api/decks/${mine.did}`);
  if (S !== mine) return;
  mine.content = data.revision.content;
  mine.base = data.base;
  mine.check = data.check;
  mine.deck = data.deck;
  mine.dirty = false;
  mine.sel = Math.min(mine.sel, mine.content.slides.length - 1);
  $('.st-title', mine.root).value = mine.content.title || '';
  paintAll();
  status('saved');
  for (const n of (m && m.changed) || []) $(`.rail-item[data-i="${n - 1}"]`, mine.root)?.classList.add('flash');
}

let reloadTimer = 0;
function onLive(m) {
  if (!S) return;
  if (m.type === 'ready') { if (m.again && !S.dirty && !S.inflight) reload().catch(() => {}); return; }
  if (m.type === 'saved') {
    if (m.client && m.client === CLIENT) return;
    if (m.version && m.version <= S.base) return;
    if (S.dirty || S.inflight || isEditing()) { conflictBanner(m); return; }
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        await reload(m);
        chime();
        const who = m.by === 'claude' ? 'Claude' : (m.name || 'A teammate').split(' ')[0];
        toast(`${who} ${m.message ? `· ${m.message}` : 'changed the deck'}`, m.changed && m.changed.length ? { label: `Show slide ${m.changed[0]}`, run: () => select(m.changed[0] - 1) } : null);
      } catch { /* the next ping or a reconnect reads it again */ }
    }, 200);
    return;
  }
  if (m.type === 'show') {
    select(m.slide - 1, { force: true });
    $(`.rail-item[data-i="${m.slide - 1}"]`, S.root)?.classList.add('flash');
    chime();
    toast(`Claude · ${m.message || `look at slide ${m.slide}`}`, null, 7000);
  }
}

function isEditing() {
  const a = document.activeElement;
  return !!(a && S.root.contains(a) && (a.matches('input, textarea, select, [contenteditable]')));
}

// Someone saved while you had unsaved words: keep theirs, or put yours on top.
function conflictBanner(m) {
  if (!S || S.banner) return;
  const who = m ? (m.by === 'claude' ? 'Claude' : (m.name || 'A teammate').split(' ')[0]) : 'Someone';
  const el = html(`<div class="banner" role="alert"><span>${esc(who)} changed this deck while you were editing.</span><button type="button" class="btn" data-theirs>See theirs</button><button type="button" class="btn primary" data-mine>Keep mine</button></div>`);
  S.banner = el;
  clearTimeout(S.timer);
  $('.studio', S.root).append(el);
  const done = () => { el.remove(); if (S) S.banner = null; };
  $('[data-theirs]', el).addEventListener('click', async () => {
    done();
    try { await reload(m); toast('Showing the latest version'); } catch (error) { toast(error.message); }
  });
  $('[data-mine]', el).addEventListener('click', async () => {
    done();
    try {
      const head = await api(`/api/decks/${S.did}`);
      S.base = head.base;
      S.dirty = true;
      await save();
      toast('Your version is the latest now');
    } catch (error) { toast(error.message); }
  });
}

// ---------- present, share, history, more ----------

async function present() {
  if (S.dirty) await save();
  if (S.inflight) await S.inflight.catch(() => {});
  location.href = `/p/${S.did}#${S.sel + 1}`;
}

function keys(e) {
  if (!S || e.defaultPrevented) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); return; }
  if (isEditing() || $('.sheet-box') || $('.menu') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); select(S.sel + 1); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); select(S.sel - 1); }
  else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); present(); }
}

function shareURL(path) { return location.origin + path; }

async function shareSheet() {
  if (S.dirty) save();
  const box = html('<div></div>');
  const s = sheet('Share', box, { focus: false });
  const paint = () => {
    const sh = S.deck.shared;
    const head = S.deck.revision;
    box.innerHTML = `<div class="share-state${sh ? ' on' : ''}"><span class="ic-wrap">${icons.link}</span><div class="row-main"><b>${sh ? 'Anyone with the link can view' : 'Only people in ' + esc(S.ws.name)}</b><span class="row-sub" style="white-space:normal">${sh ? 'They see the slides and notes, not your workspace or its people.' : 'Turn on a link to show this deck to anyone.'}</span></div><button type="button" class="switch" role="switch" aria-checked="${!!sh}" aria-label="Share with a link"></button></div>
      ${sh ? `<div class="share-opts">
        <div class="copy-row"><input class="input mono" readonly value="${esc(shareURL(sh.url))}"><button class="btn primary" data-copy>${icons.copy}Copy link</button></div>
        <label class="radio"><input type="radio" name="mode" value="latest"${sh.mode === 'latest' ? ' checked' : ''}><span><b>Follow every change</b><small>The link always shows the latest save, live.</small></span></label>
        <label class="radio"><input type="radio" name="mode" value="pinned"${sh.mode === 'pinned' ? ' checked' : ''}><span><b>Keep this version</b><small>${sh.mode === 'pinned' ? `Shows revision ${sh.revision}${sh.revision !== head ? ` (the deck is at ${head})` : ''} until you update it.` : 'Freeze the link at the current revision.'}</small></span></label>
        ${sh.mode === 'pinned' && sh.revision !== head ? '<button class="btn" data-update>Update the link to the latest</button>' : ''}
        <div class="field" style="margin-top:16px"><span>Embed on a website</span><textarea class="textarea input mono" readonly rows="3"></textarea><button class="btn" data-embed style="align-self:flex-start">${icons.code}Copy embed code</button></div>
      </div>` : ''}`;
    $('.switch', box).addEventListener('click', () => setMode(sh ? 'off' : 'latest'));
    if (sh) {
      const code = `<iframe src="${shareURL(sh.embed)}" title="${esc(S.content.title || 'Deck')}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px" allow="fullscreen" allowfullscreen loading="lazy"></iframe>`;
      $('textarea', box).value = code;
      $('[data-copy]', box).addEventListener('click', () => copy(shareURL(sh.url), 'Link copied'));
      $('[data-embed]', box).addEventListener('click', () => copy(code, 'Embed code copied'));
      $$('[name="mode"]', box).forEach((r) => r.addEventListener('change', () => setMode(r.value)));
      $('[data-update]', box)?.addEventListener('click', () => setMode('pinned', head));
    }
  };
  const setMode = async (mode, revision) => {
    if (mode === 'off' && !(await confirmSheet('Stop sharing?', 'The link stops working for everyone who has it. Sharing again makes a new link.', 'Stop sharing', { danger: true }))) return;
    try {
      if (S.inflight) await S.inflight.catch(() => {});
      const r = await api(`/api/decks/${S.did}/share`, { method: 'PUT', body: { mode, ...(revision ? { revision } : {}) } });
      S.deck = { ...S.deck, ...r.deck, channel: S.deck.channel };
      paint();
      toast(mode === 'off' ? 'Link turned off' : mode === 'latest' ? 'The link follows every change' : 'The link shows this version');
    } catch (error) { toast(error.message); }
  };
  paint();
  return s;
}

async function historySheet() {
  if (S.dirty) await save();
  const box = html('<div><div class="spinner"></div></div>');
  sheet('History', box, { focus: false });
  let data;
  try { data = await api(`/api/decks/${S.did}/revisions`); } catch (error) { box.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  const pinned = data.deck.shared && data.deck.shared.mode === 'pinned' ? data.deck.shared.revision : null;
  box.innerHTML = '';
  for (const r of data.revisions) {
    const current = r.n === data.deck.revision;
    const who = r.by === 'claude' ? `<span class="who claude">${icons.claude}</span>` : `<span class="who">${esc((r.name || '?').charAt(0).toUpperCase())}</span>`;
    const row = html(`<div class="rev">${who}<div class="rev-main"><b>${esc(r.message || (r.by === 'claude' ? 'Claude saved' : 'Edited'))}</b><small>${esc(r.by === 'claude' ? 'Claude' : r.name || 'Someone')} · ${esc(ago(r.at))} · ${r.slides} slides · #${r.n}${current ? ' <span class="chip accent">Current</span>' : ''}${pinned === r.n ? ' <span class="chip">Shared</span>' : ''}</small></div><div class="row-actions"><a class="btn ghost" href="/p/${S.did}?rev=${r.n}" target="_blank" rel="noopener">View</a>${current ? '' : '<button class="btn" data-restore>Restore</button>'}</div></div>`);
    $('[data-restore]', row)?.addEventListener('click', async () => {
      if (!(await confirmSheet(`Restore revision ${r.n}?`, 'It becomes the latest version. Nothing is lost: the current version stays in the history.', 'Restore'))) return;
      try { await api(`/api/decks/${S.did}/restore`, { method: 'POST', body: { revision: r.n } }); $('.sheet-box [data-close]')?.click(); await reload(); toast(`Restored revision ${r.n}`); } catch (error) { toast(error.message); }
    });
    box.append(row);
  }
  if (!data.revisions.length) box.innerHTML = '<p class="muted">No history yet.</p>';
}

// Who opened the shared link and how far they read. One series per chart, in the deck's
// accent: opens per day for 30 days, then how many reached each slide and how long they stayed.
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const DEVICE = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer' };

async function statsSheet() {
  const box = html('<div class="deck-stats"><div class="spinner"></div></div>');
  const s = sheet('Stats', box, { wide: true, focus: false });
  let data;
  try { data = await api(`/api/decks/${S.did}/stats`); } catch (error) { box.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  const t = data.totals;
  if (!t.opens) {
    box.innerHTML = `<div class="empty" style="padding:30px 10px 16px"><div class="art" style="color:var(--text-3)">${icons.chart.replace('class="ic"', 'class="ic" style="width:44px;height:44px;stroke-width:1.3"')}</div><h2>No opens yet</h2><p>${data.deck.shared ? 'When someone opens the share link or an embed, you’ll see how far they read and how long each slide held them.' : 'Share the deck with a link. When people open it, you’ll see how far they read and how long each slide held them.'}</p>${data.deck.shared ? '' : '<div class="row-actions"><button class="btn primary" data-share>Share…</button></div>'}</div><p class="stats-note">${esc(data.note)}</p>`;
    $('[data-share]', box)?.addEventListener('click', () => { s.close(); shareSheet(); });
    return;
  }
  const tile = (label, value, sub) => `<div class="stat-tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const peak = Math.max(1, ...data.days.map((d) => d.opens));
  const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  box.innerHTML = `
    <div class="stat-tiles">
      ${tile('Opens', t.opens.toLocaleString(), t.embedded ? `${t.embedded.toLocaleString()} in embeds` : '')}
      ${tile('Readers', t.readers.toLocaleString(), 'different browsers')}
      ${tile('Average read', clock(t.average_seconds), `${t.reads.toLocaleString()} read${t.reads === 1 ? '' : 's'} of 10 s or more`)}
      ${tile('Read to the end', `${t.read_to_end}%`, 'reached the last slide')}
    </div>
    <h3 class="stats-h">Opens, last 30 days</h3>
    <div class="days" role="img" aria-label="Opens per day for the last 30 days, at most ${peak} in a day">
      <span class="days-peak">${peak}</span>
      <div class="days-bars">${data.days.map((d) => `<span class="day" tabindex="0" data-tip="${esc(`${day(d.date)} · ${d.opens} open${d.opens === 1 ? '' : 's'} · ${d.reads} read${d.reads === 1 ? '' : 's'}`)}"><i style="height:${d.opens ? Math.max(4, (d.opens / peak) * 100) : 0}%"></i></span>`).join('')}</div>
      <div class="days-axis"><span>${esc(day(data.days[0].date))}</span><span>Today</span></div>
      <div class="tip" hidden></div>
    </div>
    <h3 class="stats-h">Slide by slide <small>how many got there · average time on it</small></h3>
    <ol class="reach">${data.slides.map((x) => `<li><span class="n">${x.n}</span><span class="reach-title">${esc(x.title)}</span><span class="reach-bar"><i style="width:${x.reached}%"></i></span><b>${x.reached}%</b><small>${clock(x.average_seconds)}</small></li>`).join('')}</ol>
    <h3 class="stats-h">Latest opens</h3>
    <div class="group">${data.recent.map((v) => `<div class="row"><div class="row-main"><span class="row-title">${DEVICE[v.device] || 'Computer'} · ${v.embedded ? `embedded${v.from ? ` on ${esc(v.from)}` : ''}` : v.from ? `from ${esc(v.from)}` : 'direct'}${v.returning ? ' <span class="chip">Returning</span>' : ''}</span><span class="row-sub">${esc(ago(v.at))}</span></div><div class="row-actions stats-seen"><b>${v.reached} of ${v.of}</b><small>${clock(v.seconds)}</small></div></div>`).join('')}</div>
    <p class="stats-note">${esc(data.note)} Slides are counted by position. Covers ${esc(data.counted)}.</p>`;
  // One tooltip for the day strip: hover, focus or tap a day.
  const chart = $('.days', box);
  const tip = $('.tip', chart);
  const point = (el) => {
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const c = chart.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(r.left - c.left + r.width / 2, 70), c.width - 70)}px`;
  };
  chart.addEventListener('pointerover', (e) => point(e.target.closest('.day')));
  chart.addEventListener('pointerleave', () => point(null));
  chart.addEventListener('focusin', (e) => point(e.target.closest('.day')));
  chart.addEventListener('focusout', () => point(null));
}

function moreMenu(anchor) {
  menu(anchor, [
    { label: 'Stats', icon: icons.chart, run: () => statsSheet() },
    { label: 'History', icon: icons.history, run: () => historySheet() },
    { label: 'Duplicate deck', icon: icons.duplicate, run: async () => { if (S.dirty) await save(); try { const r = await api(`/api/decks/${S.did}/duplicate`, { method: 'POST', body: {} }); toast('Duplicated'); S.app.go(`/d/${r.deck.id}`); } catch (error) { toast(error.message); } } },
    { label: 'Print or save as PDF', icon: icons.external, run: async () => { if (S.dirty) await save(); window.open(`/p/${S.did}?print=1`, '_blank', 'noopener'); } },
    '-',
    { label: 'Delete deck…', icon: icons.trash, danger: true, run: async () => {
      if (!(await confirmSheet('Delete this deck?', `“${S.content.title || 'Untitled deck'}” and its history will be gone for everyone on ${S.ws.name}.`, 'Delete', { danger: true }))) return;
      try { clearTimeout(S.timer); S.dirty = false; await api(`/api/decks/${S.did}`, { method: 'DELETE' }); toast('Deleted'); S.app.go(`/w/${S.ws.id}`); } catch (error) { toast(error.message); }
    } },
  ]);
}
