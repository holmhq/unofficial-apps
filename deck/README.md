# Deck

Decks you make with Claude, on [Holm](https://holmhq.com). Make a workspace for
your team, connect Claude, and ask for a deck: it drafts, tightens and rearranges
while you watch every save land in the open deck, on the same slide. Seven
layouts keep every deck looking considered: a cover with a fan of what comes
next, a statement with a highlighted phrase, cards, a flow, a screenshot with
boxes and pins, numbers that count up, and the ask. Present with keys, swipes,
notes and a clock, share a link that follows your latest save or stays on one
version, or embed the deck in any page.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also has
a reusable version of it. Try it at
[deck-staging.zyt.app](https://deck-staging.zyt.app).

## Holm App Spec v1

Deck follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings (`web.spa` is on), `web/`
holds public files, and `api/main.js` exports `default { fetch(request, env) }`
and the handlers of the named operations in `api/contract.json`. Every deploy
needs `--spec-v1`; the node runs no build. Only `web/` is served as files:
`api/` and `holm.json` are not public URLs.

## What it does

- **Workspaces.** Anyone signed in makes a workspace (up to five of their own)
  and invites teammates with a link: single use, 14 days, optionally for one
  email address. Owners and admins manage the team; editors make, edit, share
  and present. A first workspace starts with a sample deck that uses every
  layout.
- **Claude over MCP.** Connect Claude to `https://<your-host>/_holm/mcp`. Its
  tools read the format guide, list and create decks, read a deck with an
  outline and a check, save the whole deck or apply small slide edits (insert,
  replace, update, move, delete), list and restore revisions, add pictures,
  share, and point your open deck at a slide with a short message.
- **The live loop.** Every save pings the deck's private realtime channel. An
  open studio reloads in place, keeps your slide, flashes the slides that
  changed and says who changed what. If you were typing, a banner lets you see
  theirs or keep yours on top.
- **The studio.** Words are edited where they sit on the slide; Enter in a
  bullet starts the next one. The inspector holds every field: lists of cards,
  steps, numbers and callouts, links, card colours, the picture, the deck's
  title, description, footer label, accent and language. Slides reorder by
  dragging, change layout without losing their words, and keep speaker notes.
  Edits save a moment after you stop typing.
- **History.** Every save is a revision. A person's edits in one sitting share
  one revision; Claude's saves are each their own. Any revision opens on its
  own and can be restored.
- **Library.** Each workspace has one library of screenshots, photos and SVG
  drawings, from the studio, from a phone through an upload link, or from
  Claude. Large photos are shrunk; slides pick the right width.
- **Sharing.** A deck is private to its workspace until someone turns on its
  link (`/s/<id>`). The link follows every save live or stays on one revision,
  stops working for good when turned off, and comes with an embed (`/e/<id>`)
  for an iframe on any site. Link previews carry the deck's own title,
  description and first picture.
- **Presenting.** 16:9 slides that scale to any screen and stack as one scroll
  on a portrait phone. Arrows, space, clicks and swipes; `F` full screen; `N`
  notes with the next slide and a clock; `#4` opens slide 4; print or save as
  PDF gives one slide per landscape page.

### How it feels

A calm grey canvas with raised white sheets, Inter set at real sizes inside
each slide (everything is measured in container units, so a slide looks the
same full screen, in the studio and as a thumbnail), frosted bars, sheets that
rise on a phone and dialogs on a desk, a round avatar button at the top right,
signed out too, with light, dark and match device. Slides animate in with a
short stagger; numbers count up; a quiet chime marks Claude's saves.

## How it's built

```text
api/main.js        tiny entry: loads http.js and ops.js with import()
api/contract.json  Claude's 16 tools (auth "user"; each checks workspace membership)
api/http.js        the web app's JSON API, shared and embedded pages with their link previews
api/ops.js         the named operations
api/workspaces.js  workspaces, members, roles, invites
api/decks.js       decks, revisions, slide edits, sharing, the live pings
api/check.js       the deck format: shape (refused) and check (errors, warnings)
api/media.js       the library: type sniffing, SVG checks, resized copies, upload links
api/guide.md       the format and workflow Claude reads (guide_get)
api/sample.json    the sample deck
web/deck/          the slide renderer and its styles, shared by every view
web/src/           the app (app.js, studio.js, schema.js), viewer (view.js), upload page
```

Holm primitives it uses:

- **`env.holm.app.ds`** for workspaces, members, invites, decks, revisions and
  the library's records, with compare-and-set updates (`ifRevision`) so two
  saves can't both win; **`env.holm.app.s3`** for pictures and their resized
  copies; **`env.holm.app.kv`** for upload links.
- **`env.holm.auth`** for sign-in and sign-out; accounts are the node's.
- **Named operations** in `api/contract.json`, projected by Holm as MCP tools
  at `/_holm/mcp`. They use `auth: "user"`, so anyone signed in on the node can
  connect Claude; the code checks every call against the caller's workspaces.
- **`env.holm.realtime.broadcast`** on unguessable per-deck, per-workspace and
  per-link channels (the pings carry no deck content), and the browser's
  `/_ws` client with reconnects.
- **`env.holm.image.resize`** for photos over 2560 px and the `-w640` … and
  `-og` copies.
- **`env.holm.web.fetch`** for the pages, with shared links given the deck's
  own head tags and an embed page any site may frame.
- **`env.holm.email.send`** for invites, when email is enabled for the app.

## Deploy your own copy

```bash
holm app validate --spec-v1 deck
holm @<peer> app deploy deck --spec-v1 --host deck.<your-domain>
```

Add `--force` when redeploying. Then set the sign-in page's presentation and
the link-preview card for the new app id, after checking the settings schema on
your node:

```bash
holm @<peer> settings set settings.apps.<app-id>.brand.name Deck
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#2f5bd8'
```

Sign in, make a workspace, and connect Claude: Settings → Connectors → Add
custom connector, with `https://deck.<your-domain>/_holm/mcp`. Emailed invites
need email enabled for the app; invite links work without it.

## Known limits

- **Keeping yours overwrites.** When Claude or a teammate saves while you type,
  "Keep mine" saves your whole deck on top; their change stays in the history
  but is not merged.
- **Pictures are unlisted, not private.** A `/media/…` address is hard to guess
  but anyone who has it can load the picture, which shared decks need.
- **Link previews** show the deck's first picture, or Deck's card; they do not
  draw the cover slide.
- **Callouts** move by dragging on the slide; boxes are resized with numbers in
  the inspector.
- **Limits:** 60 slides and 200 KB per deck, 300 revisions per deck, 200 decks
  per workspace, 500 pictures (12 MB each) per library, 5 owned workspaces per
  person.
- No co-editing inside one slide, comments, themes beyond the six accents,
  PowerPoint export (use print to PDF), per-workspace domains or view counts.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/fonts/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
  Deck's mark is its own.
