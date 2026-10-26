// Site settings: one KV document, read once per request.
import { reject, text, longText } from './lib/util.js';
import { touch } from './lib/store.js';

export const DEFAULTS = {
  name: 'Margin',
  tagline: 'Writing from our team',
  description: 'Notes, essays and updates from our team.',
  home: 'landing',
  theme: 'quiet',
  themeSettings: {},
  moderation: 'outsiders',
  logo: null,
  nav: [],
};

export function siteSettings(env) {
  const saved = env.holm.app.kv.get('settings');
  return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

export const MODERATION = ['off', 'outsiders', 'all'];

export function updateSettings(env, input) {
  const current = siteSettings(env);
  const next = { ...current };
  if (input.name !== undefined) next.name = text(input.name, 60, 'Site name', true);
  if (input.tagline !== undefined) next.tagline = text(input.tagline, 120, 'Tagline') || '';
  if (input.description !== undefined) next.description = longText(input.description, 300, 'Description') || '';
  if (input.home !== undefined) {
    const home = String(input.home || '').trim().toLowerCase();
    if (home !== 'landing' && !/^@[a-z0-9_-]{2,30}$/.test(home)) reject(400, 'invalid_input', 'Home is "landing" or a blog such as "@team".');
    if (home !== 'landing') {
      const blog = env.holm.app.ds.find('blogs', { handle: home.slice(1) }, { limit: 1 })[0];
      if (!blog) reject(404, 'not_found', `There is no blog ${home}.`);
    }
    next.home = home;
  }
  if (input.moderation !== undefined) {
    if (!MODERATION.includes(input.moderation)) reject(400, 'invalid_input', 'Moderation is off, outsiders or all.');
    next.moderation = input.moderation;
  }
  if (input.logo !== undefined) next.logo = input.logo ? text(input.logo, 40, 'Logo') : null;
  if (input.nav !== undefined) {
    if (!Array.isArray(input.nav) || input.nav.length > 8) reject(400, 'invalid_input', 'Navigation is a list of up to 8 links.');
    next.nav = input.nav.map((item) => ({
      label: text(item && item.label, 30, 'Link label', true),
      url: text(item && item.url, 300, 'Link address', true),
    }));
  }
  if (input.theme !== undefined) next.theme = text(input.theme, 40, 'Theme', true);
  if (input.themeSettings !== undefined) next.themeSettings = input.themeSettings;
  env.holm.app.kv.set('settings', next);
  touch(env);
  return next;
}

export function homeHandle(settings) {
  return settings.home && settings.home.startsWith('@') ? settings.home.slice(1) : null;
}
