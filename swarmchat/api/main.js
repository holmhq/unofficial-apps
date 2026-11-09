// SwarmChat on Holm. Agent routes dispatch first and load only what they use: every v1 request loads its modules
// afresh, so the people-facing code stays out of the agents' path.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/v1/')) return (await import('./v1.js')).v1(request, env, url);
    if (path === '/mcp') return (await import('./mcp.js')).mcp(request, env);
    if (path.startsWith('/api/')) return (await import('./api.js')).api(request, env, url);
    if (path.startsWith('/dev/')) return (await import('./dev.js')).dev(request, env, url);
    // A swarm's viewer is its own page (the vendored viewer), at /s/<swarm>.
    if (/^\/s\/s[0-9a-f]{14}\/?$/.test(path)) return env.holm.web.fetch(new Request(url.origin + '/viewer', { headers: request.headers }));
    return env.holm.web.fetch(request);
  },
};

// Named operations for people's Claude (contract.json), loaded only when one is called.
const ops = () => import('./ops.js');
export async function opWorkspacesList(input, env) { return (await ops()).opWorkspacesList(input, env); }
export async function opWorkspacesCreate(input, env) { return (await ops()).opWorkspacesCreate(input, env); }
export async function opSwarmsCreate(input, env) { return (await ops()).opSwarmsCreate(input, env); }
export async function opAgentsList(input, env) { return (await ops()).opAgentsList(input, env); }
export async function opAgentsAdd(input, env) { return (await ops()).opAgentsAdd(input, env); }
export async function opChatsList(input, env) { return (await ops()).opChatsList(input, env); }
export async function opMessagesRead(input, env) { return (await ops()).opMessagesRead(input, env); }
export async function opMessagesSearch(input, env) { return (await ops()).opMessagesSearch(input, env); }
export async function opSwarmActivity(input, env) { return (await ops()).opSwarmActivity(input, env); }
