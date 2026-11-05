// Relay — auth: embedded Holm sign-in, session load, sign-out.

import { api } from './api.js';
import { session, resetData, emit, kept, data } from './state.js';

let overlay = null;

// Holm writes the addresses of its own pages for this app, analytics among them, into the
// page it serves to the people allowed to see them. The copy of the page the service worker
// keeps may be from before sign-in, so an admin's browser reads them from a fresh copy (the
// worker lets a no-store request through) and puts them where the page looks for them.
let surfacesAsked = false;
function freshSurfaces() {
  if (surfacesAsked) return;
  surfacesAsked = true;
  fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((page) => {
    const m = /__HOLM_SURFACES__\s*=\s*(\{[^}]*\})/.exec(page);
    globalThis.__HOLM_SURFACES__ = m ? JSON.parse(m[1]) : undefined;
  }).catch(() => { surfacesAsked = false; });
}

// A signed-in launch draws at once from what this browser last saw; the server's answer
// redraws the page only if it says something else (signed out, or someone else).
export function loadSession() {
  const cached = kept.get('me');
  const fromCache = session.status === 'loading' && !!(cached && cached.member && cached.profile);
  if (fromCache) {
    Object.assign(session, { member: cached.member, profile: cached.profile, channel: cached.channel || '', mcp: cached.mcp || '', admin: !!cached.admin, status: 'ready' });
    data.conversations = kept.get('conversations') || [];
    emit('session', session);
  }
  return api.me()
    .then((res) => {
      const status = !res.loggedIn ? 'signed-out' : !res.profile ? 'needs-onboarding' : 'ready';
      const same = status === 'ready' && session.status === 'ready' && session.member && res.member &&
        session.member.id === res.member.id && session.channel === (res.channel || '');
      session.member = res.member || null;
      session.profile = res.profile || null;
      session.channel = res.channel || '';
      session.mcp = res.mcp || '';
      session.admin = !!res.admin;
      if (session.admin) freshSurfaces();
      session.suggestedUsername = res.suggestedUsername || '';
      session.status = status;
      kept.set('me', status === 'ready' ? { member: session.member, profile: session.profile, channel: session.channel, mcp: session.mcp, admin: session.admin } : null);
      if (status !== 'ready') kept.set('conversations', null);
      // The kept session was stale (signed out, or someone else): start clean from the server's.
      if (fromCache && !same) { location.reload(); return session; }
      emit(same ? 'profile' : 'session', session);
      return session;
    })
    .catch(() => {
      // Offline with a kept session: stay on it rather than showing the sign-in screen.
      if (session.status === 'ready') return session;
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
