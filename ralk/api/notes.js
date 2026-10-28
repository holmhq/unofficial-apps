// A note is one notification: a kind, a title, a sound, and perhaps a spoken line. Creating
// one broadcasts it at once to every device the person has open; a spoken line is queued at
// fal.ai and followed by the browser (speech: queued → working → fetching → ready).
//
// Named operations (Claude's tools) run without env.holm.secrets, so a line they queue is
// submitted to fal.ai by the first device that polls it (through the web route, which has
// the key). The browser plays the finished file straight from fal.ai, then asks for a copy
// to be kept, so replays and repeats of the same line come from storage and cost nothing.
import { reject, text, longText, randomId, sha256, day } from './lib/util.js';
import { KIND_IDS, SOUND_IDS, VOICE_IDS } from './catalog.js';
import { person, channel, prefsDTO, charge, listening, usageDTO } from './people.js';
import * as fal from './fal.js';

export const LIMITS = { title: 80, body: 300, say: 600, project: 40, linesPerDay: 300, charsPerMonth: 200000, keep: 500 };
// Goja has no toLocaleString; group thousands by hand.
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const SPEECH = new Set(['none', 'queued', 'working', 'fetching', 'ready', 'failed']);
const SUBMIT_WINDOW = 90000;

export function noteDTO(n) {
  let audio = null;
  if (n.audio) audio = { src: `/api/notes/${n.nid}/audio`, stored: true };
  else if (n.job && n.job.url) audio = { src: n.job.url, stored: false };
  return {
    id: n.nid, kind: n.kind, title: n.title, body: n.body || '', sound: n.sound, say: n.say || '',
    speech: SPEECH.has(n.speech) ? n.speech : 'none', audio, project: n.project || '', from: n.from, at: n.at,
    heard: Array.isArray(n.heard) ? n.heard : [], chars: n.chars || 0, usd: (n.mills || 0) / 1000,
    cached: !!n.cached, error: n.error || null,
  };
}

function find(env, ctx, nid) {
  if (!/^[a-z0-9]{12}$/.test(String(nid || ''))) reject(404, 'not_found', 'No such notification.');
  const note = env.holm.app.ds.findOne('notes', { nid, member: ctx.member.id });
  if (!note) reject(404, 'not_found', 'No such notification.');
  return note;
}

const ext = (mime) => (mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/ogg' ? 'ogg' : mime === 'audio/mp4' ? 'm4a' : 'wav');

// Write a speech change and tell the person's devices (samples are private to one device).
function announce(env, doc, note, set) {
  const where = { nid: note.nid, member: note.member };
  env.holm.app.ds.update('notes', where, { $set: set });
  const after = env.holm.app.ds.findOne('notes', where) || { ...note, ...set };
  if (note.from !== 'sample') env.holm.realtime.broadcast(channel(doc), { type: 'speech', id: note.nid, speech: after.speech, error: after.error || null, audio: noteDTO(after).audio });
  return after;
}

// Make a note and send it. `from` is who asked: 'claude' (a tool), 'app' (the web app).
export async function createNote(env, ctx, input, from) {
  const doc = person(env, ctx);
  const prefs = prefsDTO(doc);
  const ds = env.holm.app.ds;
  // A voice sample from the app: made like any line, but never shown or broadcast.
  const sample = from === 'app' && input.sample === true;
  if (sample) from = 'sample';
  const voice = sample && VOICE_IDS.has(input.voice) ? input.voice : prefs.voice;
  const kind = input.kind === undefined || input.kind === null ? 'info' : String(input.kind);
  if (kind !== 'say' && !KIND_IDS.includes(kind)) reject(400, 'invalid_input', `kind must be one of ${KIND_IDS.join(', ')}.`);
  const say = longText(input.say, LIMITS.say, 'say', kind === 'say');
  let title = text(input.title, LIMITS.title, 'title', kind !== 'say');
  if (!title) title = say.length > LIMITS.title ? say.slice(0, LIMITS.title - 1).replace(/\s+\S*$/, '') + '…' : say;
  const body = longText(input.body, LIMITS.body, 'body') || '';
  const project = text(input.project, LIMITS.project, 'project') || '';
  let sound = input.sound === undefined || input.sound === null || input.sound === 'default' ? (kind === 'say' ? 'none' : prefs.sounds[kind]) : String(input.sound);
  if (sound !== 'none' && !SOUND_IDS.has(sound)) reject(400, 'invalid_input', `Unknown sound "${sound}". Call sounds_list for the ids, or pass "none" or "default".`);

  const chars = say ? say.length : 0;
  let speech = 'none';
  let cached = false;
  let audio = null;
  let mime = null;
  let hash = null;
  let error = null;
  let submit = false;
  if (say) {
    const kv = env.holm.app.kv;
    const factor = ctx.admin ? 10 : 1;
    const today = `lines:${doc.id}:${day()}`;
    const lines = Number(kv.get(today)) || 0;
    if (lines >= LIMITS.linesPerDay * factor) reject(429, 'limit', `That is ${LIMITS.linesPerDay * factor} spoken lines today; more tomorrow.`);
    const usage = usageDTO(doc);
    if (usage.chars + chars > LIMITS.charsPerMonth * factor) reject(429, 'limit', `This month's voice allowance (${thousands(LIMITS.charsPerMonth * factor)} characters) is used up.`);
    hash = await sha256(voice + '\n' + say);
    const hit = kv.get('tts:' + hash);
    if (hit && hit.key) { speech = 'ready'; cached = true; audio = hit.key; mime = hit.mime || 'audio/wav'; }
    else if (fal.hasSecrets(env) && !fal.configured(env)) { speech = 'failed'; error = 'Voice is not set up on this node: the owner sets the FAL_KEY secret for this app.'; }
    else { speech = 'queued'; submit = fal.hasSecrets(env); }
    kv.set(today, lines + 1, 2 * 24 * 3600 * 1000);
  }
  const note = {
    nid: randomId(12), member: ctx.member.id, kind, title, body, sound, say: say || '', speech, project, from,
    at: Date.now(), heard: [], chars, mills: 0, cached, audio, mime, hash, voice: say ? voice : null, job: null, error,
  };
  ds.insert('notes', note);
  trim(env, ctx);
  // Say it is here first: the sound should play before fal.ai has even been asked.
  if (!sample) env.holm.realtime.broadcast(channel(doc), { type: 'note', note: noteDTO(note) });
  if (submit) Object.assign(note, await submitLine(env, doc, note));
  return { note: noteDTO(note), listening: listening(env, doc) };
}

// Put the line in fal.ai's queue and charge for it; on failure the note says why.
async function submitLine(env, doc, note) {
  try {
    const job = await fal.submit(env, note.say, note.voice);
    const mills = fal.price(note.chars);
    env.holm.app.ds.update('notes', { nid: note.nid, member: note.member }, { $set: { job, mills } });
    charge(env, doc, note.chars, mills);
    return { job, mills };
  } catch (e) {
    const error = fal.speechError(e);
    announce(env, doc, note, { speech: 'failed', error });
    return { speech: 'failed', error };
  }
}

// Keep the newest LIMITS.keep notes per person.
function trim(env, ctx) {
  const ds = env.holm.app.ds;
  const n = ds.count('notes', { member: ctx.member.id });
  if (n <= LIMITS.keep + 50) return;
  const old = ds.find('notes', { member: ctx.member.id }, { limit: Math.min(100, n - LIMITS.keep), order: 'asc' });
  for (const row of old) ds.delete('notes', { id: row.id });
}

export function listNotes(env, ctx, limit = 60) {
  person(env, ctx);
  return env.holm.app.ds.find('notes', { member: ctx.member.id, from: { $ne: 'sample' } }, { limit, order: 'desc' }).map(noteDTO);
}

export function getNote(env, ctx, nid) { return noteDTO(find(env, ctx, nid)); }

export function markHeard(env, ctx, nid, device) {
  const doc = person(env, ctx);
  const note = find(env, ctx, nid);
  const label = text(device, 40, 'device') || 'a device';
  const heard = (Array.isArray(note.heard) ? note.heard : []).filter((h) => h.device !== label).concat([{ device: label, at: Date.now() }]).slice(-20);
  env.holm.app.ds.update('notes', { id: note.id }, { $set: { heard } });
  env.holm.realtime.broadcast(channel(doc), { type: 'heard', id: nid, heard });
  return { heard };
}

export function clearNotes(env, ctx) {
  const doc = person(env, ctx);
  const ds = env.holm.app.ds;
  let deleted = 0;
  for (let batch = 0; batch < 5; batch++) {
    const rows = ds.find('notes', { member: ctx.member.id }, { limit: 100, order: 'asc' });
    if (!rows.length) break;
    for (const row of rows) { ds.delete('notes', { id: row.id }); deleted++; }
  }
  const more = ds.count('notes', { member: ctx.member.id });
  env.holm.realtime.broadcast(channel(doc), { type: 'cleared' });
  return { deleted, more };
}

export function playSound(env, ctx, sound) {
  const doc = person(env, ctx);
  const id = String(sound || '');
  if (!SOUND_IDS.has(id)) reject(400, 'invalid_input', `Unknown sound "${id}". Call sounds_list for the ids.`);
  env.holm.realtime.broadcast(channel(doc), { type: 'play', sound: id });
  return { sound: id, listening: listening(env, doc) };
}

// Ask fal.ai how a line is doing: one outbound call per request (two when it just finished:
// its status, then where the file is). A line a tool queued is submitted here first. Other
// devices polling at the same moment get the stored state instead of another call.
export async function pollSpeech(env, ctx, nid) {
  const doc = person(env, ctx);
  const note = find(env, ctx, nid);
  const ds = env.holm.app.ds;
  const kv = env.holm.app.kv;
  const where = { nid, member: ctx.member.id };
  if (!['queued', 'working'].includes(note.speech)) return noteDTO(note);
  const lock = 'poll:' + nid;
  if (kv.get(lock)) return noteDTO(note);
  kv.set(lock, 1, 2500);
  try {
    if (!note.job) {
      if (Date.now() - note.at > SUBMIT_WINDOW) return noteDTO(announce(env, doc, note, { speech: 'failed', error: 'Not spoken: no device was listening when it was sent.' }));
      if (!fal.configured(env)) return noteDTO(announce(env, doc, note, { speech: 'failed', error: 'Voice is not set up on this node: the owner sets the FAL_KEY secret for this app.' }));
      Object.assign(note, await submitLine(env, doc, note));
      return noteDTO(ds.findOne('notes', where) || note);
    }
    const state = await fal.status(env, note.job);
    if (state === 'queued' || state === 'working') {
      if (state !== note.speech) announce(env, doc, note, { speech: state });
    } else if (state === 'done') {
      const file = await fal.result(env, note.job);
      announce(env, doc, note, { speech: 'fetching', job: { ...note.job, url: file.url, mime: file.mime, size: file.size } });
    } else throw Object.assign(new Error('fal.ai could not make this line.'), { speech: true });
  } catch (e) {
    announce(env, doc, note, { speech: 'failed', error: fal.speechError(e) });
  } finally { kv.delete(lock); }
  return noteDTO(ds.findOne('notes', where));
}

// Copy the finished file into storage, keyed by the text and voice, so the same line never
// costs twice and replays need no fal.ai. A slow copy fails quietly: the line still plays
// from fal.ai, and the next request can try again.
export async function keepAudio(env, ctx, nid) {
  const doc = person(env, ctx);
  const note = find(env, ctx, nid);
  const { s3, kv } = env.holm.app;
  if (note.audio) return noteDTO(note);
  if (!note.job || !note.job.url) reject(409, 'not_ready', 'The voice is not ready yet.');
  let file;
  try { file = await fal.download(env, note.job.url, note.job.mime); } catch (e) {
    console.warn('voice copy failed', nid, String(e && e.message || e).slice(0, 200));
    reject(502, 'copy_failed', 'The voice could not be copied into storage yet.');
  }
  const key = `audio/${note.hash || randomId(16)}.${ext(file.mime)}`;
  s3.put(key, file.file, file.mime);
  if (note.hash) kv.set('tts:' + note.hash, { key, mime: file.mime }, 90 * 24 * 3600 * 1000);
  return noteDTO(announce(env, doc, note, { speech: 'ready', audio: key, mime: file.mime, error: null }));
}

// The line's audio: from storage once kept, else a redirect to fal.ai's copy.
export function audio(env, ctx, nid) {
  const note = find(env, ctx, nid);
  if (note.audio) {
    const stored = env.holm.app.s3.get(note.audio);
    if (stored) return new Response(stored.data, { headers: { 'Content-Type': stored.mime || note.mime || 'audio/wav', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (note.job && note.job.url && fal.audioURL(note.job.url)) return new Response(null, { status: 302, headers: { Location: note.job.url, 'Cache-Control': 'private, no-store' } });
  reject(409, 'not_ready', 'The voice is not ready yet.');
}
