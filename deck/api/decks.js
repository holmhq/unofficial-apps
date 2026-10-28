// Decks and their revisions. A deck row holds what lists need (title, the first slides for a
// thumbnail, who changed it last, its share link); every save writes an immutable revision
// with the whole deck. A person's run of edits in the studio amends their own latest revision
// for ten minutes, so history shows one row per sitting rather than one per pause in typing.
// `version` counts every save, amendments included: a save must name the version it was
// made from (`base`), so nobody overwrites a change they never saw.
import { one, rows, mutate } from './lib/store.js';
import { reject, text, randomId } from './lib/util.js';
import { shape, check, slideName, mediaIds, LAYOUTS } from './check.js';
import { access, workspaceById, broadcast } from './workspaces.js';
import { inLibrary } from './media.js';

export const DID = /^[a-z0-9]{12}$/;
export const SID = /^[a-z0-9]{16}$/;
const MAX_DECKS = 200;
const MAX_REVISIONS = 300;
const AMEND_MS = 10 * 60000;

// The deck and the caller's place in its workspace; strangers get the same 404 as a typo.
export function deckAccess(env, ctx, did, need = 'editor') {
  const deck = typeof did === 'string' && DID.test(did) ? one(env, 'decks', { did }) : null;
  if (!deck) reject(404, 'not_found', 'No such deck. decks_list shows the decks you can open.');
  try {
    return { deck, ...access(env, ctx, deck.wid, need) };
  } catch (error) {
    if (error.status === 404) reject(404, 'not_found', 'No such deck. decks_list shows the decks you can open.');
    throw error;
  }
}

// The first slides, without notes: enough for a cover thumbnail and its fan.
function peek(content) {
  return {
    title: content.title || '', brand: content.brand || '', accent: content.accent || null,
    slides: content.slides.slice(0, 4).map((s) => { const { notes, ...rest } = s; return rest; }),
  };
}

export function shareDTO(d) {
  if (!d.sid) return null;
  return { url: `/s/${d.sid}`, embed: `/e/${d.sid}`, mode: d.follow ? 'latest' : 'pinned', revision: d.follow ? d.head : d.rev };
}

export function deckDTO(d, { members = false } = {}) {
  const out = {
    id: d.did, workspace: d.wid, title: d.title || 'Untitled deck', slides: d.slides, accent: d.accent || 'cobalt',
    revision: d.head, version: d.version, url: `/d/${d.did}`,
    created_at: new Date(d.createdAt).toISOString(), updated_at: new Date(d.updatedAt).toISOString(),
    updated_by: d.updatedBy || null, shared: shareDTO(d), peek: d.peek,
  };
  if (members) out.channel = 'd-' + d.chan;
  return out;
}

function revisionDTO(r, withContent = true) {
  const out = { n: r.n, by: r.by, name: r.name || '', message: r.message || '', at: new Date(r.at).toISOString(), slides: r.slides };
  if (withContent) out.content = r.content;
  return out;
}

function revisionOf(env, did, n) {
  return one(env, 'revisions', { did, n });
}

function checkFor(env, wid, content) {
  return check(content, { hasMedia: (id) => inLibrary(env, wid, id) });
}

export function listDecks(env, ctx, wid) {
  access(env, ctx, wid, 'editor');
  return rows(env, 'decks', { wid }, MAX_DECKS).sort((a, b) => b.updatedAt - a.updatedAt).map((d) => deckDTO(d));
}

function starter(title) {
  return { title, description: '', slides: [{ layout: 'title', title, subtitle: '' }] };
}

// by: 'person' (the studio) or 'claude' (an MCP tool). Claude's decks must pass the check.
export function createDeck(env, ctx, wid, input, by) {
  const { ws } = access(env, ctx, wid, 'editor');
  if (rows(env, 'decks', { wid }, MAX_DECKS).length >= MAX_DECKS) reject(409, 'too_many', `A workspace holds ${MAX_DECKS} decks.`);
  const title = text(input.title, 120, 'Title');
  const content = shape(input.content || starter(title || 'Untitled deck'));
  if (title) content.title = title;
  const result = checkFor(env, wid, content);
  if (by === 'claude' && !result.ok) reject(422, 'invalid_deck', `This deck has ${result.errors.length} error(s). ${result.errors.slice(0, 6).join(' ')}`, { errors: result.errors, warnings: result.warnings });
  const now = Date.now();
  const who = { name: ctx.member.name || '', by };
  const doc = {
    did: randomId(12), wid, title: content.title || 'Untitled deck', slides: content.slides.length, accent: content.accent || null,
    peek: peek(content), head: 1, version: 1, chan: randomId(20), sid: null, follow: false, rev: null,
    createdBy: ctx.member.id, createdAt: now, updatedAt: now, updatedBy: who,
  };
  env.holm.app.ds.insert('decks', doc);
  env.holm.app.ds.insert('revisions', {
    did: doc.did, wid, n: 1, content, by, account: ctx.member.id, name: who.name,
    message: text(input.message, 200, 'Message') || (input.from === 'sample' ? 'Sample deck' : 'Created'), at: now, startedAt: now, slides: content.slides.length, sealed: true,
  });
  broadcast(env, ws, { type: 'decks' });
  return { deck: deckDTO(doc), revision: 1, base: 1, check: result };
}

export function getDeck(env, ctx, did, n) {
  const { deck, role } = deckAccess(env, ctx, did, 'editor');
  const at = n == null ? deck.head : Number(n);
  const rev = revisionOf(env, deck.did, at);
  if (!rev) reject(404, 'not_found', `This deck has no revision ${at}. revisions_list shows them.`);
  return {
    deck: deckDTO(deck, { members: true }), role,
    revision: revisionDTO(rev), base: at === deck.head ? deck.version : null,
    check: checkFor(env, deck.wid, rev.content),
  };
}

// JSON with sorted keys: storage need not keep the order a browser sent.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// The slides that differ between two versions, numbered from 1, so a studio can show where.
function changedSlides(before, after) {
  const out = [];
  const a = (before && before.slides) || [];
  const b = after.slides;
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 12; i++) {
    if (stable(a[i]) !== stable(b[i])) out.push(Math.min(i, b.length - 1) + 1);
  }
  return [...new Set(out)];
}

export function saveDeck(env, ctx, did, input, by) {
  const { deck, ws } = deckAccess(env, ctx, did, 'editor');
  const content = shape(input.content);
  const result = checkFor(env, deck.wid, content);
  if (by === 'claude' && !result.ok) reject(422, 'invalid_deck', `Not saved: ${result.errors.length} error(s). ${result.errors.slice(0, 6).join(' ')}`, { errors: result.errors, warnings: result.warnings });
  const client = typeof input.client === 'string' && /^[a-z0-9]{6,24}$/.test(input.client) ? input.client : null;
  return commit(env, ctx, deck, ws, content, { base: input.base, message: text(input.message, 200, 'Message') || '', by, amend: by === 'person' && input.amend === true, check: result, client });
}

// client: the studio tab that saved, so it can skip its own echo on the live channel.
function commit(env, ctx, deck, ws, content, { base, message, by, amend, check: result, client = null, seal = false }) {
  if (base !== undefined && base !== null && Number(base) !== deck.version) {
    reject(409, 'conflict', `This deck changed since you read it (now version ${deck.version}, revision ${deck.head}). Read it again and apply your change to that.`, { base: deck.version, revision: deck.head });
  }
  const now = Date.now();
  const head = revisionOf(env, deck.did, deck.head);
  const pinned = deck.sid && !deck.follow ? deck.rev : null;
  const canAmend = amend && head && !head.sealed && head.by === 'person' && head.account === ctx.member.id && now - (head.startedAt || head.at) < AMEND_MS && head.n !== pinned;
  const n = canAmend ? deck.head : deck.head + 1;
  const who = { name: ctx.member.name || '', by };
  const next = mutate(env, 'decks', deck.id, (cur) => {
    if (cur.version !== deck.version) reject(409, 'conflict', 'Someone saved this deck at the same moment. Read it again and retry.', { base: cur.version, revision: cur.head });
    return { $set: { head: n, version: cur.version + 1, title: content.title || 'Untitled deck', slides: content.slides.length, accent: content.accent || null, peek: peek(content), updatedAt: now, updatedBy: who } };
  });
  if (canAmend) {
    env.holm.app.ds.update('revisions', { id: head.id }, { $set: { content, at: now, slides: content.slides.length, ...(message ? { message } : {}) } });
  } else {
    env.holm.app.ds.insert('revisions', { did: deck.did, wid: deck.wid, n, content, by, account: ctx.member.id, name: who.name, message, at: now, startedAt: now, slides: content.slides.length, ...(seal ? { sealed: true } : {}) });
    prune(env, next);
  }
  const changed = changedSlides(head && head.content, content);
  const ping = { type: 'saved', version: next.version, revision: n, by, name: who.name, message, changed, client };
  try { env.holm.realtime.broadcast('d-' + deck.chan, ping); } catch (error) { console.warn('realtime', String(error && error.message || error).slice(0, 200)); }
  if (next.sid && next.follow) { try { env.holm.realtime.broadcast('s-' + next.sid, { type: 'saved', revision: n }); } catch { /* the viewer polls on focus */ } }
  broadcast(env, ws, { type: 'decks' });
  return { deck: deckDTO(next), revision: n, base: next.version, amended: !!canAmend, changed, check: result };
}

// Keep the newest revisions, and always the one a share link pins.
function prune(env, deck) {
  const cutoff = deck.head - MAX_REVISIONS;
  if (cutoff < 1) return;
  const old = env.holm.app.ds.find('revisions', { did: deck.did, n: { $lte: cutoff } }, { limit: 20, order: 'asc' });
  for (const r of old) if (!(deck.sid && !deck.follow && deck.rev === r.n)) env.holm.app.ds.delete('revisions', { id: r.id });
}

// Slide-level changes for Claude: one small edit list instead of the whole deck.
export function editSlides(env, ctx, did, input) {
  const { deck, ws } = deckAccess(env, ctx, did, 'editor');
  if (input.base != null && Number(input.base) !== deck.version) {
    reject(409, 'conflict', `This deck changed since you read it (now version ${deck.version}). Read it again (deck_get) and redo the edit on that.`, { base: deck.version, revision: deck.head });
  }
  const head = revisionOf(env, deck.did, deck.head);
  const content = JSON.parse(JSON.stringify(head.content));
  const slides = content.slides;
  const pos = (value, label, extra = 0) => {
    const at = Number(value);
    if (!Number.isInteger(at) || at < 1 || at > slides.length + extra) reject(400, 'invalid_input', `${label} must be a slide number from 1 to ${slides.length + extra}.`);
    return at - 1;
  };
  const slideValue = (s, label) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) reject(400, 'invalid_input', `${label}: "slide" is a slide object with a "layout".`);
    if (!LAYOUTS.includes(s.layout)) reject(400, 'invalid_input', `${label}: layout is one of ${LAYOUTS.join(', ')}.`);
    return s;
  };
  (input.edits || []).forEach((e, k) => {
    const label = `Edit ${k + 1} (${e && e.op})`;
    switch (e && e.op) {
      case 'insert': slides.splice(e.at == null ? slides.length : pos(e.at, label, 1), 0, slideValue(e.slide, label)); break;
      case 'replace': slides[pos(e.at, label)] = slideValue(e.slide, label); break;
      case 'update': {
        const i = pos(e.at, label);
        if (!e.set || typeof e.set !== 'object') reject(400, 'invalid_input', `${label}: "set" is an object of fields to change (null removes one).`);
        const next = { ...slides[i] };
        for (const [key, value] of Object.entries(e.set)) { if (value === null) delete next[key]; else next[key] = value; }
        slides[i] = slideValue(next, label);
        break;
      }
      case 'move': { const from = pos(e.at, label); const to = pos(e.to, label); const [s] = slides.splice(from, 1); slides.splice(to, 0, s); break; }
      case 'delete': if (slides.length <= 1) reject(400, 'invalid_input', 'A deck keeps at least one slide.'); slides.splice(pos(e.at, label), 1); break;
      case 'deck':
        for (const key of ['title', 'description', 'brand', 'accent', 'lang']) {
          if (!e.set || e.set[key] === undefined) continue;
          if (e.set[key] === null) delete content[key]; else content[key] = e.set[key];
        }
        break;
      default: reject(400, 'invalid_input', `${label}: op is insert, replace, update, move, delete or deck.`);
    }
  });
  const shaped = shape(content);
  const result = checkFor(env, deck.wid, shaped);
  if (!result.ok) reject(422, 'invalid_deck', `Not saved: ${result.errors.length} error(s). ${result.errors.slice(0, 6).join(' ')}`, { errors: result.errors, warnings: result.warnings });
  return commit(env, ctx, deck, ws, shaped, { base: deck.version, message: text(input.message, 200, 'Message') || '', by: 'claude', check: result });
}

export function checkDeck(env, ctx, wid, content) {
  access(env, ctx, wid, 'editor');
  return checkFor(env, wid, shape(content));
}

export function listRevisions(env, ctx, did, limit = 50) {
  const { deck } = deckAccess(env, ctx, did, 'editor');
  const list = env.holm.app.ds.find('revisions', { did: deck.did }, { limit: 300, order: 'desc' }).sort((a, b) => b.n - a.n).slice(0, limit);
  return { deck: deckDTO(deck), revisions: list.map((r) => revisionDTO(r, false)) };
}

export function restoreRevision(env, ctx, did, n, by) {
  const { deck, ws } = deckAccess(env, ctx, did, 'editor');
  const rev = revisionOf(env, deck.did, Number(n));
  if (!rev) reject(404, 'not_found', `This deck has no revision ${n}.`);
  if (rev.n === deck.head) reject(409, 'conflict', `Revision ${n} is already the latest.`);
  const content = shape(rev.content);
  return commit(env, ctx, deck, ws, content, { message: `Restored revision ${rev.n}`, by, check: checkFor(env, deck.wid, content), seal: true });
}

export function duplicateDeck(env, ctx, did) {
  const { deck } = deckAccess(env, ctx, did, 'editor');
  const head = revisionOf(env, deck.did, deck.head);
  const content = JSON.parse(JSON.stringify(head.content));
  content.title = `${content.title || 'Untitled deck'} (copy)`.slice(0, 120);
  return createDeck(env, ctx, deck.wid, { content, message: `Copied from “${deck.title}”` }, 'person');
}

export function deleteDeck(env, ctx, did) {
  const { deck, ws } = deckAccess(env, ctx, did, 'editor');
  env.holm.app.ds.delete('revisions', { did: deck.did });
  env.holm.app.ds.delete('views', { did: deck.did });
  env.holm.app.ds.delete('decks', { id: deck.id });
  broadcast(env, ws, { type: 'decks' });
  return { deleted: true };
}

// ---------- sharing ----------

// mode: off (no link), latest (the link follows every save) or pinned (one revision).
// Turning a link off and on again makes a new one: the old address stops working for good.
export function setShare(env, ctx, did, input) {
  const { deck, ws } = deckAccess(env, ctx, did, 'editor');
  const mode = input.mode;
  if (!['off', 'latest', 'pinned'].includes(mode)) reject(400, 'invalid_input', 'mode is off, latest or pinned.');
  let set;
  if (mode === 'off') set = { sid: null, follow: false, rev: null };
  else {
    let rev = null;
    if (mode === 'pinned') {
      rev = input.revision == null ? deck.head : Number(input.revision);
      if (!revisionOf(env, deck.did, rev)) reject(404, 'not_found', `This deck has no revision ${input.revision}.`);
    }
    set = { sid: deck.sid || randomId(16), follow: mode === 'latest', rev };
  }
  const next = mutate(env, 'decks', deck.id, () => ({ $set: set }));
  if (deck.sid && deck.sid !== next.sid) { try { env.holm.realtime.broadcast('s-' + deck.sid, { type: 'gone' }); } catch { /* best effort */ } }
  else if (next.sid) { try { env.holm.realtime.broadcast('s-' + next.sid, { type: 'saved', revision: next.follow ? next.head : next.rev }); } catch { /* best effort */ } }
  broadcast(env, ws, { type: 'decks' });
  return { deck: deckDTO(next), shared: shareDTO(next) };
}

export function sharedDeck(env, sid) {
  if (typeof sid !== 'string' || !SID.test(sid)) return null;
  const deck = one(env, 'decks', { sid });
  if (!deck) return null;
  const n = deck.follow ? deck.head : deck.rev;
  const rev = revisionOf(env, deck.did, n);
  if (!rev) return null;
  return { deck, revision: rev };
}

// What a shared link shows: the deck, nothing about the workspace or who made it.
export function publicDeck(env, sid) {
  const found = sharedDeck(env, sid);
  if (!found) reject(404, 'not_found', 'This deck isn’t shared, or the link changed.');
  const { deck, revision } = found;
  return { content: revision.content, revision: revision.n, live: !!deck.follow, channel: deck.follow ? 's-' + deck.sid : null };
}

// The members' own view of a deck for presenting: the head, or one revision.
export function presentDeck(env, ctx, did, n) {
  const { deck } = deckAccess(env, ctx, did, 'editor');
  const at = n == null ? deck.head : Number(n);
  const rev = revisionOf(env, deck.did, at);
  if (!rev) reject(404, 'not_found', `This deck has no revision ${at}.`);
  return { content: rev.content, revision: rev.n, live: at === deck.head, channel: at === deck.head ? 'd-' + deck.chan : null };
}

// Link previews: the first picture in the deck, as its 1200 × 630 copy.
export function previewImage(content) {
  const id = mediaIds(content)[0];
  if (id) return `/media/${id}-og.jpg`;
  return null;
}

// Claude's cue to whoever has the deck open: go to a slide and read a short message.
export function showStudio(env, ctx, did, input) {
  const { deck } = deckAccess(env, ctx, did, 'editor');
  const slide = input.slide == null ? 1 : Number(input.slide);
  if (!Number.isInteger(slide) || slide < 1 || slide > deck.slides) reject(400, 'invalid_input', `slide is 1 to ${deck.slides}.`);
  const message = text(input.message, 200, 'Message') || '';
  const channel = 'd-' + deck.chan;
  env.holm.realtime.broadcast(channel, { type: 'show', slide, message, name: ctx.member.name || '' });
  let open = 0;
  try { open = env.holm.realtime.count(channel); } catch { open = 0; }
  return { delivered: open, slide };
}

export function summary(content) {
  return content.slides.map((s, i) => `${i + 1}. ${s.layout} · ${slideName(s)}`.slice(0, 120));
}

export function workspaceOfDeck(env, deck) { return workspaceById(env, deck.wid); }
