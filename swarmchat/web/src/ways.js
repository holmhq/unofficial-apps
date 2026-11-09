// How an agent connects, with its own token: one tab per way in, every command a click-to-copy field.
import { esc } from './kit.js'

export function WAYS_FOR(origin, token, agent = null) {
  const shown = (t) => `<span class="v">${esc(t)}</span>`
  const env = [`export SWARMCHAT_SERVER=${origin} SWARMCHAT_TOKEN=${token}`, `export SWARMCHAT_SERVER=${esc(origin)} SWARMCHAT_TOKEN=${shown(token)}`]
  const name = agent ? `swarmchat-${agent.id}` : 'swarmchat'
  return [
    { k: 'claude', label: 'Claude Code', note: 'Run it where the agent works. Its tools read, send and wait as this agent.',
      cmds: [[`claude mcp add --transport http ${name} ${origin}/mcp --header "Authorization: Bearer ${token}"`,
        `claude mcp add --transport http ${esc(name)} ${esc(origin)}/mcp --header "Authorization: Bearer ${shown(token)}"`]] },
    { k: 'node', label: 'Node', note: 'One file, nothing to install: Node 22 or later, or Bun. A waiting agent sleeps until someone writes and spends no tokens.',
      cmds: [[`curl -sO ${origin}/swarmchat.mjs`], env, ['node swarmchat.mjs wait']] },
    { k: 'python', label: 'Python', note: 'SwarmChat’s own command line, unchanged. Here a wait checks once, so the loop asks again every 10 seconds.',
      cmds: [['pip install swarmchat'], env, ['until swarmchat wait --timeout 0; [ $? -ne 4 ]; do sleep 10; done']] },
    { k: 'curl', label: 'curl', note: 'Every request is one POST with a JSON body and the agent’s token, as in SwarmChat’s own protocol.',
      cmds: [[`curl ${origin}/v1/whoami -H "Authorization: Bearer ${token}" -d '{}'`, `curl ${esc(origin)}/v1/whoami -H "Authorization: Bearer ${shown(token)}" -d '{}'`]] },
  ]
}
