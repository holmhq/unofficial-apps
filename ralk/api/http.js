// Ralk's HTTP side: the JSON API the web app uses. Claude's tools (ops.js) call the same
// functions in notes.js and people.js.
import { json, errorResponse, readJSON, reject, sameOrigin, int } from './lib/util.js';
import { context, requireMember, person, channel, prefsDTO, usageDTO, updatePrefs, rotateChannel, listening } from './people.js';
import { catalog } from './catalog.js';
import { createNote, listNotes, getNote, markHeard, clearNotes, pollSpeech, keepAudio, audio, playSound, LIMITS } from './notes.js';
import { configured } from './fal.js';

const LOCAL = /^(127\.|localhost|\[::1\]|[a-z0-9.-]+\.localhost|[0-9.]+\.nip\.io|[a-z0-9-]+\.[0-9.]+\.nip\.io)(:\d+)?$/;
export function originOf(url) { return LOCAL.test(url.host) ? url.origin : `https://${url.host}`; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // Claude's tools answer with the app's address, so remember the one people use.
      const origin = originOf(url);
      if (!/^(127\.|localhost|\[::1\])/.test(url.host)) {
        const kept = env.holm.app.kv.get('site:origin');
        if (kept !== origin && (!kept || !LOCAL.test(url.host))) env.holm.app.kv.set('site:origin', origin);
      }
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      return env.holm.web.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

async function api(request, env, url) {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) reject(403, 'forbidden', 'Cross-site requests are refused.');
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const ctx = context(env);
  const body = async () => readJSON(request);
  const [a, b, c] = parts;

  if (a === 'me' && parts.length === 1 && method === 'GET') return json(me(env, ctx, url.searchParams.get('return')));
  if (a === 'sounds' && parts.length === 1 && method === 'GET') return json(catalog(), 200, { 'Cache-Control': 'public, max-age=600' });

  requireMember(ctx);
  if (a === 'notes') {
    if (parts.length === 1) {
      if (method === 'GET') return json({ notes: listNotes(env, ctx, int(url.searchParams.get('limit'), 60, 1, 200)) });
      if (method === 'POST') return json(await createNote(env, ctx, await body(), 'app'), 201);
      if (method === 'DELETE') return json(clearNotes(env, ctx));
    }
    if (parts.length === 2 && method === 'GET') return json({ note: getNote(env, ctx, b) });
    if (parts.length === 3) {
      if (c === 'heard' && method === 'POST') return json(markHeard(env, ctx, b, (await body()).device));
      if (c === 'speech' && method === 'GET') return json({ note: await pollSpeech(env, ctx, b) });
      if (c === 'keep' && method === 'POST') return json({ note: await keepAudio(env, ctx, b) });
      if (c === 'audio' && method === 'GET') return audio(env, ctx, b);
    }
  }
  if (a === 'play' && parts.length === 1 && method === 'POST') return json(playSound(env, ctx, (await body()).sound));
  if (a === 'prefs' && parts.length === 1 && method === 'PATCH') return json({ prefs: updatePrefs(env, ctx, await body()) });
  if (a === 'channel' && b === 'rotate' && parts.length === 2 && method === 'POST') return json({ channel: rotateChannel(env, ctx) });
  reject(404, 'not_found', 'No such API route.');
}

// Who you are, your channel, your preferences and this month's voice usage.
export function me(env, ctx, back) {
  const auth = env.holm.auth;
  // Claude's tools cannot read secrets, so the web route leaves them a note of whether the voice is set up.
  const ready = configured(env);
  if (env.holm.app.kv.get('voice:ready') !== ready) env.holm.app.kv.set('voice:ready', ready);
  const after = typeof back === 'string' && /^\/(?!\/)[\w\-./?=&#%]*$/.test(back) && !back.startsWith('/auth') ? back : '/';
  const out = {
    signed_in: !!ctx.member,
    name: ctx.member ? ctx.member.name || '' : null,
    email: ctx.member ? ctx.member.email || '' : null,
    picture: ctx.member ? ctx.member.picture || '' : null,
    admin: ctx.admin,
    login_url: auth.getLoginURL(after),
    logout_url: auth.getLogoutURL(),
    voice_ready: ready,
    limits: LIMITS,
  };
  if (ctx.member) {
    const doc = person(env, ctx);
    out.channel = channel(doc);
    out.prefs = prefsDTO(doc);
    out.usage = usageDTO(doc);
    out.listening = listening(env, doc);
  }
  return out;
}
