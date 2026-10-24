// Relay — auth: embedded Holm sign-in, session load, sign-out.

import { api } from './api.js';
import { session, resetData, emit } from './state.js';

let overlay = null;

export function loadSession() {
  session.status = 'loading';
  return api.me()
    .then((res) => {
      session.member = res.member || null;
      session.profile = res.profile || null;
      session.channel = res.channel || '';
      if (!res.loggedIn) session.status = 'signed-out';
      else if (!res.profile) session.status = 'needs-onboarding';
      else session.status = 'ready';
      session.suggestedUsername = res.suggestedUsername || '';
      emit('session', session);
      return session;
    })
    .catch((e) => {
      session.status = 'signed-out';
      session.member = null;
      session.profile = null;
      emit('session', session);
      return session;
    });
}

export function openSignIn() {
  if (overlay) return;
  document.body.classList.add('auth-open');
  const r = encodeURIComponent(location.pathname + location.search || '/');
  overlay = document.createElement('div');
  overlay.className = 'authmodal';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.innerHTML =
    '<div class="scrim" data-close></div>' +
    '<div class="authmodal__card">' +
      '<button class="authmodal__close" data-close aria-label="Close">&times;</button>' +
      '<iframe class="authmodal__frame" src="/auth/login?embed=1&dismissible=true&dismiss_to=' + r + '&redirect=' + r + '" title="Sign in to Relay"></iframe>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeSignIn)
  );
}

export function closeSignIn() {
  if (!overlay) return;
  const node = overlay;
  overlay = null;
  node.setAttribute('aria-hidden', 'true');
  const remove = () => { node.remove(); document.body.classList.remove('auth-open'); };
  // allow fade-out
  setTimeout(remove, 180);
  node.querySelector('.scrim')?.classList.add('out');
  node.querySelector('.authmodal__card')?.classList.add('out');
  setTimeout(remove, 200);
}

window.addEventListener('message', function (e) {
  if (!e.data || e.data.source !== 'holm-auth') return;
  if (e.data.type === 'dismiss') closeSignIn();
  if (e.data.type === 'signed-in') {
    closeSignIn();
    loadSession();
  }
});

export function signOut() {
  // 307 -> /auth/login is the success signal; redirect:'manual' stops fetch
  // from re-issuing it as POST /auth/login (which 400s).
  fetch('/auth/logout', { method: 'POST', credentials: 'include', redirect: 'manual' })
    .catch(function () { /* cookie cleared server-side regardless */ })
    .finally(function () {
      resetData();
      session.member = null;
      session.profile = null;
      session.status = 'signed-out';
      emit('session', session);
      location.assign('/');
    });
}

export { session };
