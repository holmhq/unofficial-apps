# Snake

A calm snake game on [Holm](https://holmhq.com). Guide the snake to the
berries; each one makes it longer, and the field wraps at its edges, so only
your own tail is in the way. It plays on a phone straight away, with no
account and, once installed, no network; sign in and your best game goes on
a leaderboard, after the server has replayed it from the first move to the
last.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which
also has a reusable version of it. It shares its shell, its look and its
checked leaderboard with [Strata](../strata/).

## Holm App Spec v1

Snake follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage and
sign-in. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are not
public URLs.

## What it does

- **Playing:** a 15 × 25 field that wraps at its edges. A berry adds a cell
  and 10 points times the level. Every sixth berry a bloom opens for 40
  steps, worth 50 times the level, with a ring that shows how long it will
  stay. The game ends when the snake runs into itself, fills the field, or
  after two hours of play.
- **Touch, anywhere in the play area:** swipe the way to go. One drag can
  turn more than once: after a turn, keep moving the finger the new way.
  The buttons below the field turn left and right of the way the snake is
  heading, and up to three turns can wait for the next step.
- **Keys:** arrows or WASD turn, P, Esc or Space pause, Enter plays or
  resumes.
- **Calm:** the snake starts at five and a half cells a second and speeds
  up a little every five berries, levelling off at ten. It is drawn as one
  soft line that narrows towards the tail and slides into each new cell;
  where it crosses an edge it slips off one side and back on at the other.
  Each berry plays the next note of a slow pentatonic tune. The end card
  waits a moment before it takes a key or tap, so a turn meant for the game
  can't start a new one.
- **Never lost:** a hidden tab pauses the game, and the game in progress is
  saved as it goes, so a reload or a closed tab carries on where it stopped.
- **No account needed:** signed out, your best game stays in the browser and
  the game needs no server at all.
- **Signed in:** a new best goes to the server, which replays it and keeps it
  only if it ends on the same score. Signing in sends the best game already
  on the device, and your best follows you to other devices.
- **Looks:** four colour sets (Coral, Koi, Lagoon and Ash), each in light and
  dark or following the device, and sound, all in the account menu. The
  page never scrolls; the field sizes itself to the screen.

## How it is built

```text
holm.json               identity, web.spa, what stays out of deploy
holm.symbol.svg         app icon: a snake bent into an S, with an eye
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             every route: who is signed in, leaderboard, best game
api/rules.js            exact copy of web/src/rules.js, for the server
web/index.html          the page shell, with the saved look applied before first paint
web/sw.js               network-first offline cache of the page's files
web/src/rules.js        the game: moves, berries, blooms, records and replay
web/src/game.js         the play screen: frame loop, record, saving, cards
web/src/controls.js     swipes and keys
web/src/render.js       draws the field and the snake on a canvas
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
  best game with its seed and turns. Only they can read it.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **`env.holm.web.fetch`:** serves everything that isn't under `/api/`.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

### Games the server can check

As in Strata, `rules.js` has no clock and no `Math.random`. Time runs in
frames, 60 to a second, only while the game is playing, and berries and
blooms land where a small seeded generator puts them. So a game is its seed
and its turns, each stamped with its frame, kept as text: the frames since
the last turn in base 36, then `U`, `D`, `L` or `R`. A game of a hundred
berries is under a kilobyte.

`POST /api/games` takes `{ seed, log, score }`, replays the game with the
same rules file, and refuses it (422) unless it ends, by the rules, on that
score. The server can import only files under `api/`, and a deploy refuses
symlinks, so `api/rules.js` is a copy of `web/src/rules.js`. The runtime
counts every allocation in a request against a budget of about 50 MiB, so
the snake lives in typed arrays (a ring of cells and a map of taken ones)
and the replay jumps from one move to the next instead of stepping every
frame; a game left to circle for the full two hours replays in about 0.1 s
on a local node. `node tools/check.mjs` fails if the copies differ, plays
bot games and checks that the replay matches frame-by-frame play exactly,
and checks that broken records are refused.

## Deploy your own

```bash
node snake/tools/check.mjs
holm app validate --spec-v1 ./snake
holm @<peer> app deploy ./snake --spec-v1 --host snake.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Signing in needs a sign-in method enabled on the
node (email links or an OAuth provider); without one, the game still plays
on every device and the leaderboard stays empty. After the first deploy,
inspect the settings schema and set the hosted sign-in page's
`settings.apps.<app-id>.brand.name` to `Snake`, `brand.icon_url` to
`/icon-192.png` and `theme.accent` to `#c4607a` on the peer.

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
the app's exact host. Play signed out by swipe, buttons and keys, pause and
reload mid-game, then sign in with the same browser storage and check that
the best game reaches the leaderboard. Send a record with a changed score to
`POST /api/games` and see it refused. On HTTPS or `localhost`, go offline and
reload. Look at a phone and a desktop in light and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
