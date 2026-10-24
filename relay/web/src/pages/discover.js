// Relay — discover: add someone by username (privacy-first).

import { el, toast } from '../ui.js';
import { iconEl } from '../icons.js';
import { api } from '../api.js';
import { play } from '../sound.js';
import { navigate, chatPath } from '../router.js';

const CONFIRM = (u) => 'Invite will be sent to @' + u + ' if they’re on Relay.';

export function mount(container) {
  const view = el('div', { class: 'fade-in' });
  const wrap = el('div', { class: 'discover' });

  wrap.appendChild(el('div', { class: 'discover-hero' },
    el('div', { class: 'discover-icon' }, iconEl('shield-check', { size: '26px' })),
    el('h2', { text: 'Connect privately' }),
    el('p', { text: 'Add someone by their username. Relay never reveals whether they’re here — if they are, your invite arrives silently.' })
  ));

  const input = el('input', {
    class: 'input', type: 'text', inputmode: 'latin', autocapitalize: 'none',
    autocomplete: 'off', spellcheck: 'false', maxlength: '24', placeholder: 'username'
  });
  const prefixWrap = el('div', { class: 'input-wrap' },
    el('span', { class: 'input-prefix', text: '@' }), input);
  const btn = el('button', { class: 'btn block', onclick: submit },
    iconEl('send', { size: '18px' }), 'Send invite');
  const status = el('div', { class: 'discover-status' });

  function submit() {
    const u = String(input.value || '').trim().toLowerCase().replace(/^@/, '');
    if (!u) { input.focus(); return; }
    btn.disabled = true;
    status.textContent = '';
    api.sendInvite(u)
      .then((res) => {
        play('send');
        input.value = '';
        status.textContent = (res && res.message) || CONFIRM(u);
        status.classList.add('ok');
        toast('Invite queued', 'check');
      })
      .catch(() => {
        // Privacy: even on failure, respond identically — never reveal state.
        status.textContent = CONFIRM(u);
        status.classList.add('ok');
      })
      .finally(() => { btn.disabled = false; });
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  wrap.appendChild(prefixWrap);
  wrap.appendChild(btn);
  wrap.appendChild(status);
  wrap.appendChild(el('p', { class: 'hint', html: 'They’ll appear in <b>Friends</b> once they accept. You won’t know if they decline — that’s by design.' }));

  // ── invite by email (someone not on Relay yet) ──────────────────────────
  const emailInput = el('input', {
    class: 'input', type: 'email', inputmode: 'email', autocapitalize: 'none',
    autocomplete: 'off', spellcheck: 'false', maxlength: '254', placeholder: 'friend@example.com'
  });
  const noteInput = el('input', {
    class: 'input', type: 'text', maxlength: '280', autocomplete: 'off',
    placeholder: 'Add a note (optional)'
  });
  const emailBtn = el('button', { class: 'btn block', onclick: submitEmail },
    iconEl('mail', { size: '18px' }), 'Email invite');
  const emailStatus = el('div', { class: 'discover-status' });

  function submitEmail() {
    const email = String(emailInput.value || '').trim();
    if (!email) { emailInput.focus(); return; }
    emailBtn.disabled = true;
    emailStatus.textContent = '';
    emailStatus.classList.remove('ok', 'err');
    api.sendEmailInvite(email, String(noteInput.value || '').trim() || undefined)
      .then((res) => {
        play('send');
        emailInput.value = ''; noteInput.value = '';
        emailStatus.textContent = (res && res.message) || 'Invitation emailed.';
        emailStatus.classList.add('ok');
        toast('Invite emailed', 'check');
      })
      .catch((e) => {
        // Real, actionable errors (bad address, rate limit, send failure) — show them.
        emailStatus.textContent = (e && e.data && e.data.error) || 'Could not send the invite. Please try again.';
        emailStatus.classList.add('err');
      })
      .finally(() => { emailBtn.disabled = false; });
  }
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') noteInput.focus(); });
  noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitEmail(); });

  wrap.appendChild(el('div', { class: 'email-invite' },
    el('div', { class: 'discover-icon gc-icon' }, iconEl('mail', { size: '26px' })),
    el('h2', { text: 'Invite by email' }),
    el('p', { class: 'gc-sub', text: 'Not on Relay yet? Email them a one-time join link. They connect to you the moment they sign up and accept.' }),
    emailInput,
    noteInput,
    emailBtn,
    emailStatus
  ));

  // ── start a group ──────────────────────────────────────────────────────
  const grpName = el('input', { class: 'input', type: 'text', maxlength: '80', placeholder: 'Group name', autocomplete: 'off' });
  const grpSlug = el('input', { class: 'input mono', type: 'text', inputmode: 'latin', autocapitalize: 'none',
    autocomplete: 'off', spellcheck: 'false', maxlength: '30', placeholder: 'handle (optional) e.g. stanford_cs_2026' });
  function createGroup() {
    const name = String(grpName.value || '').trim();
    if (!name) { grpName.focus(); return; }
    const slug = String(grpSlug.value || '').trim().toLowerCase().replace(/^@/, '');
    api.createGroup(name, slug || undefined)
      .then((res) => {
        play('send');
        if (res && res.slugError) toast('Group created — handle unavailable (set it later in group info)', 'alert-triangle');
        else toast('Group created — invite members next', 'check');
        if (res && res.room) navigate(chatPath(res.room));
      })
      .catch(() => toast('Could not create group', 'x'));
  }
  grpName.addEventListener('keydown', (e) => { if (e.key === 'Enter') createGroup(); });
  grpSlug.addEventListener('keydown', (e) => { if (e.key === 'Enter') createGroup(); });
  wrap.appendChild(el('div', { class: 'group-create' },
    el('div', { class: 'discover-icon gc-icon' }, iconEl('users', { size: '26px' })),
    el('h2', { text: 'Start a group' }),
    el('p', { class: 'gc-sub', text: 'Name it, then invite members by username. They join only once they accept — members see each other.' }),
    grpName,
    grpSlug,
    el('button', { class: 'btn block', onclick: createGroup }, iconEl('users', { size: '18px' }), 'Create group')
  ));

  view.appendChild(wrap);
  container.appendChild(view);
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => input.focus(), 80);
  }
  return () => {};
}
