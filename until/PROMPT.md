# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not an additional
instruction or source.

## Build from scratch

```text
Build "Until", a day-countdown app for phones, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make holm.json,
public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for member
storage and sign-in, return standard Responses and fall back to
env.holm.web.fetch(request). No build step or third-party runtime CDN; vendor
the font and icons with their licences.

- A tracker has a title, an optional subtitle, a start date, and either a
  number of days or an end date, plus a random icon you can re-roll. Cards show
  the days left in big numbers (a dash before it starts, "Today" on the last
  day, days since after), running ones first.
- Tap a card to rate any day so far from one to five stars, stepping through
  the days; show today's rating on the card.
- Signed out, keep trackers in localStorage. Signed in, keep them in the
  member's own document store and the colour choice in member KV; offer to
  move the device's trackers over once, skipping duplicates. A browser-made
  key on each new tracker makes a retried save find the first attempt.
- Two colours, green and pink, each light and dark or following the device,
  in the account menu. Installable, with a network-first service worker; offline,
  show the last synced copy read only.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 until. With my approval, deploy with
holm @<peer> app deploy until --spec-v1 --host until.<my-domain>.
Never replace an occupied host without asking. Validation does not run the
app: test signed out and signed in, moving trackers over, going offline, and
mobile/desktop in light/dark. Report gaps honestly. Inspect the target
settings schema before setting sign-in branding.
```

## The original request

Until was first written as a Vue app with a build step, in another
repository. This folder is its rewrite without one, from this message, typed
as-is to a coding agent after it had checked the old app against App Spec v1:

> Yes, rewrite and import
