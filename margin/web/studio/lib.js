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
  let res;
  try { res = await fetch(path, init); } catch { throw Object.assign(new Error('You seem to be offline.'), { status: 0 }); }
  if (res.status === 413) throw Object.assign(new Error('That is too large for this server.'), { status: 413 });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw Object.assign(new Error((data && data.error && data.error.message) || 'Something went wrong. Try again.'), { status: res.status, code: data && data.error && data.error.code, details: data && data.error && data.error.details });
  return data;
}

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
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  chart: P('<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>'),
  feedback: P('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
};

export function sheet(title, content, options = {}) {
  const scrim = h('<div class="scrim"></div>');
  const box = h(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn filled" data-close aria-label="Close">${icons.close}</button></div><div class="sheet-body"></div></div>`);
  const body = box.querySelector('.sheet-body');
  if (typeof content === 'string') body.innerHTML = content; else body.append(content);
  const close = () => { scrim.remove(); box.remove(); document.removeEventListener('keydown', onKey); options.onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  box.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(scrim, box);
  setTimeout(() => box.querySelector('input, textarea, select')?.focus(), 80);
  return { body, close, box };
}

export function menu(anchor, items) {
  $$('.menu').forEach((m) => m.remove());
  const el = h('<div class="menu" role="menu"></div>');
  for (const item of items) {
    if (item === '-') { el.append(h('<div class="sep"></div>')); continue; }
    const b = h(item.href ? `<a role="menuitem" href="${esc(item.href)}"${item.blank ? ' target="_blank" rel="noopener"' : ''}></a>` : '<button type="button" role="menuitem"></button>');
    b.innerHTML = `${item.icon || ''}<span>${esc(item.label)}</span>`;
    if (item.danger) b.classList.add('danger');
    if (item.run) b.addEventListener('click', () => { el.remove(); item.run(); });
    el.append(b);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let x = Math.min(r.right - w, window.innerWidth - w - 10);
  x = Math.max(10, x);
  let y = r.bottom + 6;
  if (y + hgt > window.innerHeight - 10) y = Math.max(10, r.top - hgt - 6);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  setTimeout(() => {
    const off = (e) => { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('pointerdown', off); } };
    document.addEventListener('pointerdown', off);
  });
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
