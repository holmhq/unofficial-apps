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

export async function opMe(input, env) { return (await import('./ops.js')).opMe(input, env); }
export async function opIdentitiesList(input, env) { return (await import('./ops.js')).opIdentitiesList(input, env); }
export async function opWorkspacesCreate(input, env) { return (await import('./ops.js')).opWorkspacesCreate(input, env); }
export async function opPostsList(input, env) { return (await import('./ops.js')).opPostsList(input, env); }
export async function opPostsGet(input, env) { return (await import('./ops.js')).opPostsGet(input, env); }
export async function opPostsCreate(input, env) { return (await import('./ops.js')).opPostsCreate(input, env); }
export async function opPostsUpdate(input, env) { return (await import('./ops.js')).opPostsUpdate(input, env); }
export async function opPostsDelete(input, env) { return (await import('./ops.js')).opPostsDelete(input, env); }
export async function opInbox(input, env) { return (await import('./ops.js')).opInbox(input, env); }
export async function opCommentsList(input, env) { return (await import('./ops.js')).opCommentsList(input, env); }
export async function opCommentsReply(input, env) { return (await import('./ops.js')).opCommentsReply(input, env); }
export async function opCommentsCreate(input, env) { return (await import('./ops.js')).opCommentsCreate(input, env); }
export async function opCommentsModerate(input, env) { return (await import('./ops.js')).opCommentsModerate(input, env); }
export async function opPersonasCreate(input, env) { return (await import('./ops.js')).opPersonasCreate(input, env); }
export async function opPersonasUpdate(input, env) { return (await import('./ops.js')).opPersonasUpdate(input, env); }
export async function opPersonasDelete(input, env) { return (await import('./ops.js')).opPersonasDelete(input, env); }
export async function opMediaList(input, env) { return (await import('./ops.js')).opMediaList(input, env); }
export async function opWorkspaceGet(input, env) { return (await import('./ops.js')).opWorkspaceGet(input, env); }
export async function opWorkspaceUpdate(input, env) { return (await import('./ops.js')).opWorkspaceUpdate(input, env); }
export async function opWorkspaceLeave(input, env) { return (await import('./ops.js')).opWorkspaceLeave(input, env); }
export async function opTeamList(input, env) { return (await import('./ops.js')).opTeamList(input, env); }
export async function opTeamUpdate(input, env) { return (await import('./ops.js')).opTeamUpdate(input, env); }
export async function opThemesList(input, env) { return (await import('./ops.js')).opThemesList(input, env); }
export async function opThemesReference(input, env) { return (await import('./ops.js')).opThemesReference(input, env); }
export async function opThemesGet(input, env) { return (await import('./ops.js')).opThemesGet(input, env); }
export async function opThemesValidate(input, env) { return (await import('./ops.js')).opThemesValidate(input, env); }
export async function opThemesSave(input, env) { return (await import('./ops.js')).opThemesSave(input, env); }
export async function opThemesActivate(input, env) { return (await import('./ops.js')).opThemesActivate(input, env); }
export async function opInvitesCreate(input, env) { return (await import('./ops.js')).opInvitesCreate(input, env); }
export async function opInvitesRevoke(input, env) { return (await import('./ops.js')).opInvitesRevoke(input, env); }
