# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Snake", a calm snake game for phones, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make holm.json,
public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for storage and
sign-in, return standard Responses and fall back to env.holm.web.fetch(request).
No build step or third-party runtime CDN; vendor the icons with their licence.

- A 15 × 25 field that wraps at its edges, so only the snake's own body is in
  the way. Each berry adds a cell and points; every sixth berry a bloom
  opens for a while, worth more. The pace rises every five berries and
  levels off at ten cells a second.
- Calm, not frantic: dusty rose on rose paper by day and a deep plum night,
  a faint grid of dots, a snake drawn as one soft line that narrows to the
  tail and moves a whole cell at a time, a breathing berry, and each berry
  playing the next note of a slow pentatonic tune. Four colour sets, each
  light and dark or following the device.
- Swipe anywhere in the play area to turn (one drag can turn more than once),
  turn-left and turn-right buttons, arrow keys or WASD on a computer. Pause
  with a button; a hidden tab pauses, and a reload carries on the same game.
- Rules in one file with no clock or Math.random: a game is a seed and its
  turns stamped with frame numbers. Signed in, send each new best as
  { seed, log, score }; the server replays it with the same rules file,
  keeps the member's best in member KV and one leaderboard row per member in
  a shared collection. Signed out, keep the best in localStorage and send it
  after sign-in. Mind the runtime's per-request allocation budget: replay a
  long game without allocating every frame. Write a script that plays bot
  games and checks that they replay exactly.
- Installable, with a network-first service worker, so it plays offline.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 snake. With my approval, deploy with
holm @<peer> app deploy snake --spec-v1 --host snake.<my-domain>.
Never replace an occupied host without asking. Validation does not run the
app: test play by swipe, buttons and keys, pause and reload, signing in with
a best game on the device, a refused forged score, a long game's replay on
the node, going offline, and mobile/desktop in light/dark. Report gaps
honestly. Inspect the target settings schema before setting sign-in
branding.
```

## The original requests

Snake was written alongside [Strata](../strata/), the calm falling-block
game, from this message, typed as-is to a coding agent while it was
building Strata:

> dont ask anything more just get it done; i am off to sleep
> - if possible build a snake game in similar style too

Version 0.1.1 came from this follow-up, after Strata 0.1.1 had stopped its
pieces gliding and the first Snake still slid smoothly into each cell:

> Can we make the snake also quantised?
