// Connect: the address Claude, Claude Code and ChatGPT use, and what to ask for.
import { h, ic, copyText, haptic } from '../ui.js'
import { state } from '../shell.js'
import * as audio from '../audio.js'

export const PROMPTS = [
  'I’m stepping away. Use Ralk to tell me when you need an approval, and say it out loud when the deploy is done.',
  'Run the whole test suite. When it finishes, send a Ralk notification with the result, kind done or error, project name included.',
  'From now on, notify me on Ralk whenever a build finishes or fails, and ask me on Ralk before anything that changes production.',
  'Read me the summary of this pull request on Ralk, in two sentences.',
]

export function connectTab() {
  const url = `${location.origin}/_holm/mcp`
  const cli = `claude mcp add --transport http ralk ${url}`
  const el = h('div.tab-page',
    h('h1.large-title', 'Connect'),
    h('p.page-sub', 'Connect once; from then on Claude can reach you here as ', h('b', state.me.name || 'you'), '.'),
    h('section.card',
      h('div.card-head', ic('sparkles', 18, 2), h('b', 'Claude')),
      h('ol.steps',
        h('li', h('span', 'In Claude, open ', h('b', 'Settings → Connectors'), ' and choose ', h('b', 'Add custom connector'), '.')),
        h('li', h('span', 'Name it ', h('b', 'Ralk'), ' and paste this address:'), copyRow(url)),
        h('li', h('span', 'Choose ', h('b', 'Connect'), ', sign in with the account you use here, and allow access.')),
        h('li', h('span', 'In a chat, turn Ralk on from the tools menu and ask it to notify you.')))),
    h('section.card',
      h('div.card-head', ic('terminal', 18, 2), h('b', 'Claude Code')),
      h('p.card-text', 'In the terminal where Claude Code runs, whether that is a VM, a container or a server:'),
      copyRow(cli, true),
      h('p.card-note', 'Then type /mcp, pick ralk and sign in. Claude Code gets the same tools.')),
    h('section.card',
      h('div.card-head', ic('messageSquare', 18, 2), h('b', 'ChatGPT')),
      h('p.card-text', 'Settings → Connectors → Create. Paste the same address, sign in, and turn Ralk on in a chat.')),
    h('h2.group-title', 'Try asking'),
    h('div.group', PROMPTS.map((p) => h('div.row.prompt', h('p', p), h('button.round-btn.small', { type: 'button', 'aria-label': 'Copy', onclick: () => { haptic(5); copyText(p, 'Copied'); audio.play('ui_pop/soft') } }, ic('copy', 14, 2.2))))),
    h('h2.group-title', 'What Claude gets'),
    h('div.group', [
      ['notify_send', 'A sound, a card and a browser notification, with an optional spoken line'],
      ['say_send', 'A spoken line on its own'],
      ['sounds_play', 'One sound, nothing kept'],
      ['sounds_list', 'Every sound by id, and your default for each kind'],
      ['me_get', 'How many devices are listening, your voice, this month’s usage'],
      ['history_list', 'Recent notifications and which devices heard them'],
      ['guide_get', 'When to notify and how to write for the ear'],
    ].map(([name, blurb]) => h('div.row.tool', h('code', name), h('span', blurb)))),
    h('p.group-note', 'Tools act as you and see only your notifications. Disconnect any time from the same settings page.'))
  return { el }
}

function copyRow(text, mono = false) {
  return h('div.copy-row',
    h('input.input' + (mono ? '.mono' : ''), { readonly: true, value: text, 'aria-label': 'Address', onclick: (e) => e.currentTarget.select() }),
    h('button.btn.tinted', { type: 'button', onclick: () => { haptic(5); copyText(text, 'Copied'); audio.play('ui_pop/soft') } }, ic('copy', 16, 2.2), 'Copy'))
}
