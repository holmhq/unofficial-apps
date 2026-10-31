# Kalendar: managing someone's booking page

Kalendar gives the person a public page (`/@handle`) where anyone can book time with
them without an account, one link per kind of meeting (`/@handle/intro`). These tools act
on the signed-in person's own Kalendar only. Call `me_get` first.

## Before anything

- The first setup (choosing the link) and changing the time zone happen in the app, because
  the zone's offsets come from the person's browser. If a tool says to open the app, ask them
  to open it once.
- Times you receive are ISO 8601 in the person's own zone, with its offset
  (`2026-10-30T10:30:00+04:00`), plus a readable `when`. Times you send can be the same form;
  a time without an offset is read in the person's zone. Hours use 24-hour `"HH:MM"`.

## Tools

- `me_get`: their link, profile, zone, counts (upcoming, today, requests) and the next meeting.
- `profile_update`: name, bio (up to 600 characters), role, company, place (a city), website,
  links (up to 8 profile URLs: LinkedIn, X, GitHub…), `theme` (the colour of their pages and
  emails: red, amber, teal, blue, violet or graphite), and whether booking emails are on. The
  cover a shared link to their page shows (name, role, company, colour, photo) is drawn by their
  own browser, so after a change here it's redrawn the next time they open Kalendar.
- `hours_get` / `hours_update`: weekly hours by day (`mon`…`sun`, each a list of
  `["09:00","17:00"]` ranges, `[]` for a day off), plus single days off
  (`days_off_add`, `days_off_remove`, as `YYYY-MM-DD`). Only the days you send change.
  `pause` / `unpause` switch weekdays off and on while keeping their hours; `hours_get`
  lists them under `paused`. A paused day offers no times, unless that date has special hours.
- `events_list` / `events_create` / `events_update` / `events_delete`: the kinds of meeting.
  Fields: `title`, `slug` (the link), `duration` (minutes), `description`, `color` (red,
  orange, yellow, green, teal, blue, indigo, purple, pink, graphite), `location`
  (`{kind: "video", value: "https://…"}`, `phone` (they call the guest), `place` with an
  address, `custom` with any text, or `none`), `notice` (minutes ahead people must book),
  `window` (days ahead they can book), `step` (minutes between start times, 0 = automatic),
  `before`/`after` (free minutes around each meeting), `active` (shown or hidden) and
  `requests` (whether guests may ask for times outside the open hours).
  To change an event's link, send `new_slug`.
- `slots_list`: the open start times of one event type for up to 14 days, to suggest times or
  check the hours.
- `meetings_list`: bookings by `view`: `upcoming`, `past`, `cancelled` (also declined
  requests) or `requests` (guests asking for other times; each has `ranges` they painted).
- `requests_accept`: confirm a request at a `start` inside one of its ranges (the meeting
  lasts the event's minutes). Both sides get an email with calendar links.
  `requests_decline`: say no, with an optional note. `meetings_cancel`: cancel a booking;
  the guest is emailed a link to book again. Confirm with the person before cancelling or
  declining.
- `stats_get`: page views, visitors, bookings, where visitors come from (sites), devices,
  places (from time zones), time on page, per-event clicks and per-link `tags`, for 7, 30 or
  90 days, with the period before for comparison. The person's own visits don't count.
- `links_list` / `links_create` / `links_delete`: saved links that tag where visits come from,
  like a flyer, a talk or an email signature. Each is the page address with `?ref=<tag>`
  (`qr_url` adds `&via=qr`, so scans of a printed code count apart), opening the profile or
  one event type (`event`). The tag follows the guest to their booking, so `stats_get` shows
  views, visitors, scans and bookings per link, and `meetings_list` shows `came_from`.

## Good habits

- Read before you write: `hours_get` before changing hours, `events_list` before editing.
- Say times in the person's zone, the way `when` writes them.
- Never invent a guest's details; everything about a guest comes from `meetings_list`.
