// Workspaces: a team's home at /<slug>, with its own theme, home page, comment rules and
// cover style. Membership (`members`) ties an account to a workspace with a role (owner,
// admin, writer) and the names it writes under there. Only a workspace's owners and admins
// see which names belong to which member; readers never do.
import { one, rows, mutate, touch } from './lib/store.js';
import { reject, text, longText, slugify } from './lib/util.js';
import { HANDLE, handle, claimHandle, blogByHandle, blogDTO, avatarURL, swatch } from './blogs.js';
import { personByMember } from './people.js';
import { marginSettings } from './settings.js';
import { LOOKS, TONES } from './covers.js';

export const ROLES = ['owner', 'admin', 'writer'];
export const MODERATION = ['off', 'outsiders', 'all'];
export const HOMES = ['latest', 'curated'];
const MAX_OWNED = 5;

export const WS_DEFAULTS = {
  tagline: '', description: '', logo: null, theme: 'quiet', themeSettings: {}, home: 'latest', featured: [],
  moderation: 'outsiders', nav: [], cover: { look: 'paper', tone: 'lilac' }, suspended: false,
};

export function wsView(doc) {
  return { ...WS_DEFAULTS, ...doc, cover: { ...WS_DEFAULTS.cover, ...(doc.cover || {}) } };
}

export function workspaceBySlug(env, slug) {
  if (!slug || !HANDLE.test(slug)) return null;
  const doc = one(env, 'workspaces', { slug });
  return doc ? wsView(doc) : null;
}

export function allWorkspaces(env) { return rows(env, 'workspaces', {}, 2000).map(wsView); }

export function logoURL(ws) { return ws.logo ? `/media/${ws.logo}` : null; }

export function wsDTO(ws) {
  return {
    slug: ws.slug, name: ws.name, tagline: ws.tagline || '', description: ws.description || '',
    url: `/${ws.slug}`, logo: logoURL(ws), initial: (ws.name || '?').trim().charAt(0).toUpperCase(), color: swatch(ws.slug),
  };
}

export function membershipOf(env, slug, account) {
  if (!slug || !account) return null;
  return one(env, 'members', { ws: slug, account });
}

// Put a workspace on the request: membership, role and what the person may do there.
export function useWorkspace(env, ctx, ws) {
  ctx.ws = ws || null;
  ctx.membership = ws && ctx.member ? membershipOf(env, ws.slug, ctx.member.id) : null;
  ctx.wsRole = ctx.membership ? ctx.membership.role : null;
  ctx.writer = !!ctx.membership;
  ctx.wsAdmin = !!ws && (ctx.admin || ctx.wsRole === 'owner' || ctx.wsRole === 'admin');
  return ctx;
}

// A role in some other workspace, for checks on a post that may not be the current one.
export function roleIn(env, ctx, slug) {
  if (!ctx.member || !slug) return null;
  if (ctx.ws && ctx.ws.slug === slug) return ctx.wsRole;
  const key = 'role:' + slug;
  if (!ctx.cache.has(key)) { const m = membershipOf(env, slug, ctx.member.id); ctx.cache.set(key, m ? m.role : null); }
  return ctx.cache.get(key);
}

// Every name that counts as the team in a workspace: its members' names and its own voice.
export function teamHandles(env, ctx, slug) {
  const key = 'team:' + slug;
  if (ctx && ctx.cache.has(key)) return ctx.cache.get(key);
  const set = new Set([slug]);
  for (const m of rows(env, 'members', { ws: slug }, 2000)) for (const h of m.identities || []) set.add(h);
  if (ctx) ctx.cache.set(key, set);
  return set;
}

export function addIdentity(env, slug, account, value) {
  const m = membershipOf(env, slug, account);
  if (!m || (m.identities || []).includes(value)) return;
  mutate(env, 'members', m.id, (cur) => ((cur.identities || []).includes(value) ? null : { $set: { identities: [...(cur.identities || []), value] } }));
}

export function addMember(env, slug, account, role, identities) {
  const existing = membershipOf(env, slug, account);
  if (existing) {
    const keep = ROLES.indexOf(existing.role) <= ROLES.indexOf(role) ? existing.role : role;
    const ids = [...new Set([...(existing.identities || []), ...identities])];
    env.holm.app.ds.update('members', { id: existing.id }, { $set: { role: keep, identities: ids } });
    return { ...existing, role: keep, identities: ids };
  }
  const doc = { ws: slug, account, role, identities: [...new Set(identities)], joinedAt: Date.now() };
  doc.id = env.holm.app.ds.insert('members', doc);
  return doc;
}

export function canCreateWorkspace(env, ctx) {
  if (!ctx.member) return false;
  if (ctx.admin) return true;
  return marginSettings(env).signups === 'open';
}

export function createWorkspace(env, ctx, input) {
  if (!ctx.member) reject(401, 'unauthorized', 'Sign in first.');
  if (!ctx.person || !ctx.person.handle) reject(409, 'needs_handle', 'Pick your name on Margin first.');
  if (!canCreateWorkspace(env, ctx)) reject(403, 'closed', "New workspaces need one of Margin's admins here.");
  if (!ctx.admin) {
    const owned = rows(env, 'members', { account: ctx.member.id, role: 'owner' }, 50).length;
    if (owned >= MAX_OWNED) reject(409, 'too_many', `You can own ${MAX_OWNED} workspaces.`);
  }
  const name = text(input.name, 60, 'Name', true);
  const slug = handle(input.slug || slugify(name, 30), 'An address');
  const tagline = text(input.tagline, 120, 'Tagline') || '';
  const cover = cleanCover(input.cover) || { look: 'paper', tone: Object.keys(TONES)[Math.floor(Math.random() * Object.keys(TONES).length)] };
  claimHandle(env, slug, { kind: 'workspace', ws: slug, ownerId: null, name, bio: tagline, avatar: null, picture: '' });
  const doc = { ...WS_DEFAULTS, slug, name, tagline, cover, createdBy: ctx.member.id, createdAt: Date.now() };
  env.holm.app.ds.insert('workspaces', doc);
  addMember(env, slug, ctx.member.id, 'owner', [ctx.person.handle]);
  touch(env);
  return workspaceBySlug(env, slug);
}

function cleanCover(value) {
  if (!value || typeof value !== 'object') return null;
  const look = LOOKS.includes(value.look) ? value.look : 'paper';
  const tone = TONES[value.tone] ? value.tone : 'lilac';
  return { look, tone };
}

export function updateWorkspace(env, ctx, input) {
  const ws = ctx.ws;
  if (!ws) reject(400, 'invalid_input', 'Say which workspace.');
  if (!ctx.wsAdmin) reject(403, 'forbidden', `Only ${ws.name}'s owners and admins change its settings.`);
  const set = {};
  if (input.name !== undefined) set.name = text(input.name, 60, 'Name', true);
  if (input.tagline !== undefined) set.tagline = text(input.tagline, 120, 'Tagline') || '';
  if (input.description !== undefined) set.description = longText(input.description, 300, 'Description') || '';
  if (input.logo !== undefined) set.logo = input.logo ? text(input.logo, 40, 'Logo') : null;
  if (input.home !== undefined) {
    const home = String(input.home || '').trim().toLowerCase();
    if (!HOMES.includes(home) && !/^@[a-z][a-z0-9_-]{0,28}[a-z0-9]$/.test(home)) reject(400, 'invalid_input', 'Home is latest, curated or a writer here such as "@maya".');
    if (home.startsWith('@') && !teamHandles(env, ctx, ws.slug).has(home.slice(1))) reject(404, 'not_found', `${home} doesn't write in ${ws.name}.`);
    set.home = home;
  }
  if (input.featured !== undefined) {
    if (!Array.isArray(input.featured) || input.featured.length > 12) reject(400, 'invalid_input', 'Featured is a list of up to 12 post ids.');
    const ids = [];
    for (const id of input.featured) {
      const post = typeof id === 'string' ? env.holm.app.ds.findOne('posts', id) : null;
      if (!post || post.ws !== ws.slug) reject(404, 'not_found', 'A featured post is not in this workspace.');
      if (!ids.includes(id)) ids.push(id);
    }
    set.featured = ids;
  }
  if (input.moderation !== undefined) {
    if (!MODERATION.includes(input.moderation)) reject(400, 'invalid_input', 'Moderation is off, outsiders or all.');
    set.moderation = input.moderation;
  }
  if (input.nav !== undefined) {
    if (!Array.isArray(input.nav) || input.nav.length > 8) reject(400, 'invalid_input', 'Navigation is a list of up to 8 links.');
    set.nav = input.nav.map((item) => ({ label: text(item && item.label, 30, 'Link label', true), url: text(item && item.url, 300, 'Link address', true) }));
  }
  if (input.theme !== undefined) set.theme = text(input.theme, 40, 'Theme', true);
  if (input.themeSettings !== undefined) set.themeSettings = input.themeSettings;
  if (input.cover !== undefined) set.cover = cleanCover(input.cover) || ws.cover;
  const doc = one(env, 'workspaces', { slug: ws.slug });
  mutate(env, 'workspaces', doc.id, () => ({ $set: set }));
  const voice = blogByHandle(env, ws.slug);
  if (voice && (set.name || set.logo !== undefined || set.tagline !== undefined)) {
    const change = {};
    if (set.name) change.name = set.name;
    if (set.logo !== undefined) change.avatar = set.logo;
    if (set.tagline !== undefined) change.bio = set.tagline;
    env.holm.app.ds.update('blogs', { id: voice.id }, { $set: change });
  }
  touch(env);
  const next = workspaceBySlug(env, ws.slug);
  ctx.ws = next;
  return next;
}

export function setSuspended(env, ctx, slug, suspended) {
  if (!ctx.admin) reject(403, 'forbidden', "Only Margin's admins suspend workspaces.");
  const doc = one(env, 'workspaces', { slug });
  if (!doc) reject(404, 'not_found', 'No such workspace.');
  env.holm.app.ds.update('workspaces', { id: doc.id }, { $set: { suspended: !!suspended } });
  touch(env);
  return wsView({ ...doc, suspended: !!suspended });
}

// The workspaces an account belongs to, with its role and names there.
export function myWorkspaces(env, ctx) {
  if (!ctx.member) return [];
  return rows(env, 'members', { account: ctx.member.id }, 200).map((m) => {
    const ws = workspaceBySlug(env, m.ws);
    if (!ws) return null;
    return { ...wsDTO(ws), role: m.role, identities: m.identities || [], suspended: !!ws.suspended, joined_at: new Date(m.joinedAt || 0).toISOString() };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

// Owners and admins see who is on the team and which names each writes under here.
export function teamList(env, ctx) {
  if (!ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins see the team.');
  return rows(env, 'members', { ws: ctx.ws.slug }, 2000).map((m) => {
    const person = personByMember(env, m.account);
    const names = (m.identities || []).map((h) => blogByHandle(env, h)).filter(Boolean).map((b) => ({ handle: b.handle, name: b.name, avatar: avatarURL(b) }));
    return {
      account: m.account, role: m.role, name: person ? person.name : (names[0] && names[0].name) || 'Member',
      picture: person ? person.picture : (names[0] && names[0].avatar) || '', email: person ? person.email || '' : '',
      names, you: !!(ctx.member && m.account === ctx.member.id), joined_at: new Date(m.joinedAt || 0).toISOString(),
    };
  }).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
}

export function setRole(env, ctx, account, role) {
  if (!ctx.wsAdmin) reject(403, 'forbidden', 'Only owners and admins change roles.');
  if (!ROLES.includes(role) && role !== 'remove') reject(400, 'invalid_input', 'Role is owner, admin, writer or remove.');
  const m = membershipOf(env, ctx.ws.slug, account);
  if (!m) reject(404, 'not_found', 'No such member.');
  const isOwner = ctx.admin || ctx.wsRole === 'owner';
  if ((role === 'owner' || m.role === 'owner') && !isOwner) reject(403, 'forbidden', 'Only owners add or remove owners.');
  if (m.role === 'owner' && role !== 'owner') {
    const owners = rows(env, 'members', { ws: ctx.ws.slug, role: 'owner' }, 50);
    if (owners.length <= 1) reject(409, 'last_owner', 'A workspace needs at least one owner. Make someone else an owner first.');
  }
  if (role === 'remove') {
    env.holm.app.ds.delete('members', { id: m.id });
    touch(env);
    return { removed: true };
  }
  env.holm.app.ds.update('members', { id: m.id }, { $set: { role } });
  touch(env);
  return { account, role };
}

export function leave(env, ctx) {
  if (!ctx.membership) reject(404, 'not_found', `You're not on ${ctx.ws ? ctx.ws.name : 'that workspace'}.`);
  if (ctx.wsRole === 'owner' && rows(env, 'members', { ws: ctx.ws.slug, role: 'owner' }, 50).length <= 1) reject(409, 'last_owner', 'Make someone else an owner before you leave.');
  env.holm.app.ds.delete('members', { id: ctx.membership.id });
  touch(env);
  return { left: true };
}

export { blogDTO };
