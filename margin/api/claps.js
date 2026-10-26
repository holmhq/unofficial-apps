// Claps: anyone signed in can clap for a post, up to 50 times.
import { claim, mutate, bump, one } from './lib/store.js';
import { reject, int } from './lib/util.js';
import { postById } from './posts.js';

export const MAX_CLAPS = 50;

export function clap(env, ctx, postId, add) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in to clap.');
  const post = postById(env, postId);
  if (!post || post.status !== 'published') reject(404, 'not_found', 'No such post.');
  const wanted = int(add, 1, 1, MAX_CLAPS);
  const { doc, created } = claim(env, 'claps', { postId: post.id, memberId: ctx.member.id }, { postId: post.id, memberId: ctx.member.id, count: 0, at: Date.now() });
  let added = 0;
  const saved = mutate(env, 'claps', doc.id, (current) => {
    added = Math.max(0, Math.min(MAX_CLAPS - (current.count || 0), wanted));
    return added ? { $inc: { count: added }, $set: { at: Date.now() } } : null;
  });
  if (added) bump(env, 'posts', post.id, 'claps', added);
  if (created) bump(env, 'posts', post.id, 'clappers', 1);
  return { mine: saved.count || 0, total: (post.claps || 0) + added, max: MAX_CLAPS };
}

export function myClaps(env, ctx, postId) {
  if (!ctx.member) return 0;
  const row = one(env, 'claps', { postId, memberId: ctx.member.id });
  return row ? row.count || 0 : 0;
}
