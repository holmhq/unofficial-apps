// Relay — settings: profile, appearance (theme + accent), sounds, account.

import { el, clear, avatarEl, openSheet, closeSheet, toast, holmFooter } from '../ui.js';
import { iconEl } from '../icons.js';
import { prefs, setPref, session } from '../state.js';
import { apply as applyTheme, ACCENTS, THEMES } from '../theme.js';
import { signOut } from '../auth.js';
import { api } from '../api.js';

function setting(icon, title, sub, control, wide) {
  return el('div', { class: 'setting' },
    el('div', { class: 'si' }, iconEl(icon, { size: '18px' })),
    el('div', { class: 'st' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null),
    control ? el('div', { class: 'setting-control' + (wide ? ' wide' : '') }, control) : null
  );
}

export function mount(container) {
  const view = el('div', { class: 'fade-in list' });

  // profile header
  const head = el('button', { class: 'profile-head profile-head-btn', type: 'button', onclick: () => openProfileEditor(renderProfileHead) });
  function renderProfileHead() {
    const p = session.profile || {};
    clear(head);
    [avatarEl({ picture: p.picture, username: p.username, displayName: p.displayName }, 66), el('div', { class: 'ph-name', text: p.displayName || 'Member' }), el('div', { class: 'ph-user mono', text: '@' + (p.username || '') }), el('span', { class: 'profile-edit-badge', 'aria-hidden': 'true' }, iconEl('settings', { size: '15px' }))].forEach((node) => head.appendChild(node));
  }
  renderProfileHead();
  view.appendChild(head);

  // ── appearance ──
  view.appendChild(el('div', { class: 'sec-label', text: 'Appearance' }));
  const themeSeg = el('div', { class: 'seg' });
  const themeBtns = {};
  THEMES.forEach((t) => {
    const b = el('button', {
      onclick: () => { setPref('theme', t.id); applyTheme(); syncTheme(); }
    }, iconEl(t.icon, { size: '15px' }), t.label);
    themeBtns[t.id] = b;
    themeSeg.appendChild(b);
  });
  function syncTheme() { THEMES.forEach((t) => themeBtns[t.id].setAttribute('aria-pressed', String(prefs.theme === t.id))); }

  const swatches = el('div', { class: 'swatches' });
  const swEls = {};
  ACCENTS.forEach((a) => {
    const s = el('button', {
      class: 'swatch', 'aria-label': a.label, title: a.label,
      style: { background: a.hex },
      onclick: () => { setPref('accent', a.id); applyTheme(); syncAccent(); }
    });
    swEls[a.id] = s;
    swatches.appendChild(s);
  });
  function syncAccent() { ACCENTS.forEach((a) => swEls[a.id].setAttribute('aria-checked', String(prefs.accent === a.id))); }

  const appear = el('div', { class: 'card' },
    setting('palette', 'Theme', 'Light, dark, or follow system', themeSeg, true),
    setting('palette', 'Accent', 'Color for your messages and highlights', swatches, true)
  );
  view.appendChild(appear);

  // ── sounds ──
  view.appendChild(el('div', { class: 'sec-label', text: 'Sound' }));
  const soundSwitch = el('button', { class: 'switch', role: 'switch', 'aria-checked': String(prefs.sounds),
    onclick: () => { setPref('sounds', !prefs.sounds); soundSwitch.setAttribute('aria-checked', String(prefs.sounds)); }
  });
  view.appendChild(el('div', { class: 'card' },
    setting('bell', 'Message sounds', 'Light send & receive tones', soundSwitch)
  ));

  // ── notifications ──
  view.appendChild(el('div', { class: 'sec-label', text: 'Notifications' }));
  const notifSupported = typeof Notification !== 'undefined';
  function notifOn() { return prefs.notify && notifSupported && Notification.permission === 'granted'; }
  const notifSwitch = el('button', { class: 'switch', role: 'switch', 'aria-checked': String(notifOn()) });
  function syncNotif() { notifSwitch.setAttribute('aria-checked', String(notifOn())); }
  notifSwitch.onclick = () => {
    if (!notifSupported) { toast('Notifications not supported here', 'x'); return; }
    if (notifOn()) {
      setPref('notify', false); syncNotif();            // suppress (OS permission can't be revoked here)
    } else {
      setPref('notify', true);
      if (Notification.permission === 'default') Notification.requestPermission().then(() => syncNotif());
      else syncNotif();
    }
  };
  view.appendChild(el('div', { class: 'card' },
    setting('bell', 'Message notifications', 'An alert when a message arrives while Relay is open in the background. Closed, it can’t notify you yet.', notifSwitch)
  ));

  // ── privacy ──
  view.appendChild(el('div', { class: 'sec-label', text: 'Privacy' }));
  view.appendChild(el('div', { class: 'card privacy-note' },
    el('div', { class: 'setting' },
      el('div', { class: 'si' }, iconEl('shield-check', { size: '18px' })),
      el('div', { class: 'st' },
        el('b', { text: 'Private by design' }),
        el('small', { html: 'Relay never reveals whether a username exists. Invites are sent silently — you only learn when someone accepts.' })
      )
    )
  ));

  // ── about: analytics for those Holm lets see it, feedback, and the footer ──
  const surfaces = globalThis.__HOLM_SURFACES__;
  const extras = [];
  if (surfaces && surfaces.analytics) {
    extras.push(el('a', { class: 'setting', href: surfaces.analytics, target: '_blank', rel: 'noopener' },
      el('div', { class: 'si' }, iconEl('chart-column', { size: '18px' })),
      el('div', { class: 'st' }, el('b', { text: 'Analytics' }), el('small', { text: 'Visits to Relay, for its admins' })),
      iconEl('chevron-right', { size: '18px' })));
  }
  if (globalThis.HolmFeedback) {
    extras.push(el('button', { class: 'setting', type: 'button', style: { width: '100%', textAlign: 'left' }, onclick: () => globalThis.HolmFeedback.open() },
      el('div', { class: 'si' }, iconEl('message-circle', { size: '18px' })),
      el('div', { class: 'st' }, el('b', { text: 'Send feedback' }), el('small', { text: 'What works, what doesn’t, what you’d like' })),
      iconEl('chevron-right', { size: '18px' })));
  }
  if (extras.length) {
    view.appendChild(el('div', { class: 'sec-label', text: 'About' }));
    view.appendChild(el('div', { class: 'card' }, ...extras));
  }
  // ── account ──
  view.appendChild(el('div', { class: 'sec-label', text: 'Account' }));
  view.appendChild(el('div', { class: 'card' },
    el('button', { class: 'setting', style: { width: '100%', textAlign: 'left' }, onclick: () => signOut() },
      el('div', { class: 'si danger-si' }, iconEl('log-out', { size: '18px' })),
      el('div', { class: 'st' }, el('b', { text: 'Sign out', style: { color: '#ef4444' } }))
    )
  ));

  view.appendChild(holmFooter());

  container.appendChild(view);
  syncTheme();
  syncAccent();
  return () => {};
}

function openProfileEditor(onProfileChange) {
  const initial = session.profile || {};
  let selectedFile = null;
  let previewUrl = '';
  let busy = false;

  const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const avatarWrap = el('button', { type: 'button', class: 'contact-avatar-wrap', 'aria-label': 'Choose profile photo' });
  const nameInput = el('input', {
    class: 'input',
    id: 'profile-display-name',
    maxlength: '60',
    autocomplete: 'name',
    value: initial.displayName || '',
    'aria-label': 'Display name'
  });
  const error = el('div', { class: 'row-error', role: 'alert' });
  const saveBtn = el('button', { class: 'btn block', type: 'button' }, iconEl('check', { size: '17px' }), 'Save');
  const removeBtn = el('button', { class: 'btn ghost block', type: 'button' }, iconEl('trash-2', { size: '17px' }), 'Remove photo');
  const cancelBtn = el('button', { class: 'btn ghost block', type: 'button' }, 'Cancel');

  function revokePreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; }

  function renderAvatar() {
    const p = Object.assign({}, session.profile || initial);
    if (previewUrl) p.picture = previewUrl;
    clear(avatarWrap);
    avatarWrap.appendChild(avatarEl(p, 76));
    avatarWrap.appendChild(el('span', { class: 'contact-avatar-cam', 'aria-hidden': 'true' }, iconEl('camera', { size: '15px' })));
  }

  function syncRemove() { removeBtn.style.display = String((session.profile || initial).picture || '').indexOf('/api/profile/photo/') === 0 ? '' : 'none'; }

  function setBusy(next) {
    busy = next;
    [saveBtn, removeBtn, cancelBtn, avatarWrap].forEach((btn) => { btn.disabled = next; });
    saveBtn.textContent = next ? 'Saving...' : '';
    if (!next) saveBtn.append(iconEl('check', { size: '17px' }), 'Save');
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      selectedFile = null;
      revokePreview();
      fileInput.value = '';
      renderAvatar();
      error.textContent = 'Choose an image file';
      return;
    }
    revokePreview();
    selectedFile = file;
    previewUrl = URL.createObjectURL(file);
    error.textContent = '';
    renderAvatar();
  });
  avatarWrap.addEventListener('click', () => { if (!busy) fileInput.click(); });

  saveBtn.addEventListener('click', async () => {
    if (busy) return;
    const displayName = nameInput.value.trim();
    if (!displayName || displayName.length > 60) {
      error.textContent = 'Display name must be 1-60 characters';
      return;
    }
    setBusy(true);
    error.textContent = '';
    try {
      let latest = await api.updateProfile(displayName);
      session.profile = latest.profile;
      onProfileChange();
      if (selectedFile) {
        latest = await api.setProfilePhoto(selectedFile);
        session.profile = latest.profile;
        onProfileChange();
      }
      revokePreview();
      selectedFile = null;
      closeSheet();
      toast('Profile updated', 'check');
    } catch (e) {
      error.textContent = e.message || 'Could not save profile';
    } finally {
      setBusy(false);
    }
  });

  removeBtn.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    error.textContent = '';
    try {
      const res = await api.clearProfilePhoto();
      session.profile = res.profile;
      selectedFile = null;
      fileInput.value = '';
      revokePreview();
      renderAvatar();
      syncRemove();
      onProfileChange();
      toast('Photo removed', 'check');
    } catch (e) {
      error.textContent = e.message || 'Could not remove photo';
    } finally {
      setBusy(false);
    }
  });
  cancelBtn.addEventListener('click', () => closeSheet());

  renderAvatar();
  syncRemove();
  const body = el('div', { class: 'sheet-body' },
    el('div', { class: 'contact-card' }, avatarWrap,
      el('div', { class: 'sheet-title', text: 'Edit profile' }),
      el('div', { class: 'contact-sub mono', text: '@' + (initial.username || '') })),
    fileInput,
    el('div', { class: 'field' }, el('label', { for: 'profile-display-name', text: 'Display name' }), nameInput),
    error, saveBtn, removeBtn, cancelBtn);

  const sheet = openSheet(body);
  sheet._teardown = () => revokePreview();
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => nameInput.focus(), 0);
  }
}
