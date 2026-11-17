// Margin: a writing platform with workspaces for teams. http.js serves pages and the JSON API; ops.js with
// contract.json holds the tools assistants use through Holm's MCP endpoint (/_holm/mcp).
// The modules load with import() so Holm's contract scan reads only this small file: its
// lexical budget runs out on regex-heavy modules (CONTRACT_RESOURCE_LIMIT). Each request loads
// them afresh, so lib/cache.js answers first: rendered pages, 304s and versioned files need
// none of the rest.
const cache = await import('./lib/cache.js');

export default {
  async fetch(request, env) {
    const quick = await cache.quick(request, env);
    if (quick) return quick;
    const http = await import('./http.js');
    return http.default.fetch(request, env);
  },
};

// The operations build addresses too, so they learn first whether a workspace is the whole site.
async function ops(env) {
  const [mod, paths] = await Promise.all([import('./ops.js'), import('./lib/paths.js')]);
  paths.useRoot(env);
  return mod;
}

export async function opMe(input, env) { return (await ops(env)).opMe(input, env); }
export async function opIdentitiesList(input, env) { return (await ops(env)).opIdentitiesList(input, env); }
export async function opWorkspacesCreate(input, env) { return (await ops(env)).opWorkspacesCreate(input, env); }
export async function opPostsList(input, env) { return (await ops(env)).opPostsList(input, env); }
export async function opPostsGet(input, env) { return (await ops(env)).opPostsGet(input, env); }
export async function opPostsCreate(input, env) { return (await ops(env)).opPostsCreate(input, env); }
export async function opPostsUpdate(input, env) { return (await ops(env)).opPostsUpdate(input, env); }
export async function opPostsDelete(input, env) { return (await ops(env)).opPostsDelete(input, env); }
export async function opInbox(input, env) { return (await ops(env)).opInbox(input, env); }
export async function opCommentsList(input, env) { return (await ops(env)).opCommentsList(input, env); }
export async function opCommentsReply(input, env) { return (await ops(env)).opCommentsReply(input, env); }
export async function opCommentsCreate(input, env) { return (await ops(env)).opCommentsCreate(input, env); }
export async function opCommentsModerate(input, env) { return (await ops(env)).opCommentsModerate(input, env); }
export async function opPersonasCreate(input, env) { return (await ops(env)).opPersonasCreate(input, env); }
export async function opPersonasUpdate(input, env) { return (await ops(env)).opPersonasUpdate(input, env); }
export async function opPersonasDelete(input, env) { return (await ops(env)).opPersonasDelete(input, env); }
export async function opMediaList(input, env) { return (await ops(env)).opMediaList(input, env); }
export async function opMediaUpload(input, env) { return (await ops(env)).opMediaUpload(input, env); }
export async function opMediaUploadLink(input, env) { return (await ops(env)).opMediaUploadLink(input, env); }
export async function opWorkspaceGet(input, env) { return (await ops(env)).opWorkspaceGet(input, env); }
export async function opWorkspaceUpdate(input, env) { return (await ops(env)).opWorkspaceUpdate(input, env); }
export async function opWorkspaceLeave(input, env) { return (await ops(env)).opWorkspaceLeave(input, env); }
export async function opTeamList(input, env) { return (await ops(env)).opTeamList(input, env); }
export async function opTeamUpdate(input, env) { return (await ops(env)).opTeamUpdate(input, env); }
export async function opThemesList(input, env) { return (await ops(env)).opThemesList(input, env); }
export async function opThemesReference(input, env) { return (await ops(env)).opThemesReference(input, env); }
export async function opThemesGet(input, env) { return (await ops(env)).opThemesGet(input, env); }
export async function opThemesValidate(input, env) { return (await ops(env)).opThemesValidate(input, env); }
export async function opThemesSave(input, env) { return (await ops(env)).opThemesSave(input, env); }
export async function opThemesActivate(input, env) { return (await ops(env)).opThemesActivate(input, env); }
export async function opThemesDelete(input, env) { return (await ops(env)).opThemesDelete(input, env); }
export async function opThemesPublish(input, env) { return (await ops(env)).opThemesPublish(input, env); }
export async function opCoversPrompt(input, env) { return (await ops(env)).opCoversPrompt(input, env); }
export async function opInvitesCreate(input, env) { return (await ops(env)).opInvitesCreate(input, env); }
export async function opInvitesRevoke(input, env) { return (await ops(env)).opInvitesRevoke(input, env); }
