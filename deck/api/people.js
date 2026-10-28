// Who is asking. Accounts are the node's; Deck keeps no profile of its own. What someone may
// do comes from their membership in a workspace (workspaces.js).
import { reject } from './lib/util.js';

export function context(env) {
  const auth = env.holm.auth;
  let member = null;
  try { member = auth.isLoggedIn() ? auth.getMember() : null; } catch { member = null; }
  return { env, member: member && member.id ? member : null };
}

export function requireMember(ctx) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  return ctx;
}
