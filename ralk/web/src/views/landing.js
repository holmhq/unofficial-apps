// Signed out: what Ralk is, three sounds to try without an account, how to connect.
import { h, ic, fill, haptic, reduced } from '../ui.js'
import { state, topBar, signIn, holmFooter, KIND_ICON } from '../shell.js'
import { mark } from '../icons.js'
import * as audio from '../audio.js'
import { PROMPTS } from './connect.js'

export function landing() {
  const cat = state.catalog
  const demo = h('div.demo-card')
  const sample = h('article.note.demo-note', { hidden: true })
  const tries = cat ? cat.kinds.slice(0, 4) : []
  const el = h('div.app.landing',
    topBar(),
    h('div.panel',
      h('section.hero',
        h('div.hero-mark', mark(34)),
        h('h1', 'Your agents, ', h('em', 'out loud.')),
        h('p.lead', 'Claude Code runs in a VM, a container or a server with no speaker. Ralk is the tab on the machine in front of you: a chime when the build finishes, Olivia’s voice when something needs you, a browser notification when you’re in another window.'),
        h('div.hero-actions',
          h('button.btn.primary.large', { type: 'button', onclick: signIn }, 'Sign in', ic('arrowRight', 18, 2.2)),
          h('span.hero-hint', 'Free. Your account is the node’s.'))),
      h('section.try',
        h('h2.section-title', 'Try the sounds'),
        h('p.section-sub', 'Made in your browser from code, no files to load.'),
        fill(demo, tries.map((k) => h('button.try-btn', { type: 'button', 'data-tone': k.tone, onclick: (e) => play(k, e.currentTarget) }, h('span.kind-ic', ic(KIND_ICON[k.icon] || 'info', 18, 2.2)), h('b', k.label), h('small', soundNameOf(k.sound))))),
        sample),
      h('section.how',
        h('h2.section-title', 'How it works'),
        h('div.how-grid',
          step('cable', 'Connect once', 'Add Ralk to Claude, Claude Code or ChatGPT as a connector. It signs in as you.'),
          step('radio', 'Keep a tab open', 'On the machine with the speaker: a laptop, a phone, the desk. Several at once is fine.'),
          step('bellRing', 'Hear what matters', 'Done, needs you, a question, a problem: a sound, a card, a notification, and a voice if Claude adds one.'))),
      h('section.asks',
        h('h2.section-title', 'Things to ask Claude'),
        h('div.group', PROMPTS.map((p) => h('div.row.prompt', h('p', p))))),
      h('section.cta',
        h('button.btn.primary.large', { type: 'button', onclick: signIn }, 'Sign in to connect Claude'),
        h('p.fine', 'A spoken line costs about a cent per thousand characters, from the node owner’s fal.ai key.')),
      holmFooter()))

  async function play(kind, btn) {
    haptic(5)
    if (!(await audio.arm())) return
    btn.classList.add('on')
    const t = { done: ['Build finished', '212 tests passed in 3.1 s. Deploying to staging.'], attention: ['Needs your approval', 'Claude wants to run: git push origin main'], question: ['Keep the old API too?', 'Removing /v1 breaks last month’s CLI.'], error: ['Build failed on main', 'TypeError in notes.js:41'] }[kind.id] || [kind.label, kind.blurb]
    fill(sample, h('span.kind-ic', { 'data-tone': kind.tone }, ic(KIND_ICON[kind.icon] || 'info', 18, 2.2)), h('div.note-main', h('div.note-head', h('b.note-title', t[0]), h('span.note-time', 'just now')), h('p.note-body', t[1]), h('div.note-meta', h('span.chip.project', 'ralk'), h('span.meta-item', ic('music', 12, 2.2), soundNameOf(kind.sound)))))
    sample.hidden = false
    sample.dataset.tone = kind.tone
    if (!reduced()) sample.animate([{ opacity: 0, transform: 'translateY(-8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
    try { await audio.play(kind.sound, { force: true, tag: kind.id }) } catch {}
    btn.classList.remove('on')
  }
  function soundNameOf(id) { const s = cat && cat.sounds.find((x) => x.id === id); return s ? s.name : id }
  function step(icon, title, text) { return h('div.how-step', h('span.round-btn.how-ic', ic(icon, 20, 2)), h('b', title), h('p', text)) }

  document.title = 'Ralk — your agents, out loud'
  return { el }
}

export function missing() {
  const el = h('div.app',
    topBar(),
    h('div.panel', h('div.tab-page', h('div.empty', h('span.empty-icon.round-btn', ic('circleHelp', 24, 1.8)), h('b', 'Nothing here'), h('p', 'That address isn’t part of Ralk.'), h('a.btn.primary', { href: '/' }, 'Go to Ralk'))), holmFooter()))
  document.title = 'Not found · Ralk'
  return { el }
}
