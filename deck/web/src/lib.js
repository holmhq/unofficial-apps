// The app's helpers: requests, DOM, icons, dates, sheets, menus, toasts, theme and uploads.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function html(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; }

export async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' };
  if (options.form) init.body = options.form;
  else if (options.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(options.body); }
  let res;
  try { res = await fetch(path, init); } catch { throw Object.assign(new Error('You seem to be offline.'), { status: 0 }); }
  if (res.status === 413) throw Object.assign(new Error('That is too large for this server.'), { status: 413 });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw Object.assign(new Error((data && data.error && data.error.message) || 'Something went wrong. Try again.'), { status: res.status, code: data && data.error && data.error.code, details: data && data.error && data.error.details });
  return data;
}

let toastTimer = 0;
// A short note at the bottom. action: { label, run } adds a button.
export function toast(text, action, ms = 2800) {
  $('.toast')?.remove();
  const el = html(`<div class="toast" role="status"><span>${esc(text)}</span></div>`);
  if (action) {
    const b = html(`<button type="button">${esc(action.label)}</button>`);
    b.addEventListener('click', () => { el.remove(); action.run(); });
    el.append(b);
  }
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, action ? Math.max(ms, 5000) : ms);
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
export const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Lucide-style line icons (ISC licence, web/vendor/lucide/LICENSE).
const P = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const icons = {
  plus: P('<path d="M5 12h14m-7-7v14"/>'),
  back: P('<path d="m15 18-6-6 6-6"/>'),
  chev: P('<path d="m9 18 6-6-6-6"/>'),
  down: P('<path d="m6 9 6 6 6-6"/>'),
  updown: P('<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>'),
  close: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  more: P('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  play: P('<path d="M7 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L7.77 4.08A.5.5 0 0 0 7 4.5z"/>'),
  share: P('<path d="M12 2v13m4-9-4-4-4 4m-4 6v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>'),
  link: P('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  history: P('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"/>'),
  copy: P('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  check: P('<path d="M20 6 9 17l-5-5"/>'),
  trash: P('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  image: P('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>'),
  upload: P('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  team: P('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  decks: P('<rect x="8" y="3" width="13" height="10" rx="2"/><path d="M16 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1"/>'),
  claude: P('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  out: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  moon: P('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  monitor: P('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
  chart: P('<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>'),
  external: P('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  duplicate: P('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  grip: P('<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>'),
  up: P('<path d="m18 15-6-6-6 6"/>'),
  sliders: P('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  phone: P('<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>'),
  code: P('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  mail: P('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
  feedback: P('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  palette: P('<path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3.5-4 3.5h-1.8a1.7 1.7 0 0 0-1.2 2.9c.3.3.5.7.5 1.2 0 1.3-1.2 2.4-3.5 2.4z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'),
  pencil: P('<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4"/>'),
};
export const MARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="4.5" width="12" height="9" rx="1.8" fill="currentColor" opacity=".5"/><rect x="4.5" y="9" width="12" height="10" rx="1.8" fill="currentColor"/></svg>';

// A sheet: a centred dialog on wide screens, a card from the bottom on phones.
export function sheet(title, content, options = {}) {
  const scrim = html('<div class="scrim"></div>');
  const box = html(`<div class="sheet-box${options.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icons.close}</button></div><div class="sheet-body"></div></div>`);
  const body = box.querySelector('.sheet-body');
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.append(content);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    scrim.classList.add('out');
    box.classList.add('out');
    setTimeout(() => { scrim.remove(); box.remove(); }, 220);
    options.onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !$('.menu')) close(); };
  scrim.addEventListener('click', close);
  box.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, box);
  if (options.focus !== false) setTimeout(() => box.querySelector('input:not([type=checkbox]):not([readonly]), textarea')?.focus(), 90);
  return { body, close, box };
}

// A popup menu under its button. The same button closes it again; so do Escape, a click
// outside and choosing an item. Arrow keys move between items. checked: true adds a tick.
export function menu(anchor, items, options = {}) {
  const open = $('.menu');
  if (open) { open._close(); if (open._anchor === anchor) return null; }
  const el = html('<div class="menu" role="menu"></div>');
  el._anchor = anchor;
  if (options.header) el.append(options.header);
  for (const item of items) {
    if (item === '-') { el.append(html('<div class="sep" role="separator"></div>')); continue; }
    if (item.custom) { el.append(item.custom); continue; }
    const b = html(item.href ? `<a role="menuitem" href="${esc(item.href)}"${item.blank ? ' target="_blank" rel="noopener"' : ''}></a>` : `<button type="button" role="${item.checked !== undefined ? 'menuitemradio' : 'menuitem'}"></button>`);
    b.innerHTML = `${item.icon || ''}<span class="menu-label">${esc(item.label)}</span>${item.note ? `<span class="menu-note">${esc(item.note)}</span>` : ''}${item.checked ? `<span class="menu-check">${icons.check}</span>` : ''}`;
    if (item.checked !== undefined) b.setAttribute('aria-checked', String(!!item.checked));
    if (item.danger) b.classList.add('danger');
    if (item.disabled) b.setAttribute('disabled', '');
    b.addEventListener('click', () => { close(); if (item.run) item.run(); });
    el.append(b);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let x = r.left > window.innerWidth / 2 ? r.right - w : r.left;
  x = Math.max(10, Math.min(x, window.innerWidth - w - 10));
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

export async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { prompt('Copy this', text); }
}

export function confirmSheet(title, body, action, { danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const box = html(`<div class="confirm"><p>${esc(body)}</p><div class="sheet-actions"><button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(action)}</button></div></div>`);
    const s = sheet(title, box, { onClose: () => { if (!done) resolve(false); }, focus: false });
    $('[data-no]', box).addEventListener('click', () => s.close());
    $('[data-yes]', box).addEventListener('click', () => { done = true; resolve(true); s.close(); });
    setTimeout(() => $('[data-yes]', box).focus(), 90);
  });
}

// ---------- theme ----------

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
export function currentTheme() { try { return localStorage.getItem('deck.theme') || 'system'; } catch { return 'system'; } }
export function setTheme(value) {
  try { if (value === 'system') localStorage.removeItem('deck.theme'); else localStorage.setItem('deck.theme', value); } catch { /* private mode */ }
  applyTheme();
}
export function applyTheme() {
  const t = currentTheme();
  document.documentElement.dataset.theme = t === 'system' ? (darkMQ.matches ? 'dark' : 'light') : t;
}
darkMQ.addEventListener('change', applyTheme);

// ---------- pictures ----------

// Photos from phones are big: shrink JPEG, WebP and HEIC to 2560 px first. Screenshots (PNG)
// go as they are, so their text stays sharp; the server shrinks any over 2560 px.
export async function shrinkPhoto(file, maxSide = 2560, quality = 0.86) {
  const heic = /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!heic && (!/^image\/(jpeg|webp)$/.test(file.type) || file.size < 900000)) return file;
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

export async function measure(file) {
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    try { const b = await createImageBitmap(file); return { width: b.width, height: b.height }; } catch { return { width: 0, height: 0 }; }
  }
  return { width: 0, height: 0 };
}

export async function uploadTo(path, file) {
  if (!file.type.startsWith('image/') && !/\.(svg|hei[cf])$/i.test(file.name)) throw new Error(`${file.name} is not a picture.`);
  const ready = await shrinkPhoto(file);
  if (ready.size > 12 * 1024 * 1024) throw new Error(`${file.name} is too large (12 MB at most).`);
  const size = await measure(ready);
  const form = new FormData();
  form.set('file', ready);
  form.set('width', String(size.width));
  form.set('height', String(size.height));
  return api(path, { method: 'POST', form });
}

export function pickFiles(accept, multiple = true) {
  return new Promise((resolve) => {
    const input = html(`<input type="file" accept="${esc(accept)}"${multiple ? ' multiple' : ''} hidden>`);
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// ---------- people ----------

export function avatar(person, size = 28) {
  const name = (person && person.name) || '';
  if (person && person.picture) return `<img class="avatar" src="${esc(person.picture)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" referrerpolicy="no-referrer">`;
  const initial = name.trim().charAt(0).toUpperCase();
  return `<span class="avatar avatar-empty" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" aria-hidden="true">${initial ? esc(initial) : icons.user}</span>`;
}

export function wsLogo(ws, size = 26) {
  if (ws && ws.logo) return `<img class="ws-logo" src="${esc(ws.logo)}" alt="" style="width:${size}px;height:${size}px">`;
  return `<span class="ws-logo ws-logo-empty" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px" aria-hidden="true">${esc((ws && ws.initial) || '•')}</span>`;
}

// A short, quiet sound for live arrivals (Web Audio, no files). Off when the person prefers
// reduced motion, since that often goes with fewer surprises.
let audio = null;
export function chime() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') return;
    const t = audio.currentTime;
    for (const [f, d] of [[880, 0], [1320, 0.07]]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.035, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.32);
      o.connect(g).connect(audio.destination);
      o.start(t + d);
      o.stop(t + d + 0.34);
    }
  } catch { /* no audio */ }
}
addEventListener('pointerdown', () => { try { audio ||= new AudioContext(); if (audio.state === 'suspended') audio.resume(); } catch { /* no audio */ } }, { once: true });
