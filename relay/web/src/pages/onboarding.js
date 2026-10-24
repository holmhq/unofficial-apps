// Relay — onboarding: claim a username.

import { el } from '../ui.js';
import { iconEl } from '../icons.js';
import { api } from '../api.js';
import { session } from '../state.js';
import { loadSession } from '../auth.js';
import { play } from '../sound.js';

export function mount(container) {
  const card = el('div', { class: 'center fade-in' });

  const input = el('input', {
    class: 'input', type: 'text', inputmode: 'latin', autocapitalize: 'none',
    autocomplete: 'username', spellcheck: 'false', maxlength: '24',
    placeholder: session.suggestedUsername || 'yourname', value: session.suggestedUsername || ''
  });

  let busy = false;
  const btn = el('button', { class: 'btn block', onclick: submit }, iconEl('arrow-up', { size: '18px' }), 'Continue');

  function submit() {
    if (busy) return;
    const username = String(input.value || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      err.textContent = 'Use 3–24 letters, numbers, or underscores.';
      err.classList.add('row-error');
      input.focus();
      return;
    }
    busy = true;
    btn.disabled = true;
    err.textContent = '';
    api.claimProfile(username)
      .then(() => { play('send'); return loadSession(); })
      .catch((e) => {
        busy = false;
        btn.disabled = false;
        err.textContent = (e && e.data && e.data.error) || (e && e.message) || 'Could not claim username';
        err.classList.add('row-error');
      });
  }

  const err = el('div');

  card.appendChild(el('img', { class: 'crest', src: '/favicon.svg', alt: 'Relay', width: '84', height: '84' }));
  card.appendChild(el('h1', { text: 'Pick your username' }));
  card.appendChild(el('p', { text: 'Others reach you on Relay by this username. You can connect with anyone — privately.' }));
  const form = el('div', { class: 'form' });
  const wrap = el('div', { class: 'input-wrap' });
  wrap.appendChild(el('span', { class: 'input-prefix', text: '@' }));
  wrap.appendChild(input);
  form.appendChild(wrap);
  form.appendChild(err);
  form.appendChild(btn);
  form.appendChild(el('p', { class: 'hint', text: 'Lowercase letters, numbers, and underscores. 3–24 characters.' }));
  card.appendChild(form);

  container.appendChild(card);
  setTimeout(() => input.focus(), 60);

  const onKey = (e) => { if (e.key === 'Enter') submit(); };
  input.addEventListener('keydown', onKey);

  return () => input.removeEventListener('keydown', onKey);
}
