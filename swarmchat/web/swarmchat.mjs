#!/usr/bin/env node
// swarmchat.mjs: the SwarmChat command line in one file, with no dependencies, for Node 22+ and Bun.
//
//   node swarmchat.mjs login https://swarmchat.example.com <token>
//   node swarmchat.mjs send '#release review' 'build 412 is green'
//   node swarmchat.mjs wait --timeout 600
//
// It follows the commands, flags, output and exit codes of the upstream Python client
// (github.com/Pranjal2041/swarmchat, MIT), and speaks the same protocol, so it works against
// either server. Exit codes: 0 done, 1 bad request, 2 not found, 3 not allowed, 4 wait timed out,
// 5 server unreachable. Against a server that answers `wait` at once and names a wake channel, a
// wait sleeps on that realtime channel and asks again only when woken, so waiting costs nothing.
// Not here: --where and --sort expressions, and sending folders. The upstream client has them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const NAME = 'swarmchat';
const VERSION = '0.1.0';
const UA = `${NAME}/${VERSION}`;
const ENV = NAME.toUpperCase();
const CONFIG_DIR = process.env[`${ENV}_CONFIG_DIR`]
  || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), NAME);
const HOLD = 280; // seconds per held wait request, against a server that holds waits
const EXIT = { 0: 5, 400: 1, 401: 3, 403: 3, 404: 2, 413: 1 };
const SPARE = 64 << 20; // bytes a download or an unpacked folder must leave free
const MAX_ENTRIES = 100000;
const SEGMENT = 10000; // lines per log file in an exported folder
const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const UNSAFE_JSON = /[\x7f-\x9f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const RETRY_SAFE = new Set(['whoami', 'people', 'chats', 'chat_info', 'notifications', 'settings_show', 'policy_show']);
const NOT_HERE = 'is not supported by swarmchat.mjs. The upstream Python client has it: pip install swarmchat.';
const debug = process.env[`${ENV}_DEBUG`] ? (...a) => console.error(`[${new Date().toISOString()}]`, ...a) : () => {};
const temps = new Set(); // files and folders to remove if the command is cut off

class ClientError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------------------------------------------------------------------- printing

const esc = (c) => {
  const n = c.codePointAt(0);
  return n < 0x100 ? `\\x${n.toString(16).padStart(2, '0')}` : `\\u${n.toString(16).padStart(4, '0')}`;
};

// Text from the server, safe to print: control characters and the marks that reverse text show as escapes,
// and so do line breaks unless `lines`. Agents write these texts; another agent's terminal must not act on them.
function clean(text, lines = true) {
  text = String(text).replace(UNSAFE, esc);
  return lines ? text : text.replaceAll('\n', '\\n');
}

function tidy(value, key = null) {
  if (typeof value === 'string') return clean(value, key === 'text' || key === 'description');
  if (Array.isArray(value)) return value.map((v) => tidy(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[clean(k, false)] = tidy(v, k);
    return out;
  }
  return value;
}

function say(parts, { lines = true, err = false } = {}) {
  const text = (Array.isArray(parts) ? parts : [parts]).map((p) => clean(pyStr(p), lines)).join(' ');
  (err ? process.stderr : process.stdout).write(text + '\n');
}

function pyStr(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'object') return pyDumps(v);
  return String(v);
}

// json.dumps as Python writes it: ", " and ": " between items, or indented like indent=1.
function pyDumps(value, { indent = null, ascii = false } = {}) {
  const one = (x) => {
    if (x === null || x === undefined) return 'null';
    if (typeof x === 'string') return JSON.stringify(x);
    if (typeof x === 'number') return Number.isFinite(x) ? JSON.stringify(x) : Number.isNaN(x) ? 'NaN' : x > 0 ? 'Infinity' : '-Infinity';
    if (typeof x === 'boolean') return String(x);
    if (Array.isArray(x)) return `[${x.map(one).join(', ')}]`;
    return `{${Object.entries(x).map(([k, v]) => `${JSON.stringify(k)}: ${one(v)}`).join(', ')}}`;
  };
  let out = indent === null ? one(value) : JSON.stringify(value, null, indent);
  if (ascii) out = out.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return out;
}

const jsonLine = (item) => pyDumps(item).replace(UNSAFE_JSON, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);
const two = (n) => String(n).padStart(2, '0');

function local(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return String(at);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// A time from the command line, sent as UTC: 30m, 2h or 3d ago, a local date or time, or a message id.
function when(value) {
  if (!value) return value;
  const ago = /^(\d+)([smhd])$/.exec(value);
  if (ago) return new Date(Date.now() - Number(ago[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[ago[2]]).toISOString();
  const t = value.replaceAll(' ', 'T').replaceAll('Z', '+00:00');
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d{1,6}))?)?)?)?([+-]\d{2}(?::?\d{2})?(?::?\d{2})?)?$/.exec(t);
  if (!m) return value; // a message id
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1, 7).map((x) => (x === undefined ? undefined : Number(x)));
  const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
  let moment;
  if (m[8]) {
    const sign = m[8][0] === '-' ? -1 : 1;
    const [oh, om = '0'] = m[8].slice(1).split(':').length > 1 ? m[8].slice(1).split(':') : [m[8].slice(1, 3), m[8].slice(3, 5) || '0'];
    moment = Date.UTC(y, mo - 1, d, h, mi, s, ms) - sign * (Number(oh) * 60 + Number(om)) * 60000;
  } else {
    moment = new Date(y, mo - 1, d, h, mi, s, ms).getTime();
  }
  if (Number.isNaN(moment)) return value;
  return new Date(moment).toISOString();
}

function receipt(readBy, unreadBy) {
  const total = readBy.length + unreadBy.length;
  if (!readBy.length) return 'not read yet';
  if (!unreadBy.length) return total === 1 ? 'read' : 'read by all';
  const names = readBy.slice(0, 3).map((r) => r.name).join(', ') + (readBy.length > 3 ? ` and ${readBy.length - 3} more` : '');
  return `read by ${names}, ${readBy.length} of ${total}`;
}

function size(n) {
  for (const unit of ['bytes', 'KB', 'MB']) {
    if (n < 1000) return unit === 'bytes' ? `${n.toFixed(0)} ${unit}` : `${n.toFixed(1)} ${unit}`;
    n /= 1000;
  }
  return `${n.toFixed(1)} GB`;
}

function messageLine(m) {
  const text = m.deleted ? '(deleted)' : (m.text ?? '');
  const answered = m.reply_to_from ? `${m.reply_to_from}'s ${m.reply_to}` : m.reply_to;
  const notes = m.reply_to && !('depth' in m) ? [`reply to ${answered}`] : []; // a thread indents instead
  if (m.edited_at) notes.push('edited');
  if ('read_by' in m) notes.push(receipt(m.read_by, m.unread_by));
  const reactions = Object.entries(m.reactions || {}).map(([emoji, users]) => `${emoji} ${users.join(', ')}`).join('  ');
  const head = `${m.id}  ${local(m.at)}  ${'from_name' in m ? pyStr(m.from_name) : m.from}: `;
  const lines = String(text).split('\n');
  let out = head + lines[0] + lines.slice(1).map((l) => `\n    ${l}`).join('');
  if (notes.length) out += `  (${notes.join(', ')})`;
  for (const f of m.attachments || []) out += `\n    [${f.folder ? 'folder' : 'file'}] ${f.name}  ${size(f.size)}  ${f.id}`;
  return out + (reactions ? `\n    [${reactions}]` : '');
}

function printMessages(result) {
  const titles = result.chats || {};
  let current = null;
  for (const m of result.messages) {
    if (m.chat !== current) {
      current = m.chat;
      say(`== ${titles[current]?.title ?? current} [${current}]`);
    }
    const indent = '  '.repeat(m.depth || 0); // in a thread, a reply sits under the message it answers
    say(messageLine(m).split('\n').map((l) => indent + l).join('\n'));
  }
}

function chatLine(c) {
  const unread = c.unread ? `${c.unread} unread` + (c.mentioned ? ', mentions you' : '') : 'read';
  const last = c.last;
  const preview = last ? `  ${local(last.at)} ${pyStr(last.from_name)}: ${Array.from(last.text ?? '').slice(0, 70).join('')}`.replaceAll('\n', ' ') : '';
  const notify = c.notify ?? 'all';
  const muted = notify === 'all' ? '' : `  [notify ${notify}]`;
  const pub = c.public ? '  [public]' : '';
  const archived = c.archived ? '  [archived]' : '';
  return `${c.id}  ${c.title}${pub}${archived}  (${unread})${muted}${preview}`;
}

function emit(a, items, printer) {
  if (a.json) for (const item of items) process.stdout.write(jsonLine(item) + '\n');
  else printer(items);
}

// ---------------------------------------------------------------------- files

const MIME = {
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', xml: 'application/xml', yaml: 'application/yaml', yml: 'application/yaml',
  py: 'text/x-python', sh: 'text/x-sh', c: 'text/x-csrc', h: 'text/x-chdr', java: 'text/x-java', diff: 'text/x-diff',
  patch: 'text/x-diff', sql: 'application/sql', pdf: 'application/pdf', zip: 'application/zip', tar: 'application/x-tar',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  ico: 'image/vnd.microsoft.icon', mp3: 'audio/mpeg', wav: 'audio/x-wav', ogg: 'audio/ogg', mp4: 'video/mp4',
  webm: 'video/webm', mov: 'video/quicktime', wasm: 'application/wasm', rtf: 'application/rtf',
  epub: 'application/epub+zip', doc: 'application/msword', xls: 'application/vnd.ms-excel',
};
const guessType = (name) => MIME[(/\.([^./]+)$/.exec(name)?.[1] || '').toLowerCase()] || '';

// A file name that cannot point anywhere else: no folders, no '..', no control characters.
function safeName(name) {
  let n = String(name ?? '').replaceAll('\\', '/');
  n = n.slice(n.lastIndexOf('/') + 1).trim();
  n = Array.from(n).filter((c) => c === ' ' || !/[\p{C}\p{Z}]/u.test(c)).slice(0, 200).join('');
  return ['', '.', '..'].includes(n) ? 'file' : n;
}

const readText = (p) => {
  try { return fs.readFileSync(p, 'utf8').trim() || null; } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};

// Replaces a file with one only its owner can read, written in full first, then put in place: a file already
// there, with looser permissions or as a link to somewhere else, is replaced, never written through.
function replaceFile(p, text) {
  const tmp = path.join(path.dirname(p), `.${NAME}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

function saveLogin(server, token) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(CONFIG_DIR, 0o700);
  replaceFile(path.join(CONFIG_DIR, 'config.json'), pyDumps({ server }));
  replaceFile(path.join(CONFIG_DIR, 'token'), token + '\n');
}

const readSavedToken = () => readText(path.join(CONFIG_DIR, 'token'));

function freeBytes(dir) {
  try { const s = fs.statfsSync(dir); return { free: s.bavail * s.bsize, block: s.bsize || 4096, inodes: s.files ? s.ffree : null }; } catch { return null; }
}

function tempIn(dir, suffix) {
  const p = path.join(dir, `.${NAME}-${process.pid}-${Math.random().toString(36).slice(2, 10)}${suffix}`);
  temps.add(p);
  return p;
}

const removeAll = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} temps.delete(p); };

// Unzips a folder attachment into dest, refusing absolute paths, '..' and anything else that would land outside
// it, and a folder of more entries or bytes than the limits allow. Store and deflate only, as zip folders send.
function unpack(zipPath, dest) {
  const buf = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('File is not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('large (zip64) folders are not handled here');
  if (count > MAX_ENTRIES) throw new Error(`the folder holds ${count.toLocaleString('en-US')} entries, more than ${MAX_ENTRIES.toLocaleString('en-US')}`);
  const entries = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('Bad magic number for central directory');
    const method = buf.readUInt16LE(at + 10);
    const csize = buf.readUInt32LE(at + 20);
    const usize = buf.readUInt32LE(at + 24);
    const nlen = buf.readUInt16LE(at + 28);
    const elen = buf.readUInt16LE(at + 30);
    const clen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nlen).toString('utf8');
    entries.push({ method, csize, usize, offset, name });
    at += 46 + nlen + elen + clen;
  }
  const base = fs.realpathSync(dest);
  const disk = freeBytes(base);
  if (disk) {
    const total = entries.reduce((n, e) => n + Math.ceil(e.usize / disk.block) * disk.block + disk.block, 0);
    if (total > disk.free - SPARE) throw new Error(`the folder takes ${total.toLocaleString('en-US')} bytes on disk, and this disk has ${disk.free.toLocaleString('en-US')} free`);
    if (disk.inodes !== null && entries.length > disk.inodes - 1000) throw new Error(`the folder holds ${entries.length} entries, and this disk has room for ${disk.inodes} more`);
  }
  for (const e of entries) {
    const parts = e.name.replaceAll('\\', '/').split('/');
    const target = path.resolve(base, ...parts);
    if (e.name.startsWith('/') || e.name.startsWith('\\') || parts.includes('..') || parts[0].includes(':')
        || (target !== base && !target.startsWith(base + path.sep))) {
      throw new Error(`the folder holds an unsafe path: ${e.name}`);
    }
  }
  for (const e of entries) {
    const target = path.resolve(base, ...e.name.replaceAll('\\', '/').split('/'));
    if (e.name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('Bad magic number for file header');
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const raw = buf.subarray(start, start + e.csize);
    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.usize) });
    else throw new Error(`compression method ${e.method} is not handled here`);
    if (data.length !== e.usize) throw new Error(`${e.name} is not the size the folder says`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

// A file as a Blob read from disk as it is sent. Bun drops file-backed parts of a composed Blob, so there the
// bytes are read first.
async function fileBlob(p) {
  if (typeof fs.openAsBlob === 'function' && !globalThis.Bun) {
    try { return await fs.openAsBlob(p); } catch {}
  }
  return fs.readFileSync(p);
}

// ---------------------------------------------------------------------- the client

const dropped = (v) => v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && !v.length);
const CONNECT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT', 'ConnectionRefused', 'FailedToOpenSocket', 'ENOENT']);
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

class Client {
  constructor(server = null, token = null) {
    const config = JSON.parse(readText(path.join(CONFIG_DIR, 'config.json')) || '{}');
    this.server = server || process.env[`${ENV}_SERVER`] || config.server || 'http://127.0.0.1:8484';
    this.token = token || process.env[`${ENV}_TOKEN`] || readText(path.join(CONFIG_DIR, 'token')) || '';
    try {
      this.base = new URL(this.server.includes('://') ? this.server : `http://${this.server}`).origin;
    } catch {
      this.base = null;
    }
    this.ack = {}; // chat -> newest seq a wait handed over and not yet confirmed to the server
  }

  // One request. (response) with its body unread, or ClientError when the server cannot be reached.
  async exchange(name, { method = 'POST', body = null, headers = {}, timeout = 60, retrySafe = false } = {}) {
    if (!this.base) throw new ClientError(0, `Cannot reach ${this.server}: it is not a server address. Is the server running?`);
    for (const attempt of [1, 2]) {
      try {
        return await fetch(`${this.base}/v1/${name}`, {
          method, body, headers: { ...headers, 'user-agent': UA }, signal: AbortSignal.timeout(Math.ceil(timeout * 1000)),
        });
      } catch (e) {
        const code = e?.cause?.code || e?.code;
        const why = e?.name === 'TimeoutError' ? 'timed out' : (e?.cause?.message || e?.message || String(e));
        if (CONNECT.has(code) || /unable to connect|connection refused|bad port|invalid url/i.test(why)) {
          throw new ClientError(0, `Cannot reach ${this.server}: ${why}. Is the server running?`);
        }
        if (!retrySafe || attempt === 2) {
          const detail = retrySafe ? '' : ' The request may have been applied; it was not retried.';
          throw new ClientError(0, `Cannot reach ${this.server}: ${why}.${detail}`);
        }
      }
    }
    throw new ClientError(0, `Cannot reach ${this.server}.`);
  }

  async result(response, acked) {
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text || '{}');
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('expected a JSON object');
    } catch {
      throw new ClientError(response.status !== 200 ? response.status : 0, `Invalid JSON response from ${this.server} (HTTP ${response.status}).`);
    }
    if (acked && response.status !== 401) this.ack = {}; // the server applied them before anything else in this request
    if (response.status !== 200) throw new ClientError(response.status, result.error || `HTTP ${response.status}`);
    return result;
  }

  async call(name, params = {}, httpTimeout = 60) {
    const ack = Object.keys(this.ack).length ? this.ack : null; // confirmations ride along with the next request
    const all = { ...params, ack };
    const body = {};
    for (const [k, v] of Object.entries(all)) if (!dropped(v)) body[k] = v;
    const retrySafe = RETRY_SAFE.has(name) || ((name === 'read' || name === 'wait') && !!params.peek);
    const response = await this.exchange(name, {
      body: JSON.stringify(body), timeout: httpTimeout, retrySafe,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
    });
    return this.result(response, !!ack);
  }

  async limits() {
    const response = await this.exchange('health', { method: 'GET', timeout: 30, retrySafe: true });
    const data = await response.json().catch(() => ({}));
    return response.status === 200 ? (data.limits || {}) : {};
  }

  async send({ chat, text = '', attach = [], reply_to = null }) {
    if (!attach?.length) return this.call('send', { chat, text, reply_to });
    const files = [];
    for (const p of attach) {
      const name = safeName(path.basename(path.normalize(p)));
      let st;
      try { st = fs.statSync(p); } catch { st = null; }
      if (st?.isDirectory()) throw new ClientError(400, `Not sent: ${p} is a folder. Sending folders needs the upstream client (pip install swarmchat), or zip it first.`);
      if (!st?.isFile()) throw new ClientError(400, `There is no file or folder at ${p}.`);
      files.push({ path: p, meta: { name, type: guessType(name), size: st.size } });
    }
    const limits = await this.limits();
    if (files.length > (limits.max_attachments ?? files.length)) {
      throw new ClientError(413, `This server takes at most ${limits.max_attachments} files on one message.`);
    }
    for (const { meta } of files) {
      if (meta.size > (limits.max_attachment ?? meta.size)) {
        throw new ClientError(413, `${meta.name} is ${meta.size} bytes, over this server's limit of ${limits.max_attachment} bytes per file.`);
      }
    }
    const acked = Object.keys(this.ack).length > 0;
    const header = pyDumps({ chat, text, reply_to, ack: acked ? this.ack : null, files: files.map((f) => f.meta) }) + '\n';
    const body = new Blob([header, ...(await Promise.all(files.map((f) => fileBlob(f.path))))]);
    const total = files.reduce((n, f) => n + f.meta.size, 0);
    const response = await this.exchange('send_files', {
      body, timeout: 60 + total / 100000,
      headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${this.token}` },
    });
    return this.result(response, acked);
  }

  // Saves an attachment into the folder `to` under its own name. A folder attachment is unpacked. Never
  // replaces an existing file or folder unless force is set.
  async download(id, to = '.', force = false) {
    const acked = Object.keys(this.ack).length > 0;
    const response = await this.exchange('download', {
      body: JSON.stringify({ id, ...(acked ? { ack: this.ack } : {}) }), retrySafe: true,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
    });
    if (response.status !== 200) await this.result(response, acked); // raises the server's error
    if (acked) this.ack = {};
    let info;
    try { info = JSON.parse(response.headers.get('x-attachment') || '{}'); } catch { info = {}; }
    const target = path.join(to, safeName(info.name));
    let exists = false;
    try { fs.lstatSync(target); exists = true; } catch {}
    if (exists && !force) throw new ClientError(400, `${target} already exists. Use --force to replace it.`);
    fs.mkdirSync(to, { recursive: true });
    const length = Number(response.headers.get('content-length') ?? -1);
    if (length >= 0 && length !== info.size) throw new ClientError(0, `${this.server} sent ${length} bytes for a file of ${info.size}.`);
    const disk = freeBytes(to);
    if (disk && info.size > disk.free - SPARE) {
      throw new ClientError(507, `${info.name} is ${Number(info.size).toLocaleString('en-US')} bytes, and this disk has ${disk.free.toLocaleString('en-US')} free.`);
    }
    const stale = Date.now() - 300000; // a live download writes at least every minute, so older ones were killed
    for (const name of fs.readdirSync(to)) {
      if (name.startsWith(`.${NAME}-`) && (name.endsWith('.part') || name.endsWith('.unpack'))) {
        const p = path.join(to, name);
        try { if (fs.statSync(p).mtimeMs < stale) fs.rmSync(p, { recursive: true, force: true }); } catch {}
      }
    }
    const tmp = tempIn(to, '.part');
    try {
      const fd = fs.openSync(tmp, 'wx', 0o600);
      let got = 0;
      try {
        for await (const chunk of response.body) {
          fs.writeSync(fd, chunk);
          got += chunk.length;
        }
      } finally {
        fs.closeSync(fd);
      }
      if (got !== info.size) throw new ClientError(0, 'The download ended before all its bytes arrived.');
      if (exists) fs.rmSync(target, { recursive: true, force: true }); // force
      if (info.folder) {
        // Unpacked out of sight, then put in place whole: a folder that fails part way leaves nothing.
        const staging = tempIn(to, '.unpack');
        fs.mkdirSync(staging, { mode: 0o700 });
        try {
          unpack(tmp, staging);
          fs.renameSync(staging, target);
          temps.delete(staging);
        } catch (e) {
          throw e instanceof ClientError ? e : new ClientError(400, `Not unpacked: ${e.message}`);
        } finally {
          removeAll(staging);
        }
      } else {
        fs.renameSync(tmp, target);
      }
    } finally {
      removeAll(tmp);
    }
    return target;
  }

  async markMessagesRead(messages, chat = null) {
    const shown = {};
    for (const m of messages) (shown[m.chat] ||= []).push(m.seq);
    if (Object.keys(shown).length) return this.call('mark_read', { shown, chat });
    return null;
  }

  // Messages are marked read only after they have arrived here, so a read cut off on the way never uses
  // them up. The server gives a page at a time; this asks for more while it needs them.
  async read({ peek = false, limit = null, ...select }) {
    const last = select.last;
    const params = { ...select, peek: true, limit };
    let result = await this.call('read', params);
    const keep = result.keep;
    const thread = !!select.thread;
    const titles = {};
    const enough = limit || last || null;
    let found = [];
    for (;;) {
      const page = result.messages;
      found = keep === 'first' ? found.concat(page) : page.concat(found); // history pages go back in time
      Object.assign(titles, result.chats || {});
      if (!result.more || (enough !== null ? found.length >= enough : !thread)) break;
      result = await this.call('read', { ...params, cursor: result.cursor });
    }
    if (enough !== null && found.length > enough) found = keep === 'first' ? found.slice(0, enough) : found.slice(-enough);
    if (!peek && found.length && !select.thread) { // a thread moves no read position
      const scope = select.id ? found[0].chat : select.chat;
      const marked = await this.markMessagesRead(found, scope);
      if (marked && 'unread_left' in marked) result.unread_left = marked.unread_left;
    }
    return { ...result, messages: found, chats: titles };
  }

  // Blocks until a matching message arrives, for at most `timeout` seconds (null: forever). Against a server
  // that holds waits, each request is held. Against one that answers at once and names a wake channel, this
  // sleeps on that channel and asks again when woken, or after retry_after when no socket can open.
  async wait({ timeout = null, peek = false, ...select }) {
    if (timeout !== null && !(Number.isFinite(timeout) && timeout >= 0)) {
      throw new ClientError(400, 'timeout must be a finite number of seconds at least 0.');
    }
    const deadline = timeout === null ? Infinity : Date.now() + timeout * 1000;
    const left = () => deadline - Date.now();
    let after = null;
    let w = null;
    const empties = []; // when recent asks came back empty: the server refuses many in a short time
    try {
      for (;;) {
        if (w) w.woken = false;
        const hold = w ? 0 : Math.max(0, Math.min(HOLD, left() / 1000));
        const asked = Date.now();
        let result;
        try {
          result = await this.call('wait', { ...select, timeout: hold || 0.001, after, peek: true }, hold + 30);
        } catch (e) {
          if (e.status !== 429) throw e;
          debug(`refused: ${e.message}`);
          if (left() <= 0) return { messages: [], positions: {}, chats: {} };
          await sleep(Math.min(10000, left()));
          continue;
        }
        after = { ...(after || {}), ...(result.positions || {}) };
        if (result.messages?.length) {
          if (!peek) for (const m of result.messages) this.ack[m.chat] = Math.max(this.ack[m.chat] || 0, m.seq);
          return result;
        }
        if (left() <= 0) return { ...result, messages: [] };
        const now = Date.now();
        if (result.hint?.channel || now - asked < hold * 1000 - 1000) empties.push(now); // answered at once
        while (empties.length && empties[0] < now - 10000) empties.shift();
        if (result.hint?.channel) {
          if (!w) {
            w = wakes(this.base, result.hint);
            await w.sleep(Math.min(3000, left())); // until subscribed, then ask again: nothing slips between
            continue;
          }
          await w.sleep(Math.min(left(), (w.ready ? 300 : (result.retry_after || 20)) * 1000));
        } else if (Date.now() - asked < hold * 1000 - 1000) {
          // Answered at once with no wake channel: ask again only after a pause.
          await sleep(Math.min(left(), (result.retry_after || 2) * 1000));
        }
        if (empties.length >= 4) await sleep(Math.min(left(), empties[0] + 10000 - Date.now())); // at most 4 per 10 s
      }
    } finally {
      w?.close();
    }
  }

  // Confirms any messages a wait handed over.
  async close() {
    if (Object.keys(this.ack).length) {
      try { await this.call('mark_read'); } catch {} // not confirmed: those messages stay unread and come again
    }
  }
}

// A content-free wake on my secret channel says "ask again". Every wake sets `woken`, which is cleared before
// each ask, so a message landing during an ask is never slept through.
function wakes(base, hint) {
  const state = { woken: false, ready: false, resolve: null, socket: null, closed: false, timer: null };
  const url = base.replace(/^http/, 'ws') + (hint.path || '/_ws');
  const kick = () => { state.woken = true; const r = state.resolve; state.resolve = null; r?.(); };
  const open = () => {
    state.timer = null;
    if (state.closed) return;
    if (typeof WebSocket !== 'function') { debug('no WebSocket in this runtime'); return; }
    let socket;
    try {
      socket = new WebSocket(url, { headers: { Origin: base, 'User-Agent': UA } });
    } catch (e) {
      debug(`socket failed: ${e.message}`);
      return;
    }
    state.socket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'subscribe', channel: hint.channel })));
    socket.addEventListener('message', (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
        else if (msg.type === 'subscribed') { state.ready = true; state.delay = 0; debug('subscribed'); kick(); }
        else if (msg.type === 'message' && msg.channel === hint.channel) { debug('wake'); kick(); }
      }
    });
    socket.addEventListener('close', () => {
      const was = state.ready;
      state.ready = false;
      if (state.closed) return;
      // Reconnect, sooner after a socket that worked. A lost socket may have missed a wake, so ask again;
      // one that never opened changes nothing, and the wait goes on asking every retry_after.
      state.delay = was ? 1000 : Math.min(30000, (state.delay || 500) * 2);
      debug(`socket closed, reconnecting in ${state.delay} ms`);
      state.timer = setTimeout(open, state.delay);
      if (was) kick();
    });
    socket.addEventListener('error', () => {});
  };
  open();
  state.sleep = (ms) => new Promise((resolve) => {
    if (state.woken) return resolve();
    const t = setTimeout(() => { state.resolve = null; resolve(); }, Math.max(0, ms));
    state.resolve = () => { clearTimeout(t); resolve(); };
  });
  state.close = () => {
    state.closed = true;
    if (state.timer) clearTimeout(state.timer);
    try { state.socket?.close(); } catch {}
  };
  return state;
}

// A client whose replies are tidied for printing. --json output sees them as sent.
function shown(client) {
  return new Proxy(client, {
    get(target, prop) {
      const value = target[prop];
      return typeof value === 'function' ? async (...args) => tidy(await value.apply(target, args)) : value;
    },
  });
}

// ---------------------------------------------------------------------- commands

const notHere = (flag) => { throw new ClientError(400, `${flag} ${NOT_HERE}`); };

async function cmdWhoami(a, cl) {
  const u = (await cl.call('whoami')).user;
  emit(a, [u], () => say(`${u.id}  ${u.name}  server ${cl.server}`));
}

async function cmdPeople(a, cl) {
  emit(a, (await cl.call('people', { search: a.search })).people, (people) => {
    for (const u of people) {
      const fields = Object.entries(u.fields || {}).map(([k, v]) => `${k}=${pyStr(v)}`).join('  ');
      say(`${u.id}  ${u.name}` + (fields ? `  ${fields}` : '') + (u.status ? `  (${u.status})` : ''));
    }
  });
}

async function cmdChats(a, cl) {
  if (a.where) notHere('--where');
  const r = await cl.call('chats', { limit: a.limit, unread: a.unread, name: a.name, sort: a.sort, with: a.with_ });
  emit(a, r.chats, (chats) => {
    for (const c of chats) say(chatLine(c));
    if (!chats.length) say('No chats.');
  });
}

async function cmdRead(a, cl) {
  if (a.where) notHere('--where');
  if (a.sort) notHere('--sort');
  const r = await cl.read({
    peek: a.peek, limit: a.limit, chat: a.chat, id: a.id, thread: a.thread, last: a.last, all: a.all,
    since: when(a.since), before: when(a.before), search: a.search, mentions: a.mentions, from: a.from_,
  });
  if (a.json) return emit(a, r.messages, null);
  if (r.fallback) say('(nothing unread here, showing the latest messages)');
  printMessages(r);
  if (!r.messages.length && !r.fallback) {
    say(!(a.last || a.all || a.since || a.before || a.search) ? 'No new messages.' : 'No messages match.');
  }
  if (r.unread_left) say(`${r.unread_left} more unread. Run \`${NAME} read\` again to see them.`);
}

async function cmdSend(a, cl) {
  const text = a.text === '-' ? fs.readFileSync(0, 'utf8') : a.text;
  const r = await cl.send({ chat: a.chat, text, attach: a.attach || [], reply_to: a.reply_to });
  const files = r.message.attachments || [];
  emit(a, [r.message], () => say(`Sent ${r.message.id} to ${r.chat.title} [${r.chat.id}]`
    + (files.length ? ` with ${files.length} attachment${files.length !== 1 ? 's' : ''}: ` + files.map((f) => `${f.name} ${f.id}`).join(', ') : '')
    + '.'));
}

async function cmdDownload(a, cl) {
  const p = await cl.download(a.attachment, a.to, a.force);
  emit(a, [{ id: a.attachment, path: p }], () => say(`Saved ${p}`));
}

async function cmdEdit(a, cl) {
  emit(a, [(await cl.call('edit', { id: a.message, text: a.text })).message], (ms) => say(messageLine(ms[0])));
}

async function cmdDelete(a, cl) {
  emit(a, [(await cl.call('delete', { id: a.message })).message], (ms) => say(`Deleted ${ms[0].id}.`));
}

async function cmdReact(a, cl) {
  emit(a, [(await cl.call('react', { id: a.message, emoji: a.emoji, remove: a.remove })).message], (ms) => say(messageLine(ms[0])));
}

async function cmdInfo(a, cl) {
  const c = (await cl.call('chat_info', { chat: a.chat })).chat;
  const members = c.members.map((u) => `  ${u.id}  ${u.name}` + (u.status ? `  (${u.status})` : '')).join('\n');
  let about = c.description ? `${c.description}\n` : '';
  about += c.managers?.length ? `Managers: ${c.managers.join(', ')}\n` : '';
  emit(a, [c], () => say(`${chatLine(c)}\n${about}${c.messages} message${c.messages !== 1 ? 's' : ''}. Created `
    + `by ${c.created_by} on ${local(c.created_at)}. Members:\n${members}`));
}

async function cmdChannel(a, cl) {
  let r;
  switch (a.action) {
    case 'list':
      return emit(a, (await cl.call('channel_list', { search: a.search, limit: a.limit })).channels, (channels) => {
        for (const c of channels) {
          const count = c.messages === null || c.messages === undefined ? '' : `${c.messages} message${c.messages !== 1 ? 's' : ''}, `;
          const about = (c.description || '').replaceAll('\n', '\n    ');
          say(`${c.id}  ${c.title}  ${c.members} member${c.members !== 1 ? 's' : ''}, ${count}`
            + `last ${local(c.last_at)}` + (c.joined ? '  (joined)' : '') + (about ? `\n    ${about}` : ''));
        }
        if (!channels.length) say('No public channels.');
      });
    case 'create':
      r = await cl.call('channel_create', { name: a.name, members: a.members, public: a.public, description: a.description });
      break;
    case 'join': r = await cl.call('channel_join', { chat: a.channel }); break;
    case 'visibility': r = await cl.call('channel_visibility', { chat: a.channel, visibility: a.visibility }); break;
    case 'add': case 'remove': r = await cl.call(`channel_${a.action}`, { chat: a.channel, users: a.users }); break;
    case 'rename': r = await cl.call('channel_rename', { chat: a.channel, name: a.name }); break;
    case 'describe': r = await cl.call('channel_describe', { chat: a.channel, description: a.description }); break;
    case 'managers':
      r = await cl.call('channel_managers', { chat: a.channel, add: a.add, remove: a.remove });
      return emit(a, [r.chat], () => say(`Managers of ${r.chat.title}: ${(r.chat.managers || []).join(', ') || 'none'}`));
    case 'archive': case 'unarchive': r = await cl.call(`channel_${a.action}`, { chat: a.channel }); break;
    default:
      r = await cl.call('channel_leave', { chat: a.channel });
      return emit(a, [r.chat], () => say(`You left ${a.channel}.`));
  }
  emit(a, [r.chat], (chats) => say(chatLine(chats[0])));
}

async function cmdNotifications(a, cl) {
  const r = await cl.call('notifications', { all: a.all, limit: a.limit });
  if (a.json) return emit(a, r.chats, null);
  if (!r.chats.length) return say('Nothing new.');
  for (const c of r.chats) say(chatLine(c));
  const mentions = { 0: '', 1: ', 1 chat mentions you' }[r.mentions] ?? `, ${r.mentions} chats mention you`;
  say(`${r.unread} unread${mentions}.`);
}

async function cmdWait(a, cl) {
  if (a.where) notHere('--where');
  const r = await cl.wait({ timeout: a.timeout ?? null, peek: a.peek, chat: a.chat, mentions: a.mentions, any: a.any, from: a.from_ });
  if (!r.messages.length) {
    if (!a.json) say('No new messages before the timeout.');
    return 4;
  }
  if (a.json) return emit(a, r.messages, null);
  printMessages(r);
}

async function cmdSettings(a, cl) {
  let r;
  if (a.action === 'notify') r = await cl.call('settings_notify', { chat: a.chat, level: a.level });
  else if (a.action === 'status') r = await cl.call('settings_status', { text: a.text });
  else if (a.action === 'token') {
    r = await cl.call('settings_token');
    const saved = cl.token === readSavedToken();
    if (saved) saveLogin(cl.server, r.token);
    return emit(a, [r], () => say('Your old token no longer works. '
      + (saved ? 'The new one is saved in your login.' : `Your new token: ${r.token}`)));
  } else r = await cl.call('settings_show');
  emit(a, [r], () => say(`${r.user.id}  ${r.user.name}  status: ${r.user.status || '-'}\n`
    + (Object.keys(r.notify || {}).length ? 'notify: ' + Object.entries(r.notify).map(([k, v]) => `${k}=${v}`).join(', ')
      : 'notify: all for every chat')));
}

async function cmdLogin(a) {
  const check = new Client(a.server_url, a.token_value);
  await cmdWhoami(a, a.json ? check : shown(check)); // saved only once the server answers to this token
  saveLogin(a.server_url, a.token_value);
}

async function cmdView(a) {
  const cl = new Client(a.server, a.token);
  say(`Open ${cl.base || cl.server} in a browser and sign in to watch the swarm. View keys open it without signing in.`);
}

function adminClient(a, json) {
  if (a.data) throw new ClientError(400, `--data is not used here: give the swarm's admin token with --admin-token or $${ENV}_ADMIN_TOKEN.`);
  const token = a.admin_token || a.token || process.env[`${ENV}_ADMIN_TOKEN`];
  const client = new Client(a.server, token);
  return json ? client : shown(client);
}

async function cmdAdmin(a) {
  const admin = adminClient(a, a.json);
  if (a.action === 'add') {
    const fields = {};
    for (const f of a.field || []) {
      const i = f.indexOf('=');
      if (i < 0) throw new ClientError(400, `--field takes KEY=VALUE, not ${f}.`);
      fields[f.slice(0, i)] = f.slice(i + 1);
    }
    const r = await admin.call('user_add', { id: a.id, name: a.name, fields });
    return emit(a, [r], () => say(`Added ${r.user.id} (${r.user.name}). Token: ${r.token}`));
  }
  if (a.action === 'remove') {
    await admin.call('user_remove', { id: a.id });
    return emit(a, [{ removed: a.id }], () => say(`Removed ${a.id}.`));
  }
  if (a.action === 'rotate') {
    const r = await admin.call('token_rotate', { id: a.id });
    return emit(a, [r], () => say(`New token for ${a.id}: ${r.token}`));
  }
  if (a.action === 'role') {
    const r = await admin.call('role_change', { role: a.role, add: a.add, remove: a.remove, everyone: a.everyone });
    return emit(a, [r], () => say(`${r.role}: ` + (r.users === null || r.users === undefined ? 'everyone' : r.users.join(', ') || 'no one')));
  }
  let r;
  if (a.action === 'policy-set') r = await admin.call('policy_set', { rules: JSON.parse(fs.readFileSync(a.file, 'utf8')) });
  else r = await admin.call('policy_show');
  emit(a, [r], () => say(pyDumps(r.rules, { indent: 1, ascii: true })));
}

// Writes an upstream data folder (server.json, users, state, chats/<id>/log/*.jsonl, blobs) from the server's
// export pages, so upstream's own viewer opens it: `swarmchat view --data DIR`.
async function cmdExport(a) {
  const admin = adminClient(a, true);
  const dir = path.resolve(a.dir);
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (entries.length) throw new ClientError(400, `${a.dir} is not empty. Export into a new or empty folder.`);
  const mkdir = (p) => { fs.mkdirSync(p, { recursive: true, mode: 0o700 }); fs.chmodSync(p, 0o700); };
  const write = (p, data) => { fs.writeFileSync(p, data, { mode: 0o600 }); fs.chmodSync(p, 0o600); };
  const writeJson = (p, data) => write(p, JSON.stringify(data, null, 1));
  mkdir(dir);

  let page = await admin.call('export_page', { after: 0, limit: 500 }, 120);
  const first = page;
  const chats = new Map((first.chats || []).map((c) => [c.id, c]));
  const logs = new Map(); // chat -> {line, lines: [], seqs: Map(message seq -> line), deleted: Set}
  const blobs = new Map(); // sha256 -> size
  let total = 0;
  const logOf = (id) => {
    if (!logs.has(id)) logs.set(id, { line: 0, lines: [], seqs: new Map(), deleted: new Set() });
    return logs.get(id);
  };
  // The line of a message seq, or of the newest message before it when that one is unknown.
  const lineOf = (log, seq) => {
    seq = Number(seq);
    if (log.seqs.has(seq)) return log.seqs.get(seq);
    let best = 0;
    for (const [s, line] of log.seqs) if (s <= seq && line > best) best = line;
    return best;
  };
  const mapId = (chat, log, id) => {
    const m = /^([0-9a-f]{6,32}):(\d+)$/.exec(String(id || '').trim());
    return m && m[1] === chat && log.seqs.has(Number(m[2])) ? `${chat}:${log.seqs.get(Number(m[2]))}` : id;
  };
  const created = (c) => ({
    kind: 'created', from: c.created_by, at: c.created_at, members: c.members, name: c.name ?? null,
    ...(c.public ? { public: true } : {}), ...(c.description ? { description: c.description } : {}),
  });
  const push = (log, e) => { log.lines.push(JSON.stringify({ seq: ++log.line, ...e })); total++; };

  for (;;) {
    for (const e of page.events || []) {
      const chat = chats.get(e.chat);
      if (!chat) continue; // changes to users, not lines of a chat
      const log = logOf(e.chat);
      if (log.line === 0 && e.kind !== 'created') push(log, created(chat));
      const base = { kind: e.kind, from: e.from, at: e.at };
      switch (e.kind) {
        case 'created':
          push(log, { kind: 'created', from: e.from, at: e.at, members: e.members, name: e.name ?? null,
            ...(e.public ? { public: true } : {}), ...(e.description ? { description: e.description } : {}) });
          break;
        case 'message': {
          log.seqs.set(Number(e.seq), log.line + 1);
          const reply = e.reply_to ? { reply_to: mapId(e.chat, log, e.reply_to) } : {};
          if (e.deleted) { // a deleted message keeps no words or files, as upstream's redaction leaves it
            log.deleted.add(Number(e.seq));
            push(log, { kind: 'message', from: e.from, at: e.at, ...reply });
          } else {
            for (const f of e.attachments || []) if (f.sha256) blobs.set(f.sha256, f.size);
            push(log, { kind: 'message', from: e.from, text: e.text ?? '',
              ...(e.attachments?.length ? { attachments: e.attachments } : {}), ...reply,
              ...(e.mentions?.length ? { mentions: e.mentions } : {}), at: e.at });
          }
          break;
        }
        case 'edit':
          if (log.deleted.has(Number(e.target))) push(log, { ...base, target: lineOf(log, e.target), text: '' });
          else push(log, { ...base, target: lineOf(log, e.target), text: e.text ?? '', ...(e.mentions ? { mentions: e.mentions } : {}) });
          break;
        case 'delete': push(log, { ...base, target: lineOf(log, e.target) }); break;
        case 'react': push(log, { ...base, target: lineOf(log, e.target), emoji: e.emoji, remove: !!e.remove }); break;
        case 'read': {
          const upto = lineOf(log, e.upto);
          if (upto) push(log, { ...base, upto });
          break;
        }
        case 'added': case 'removed': push(log, { ...base, users: e.users || [] }); break;
        case 'renamed': push(log, { ...base, name: e.name }); break;
        case 'described': push(log, { ...base, description: e.description ?? '' }); break;
        case 'managers':
          push(log, { ...base, ...(e.added?.length ? { added: e.added } : {}), ...(e.removed?.length ? { removed: e.removed } : {}) });
          break;
        case 'visibility': push(log, { ...base, public: !!e.public }); break;
        default: {
          const { n, chat: _c, seq, ...rest } = e;
          push(log, rest);
        }
      }
    }
    if (page.next === null || page.next === undefined) break;
    page = await admin.call('export_page', { after: page.next, limit: 500 }, 120);
  }

  writeJson(path.join(dir, 'server.json'), { format: 1, created_at: first.swarm?.created_at || new Date().toISOString(), segment: SEGMENT });
  for (const sub of ['users', 'chats', 'state', 'retired', 'blobs']) mkdir(path.join(dir, sub));
  if (first.policy && Object.keys(first.policy).length) writeJson(path.join(dir, 'policy.json'), first.policy);
  const retired = new Set();
  for (const r of first.retired || []) {
    retired.add(r.id);
    writeJson(path.join(dir, 'retired', `${r.id}.json`), { id: r.id, deleted_at: r.deleted_at || new Date().toISOString() });
  }
  const users = (first.users || []).filter((u) => !retired.has(u.id));
  for (const u of users) {
    writeJson(path.join(dir, 'users', `${u.id}.json`), {
      id: u.id, name: u.name || u.id, fields: u.fields || {}, status: u.status || '', token_sha256: u.token_sha256 || '',
      created_at: u.created_at || first.swarm?.created_at || new Date().toISOString(),
    });
    const s = first.state?.[u.id] || {};
    const read = {};
    for (const [chat, seq] of Object.entries(s.read || {})) {
      const line = logs.has(chat) ? lineOf(logs.get(chat), seq) : 0;
      if (line) read[chat] = line;
    }
    writeJson(path.join(dir, 'state', `${u.id}.json`), { read, notify: s.notify || {} });
  }
  for (const c of chats.values()) {
    const folder = path.join(dir, 'chats', c.id);
    mkdir(path.join(folder, 'log'));
    const meta = { id: c.id, name: c.name ?? null, members: c.members || [], created_by: c.created_by, created_at: c.created_at };
    if (c.name) meta.managers = c.managers || [c.created_by];
    if (c.public !== undefined && c.public !== null) meta.public = !!c.public;
    if (c.description) meta.description = c.description;
    if (c.archived !== undefined && c.archived !== null) meta.archived = !!c.archived;
    writeJson(path.join(folder, 'meta.json'), meta);
    const log = logOf(c.id);
    if (log.line === 0) push(log, created(c));
    for (let i = 0; i < log.lines.length; i += SEGMENT) {
      const file = path.join(folder, 'log', `${String(i / SEGMENT + 1).padStart(6, '0')}.jsonl`);
      write(file, log.lines.slice(i, i + SEGMENT).join('\n') + '\n');
    }
  }
  for (const sha of blobs.keys()) {
    if (!/^[0-9a-f]{64}$/.test(sha)) continue;
    const response = await admin.exchange('export_file', {
      body: JSON.stringify({ sha256: sha }), retrySafe: true, timeout: 120,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
    });
    if (response.status !== 200) await admin.result(response, false);
    const folder = path.join(dir, 'blobs', sha.slice(0, 2));
    mkdir(folder);
    write(path.join(folder, sha), Buffer.from(await response.arrayBuffer()));
  }
  const summary = { dir, chats: chats.size, users: users.length, lines: total, files: blobs.size };
  emit(a, [summary], () => say(`Exported ${summary.chats} chat${summary.chats !== 1 ? 's' : ''}, ${summary.users} `
    + `user${summary.users !== 1 ? 's' : ''}, ${summary.lines} log line${summary.lines !== 1 ? 's' : ''} and ${summary.files} `
    + `file${summary.files !== 1 ? 's' : ''} to ${dir}. Open it with the upstream viewer: ${NAME} view --data ${dir}`));
}

// ---------------------------------------------------------------------- arguments

const opt = (flag, o = {}) => ({ flag, dest: o.dest || flag.replace(/^-+/, '').replaceAll('-', '_'), kind: 'value', ...o });
const pos = (name, o = {}) => ({ name, ...o });
const COMMON = [
  opt('--json', { kind: 'bool', help: 'print one JSON object per line' }),
  opt('--server', { help: `server URL (default: $${ENV}_SERVER, then the login config)` }),
  opt('--token', { help: `your token (default: $${ENV}_TOKEN, then the login config)` }),
];
const ADMIN_COMMON = [
  ...COMMON,
  opt('--admin-token', { help: `the swarm's admin token (default: $${ENV}_ADMIN_TOKEN, then your own token, for what the rules allow you)` }),
  opt('--data', { help: 'not used here: upstream servers only' }),
];
const leaf = (name, help, { opts = [], args = [], parents = COMMON, func } = {}) => ({ name, help, opts: [...parents, ...opts], args, func });

const COMMANDS = [
  leaf('whoami', 'show who you are', { func: cmdWhoami }),
  leaf('people', 'list everyone you can message', {
    func: cmdPeople, opts: [opt('--search', { help: "only people whose id, name, status or profile contains this" })] }),
  leaf('chats', 'list your chats, most recent first', {
    func: cmdChats,
    opts: [
      opt('--unread', { kind: 'bool', help: 'only chats with unread messages' }),
      opt('--with', { dest: 'with_', metavar: 'PEOPLE', help: 'only chats that include these people (comma-separated)' }),
      opt('--name', { help: 'only chats whose title contains this' }),
      opt('--sort', { choices: ['recent', 'unread', 'name'], default: 'recent' }),
      opt('--limit', { type: 'int', default: 20 }),
      opt('--where', { metavar: 'EXPR', help: 'not supported here: the upstream client has it' }),
    ] }),
  leaf('read', 'read messages, your unread ones by default, oldest first, and mark them read', {
    func: cmdRead,
    args: [pos('chat', { nargs: '?', help: 'a chat id, a chat name, or people\'s ids (comma-separated)' })],
    opts: [
      opt('--id', { metavar: 'MESSAGE', help: 'one message, by id' }),
      opt('--thread', { metavar: 'MESSAGE', help: 'the whole thread this message is in, indented. Marks nothing read' }),
      opt('--last', { type: 'int', metavar: 'N', help: 'the last N messages, read or not' }),
      opt('--all', { kind: 'bool', help: 'read history, not only unread messages' }),
      opt('--since', { metavar: 'WHEN', help: 'after a time (30m, 2h, 3d, 2026-10-02 15:00) or a message id' }),
      opt('--before', { metavar: 'WHEN', help: 'before a time or a message id' }),
      opt('--from', { dest: 'from_', metavar: 'PEOPLE', help: 'only from these people (comma-separated)' }),
      opt('--mentions', { kind: 'bool', help: 'only messages that mention you' }),
      opt('--search', { metavar: 'TEXT', help: 'only messages containing this text, any case' }),
      opt('--limit', { type: 'int', metavar: 'N', help: 'at most N messages (default 50 unread, 20 history)' }),
      opt('--peek', { kind: 'bool', help: 'do not mark anything read' }),
      opt('--where', { metavar: 'EXPR', help: 'not supported here: the upstream client has it' }),
      opt('--sort', { metavar: 'EXPR', help: 'not supported here: the upstream client has it' }),
    ] }),
  leaf('send', 'send a message to a channel, or to people (their direct chat is made on first use)', {
    func: cmdSend,
    args: [
      pos('chat', { help: 'a channel (#release-review, quoted in a shell), a person (maya), people (maya,priya) or a chat id' }),
      pos('text', { nargs: '?', default: '', help: 'the message, or - to read it from stdin (optional with --attach)' }),
    ],
    opts: [
      opt('--attach', { kind: 'append', metavar: 'PATH', help: 'a file to send with it (repeat for more)' }),
      opt('--reply-to', { metavar: 'MESSAGE' }),
    ] }),
  leaf('download', 'save an attachment (a folder is unpacked)', {
    func: cmdDownload,
    args: [pos('attachment', { help: 'the attachment id shown under its message' })],
    opts: [
      opt('--to', { default: '.', metavar: 'FOLDER', help: 'where to save it (default: here)' }),
      opt('--force', { kind: 'bool', help: 'replace a file or folder of the same name' }),
    ] }),
  leaf('edit', 'replace the text of a message you sent', { func: cmdEdit, args: [pos('message'), pos('text')] }),
  leaf('delete', 'delete a message you sent, or anyone\'s if you are an administrator', { func: cmdDelete, args: [pos('message')] }),
  leaf('react', 'add a reaction to a message', {
    func: cmdReact, args: [pos('message'), pos('emoji')],
    opts: [opt('--remove', { kind: 'bool', help: 'take your reaction back' })] }),
  leaf('info', 'members and details of a chat', { func: cmdInfo, args: [pos('chat')] }),
  {
    name: 'channel', func: cmdChannel, opts: COMMON,
    help: 'create, find and join channels, change their members, managers, name, description or visibility, and archive them',
    actions: [
      leaf('create', 'create a channel, private unless --public', {
        args: [pos('name')],
        opts: [
          opt('--members', { help: "people's ids to add, comma-separated" }),
          opt('--public', { kind: 'bool', help: 'anyone may find it (channel list) and join it' }),
          opt('--description', { metavar: 'TEXT', help: 'what the channel is for, up to 1,000 characters' }),
        ] }),
      leaf('list', 'public channels, which anyone may join', {
        opts: [opt('--search', { metavar: 'TEXT', help: 'only channels whose name contains this' }), opt('--limit', { type: 'int', default: 50 })] }),
      leaf('join', 'join a public channel', { args: [pos('channel')] }),
      leaf('visibility', 'make a channel public or private (members stay)', {
        args: [pos('channel'), pos('visibility', { choices: ['public', 'private'] })] }),
      leaf('add', 'add people', { args: [pos('channel'), pos('users', { nargs: '+' })] }),
      leaf('remove', 'remove people', { args: [pos('channel'), pos('users', { nargs: '+' })] }),
      leaf('rename', 'rename a channel', { args: [pos('channel'), pos('name')] }),
      leaf('describe', "change a channel's description", {
        args: [pos('channel'), pos('description', { help: 'the new description, or "" to remove it' })] }),
      leaf('managers', "show a channel's managers, or name and remove them", {
        args: [pos('channel')],
        opts: [
          opt('--add', { kind: 'nargs', metavar: 'USER', help: 'members to make managers' }),
          opt('--remove', { kind: 'nargs', metavar: 'USER', help: 'managers to make ordinary members' }),
        ] }),
      leaf('leave', 'leave a channel', { args: [pos('channel')] }),
      leaf('archive', 'archive a channel: kept to read, closed to changes', { args: [pos('channel')] }),
      leaf('unarchive', 'open an archived channel again', { args: [pos('channel')] }),
    ],
  },
  leaf('notifications', 'chats that need you, following your notification settings', {
    func: cmdNotifications,
    opts: [opt('--all', { kind: 'bool', help: 'every chat, even ones with nothing new' }), opt('--limit', { type: 'int', default: 20 })] }),
  leaf('wait', 'block until a new message arrives, print it and mark it read', {
    func: cmdWait,
    opts: [
      opt('--chat', { help: 'only this chat' }),
      opt('--from', { dest: 'from_', metavar: 'PEOPLE', help: 'only from these people' }),
      opt('--mentions', { kind: 'bool', help: 'only messages that mention you' }),
      opt('--any', { kind: 'bool', help: 'ignore your notification settings' }),
      opt('--timeout', { type: 'float', metavar: 'SECONDS', help: 'give up after this long (exit code 4)' }),
      opt('--peek', { kind: 'bool', help: 'do not mark what it prints as read' }),
      opt('--where', { metavar: 'EXPR', help: 'not supported here: the upstream client has it' }),
    ] }),
  {
    name: 'settings', func: cmdSettings, opts: COMMON, help: 'notification levels and your status',
    actions: [
      leaf('notify', 'all, mentions or none for a chat', { args: [pos('chat'), pos('level', { choices: ['all', 'mentions', 'none'] })] }),
      leaf('status', 'set your status line', { args: [pos('text')] }),
      leaf('token', 'give yourself a new token, when the old one may have leaked'),
      leaf('show', 'show your settings'),
    ],
  },
  leaf('login', 'save the server address and your token for later commands', {
    func: cmdLogin, args: [pos('server_url'), pos('token_value')] }),
  leaf('view', 'watch every chat in a browser', {
    func: cmdView,
    opts: [ // taken so upstream's scripts still run; this server's viewer opens in the browser, signed in
      opt('--view-token', { help: 'not used here' }), opt('--admin-token', { help: 'not used here' }),
      opt('--data', { help: 'not used here' }), opt('--no-open', { kind: 'bool', help: 'not used here' }),
    ] }),
  {
    name: 'admin', func: cmdAdmin, opts: ADMIN_COMMON,
    help: 'manage users, roles and rules (the admin token, or your own for what the rules allow you)',
    actions: [
      leaf('add', 'add a user and print their token', {
        parents: ADMIN_COMMON, args: [pos('id')],
        opts: [opt('--name', { default: '' }), opt('--field', { kind: 'append', metavar: 'KEY=VALUE', help: 'a profile field, e.g. role=release-manager' })] }),
      leaf('remove', 'remove a user', { parents: ADMIN_COMMON, args: [pos('id')] }),
      leaf('rotate', 'give a user a new token', { parents: ADMIN_COMMON, args: [pos('id')] }),
      leaf('role', 'show who holds a role, or change it', {
        parents: ADMIN_COMMON, args: [pos('role', { choices: ['admin', 'channel_creator'] })],
        opts: [
          opt('--add', { kind: 'nargs', metavar: 'USER' }), opt('--remove', { kind: 'nargs', metavar: 'USER' }),
          opt('--everyone', { kind: 'bool', help: 'channel_creator only: every user may create channels' }),
        ] }),
      leaf('policy-set', 'replace the rules with a JSON file', { parents: ADMIN_COMMON, args: [pos('file')] }),
      leaf('policy-show', 'show the rules', { parents: ADMIN_COMMON }),
    ],
  },
  leaf('export', 'save the whole swarm as a data folder the upstream viewer opens (the admin token)', {
    func: cmdExport, parents: ADMIN_COMMON, args: [pos('dir', { help: 'a new or empty folder' })] }),
];
const MAIN = {
  name: NAME, opts: [...COMMON, opt('--version', { kind: 'version' })], actions: COMMANDS,
  description: 'Chats: direct chats with people, and named channels. List, read, send, wait.',
};

class Usage extends Error {
  constructor(prog, spec, message) { super(message); this.prog = prog; this.spec = spec; }
}

const isOption = (t, opts) => {
  if (!t.startsWith('-') || t === '-') return false;
  if (/^-\d+$|^-\d*\.\d+$/.test(t)) return false; // a negative number
  if (t.includes(' ') && !opts.some((o) => o.flag === t.split('=')[0])) return false;
  return true;
};

function findOpt(spec, prog, flag) {
  const exact = spec.opts.find((o) => o.flag === flag);
  if (exact) return exact;
  if (!flag.startsWith('--')) return null;
  const hits = spec.opts.filter((o) => o.flag.startsWith(flag));
  if (hits.length > 1) throw new Usage(prog, spec, `ambiguous option: ${flag} could match ${hits.map((o) => o.flag).join(', ')}`);
  return hits[0] || null;
}

function convert(spec, prog, o, v, label) {
  if (o.type === 'int') {
    if (!/^\s*[-+]?\d+\s*$/.test(v)) throw new Usage(prog, spec, `argument ${label}: invalid int value: '${v}'`);
    v = parseInt(v, 10);
  } else if (o.type === 'float') {
    if (!/^\s*[-+]?(\d+\.?\d*(e[-+]?\d+)?|\.\d+(e[-+]?\d+)?|inf(inity)?|nan)\s*$/i.test(v)) throw new Usage(prog, spec, `argument ${label}: invalid float value: '${v}'`);
    const t = v.trim().toLowerCase().replace(/^\+/, '');
    v = /inf/.test(t) ? (t.startsWith('-') ? -Infinity : Infinity) : t.includes('nan') ? NaN : Number(t);
  }
  if (o.choices && !o.choices.includes(v)) {
    throw new Usage(prog, spec, `argument ${label}: invalid choice: '${v}' (choose from ${o.choices.map((c) => `'${c}'`).join(', ')})`);
  }
  return v;
}

// Options and words in any order, as upstream's parser takes them; a command with actions hands what follows
// its action to that action's parser.
function parse(spec, tokens, ns, prog) {
  for (const o of spec.opts) if (o.default !== undefined && !(o.dest in ns)) ns[o.dest] = o.default;
  const words = [];
  let onlyWords = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!onlyWords && t === '--') { onlyWords = true; continue; }
    if (!onlyWords && (t === '-h' || t === '--help')) { process.stdout.write(help(spec, prog)); throw new Exit(0); }
    if (!onlyWords && isOption(t, spec.opts)) {
      const eq = t.startsWith('--') ? t.indexOf('=') : -1;
      const flag = eq > 0 ? t.slice(0, eq) : t;
      const inline = eq > 0 ? t.slice(eq + 1) : undefined;
      const o = findOpt(spec, prog, flag);
      if (!o) throw new Usage(prog, spec, `unrecognized arguments: ${t}`);
      if (o.kind === 'version') { process.stdout.write(`${NAME} ${VERSION}\n`); throw new Exit(0); }
      if (o.kind === 'bool') {
        if (inline !== undefined) throw new Usage(prog, spec, `argument ${o.flag}: ignored explicit argument '${inline}'`);
        ns[o.dest] = true;
      } else if (o.kind === 'nargs') {
        const vals = inline !== undefined ? [inline] : [];
        while (inline === undefined && i + 1 < tokens.length && !isOption(tokens[i + 1], spec.opts) && tokens[i + 1] !== '--') vals.push(tokens[++i]);
        if (!vals.length) throw new Usage(prog, spec, `argument ${o.flag}: expected at least one argument`);
        ns[o.dest] = vals.map((v) => convert(spec, prog, o, v, o.flag));
      } else {
        let v = inline;
        if (v === undefined) {
          if (i + 1 >= tokens.length || isOption(tokens[i + 1], spec.opts)) throw new Usage(prog, spec, `argument ${o.flag}: expected one argument`);
          v = tokens[++i];
        }
        v = convert(spec, prog, o, v, o.flag);
        if (o.kind === 'append') (ns[o.dest] ||= []).push(v);
        else ns[o.dest] = v;
      }
      continue;
    }
    if (spec.actions) { // the action, then everything after it belongs to the action's parser
      const action = spec.actions.find((s) => s.name === t);
      if (!action) {
        throw new Usage(prog, spec, `argument ${spec === MAIN ? 'command' : 'action'}: invalid choice: '${t}' (choose from ${spec.actions.map((s) => `'${s.name}'`).join(', ')})`);
      }
      if (spec === MAIN) { ns.command = t; ns.func = action.func; } else ns.action = t;
      return parse(action, tokens.slice(i + 1), ns, `${prog} ${t}`);
    }
    words.push(t);
  }
  if (spec.actions) {
    if (spec !== MAIN) throw new Usage(prog, spec, 'the following arguments are required: action');
    return ns;
  }
  const args = spec.args || [];
  const required = (k) => args.slice(k + 1).filter((p) => p.nargs !== '?').length;
  let w = 0;
  const missing = [];
  args.forEach((p, k) => {
    const room = words.length - w - required(k);
    if (p.nargs === '?') {
      if (room > 0) ns[p.name] = convert(spec, prog, p, words[w++], p.name);
      else if (!(p.name in ns)) ns[p.name] = p.default ?? null;
    } else if (p.nargs === '+') {
      if (room < 1) missing.push(p.name);
      else { ns[p.name] = words.slice(w, w + room).map((v) => convert(spec, prog, p, v, p.name)); w += room; }
    } else if (w < words.length) ns[p.name] = convert(spec, prog, p, words[w++], p.name);
    else missing.push(p.name);
  });
  if (missing.length) throw new Usage(prog, spec, `the following arguments are required: ${missing.join(', ')}`);
  if (w < words.length) throw new Usage(prog, spec, `unrecognized arguments: ${words.slice(w).join(' ')}`);
  return ns;
}

class Exit extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}

function usage(spec, prog) {
  const flags = spec.opts.map((o) => (o.kind === 'bool' || o.kind === 'version' ? `[${o.flag}]`
    : `[${o.flag} ${o.metavar || o.dest.replace(/_$/, '').toUpperCase()}${o.kind === 'nargs' ? ' ...' : ''}]`));
  const words = spec.actions ? [spec === MAIN ? 'command ...' : 'action ...']
    : (spec.args || []).map((p) => (p.nargs === '?' ? `[${p.name}]` : p.nargs === '+' ? `${p.name} [${p.name} ...]` : p.name));
  return `usage: ${prog} [-h] ${[...flags, ...words].join(' ')}\n`;
}

function help(spec, prog) {
  let out = usage(spec, prog);
  const about = spec.description || spec.help;
  if (about) out += `\n${about}\n`;
  if (spec.actions) {
    out += `\n${spec === MAIN ? 'commands' : 'actions'}:\n`;
    for (const s of spec.actions) out += `  ${s.name.padEnd(16)}${s.help || ''}\n`;
  }
  if (spec.args?.length) {
    out += '\npositional arguments:\n';
    for (const p of spec.args) out += `  ${p.name.padEnd(16)}${p.help || (p.choices ? `one of ${p.choices.join(', ')}` : '')}\n`;
  }
  out += '\noptions:\n  -h, --help      show this help message and exit\n';
  for (const o of spec.opts) {
    const left = o.kind === 'bool' || o.kind === 'version' ? o.flag : `${o.flag} ${o.metavar || o.dest.replace(/_$/, '').toUpperCase()}`;
    const text = o.kind === 'version' ? "show the program's version number and exit"
      : (o.help || (o.choices ? `one of ${o.choices.join(', ')}` : ''));
    out += `  ${left.padEnd(22)} ${text}\n`;
  }
  return out;
}

// ---------------------------------------------------------------------- main

async function main(argv) {
  let a;
  try {
    a = parse(MAIN, argv, {}, NAME);
  } catch (e) {
    if (e instanceof Exit) return e.code;
    if (e instanceof Usage) {
      process.stderr.write(usage(e.spec, e.prog) + `${e.prog}: error: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  for (const key of ['json', 'server', 'token', 'admin_token', 'data']) if (!(key in a)) a[key] = key === 'json' ? false : null;
  if (!a.func) {
    process.stdout.write(help(MAIN, NAME));
    return 1;
  }
  let client = null;
  try {
    if (!['admin', 'login', 'view', 'export'].includes(a.command)) client = new Client(a.server, a.token);
    const code = await a.func(a, client === null || a.json ? client : shown(client));
    if (client) await client.close(); // confirms what a wait received, so it counts as read
    return code || 0;
  } catch (e) {
    if (e instanceof ClientError) {
      say(`error: ${e.message}`, { err: true, lines: false });
      return EXIT[e.status] ?? 1;
    }
    if (e?.code === 'ENOENT' || e?.code === 'EISDIR' || e instanceof SyntaxError) {
      say(`error: ${e.message}`, { err: true, lines: false });
      return 1;
    }
    throw e;
  }
}

function cleanup() {
  for (const p of [...temps]) removeAll(p);
}

const finish = (code) => {
  cleanup();
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => finish(130));

main(process.argv.slice(2)).then(finish, (e) => {
  process.stderr.write(`error: ${e?.stack || e}\n`);
  finish(1);
});
