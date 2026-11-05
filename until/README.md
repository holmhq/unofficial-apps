# Until

Count down the days to anything, on [Holm](https://holmhq.com). Give a
tracker a start and an end, or a number of days, and Until shows how many are
left in big numbers. Rate each day as it passes, from one to five stars. It
works on a phone straight away, with no account; sign in and your trackers
follow you to every device, and Claude can count them down with you through
its MCP tools.

It was rebuilt from the request quoted in [`PROMPT.md`](PROMPT.md), which
also has a reusable version of it.

## Holm App Spec v1

Until follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage and
sign-in. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are not
public URLs. Because it has a contract, `holm.json` turns the generated web
surface off (`surfaces.web.renderer: "off"`).

## What it does

- **Trackers:** a title, an optional subtitle, a start date and either a
  number of days or an end date (up to about a hundred years). Each gets a
  random icon; tap it for another.
- **The list:** each card shows the days left, "Today" on the last day, days
  since once it's over, and a dash before it starts. Running trackers come
  first, then upcoming ones, then finished ones, most recent first. Numbers
  count down when the list opens, unless "reduce motion" is on.
- **Rate a day:** tap a card to rate any day so far, stepping back and forth
  through the tracker; today's rating shows on its card. Future days can't be
  rated yet.
- **No account needed:** signed out, trackers stay in the browser's local
  storage. After signing in, Until offers to move them into the account,
  skipping any it already has.
- **Signed in:** trackers and the colour choice are kept on the node for that
  member alone and appear on every device.
- **Installable, quick and offline:** the generated web manifest makes it an
  app on the home screen. A service worker precaches every page file at the
  `holm.json` version, all or nothing, and opens cache-first; a new deploy
  takes over on the next launch. It never answers `/api/`, `/auth/` or Holm's
  own `/_` paths, and an address that ends like a file (`/icon-512.png`)
  opens that file. A launch draws your trackers at once from what this
  browser last saw, then redraws only if the node's copy differs, and a
  number counts down only when it changed since you last looked. Offline, a
  signed-in member sees their last synced trackers, read only.
- **MCP tools:** Claude, ChatGPT or Claude Code can list your trackers with
  the days left, read one with every day's stars, add one, change its title,
  icon or dates, rate a day (today unless told otherwise; never a day still to
  come) and delete one. **Connect via MCP…** in the account menu and in ⌘K,
  shown when you're signed in, opens a sheet with the connector address to click and
  copy, and tabs with the steps for Claude, ChatGPT and Claude Code and what
  the tools do. An open page picks up what Claude changed when you come back
  to it.
- **⌘K** (Ctrl+K) opens any tracker to rate a day, edits one, adds one, and
  does what the account menu does.
- **Looks:** two colours, Green and Bloom, each in light and dark or
  following the device, chosen from the account menu (light, dark and auto
  as three icons). Analytics shows there only for the app's admins. The page never scrolls
  as a whole; only the list moves under the header, as in a native app.

## How it is built

```text
holm.json               identity, web.spa, store listing exclusion
holm.symbol.svg         app icon: an hourglass
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             every route: who is signed in, trackers, settings, import
api/contract.json       the MCP tools: names, inputs, risk and errors
api/ops.js              the tools' code, which calls the routes above
web/index.html          the page shell, with the theme applied before first paint
web/sw.js               precached page files at the holm.json version, cache-first
web/src/app.js          the list, the add/edit and rate sheets, the account menu
web/src/mcp.js          the Connect via MCP sheet and its click-to-copy field
web/src/palette.js      ⌘K: open, add or edit a tracker, or do what the menu does
web/src/dates.js        calendar-day arithmetic, sorting and captions
web/src/ui.js           DOM helper, bottom sheets, the status line
web/src/icons.js        the Lucide icons it uses, copied in
web/src/styles.css      the whole look: two colours in light and dark, layout, motion
web/fonts/              Manrope (OFL), vendored
web/vendor/lucide/      the Lucide licence
tools/check.mjs         release checks: sw.js lists every file at the holm.json
                        version and spares files and Holm's paths
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Member document store, `env.holm.app.member.ds`:** the collection
  `countdowns`, one document per tracker (title, subtitle, icon, start date,
  number of days, end date, ratings by day). Each member sees only their own.
  Imports insert in one `ds.transaction`.
- **Member key-value store, `env.holm.app.member.kv`:** the member's colour
  and appearance under `settings`.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **Named operations, `api/contract.json`:** six tools, each with
  `auth: "user"`, so anyone signed in on the node can use them on their own
  trackers. Holm serves them to Claude and other MCP clients at `/_holm/mcp`,
  with OAuth. Each tool sends its request through the app's own routes as the
  signed-in person, so it reaches only that member's storage. `main.js` loads
  `ops.js` with `import()` when a tool runs, which keeps the contract check
  small.
- **App key-value store, `env.holm.app.kv`:** `site:origin`, the address
  `/api/me` was last reached at, so a tool's answer can link to the app.
- **`env.holm.web.fetch`:** serves everything that isn't under `/api/`.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

A new tracker carries a key made in the browser. If a save times out and the
person taps again, the server finds the first attempt by that key instead of
adding a second copy.

Rating a day sends just that day (`{ rate: { day, stars } }`), and the server
adds it to the ratings it has, so a day Claude rated meanwhile is kept. A
signed-in page reads the account's trackers again when it regains focus or
comes back into view, unless one of its own saves is under way or started
since it asked; then what Claude added shows without a reload.

### The tools

| Tool | Risk | What it does |
| --- | --- | --- |
| `trackers.list` | read | Trackers with days left, to start or since |
| `trackers.get` | read | One tracker with every rated day |
| `trackers.create` | write | Add a tracker by days or end date |
| `trackers.update` | write | Change title, subtitle, icon or dates |
| `days.rate` | write | 1 to 5 stars for a day, or 0 to clear |
| `trackers.delete` | destructive | Delete a tracker and its ratings |

A tracker can be named by its id or, when only one has it, its title. Every
tool takes `today`, the person's own date: the server has no time zone, so
without it a tool uses today in UTC.

The rating uses Holm's own feed-stars 0.0.3 from jsDelivr, pinned to commit
`9a7a089cadc57f338f393ec56e1460cbd725b0ce`, in its `v-0.0.3/` folder, with a
SHA-384 integrity hash in `web/src/app.js`. Check the target's CSP; plain
stars stand in if it cannot load.

## Deploy your own

```bash
holm app validate --spec-v1 ./until
holm @<peer> app deploy ./until --spec-v1 --host until.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Signing in needs a sign-in method enabled on the
node (email links or an OAuth provider); without one, Until still works on
each device. After the first deploy, inspect the settings schema and set the
hosted sign-in page's `settings.apps.<app-id>.brand.name`, `brand.icon_url`
and `theme.accent` on the peer.

## Known limits

- Days are counted in the device's time zone; a tracker has no time of day.
  The tools can't know that zone, so Claude passes the person's date, or the
  tools use today in UTC, which can be a day off.
- The tools see only trackers kept in the account. Trackers made while signed
  out stay in that browser until you sign in there and move them over.
- Holm doesn't tell an app whether someone has connected Claude, so the sheet
  shows no connection status.
- Ratings are a single number per day, with no notes and no chart of them yet.
- Up to 500 trackers per member.
- Offline, a signed-in member can look but not change anything; changes are
  not queued for later.
- Signed-out trackers live in one browser. Clearing its storage loses them;
  signing in and moving them to the account is the way to keep them.
- Service workers need HTTPS (or `localhost`), so the offline copy doesn't
  work on a plain-HTTP test host.

## Testing

On a scratch node, `holm test create-session` makes a signed-in session for a
member on the app's exact host. Check a signed-out browser first (add, rate,
edit, delete, reload), then sign in with its storage still there and move the
trackers over. On HTTPS or `localhost`, go offline and reload to see the
synced copy. Look at a phone and a desktop in light and dark, in both colours.

To try the tools without an MCP client, POST JSON to `/api/<tool>` (such as
`/api/trackers.list`) with that session's `holm_session` cookie and an
`Origin` header for the app's host. Check each tool as two members, so one
can't reach the other's trackers, and that a signed-out call gets 401.

## Licenses

- App code: MIT, like the rest of this repository.
- Manrope: SIL Open Font License 1.1, in [`web/fonts/OFL.txt`](web/fonts/OFL.txt).
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
