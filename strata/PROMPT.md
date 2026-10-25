# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not an additional
instruction or source.

## Build from scratch

```text
Build "Strata", a calm falling-block game for phones, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make holm.json,
public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for storage and
sign-in, return standard Responses and fall back to env.holm.web.fetch(request).
No build step or third-party runtime CDN; vendor the icons with their licence.

- A 10 × 20 field with the seven four-cell pieces dealt from shuffled bags of
  seven, wall kicks, hold, a ghost, soft and hard drops, T-spins,
  back-to-back and combo points. A gentle pace that levels off at level 15.
- Calm, not frantic: warm earth colours (sandstone, ochre, clay, sage) on
  paper by day and night sand after dark, faint sediment bands behind the
  field, a piece that glides between rows, full rows that dissolve and then
  settle, soft pentatonic sounds, no screen shake, and a quiet word for each
  clear. Four colour sets, each light and dark or following the device.
- Touch anywhere in the play area: tap to turn, drag to move, flick down to
  drop, swipe up to hold. Keys on a computer. Pause with a button; a hidden
  tab pauses, and a reload carries on the same game.
- Rules in one file with no clock or Math.random: a game is a seed and its
  inputs stamped with frame numbers. Signed in, send each new best as
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

Run holm app validate --spec-v1 strata. With my approval, deploy with
holm @<peer> app deploy strata --spec-v1 --host strata.<my-domain>.
Never replace an occupied host without asking. Validation does not run the
app: test play by touch and keys, pause and reload, signing in with a best
game on the device, a refused forged score, a long game's replay on the
node, going offline, and mobile/desktop in light/dark. Report gaps honestly.
Inspect the target settings schema before setting sign-in branding.
```

## The original request

Strata began as a Tetris-style game in another repository, written with a
copy of a pre-release Holm SDK and server code in Holm's original app format.
This folder is its rewrite without either, from this message, typed as-is to
a coding agent:

> try adapting tetris into the store
> - change name
> - and theme
> - many are now violet/green, lets make a differnce with this
> - try to refine it
> - make it calm like sokoban

The agent then asked one question, and this option was picked for the name
and colours: "Strata · sandstone (Recommended)".
