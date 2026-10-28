// Who read a shared deck, and how far. The viewer on /s/ and /e/ reports an open, then how
// long each slide stayed on screen while the page was in view and someone was there. Nothing
// identifies a reader: a random id kept in their browser tells repeat visits apart, the device
// is phone, tablet or desktop, and the referrer is cut down to its host. The workspace's own
// people are not counted, and neither is presenting from the studio.
import { one, rows, mutate } from './lib/store.js';
import { reject, randomId, int } from './lib/util.js';
import { sharedDeck, deckAccess } from './decks.js';
import { membershipOf } from './workspaces.js';
import { slideName } from './check.js';

const VID = /^[a-z0-9]{16}$/;
const VISITOR = /^[a-z0-9]{12,32}$/;
const HOST = /^[a-z0-9.-]{1,100}(:\d{1,5})?$/;
const DEVICES = ['phone', 'tablet', 'desktop'];
const MAX_SLIDES = 60;
const SLACK = 15000; // a report may cover a little more than the time since the last one
const MAX_REPORT = 10 * 60000;
const OPENS_PER_HOUR = 600; // per deck: past this, opens go uncounted rather than flood storage
const READ = 10000; // an open counts as a read after ten seconds on the deck

export function openView(env, ctx, sid, input) {
  const found = sharedDeck(env, sid);
  if (!found) reject(404, 'not_found', 'This deck isn’t shared, or the link changed.');
  const { deck, revision } = found;
  if (ctx.member && membershipOf(env, deck.wid, ctx.member.id)) return { view: null, counted: false, why: 'team' };
  const kv = env.holm.app.kv;
  const key = `opens:${deck.did}:${Math.floor(Date.now() / 3600000)}`;
  const count = Number(kv.get(key) || 0);
  if (count >= OPENS_PER_HOUR) return { view: null, counted: false, why: 'busy' };
  kv.set(key, count + 1, 3600000);
  const n = revision.content.slides.length;
  const now = Date.now();
  const doc = {
    did: deck.did, wid: deck.wid, sid, vid: randomId(16), rev: revision.n,
    visitor: VISITOR.test(input.visitor || '') ? input.visitor : randomId(16),
    at: now, last: now, ms: 0, t: [], n, max: int(input.at, 0, 0, n - 1),
    device: DEVICES.includes(input.device) ? input.device : 'desktop',
    ref: typeof input.ref === 'string' && HOST.test(input.ref.toLowerCase()) ? input.ref.toLowerCase() : '',
    embed: input.embed === true,
  };
  env.holm.app.ds.insert('views', doc);
  return { view: doc.vid, counted: true };
}

// t maps slide indexes to milliseconds on screen since the last report; at is the slide now shown.
export function reportView(env, sid, vid, input) {
  const found = typeof vid === 'string' && VID.test(vid) ? sharedDeck(env, sid) : null;
  const view = found ? one(env, 'views', { vid }) : null;
  if (!view || view.did !== found.deck.did) reject(404, 'not_found', 'No such view.');
  const add = {};
  let sum = 0;
  for (const [k, v] of Object.entries(input.t && typeof input.t === 'object' ? input.t : {})) {
    const i = int(k, -1, -1, MAX_SLIDES - 1);
    const ms = int(v, 0, 0, MAX_REPORT);
    if (i < 0 || i >= view.n || !ms) continue;
    add[i] = (add[i] || 0) + ms;
    sum += ms;
  }
  mutate(env, 'views', view.id, (cur) => {
    const now = Date.now();
    const allowed = Math.min(now - cur.last + SLACK, MAX_REPORT);
    const scale = sum > allowed ? allowed / sum : 1;
    const t = cur.t.slice();
    let max = Math.max(cur.max, int(input.at, 0, 0, cur.n - 1));
    for (const [i, ms] of Object.entries(add)) {
      t[i] = (t[i] || 0) + Math.round(ms * scale);
      max = Math.max(max, Number(i));
    }
    for (let i = 0; i < t.length; i++) t[i] = t[i] || 0;
    return { $set: { t, ms: t.reduce((a, b) => a + b, 0), max, last: now } };
  });
  return { ok: true };
}

// The deck's numbers: opens, readers, time, how far people got, and slide by slide where they
// stopped. Slides are counted by position, so a reordered deck mixes old and new answers.
export function deckStats(env, ctx, did) {
  const { deck } = deckAccess(env, ctx, did, 'editor');
  const views = rows(env, 'views', { did: deck.did }, 2000).sort((a, b) => b.at - a.at);
  const head = one(env, 'revisions', { did: deck.did, n: deck.head });
  const slides = head ? head.content.slides : [];
  const opens = views.length;
  const reads = views.filter((v) => v.ms >= READ);
  const total = views.reduce((a, v) => a + (v.ms || 0), 0);
  const seconds = (ms) => Math.round(ms / 1000);
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const days = [];
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  for (let k = 29; k >= 0; k--) days.push({ date: new Date(today - k * 86400000).toISOString().slice(0, 10), opens: 0, reads: 0 });
  for (const v of views) {
    const day = days.find((d) => d.date === new Date(v.at).toISOString().slice(0, 10));
    if (day) { day.opens++; if (v.ms >= READ) day.reads++; }
  }
  return {
    deck: { id: deck.did, title: deck.title || 'Untitled deck', shared: !!deck.sid, slides: slides.length },
    totals: {
      opens,
      readers: new Set(views.map((v) => v.visitor)).size,
      reads: reads.length,
      read_to_end: pct(views.filter((v) => v.max >= v.n - 1).length, opens),
      average_seconds: reads.length ? seconds(reads.reduce((a, v) => a + v.ms, 0) / reads.length) : 0,
      total_minutes: Math.round(total / 60000),
      embedded: views.filter((v) => v.embed).length,
      last_opened: opens ? new Date(views[0].at).toISOString() : null,
    },
    slides: slides.map((s, i) => {
      const reached = views.filter((v) => v.max >= i);
      const time = reached.reduce((a, v) => a + (v.t[i] || 0), 0);
      return { n: i + 1, title: slideName(s), reached: pct(reached.length, opens), average_seconds: reached.length ? seconds(time / reached.length) : 0 };
    }),
    days,
    recent: views.slice(0, 25).map((v) => ({
      at: new Date(v.at).toISOString(), seconds: seconds(v.ms || 0), reached: Math.min(v.max + 1, v.n), of: v.n,
      device: v.device, from: v.ref || '', embedded: !!v.embed, returning: views.some((o) => o !== v && o.visitor === v.visitor && o.at < v.at),
    })),
    counted: views.length >= 2000 ? 'the latest 2,000 opens' : 'every open',
    note: 'Counts opens of the share link and embeds. Your workspace’s own people, and presenting from the studio, are not counted. A read is an open with at least ten seconds on the deck.',
  };
}
