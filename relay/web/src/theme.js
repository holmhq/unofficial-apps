// Relay — theme + accent management.

import { prefs } from './state.js';

export const ACCENTS = [
  { id: 'relay', label: 'Relay', hex: '#6a3fe0' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' }
];

export const THEMES = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'Auto', icon: 'monitor' }
];

function apply() {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-accent', prefs.accent);
}

let sysMql = null;
export function init() {
  apply();
  sysMql = matchMedia('(prefers-color-scheme: dark)');
  sysMql.addEventListener('change', function () {
    if (prefs.theme === 'system') apply(); // data-theme=system re-resolves via CSS
  });
}

export { apply };
