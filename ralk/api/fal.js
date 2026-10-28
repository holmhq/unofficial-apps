// fal.ai's queue for Inworld TTS: submit a line, read its status, read its result, copy the
// audio. Every call is one outbound request, so a handler does at most one of them per
// request and stays inside the request budget; the browser drives the rest by polling.
import { reject } from './lib/util.js';

export const MODEL = 'fal-ai/inworld-tts';
export const SAMPLE_RATE = 24000;
export const MAX_AUDIO = 4 * 1024 * 1024;
// $0.01 per 1,000 characters, kept as integer thousandths of a dollar.
export const MILLS_PER_1000 = 10;
export const price = (chars) => Math.ceil(chars * MILLS_PER_1000 / 1000);

function failed(message) { throw Object.assign(new Error(message), { speech: true }); }
export const speechError = (error) => (error && (error.speech || error.public) ? error.message : 'The voice could not be made.');

// Named operations run without env.holm.secrets; the web routes have it.
export function hasSecrets(env) {
  return !!(env.holm.secrets && typeof env.holm.secrets.get === 'function');
}
export function configured(env) {
  if (!hasSecrets(env)) return false;
  try { const key = env.holm.secrets.get('FAL_KEY'); return typeof key === 'string' && key.length > 0; } catch { return false; }
}
function keyOf(env) {
  let key;
  try { key = env.holm.secrets.get('FAL_KEY'); } catch { key = undefined; }
  if (typeof key !== 'string' || !key) reject(503, 'unavailable', 'Voice is not set up on this node: the owner sets the FAL_KEY secret for this app.');
  return key;
}

export function queueURL(value) {
  try {
    const url = new URL(value);
    return typeof value === 'string' && url.protocol === 'https:' && url.hostname === 'queue.fal.run' && !url.port && !url.username && !url.password;
  } catch { return false; }
}
export function audioURL(value) {
  try {
    const url = new URL(value);
    return typeof value === 'string' && url.protocol === 'https:' && (url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media')) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

async function call(env, url, key, body) {
  let response;
  try {
    response = await env.holm.net.fetch(url, {
      headers: { Authorization: 'Key ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    console.warn('fal unreachable', String(error && error.message || error).slice(0, 200));
    failed('fal.ai could not be reached.');
  }
  if (!response || !response.ok) failed(`fal.ai answered ${response ? response.status : 'nothing'}.`);
  let value;
  try { value = await response.json(); } catch { failed('fal.ai returned invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) failed('fal.ai returned an invalid response.');
  if (value.error || value.detail) failed('fal.ai refused this line.');
  return value;
}

// Put a line in the queue. Returns what later requests need to follow it.
export async function submit(env, text, voice) {
  const key = keyOf(env);
  const out = await call(env, 'https://queue.fal.run/' + MODEL, key, { text, voice, sample_rate_hertz: SAMPLE_RATE });
  if (!queueURL(out.status_url) || !queueURL(out.response_url)) failed('fal.ai returned a refused queue URL.');
  if (typeof out.request_id !== 'string' || !out.request_id) failed('fal.ai did not return a request id.');
  return { request: out.request_id, status_url: out.status_url, response_url: out.response_url };
}

// 'queued' | 'working' | 'done' | 'failed'
export async function status(env, job) {
  if (!queueURL(job.status_url)) failed('The line has a refused queue URL.');
  const out = await call(env, job.status_url, keyOf(env));
  if (out.status === 'IN_QUEUE') return 'queued';
  if (out.status === 'IN_PROGRESS') return 'working';
  if (out.status === 'COMPLETED') return 'done';
  return 'failed';
}

// The finished line's audio file: { url, mime, size }.
export async function result(env, job) {
  if (!queueURL(job.response_url)) failed('The line has a refused queue URL.');
  const out = await call(env, job.response_url, keyOf(env));
  const audio = out.audio;
  if (!audio || !audioURL(audio.url)) failed('fal.ai returned a refused audio host.');
  const size = Number(audio.file_size) || 0;
  if (size > MAX_AUDIO) failed('The voice file is too large.');
  const mime = String(audio.content_type || 'audio/wav').split(';')[0].trim().toLowerCase();
  return { url: audio.url, mime: mime.startsWith('audio/') ? mime : 'audio/wav', size };
}

// Copy the audio file: { file, mime, size }. Holm stages the bytes outside JavaScript; the
// handle goes straight to s3.put, so the file never counts against the allocation budget.
export async function download(env, url, mime) {
  if (!audioURL(url)) failed('Refused audio host.');
  let response;
  try { response = await env.holm.net.fetch(url, { responseType: 'file', filename: 'voice.wav' }); } catch (error) {
    console.warn('voice copy', String(error && error.message || error).slice(0, 160));
    failed('The voice file could not be copied.');
  }
  if (!response || !response.ok || !response.file) failed('The voice file could not be copied.');
  const size = Number(response.file.size) || 0;
  if (size <= 0) failed('The voice file was empty.');
  if (size > MAX_AUDIO) failed('The voice file is too large.');
  const type = String(response.file.type || mime || 'audio/wav').split(';')[0].trim().toLowerCase();
  return { file: response.file, mime: type.startsWith('audio/') ? type : (mime || 'audio/wav'), size };
}
