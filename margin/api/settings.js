// Margin's own settings, kept by the node's admins: who may join, what the home page is,
// which workspaces the landing page shows, and the one address links should use.
import { reject, text } from './lib/util.js';
import { touch } from './lib/store.js';

export const DEFAULTS = {
  name: 'Margin',
  tagline: 'A quiet place for your team to write',
  signups: 'open',
  home: 'landing',
  examples: [],
  primaryHost: '',
  theme: 'quiet',
};

// open: anyone signs up and starts workspaces. readers: anyone signs up to read and
// comment; new workspaces only from admins or by invite. invite: invited people only.
export const SIGNUPS = ['open', 'readers', 'invite'];

export function marginSettings(env) {
  const saved = env.holm.app.kv.get('margin:settings');
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

const HOME = /^(landing|ws:[a-z][a-z0-9_-]{0,28}[a-z0-9]|@[a-z][a-z0-9_-]{0,28}[a-z0-9])$/;

export function updateMargin(env, input) {
  const next = { ...marginSettings(env) };
  if (input.name !== undefined) next.name = text(input.name, 40, 'Name', true);
  if (input.tagline !== undefined) next.tagline = text(input.tagline, 120, 'Tagline') || '';
  if (input.signups !== undefined) {
    if (!SIGNUPS.includes(input.signups)) reject(400, 'invalid_input', 'Sign-ups are open, readers or invite.');
    next.signups = input.signups;
  }
  if (input.home !== undefined) {
    const home = String(input.home || '').trim().toLowerCase();
    if (!HOME.test(home)) reject(400, 'invalid_input', 'Home is "landing", a workspace such as "ws:lumen", or a writer such as "@maya".');
    if (home.startsWith('ws:') && !env.holm.app.ds.find('workspaces', { slug: home.slice(3) }, { limit: 1 })[0]) reject(404, 'not_found', `There is no workspace ${home.slice(3)}.`);
    if (home.startsWith('@') && !env.holm.app.ds.find('blogs', { handle: home.slice(1) }, { limit: 1 })[0]) reject(404, 'not_found', `There is no writer ${home}.`);
    next.home = home;
  }
  if (input.examples !== undefined) {
    if (!Array.isArray(input.examples) || input.examples.length > 6) reject(400, 'invalid_input', 'Examples is a list of up to 6 workspace addresses.');
    const out = [];
    for (const raw of input.examples) {
      const slug = String(raw || '').trim().toLowerCase().replace(/^\//, '');
      if (!env.holm.app.ds.find('workspaces', { slug }, { limit: 1 })[0]) reject(404, 'not_found', `There is no workspace ${slug}.`);
      if (!out.includes(slug)) out.push(slug);
    }
    next.examples = out;
  }
  if (input.primary_host !== undefined || input.primaryHost !== undefined) {
    const host = String(input.primary_host ?? input.primaryHost ?? '').trim().toLowerCase();
    if (host && !/^[a-z0-9.-]{3,200}(:\d{2,5})?$/.test(host)) reject(400, 'invalid_input', 'The primary address is a host name such as margin.example.com.');
    next.primaryHost = host;
  }
  if (input.theme !== undefined) next.theme = text(input.theme, 40, 'Theme', true);
  env.holm.app.kv.set('margin:settings', next);
  touch(env);
  return next;
}
