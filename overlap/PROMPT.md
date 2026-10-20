# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "overlap", a group scheduling app, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 first.
Make holm.json, public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for storage,
sign-in and realtime, return standard Responses and fall back to
env.holm.web.fetch(request). No build step or third-party runtime CDN; vendor
any font with its licence.

- A signed-in organiser creates a plan: a name, an optional note, up to 14
  dates picked on a calendar by pressing and dragging across days, a daily
  window, 15/30/60-minute slots and a time zone.
- Anyone with the link answers with just a name (no sign-up) and paints the
  times they are free: press and drag a rectangle that fills or clears. Keep
  an edit key in the browser and store only its SHA-256 hash; signed-in
  people edit from anywhere. Undo, keyboard painting, and touch that paints
  instead of scrolling.
- Two views: "My times" over a faint heatmap of everyone, and "Everyone" as a
  heatmap. Tooltips name who is free and give the viewer's local time.
  Ranked best times with who is missing; the organiser picks one and every
  open page shows it settled, with a calendar file and a Google Calendar link.
- Broadcast every change on a realtime channel per plan; flash other people's
  changes in their colour, show who has the page open, reconnect and catch up.
- Exceptional, warm design: an elegant serif for headings, light/dark/system
  themes, excellent on phones and desktop. Soft Web Audio sounds (a
  pentatonic note per painted slot, a chord when a time settles) with a mute
  switch, small spring motions and confetti, all respecting reduced motion.
- Give each plan page its own title and link preview, noindex. Never show the
  organiser's email.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 overlap. With my approval, deploy with
holm @<peer> app deploy overlap --spec-v1 --host overlap.<my-domain>.
Never replace an occupied host without asking. Validation does not run the
app: test an organiser and an anonymous person in two browsers, live
updates both ways, settling a time, and mobile/desktop in light/dark. Report
gaps honestly. Inspect the target settings schema before setting sign-in
branding.
```

## The original requests

The app in this folder came from these messages, typed as-is to a coding
agent, which chose the subject itself.

**Iteration 1**

> I wish you can be creative here and pick what you think is idea; my wish is it: that its an exceptional work in aesthetics and attention to detail; is very delightful to use, has exmplary UI/UX, perhaps sounds/motion design etc, so that the experience looks polished for a demo app
> - i would like to then use it as the next app in our unofficial app store
> - even though we are making it an official demo app, i think we should move it out to unofficial app store for now; we will eventually build the official ones and the best here will move there

and, sent while the agent was working:

> So, making something useful would be great
