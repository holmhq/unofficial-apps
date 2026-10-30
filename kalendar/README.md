# Kalendar

Share one link and let people book time with you, on [Holm](https://holmhq.com).
Your page lives at your own address (`/@avery`), with a link for each kind of
meeting you offer. Your free time lies on a strip of days, time running left to
right like a video editor's timeline: people drop the meeting into it, or paint
when suits them and let you pick. No account, no back-and-forth. Both of you get
an email with Add to Calendar buttons, the person who booked can move or cancel
from it, and you can run all of it from Claude.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of it. Try it at [kalendar.zyt.app](https://kalendar.zyt.app).

## Holm App Spec v1

Kalendar follows [Holm App Spec v1](https://holmhq.com/llms-full.txt),
sections 9–12: `holm.json` holds identity and web settings (`web.spa` is on),
`web/` holds public files, and `api/main.js` exports
`default { fetch(request, env) }` and the handlers of the named operations in
`api/contract.json`, which Holm also serves as MCP tools at `/_holm/mcp`. Every deploy needs `--spec-v1`; the node runs no build.
Only `web/` is served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Your page.** Sign in, choose a handle, your time zone and roughly when
  you're free, and you're live at `/@handle`, with a 15-minute chat and a
  30-minute meeting ready to share. The page shows your photo, what you do and
  where, your local time, a welcome note, your website and profile links
  (LinkedIn, X, GitHub and others get their own icons), and each kind of
  meeting with the next time that's open. You edit it under Profile, a tab
  of its own beside your bookings: your page as guests see it at the top,
  then the fields, your link, email and calendar feed, saved as you type.
- **Event types.** Each has a name, its own link (`/@handle/intro`), a length,
  where you'll meet (a video link, a phone call to the guest, an address,
  anything else, or decide later), a description and a colour. Rules per type:
  notice needed, how far ahead people can book, how often start times fall,
  free time before and after, and whether guests may ask for other times. Turn
  one off to hide it.
- **Hours on a timeline.** Your week is seven tracks. Drag along a day to paint
  when you're free, drag either end of a span to trim it, drag the middle to
  slide it along the day or up and down onto another one, where it lands
  where you hold it, nudged into a gap close by, or trades places with the
  spans in its way (they go back to the day it came from); tap a span to copy
  it to weekdays or every day, or remove it. Hold a day's name over another
  day and the two swap hours on screen as you go, so you see the week you'll
  get; let go to keep it. A switch beside each day pauses it without losing
  its hours.
  Pinch, ctrl- or ⌘-scroll, or − and + zoom the whole day in and out; ↔
  fits it in view. Presets fill the week in one tap. Days off sit below.
  Changes save as you make them.
- **Booking, no account.** Guests see your free time shaded on the same kind of
  strip, one day per track, in their own zone (which they can change) and in
  12- or 24-hour time. Tap a shaded span and the meeting drops in, the length
  of the event; drag it along the day or onto another and it snaps to the
  times that are open; pinch or use − and + to zoom. "Soonest" jumps to the
  first one. Then name, email,
  notes, and a phone number when you'll call. A time someone takes disappears
  for everyone, and two people racing for the same slot can't both get it.
- **Asking for another time.** Dropped outside your shading, the meeting
  becomes a request. Or a guest switches to "Suggest times" and paints when
  they're free, as many spans as they like, even when you aren't; where their
  paint meets your free time it glows (the way the Overlap app shows
  everyone's overlap), with a button to book that time at once. You see their
  spans over your own week, next to your hours and other meetings, drag the
  meeting to a time inside them and accept, or say no with a note. Both
  answers are emailed.
- **Emails.** The guest gets a confirmation with the day as a little calendar
  page, the time in their zone, where to meet, Google, Apple and Outlook
  buttons and links to reschedule or cancel. The host gets one with the
  guest's details and notes. Requests, accepting, declining, moving and
  cancelling each send matching emails.
- **Changing a booking.** The emailed link opens the booking: add it to a
  calendar, reschedule (the old time is freed and the new one booked in one
  step) or cancel with a note; a request can be withdrawn. Hosts cancel from
  their list, and the guest is told with a link to book again.
- **Tracked links.** Share `/@handle?ref=sundown-2026` on a flyer and
  `/@handle?ref=newsletter` in an email, and Insights tells them apart. Make
  them under Insights → Tracked links: a name, a tag and the page it opens.
  Each has a QR code to save as PNG or SVG; the code adds `&via=qr`, so scans
  count apart from clicks on the same link. The tag is kept in the guest's
  browser for 30 days, so a booking made on a later visit still counts for
  the link that brought them, and it's shown on the booking. `#ref=` and
  `utm_campaign` work too. The tag comes off the address once read, so a
  guest who passes the page on doesn't pass it on.
- **Insights.** Page views, visitors, profile clicks, bookings and time on
  page for 7, 30 or 90 days, against the period before; views by day with each
  booking marked; each tracked link's visitors, scans and bookings; where
  visitors came from, what they opened the page on and where they are; what
  they tapped; how many went from a visit to a booking; and each event type's
  views and bookings. No cookies: a random id kept in the
  visitor's browser tells visitors apart, the place comes from their browser's
  time zone (never an address), browsers asking not to be tracked send
  nothing, and your own visits don't count.
- **From Claude.** Connect Claude's MCP connector to
  `https://<your-kalendar>/_holm/mcp` and sign in: Claude can read and change
  your profile, hours, days off and event types, list your meetings and
  requests, accept or decline requests, cancel bookings, look up open times,
  make tracked links and read your insights. It reads `guide.get` first.
- **Your calendar.** A private feed (`/feed/<secret>.ics`) to subscribe to in
  Apple Calendar, Google Calendar or Outlook, with a button to make a new link.

### How it feels

- It opens like an app on a phone. A service worker keeps every file of the
  version you have and opens straight from them, so nothing waits on the
  network; a new version installs in the background and takes over next time.
  Each page draws at once from what your browser saw last (your bookings,
  your insights, a host's page and its open times) and the server's answer
  slips in behind it only if something changed. Tabs keep their place while
  you're on another, and the first page's data is asked for while the code
  is still loading.
- An Apple-like look: greys, one red accent from the Calendar app, frosted
  bars, large titles, sheets that rise on a phone and dialogs on a desk, a
  segmented control, switches, and a round avatar button at the top right,
  signed out too, holding light/dark/auto, sounds and 24-hour time (tap it
  again to close it). Sheets grow with what's in them but don't shrink while
  open, so narrowing a search doesn't drop the sheet down the screen. A
  colour marks each event type with a dot or a tinted tile, never a stripe.
- Inter's weights carry meaning: 720 for titles, 620 for anything you can
  pick (open days, times, names), 520 for labels, 430 for reading and 360
  for context (the year beside the month, the date beside the weekday, end
  times under start times).
- The strip behaves like an editor's timeline: a ruler and day labels that
  stay put while it scrolls both ways, a red playhead at the current minute,
  the past hatched, the meeting snapping to open times with a tick, a time
  flag above a clip too short to hold its label, handles on each end of a
  span, and edges that scroll the strip while you drag near them. On a phone
  a swipe scrolls and a hold starts painting; arrow keys move the meeting.
- Motion means a change, never a page appearing: the meeting springs in where
  it lands, steps push in from the right (with Back and an edge swipe), a
  lifted day follows your finger while hours glide between the days it
  swaps, the check on the confirmation draws itself, and a theme change
  spreads from where you tapped. Charts grow only the first time they're
  drawn. Signed out, the home page's booking card plays itself: a pointer
  drops a meeting in, drags it to another day and books it, then paints
  times to ask for. It rests while it's out of sight, and holds still for
  anyone who asks for less motion.
- The home page's card is a flat component in a real CSS 3D scene
  (`perspective` and `preserve-3d`): thin plates behind it make its edge, a
  blur further back its shadow, and the pointer hovers above it, coming down
  to press, while the result rises off it as a sheet. It stands up as it
  scrolls to the middle of the screen and turns a few degrees toward the
  mouse, so the layers part as it moves.
- Sound: quiet Web Audio cues for a tap, a pick, a snap, a step, a booking (a
  small chime), a request sent and a mistake; off with one switch.
- Phones get one step per screen and a tab bar; wide screens get a card with
  the event beside the strip, and a sidebar with your link. Profile's tab
  shows your picture. Public pages end in a frosted bar like Catalog's: A
  Holm app, Source and Send feedback.

## How it's built

```text
api/main.js        tiny entry: imports http.js and ops.js with import()
api/contract.json  booking and cancelling (public, challenge, rate limits) and the host's tools
api/http.js        the JSON API, the visit beacon, calendar files, and /@handle pages
api/ops.js         the named operations, which are also the MCP tools
api/guide.md       how Claude should use the tools (guide.get)
api/hosts.js       handles, profile and links, weekly hours, days off, the feed secret
api/stats.js       visits counted per host per day, and the Insights summary
api/events.js      event types
api/bookings.js    open times, booking, requests, rescheduling, cancelling, lists, the feed
api/slots.js       weekly hours → open times, minus notice, horizon and busy times
api/tz.js          offset tables, wall time ↔ UTC, dates written out without Intl
api/mail.js        the emails, HTML and plain text
api/ics.js         iCalendar files and Google/Outlook links
web/sw.js          the app shell: every file of this version, installed all or nothing
web/src/           the page: main.js (routes), shell.js, ui.js, views/…
web/src/store.js   what the page last saw, so it draws at once and catches up
web/src/timeline.js  the strip of days: shading, spans, the meeting clip, zoom, swaps and trades
web/src/track.js   the visit beacon: views, clicks, picks, time on page, the link's tag
web/src/qr.js      QR codes for tracked links (SVG and PNG)
web/src/countries.js each time zone's country, for Insights (generated)
tools/check.mjs    time-maths, calendar-file and app-shell checks (not deployed)
tools/book.mjs     books sample meetings through the real operation (not deployed)
tools/countries.mjs  builds countries.js from the tz database (not deployed)
```

Holm primitives it uses:

- **`env.holm.app.ds`** for hosts, event types, bookings and requests, and
  one stats document per host per day, and a **`ds.transaction`** that checks
  for overlapping bookings and inserts in one step, so a slot can't be taken
  twice (accepting a request checks again). **`env.holm.app.kv`** counts daily
  bookings per address and per host, caps visits, and remembers which visitors
  were already counted today.
- **`env.holm.auth`** for hosts: sign-in, the verified email notifications go
  to, and the sign-out POST. Guests never sign in.
- **Named operations as MCP tools**: the host's tools (`me.get`,
  `profile.update`, `hours.get`/`hours.update`, `events.*`, `meetings.list`,
  `meetings.cancel`, `requests.accept`/`requests.decline`, `slots.list`,
  `stats.get`, `links.*`) use `auth: "user"`, so anyone signed in can connect Claude,
  and each acts only on the caller's own page. Holm serves them at
  `/_holm/mcp`; `guide.get` is public.
- **Named operations** (`api/contract.json`): `bookings.create` is public,
  behind Holm's proof-of-work challenge (solved in the background from
  `/_holm/challenge.js` while the guest types) and six calls a minute, with an
  optional `Idempotency-Key` so a retried booking isn't made twice.
  `bookings.cancel` takes the booking's secret from its email link.
- **`env.holm.email.send`** with `html` and `body` for every email.
- **`env.holm.web.fetch`** for the page, with `/@handle` and `/@handle/event`
  given the host's name in the title and social card.
- **`__HOLM_SURFACES__`**: for the node's and the app's owners and admins,
  Holm writes the address of the app's analytics page into the page, and the
  avatar menu links to it. Holm puts that page under a path of its choosing
  that starts with `/_`, so the service worker lets every such path through,
  and an admin's browser reads the address from a fresh copy of the page
  rather than the copy the worker keeps.

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
can't carry an `.ics` file or a `text/calendar` part, and Apple Mail, Gmail and
Outlook won't show their own invite card. Instead they link to the booking's
calendar file (`/b/<id>/calendar?t=…`), to Google Calendar's and Outlook.com's
add-event pages, and to the host's feed. The file's link doesn't end in `.ics`
on purpose: Apple Mail hands such a link to Calendar as a calendar to
subscribe to, not an event to add. The host's email links to the host's own
copy (`?h=…`, keyed with the feed secret, so a new feed link retires it),
named for the guest and with their details. Links from emails sent before
0.1.1 (`/b/<id>/invite.ics?t=…`) still work.

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

- **Feedback.** Send feedback opens Kalendar's form on the owner's
  [feedback](../feedback/) app through a local copy of its `embed.js`
  (`web/vendor/feedback/`). Set `FEEDBACK_PROJECT` in `web/src/shell.js` to
  your own project, or leave it empty to hide the link. Give the project
  Kalendar's icon (`web/icon-512.png`) as its logo so the form wears it. The
  site must be allowed to frame the form:

  ```sh
  holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>
  ```

Bump `VERSION` in `web/sw.js` with `holm.json`'s version for every release
(`tools/check.mjs` checks it, and that the worker lists every page file), or
browsers keep the version they installed.

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
- **Insights are approximate by design.** Visitors are told apart by a random
  id in their browser, so one person on two devices counts twice; places come
  from time zones (several countries share some); requests from bookings made
  without a visit (a direct link, a browser that asks not to be tracked) can
  push a rate past what was counted, so rates stop at 100%.
- **Claude can't do the first setup.** Choosing the link and changing the time
  zone happen in the app, because the zone's offsets come from the browser.
  Requests waiting for an answer don't expire by themselves; one whose times
  have passed stops showing.
- Anyone can book, so anyone can make Kalendar email an address they type.
  Holm's challenge and rate limit, ten bookings a day per address and eighty
  per host keep that small.
- Offset tables cover about 15 months from when the host last opened their
  page; past that, the last known offset is used.
- **Tags are what the link says.** Anyone can put any `?ref=` on your link;
  tags you didn't save show in grey, and a day counts at most 60 of them.
  Browsers that ask not to be tracked keep no tag, so their bookings have none.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/assets/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
  The X logo is from [Simple Icons](https://simpleicons.org) (CC0 1.0). Kalendar's
  mark is its own.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4:
  MIT, in `web/vendor/qrcode/LICENSE`.
- `web/vendor/feedback/embed.js` is a copy of the feedback button from this
  repository's [feedback](../feedback/) app, under this repository's licence.
- `web/src/countries.js` is built from the [tz database](https://www.iana.org/time-zones)'s
  `zone.tab` and `iso3166.tab`, which are in the public domain.
