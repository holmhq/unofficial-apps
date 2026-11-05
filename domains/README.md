# Domains

Find a short domain that's still available. Type a name and Domains tries
the shorter versions of it: clipped forms, sound-alikes, initials, a dropped
vowel, AI ideas and domain hacks. It pairs each with the extensions you pick,
checks them all live, shortest first, and shows only the available ones.
Star the good ones, collect them into lists, and share a list by link. It
runs on [Holm](https://holmhq.com).

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of them. Try it at [domains.zyt.app](https://domains.zyt.app).

## Holm App Spec v1

Domains follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12. The pieces:

- **`holm.json`:** identity and web settings.
- **`web/`:** the public files.
- **`api/main.js`:** exports `default { fetch(request, env) }`, and the
  handlers of the named operations in `api/contract.json` (the MCP tools).

Every deploy needs `--spec-v1`, and the node runs no build. Only `web/` is
served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Names, made shorter.** From "Zacharia" it makes zach, zack, zak, zac and
  zakk; from "flicker", flickr; from "harbour labs", hl and harbr. All of this
  happens in your browser (`web/src/gen.js`), and labels nobody could say
  (zchr) are left out. Prefixes and suffixes (getzach, zachhq) and domain
  hacks (inter.net) are options, and a length ruler keeps the list short.
- **AI ideas.** The node's AI model reads what you typed (the row of ideas
  shows its one-line reading on hover) and adds nicknames, other spellings,
  short forms, real words from the same world (harbour: quay, berth, moor),
  blends and a few new words. **More like these** asks again, for names in
  the style of the ones that came back available and the ones you starred.
- **Only available names, as cards.** Every name is checked live, shortest
  first. Lookups answer in bursts, so the cards are revealed one at a time at
  an even pace, appended in order, with premium names last; nothing
  reshuffles. One row of ideas sits above them, with a count each: tap one to
  see only its names. Ideas with nothing available fold away at the end.
- **The search moves into the navbar.** The first search starts in a big
  field, which flies up into the navbar as the rest of the start page fades.
- **Filters in one compact panel**, from a button in the search field:
  extension presets (short, every 2- or 3-letter extension, classic, tech,
  cheap) above the extensions themselves, a length ruler, which ideas to make,
  a first-year price ruler and "hide premium names". They apply at once.
- **One name up close:** first-year and renewal prices, why it was
  suggested, **Register at Namecheap**, save and add to a list.
- **Saved names and lists.** A star saves a name. Lists collect names for a
  friend or a project, with a note. Both stay in the browser, or with your
  account when you sign in, and can be checked again in one go.
- **Share a list.** Signed in, a list gets a link that opens for anyone
  without signing in: every name on one page, checked again live as it
  opens, each with a link to register. The link's preview shows the list's
  name and note. Stop sharing and the link stops working. The link is one
  field that copies when clicked.
- **Claude and other AI apps:** seven MCP tools, open to anyone signed in and
  limited to their own names and lists:
  - `names_suggest`: names made the way the search makes them (shorter
    spellings, sound-alikes, initials, and optionally prefixes, suffixes and
    domain hacks), what was typed first, with list prices. They come
    **unchecked** (see Known limits), with a `check_live` link that opens the
    search and checks them all.
  - `saved_list` and `saved_update`: your saved names with what Domains last
    knew about each; save or unsave names.
  - `lists_list`, `lists_get`, `lists_create`, `lists_update` and
    `lists_delete`: make lists, add and remove names, change the note, and
    turn the share link on or off.

  **Connect via MCP…** in the account menu opens a sheet with the connector
  address (`https://<host>/_holm/mcp`) to click and copy, and tabs for
  Claude, ChatGPT, Claude Code and what the tools do. An open page takes
  changes Claude made to your names and lists when it comes back into view.

### How it feels

A native-app shell: the window never scrolls, bars stay put, and only the
panel moves. A sidebar of places (Search, Saved, your lists) hides with one
tap and starts hidden; phones get a tab bar. The round avatar button holds
sign-in and a three-icon theme switch, and closes when tapped again. Cards
rise into place, the AI mark breathes while it thinks, and a thin line under
the field shows progress. Light and dark, and less motion when the device
asks for it. Answers are kept for 15 minutes, so changing a filter redraws
at once.

## How it's built

- **Lookup providers are adapters** (`web/src/providers/`). Each exports
  `check(names, onResult, { signal })` and reports `free`, `taken`, `maybe`
  or `unknown` per name, with premium prices, registrar and year when known.
  The search never talks to a registry itself; adding a service is one more
  adapter.
  - **Namecheap adapter (in use):** talks to the WebSocket behind Namecheap's
    own search page (`wss://domain-search.namecheap.com/v1/ws`, with
    `batch=false`), from the visitor's browser.
    - **Why the browser:** Namecheap's edge turns away server clients, and
      its HTTP endpoint sends no CORS headers.
    - **CSP:** the page's Content-Security-Policy (set in `api/main.js`)
      allows that one socket.
    - **Speed:** two sockets with ten names a message answer about 250 names
      in three to five seconds.
  - **RDAP adapter (fallback):** the registries' own public lookup (RFC 9083),
    asked by the server through `env.holm.net.fetch`. The server finds each
    extension's RDAP server in IANA's bootstrap list (`api/rdap.json`).
    - **When it runs:** the search switches to it automatically if Namecheap
      can't be reached, and it can be picked under Lookups.
    - **Limits:** no premium prices, and .io, .co, .me, .sh and .gg have no
      RDAP server.
- **Prices** are Namecheap's list prices for one year, saved by
  `tools/catalog.mjs` into `web/data/tlds.json`. Premium prices come live
  from the lookup.
- **AI ideas:** `POST /api/ideas` calls `env.holm.ai.chat`.
  - **Speed:** a short prompt asks for a one-line reading and labels grouped
    by kind (about two seconds). Labels that can't be said are dropped on
    the server too.
  - **More like these:** the same route with `like` (available and starred
    labels) and `avoid` (everything tried) asks for names in that style.
  - **Cache:** answers are kept in `env.holm.app.kv` for 30 days per text,
    length and round.
  - **Cap:** a daily limit across everyone.
- **Why plain `fetch` routes:** Holm hands these routes no client address,
  and named operations may not call out to the network. So ideas and RDAP
  lookups are plain routes in `api/http.js`, with app-wide caps: AI ideas per
  day, RDAP lookups per minute, and RDAP answers kept 10 minutes.
- **Sign-in and storage:** sign-in is `env.holm.auth`. Saved names and
  lists live in `env.holm.app.kv` under the member's id (`saved:<id>`,
  `lists:<id>`). A shared list gets an eight-character slug, and
  `share:<slug>` points at its owner and list; `GET /api/share/<slug>` is
  the one route anyone can read.
- **The shell** is `web/shell.html`, served by `api/main.js` at `/`,
  `/saved`, `/lists/…`, `/about` and `/s/<slug>`. It carries the page's CSP
  and this origin in its social tags; for a shared list it also carries the
  list's name and note, so the link unfurls as that list.
- **Offline-ready:** a versioned service worker (`web/sw.js`) precaches every
  file, so the app opens without waiting on the network.
- **Named operations and MCP:** `api/contract.json` declares seven
  operations with `auth: "user"`, which Holm serves as tools at `/_holm/mcp`
  with OAuth sign-in; `api/ops.js` runs them through the same functions as
  `/api/saved` and `/api/lists` in `api/http.js`.
  - **No lookups:** named operations can't call out (`READ_EFFECT_DENIED`,
    for read and write operations alike), so the tools never ask a registry
    or the AI.
  - **Server copies:** a server module can't import from `web/`, and an
    operation has no `env.holm.web`. So `api/gen.js` and `api/tlds.json` are
    copies of `web/src/gen.js` and `web/data/tlds.json`, which
    `tools/catalog.mjs` writes together and `tools/check.mjs` keeps equal.
  - **Links:** `/api/me` records the address the app was opened at, which
    the tools use for their links.
- **Checks:** `node tools/check.mjs` tests the name generator (including
  that every made label can be said), the worker's file list, and that the
  server's copies match.

## Deploy your own copy

```bash
node domains/tools/check.mjs
holm app validate --spec-v1 domains
holm @<peer> app deploy domains --spec-v1 --host domains.<your-domain>
```

Add `--force` when redeploying. The Namecheap adapter needs nothing on the
node.

**RDAP fallback.** The RDAP adapter reaches about 110 registry hosts. You can
let the app make any public HTTPS call:

```bash
holm @<peer> net allow-any --app <app-id>
```

Or allow just those hosts. This prints one `holm net allow` line per host:

```bash
node domains/tools/rdap.mjs --allow <app-id>
```

**AI ideas** need an AI chat provider on the node (`holm settings schema
settings.node.providers`). Without one, the rest of the app works and the AI
chip says so.

**Branding.** Then set the sign-in page's presentation and the link-preview
card for the new app id, after checking the settings schema on your node:

```bash
holm @<peer> settings set settings.apps.<app-id>.brand.name Domains
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#1d1d1f'
```

**Refreshing the data.** To refresh prices, run `node domains/tools/catalog.mjs`.
It opens Namecheap's feeds in Chromium through `playwright-core`. To refresh
the RDAP list, run `node domains/tools/rdap.mjs`.

## Known limits

- **The Namecheap socket is an undocumented website endpoint.** It can change
  or close without notice. The search then falls back to RDAP and says so. A
  supported integration would be an adapter for Namecheap's official API,
  which needs an account, an API key and an allowlisted server address.
- **Available means available right now.** Nothing is held for you, and
  checkout has the final price. RDAP's answers show as "Likely": the registry
  has no record, but the name may still be reserved or premium.
- **A shared link is a capability.** Anyone who has it can see the list's
  names and note. Stopping sharing deletes the link.
- **Prices are a snapshot** (`updated` in `web/data/tlds.json`), in US
  dollars, for one year.
- **Open routes, shared caps.** With no client address to count per person,
  the AI and RDAP limits are app-wide. One busy visitor can use up a day's AI
  ideas for everyone.
- **Claude can't check availability.** Holm's named operations can't call
  out, so `names_suggest` returns names marked `unchecked`, or with what
  Domains last knew: an RDAP answer from the last ten minutes, or the status
  when the name was saved. The `check_live` link checks them in the app.
  Names Claude saves stay "Not checked" until someone checks them there.
- **Changes from Claude reach an open page** when it comes back into view
  (focus or a tab switch), not live while you watch it.
- Only names in a-z, 0-9 and hyphens: no internationalised domain names yet.
- iPhone Safari is not checked yet.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/fonts/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
- `api/rdap.json` is drawn from IANA's
  [RDAP bootstrap registry](https://data.iana.org/rdap/dns.json).
  `web/data/tlds.json` holds Namecheap's published list prices. Domains'
  mark is its own.
