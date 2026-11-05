# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "relay", a private messenger for the members of my Holm node, using
only https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
the common recipes first. Make holm.json, public web/ files and api/main.js
exporting default { async fetch(request, env) }. Set web.spa true, use
env.holm for storage, sign-in, images, email, outbound HTTP and realtime,
return standard Responses and fall back to env.holm.web.fetch(request). No
build step or third-party runtime CDN; vendor fonts and icons with licences.

- After sign-in, claim a username. Add people by username without revealing
  whether it exists: they accept, decline or block, and the sender learns only
  of an acceptance. Email a one-time join link to someone not here yet.
- One-to-one chats and groups with an optional handle in the address. Text,
  reply with a quote (menu or swipe), copy, forward and delete for everyone.
  Photos shrink in the browser before upload; any other file up to the node's
  form-file limit. Server-fetched link previews. Paginated history, search,
  exact unread counts, typing, nicknames and photos for contacts.
- Send live events to each member on their own channel, never per room. If
  the guide offers no way to admit only that member to a private: channel,
  name a plain channel with a random secret given only to that member, and
  say so in the README.
- MCP tools as named operations with auth "user", each checking the caller:
  list chats with unread counts, catch up on unread messages and mark a chat
  read, read a chat further back on request, send a text message, list
  friends, and list, send (username, group or email) and answer invites
  without revealing whether a username exists. Settings has Connect via
  MCP with the MCP mark: a sheet with the connector address to click and
  copy, and tabs for Claude, ChatGPT, Claude Code and what the tools do.
- A phone-first app shell where only panels scroll, with no scroll bars:
  Chats, Add, Friends, Settings tabs that stay alive between switches,
  light/dark/auto themes and accent colours, sounds, in-app notifications,
  an installable manifest. A round avatar button at the top right, signed
  out too, opens a menu with who you are, Connect via MCP…, a three-icon
  theme switch and Sign in or out; ⌘K goes to any tab or chat and does the
  same. A service worker precaches every page file at the holm.json
  version and opens cache-first, and a signed-in launch draws the chat list
  at once from what the browser last saw. A footer with "A Holm app",
  Feedback and Source. Follow the guide's "feel finished" and "feel native"
  recipes, and draw one holm.symbol.svg for every icon.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 relay. With my approval, deploy with
holm @<peer> app deploy relay --spec-v1 --host relay.<my-domain>. Never
replace an occupied host without asking, and ask before granting email or
outbound HTTP. Validation does not run the app: test two and three members
in separate browsers, invites, a group, live delivery both ways, uploads,
and mobile/desktop in light/dark. Report gaps honestly. Inspect the target
settings schema before setting sign-in branding.
```

## The original requests

Relay was first built for the maintainer's own node, from requests that
pointed at private notes; they are not reproduced here. It moved to this
repository with this message:

**Iteration 1**

> I think we can move relay project from [the maintainer's other repository] to unofficial apps?
> - refine it (i think its logo & assets needs work)
> - and get it in unofficial's store?

**Iteration 2**

Relay 0.3.0 came from this request, when the repository made MCP standard:

> Shall we add mcp support for relay & feedback?

Its tools grew from a follow-up the same day:

> I hope relay also has the ability to list friends, see unread messages, invite folks etc?

**Iteration 3**

Relay 0.4.0 came from a sweep of every app against the repository's
cookbook, which found it without the avatar button and ⌘K:

> Sure do cookbook sweep
