// Relay — friends: incoming invitations + sent invites.

import { el, clear, avatarEl, relTime, toast } from '../ui.js';
import { iconEl } from '../icons.js';
import { api } from '../api.js';
import { data, on, emit } from '../state.js';
import { play } from '../sound.js';
import { navigate, chatPath } from '../router.js';

export function mount(container) {
  const view = el('div', { class: 'fade-in' });
  const list = el('div', { class: 'list' });
  view.appendChild(list);
  container.appendChild(view);

  function incomingRow(inv) {
    const isGroup = !!inv.groupRoomId;
    const sub = isGroup
      ? ('@' + inv.fromUsername + ' invited you to join')
      : (inv.note ? ('“' + inv.note + '”') : ('@' + inv.fromUsername + ' wants to connect'));
    return el('div', { class: 'invite' },
      avatarEl({ picture: inv.fromPicture, username: inv.fromUsername, displayName: inv.fromDisplayName }, 46),
      el('div', { class: 'body' },
        el('div', { class: 'name', text: isGroup ? (inv.groupName || 'Group') : (inv.fromDisplayName || ('@' + inv.fromUsername)) }),
        el('div', { class: 'preview', text: sub })
      ),
      el('div', { class: 'invite-actions' },
        el('button', { class: 'btn sm', 'aria-label': 'Accept', title: 'Accept', onclick: () => accept(inv) }, iconEl('check', { size: '16px' })),
        el('button', { class: 'ibtn', 'aria-label': 'Decline', title: 'Decline', onclick: () => decline(inv) }, iconEl('x', { size: '18px' })),
        el('button', { class: 'ibtn danger', 'aria-label': 'Block sender', title: 'Block', onclick: () => block(inv) }, iconEl('ban', { size: '17px' }))
      )
    );
  }

  function sentRow(inv) {
    const accepted = inv.status === 'accepted';
    const isEmail = inv.channel === 'email';
    const label = isEmail ? (inv.toEmail || 'Email invite') : ('@' + inv.toUsername);
    return el('div', { class: 'invite' },
      isEmail
        ? el('div', { class: 'avatar email-mark' }, iconEl('mail', { size: '20px' }))
        : avatarEl({ username: inv.toUsername }, 46),
      el('div', { class: 'body' },
        el('div', { class: 'name', text: label }),
        el('div', { class: 'preview', text: accepted ? 'Accepted' : (isEmail ? 'Invite emailed · Pending' : 'Pending') })
      ),
      accepted
        ? el('button', { class: 'ibtn', 'aria-label': 'Open chat', onclick: () => { if (inv.roomId || inv.toUsername) navigate(chatPath({ type: 'dm', username: inv.toUsername, id: inv.roomId })); } }, iconEl('chevron-right'))
        : el('div', { class: 'pill muted', text: 'Pending' })
    );
  }

  function friendRow(c) {
    return el('button', { class: 'row', onclick: () => navigate(chatPath(c)) },
      avatarEl({ picture: c.picture, avatar: c.avatar, username: c.username, displayName: c.title }, 50),
      el('div', { class: 'body' },
        el('div', { class: 'top' },
          el('div', { class: 'name', text: c.title }),
          el('div', { class: 'time', text: relTime(c.lastAt) })
        ),
        el('div', { class: 'preview', text: c.lastPreview || 'Tap to chat' })
      )
    );
  }

  function accept(inv) {
    api.acceptInvite(inv.id)
      .then((res) => {
        play('send');
        toast('Connected', 'check');
        data.incoming = data.incoming.filter((x) => x.id !== inv.id);
        emit('invites');
        if (res && res.room) {
          navigate(chatPath(res.room));
        }
      })
      .catch((e) => toast((e && e.data && e.data.error) || 'Could not accept', 'x'));
  }
  function decline(inv) {
    api.declineInvite(inv.id)
      .then(() => { data.incoming = data.incoming.filter((x) => x.id !== inv.id); emit('invites'); })
      .catch(() => toast('Could not decline', 'x'));
  }
  function block(inv) {
    api.blockInvite(inv.id)
      .then(() => {
        toast('Blocked — they can’t invite you again', 'ban');
        data.incoming = data.incoming.filter((x) => x.id !== inv.id);
        emit('invites');
      })
      .catch(() => toast('Could not block', 'x'));
  }

  function render() {
    clear(list);

    // Connected friends + groups (DM rooms and group rooms), alphabetical.
    const all = (data.conversations || []).slice().sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || '')));
    const friends = all.filter((c) => c.type !== 'group');
    const groups = all.filter((c) => c.type === 'group');
    list.appendChild(el('div', { class: 'sec-label', text: 'Friends' }));
    if (!friends.length) {
      list.appendChild(el('div', { class: 'empty mini' }, iconEl('users'), el('p', { text: 'No connections yet — invite someone from Add.' })));
    } else {
      friends.forEach((c) => list.appendChild(friendRow(c)));
    }
    if (groups.length) {
      list.appendChild(el('div', { class: 'sec-label', text: 'Groups' }));
      groups.forEach((c) => list.appendChild(friendRow(c)));
    }

    // Pending invitations.
    const inc = data.incoming;
    list.appendChild(el('div', { class: 'sec-label', text: 'Invitations' }));
    if (!inc.length) {
      list.appendChild(el('div', { class: 'empty mini' }, iconEl('user-plus'), el('p', { text: 'No pending invitations.' })));
    } else {
      inc.forEach((inv) => list.appendChild(incomingRow(inv)));
    }

    // Sent invitations.
    const sent = data.outbox;
    list.appendChild(el('div', { class: 'sec-label', text: 'Sent' }));
    if (!sent.length) {
      list.appendChild(el('div', { class: 'empty mini' }, iconEl('send'), el('p', { text: 'Invite someone from Add.' })));
    } else {
      sent.forEach((inv) => list.appendChild(sentRow(inv)));
    }
  }

  const offInv = on('invites', render);
  const offConv = on('conversations', render);
  Promise.all([api.incoming(), api.outbox(), api.conversations()])
    .then(([inc, sent, conv]) => {
      data.incoming = (inc && inc.invites) || [];
      data.outbox = (sent && sent.invites) || [];
      data.conversations = (conv && conv.conversations) || [];
      render();
    })
    .catch(() => render());

  render();
  return () => { offInv(); offConv(); };
}
