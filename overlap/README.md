# overlap

Find the time that works for everyone, on [Holm](https://holmhq.com). An
organiser picks a few dates and a daily window and shares one link. Everyone
paints the times they are free, with just a name, and the grid deepens in
colour where people overlap, live, on every open screen.

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of them.

## Holm App Spec v1

overlap follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage, sign-in
and realtime. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`, and realtime needs node 0.242.0 or newer. Only `web/` is served
as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Plan:** a signed-in organiser names the plan, adds an optional note, picks
  up to 14 dates on a calendar (press and drag across days), sets the daily
  window and a slot length of 15, 30 or 60 minutes, and chooses a time zone.
- **Answer:** anyone with the link types a name and paints the times they are
  free: press on a slot and drag a rectangle; it fills if the first slot was
  empty and clears if it was yours. A tap marks one slot. The browser keeps a
  private key so the same device can change its answer later; signed-in people
  can change theirs from anywhere. Ctrl+Z (⌘Z) undoes the last stroke, and
  the arrow keys and Space work without a mouse.
- **See it overlap:** "My times" shows your coral marks over a faint view of
  everyone else; "Everyone" is a heatmap from empty to all free. Point at a
  slot for who is free and who is not, and at a person to see only their times.
  The grid stays in the plan's own time zone; a note and every tooltip give the
  viewer's local time when the zones differ.
- **Best times:** runs of slots where the same people are free, ranked by how
  many can make it and then by length, with who is missing.
- **Settle:** the organiser picks a time; every open page shows it in a gold
  banner at once, with confetti, a chord, a calendar file and a Google
  Calendar link. The organiser can reopen it, edit the name and note, remove
  people, or delete the plan.
- **Live:** changes from other people flash in their colour and arrive with a
  quiet sound; avatars show who has the page open now.
- **Sound and motion:** painting plays a pentatonic note per slot, lower for
  later times, synthesised with the Web Audio API (no audio files). Sound can
  be turned off; motion respects "reduce motion".
- **Claude and other AI apps:** eight MCP tools, open to anyone signed in:
  - `plans_list`: the plans you organised or answered.
  - `plans_get`: who is free when, the best times with who is missing, and
    the settled time.
  - `plans_create`: a new plan and its link to share.
  - `times_set`: mark when you're free, joining the plan if you haven't
    answered; replace, add or clear ranges, on one date or every date.
  - `plans_settle`, `plans_update`, `people_remove`, `plans_delete`: the
    organiser picks or reopens the time, renames the plan, removes an
    answer or deletes the plan.

  Times are 24-hour, in the plan's own zone, which every answer names. Each
  tool sends its change through the app's own routes, so the same checks
  apply and every open page updates live. **Connect via MCP…** in the
  account menu opens a sheet with the connector address
  (`https://<host>/_holm/mcp`) to click and copy, and tabs for Claude,
  ChatGPT, Claude Code and what the tools do.
- A plan's link, in its share sheet, copies with one click.
- Light, dark and system themes; phones and big screens.

## How it is built

```text
holm.json               identity, web.spa, no generated web surface, store
                        listing exclusion
holm.symbol.svg         app icon: two crescents around the space they share
api/main.js             every route: plans, people, presence, plan pages;
                        and the MCP tools' handlers, which load ops.js
api/contract.json       the MCP tools: named operations, their input and errors
api/ops.js              the tools, sent through the same /api/ routes
web/index.html          the page shell
web/css/app.css         the whole look: tokens, light/dark, layout, motion
web/js/app.js           router, theme and sound toggles, the account menu
web/js/home.js          home page and its looping demo grid
web/js/create.js        the new-plan form and its calendar
web/js/plan.js          a plan: grid, panels, sharing, settling, live updates
web/js/grid.js          the availability grid: painting, keyboard, tooltips
web/js/live.js          the realtime channel and presence heartbeats
web/js/time.js          time zones, labels, best times, calendar files
web/js/sound.js         the synthesised sounds
web/js/mcp.js           the Connect via MCP sheet
web/js/ui.js            DOM helpers, avatars, toasts, confetti, copy fields
web/fonts/              Instrument Serif (OFL), vendored
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Document store, `env.holm.app.ds`:** `plans` (dates, window, organiser,
  settled time) and `people` (name, colour, availability as a string of `0`
  and `1`, and the SHA-256 hash of their edit key). Deleting a plan deletes its
  people in one `ds.transaction`.
- **Key-value store, `env.holm.app.kv`:** a few seconds of presence
  de-duplication, with a TTL, and the address the app was last opened at,
  for the tools' links.
- **Sign-in, `env.holm.auth`:** organisers sign in on the node's own page;
  `getMember()` decides who owns a plan and who may change an answer.
- **Realtime, `env.holm.realtime`:** every change is broadcast on the plan's
  public channel `plan-<id>`; pages subscribe over `/_ws`, answer pings,
  reconnect with back-off and reload the plan after a gap. `realtime.count`
  reports how many are watching.
- **Named operations and MCP:** `api/contract.json` declares eight
  operations with `auth: "user"`, which Holm serves as tools at
  `/_holm/mcp` with OAuth sign-in. Each builds a `Request` for the app's own
  `/api/` route and runs it through `fetch` as the signed-in person.
- **`env.holm.web.fetch`:** serves the app's files and, for `/p/<id>`, the page
  shell with the plan's name in its title and link previews.

Edit keys come from `crypto.randomUUID()` and are stored only as hashes made
with `crypto.subtle`. A plan's id is ten random characters; anyone with the
link can read the plan and add an answer, so do not put secrets in a plan.

## Deploy your own

```bash
holm app validate ./overlap --spec-v1
holm @<peer> app deploy ./overlap --spec-v1 --host overlap.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Organisers need a sign-in method enabled on the
node (email links or an OAuth provider). After the first deploy, inspect the
settings schema and set the hosted sign-in page's
`settings.apps.<app-id>.brand.name`, `brand.icon_url` and `theme.accent` on the
peer.

## Known limits

- Plans cover specific dates, up to 14, and one daily window; there are no
  weekly ("every Monday") plans and no all-day votes.
- Answers are per device unless the person signs in; clearing the browser's
  storage loses the key, and the organiser can remove the old answer.
- Presence is best effort: a closed laptop disappears from "here now" after
  about 50 seconds.
- The grid is drawn in the plan's time zone. Viewers elsewhere see their local
  time in the note and tooltips, not as relabelled rows.
- Up to 100 people per plan and 200 plans per organiser.
- The tools give times in the plan's own zone: the server has no `Intl`, so
  converting to the person's zone is left to Claude. Their links use the
  address overlap was last opened at.
- Signed out, the header shows a Sign in button rather than a round avatar.

## Testing

Run it on a scratch node: `holm test create-session` makes a signed-in
session for a member on the app's exact host, so a browser test can play the
organiser while a second browser context answers anonymously. Check that the
second context's paint appears live in the first, that settling a time shows
the banner on both, and the layout on a phone and a desktop in light and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Instrument Serif: SIL Open Font License 1.1, in
  [`web/fonts/OFL.txt`](web/fonts/OFL.txt).
