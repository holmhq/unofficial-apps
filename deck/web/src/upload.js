// The upload link's page: pick pictures; photos are shrunk here first, then each goes to this
// same address, one at a time. They land in the workspace's library for Claude to use.
import { shrinkPhoto, measure, kb, esc, applyTheme } from './lib.js?v=0.1.1';

applyTheme();
const $ = (s) => document.querySelector(s);
const here = location.pathname;
const lead = $('#lead');
const drop = $('#drop');
const list = $('#list');
let left = 0;
let expires = 0;

function minutesLeft() {
  const m = Math.round((expires - Date.now()) / 60000);
  return m <= 1 ? 'about a minute' : `${m} minutes`;
}
function paintLeft() {
  $('#left').textContent = left ? `This link takes ${left} more picture${left === 1 ? '' : 's'} and works for ${minutesLeft()}.` : 'This link has taken all its pictures. Ask Claude for a new one if you need more.';
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
    lead.textContent = 'They go to your workspace’s library, ready for Claude to put on a slide.';
    paintLeft();
    setInterval(() => { if (Date.now() > expires) closed('This upload link has expired. Ask Claude for a new one.'); else if (left) paintLeft(); }, 30000);
  } catch { closed('Deck could not be reached. Check your connection and reload.'); }
}

function closed(reason) {
  lead.textContent = reason;
  lead.classList.add('u-bad');
  drop.hidden = true;
  $('#left').textContent = '';
}

function row(file) {
  const li = document.createElement('li');
  li.className = 'u-item';
  li.innerHTML = `<span class="u-thumb"></span><span class="u-name"><b>${esc(file.name || 'Picture')}</b><small>${kb(file.size)}</small><span class="u-track"><span class="u-fill"></span></span></span><span class="u-state">Waiting</span>`;
  try { li.querySelector('.u-thumb').style.backgroundImage = `url("${URL.createObjectURL(file)}")`; } catch { /* no preview */ }
  list.append(li);
  return {
    note: (text) => { li.querySelector('small').textContent = text; },
    progress: (p) => { li.querySelector('.u-fill').style.width = `${Math.round(p * 100)}%`; },
    state: (text, kind) => {
      const s = li.querySelector('.u-state');
      s.textContent = text;
      s.className = `u-state${kind ? ` u-${kind}` : ''}`;
      if (kind) li.querySelector('.u-track').hidden = true;
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
    view.state('Preparing');
    const ready = await shrinkPhoto(file);
    if (ready !== file) view.note(`${kb(file.size)} → ${kb(ready.size)}`);
    if (ready.size > 12 * 1024 * 1024) throw new Error('Pictures can be 12 MB at most');
    const size = await measure(ready);
    const form = new FormData();
    form.set('file', ready);
    if (size.width) { form.set('width', String(size.width)); form.set('height', String(size.height)); }
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
drop.addEventListener('drop', (e) => { e.preventDefault(); add([...((e.dataTransfer && e.dataTransfer.files) || [])]); });

start();
