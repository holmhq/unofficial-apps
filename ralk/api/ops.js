// Named operations (contract.json): the tools Claude uses through Holm's MCP endpoint at
// /_holm/mcp. They are open to anyone signed in (auth "user"); every one acts only on the
// caller's own notifications, so a stranger's Claude sees nothing of yours.
import { reject, int } from './lib/util.js';
import { context, person, prefsDTO, usageDTO, listening, updatePrefs } from './people.js';
import { catalog, KINDS, VOICES, DEFAULT_VOICE } from './catalog.js';
import { createNote, listNotes, clearNotes, playSound, LIMITS } from './notes.js';

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT', 422: 'APP_INVALID', 429: 'APP_RATE_LIMITED', 502: 'APP_UNAVAILABLE', 503: 'APP_UNAVAILABLE' };
// The contract declares no error details, so what they carry is already in the message.
const fail = (error) => { if (error && error.public) { error.code = CODES[error.status] || 'APP_INVALID_INPUT'; delete error.details; } throw error; };
async function op(env, run) {
  try { return await run(context(env)); } catch (error) { return fail(error); }
}

const origin = (env) => env.holm.app.kv.get('site:origin') || '';

export function opGuide(input, env) {
  return { guide: env.holm.private.read('guide.md') };
}

export function opMe(input, env) {
  return op(env, (ctx) => {
    const doc = person(env, ctx);
    const devices = listening(env, doc);
    const prefs = prefsDTO(doc);
    return {
      name: ctx.member.name || '', email: ctx.member.email || '',
      listening: devices,
      app: origin(env) || undefined,
      voice: prefs.voice, voice_ready: env.holm.app.kv.get('voice:ready') === true,
      sounds: Object.fromEntries(KINDS.map((k) => [k.id, prefs.sounds[k.id]])),
      usage: usageDTO(doc),
      next: devices
        ? `${devices} device${devices === 1 ? ' is' : 's are'} listening. Call notify_send when something finishes, fails or needs the person; add "say" for a spoken line.`
        : `No device is listening right now: ask the person to open ${origin(env) || 'the Ralk app'} and keep the tab open. Notifications sent meanwhile are kept, not played.`,
    };
  });
}

export function opNotifySend(input, env) {
  return op(env, async (ctx) => {
    const out = await createNote(env, ctx, input, 'claude');
    return { ...out, next: next(out) };
  });
}

export function opSaySend(input, env) {
  return op(env, async (ctx) => {
    const out = await createNote(env, ctx, { kind: 'say', say: input.text, project: input.project, sound: input.sound === undefined ? 'none' : input.sound }, 'claude');
    return { ...out, next: next(out) };
  });
}

function next({ note, listening: n }) {
  if (!n) return 'No device is listening, so nothing played; it will show in the app as missed. Ask the person to open Ralk.';
  if (note.speech === 'failed') return `Delivered to ${n} device${n === 1 ? '' : 's'}, but the voice failed: ${note.error}`;
  if (note.speech === 'queued' || note.speech === 'working') return `Delivered to ${n} device${n === 1 ? '' : 's'}; the sound played now and the voice follows in a few seconds.`;
  if (note.speech === 'ready') return `Delivered to ${n} device${n === 1 ? '' : 's'}; the line was already made once, so it plays at once and costs nothing.`;
  return `Delivered to ${n} device${n === 1 ? '' : 's'}.`;
}

export function opSoundsList() {
  const { kinds, groups, sounds } = catalog();
  return {
    kinds: kinds.map(({ id, label, blurb, sound }) => ({ id, label, blurb, default_sound: sound })), groups,
    sounds: sounds.map(({ id, name, blurb, group, dur }) => ({ id, name, blurb, group, seconds: dur })),
    voices: VOICES.map((l) => ({ language: l.language, ids: l.voices.map((v) => v.id) })), default_voice: DEFAULT_VOICE,
    limits: LIMITS,
  };
}

export function opSoundsPlay(input, env) {
  return op(env, (ctx) => {
    const out = playSound(env, ctx, input.sound);
    return { ...out, next: out.listening ? `Played on ${out.listening} device${out.listening === 1 ? '' : 's'}.` : 'No device is listening, so nothing played.' };
  });
}

export function opHistoryList(input, env) {
  return op(env, (ctx) => {
    const notes = listNotes(env, ctx, int(input.limit, 20, 1, 100));
    return { notes: notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body || undefined, say: n.say || undefined, project: n.project || undefined, from: n.from, at: new Date(n.at).toISOString(), heard_on: n.heard.map((h) => h.device), speech: n.speech === 'none' ? undefined : n.speech })) };
  });
}

// The voice and the sound for each kind, as the Sounds and Voice tabs set them. Open tabs
// take the change at once (updatePrefs broadcasts it on the person's channel).
export function opPrefsUpdate(input, env) {
  return op(env, (ctx) => {
    if (input.voice === undefined && (!input.sounds || !Object.keys(input.sounds).length)) reject(400, 'invalid_input', 'Say what to change: voice, or sounds for some kinds.');
    const prefs = updatePrefs(env, ctx, { voice: input.voice, sounds: input.sounds });
    return { voice: prefs.voice, sounds: prefs.sounds };
  });
}

// Clear history, as the Live tab's menu does: every device's feed empties at once.
export function opHistoryClear(input, env) {
  return op(env, (ctx) => {
    const out = clearNotes(env, ctx);
    return { removed: out.deleted, left: out.more || undefined, next: out.more ? 'Some are left; call again to remove the rest.' : 'History is empty on every device.' };
  });
}

export { reject };
