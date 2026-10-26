// Bounded DS reads, unique claims and compare-and-set updates.
import { reject } from './util.js';

export function ds(env) { return env.holm.app.ds; }

// Every scan is paged and capped; storage never returns an unbounded list.
export function rows(env, collection, query = {}, cap = 1000) {
  const out = [];
  let cursor;
  do {
    const page = ds(env).find(collection, query, { page: true, limit: Math.min(250, cap - out.length), order: 'desc', ...(cursor ? { cursor } : {}) });
    for (const row of page.rows) out.push(row);
    cursor = page.cursor;
  } while (cursor && out.length < cap);
  return out;
}

const oldest = (a, b) => (a._createdAt || 0) - (b._createdAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function one(env, collection, query) {
  const found = ds(env).find(collection, query, { limit: 5, order: 'asc' });
  if (!found.length) return null;
  return found.sort(oldest)[0];
}

export function byId(env, collection, id) {
  if (!id || typeof id !== 'string') return null;
  return ds(env).findOne(collection, id);
}

// Insert, re-read and keep the oldest, so two racing claims agree on one winner.
export function claim(env, collection, query, value) {
  let found = ds(env).find(collection, query, { limit: 5, order: 'asc' }).sort(oldest);
  let id;
  if (!found.length) {
    id = ds(env).insert(collection, value);
    found = ds(env).find(collection, query, { limit: 5, order: 'asc' }).sort(oldest);
  }
  const doc = found[0];
  if (!doc) reject(409, 'conflict', 'That change did not stick. Try again.');
  if (id && doc.id !== id) ds(env).delete(collection, { id });
  return { doc, created: !!id && doc.id === id };
}

// Read, build the change from the current document, write only if nothing changed meanwhile.
export function mutate(env, collection, id, build) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = byId(env, collection, id);
    if (!before) reject(404, 'not_found', 'Not found.');
    const change = build(before);
    if (!change) return before;
    const result = ds(env).update(collection, { id }, change, { ifRevision: before._rev });
    if (result && result.code === 'DS_REVISION_CONFLICT') continue;
    if (result && result.ok === false) throw Object.assign(new Error('Storage write failed.'), { code: result.code || 'storage_write_failed' });
    return byId(env, collection, id);
  }
  reject(409, 'conflict', 'This changed several times at once. Try again.');
}

export function bump(env, collection, id, field, amount) {
  ds(env).update(collection, { id }, { $inc: { [field]: amount } });
}

// Site-wide revision: part of every page cache key, bumped on any visible change.
export function touch(env) { env.holm.app.kv.increment('site:rev'); }
export function siteRev(env) { return env.holm.app.kv.get('site:rev') || 0; }
