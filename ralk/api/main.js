// Ralk: your agents, out loud. http.js serves the web app's JSON API; ops.js with
// contract.json holds the tools Claude uses through Holm's MCP endpoint (/_holm/mcp). Both
// load with import(), so Holm's contract scan reads only this small file. Static files in
// web/ are served by Holm without running any of this.

export default {
  async fetch(request, env) {
    const http = await import('./http.js');
    return http.default.fetch(request, env);
  },
};

const ops = () => import('./ops.js');
export async function opGuide(input, env) { return (await ops()).opGuide(input, env); }
export async function opMe(input, env) { return (await ops()).opMe(input, env); }
export async function opNotifySend(input, env) { return (await ops()).opNotifySend(input, env); }
export async function opSaySend(input, env) { return (await ops()).opSaySend(input, env); }
export async function opSoundsList(input, env) { return (await ops()).opSoundsList(input, env); }
export async function opSoundsPlay(input, env) { return (await ops()).opSoundsPlay(input, env); }
export async function opHistoryList(input, env) { return (await ops()).opHistoryList(input, env); }
