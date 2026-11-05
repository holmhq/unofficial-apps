// Studio helpers: requests, DOM, icons, dates, sheets, menus, toasts and uploads.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

// The workspace Studio is in; every request names it so the server knows where you are.
let workspace = null;
export function setWorkspace(slug) { workspace = slug || null; }
export function currentWorkspace() { return workspace; }

export async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' };
  if (workspace && options.workspace !== false) init.headers['x-margin-workspace'] = workspace;
  if (options.form) init.body = options.form;
  else if (options.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(options.body); }
  // Any change may show anywhere, so a write forgets every remembered answer.
  if (init.method !== 'GET') memory.clear();
  let res;
  try { res = await fetch(path, init); } catch { throw Object.assign(new Error('You seem to be offline.'), { status: 0 }); }
  if (res.status === 413) throw Object.assign(new Error('That is too large for this server.'), { status: 413 });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw Object.assign(new Error((data && data.error && data.error.message) || 'Something went wrong. Try again.'), { status: res.status, code: data && data.error && data.error.code, details: data && data.error && data.error.details });
  return data;
}

// Studio's views ask again every time they open, but paint the last answer at once and then
// again only if the server has news. Each view passes alive(), so a late answer never paints
// over a view that was left.
const memory = new Map();
export async function remembered(paths, paint, alive = () => true) {
  const many = Array.isArray(paths);
  const asks = (many ? paths : [paths]).map((p) => (typeof p === 'string' ? { path: p } : p));
  const keys = asks.map((a) => `${a.options && a.options.workspace === false ? '' : workspace || ''} ${a.path}`);
  const kept = keys.map((k) => memory.get(k));
  const shape = (list) => (many ? list : list[0]);
  const whole = kept.every(Boolean);
  if (whole) paint(shape(kept.map((k) => k.data)), true);
  let fresh;
  try { fresh = await Promise.all(asks.map((a) => api(a.path, a.options))); } catch (error) { if (whole) return; throw error; }
  let changed = !whole;
  fresh.forEach((data, n) => {
    const text = JSON.stringify(data);
    if (!kept[n] || kept[n].text !== text) changed = true;
    memory.set(keys[n], { data, text });
  });
  if (changed && alive()) paint(shape(fresh), false);
}
export function forget() { memory.clear(); }

export function toast(text) {
  $('.toast')?.remove();
  const el = h(`<div class="toast" role="status">${esc(text)}</div>`);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function ago(iso) {
  if (!iso) return '';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 604800) return `${Math.round(s / 86400)} d ago`;
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ''}`;
}

const P = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const icons = {
  posts: P('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h4"/>'),
  comments: P('<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092a10 10 0 1 0-4.777-4.719"/>'),
  blogs: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  team: P('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  site: P('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10a15.3 15.3 0 0 1-4 10a15.3 15.3 0 0 1-4-10a15.3 15.3 0 0 1 4-10z"/>'),
  themes: P('<path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3.5-4 3.5h-1.8a1.7 1.7 0 0 0-1.2 2.9c.3.3.5.7.5 1.2c0 1.3-1.2 2.4-3.5 2.4z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'),
  claude: P('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>'),
  pen: P('<path d="M13 21h8m.174-14.188a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
  plus: P('<path d="M5 12h14m-7-7v14"/>'),
  back: P('<path d="m15 18l-6-6l6-6"/>'),
  chev: P('<path d="m9 18l6-6l-6-6"/>'),
  updown: P('<path d="m7 15l5 5l5-5M7 9l5-5l5 5"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  home: P('<path d="M4 21V9l8-6l8 6v12h-5v-6H9v6z"/>'),
  shield: P('<path d="M12 3L4 6v6c0 4.5 3.4 8.2 8 9c4.6-.8 8-4.5 8-9V6z"/>'),
  drawing: P('<path d="M3 17l6-3.5l6 3.5l6-3.5M3 10.5L9 7l6 3.5L21 7M9 7v10.5m6-7v10"/>'),
  down: P('<path d="m6 9l6 6l6-6"/>'),
  close: P('<path d="M18 6L6 18M6 6l12 12"/>'),
  more: P('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  external: P('<path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  copy: P('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  check: P('<path d="M20 6L9 17l-5-5"/>'),
  trash: P('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  eye: P('<path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
  image: P('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
  clap: '<svg class="ic ic-s" viewBox="0 0 256 256" aria-hidden="true" style="stroke:none"><path fill="currentColor" d="M188.87 65a18 18 0 0 0-31.25 18l-24.26-42a18 18 0 0 0-31.22 18L96.4 49a18 18 0 0 0-31.22 18l3.34 5.77A26 26 0 0 0 39.74 111l3 5.2A26 26 0 0 0 23.5 155l35.27 61a80.14 80.14 0 0 0 149.52-39.57a71.92 71.92 0 0 0 1.71-74.85Zm1.2 127.56A64.12 64.12 0 0 1 72.65 208l-35.27-61a10 10 0 0 1 17.34-10L75 172a8 8 0 0 0 13.87-8l-35.25-61A10 10 0 0 1 71 93l31.81 55a8 8 0 0 0 13.87-8l-26-45a10 10 0 0 1 17.35-10l36.5 63a8 8 0 0 0 13.87-8l-12.6-21.75a10 10 0 0 1 17.64-9.25l20.22 35a63.52 63.52 0 0 1 6.41 48.57Z"/></svg>',
  out: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5l-5-5m5 5H9"/>'),
  upload: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5l-5 5M12 3v12"/>'),
  download: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5l5-5M12 15V3"/>'),
  moon: P('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  monitor: P('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  chart: P('<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>'),
  // The MCP logo's two strokes (shelf/tools/mcp.svg), filled.
  mcp: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="stroke:none"><path fill="currentColor" d="M15.228,3.596C14.355,2.745 12.942,2.745 12.068,3.596L3.642,11.859C3.351,12.142 2.881,12.142 2.589,11.859C2.45,11.723 2.371,11.537 2.371,11.342C2.371,11.148 2.45,10.962 2.589,10.826L11.015,2.563C12.472,1.146 14.825,1.146 16.281,2.563C17.107,3.366 17.501,4.52 17.335,5.661C18.49,5.497 19.659,5.879 20.494,6.694L20.538,6.738C21.235,7.416 21.629,8.348 21.629,9.32C21.629,10.293 21.235,11.225 20.538,11.903L12.917,19.375C12.871,19.421 12.845,19.483 12.845,19.548C12.845,19.611 12.871,19.674 12.917,19.719L14.482,21.254C14.622,21.39 14.7,21.577 14.7,21.771C14.7,21.965 14.622,22.152 14.482,22.287C14.191,22.571 13.721,22.571 13.429,22.287L11.864,20.753C11.539,20.437 11.355,20.002 11.355,19.548C11.355,19.093 11.539,18.658 11.864,18.342L19.485,10.869C19.903,10.462 20.139,9.902 20.139,9.319C20.139,8.736 19.903,8.177 19.485,7.77L19.441,7.727C18.568,6.877 17.158,6.876 16.284,7.725L10.006,13.882L9.918,13.968C9.627,14.252 9.156,14.252 8.865,13.968C8.725,13.833 8.647,13.646 8.647,13.452C8.647,13.258 8.725,13.071 8.865,12.935L15.231,6.692C15.647,6.285 15.882,5.727 15.882,5.145C15.882,4.562 15.647,4.003 15.228,3.596ZM14.175,5.661C14.314,5.526 14.393,5.339 14.393,5.145C14.393,4.951 14.314,4.764 14.175,4.629C13.884,4.345 13.413,4.345 13.121,4.629L6.89,10.74C6.193,11.418 5.799,12.35 5.799,13.322C5.799,14.295 6.193,15.227 6.89,15.904C8.346,17.322 10.699,17.322 12.156,15.904L18.388,9.793C18.527,9.657 18.606,9.471 18.606,9.277C18.606,9.082 18.527,8.896 18.388,8.76C18.097,8.477 17.626,8.477 17.334,8.76L11.103,14.872C10.229,15.722 8.816,15.722 7.943,14.872C7.524,14.465 7.289,13.905 7.289,13.322C7.289,12.739 7.524,12.18 7.943,11.773L14.175,5.661Z"/></svg>',
  feedback: P('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
};

export function sheet(title, content, options = {}) {
  const scrim = h('<div class="scrim"></div>');
  const box = h(`<div class="sheet${options.className ? ' ' + esc(options.className) : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn filled" data-close aria-label="Close">${icons.close}</button></div><div class="sheet-body"></div></div>`);
  const body = box.querySelector('.sheet-body');
  if (typeof content === 'string') body.innerHTML = content; else body.append(content);
  const close = () => { scrim.remove(); box.remove(); document.removeEventListener('keydown', onKey); options.onClose?.(); handle.onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  box.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, box);
  // The first field, or the sheet itself, so focus is inside it without a ring on a button.
  setTimeout(() => (box.querySelector('input, textarea, select') || box).focus({ preventScroll: true }), 80);
  const handle = { body, close, box };
  return handle;
}

// A popup menu under its button. The same button closes it again; so do Escape, a click
// outside and choosing an item. Arrow keys move between items. An item with checked: true
// carries a tick on the right.
export function menu(anchor, items) {
  const open = $('.menu');
  if (open) { open._close(); if (open._anchor === anchor) return null; }
  const el = h('<div class="menu" role="menu"></div>');
  el._anchor = anchor;
  for (const item of items) {
    if (item === '-') { el.append(h('<div class="sep" role="separator"></div>')); continue; }
    // A row of icon choices, such as the theme: each is named for screen readers and on hover.
    if (item.choices) {
      const row = h(`<div class="menu-choices" role="group" aria-label="${esc(item.label)}"></div>`);
      for (const c of item.choices) {
        const b = h(`<button type="button" role="menuitemradio" aria-label="${esc(c.label)}" title="${esc(c.label)}" aria-checked="${!!c.checked}"></button>`);
        b.innerHTML = c.icon;
        b.addEventListener('click', () => { close(); c.run(); });
        row.append(b);
      }
      el.append(row);
      continue;
    }
    const b = h(item.href ? `<a role="menuitem" href="${esc(item.href)}"${item.blank ? ' target="_blank" rel="noopener"' : ''}></a>` : `<button type="button" role="${item.checked !== undefined ? 'menuitemradio' : 'menuitem'}"></button>`);
    b.innerHTML = `${item.icon || ''}<span class="menu-label">${esc(item.label)}</span>${item.note ? `<span class="menu-note">${esc(item.note)}</span>` : ''}${item.checked ? `<span class="menu-check">${icons.check}</span>` : ''}`;
    if (item.checked !== undefined) b.setAttribute('aria-checked', String(!!item.checked));
    if (item.danger) b.classList.add('danger');
    b.addEventListener('click', () => { close(); if (item.run) item.run(); });
    el.append(b);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - w - 10);
  if (r.left > window.innerWidth / 2) x = Math.min(r.right - w, window.innerWidth - w - 10);
  x = Math.max(10, x);
  let y = r.bottom + 6;
  if (y + hgt > window.innerHeight - 10) y = Math.max(10, r.top - hgt - 6);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  const entries = () => $$('[role^="menuitem"]', el);
  const off = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = entries();
      const at = list.indexOf(document.activeElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
    }
    if (e.key === 'Tab') close();
  };
  function close() {
    el.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', off, true);
    document.removeEventListener('keydown', keys, true);
    window.removeEventListener('resize', close);
  }
  el._close = close;
  document.addEventListener('pointerdown', off, true);
  document.addEventListener('keydown', keys, true);
  window.addEventListener('resize', close);
  return el;
}

// Anything to copy (an address, a command, a link) is one button: the value on one line in
// mono with a copy icon at its end. Pointing at it fades in Copy; a click turns the icon into
// a green tick and the word into Copied for 1.6 s. A value too long for the line scrolls
// under a fade. field.set(value) fills it in later; until then it does nothing.
export function copyField(value = '', placeholder = '') {
  const el = h(`<div class="copy-field" role="button" tabindex="0"><code class="copy-value"></code><span class="copy-cue"><span class="copy-word" aria-live="polite">Copy</span><span class="cf-copy">${icons.copy}</span><span class="cf-tick">${icons.check}</span></span></div>`);
  const text = el.querySelector('.copy-value');
  const word = el.querySelector('.copy-word');
  let current = '';
  let timer;
  const fade = () => el.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1);
  el.set = (next) => { current = next || ''; text.textContent = current || placeholder; el.classList.toggle('is-empty', !current); el.setAttribute('aria-disabled', String(!current)); requestAnimationFrame(fade); };
  const run = async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(current); } catch {
      getSelection().selectAllChildren(text);
      toast('Couldn’t copy. It’s selected, so copy it by hand.');
      return;
    }
    el.classList.add('is-copied');
    word.textContent = 'Copied';
    clearTimeout(timer);
    timer = setTimeout(() => { el.classList.remove('is-copied'); word.textContent = 'Copy'; }, 1600);
  };
  el.addEventListener('click', run);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
  text.addEventListener('scroll', fade, { passive: true });
  new ResizeObserver(fade).observe(text);
  el.set(value);
  return el;
}

export async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { prompt('Copy this', text); }
}

// Phone photos are big: shrink to 2048 px JPEG before upload (keeps GIFs and video as they are).
export async function shrinkPhoto(file, maxSide = 2048, quality = 0.82) {
  const heic = /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!heic && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900000)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || (!heic && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

async function dimensions(file) {
  if (file.type.startsWith('image/')) {
    try { const b = await createImageBitmap(file); return { width: b.width, height: b.height }; } catch { return { width: 0, height: 0 }; }
  }
  if (file.type.startsWith('video/')) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(v.src); };
      v.onerror = () => resolve({ width: 0, height: 0 });
      v.src = URL.createObjectURL(file);
    });
  }
  return { width: 0, height: 0 };
}

export async function upload(file, maxSide) {
  if (file.type.startsWith('video/') && file.size > 20 * 1024 * 1024) throw new Error('Videos can be 20 MB at most. Trim it, or share a YouTube or Vimeo link instead.');
  const ready = file.type.startsWith('image/') ? await shrinkPhoto(file, maxSide) : file;
  if (ready.size > 12 * 1024 * 1024 && ready.type.startsWith('image/')) throw new Error('That photo is too large (12 MB at most).');
  const size = await dimensions(ready);
  const form = new FormData();
  form.set('file', ready);
  form.set('width', String(size.width));
  form.set('height', String(size.height));
  return api('/api/media', { method: 'POST', form });
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h(`<input type="file" accept="${esc(accept)}" hidden>`);
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export function setTheme(value) {
  try { if (value === 'system') localStorage.removeItem('margin.theme'); else localStorage.setItem('margin.theme', value); } catch { /* private mode */ }
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}
export function currentTheme() { try { return localStorage.getItem('margin.theme') || 'system'; } catch { return 'system'; } }
