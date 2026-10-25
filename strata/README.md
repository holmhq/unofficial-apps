# Strata

A calm falling-block game on [Holm](https://holmhq.com). Fit the falling
pieces into full rows; each full row clears and the layers above settle
down. It plays on a phone straight away, with no account and, once
installed, no network; sign in and your best game goes on a leaderboard,
after the server has replayed it from the first piece to the last.

It was rebuilt from the request quoted in [`PROMPT.md`](PROMPT.md), which
also has a reusable version of it.

## Holm App Spec v1

Strata follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage and
sign-in. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are not
public URLs.

## What it does

- **Playing:** the seven four-cell pieces, dealt from shuffled bags of seven,
  fall into a 10 × 20 field. Rotation kicks off walls, hold keeps one piece
  for later (one swap per piece), and a ghost shows where the piece will land
  (it can be turned off). A grounded piece waits half a second before it
  locks, and moving it restarts that wait a limited number of times.
- **Touch, anywhere in the play area:** tap to turn, two-finger tap to turn
  the other way, drag sideways to move (the piece follows the finger column
  by column), drag down for a soft drop, flick down to drop, swipe up to
  hold. Once a downward pull starts the column stays put, so a drifting thumb
  can't nudge the piece. Buttons below the field hold, pause and turn.
- **Keys:** ← → or A D move (held keys repeat), ↓ or S soft drop, ↑, X or W
  turn, Z or Ctrl turn the other way, Space drops, C or Shift holds, P or Esc
  pauses, Enter plays or resumes.
- **Calm:** the pace starts at a second a row and levels off at a tenth of a
  second at level 15 (a level every ten lines). Full rows dissolve from the
  middle out, then the stack settles smoothly; the falling piece glides
  between rows. A quiet word names each clear, sounds are soft pentatonic
  tones, and nothing shakes. The end card waits a moment before it takes a
  key or tap, so a drop meant for the game can't start a new one.
- **Points:** guideline scoring: 100, 300, 500 and 800 for one to four rows,
  more for T-spins, half as much again for back-to-back four-row clears and
  T-spins, and a bonus for clears in a row, all times the level; plus a
  point a row for a soft drop and two for a hard drop.
- **Never lost:** a hidden tab pauses the game, and the game in progress is
  saved as it goes, so a reload or a closed tab carries on where it stopped.
  A game ends when the stack reaches the top, or after two hours of play.
- **No account needed:** signed out, your best game stays in the browser and
  the game needs no server at all.
- **Signed in:** a new best goes to the server, which replays it and keeps it
  only if it ends on the same score. Signing in sends the best game already
  on the device, and your best follows you to other devices.
- **Looks:** four colour sets (Sandstone, Canyon, Shore and Ash), each in
  light and dark or following the device, and sound, all in the account
  menu. The page never scrolls; the field sizes itself to the screen.

## How it is built

```text
holm.json               identity, web.spa, what stays out of deploy
holm.symbol.svg         app icon: a block dropping into a gap between layers
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             every route: who is signed in, leaderboard, best game
api/rules.js            exact copy of web/src/rules.js, for the server
web/index.html          the page shell, with the saved look applied before first paint
web/sw.js               network-first offline cache of the page's files
web/src/rules.js        the game: pieces, kicks, scoring, records and replay
web/src/game.js         the play screen: frame loop, record, saving, cards
web/src/controls.js     touch gestures and keys
web/src/render.js       draws the field and previews on canvases
web/src/ui.js           navbar, account menu, leaderboard, toasts
web/src/app.js          start-up, sign-in and sending games to the server
web/src/state.js        what this browser remembers
web/src/theme.js        the colour sets and light/dark
web/src/audio.js        the sounds, made with Web Audio
web/src/icons.js        the Lucide icons it uses, copied in
web/vendor/lucide/      the Lucide licence
tools/check.mjs         release check for the rules (not deployed)
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Shared document store, `env.holm.app.ds`:** the collection `scores`, one
  row per member with their best game, read for the leaderboard.
- **Member key-value store, `env.holm.app.member.kv`:** `best`, the member's
  best game with its seed and inputs. Only they can read it.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **`env.holm.web.fetch`:** serves everything that isn't under `/api/`.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

### Games the server can check

`rules.js` has no clock and no `Math.random`. Time runs in frames, 60 to a
second, and only while the game is playing; the pieces come from a small
seeded generator. So a game is just its seed and its inputs, each stamped
with the frame it happened on, and the same seed and inputs always play out
the same way. The page keeps only the inputs that changed something, as
text: for each one, the frames since the last in base 36, then a letter
(`C9L3LkH` is a turn on frame 0, left on 9 and 12, a drop on 32). A
ten-minute game is about 13 KB.

`POST /api/games` takes `{ seed, log, score }`, replays the game with the
same rules file, and refuses it (422) unless it ends, by the rules, on that
score. The server can import only files under `api/`, and a deploy refuses
symlinks, so `api/rules.js` is a copy of `web/src/rules.js`.

The runtime gives each request a budget of about 50 MiB of allocations, and
it counts short-lived objects too, so playing a long game frame by frame
used it up. The replay reads the record as it goes and jumps from event to
event (a row of fall, a lock, the end of a clear) instead of stepping every
frame, and its hot paths build no arrays, objects, closures or strings. On a
local node it replays a 37-minute game of 9,000 pieces in about 0.6 s and
could check eight such games in one request, so a two-hour game should take
about 2 s, well inside the request's time limit. `node tools/check.mjs` fails if the copies differ, plays bot games and
checks that the server's replay matches frame-by-frame play exactly, and
checks that broken records are refused.

## Deploy your own

```bash
node strata/tools/check.mjs
holm app validate --spec-v1 ./strata
holm @<peer> app deploy ./strata --spec-v1 --host strata.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Signing in needs a sign-in method enabled on the
node (email links or an OAuth provider); without one, the game still plays
on every device and the leaderboard stays empty. After the first deploy,
inspect the settings schema and set the hosted sign-in page's
`settings.apps.<app-id>.brand.name` to `Strata`, `brand.icon_url` to
`/icon-192.png` and `theme.accent` to `#c98b2b` on the peer.

## Known limits

- A replay proves a game followed the rules, not that a person played it: a
  bot could play a game and send it. The page also chooses its own seed.
- Leaderboard names and pictures come from members' profiles and are shown
  to everyone. The board shows the top 50 of up to 500 members.
- Only each member's best game is kept; there is no history of games.
- Signed out, the best game lives in one browser; clearing its storage loses
  it.
- Service workers need HTTPS (or `localhost`), so the offline copy doesn't
  work on a plain-HTTP test host.

## Testing

`node tools/check.mjs [games]` covers the rules and the replay. On a scratch
node, `holm test create-session` makes a signed-in session for a member on
the app's exact host. Play signed out by touch and keys (turn, move, soft
and hard drop, hold, pause), reload mid-game, then sign in with the same
browser storage and check that the best game reaches the leaderboard. Send a
record with a changed score to `POST /api/games` and see it refused. Post a
long bot game to check the replay fits the node's budget. On HTTPS or
`localhost`, go offline and reload. Look at a phone and a desktop in light
and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
