// Deck: decks you make with Claude, in workspaces. http.js serves shared decks, pictures and
// the web app's JSON API; ops.js with contract.json holds the tools Claude uses through Holm's
// MCP endpoint (/_holm/mcp). Both load with import(), so Holm's contract scan reads only this
// small file. Static files in web/ are served by Holm without running any of this.

export default {
  async fetch(request, env) {
    const http = await import('./http.js');
    return http.default.fetch(request, env);
  },
};

const ops = () => import('./ops.js');
export async function opGuide(input, env) { return (await ops()).opGuide(input, env); }
export async function opMe(input, env) { return (await ops()).opMe(input, env); }
export async function opWorkspacesCreate(input, env) { return (await ops()).opWorkspacesCreate(input, env); }
export async function opDecksList(input, env) { return (await ops()).opDecksList(input, env); }
export async function opDecksCreate(input, env) { return (await ops()).opDecksCreate(input, env); }
export async function opDeckGet(input, env) { return (await ops()).opDeckGet(input, env); }
export async function opDeckSave(input, env) { return (await ops()).opDeckSave(input, env); }
export async function opSlidesEdit(input, env) { return (await ops()).opSlidesEdit(input, env); }
export async function opDeckCheck(input, env) { return (await ops()).opDeckCheck(input, env); }
export async function opRevisionsList(input, env) { return (await ops()).opRevisionsList(input, env); }
export async function opRevisionsRestore(input, env) { return (await ops()).opRevisionsRestore(input, env); }
export async function opAssetsList(input, env) { return (await ops()).opAssetsList(input, env); }
export async function opAssetsPut(input, env) { return (await ops()).opAssetsPut(input, env); }
export async function opAssetsLink(input, env) { return (await ops()).opAssetsLink(input, env); }
export async function opShareSet(input, env) { return (await ops()).opShareSet(input, env); }
export async function opStudioShow(input, env) { return (await ops()).opStudioShow(input, env); }
