// The upload link's page: pick photos, drawings or a video; photos are shrunk here first, then
// each file goes to this same address. Claude finds them in the person's library.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const here = location.pathname;
const lead = $('#lead');
const drop = $('#drop');
const list = $('#list');
let left = 0;
let expires = 0;

const ICON_VIDEO = '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-3v10l-6-3"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function minutesLeft() {
  const m = Math.round((expires - Date.now()) / 60000);
  return m <= 1 ? 'about a minute' : `${m} minutes`;
}
function paintLeft() {
  $('#left').textContent = left ? `This link takes ${left} more file${left === 1 ? '' : 's'} and works for ${minutesLeft()}.` : 'This link has taken all its files. Ask Claude for a new one if you need more.';
  drop.hidden = !left;
}

async function start() {
  if (!/^\/upload\/[a-z0-9]{24}$/.test(here)) return closed('This page needs an upload link from Claude.');
  try {
    const res = await fetch(`${here}?status`, { cache: 'no-store' });
    const s = await res.json();
    if (!s.valid) return closed(s.reason);
    left = s.files_left;
    expires = Date.parse(s.expires_at);
    lead.textContent = 'They go to your Margin library, ready for Claude to put in a post.';
    paintLeft();
    setInterval(() => { if (Date.now() > expires) closed('This upload link has expired. Ask Claude for a new one.'); else if (left) paintLeft(); }, 30000);
  } catch { closed('Margin could not be reached. Check your connection and reload.'); }
}

function closed(reason) {
  lead.textContent = reason;
  lead.classList.add('u-bad');
  drop.hidden = true;
  $('#left').textContent = '';
}

// Phone photos are big: shrink to 2048 px JPEG first, and turn HEIC into JPEG. GIFs, drawings
// and videos go as they are.
async function shrinkPhoto(file, maxSide = 2048, quality = 0.82) {
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

async function measure(file) {
  if (/^image\//.test(file.type) && file.type !== 'image/svg+xml') {
    try { const b = await createImageBitmap(file); return { width: b.width, height: b.height }; } catch { return null; }
  }
  if (/^video\//.test(file.type)) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(v.src); };
      v.onerror = () => resolve(null);
      v.src = URL.createObjectURL(file);
    });
  }
  return null;
}

function row(file) {
  const li = document.createElement('li');
  li.className = 'u-item';
  const image = /^image\//.test(file.type) || /\.(svg|heic)$/i.test(file.name);
  li.innerHTML = `<span class="u-thumb">${image ? '' : /^video\//.test(file.type) ? ICON_VIDEO : ICON_FILE}</span>`
    + `<span class="u-name"><b>${esc(file.name || 'File')}</b><small>${kb(file.size)}</small><span class="u-bar-track"><span class="u-bar-fill"></span></span></span>`
    + '<span class="u-state">Waiting</span>';
  if (image) { try { li.querySelector('.u-thumb').style.backgroundImage = `url("${URL.createObjectURL(file)}")`; } catch { /* no preview */ } }
  list.append(li);
  return {
    note: (text) => { li.querySelector('small').textContent = text; },
    progress: (p) => { li.querySelector('.u-bar-fill').style.width = `${Math.round(p * 100)}%`; },
    state: (text, kind) => {
      const s = li.querySelector('.u-state');
      s.textContent = text;
      s.className = `u-state${kind ? ` u-${kind}` : ''}`;
      if (kind) li.querySelector('.u-bar-track').hidden = true;
    },
  };
}

function send(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', here);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(xhr.status === 413 ? 'Too large for this server' : (body.error && body.error.message) || 'Not added'));
    };
    xhr.onerror = () => reject(new Error('Connection lost'));
    xhr.send(form);
  });
}

// One at a time, in the order picked: phones often have little memory and slow uplinks.
let queue = Promise.resolve();
function add(files) {
  if (!left || drop.hidden) return;
  for (const file of files) {
    if (!left) break;
    left--;
    const view = row(file);
    queue = queue.then(() => one(file, view));
  }
  paintLeft();
}

async function one(file, view) {
  try {
    if (/^video\//.test(file.type) && file.size > 20 * 1024 * 1024) throw new Error('Videos can be 20 MB at most');
    view.state('Preparing');
    const ready = /^image\//.test(file.type) || /\.heic$/i.test(file.name) ? await shrinkPhoto(file) : file;
    if (ready !== file) view.note(`${kb(file.size)} → ${kb(ready.size)}`);
    if (ready.size > 12 * 1024 * 1024 && /^image\//.test(ready.type)) throw new Error('Photos can be 12 MB at most');
    const size = await measure(ready);
    const form = new FormData();
    form.set('file', ready);
    if (size) { form.set('width', String(size.width)); form.set('height', String(size.height)); }
    view.state('Sending');
    const out = await send(form, view.progress);
    view.state('Added', 'ok');
    $('#done').hidden = false;
    if (typeof out.files_left === 'number') { left = Math.min(left, out.files_left); paintLeft(); }
  } catch (error) {
    view.state(error.message || 'Not added', 'err');
    left++;
    paintLeft();
  }
}

$('#files').addEventListener('change', (e) => { add([...e.target.files]); e.target.value = ''; });
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('u-over'); });
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('u-over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); add([...(e.dataTransfer && e.dataTransfer.files || [])]); });

start();
