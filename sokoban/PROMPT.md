# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not an additional
instruction or source.

## Build from scratch

```text
Build "Sokoban", a calm box-pushing puzzle for phones, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make holm.json,
public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for storage and
sign-in, return standard Responses and fall back to env.holm.web.fetch(request).
No build step or third-party runtime CDN; vendor the icons with their licence.

- Nineteen levels in the classic notation, easy to hard, each with a par: the
  fewest pushes that solve it. Write a script that solves every level to
  prove its par. Credit any level taken from a freely shared set.
- Draw the board on a canvas in soft pastel colours, with a slide for each
  step. Swipe anywhere in the play area to walk, tap a square to walk there,
  tap a box beside the player to push it; arrow keys on a computer. Undo
  takes back a whole action, and a restart can be undone.
- After a win, show the points and a focused "Next level" button, so Enter
  goes on, and make a reload open the next level. Every level stays open.
- Signed out, keep progress in localStorage; the game needs no server. Signed
  in, send each solve as a LURD string. The server replays it with the same
  rules file, keeps the member's bests in member KV, and keeps one leaderboard
  row per member in a shared collection. Sign-in sends the device's solves.
- Five colour sets, each light and dark or following the device, and a sound
  switch in the account menu. Installable, with a network-first service
  worker, so it plays offline.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 sokoban. With my approval, deploy with
holm @<peer> app deploy sokoban --spec-v1 --host sokoban.<my-domain>.
Never replace an occupied host without asking. Validation does not run the
app: test the level flow, touch and keyboard, signing in with solves on the
device, a refused bad solution, going offline, and mobile/desktop in
light/dark. Report gaps honestly. Inspect the target settings schema before
setting sign-in branding.
```

## The original request

Sokoban was first written in another repository, with a copy of a
pre-release Holm SDK and server code in Holm's original app format. This
folder is its rewrite without either, from this message, typed as-is to a
coding agent:

> Yes, lets do sokoban next
> - this is our first game
> - we need to refine it with the adaptation
> - i dont remember but the game mechanics of proceed to next level, arrow buttons has some issue
> - i think the default didnt proceed to next level or so?
> - anyways look at it and see if you can improve while moving
