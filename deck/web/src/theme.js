// Theme before first paint: ?theme=light|dark wins, then the choice saved in the app's
// account menu, then the system.
(function () {
  var root = document.documentElement;
  var forced = new URLSearchParams(location.search).get('theme');
  var saved = null;
  try { saved = localStorage.getItem('deck.theme'); } catch (e) { /* private mode */ }
  if (forced === 'light' || forced === 'dark') { root.dataset.theme = forced; root.dataset.forced = forced; }
  else if (saved === 'light' || saved === 'dark') { root.dataset.theme = saved; root.dataset.forced = saved; }
  else root.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();
