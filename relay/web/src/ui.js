// Relay — shared DOM + UI helpers.

import { iconEl as _iconEl, svg as _svg } from './icons.js';

// Tiny DOM builder: el('div', { class, onclick, html, text, ... }, ...children)
export function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    (Array.isArray(c) ? c : [c]).forEach((x) => {
      if (x == null || x === false) return;
      node.appendChild(typeof x === 'string' || typeof x === 'number' ? document.createTextNode(String(x)) : x);
    });
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function avatarEl(profile, size) {
  const px = (size || 44) + 'px';
  const a = el('div', { class: 'avatar', style: { width: px, height: px, fontSize: Math.round((size || 44) * 0.4) + 'px' } });
  // Prefer a real photo, fall back to a generated avatar URL (/auth/avatar?seed=…),
  // then initials. (Backend sends `picture` as '' when unset, so the fallback must
  // trigger on any falsy value — the old `=== undefined` check never did.)
  const pic = profile ? (profile.picture || profile.avatar || null) : null;
  if (pic) {
    a.appendChild(el('img', { src: pic, alt: '', loading: 'lazy' }));
  } else {
    a.classList.add('solid');
    a.textContent = initials(profile);
  }
  return a;
}

export function initials(p) {
  let name = (p && (p.displayName || p.username)) || '?';
  name = name.replace(/^@/, '');
  const parts = name.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

let toastWrap = null;
export function toast(msg, icon) {
  if (!toastWrap) { toastWrap = el('div', { class: 'toast-wrap' }); document.body.appendChild(toastWrap); }
  const t = el('div', { class: 'toast' });
  if (icon) t.appendChild(_iconEl(icon, { size: '16px' }));
  t.appendChild(el('span', { text: msg }));
  toastWrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2600);
}

// Save an attachment to the device. Phone-first: fetch the blob, then hand it
// to the OS share sheet (Save Image → Photos / Save to Files) where file
// sharing is supported; otherwise fall back to a blob-URL download link (which
// also covers desktop and iOS when the share window has lapsed). `url` must be
// same-origin so the auth cookie rides along. Returns true if a save was
// initiated. Best-effort: on iPhone the actual sheet is the load-bearing check.
export async function saveFile(url, filename) {
  const name = (filename && String(filename).trim()) || 'download';
  let blob;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    blob = await res.blob();
  } catch (_e) {
    toast('Download failed', 'alert-triangle');
    return false;
  }
  const type = blob.type || 'application/octet-stream';
  try {
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], name, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false; // user dismissed the sheet
    // Any other error (e.g. iOS activation lapsed) → fall through to the link.
  }
  try {
    const objUrl = URL.createObjectURL(blob);
    const a = el('a', { href: objUrl, download: name, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    return true;
  } catch (_e) {
    toast('Download failed', 'alert-triangle');
    return false;
  }
}

// Anything to copy is one click-to-copy field: the value on one line in mono, a copy icon at its
// end, Copy fading in on hover, and a tick with Copied for 1.6 s after a click. No toast.
export function copyField(value) {
  const text = el('code', { class: 'copy-value mono', text: value });
  const word = el('span', { class: 'copy-word', 'aria-live': 'polite', text: 'Copy' });
  let timer;
  async function copy() {
    try { await navigator.clipboard.writeText(value); } catch (_e) {
      getSelection().selectAllChildren(text);
      toast('Couldn’t copy. It’s selected, so copy it by hand.', 'alert-triangle');
      return;
    }
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (_e) {}
    field.classList.add('is-copied');
    word.textContent = 'Copied';
    clearTimeout(timer);
    timer = setTimeout(() => { field.classList.remove('is-copied'); word.textContent = 'Copy'; }, 1600);
  }
  const field = el('div', {
    class: 'copy-field', role: 'button', tabindex: '0', 'aria-label': 'Copy ' + value,
    onclick: copy,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); } }
  }, text, el('span', { class: 'copy-cue' }, word, _iconEl('copy', { size: '16px', cls: 'cf-copy' }), _iconEl('check', { size: '16px', cls: 'cf-tick' })));
  const fade = () => field.classList.toggle('is-long', text.scrollLeft + text.clientWidth < text.scrollWidth - 1);
  text.addEventListener('scroll', fade, { passive: true });
  new ResizeObserver(fade).observe(text);
  return field;
}

// A popover menu under its button. Its own button again closes it, and so do Escape and a
// click anywhere else. items: { label, icon, onclick, danger } | 'sep' | a Node.
let openMenuState = null;
export function menu(anchor, items) {
  const again = openMenuState && openMenuState.anchor === anchor;
  closeMenu();
  if (again) return null;
  const box = el('div', { class: 'menu', role: 'menu' });
  items.forEach((item) => {
    if (!item) return;
    if (item === 'sep') { box.appendChild(el('hr')); return; }
    if (item instanceof Node) { box.appendChild(item); return; }
    box.appendChild(el('button', { class: 'menu-item' + (item.danger ? ' danger' : ''), type: 'button', role: 'menuitem',
      onclick: () => { closeMenu(); if (item.onclick) item.onclick(); } },
      item.icon ? _iconEl(item.icon, { size: '18px' }) : null, el('span', { class: 'grow', text: item.label })));
  });
  document.body.appendChild(box);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(10, Math.min(r.right - box.offsetWidth, innerWidth - box.offsetWidth - 10));
  box.style.left = left + 'px';
  box.style.top = (r.bottom + 8) + 'px';
  box.style.transformOrigin = (r.left + r.width / 2 - left) + 'px 0';
  anchor.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => box.classList.add('open'));
  const first = box.querySelector('button');
  if (first && anchor.matches(':focus-visible')) first.focus({ preventScroll: true });
  const away = (e) => {
    if (e.type === 'keydown') {
      if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus({ preventScroll: true }); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = Array.from(box.querySelectorAll('button'));
        const i = list.indexOf(document.activeElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
        e.preventDefault();
      }
      return;
    }
    if (box.contains(e.target) || anchor.contains(e.target)) return;
    closeMenu();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
  });
  openMenuState = { box, away, anchor };
  return box;
}
export function closeMenu() {
  if (!openMenuState) return false;
  const { box, away, anchor } = openMenuState;
  openMenuState = null;
  document.removeEventListener('pointerdown', away, true);
  document.removeEventListener('keydown', away, true);
  anchor.setAttribute('aria-expanded', 'false');
  box.classList.remove('open');
  setTimeout(() => box.remove(), 160);
  return true;
}

// Three icons for light, dark and this device's choice: no words, which would widen the menu.
export function themeSwitch(value, onpick, themes) {
  const box = el('div', { class: 'seg theme-seg', role: 'group', 'aria-label': 'Appearance' });
  const buttons = themes.map((t) => el('button', { type: 'button', 'aria-label': t.label, title: t.label, 'aria-pressed': String(t.id === value),
    onclick: () => { buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(themes[i].id === t.id))); onpick(t.id); } },
    _iconEl(t.icon, { size: '17px' })));
  buttons.forEach((b) => box.appendChild(b));
  return box;
}

// Shared bottom sheet (contact details, etc.). One active at a time;
// tapping the scrim dismisses. Mirrors the chat-thread sheet styling.
let activeSheet = null;
export function openSheet(bodyNode) {
  closeSheet();
  const scrim = el('div', { class: 'scrim', onclick: () => closeSheet() });
  const sheet = el('div', { class: 'sheet' }, el('div', { class: 'grip' }), bodyNode);
  const wrap = el('div', { class: 'overlay-wrap' }, scrim, sheet);
  document.body.appendChild(wrap);
  activeSheet = wrap;
  return wrap;
}
// Returns true if an overlay was open and got dismissed, false otherwise —
// lets callers (e.g. an Escape handler) decide whether to fall through.
export function closeSheet() {
  const node = activeSheet;
  if (!node) return false;
  activeSheet = null;
  if (node._teardown) { try { node._teardown(); } catch (_e) {} }   // lightbox keydown cleanup
  node.querySelectorAll('.scrim, .sheet, .lightbox-img').forEach((n) => n.classList.add('out'));
  setTimeout(() => node.remove(), 220);
  return true;
}

// Full-screen image viewer. Reuses the single overlay registry so only one
// sheet/lightbox is ever active and Escape dismisses it.
//   openLightbox({ items: [{ src, caption }], index })
// items drive prev/next + counter; caption shows under the image. A bare
// openLightbox(srcString) still works for unmigrated callers.
export function openLightbox(opts) {
  if (typeof opts === 'string') opts = { items: [{ src: opts }], index: 0 };
  const items = (opts && opts.items) || [];
  let index = (opts && typeof opts.index === 'number') ? opts.index : 0;
  if (!items.length) return;
  if (index < 0 || index >= items.length) index = 0;
  closeSheet();

  const multi = items.length > 1;
  const scrim = el('div', { class: 'scrim lightbox' });
  const stage = el('div', { class: 'lightbox-stage' });
  const img = el('img', { class: 'lightbox-img' });
  const caption = el('div', { class: 'lightbox-caption' });
  const counter = el('div', { class: 'lightbox-counter' });
  const closeBtn = el('button', { class: 'lightbox-btn lightbox-close', 'aria-label': 'Close', onclick: () => closeSheet() },
    _iconEl('x', { size: '22px' }));
  const prevBtn = el('button', { class: 'lightbox-btn lightbox-nav lightbox-prev', 'aria-label': 'Previous' },
    _iconEl('chevron-left', { size: '28px' }));
  const nextBtn = el('button', { class: 'lightbox-btn lightbox-nav lightbox-next', 'aria-label': 'Next' },
    _iconEl('chevron-right', { size: '28px' }));
  const hasSave = items.some((it) => it && it.save && it.save.url);
  const saveBtn = hasSave ? el('button', { class: 'lightbox-btn lightbox-save', 'aria-label': 'Save', title: 'Save',
    onclick: (e) => { e.stopPropagation(); const it = items[index]; if (it && it.save) saveFile(it.save.url, it.save.name); } },
    _iconEl('download', { size: '20px' })) : null;

  function render() {
    const it = items[index];
    if (!it) return;
    if (img.getAttribute('src') !== it.src) img.src = it.src;
    clear(caption);
    if (it.caption) caption.appendChild(el('span', { text: it.caption }));
    caption.style.display = it.caption ? '' : 'none';
    counter.textContent = multi ? (index + 1) + ' / ' + items.length : '';
  }
  function go(delta) {
    const n = index + delta;
    if (n < 0 || n >= items.length) return;
    index = n; render();
  }
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); go(1); });

  stage.appendChild(img);
  const wrap = el('div', { class: 'overlay-wrap lightbox-wrap', onclick: () => closeSheet() },
    scrim, stage, closeBtn, saveBtn, prevBtn, nextBtn, caption, counter);
  document.body.appendChild(wrap);
  activeSheet = wrap;

  // Tapping the image itself (not the surrounding stage) keeps the viewer open.
  img.addEventListener('click', (e) => e.stopPropagation());

  // Keyboard: Esc closes, arrows step when there's more than one image.
  function onKey(e) {
    if (e.key === 'Escape') { closeSheet(); }
    else if (multi && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (multi && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  }
  document.addEventListener('keydown', onKey);
  wrap._teardown = () => document.removeEventListener('keydown', onKey);

  // Touch swipe (mobile) — horizontal swipe steps prev/next.
  let sx = 0, sy = 0;
  stage.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; const dx = t.clientX - sx; const dy = t.clientY - sy;
    if (multi && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  render();
  return wrap;
}

export function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const days = Math.floor(h / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + 'd';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export { _iconEl as iconEl, _svg as svg };

// "A Holm app", Feedback and Source, at the foot of Settings and the welcome screen.
const HOLM_MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4.667 0h22.666A4.667 4.667 0 0 1 32 4.667v22.666A4.667 4.667 0 0 1 27.333 32H4.667A4.667 4.667 0 0 1 0 27.333V4.667A4.667 4.667 0 0 1 4.667 0ZM6.75 16h18.5c.414 0 .75.336.75.75v10.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0-.75.75v4.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-10.5c0-.414.336-.75.75-.75Zm0-12h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Zm14 0h4.5c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75Z"/></svg>';
export function openFeedback() {
  const widget = globalThis.HolmFeedback || globalThis.ZytFeedback;
  if (widget && widget.open) widget.open();
  else toast('Feedback isn’t available right now', 'alert-triangle');
}
export function holmFooter() {
  return el('footer', { class: 'settings-foot' },
    el('a', { href: 'https://holmhq.com', target: '_blank', rel: 'noopener', html: HOLM_MARK + '<span>A Holm app</span>' }),
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('button', { type: 'button', onclick: openFeedback, text: 'Feedback' }),
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    el('a', { href: 'https://github.com/holmhq/unofficial-apps/tree/main/relay', target: '_blank', rel: 'noopener', text: 'Source' })
  );
}
