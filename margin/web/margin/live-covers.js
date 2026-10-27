// Drawn covers come alive under the pointer. Each drawing is an SVG from /margin/covers.js
// (the same module the server draws them with). The pointer sets a target; every frame
// eases the drawing's state toward it and patches the SVG in place, so positions always
// come from the state and the small looping animations keep running.
import { normalize, initial, pointer, step, render } from '/margin/covers.js';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function patch(svg, markup) {
  const next = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const walk = (a, b) => {
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return true; }
    if (a.nodeName !== b.nodeName || a.childNodes.length !== b.childNodes.length) return false;
    if (/^animate/.test(a.nodeName)) return true;
    for (const attr of [...b.attributes]) if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
    for (const attr of [...a.attributes]) if (!b.hasAttribute(attr.name)) a.removeAttribute(attr.name);
    for (let i = 0; i < a.childNodes.length; i++) if (!walk(a.childNodes[i], b.childNodes[i])) return false;
    return true;
  };
  if (!walk(svg, next)) svg.replaceWith(document.importNode(next, true));
}

// /c/week-paper-lilac-1203.svg -> the drawing's spec.
export function specOf(src) {
  const m = /\/c\/([a-z]+)-([a-z]+)-([a-z]+)-(\d{1,4})\.svg/.exec(src || '');
  return m ? normalize({ motif: m[1], look: m[2], tone: m[3], seed: Number(m[4]) }) : null;
}

export function mount(host, spec, options = {}) {
  let state = initial(spec);
  let target = state;
  let frame = 0;
  if (!host.querySelector('svg')) host.innerHTML = render(spec, state, options);
  host.style.touchAction = 'pan-y';
  const tick = () => {
    const r = step(spec, state, target);
    state = r.state;
    const svg = host.querySelector('svg');
    if (svg) patch(svg, render(spec, state, options));
    frame = r.done ? 0 : requestAnimationFrame(tick);
  };
  const follow = (e) => {
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    target = pointer(spec, state, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
    if (!frame) frame = requestAnimationFrame(tick);
  };
  host.addEventListener('pointermove', follow);
  host.addEventListener('pointerdown', follow);
  return { follow };
}

// An <img> of a drawing becomes the live SVG, keeping the image's box.
function swap(img, spec) {
  const wrap = document.createElement('span');
  wrap.className = `${img.className} m-drawing`.trim();
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', img.alt || '');
  const w = img.clientWidth;
  const h = img.clientHeight;
  const labels = !/[?&]labels=0/.test(img.getAttribute('src'));
  wrap.style.display = 'block';
  wrap.style.width = '100%';
  if (w && h) wrap.style.aspectRatio = `${w} / ${h}`;
  wrap.innerHTML = render(spec, initial(spec), { labels });
  const svg = wrap.firstElementChild;
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = '100%';
  img.replaceWith(wrap);
  return mount(wrap, spec, { labels });
}

export function upgrade(root = document) {
  if (still()) return;
  for (const el of root.querySelectorAll('[data-m-drawing]')) {
    if (el.dataset.mLive) continue;
    el.dataset.mLive = '1';
    try { mount(el, normalize(JSON.parse(el.dataset.mDrawing))); } catch { /* leave it still */ }
  }
  for (const img of root.querySelectorAll('img[src*="/c/"]')) {
    const spec = specOf(img.getAttribute('src'));
    if (!spec || img.dataset.mLive) continue;
    img.dataset.mLive = '1';
    // The post's own cover is live at once; covers in lists wake when the pointer arrives.
    if (img.closest('figure')) { if (img.complete) swap(img, spec); else img.addEventListener('load', () => swap(img, spec), { once: true }); }
    else img.addEventListener('pointerenter', (e) => swap(img, spec).follow(e), { once: true });
  }
}
