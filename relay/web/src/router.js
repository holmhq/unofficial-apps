// Relay — History API routing (clean URLs on Holm's --spa fallback).
// navigate() pushes a path and re-runs the router via a synthetic popstate,
// so a single 'popstate' listener in main.js handles both nav and back.

export function navigate(path) {
  if (location.pathname === path) return;
  try { history.pushState({}, '', path); } catch (_e) { return; }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function back() {
  try { history.back(); } catch (_e) { location.assign('/'); }
}

export function current() { return location.pathname || '/'; }

// Canonical chat path for a room: /chat/@username (DM) or /chat/group/<slug>
// (group with a settable handle), falling back to the opaque /chat/<roomId>.
export function chatPath(room) {
  if (!room || !room.id) return '/';
  if (room.type === 'group') return room.slug ? '/chat/group/' + encodeURIComponent(room.slug) : '/chat/' + encodeURIComponent(room.id);
  return room.username ? '/chat/@' + encodeURIComponent(room.username) : '/chat/' + encodeURIComponent(room.id);
}
