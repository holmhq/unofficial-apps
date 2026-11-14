// Where a workspace's pages live. When Margin's front page is a workspace, that workspace is
// the whole site: its addresses drop the /<workspace> prefix (/<post>, /latest, /@maya/<post>)
// and the prefixed ones redirect. Holm loads Margin's modules afresh for every request, so
// http.js and the operations set this once per request from Margin's settings.

let root = '';

export function useRoot(env) {
  const saved = env.holm.app.kv.get('margin:settings');
  const home = saved && typeof saved.home === 'string' ? saved.home : '';
  root = home.startsWith('ws:') ? home.slice(3) : '';
  return root;
}

export function setRoot(slug) { root = slug || ''; }
export function rootSlug() { return root; }

// wsPath('lumen') is '/lumen', wsPath('lumen', 'latest') '/lumen/latest'; for the root
// workspace, '/' and '/latest'.
export function wsPath(slug, rest = '') {
  if (slug && slug === root) return rest ? `/${rest}` : '/';
  return rest ? `/${slug}/${rest}` : `/${slug}`;
}
