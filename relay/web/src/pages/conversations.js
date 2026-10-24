// Relay — conversations list (home).

import { el, clear, avatarEl, relTime } from '../ui.js';
import { iconEl } from '../icons.js';
import { api } from '../api.js';
import { data, on } from '../state.js';
import { navigate, chatPath } from '../router.js';

export function mount(container) {
  const view = el('div', { class: 'fade-in conversation-view' });
  const searchInput = el('input', {
    class: 'input', type: 'search', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Search chats', 'aria-label': 'Search chats'
  });
  const searchWrap = el('div', { class: 'conversation-search input-wrap' },
    iconEl('search', { cls: 'input-prefix', size: '17px' }), searchInput);
  const list = el('div', { class: 'list' });
  view.append(searchWrap, list);
  container.appendChild(view);

  function row(c) {
    return el('button', { class: 'row', onclick: () => navigate(chatPath(c)) },
      avatarEl({ picture: c.picture, avatar: c.avatar, username: c.username, displayName: c.title }, 50),
        el('div', { class: 'body' },
          el('div', { class: 'top' },
            el('div', { class: 'name', text: c.title }),
            c.unread > 0 ? el('span', { class: 'badge', text: String(c.unread) }) : null,
            el('div', { class: 'time', text: relTime(c.lastAt) })
          ),
        el('div', { class: 'preview', text: c.lastPreview || 'Tap to chat' })
      )
    );
  }

  function emptyState() {
    return el('div', { class: 'empty' },
      iconEl('message-circle'),
      el('h3', { text: 'No conversations yet' }),
      el('p', { text: 'Add someone by their username to start a private chat.' }),
      el('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => navigate('/discover') },
        iconEl('user-plus', { size: '18px' }), 'Add someone')
    );
  }

  function render() {
    clear(list);
    const convs = data.conversations;
    searchWrap.hidden = !convs.length;
    if (!convs.length) { list.appendChild(emptyState()); return; }

    const query = searchInput.value.trim().toLowerCase();
    const filtered = query
      ? convs.filter((c) => [c.title, c.realTitle, c.alias, c.username]
        .some((value) => String(value || '').toLowerCase().includes(query)))
      : convs;
    if (!filtered.length) {
      list.appendChild(el('div', { class: 'empty mini' },
        iconEl('search'), el('p', { text: 'No chats match' })));
      return;
    }
    filtered.forEach((c) => list.appendChild(row(c)));
  }

  searchInput.addEventListener('input', render);
  const off = on('conversations', render);
  api.conversations()
    .then((res) => { data.conversations = (res && res.conversations) || []; render(); })
    .catch(() => render());

  render();
  return () => off();
}
