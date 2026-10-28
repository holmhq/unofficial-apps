// Who is asking, and their record in Ralk: a secret realtime channel, their preferences
// (voice, the sound for each kind) and this month's voice usage. Accounts are the node's.
import { reject, randomId, text, month } from './lib/util.js';
import { KINDS, SOUND_IDS, VOICE_IDS, DEFAULT_VOICE } from './catalog.js';

export function context(env) {
  const auth = env.holm.auth;
  let member = null;
  try { member = auth.isLoggedIn() ? auth.getMember() : null; } catch { member = null; }
  let admin = false;
  try { admin = !!(member && auth.isAppAdmin()); } catch { admin = false; }
  return { env, member: member && member.id ? member : null, admin };
}

export function requireMember(ctx) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  return ctx;
}

const defaultSounds = () => Object.fromEntries(KINDS.map((k) => [k.id, k.sound]));

// The person's record, made on first use. Two first requests at once agree on the oldest.
export function person(env, ctx) {
  requireMember(ctx);
  const ds = env.holm.app.ds;
  const query = { member: ctx.member.id };
  let found = ds.find('people', query, { limit: 3, order: 'asc' });
  if (!found.length) {
    ds.insert('people', { member: ctx.member.id, chan: randomId(24), voice: DEFAULT_VOICE, sounds: defaultSounds(), usage: { month: month(), chars: 0, mills: 0, lines: 0 }, createdAt: Date.now() });
    found = ds.find('people', query, { limit: 3, order: 'asc' });
  }
  const doc = found.sort((a, b) => (a._createdAt || 0) - (b._createdAt || 0))[0];
  if (!doc) reject(409, 'conflict', 'That did not stick. Try again.');
  for (const extra of found.slice(1)) ds.delete('people', { id: extra.id });
  return doc;
}

export const channel = (doc) => 'r-' + doc.chan;

export function prefsDTO(doc) {
  const sounds = { ...defaultSounds(), ...(doc.sounds || {}) };
  for (const k of Object.keys(sounds)) if (sounds[k] !== 'none' && !SOUND_IDS.has(sounds[k])) sounds[k] = defaultSounds()[k];
  return { voice: VOICE_IDS.has(doc.voice) ? doc.voice : DEFAULT_VOICE, sounds };
}

export function usageDTO(doc) {
  const u = doc.usage && doc.usage.month === month() ? doc.usage : { month: month(), chars: 0, mills: 0, lines: 0 };
  return { month: u.month, chars: u.chars, lines: u.lines, usd: u.mills / 1000 };
}

export function updatePrefs(env, ctx, input) {
  const doc = person(env, ctx);
  const set = {};
  if (input.voice !== undefined) {
    const voice = text(input.voice, 60, 'voice', true);
    if (!VOICE_IDS.has(voice)) reject(400, 'invalid_input', 'Pick a voice from the list.');
    set.voice = voice;
  }
  if (input.sounds !== undefined) {
    if (!input.sounds || typeof input.sounds !== 'object' || Array.isArray(input.sounds)) reject(400, 'invalid_input', 'sounds must be an object of kind → sound.');
    const sounds = { ...prefsDTO(doc).sounds };
    for (const [kind, sound] of Object.entries(input.sounds)) {
      if (!KINDS.some((k) => k.id === kind)) reject(400, 'invalid_input', `Unknown kind "${kind}".`);
      if (sound !== 'none' && !SOUND_IDS.has(sound)) reject(400, 'invalid_input', `Unknown sound "${sound}".`);
      sounds[kind] = sound;
    }
    set.sounds = sounds;
  }
  if (Object.keys(set).length) env.holm.app.ds.update('people', { id: doc.id }, { $set: set });
  const after = env.holm.app.ds.findOne('people', doc.id);
  env.holm.realtime.broadcast(channel(after), { type: 'prefs', prefs: prefsDTO(after) });
  return prefsDTO(after);
}

export function rotateChannel(env, ctx) {
  const doc = person(env, ctx);
  env.holm.realtime.broadcast(channel(doc), { type: 'rotated' });
  env.holm.app.ds.update('people', { id: doc.id }, { $set: { chan: randomId(24) } });
  return channel(env.holm.app.ds.findOne('people', doc.id));
}

// Add a line's characters and cost to this month's counter.
export function charge(env, doc, chars, mills) {
  const u = doc.usage && doc.usage.month === month() ? doc.usage : { month: month(), chars: 0, mills: 0, lines: 0 };
  const usage = { month: u.month, chars: u.chars + chars, mills: u.mills + mills, lines: u.lines + 1 };
  env.holm.app.ds.update('people', { id: doc.id }, { $set: { usage } });
  return usage;
}

export function listening(env, doc) {
  try { return Number(env.holm.realtime.count(channel(doc))) || 0; } catch { return 0; }
}
