// Relay — app state + tiny event bus + persisted prefs.

const LS = { theme: 'relay-theme', accent: 'relay-accent', sounds: 'relay-sounds', notify: 'relay-notify' };

const subs = {};
export function on(evt, cb) {
  (subs[evt] = subs[evt] || []).push(cb);
  return () => { subs[evt] = (subs[evt] || []).filter((f) => f !== cb); };
}
export function emit(evt, payload) {
  (subs[evt] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error('[relay]', e); } });
}

// Indigo was the default accent before Relay had its own colour; it now reads as Relay.
function savedAccent() {
  const value = localStorage.getItem(LS.accent);
  return value && value !== 'indigo' ? value : 'relay';
}

export const prefs = {
  theme: localStorage.getItem(LS.theme) || 'system',
  accent: savedAccent(),
  sounds: localStorage.getItem(LS.sounds) !== 'off',
  notify: localStorage.getItem(LS.notify) !== 'off'
};

export function setPref(key, value) {
  prefs[key] = value;
  if (key === 'theme') localStorage.setItem(LS.theme, value);
  else if (key === 'accent') localStorage.setItem(LS.accent, value);
  else if (key === 'sounds') localStorage.setItem(LS.sounds, value ? 'on' : 'off');
  else if (key === 'notify') localStorage.setItem(LS.notify, value ? 'on' : 'off');
  emit('prefs', prefs);
}

// session: 'loading' | 'signed-out' | 'needs-onboarding' | 'ready'
export const session = { status: 'loading', member: null, profile: null };

// Shared by conversation fetches and reads so stale responses cannot restore badges.
export const conversationSync = { generation: 0, applied: 0, reads: {} };

export const data = {
  conversations: [],
  incoming: [],
  outbox: [],
  messages: {},      // roomId -> Message[]
  typing: {}         // roomId -> Set<memberId>
};

export function resetData() {
  conversationSync.generation++;
  conversationSync.reads = {};
  data.conversations = [];
  data.incoming = [];
  data.outbox = [];
  data.messages = {};
  data.typing = {};
}
