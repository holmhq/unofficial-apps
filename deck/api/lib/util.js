// Small helpers shared by every module: errors, responses, text checks and ids.

export function reject(status, code, message, details) {
  throw Object.assign(new Error(message), { status, code, public: true, details });
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function errorResponse(error) {
  if (!error.public) console.error('request failed', String(error.code || 'internal_error'), String(error.stack || error.message || error).slice(0, 800));
  const status = error.public ? error.status : 500;
  const body = { error: { code: error.public ? error.code : 'internal_error', message: error.public ? error.message : 'Something went wrong. Try again.' } };
  if (error.public && error.details) body.error.details = error.details;
  return json(body, status);
}

export async function readJSON(request, max = 400000) {
  let raw;
  try { raw = await request.text(); } catch { reject(400, 'invalid_json', 'Send valid JSON.'); }
  if (raw.length > max) reject(413, 'too_large', 'That request is too large.');
  let value;
  try { value = raw.trim() ? JSON.parse(raw) : {}; } catch { reject(400, 'invalid_json', 'Send valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'invalid_json', 'Send a JSON object.');
  return value;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

// Trimmed single-line text, or undefined when optional and empty.
export function text(value, max, label, required = false) {
  if (value === undefined || value === null) {
    if (required) reject(400, 'invalid_input', `${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') reject(400, 'invalid_input', `${label} must be text.`);
  const out = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (required && !out) reject(400, 'invalid_input', `${label} is required.`);
  if (out.length > max) reject(400, 'invalid_input', `${label} can be ${max} characters at most.`);
  return out;
}

// Multi-line text keeps its line breaks.
export function longText(value, max, label, required = false) {
  if (value === undefined || value === null) {
    if (required) reject(400, 'invalid_input', `${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') reject(400, 'invalid_input', `${label} must be text.`);
  const out = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
  if (required && !out) reject(400, 'invalid_input', `${label} is required.`);
  if (out.length > max) reject(400, 'invalid_input', `${label} can be ${max} characters at most.`);
  return out;
}

export function bool(value) { return value === true || value === 'true' || value === 1; }

export function int(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';
export function randomId(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}



export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
