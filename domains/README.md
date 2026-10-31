# Domains

Find a short domain that's actually free. Type a name and Domains tries the
shorter versions of it: clipped forms, sound-alikes, initials, a dropped
vowel, AI ideas and domain hacks. It pairs each with the two- and three-letter
extensions you pick and checks them all live, shortest first. Free names rise
into a row at the top as the answers arrive. It runs on
[Holm](https://holmhq.com).

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also has
a reusable version of it. Try it at [domains.zyt.app](https://domains.zyt.app).

## Holm App Spec v1

Domains follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12. The pieces:

- **`holm.json`:** identity and web settings.
- **`web/`:** the public files.
- **`api/main.js`:** exports `default { fetch(request, env) }`.

Every deploy needs `--spec-v1`, and the node runs no build. Only `web/` is
served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Names, made shorter.** From "Zacharia" it makes zach, zack, zak, zac,
  zakk, zchr and more. From "flicker" it makes flickr; from "harbour labs",
  hl and hlabs. All of this happens in your browser (`web/src/gen.js`).
  Prefixes and suffixes (getzach, zachhq) and domain hacks (inter.net, da.sh)
  are switches. A length limit (2 letters to any) keeps the list short.
- **AI ideas.** The node's AI model adds nicknames, other spellings, clipped
  forms, blends and a few new words. They are grouped by kind and stay within
  the length limit, so a name you'd never have typed still gets checked.
- **Extensions you choose.** Presets: Short picks (.com .io .co .ai .so .sh
  .me .to .app .dev .xyz .net), every 2-letter or 3-letter extension, Classic,
  Tech, Under $5. Or pick your own from all 571 Namecheap sells, each shown
  with its price.
- **Shortest first, live.** Names are checked in order of their whole length.
  Every label gets a card whose extensions wait, then settle to free (with
  the price) or taken. The shortest free names gather as tiles at the top. A
  search tries up to 300 names, with **Check more** for the longer rest.
- **Filters that hide the noise:** only free names, no premium names, a
  first-year price limit. They apply at once, without asking again.
- **One name up close:** the first-year and renewal prices, the country of the
  extension, and why it was suggested, with **Register at Namecheap**. For a
  taken name: since when, at which registrar, and in how many other extensions
  the label is taken.
- **Saved names** with a star. They are kept in the browser, or on the
  account when you sign in, and can be checked again in one go.

### How it feels

A native-app shell: the window never scrolls, bars stay put, and only the
panel moves. Phones get a tab bar and a row of quick filters; desks get a
sidebar with every filter. While answers come in, the waiting extensions
breathe in a wave across each card. Free ones settle with a small green pulse
and taken ones fade and strike through. New finds slide into the tiles, a
thin line under the field shows progress, and the AI chip shimmers while it
thinks. Light and dark, and less motion when the device asks for it. Answers
are kept for 15 minutes, so changing a filter redraws at once.

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
  - **Speed:** a short prompt asks for labels grouped by kind (about two
    seconds).
  - **Cache:** answers are kept in `env.holm.app.kv` for 30 days per text and
    length.
  - **Cap:** a daily limit across everyone.
- **Why plain `fetch` routes:** Holm hands these routes no client address,
  and named operations may not call out to the network. So ideas and RDAP
  lookups are plain routes in `api/http.js`, with app-wide caps: AI ideas per
  day, RDAP lookups per minute, and RDAP answers kept 10 minutes.
- **Sign-in and storage:** sign-in is `env.holm.auth`. Saved names live in
  `env.holm.app.kv` under the member's id.
- **The shell** is `web/shell.html`, served by `api/main.js` at `/`,
  `/saved` and `/about`. It carries the page's CSP and this origin in its
  social tags.
- **Offline-ready:** a versioned service worker (`web/sw.js`) precaches every
  file, so the app opens without waiting on the network.
- **Checks:** `node tools/check.mjs` tests the name generator and the
  worker's file list.

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
- **Free means free right now.** Nothing is held for you, and checkout has
  the final price. RDAP's "free" means only that the registry has no record:
  the name may still be reserved or premium.
- **Prices are a snapshot** (`updated` in `web/data/tlds.json`), in US
  dollars, for one year.
- **Open routes, shared caps.** With no client address to count per person,
  the AI and RDAP limits are app-wide. One busy visitor can use up a day's AI
  ideas for everyone.
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
