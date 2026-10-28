// Live: whether this device is listening, and every notification as it lands.
import { h, ic, fill, flip, menu, confirm, toast, haptic, ago, dayLabel, reduced } from '../ui.js'
import { state, kindOf, soundName, KIND_ICON, go, failure } from '../shell.js'
import { inbox, on, replay, test, clear, TESTS, catchUp } from '../inbox.js'
import * as audio from '../audio.js'
import * as notify from '../notify.js'

// $0.0007, $0.012, $1.20: as many places as the amount needs.
const usd = (v) => '$' + (v < .01 ? v.toFixed(4).replace(/0+$/, '') : v < 1 ? v.toFixed(3).replace(/0+$/, '') : v.toFixed(2))

export function liveTab() {
  const title = h('h1.large-title', 'Live')
  const more = h('button.icon-btn', { type: 'button', 'aria-label': 'More', onclick: (e) => moreMenu(e.currentTarget) }, ic('ellipsis', 20, 2))
  const status = h('section.status-card')
  const feed = h('div.feed')
  const el = h('div.tab-page', h('div.title-row', title, more), status, feed)
  let timer = 0

  function moreMenu(anchor) {
    menu(anchor, [
      { label: 'Send a test', icon: 'flaskConical', onclick: () => testMenu(anchor) },
      { label: 'Connect Claude', icon: 'cable', onclick: () => go('/connect') },
      'sep',
      { label: 'Clear history', icon: 'trash2', danger: true, onclick: async () => { if (await confirm({ title: 'Clear history?', text: 'Every notification is removed, on every device. Sounds and voice settings stay.', action: 'Clear' })) { try { await clear(); toast('History cleared') } catch (e) { failure(e) } } } },
    ])
  }

  function testMenu(anchor) {
    const items = Object.entries(TESTS).map(([k, t]) => ({ label: k === 'voice' ? 'With Olivia’s voice' : kindOf(k).label, icon: k === 'voice' ? 'audioLines' : KIND_ICON[kindOf(k).icon] || 'info', onclick: () => send(k) }))
    menu(anchor, items)
  }

  async function send(kind) {
    try { await audio.arm(); await test(kind) } catch (e) { failure(e) }
  }

  function paintStatus() {
    const armed = audio.armed()
    const live = inbox.status === 'live'
    const soundsOn = audio.isOn()
    const devices = state.me.listening
    const perm = notify.permission()
    let tone = 'good', head = 'Listening on this device', sub = 'Sounds, Olivia and notifications play here when Claude calls.'
    if (!live) { tone = inbox.status === 'down' ? 'bad' : 'wait'; head = inbox.status === 'down' ? 'Reconnecting…' : 'Connecting…'; sub = 'Notifications arrive the moment the link is back.' }
    else if (!soundsOn) { tone = 'warn'; head = 'Sounds are off'; sub = 'Cards and notifications still show. Turn sounds on in the account menu.' }
    else if (!armed) { tone = 'warn'; head = 'Tap to turn sound on'; sub = 'Browsers play sound only after a tap. One is enough for the whole visit.' }
    const actions = []
    if (live && soundsOn && !armed) actions.push(h('button.btn.primary', { type: 'button', onclick: async () => { haptic(); if (await audio.arm()) { audio.play('ui_pop/soft'); catchUp() } } }, ic('volume2', 17, 2.2), 'Turn sound on'))
    if (perm === 'default') actions.push(h('button.btn', { type: 'button', onclick: async () => { const p = await notify.ask(); toast(p === 'granted' ? 'Notifications allowed' : 'Notifications stay off', { kind: p === 'granted' ? 'good' : 'info' }); paintStatus() } }, ic('bell', 17, 2.2), 'Allow notifications'))
    actions.push(h('button.btn' + (actions.length ? '' : '.tinted'), { type: 'button', onclick: (e) => testMenu(e.currentTarget) }, ic('flaskConical', 17, 2.2), 'Send a test'))
    fill(status,
      h('div.status-top',
        h('span.live-dot.big.' + tone),
        h('div.grow', h('b', head), h('p', sub)),
        devices > 1 ? h('span.chip', ic('monitor', 13, 2.2), `${devices} devices`) : null),
      h('div.status-actions', actions),
      perm === 'denied' && live ? h('p.status-note', ic('bellOff', 14, 2.2), 'Browser notifications are blocked for this site; cards and sounds still work.') : null)
  }

  function card(n) {
    const kind = kindOf(n.kind)
    const playing = inbox.playing && inbox.playing.id === n.id
    const missed = !n.heard.length && !n.fresh
    const el = h('article.note' + (n.fresh ? '.fresh' : '') + (playing ? '.playing' : ''), { 'data-key': n.id, 'data-tone': kind.tone },
      h('span.kind-ic', ic(KIND_ICON[kind.icon] || 'info', 18, 2.2)),
      h('div.note-main',
        h('div.note-head', h('b.note-title', n.title), h('span.note-time.num', { title: new Date(n.at).toLocaleString() }, ago(n.at))),
        n.body ? h('p.note-body', n.body) : null,
        n.say ? h('p.note-say', ic('audioLines', 13, 2.2), h('span', n.say)) : null,
        h('div.note-meta',
          n.project ? h('span.chip.project', n.project) : null,
          n.sound && n.sound !== 'none' ? h('span.meta-item', ic('music', 12, 2.2), soundName(n.sound)) : null,
          n.say ? speechChip(n) : null,
          n.heard.length ? h('span.meta-item', ic('checkCheck', 13, 2.2), 'heard on ' + n.heard.map((x) => x.device).join(', ')) : missed ? h('span.meta-item.missed', ic('bellOff', 12, 2.2), 'missed') : null,
          n.from === 'claude' ? h('span.meta-item', ic('sparkles', 12, 2.2), 'Claude') : null)),
      h('button.round-btn.replay', { type: 'button', 'aria-label': playing ? 'Playing' : 'Play again', onclick: async () => { haptic(); try { await replay(n) } catch (e) { failure(e) } } },
        playing ? h('span.bars', h('i'), h('i'), h('i'), h('i')) : ic('play', 16, 2.4)))
    return el
  }

  function speechChip(n) {
    const map = { queued: ['Making the voice…', 'wait'], working: ['Making the voice…', 'wait'], fetching: ['Voice ready', 'good'], ready: ['Voice ready', 'good'], failed: ['Voice failed', 'bad'] }
    const [label, tone] = map[n.speech] || ['', '']
    if (!label) return null
    return h('span.meta-item.speech.' + tone, { title: n.error || '' }, tone === 'wait' ? h('span.spin.small') : ic(tone === 'bad' ? 'circleX' : 'audioLines', 12, 2.2), label + (n.cached ? ' · free' : n.usd ? ' · ' + usd(n.usd) : ''))
  }

  function paintFeed() {
    if (!inbox.loaded) {
      fill(feed, h('div.skeleton', [1, 2, 3].map(() => h('div.sk-row', h('span'), h('span'), h('span')))))
      return
    }
    if (!inbox.notes.length) {
      fill(feed, h('div.empty', h('span.empty-icon.round-btn', ic('radio', 24, 1.8)), h('b', 'Nothing yet'),
        h('p', 'Connect Claude and ask it to tell you when it’s done. Or send yourself a test.'),
        h('div.row-actions', h('button.btn.primary', { type: 'button', onclick: () => go('/connect') }, ic('cable', 16, 2.2), 'Connect Claude'), h('button.btn', { type: 'button', onclick: (e) => testMenu(e.currentTarget) }, 'Send a test'))))
      return
    }
    const groups = []
    for (const n of inbox.notes) {
      const label = dayLabel(n.at)
      let g = groups[groups.length - 1]
      if (!g || g.label !== label) { g = { label, notes: [] }; groups.push(g) }
      g.notes.push(n)
    }
    const kids = groups.flatMap((g) => [h('div.day-head', { 'data-key': 'day:' + g.label }, h('b', g.label), h('span', `${g.notes.length}`)), ...g.notes.map(card)])
    flip(feed, () => fill(feed, kids))
  }

  function repaintOne(n) {
    const old = feed.querySelector(`[data-key="${n.id}"]`)
    if (!old) return paintFeed()
    const fresh = card(n)
    old.replaceWith(fresh)
  }

  const off = [
    on((type, detail) => {
      if (type === 'list') paintFeed()
      else if (type === 'note') repaintOne(detail)
      else if (type === 'playing') { for (const n of inbox.notes) { const el = feed.querySelector(`[data-key="${n.id}"]`); if (el) { const p = inbox.playing && inbox.playing.id === n.id; if (el.classList.contains('playing') !== p) repaintOne(n) } } }
      else if (type === 'status' || type === 'unarmed') paintStatus()
    }),
    audio.onChange(paintStatus),
  ]
  const visible = () => paintStatus()
  document.addEventListener('visibilitychange', visible)
  timer = setInterval(() => { for (const t of feed.querySelectorAll('.note-time')) { const id = t.closest('.note').dataset.key; const n = inbox.notes.find((x) => x.id === id); if (n) t.textContent = ago(n.at) } }, 30000)

  paintStatus()
  paintFeed()
  if (!reduced()) status.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
  return { el, leave() { for (const f of off) f(); clearInterval(timer); document.removeEventListener('visibilitychange', visible) } }
}
