# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Kalendar", a Calendly-like booking app, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make holm.json
(web.spa true), public web/ files and api/main.js exporting default
{ fetch(request, env) }, with booking and cancelling as public named
operations behind Holm's challenge and rate limits. No build step or
third-party runtime CDN; vendor Inter and Lucide icons with their licences.

- A signed-in person chooses a link (/@handle), their time zone and weekly
  hours (several ranges a day, days off), and event types (title, link,
  length, where: video link, phone, address or other; notice, how far
  ahead, start-time step, free time before and after, colour, on/off).
- Anyone opens /@handle or /@handle/event and books without an account:
  pick a day, a time in their own time zone (12- or 24-hour), then name,
  email and notes. Never double-book; a taken time disappears.
- The server has no Intl, so have the host's browser send its zone's UTC
  offsets for the next year and turn hours into real times on the server.
- Email both sides with env.holm.email: beautifully designed HTML (tables,
  inline styles, dark mode) plus plain text, with Add to Calendar links for
  Google, Outlook.com and a hosted .ics. Emailed links let the guest move or
  cancel; the host can cancel from their list. Give the host a private
  calendar feed.
- An Apple-quality UI on phone and desktop: a round avatar button top right
  (signed out too) with light/dark/auto, sounds and 24-hour time; fine
  motion, quiet Web Audio sounds, and Inter weights that mean something.
  Installable, with a network-first service worker.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 kalendar. With my approval, deploy with
holm @<peer> app deploy kalendar --spec-v1 --host kalendar.<my-domain>, then
ask before enabling email for the app. Test booking, double-booking,
rescheduling, cancelling, time zones across daylight saving, phone and
desktop, light and dark, and sign in and out as a real person would.
```

## The original request

Kalendar was built from this message, passed to a coding agent (the
handle is replaced here):

> Build kalendar
> - a calendly clone with apple-esque design
> - and esquisite attention to detail
> - build such that folks can pick time without sign-up
> - email should be sent with calendar invitation
> - email template should be designed very well
> - very fine motion / sound / info architecture design should be done so that this works very well in desktop & mobile
> - use lucide icons & inter font (with nice/intentional font weight variations to signify conceptual variants)
> - make avatar round& the top right corner
> - have light/dark/system colors
> - should be possible to send one's calendar like this: kalendar.zyt.app/@\<handle\>
