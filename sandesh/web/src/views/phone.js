// Phone: connect one (or the demo phone), then see how it is, pick a SIM,
// turn on live receipts, watch today's limits and keep the opt-out list.

import { h, ic, toast, confirm, ago, fill, reveal } from '../dom.js'
import * as api from '../api.js'
import { store, on, loadState, loadThreads } from '../store.js'
import { normalizePhone, formatPhone } from '../sms.js'
import { go, footer } from '../app.js'

export function phone(params) {
  const page = h('div.page')
  const el = h('div.panel', page)

  function draw() {
    const state = store.state
    if (!state) {
      fill(page, h('div.loading', h('div.spinner')))
      return
    }
    fill(page, ...(state.phone ? connected(state) : connectFlow(state, params)), rules(), footer('phone-only'))
  }

  const off = on((event) => { if (event.type === 'state') draw() })
  draw()
  return { el, destroy: off, update: (p) => { params = p; draw() } }
}

/* ---- Connecting ------------------------------------------------------ */

function connectFlow(state, params) {
  const username = h('input.input.mono', { autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'XXXXXX' })
  const password = h('input.input.mono', { type: 'password', autocomplete: 'off', placeholder: '••••••••••' })
  const signingKey = h('input.input.mono', { autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Optional' })
  const declare = h('input', { type: 'checkbox' })
  const declareDemo = h('input', { type: 'checkbox' })
  const connect = h('button.btn.primary', { type: 'submit' }, ic('smartphone', 18), 'Connect phone')

  const form = h('form.box.stack', { onsubmit: submit },
    h('ol.steps',
      h('li', h('h3', 'Install SMS Gateway for Android'),
        h('p', 'A free, open-source app that lets your phone send texts for you. Your texts still go out on your own SIM and plan.'),
        h('p', { style: { marginTop: '10px' } }, h('a.btn.small', { href: 'https://sms-gate.app', target: '_blank', rel: 'noopener' }, 'Get it from sms-gate.app'))),
      h('li', h('h3', 'Turn on Cloud server'),
        h('p', 'Open the app, switch on Cloud server, then tap Offline so it reads Online. Let Android keep it running in the background.')),
      h('li', h('h3', 'Paste its username and password'),
        h('p', 'They’re on the app’s Home tab, under Cloud server.'),
        h('div.stack', { style: { marginTop: '12px' } },
          h('label.field', h('span', 'Username'), username),
          h('label.field', h('span', 'Password'), password))),
      h('li', h('h3', 'For live receipts (optional)'),
        h('p', 'In the app: Settings, Webhooks, Signing Key. With it, delivery reports and replies arrive the moment they happen; without it, Sandesh asks for news while it’s open.'),
        h('div', { style: { marginTop: '12px' } }, h('label.field', h('span', 'Signing key'), signingKey)))),
    h('label.check', declare, h('span', state.declaration)),
    h('div.inline', connect),
    h('p.faint', 'Your password and signing key are kept encrypted on this server and are never shown again, not even to you.'))

  async function submit(event) {
    event.preventDefault()
    if (!declare.checked) {
      toast('Tick the box to confirm you’ll send only personal texts.', { error: true })
      return
    }
    connect.disabled = true
    connect.lastChild.textContent = 'Checking with SMSGate…'
    try {
      await api.post('/api/phone', { username: username.value, password: password.value, signingKey: signingKey.value, declare: true })
      if (signingKey.value.trim()) {
        try { await api.post('/api/phone/live') } catch (error) { toast(error.message, { error: true, ms: 7000 }) }
      }
      toast('Phone connected')
      await loadState()
      loadThreads().catch(() => {})
      go('/new')
    } catch (error) {
      toast(error.message, { error: true, ms: 8000 })
    } finally {
      connect.disabled = false
      connect.lastChild.textContent = 'Connect phone'
    }
  }

  async function demo() {
    if (!declareDemo.checked) {
      toast('Tick the box first: it’s the same promise you’d make for a real phone.', { error: true })
      return
    }
    try {
      await api.post('/api/phone/demo', { declare: true })
      toast('Demo phone connected')
      await loadState()
      loadThreads().catch(() => {})
      go('/new')
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  const demoBox = h('div.box.stack', { id: 'demo' },
    h('h3', 'No phone handy? Try the demo phone'),
    h('p.muted', 'It pretends to send, so you can try everything: texts get sent and delivered, some people reply, and numbers ending in 0000 fail. Nothing leaves Sandesh. Connect a real phone whenever you like.'),
    h('label.check', declareDemo, h('span', state.declaration)),
    h('div.inline', h('button.btn', { type: 'button', onclick: demo }, ic('sparkles', 18), 'Use the demo phone')))

  const vault = state.vault ? null : h('div.notice', h('b', 'This server can’t keep a phone’s password yet.'),
    h('span', 'Its operator needs to give Sandesh a vault key first. The demo phone works meanwhile.'))

  const parts = [
    h('div.page-head', h('h2', 'Connect your phone')),
    h('p.lede', 'Sandesh sends texts through the Android phone you already have. People see your own number, and replies come back here.'),
    vault,
    params && params.demo ? demoBox : form,
    params && params.demo ? form : demoBox
  ]
  if (params && params.demo) requestAnimationFrame(() => reveal(demoBox))
  return parts
}

/* ---- Connected ------------------------------------------------------- */

function connected(state) {
  const p = state.phone
  const demo = p.kind === 'demo'
  const online = demo || (p.lastSeen && Date.now() - p.lastSeen < 20 * 60000)
  const checkBtn = demo ? null : h('button.btn.small', { type: 'button', onclick: check }, ic('refreshCw', 16), 'Check now')

  async function check() {
    checkBtn.disabled = true
    try {
      await api.post('/api/phone/check')
      await loadState()
    } catch (error) {
      toast(error.message, { error: true, ms: 7000 })
    } finally {
      checkBtn.disabled = false
    }
  }

  const status = h('div.box.stack',
    h('div.spread',
      h('div.inline',
        h('span.icon-btn', { style: { background: demo ? 'var(--violet-soft)' : 'var(--rule-2)', color: demo ? 'var(--violet)' : 'var(--ink)' } }, ic(demo ? 'sparkles' : 'smartphone')),
        h('div', h('h3', p.name), h('p.muted', { style: { fontSize: '15px' } },
          h('span.dot' + (demo ? '.demo' : online ? '.on' : ''), { style: { display: 'inline-block', marginRight: '6px' } }),
          demo ? 'Demo: nothing is really sent' : online ? `Online, seen ${ago(p.lastSeen)}` : `Last seen ${ago(p.lastSeen)}. Open SMS Gateway on the phone.`))),
      checkBtn),
    p.username ? h('p.faint', `SMSGate account ${p.username}, connected ${ago(p.connectedAt)}`) : null)

  const sims = p.sims && p.sims.length ? h('div.section',
    h('h3', 'SIM'),
    h('ul.list', [{ slot: null }, ...p.sims].map(s => h('li.tap', { onclick: () => setSim(s.slot) },
      h('input', { type: 'radio', name: 'sim', checked: (p.defaultSim || null) === s.slot, style: { width: '20px', height: '20px', accentColor: 'var(--red)' }, 'aria-label': s.slot ? `SIM ${s.slot}` : 'Phone’s choice' }),
      h('div.grow', h('b', s.slot ? `SIM ${s.slot}${s.carrier ? ` (${s.carrier})` : ''}` : 'Let the phone choose'),
        s.number ? h('div.sub', formatPhone(normalizePhone(s.number) || s.number)) : s.slot ? null : h('div.sub', 'Its default SIM for texts')))))) : null

  async function setSim(slot) {
    try {
      await api.patch('/api/phone', { defaultSim: slot })
      await loadState()
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  let live = null
  if (!demo) {
    const key = h('input.input.mono', { autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Signing key from the app' })
    const turnOn = async () => {
      try {
        if (key.value.trim()) await api.patch('/api/phone', { signingKey: key.value })
        await api.post('/api/phone/live')
        toast('Live receipts are on')
        await loadState()
      } catch (error) {
        toast(error.message, { error: true, ms: 8000 })
      }
    }
    live = h('div.section', h('h3', 'Live receipts'),
      p.live
        ? h('div.box.stack', h('p', ic('zap', 18), ' On. Your phone reports each delivery and reply the moment it happens, signed with its key.'),
          h('div.inline', h('button.btn.small', { type: 'button', onclick: turnOn }, ic('refreshCw', 16), 'Register again')))
        : h('div.box.stack',
          h('p.muted', 'Off: Sandesh asks your phone for news while this page is open. To hear the moment a text is delivered or someone replies, paste the signing key from SMS Gateway (Settings, Webhooks, Signing Key).'),
          p.signingKey ? null : h('label.field', h('span', 'Signing key'), key),
          h('div.inline', h('button.btn.primary', { type: 'button', onclick: turnOn }, ic('zap', 18), 'Turn on live receipts'))))
  }

  const u = state.usage
  const l = state.limits
  const meter = (name, used, max) => h('div.meter-row',
    h('div.spread', h('span', name), h('span.num.muted', `${used} of ${max}`)),
    h('div.bar' + (used / max > 0.8 ? '.hot' : ''), h('i', { style: { '--v': Math.min(1, used / max) } })))
  const limits = h('div.section', h('h3', 'Last 24 hours'),
    h('div.box.meters',
      meter('Texts', u.texts, l.perDay),
      meter('Different people', u.people, l.people),
      h('p.faint', `Same or similar text: at most ${l.similar[0].max} in 24 hours, ${l.similar[1].max} in 7 days, ${l.similar[2].max} in 30. Up to ${l.perText} numbers in one text, ${l.perMinute} texts a minute.`)))

  const optList = h('div', h('div.skeleton'))
  const add = h('input.input', { inputMode: 'tel', placeholder: 'Add a number', autocomplete: 'off' })
  const optouts = h('div.section', h('h3', 'Opt-outs'),
    h('p.muted', { style: { marginBottom: '12px' } }, 'People who replied STOP, or whom you added. Sandesh won’t text them; a reply of START takes them off.'),
    optList,
    h('form.inline', { style: { marginTop: '12px' }, onsubmit: addOptout }, h('div', { style: { flex: '1', minWidth: '200px' } }, add), h('button.btn', { type: 'submit' }, ic('userX', 18), 'Add')))

  async function loadOptouts() {
    try {
      const { optouts: list } = await api.get('/api/optouts')
      fill(optList, list.length
        ? h('ul.list', list.map(o => h('li',
          h('div.grow', h('b', formatPhone(o.number)), h('div.sub', o.reason === 'reply' ? `Replied STOP ${ago(Date.parse(o.at))}` : `Added by you ${ago(Date.parse(o.at))}`)),
          h('button.btn.small.quiet', { type: 'button', onclick: () => removeOptout(o.number) }, 'Remove'))))
        : h('p.faint', 'Nobody yet.'))
    } catch (error) {
      fill(optList, h('p.muted', error.message))
    }
  }
  async function addOptout(event) {
    event.preventDefault()
    if (!normalizePhone(add.value)) {
      toast('That isn’t a phone number.', { error: true })
      return
    }
    try {
      await api.post('/api/optouts', { number: add.value })
      add.value = ''
      loadOptouts()
      loadThreads().catch(() => {})
    } catch (error) {
      toast(error.message, { error: true })
    }
  }
  async function removeOptout(number) {
    if (!await confirm('Text this number again?', `Only if ${formatPhone(number)} asked to hear from you again.`, { action: 'Remove opt-out' })) return
    try {
      await api.del(`/api/optouts/${encodeURIComponent(number)}`)
      loadOptouts()
      loadThreads().catch(() => {})
    } catch (error) {
      toast(error.message, { error: true })
    }
  }
  loadOptouts()

  async function disconnect() {
    if (!await confirm('Disconnect this phone?', 'Sandesh forgets its sign-in and stops its live receipts. Your conversations, templates and keys stay.', { action: 'Disconnect' })) return
    try {
      await api.del('/api/phone')
      toast('Phone disconnected')
      await loadState()
    } catch (error) {
      toast(error.message, { error: true })
    }
  }
  async function wipe() {
    if (!await confirm('Delete everything?', 'Your phone’s sign-in, every conversation, template, opt-out and API key go from Sandesh for good. Texts already on phones stay.', { action: 'Delete everything' })) return
    try {
      await api.del('/api/account')
      toast('Everything deleted')
      await loadState()
      loadThreads().catch(() => {})
      go('/phone')
    } catch (error) {
      toast(error.message, { error: true })
    }
  }

  return [
    h('div.page-head', h('h2', 'Phone')),
    status,
    sims,
    live,
    limits,
    optouts,
    h('div.section', h('h3', 'Leaving'),
      h('div.inline',
        h('button.btn', { type: 'button', onclick: disconnect }, ic('power', 18), 'Disconnect phone'),
        h('button.btn.danger', { type: 'button', onclick: wipe }, ic('trash2', 18), 'Delete everything')))
  ]
}

/* ---- India's rules --------------------------------------------------- */

export function rules() {
  return h('div.section', { id: 'rules', style: { marginTop: '28px' } },
    h('h3', 'What your own SIM may send in India'),
    h('div.rules',
      h('div.box.yes', h('h3', ic('check'), 'Fine from your phone'),
        h('ul', h('li', 'Your own texts to people you know'), h('li', 'Replies and conversations'),
          h('li', 'Reminders to yourself or family from your scripts'), h('li', 'A text to a few people at once (up to 10)'))),
      h('div.box.no', h('h3', ic('ban'), 'Needs a DLT-registered sender'),
        h('ul', h('li', 'Offers, sales and other marketing'), h('li', 'OTPs, alerts and reminders from a business or app'),
          h('li', 'The same text to many people: more than 20 similar in a day is “bulk”'), h('li', 'Selling your SIM as an SMS route')))),
    h('p.cite', 'From TRAI’s Telecom Commercial Communications Customer Preference Regulations, 2018 and their 2025 and 2026 amendments. ',
      'A number that sends unsolicited business texts can have every SIM in its owner’s name barred for 15 days, then be blacklisted for a year if it happens again. ',
      h('a', { href: 'https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf', target: '_blank', rel: 'noopener' }, 'TCCCPR 2018'), ', ',
      h('a', { href: 'https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf', target: '_blank', rel: 'noopener' }, 'Third Amendment, 2026')))
}
