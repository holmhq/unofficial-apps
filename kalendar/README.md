# Kalendar

Share one link and let people book time with you, on [Holm](https://holmhq.com).
Your page lives at your own address (`/@avery`), with a link for each kind of
meeting you offer. People pick a day and a time in their own time zone, type
their name and email, and they're booked: no account, no back-and-forth. Both
of you get an email with Add to Calendar buttons, and the person who booked can
move or cancel from it.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of it. Try it at [kalendar.zyt.app](https://kalendar.zyt.app).

## Holm App Spec v1

Kalendar follows [Holm App Spec v1](https://holmhq.com/llms-full.txt),
sections 9–12: `holm.json` holds identity and web settings (`web.spa` is on),
`web/` holds public files, and `api/main.js` exports
`default { fetch(request, env) }` and the handlers of the two named operations
in `api/contract.json`. Every deploy needs `--spec-v1`; the node runs no build.
Only `web/` is served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Your link.** Sign in, choose a handle, your time zone and roughly when
  you're free, and you're live at `/@handle`, with a 15-minute chat and a
  30-minute meeting ready to share.
- **Event types.** Each has a name, its own link (`/@handle/intro`), a length,
  where you'll meet (a video link, a phone call to the guest, an address,
  anything else, or decide later), a description and a colour. Rules per type:
  notice needed, how far ahead people can book, how often start times fall,
  and free time before and after. Turn one off to hide it.
- **Hours.** Weekly hours in your zone, several ranges a day, copied to
  weekdays or every day in one tap, and days off. Changes save as you make
  them.
- **Booking, no account.** Pick a day (open days are red circles), then a time;
  the time splits into a Next button. Name, email, notes, and a phone number
  when you'll call. Times show in the guest's zone, which they can change,
  in 12- or 24-hour time. A time someone takes disappears for everyone, and
  two people racing for the same slot can't both get it.
- **Emails.** The guest gets a confirmation with the day as a little calendar
  page, the time in their zone, where to meet, Google, Apple and Outlook
  buttons and links to reschedule or cancel. The host gets one with the
  guest's details and notes. Moving or cancelling sends matching emails.
- **Changing a booking.** The emailed link opens the booking: add it to a
  calendar, reschedule (the old time is freed and the new one booked in one
  step) or cancel with a note. Hosts cancel from their list, and the guest is
  told with a link to book again.
- **Your calendar.** A private feed (`/feed/<secret>.ics`) to subscribe to in
  Apple Calendar, Google Calendar or Outlook, with a button to make a new link.

### How it feels

- An Apple-like look: greys, one red accent from the Calendar app, frosted
  bars, large titles, sheets that rise on a phone and dialogs on a desk, a
  segmented control, switches, and a round avatar button at the top right,
  signed out too, holding light/dark/auto, sounds and 24-hour time.
- Inter's weights carry meaning: 720 for titles, 620 for anything you can
  pick (open days, times, names), 520 for labels, 430 for reading and 360
  for context (the year beside the month, the date beside the weekday, end
  times under start times).
- Motion: open days pop in, months slide, the times column grows into the
  card, a picked time splits into Next, steps push in from the right (with
  Back and an edge swipe), the check on the confirmation draws itself, and a
  theme change spreads from where you tapped.
- Sound: quiet Web Audio cues for a day, a time, a month turning, a step, a
  booking (a small chime) and a mistake; off with one switch.
- Phones get one step per screen and a tab bar; wide screens get a card with
  the event, the month and the day's times side by side, and a sidebar with
  your link. Arrow keys move through the month.

## How it's built

```text
api/main.js        tiny entry: imports http.js and ops.js with import()
api/contract.json  bookings.create and bookings.cancel: public, challenge, rate limits
api/http.js        the JSON API, calendar files, and /@handle pages with the host in the title
api/ops.js         the named operations
api/hosts.js       handles, profile, weekly hours, days off, the feed secret
api/events.js      event types
api/bookings.js    open times, booking, rescheduling, cancelling, lists, the feed
api/slots.js       weekly hours → open times, minus notice, horizon and busy times
api/tz.js          offset tables, wall time ↔ UTC, dates written out without Intl
api/mail.js        the emails, HTML and plain text
api/ics.js         iCalendar files and Google/Outlook links
web/src/           the page: main.js (routes), shell.js, ui.js, views/…
tools/check.mjs    time-maths and calendar-file checks (not deployed)
tools/book.mjs     books sample meetings through the real operation (not deployed)
```

Holm primitives it uses:

- **`env.holm.app.ds`** for hosts, event types and bookings, and a
  **`ds.transaction`** that checks for overlapping bookings and inserts in one
  step, so a slot can't be taken twice. **`env.holm.app.kv`** counts daily
  bookings per address and per host.
- **`env.holm.auth`** for hosts: sign-in, the verified email notifications go
  to, and the sign-out POST. Guests never sign in.
- **Named operations** (`api/contract.json`): `bookings.create` is public,
  behind Holm's proof-of-work challenge (solved in the background from
  `/_holm/challenge.js` while the guest types) and six calls a minute, with an
  optional `Idempotency-Key` so a retried booking isn't made twice.
  `bookings.cancel` takes the booking's secret from its email link.
- **`env.holm.email.send`** with `html` and `body` for every email.
- **`env.holm.web.fetch`** for the page, with `/@handle` and `/@handle/event`
  given the host's name in the title and social card.

### Time zones without Intl

Holm's server has no `Intl`, so it can't look up a time zone. When a host
saves their zone, their browser works out its UTC offsets for the next 15
months and sends the changes as a short table (`web/src/zones.js`); the page
refreshes it when it gets old. The server turns weekly hours into real
instants with it (`api/tz.js`), skipping times a clock change jumps over and
counting a repeated hour once. Guests' browsers show times in their own zone,
and send the zone's name and offset with a booking so emails can say
"7:30 – 8:00 PM, India Standard Time". `node tools/check.mjs` builds tables
for eight zones, including half-hour, 45-minute and daylight-saving ones, and
checks over 140,000 open times against Node's `Intl`.

### Calendar invitations

Holm's `email.send` takes `html` and `body` but no attachments, so the emails
can't carry an `.ics` file or a `text/calendar` part. Instead they link to the
booking's calendar file (`/b/<id>/invite.ics?t=…`, which Apple Calendar and
Outlook open), to Google Calendar's and Outlook.com's add-event pages, and to
the host's feed. Gmail and Outlook therefore won't show their own RSVP card.

## Deploy your own

```sh
node kalendar/tools/check.mjs
holm app validate kalendar --spec-v1
holm @<peer> app deploy kalendar --spec-v1 --host kalendar.example.com
```

Then:

- **Email.** Deploying doesn't enable it. Check the app's send policy and
  turn it on (the node needs a verified sender domain and an email provider,
  section 12 of the guide):

  ```sh
  holm @<peer> settings list settings.apps.<app-id>.policy.email
  holm @<peer> settings set settings.apps.<app-id>.policy.email.app_send true
  ```

  Without it, bookings still work: the confirmation page has the calendar
  buttons and says the email couldn't be sent.
- **Sign-in page branding.** Holm's hosted sign-in has its own presentation
  settings. Inspect the schema, then set the app's name, icon and accent:

  ```sh
  holm @<peer> settings list settings.apps.<app-id>
  holm @<peer> settings set settings.apps.<app-id>.brand.name Kalendar
  holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
  holm @<peer> settings set settings.apps.<app-id>.theme.accent '#e0352b'
  ```

Open the site, sign in, and choose your link. `node kalendar/tools/book.mjs
https://kalendar.example.com <handle> 6` books six made-up meetings (with
example.com addresses) to see the dashboard filled in.

Booking needs a secure page: the challenge uses Web Crypto, which browsers
only give to `https://` and `localhost` pages. On a local node, add a
`kalendar.localhost` host to book from a browser.

## Known limits

- **No email attachments** (above): invitations are links, not RSVP cards.
- **No two-way calendar sync.** Kalendar doesn't read your Google or Apple
  calendar for busy times; block them with days off or hours, and subscribe
  to the feed to see bookings there. Video links are the one you paste, not
  made per meeting.
- **No reminders.** Holm v1 has no schedules, so nothing is sent before a
  meeting; the calendar entries carry a 10-minute alert.
- Days can be off, but not given different hours; one host per event type
  (no round robin or group events); no payments or custom questions.
- Anyone can book, so anyone can make Kalendar email an address they type.
  Holm's challenge and rate limit, ten bookings a day per address and eighty
  per host keep that small.
- Offset tables cover about 15 months from when the host last opened their
  page; past that, the last known offset is used.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/assets/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
  Kalendar's mark is its own.
