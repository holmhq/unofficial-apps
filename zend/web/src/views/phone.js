// Phone: connect one (or the demo phone); then how it is, which SIM sends,
// live delivery reports, today's limits, the rules and the opt-out list.

import { h, fill, ic, sheet, confirm, toast, collapsing, ago, nope, reveal, wide, haptic } from '../ui.js'
import { store, on, loadState, loadThreads } from '../store.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { sound } from '../sound.js'
import { go, accountButton } from '../main.js'
import * as api from '../api.js'

export function phone(params) {
  const page = h('div.page.fade-in')
  const panel = h('div.panel.page-wrap', page)
  const bar = h('header.bar.grouped', h('span.small-title', 'Phone'), h('span.right', accountButton()))
  collapsing(bar, panel)
  let shownDemo = false

  function draw() {
    const state = store.state
    if (!state) {
      fill(page, h('h1.large-title', 'Phone'), h('div.hero-card', h('span.shimmer', { style: { width: '64px', height: '64px', 'border-radius': '16px' } }), h('span.shimmer', { style: { width: '140px', height: '18px' } })))
      return
    }
    fill(page, h('h1.large-title', 'Phone'), ...(state.phone ? connected(state) : setup(state)))
    if (location.hash === '#rules') requestAnimationFrame(() => reveal(page.querySelector('#rules'), panel))
    if (params.demo && !state.phone && !shownDemo) { shownDemo = true; setTimeout(() => demo(state), 350) }
  }

  const off = on((event) => { if (event.type === 'state') draw() })
  draw()
  loadState().catch(() => {})
  return { el: h('div', { style: { display: 'contents' } }, bar, panel), destroy: off, update: (p) => { params = p; draw() } }
}

/* ---- Not connected yet ----------------------------------------------------------- */

function setup(state) {
  const user = h('input.input.mono', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'From the app’s Home tab', 'aria-label': 'Username' })
  const pass = h('input.input.mono', { type: 'password', autocomplete: 'off', placeholder: 'Required', 'aria-label': 'Password' })
  const key = h('input.input.mono', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Optional', 'aria-label': 'Signing key' })
  const agree = h('input', { type: 'checkbox', 'aria-label': 'I agree' })
  const connect = h('button.btn.primary.large.block', { type: 'submit', disabled: !state.vault }, 'Connect phone')
  const form = h('form.section', { onsubmit: submit },
    h('div.section-head', h('h2', 'Your Android phone')),
    h('div.group',
      h('ol.steps',
        h('li', h('b', 'Install SMS Gateway for Android'), h('p', 'A free, open-source app from ', h('a', { href: 'https://sms-gate.app', target: '_blank', rel: 'noopener' }, 'sms-gate.app'), '. Texts still go out on your own SIM and plan.')),
        h('li', h('b', 'Turn on Cloud server'), h('p', 'Open the app, switch on Cloud server and tap Offline so it reads Online.')),
        h('li', h('b', 'Paste its username and password'), h('p', 'They’re on the app’s Home tab. Zend keeps them encrypted and never shows them again.')))),
    h('div.group', { style: { 'margin-top': '14px' } },
      h('div.item.field-row', h('label', 'Username'), user),
      h('div.item.field-row', h('label', 'Password'), pass),
      h('div.item.field-row', h('label', 'Signing key'), key)),
    h('p.section-foot', 'The signing key is in Settings → Webhooks. With it, deliveries and replies arrive the moment they happen.'),
    h('div.group', { style: { 'margin-top': '14px' } }, h('label.agree', agree, h('span', state.declaration))),
    h('div', { style: { 'margin-top': '14px' } }, connect),
    state.vault ? null : h('p.section-foot', { style: { color: 'var(--red-text)' } }, 'This server can’t keep a phone’s password safely yet: its operator needs to give Zend a vault key. The demo phone works meanwhile.'))

  async function submit(event) {
    event.preventDefault()
    if (!user.value.trim() || !pass.value.trim()) { sound.error(); nope(form.querySelectorAll('.group')[1]); toast('Paste the username and password from the app.', { kind: 'bad' }); return }
    if (!agree.checked) { sound.error(); nope(agree.closest('.group')); toast('Tick the promise to send only personal texts.', { kind: 'bad' }); return }
    connect.classList.add('busy')
    fill(connect, h('span.spin'), 'Checking with SMSGate…')
    try {
      await api.post('/api/phone', { username: user.value, password: pass.value, signingKey: key.value, declare: true })
      if (key.value.trim()) {
        try { await api.post('/api/phone/live') } catch (error) { toast(error.message, { kind: 'info', ms: 7000 }) }
      }
      sound.delivered()
      haptic(16)
      toast('Phone connected')
      await loadState()
      loadThreads().catch(() => {})
    } catch (error) {
      sound.error()
      toast(error.message, { kind: 'bad', ms: 8000 })
    } finally {
      connect.classList.remove('busy')
      fill(connect, 'Connect phone')
    }
  }

  return [
    h('div.hero-card',
      h('span.phone-icon.off', ic('phone', 32, 1.8)),
      h('b', 'Connect your phone'),
      h('p.muted', { style: { margin: '2px 0 0', 'max-width': '34ch', 'font-size': '15px', 'line-height': '1.5' } }, 'Zend sends texts through the Android phone you already have. People see your number, and their replies come back here.')),
    h('div.section',
      h('div.section-head', h('h2', 'Try it first')),
      h('div.group.icons', h('button.item', { type: 'button', onclick: () => demo(state) },
        h('span.sq.blue', ic('sparkles', 17, 2)),
        h('span.t', 'Use a demo phone', h('small', 'It pretends to send, deliver and reply. Nothing leaves Zend.')),
        ic('next', 18, 2)))),
    form
  ]
}

async function demo(state) {
  const agree = h('input', { type: 'checkbox', 'aria-label': 'I agree' })
  const ok = await sheet({
    title: 'Demo phone',
    done: 'Connect',
    onDone: (close) => {
      if (!agree.checked) { sound.error(); nope(agree.closest('.group')); return }
      close(true)
    },
    body: () => [
      h('div', { style: { display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '8px', 'text-align': 'center' } },
        h('span.phone-icon.demo', { style: { width: '64px', height: '64px', 'border-radius': '16px', display: 'grid', 'place-items': 'center', color: '#fff', background: 'linear-gradient(180deg, var(--out-hi), var(--accent))' } }, ic('sparkles', 30, 1.8)),
        h('p.muted', { style: { margin: '6px 0 0', 'font-size': '15px', 'line-height': '1.5' } }, 'Texts get sent and delivered, and some people reply. Numbers ending in 0000 fail; ones ending in 9999 reply STOP.')),
      h('div.section', h('div.section-head', h('h2', 'The same promise as a real phone')), h('div.group', h('label.agree', agree, h('span', state.declaration))))
    ]
  })
  if (!ok) return
  try {
    await api.post('/api/phone/demo', { declare: true })
    sound.delivered()
    haptic(16)
    toast('Demo phone connected')
    await loadState()
    loadThreads().catch(() => {})
    go('/new')
  } catch (error) {
    toast(error.message, { kind: 'bad' })
  }
}

/* ---- Connected -------------------------------------------------------------------- */

function connected(state) {
  const p = state.phone
  const isDemo = p.kind === 'demo'
  const online = isDemo || (p.lastSeen && Date.now() - p.lastSeen < 20 * 60000)
  const check = isDemo ? null : h('button.btn.small.tinted', { type: 'button', onclick: async () => {
    check.classList.add('busy')
    try { await api.post('/api/phone/check'); await loadState(); toast(online ? 'Your phone is online' : 'Checked with SMSGate', { kind: 'info' }) } catch (error) { toast(error.message, { kind: 'bad' }) } finally { check.classList.remove('busy') }
  } }, ic('refresh', 15, 2.2), 'Check now')

  const hero = h('div.hero-card',
    h('span.phone-icon' + (isDemo ? '.demo' : online ? '' : '.off'), ic(isDemo ? 'sparkles' : 'phone', 32, 1.8)),
    h('b', p.name),
    h('small', h('span.dot' + (isDemo ? '.demo' : online ? '.on' : '.warn')),
      isDemo ? 'Demo phone · nothing is really sent' : online ? `Online · seen ${ago(p.lastSeen)}` : `Last seen ${ago(p.lastSeen)} · open SMS Gateway on the phone`),
    p.username ? h('small', `SMSGate account ${p.username} · connected ${ago(p.connectedAt)}`) : null,
    check)

  const sims = p.sims && p.sims.length ? h('div.section',
    h('div.section-head', h('h2', 'Send texts from')),
    h('div.group', { role: 'radiogroup', 'aria-label': 'SIM' }, [{ slot: null }, ...p.sims].map(s => h('button.item', {
      type: 'button', role: 'radio', 'aria-checked': String((p.defaultSim || null) === s.slot),
      onclick: async () => {
        haptic(5)
        try { await api.patch('/api/phone', { defaultSim: s.slot }); await loadState() } catch (error) { toast(error.message, { kind: 'bad' }) }
      }
    },
    h('span.t', s.slot ? `SIM ${s.slot}${s.carrier ? ` · ${s.carrier}` : ''}` : 'Phone’s default', s.slot ? (s.number ? h('small.num', formatPhone(normalizePhone(s.number) || s.number)) : null) : h('small', 'Whichever SIM the phone uses for texts')),
    ic('check', 20, 2.4))))) : null
  if (sims) for (const b of sims.querySelectorAll('[role="radio"]')) b.lastChild.classList.add('check-mark')

  let live = null
  if (!isDemo) {
    live = h('div.section',
      h('div.section-head', h('h2', 'Delivery reports')),
      h('div.group', h('button.item', { type: 'button', role: 'switch', 'aria-checked': String(p.live), onclick: () => (p.live ? relink() : turnOn()) },
        h('span.t', 'Live receipts', h('small', p.live ? 'Your phone tells Zend the moment a text is delivered or a reply comes in.' : 'Off: Zend asks your phone for news while it’s open.')),
        h('span.switch'))),
      p.live ? h('p.section-foot', h('button.link', { type: 'button', onclick: turnOn }, 'Register again'), ' if receipts stop arriving.') : null)
  }

  async function turnOn() {
    if (!p.signingKey) {
      const input = h('input.input.mono', { type: 'text', placeholder: 'Signing key', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Signing key', autofocus: true })
      const value = await sheet({
        title: 'Live receipts',
        done: 'Turn on',
        onDone: (close) => (input.value.trim() ? close(input.value.trim()) : (sound.error(), nope(input))),
        body: () => [h('p.muted', { style: { margin: '0 4px', 'font-size': '15px', 'line-height': '1.5' } }, 'In SMS Gateway, open Settings → Webhooks and copy the Signing Key. Zend uses it to check every report really came from your phone.'), h('div.group', input)]
      })
      if (!value) return
      try { await api.patch('/api/phone', { signingKey: value }) } catch (error) { toast(error.message, { kind: 'bad' }); return }
    }
    try {
      await api.post('/api/phone/live')
      sound.delivered()
      toast('Live receipts are on')
    } catch (error) {
      toast(error.message, { kind: 'bad', ms: 8000 })
    }
    loadState().catch(() => {})
  }

  async function relink() {
    if (!await confirm({ title: 'Turn off live receipts?', text: 'Zend forgets the signing key and asks your phone for news only while it’s open.', action: 'Turn off', danger: false })) return
    try { await api.patch('/api/phone', { signingKey: '' }); await loadState() } catch (error) { toast(error.message, { kind: 'bad' }) }
  }

  const u = state.usage
  const l = state.limits
  const meter = (name, used, max) => h('div.meter', h('div.top', h('span', name), h('span.num.muted', `${used} of ${max}`)),
    h('div.bar-track' + (used / max > .8 ? '.hot' : ''), h('i', { style: { '--v': '0' } })))
  const meters = h('div.group', meter('Texts', u.texts, l.perDay), meter('Different people', u.people, l.people))
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const values = [u.texts / l.perDay, u.people / l.people]
    meters.querySelectorAll('.bar-track i').forEach((i, k) => i.style.setProperty('--v', Math.min(1, values[k])))
  }))

  const rules = h('div.section', { id: 'rules' },
    h('div.section-head', h('h2', 'Rules for texting')),
    h('div.group.icons',
      rule('blue', 'shield', 'Personal texts only', 'Offers, OTPs and alerts from a business need a registered sender in India. Zend asks before sending anything that reads like one; the API refuses it.'),
      rule('orange', 'chats', `At most ${l.similar[0].max} of the same text a day`, `Or ${l.similar[1].max} in a week and ${l.similar[2].max} in a month: more counts as bulk.`),
      rule('indigo', 'user', `${l.perText} people a text, ${l.people} a day`, `And ${l.perDay} texts a day, ${l.perMinute} a minute. Numbers that text many people and hear back from few get flagged.`),
      rule('red', 'ban', 'STOP means stop', 'A reply of STOP puts the number on your opt-out list. START takes it off.')),
    h('p.section-foot', 'These are guardrails, not legal advice. You remain responsible for what you send.'))

  const optList = h('div.group')
  const add = h('input.input', { type: 'text', inputmode: 'tel', placeholder: 'Add a number', autocomplete: 'off', 'aria-label': 'Number to stop texting' })
  const addForm = h('form', { style: { display: 'flex', gap: '8px', 'margin-top': '10px' }, onsubmit: async (event) => {
    event.preventDefault()
    const n = normalizePhone(add.value)
    if (!n) { sound.error(); nope(add); return }
    try { await api.post('/api/optouts', { number: n }); add.value = ''; drawOptouts(); loadThreads().catch(() => {}); toast(`${formatPhone(n)} won’t get your texts`) } catch (error) { toast(error.message, { kind: 'bad' }) }
  } }, add, h('button.btn.tinted', { type: 'submit' }, 'Add'))
  async function drawOptouts() {
    try {
      const { optouts } = await api.get('/api/optouts')
      fill(optList, optouts.length
        ? optouts.map(o => h('div.item', h('span.t', h('span.num', nameOf(o.number)), h('small', o.reason === 'reply' ? `Replied STOP ${ago(o.at)}` : `Added by you ${ago(o.at)}`)),
          h('button.btn.small.plain', { type: 'button', onclick: async () => {
            if (!await confirm({ title: 'Text this number again?', text: `Only if ${nameOf(o.number)} asked to hear from you again.`, action: 'Allow texts', danger: false })) return
            try { await api.del(`/api/optouts/${encodeURIComponent(o.number)}`); drawOptouts(); loadThreads().catch(() => {}) } catch (error) { toast(error.message, { kind: 'bad' }) }
          } }, 'Allow')))
        : h('div.item', h('span.t.muted', 'Nobody has asked you to stop.')))
    } catch (error) {
      fill(optList, h('div.item.muted', error.message))
    }
  }
  drawOptouts()

  return [
    hero,
    sims,
    live,
    h('div.section', h('div.section-head', h('h2', 'Last 24 hours')), meters,
      h('p.section-foot', `Zend stops before a personal SIM looks like a bulk sender.`)),
    rules,
    h('div.section', h('div.section-head', h('h2', 'Opted out')), optList, addForm),
    h('div.section',
      h('div.group',
        h('button.item.danger.center', { type: 'button', onclick: disconnect }, 'Disconnect phone'),
        h('button.item.danger.center', { type: 'button', onclick: wipe }, 'Delete everything Zend keeps for you')),
      h('p.section-foot', 'Disconnecting forgets the phone’s sign-in and keeps your conversations.'))
  ]
}

function rule(color, icon, title, text) {
  return h('div.item', { style: { 'align-items': 'flex-start' } }, h('span.sq.' + color, { style: { 'margin-top': '1px' } }, ic(icon, 16, 2.2)), h('span.t', h('span', { style: { 'font-weight': '600', 'font-size': '15.5px' } }, title), h('small', text)))
}

const nameOf = (n) => { const t = (store.threads || []).find(x => x.number === n); return t && t.name ? `${t.name} · ${formatPhone(n)}` : formatPhone(n) }

async function disconnect() {
  if (!await confirm({ title: 'Disconnect this phone?', text: 'Zend forgets its sign-in and stops its live receipts. Your conversations, templates and keys stay.', action: 'Disconnect' })) return
  try {
    await api.del('/api/phone')
    toast('Phone disconnected')
    await loadState()
  } catch (error) {
    toast(error.message, { kind: 'bad' })
  }
}

async function wipe() {
  if (!await confirm({ title: 'Delete everything?', text: 'Every conversation, template, API key and opt-out Zend keeps for you, and the phone’s sign-in. This can’t be undone.', action: 'Delete everything' })) return
  try {
    await api.del('/api/account')
    store.open.clear()
    toast('Everything is deleted')
    await Promise.all([loadState(), loadThreads()])
    go('/')
  } catch (error) {
    toast(error.message, { kind: 'bad' })
  }
}

export { wide }
