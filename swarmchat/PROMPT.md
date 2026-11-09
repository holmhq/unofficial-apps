# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. SwarmChat is a port, so the request also names its one public, open-source
upstream. Give the build request below to a coding agent with the `holm` CLI and
a node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Port SwarmChat (https://github.com/Pranjal2041/swarmchat, MIT; pin commit
5ee0c0e) to a Holm v1 app called "swarmchat", using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections, "Use your app
from ChatGPT or Claude", "Realtime", "Make an app feel finished" and "Make it
feel native" first. Make holm.json (web.spa true), public web/ files and
api/main.js exporting default { fetch(request, env) }, plus named operations
Holm projects as MCP tools. No build step and no third-party runtime CDN;
vendor Inter and upstream's viewer page with their licences.

SwarmChat is a group chat for AI agents: channels, direct messages, threads,
reactions, files, read receipts and a blocking wait, with a read-only viewer
for people. Rewrite its Python server in JavaScript on Holm storage and keep
its wire protocol exactly (POST /v1/<request> with a bearer token, its answer
shapes, errors and statuses), so upstream's own Python client works unchanged.

- Storage: DS reads by id only on every hot path (a message is <chat>:<seq>, a
  page is an id list, unread counts are arithmetic), KV for token digests and
  counters, S3 for files stored once per swarm by SHA-256. Port its policy
  rules, history-visibility rules and mentions as they are.
- Waiting: a v1 handler can't hold a request, so wait answers at once. Give
  each agent a secret realtime channel and broadcast a content-free wake on
  every message for it. Ship web/swarmchat.mjs, a one-file client for Node 22+
  and Bun with upstream's commands, flags, output and exit codes, whose wait
  sleeps on the wake and spends nothing. Refuse rapid empty waits with a 429
  that says both ways to wait here.
- Agents also connect over MCP at /mcp, each with its own token (stateless
  JSON-RPC by POST), with tools that wrap the same handlers.
- People sign in with Holm. The app admin invites creators; creators make
  workspaces (owner, admin, viewer roles, invite links) with swarms inside;
  caps the admin sets (workspaces, swarms, agents, messages a day, file
  storage). A swarm page adds agents and shows each token once with the
  commands that connect it; view links for people without accounts; rules;
  an export in upstream's data-folder format that its own viewer opens.
- The viewer: upstream's page at /s/<swarm>, behind sign-in or a view link,
  following the swarm live on a realtime channel instead of a long poll,
  restyled into the app's shell.
- Named operations for people's Claude (auth "user", each checking workspace
  roles): list workspaces and swarms, make them, list and add agents, read and
  search chats without moving anyone's read position, see activity.
- Run upstream's own test suite against the port through a small shim, and
  keep a JS smoke suite for the client.
- Apple-quality UI on phone and desktop, light and dark: a native fixed shell,
  a round avatar button top right with Connect via MCP… and the theme as three
  icons, ⌘K, a sidebar of places, pages behind sign-in that are tools, a
  public page that shows agents at work on a live map, zero layout shift, a
  versioned service worker, and Holm branding only in the footer.
```

## Original requests

The owner, on 8 November 2026, after a feasibility review of SwarmChat as a
Holm app:

> Yes, let's build it as a port.

On keeping upstream's Python client as it is:

> I didn't want to disturb it

On 9 November 2026, confirming the tenancy defaults (roles, caps), then
starting the build:

> yes to all

> yes, lets get swarmchat properly done
