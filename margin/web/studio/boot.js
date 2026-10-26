// Apply the saved appearance before the first paint.
try { var t = localStorage.getItem('margin.theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* private mode */ }
