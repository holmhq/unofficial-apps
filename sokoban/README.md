# Sokoban

A calm box-pushing puzzle on [Holm](https://holmhq.com). Push every box onto a
ring in nineteen levels, each with a par: the fewest pushes that solve it. It
plays on a phone straight away, with no account and, once installed, no
network; sign in and your solved levels count on a leaderboard that replays
every solution before it believes it.

It was rebuilt from the request quoted in [`PROMPT.md`](PROMPT.md), which
also has a reusable version of it.

## Holm App Spec v1

Sokoban follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage and
sign-in. `web.spa` is on; the node runs no build. Every deploy needs
`--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are not
public URLs.

## What it does

- **Playing:** swipe anywhere in the play area to walk, and keep dragging to
  keep walking. Tap a square to walk straight there, or tap a box beside you
  to push it. On a computer, arrow keys or WASD walk.
- **Undo and restart:** Z (or the undo button) takes back a whole action at
  once: a tapped walk, a key press, a push. Restart (R) can be undone too.
- **Levels:** solving one shows its points and offers the next level, with
  the focus on that button, so Enter or Space goes on. Reloading at that
  point opens the next level, not the one just solved. The arrows beside the
  level name and the level list jump anywhere; every level is open.
- **Points:** a level is worth 1000 at par and 50 less for each push over,
  down to 100. Your score is the sum of your best result on each level.
- **No account needed:** signed out, progress stays in the browser and the
  game needs no server at all.
- **Signed in:** the page sends each solve to the server, which replays it
  move by move and keeps it only if it solves the level. Your bests follow
  you to every device, and signing in sends the solves already on the device.
- **Looks:** five pastel colour sets, each in light and dark or following the
  device, and soft sounds that can be turned off, all in the account menu.
  The page never scrolls; the board sizes itself to the screen.

## How it is built

```text
holm.json               identity, web.spa, what stays out of deploy
holm.symbol.svg         app icon: a crate
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             every route: who is signed in, leaderboard, progress
api/rules.js            exact copy of web/src/rules.js, for the server
web/index.html          the page shell, with the saved look applied before first paint
web/sw.js               network-first offline cache of the page's files
web/src/rules.js        moves, solution check, scoring and the nineteen levels
web/src/game.js         the play screen: move queue, animation, undo, cards
web/src/controls.js     keyboard, swipe and tap
web/src/render.js       draws the board on a canvas
web/src/ui.js           navbar, account menu, level list, leaderboard, toasts
web/src/app.js          start-up, sign-in and sending solves to the server
web/src/state.js        what this browser remembers
web/src/theme.js        the colour sets and light/dark
web/src/audio.js        the sounds, made with Web Audio
web/src/icons.js        the Lucide icons it uses, copied in
web/vendor/lucide/      the Lucide licence
tools/check.mjs         release check for the rules and levels (not deployed)
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Shared document store, `env.holm.app.ds`:** the collection `scores`, one
  row per member with their best total, read for the leaderboard.
- **Member key-value store, `env.holm.app.member.kv`:** `progress`, the
  member's best result and solution on each level. Only they can read it.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **`env.holm.web.fetch`:** serves everything that isn't under `/api/`.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

A solution travels as the LURD string Sokoban players share: one letter per
step, upper case for a push. The server replays it with the same rules file
the page plays with, so a score on the board always comes from moves that
really solve the level. The server can import only files under `api/`, and
a deploy refuses symlinks, so `api/rules.js` is a copy of
`web/src/rules.js`. After changing the rules or levels, copy the file across
and run `node tools/check.mjs`: it fails if the copies differ, solves every
level to confirm its par, and replays each full solution through the
server's check. `--solutions` prints one solution per level.

## Deploy your own

```bash
node sokoban/tools/check.mjs
holm app validate --spec-v1 ./sokoban
holm @<peer> app deploy ./sokoban --spec-v1 --host sokoban.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Signing in needs a sign-in method enabled on the
node (email links or an OAuth provider); without one, the game still plays
on every device and the leaderboard stays empty. After the first deploy,
inspect the settings schema and set the hosted sign-in page's
`settings.apps.<app-id>.brand.name`, `brand.icon_url` and `theme.accent` on
the peer.

## Known limits

- Leaderboard names and pictures come from members' profiles and are shown
  to everyone. The board shows the top 50 of up to 500 members.
- Rows saved by the earlier version of this app, before solutions were
  checked, keep their score until the member's checked total passes it.
- Signed out, progress lives in one browser; clearing its storage loses it.
  Results saved there before solutions were kept still show, but can't be
  sent to the leaderboard.
- Ties rank by fewer pushes; moves count only towards each level's best.
- There is no level editor, and the levels are the same for everyone.
- Service workers need HTTPS (or `localhost`), so the offline copy doesn't
  work on a plain-HTTP test host.

## Testing

`node tools/check.mjs` covers the rules and levels. On a scratch node,
`holm test create-session` makes a signed-in session for a member on the
app's exact host. Play a few levels signed out (swipe, tap, undo, restart,
reload after a win), then sign in with the same browser storage and check
that the solves arrive on the leaderboard. Send a wrong solution to
`POST /api/progress` and see it refused. On HTTPS or `localhost`, go offline
and reload. Look at a phone and a desktop in light and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Levels credited in `web/src/rules.js` to David W. Skinner come from his
  Microban set, which he allows to be shared freely with credit; the rest
  were made for this game.
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
