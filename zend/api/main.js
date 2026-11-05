// Zend's server. The routes are in http.js, loaded on first use: Holm checks everything
// main.js imports when an app has a contract, so this file stays small. The named operations
// at the end are the tools Claude uses through Holm's MCP endpoint (/_holm/mcp);
// contract.json describes them, and their code is in ops.js.

export default {
  async fetch(request, env) {
    return (await import('./http.js')).default.fetch(request, env)
  }
}

const ops = () => import('./ops.js')
export async function chatsList(input, env, ctx) { return (await ops()).chatsList(input, env, ctx) }
export async function chatsRead(input, env, ctx) { return (await ops()).chatsRead(input, env, ctx) }
export async function chatsRename(input, env, ctx) { return (await ops()).chatsRename(input, env, ctx) }
export async function messagesList(input, env, ctx) { return (await ops()).messagesList(input, env, ctx) }
export async function messagesUnread(input, env, ctx) { return (await ops()).messagesUnread(input, env, ctx) }
export async function phoneGet(input, env, ctx) { return (await ops()).phoneGet(input, env, ctx) }
export async function templatesList(input, env, ctx) { return (await ops()).templatesList(input, env, ctx) }
export async function draftsCreate(input, env, ctx) { return (await ops()).draftsCreate(input, env, ctx) }
export async function draftsList(input, env, ctx) { return (await ops()).draftsList(input, env, ctx) }
export async function draftsDiscard(input, env, ctx) { return (await ops()).draftsDiscard(input, env, ctx) }
