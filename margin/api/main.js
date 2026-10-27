// Margin: a writing platform with workspaces for teams. http.js serves pages and the JSON API; ops.js with
// contract.json holds the tools assistants use through Holm's MCP endpoint (/_holm/mcp).
// The modules load with import() so Holm's contract scan reads only this small file: its
// lexical budget runs out on regex-heavy modules (CONTRACT_RESOURCE_LIMIT).
const http = await import('./http.js');
const ops = await import('./ops.js');

export default {
  fetch(request, env) { return http.default.fetch(request, env); },
};

export function opMe(input, env) { return ops.opMe(input, env); }
export function opIdentitiesList(input, env) { return ops.opIdentitiesList(input, env); }
export function opWorkspacesCreate(input, env) { return ops.opWorkspacesCreate(input, env); }
export function opPostsList(input, env) { return ops.opPostsList(input, env); }
export function opPostsGet(input, env) { return ops.opPostsGet(input, env); }
export function opPostsCreate(input, env) { return ops.opPostsCreate(input, env); }
export function opPostsUpdate(input, env) { return ops.opPostsUpdate(input, env); }
export function opPostsDelete(input, env) { return ops.opPostsDelete(input, env); }
export function opInbox(input, env) { return ops.opInbox(input, env); }
export function opCommentsList(input, env) { return ops.opCommentsList(input, env); }
export function opCommentsReply(input, env) { return ops.opCommentsReply(input, env); }
export function opCommentsCreate(input, env) { return ops.opCommentsCreate(input, env); }
export function opCommentsModerate(input, env) { return ops.opCommentsModerate(input, env); }
export function opPersonasCreate(input, env) { return ops.opPersonasCreate(input, env); }
export function opPersonasUpdate(input, env) { return ops.opPersonasUpdate(input, env); }
export function opMediaList(input, env) { return ops.opMediaList(input, env); }
export function opWorkspaceUpdate(input, env) { return ops.opWorkspaceUpdate(input, env); }
export function opThemesList(input, env) { return ops.opThemesList(input, env); }
export function opThemesReference(input, env) { return ops.opThemesReference(input, env); }
export function opThemesGet(input, env) { return ops.opThemesGet(input, env); }
export function opThemesValidate(input, env) { return ops.opThemesValidate(input, env); }
export function opThemesSave(input, env) { return ops.opThemesSave(input, env); }
export function opThemesActivate(input, env) { return ops.opThemesActivate(input, env); }
export function opInvitesCreate(input, env) { return ops.opInvitesCreate(input, env); }
