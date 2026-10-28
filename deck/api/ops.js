// Named operations (contract.json): the tools Claude uses through Holm's MCP endpoint at
// /_holm/mcp. They are open to anyone signed in (auth "user"); each one checks the caller's
// membership of the workspace it touches, so a stranger's Claude sees nothing.
import { reject, int } from './lib/util.js';
import { context, requireMember } from './people.js';
import { access, myWorkspaces, createWorkspace, updateWorkspace, wsDTO } from './workspaces.js';
import {
  listDecks, createDeck, getDeck, saveDeck, editSlides, checkDeck, listRevisions, restoreRevision,
  setShare, showStudio, summary, deckAccess,
} from './decks.js';
import { listMedia, storeMedia, createUploadLink, inLibrary } from './media.js';

const CODES = { 400: 'APP_INVALID_INPUT', 401: 'APP_UNAUTHORIZED', 403: 'APP_FORBIDDEN', 404: 'APP_NOT_FOUND', 409: 'APP_CONFLICT', 410: 'APP_CONFLICT', 413: 'APP_INVALID_INPUT', 415: 'APP_INVALID_INPUT', 422: 'APP_INVALID', 429: 'APP_RATE_LIMITED' };
// The contract declares no error details, so what they carry is already in the message.
const fail = (error) => { if (error && error.public) { error.code = CODES[error.status] || 'APP_INVALID_INPUT'; delete error.details; } throw error; };
function op(env, run) {
  try { return run(requireMember(context(env))); } catch (error) { return fail(error); }
}
async function opAsync(env, run) {
  try { return await run(requireMember(context(env))); } catch (error) { return fail(error); }
}

// The address people open, recorded by the web app on its first visit to each host.
const origin = (env) => env.holm.app.kv.get('site:origin') || '';
const absolute = (env, path) => (path ? origin(env) + path : path);
const linked = (env, deck) => ({ ...deck, url: absolute(env, deck.url), shared: deck.shared ? { ...deck.shared, url: absolute(env, deck.shared.url), embed: absolute(env, deck.shared.embed) } : null, peek: undefined });

export function opGuide(input, env) {
  return { guide: env.holm.private.read('guide.md') };
}

export function opMe(input, env) {
  return op(env, (ctx) => {
    const workspaces = myWorkspaces(env, ctx).map(({ joined, ...w }) => w);
    return {
      name: ctx.member.name || '', email: ctx.member.email || '',
      workspaces,
      next: workspaces.length
        ? 'Pass a workspace id to decks_list or decks_create. Call guide_get before writing your first deck.'
        : 'You are not on a workspace yet. Ask the person for a name and call workspaces_create, or ask a teammate for an invite link.',
    };
  });
}

export function opWorkspacesCreate(input, env) {
  return op(env, (ctx) => ({ workspace: wsDTO(createWorkspace(env, ctx, input), 'owner') }));
}

// Rename a workspace or make a picture from its library its logo (owners and admins).
export function opWorkspacesUpdate(input, env) {
  return op(env, (ctx) => {
    const wid = input.workspace;
    return { workspace: updateWorkspace(env, ctx, wid, { name: input.name, logo: input.logo }, (id) => inLibrary(env, wid, id)) };
  });
}

export function opDecksList(input, env) {
  return op(env, (ctx) => {
    const wids = input.workspace ? [input.workspace] : myWorkspaces(env, ctx).map((w) => w.id);
    const out = [];
    for (const wid of wids.slice(0, 10)) {
      const { ws } = access(env, ctx, wid, 'editor');
      for (const d of listDecks(env, ctx, wid)) out.push({ ...linked(env, d), workspace_name: ws.name });
    }
    return { decks: out.slice(0, 200) };
  });
}

export function opDecksCreate(input, env) {
  return op(env, (ctx) => {
    const made = createDeck(env, ctx, input.workspace, { title: input.title, content: input.content, message: input.message }, 'claude');
    return { ...made, deck: linked(env, made.deck), next: 'Open the deck url to watch it; every save shows there at once.' };
  });
}

export function opDeckGet(input, env) {
  return op(env, (ctx) => {
    const got = getDeck(env, ctx, input.deck, input.revision);
    const { channel, ...deck } = got.deck;
    return { deck: linked(env, deck), role: got.role, base: got.base, revision: got.revision, outline: summary(got.revision.content), check: got.check };
  });
}

export function opDeckSave(input, env) {
  return op(env, (ctx) => {
    const saved = saveDeck(env, ctx, input.deck, { base: input.base, content: input.content, message: input.message }, 'claude');
    return { ...saved, deck: linked(env, saved.deck) };
  });
}

export function opSlidesEdit(input, env) {
  return op(env, (ctx) => {
    const saved = editSlides(env, ctx, input.deck, input);
    return { ...saved, deck: linked(env, saved.deck) };
  });
}

export function opDeckCheck(input, env) {
  return op(env, (ctx) => {
    let wid = input.workspace;
    if (!wid && input.deck) wid = deckAccess(env, ctx, input.deck, 'editor').deck.wid;
    if (!wid) reject(400, 'invalid_input', 'Pass the workspace (or deck) the content is for: its pictures must be in that library.');
    return checkDeck(env, ctx, wid, input.content);
  });
}

export function opRevisionsList(input, env) {
  return op(env, (ctx) => {
    const list = listRevisions(env, ctx, input.deck, int(input.limit, 30, 1, 100));
    return { deck: linked(env, list.deck), revisions: list.revisions };
  });
}

export function opRevisionsRestore(input, env) {
  return op(env, (ctx) => {
    const saved = restoreRevision(env, ctx, input.deck, input.revision, 'claude');
    return { ...saved, deck: linked(env, saved.deck) };
  });
}

export function opAssetsList(input, env) {
  return op(env, (ctx) => {
    access(env, ctx, input.workspace, 'editor');
    return { assets: listMedia(env, input.workspace, int(input.limit, 60, 1, 200)) };
  });
}

// A drawing as SVG text, or a small picture as base64.
export function opAssetsPut(input, env) {
  return op(env, (ctx) => {
    access(env, ctx, input.workspace, 'editor');
    let bytes;
    if (input.svg) bytes = new TextEncoder().encode(input.svg).buffer;
    else if (input.data) {
      let raw;
      try { raw = atob(String(input.data).replace(/^data:[^,]*,/, '').replace(/\s+/g, '')); } catch { reject(400, 'invalid_input', '"data" must be base64.'); }
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      bytes = out.buffer;
    } else reject(400, 'invalid_input', 'Send "svg" (a drawing) or "data" (a small picture, base64).');
    return { asset: storeMedia(env, input.workspace, ctx.member.id, bytes, { name: input.name, alt: input.alt, via: 'claude' }) };
  });
}

export async function opAssetsLink(input, env) {
  return opAsync(env, async (ctx) => {
    access(env, ctx, input.workspace, 'editor');
    return createUploadLink(env, input.workspace, ctx.member.id, origin(env) || '');
  });
}

export function opShareSet(input, env) {
  return op(env, (ctx) => {
    const out = setShare(env, ctx, input.deck, input);
    return { deck: linked(env, out.deck), shared: out.shared ? { ...out.shared, url: absolute(env, out.shared.url), embed: absolute(env, out.shared.embed) } : null };
  });
}

export function opStudioShow(input, env) {
  return op(env, (ctx) => showStudio(env, ctx, input.deck, input));
}

