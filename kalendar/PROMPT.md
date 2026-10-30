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
- Anyone opens /@handle or /@handle/event and books without an account.
  Show the host's free time on a horizontal strip of days, time running
  left to right like a video editor's timeline, in the guest's own zone
  (12- or 24-hour): tap a shaded span to drop in a meeting the length of the
  event, drag it to adjust (it snaps to open times), then name, email and
  notes. Never double-book; a taken time disappears.
- Guests may also ask for other times, even outside the host's hours: drop
  the meeting outside the shading, or paint spans of their own free time
  (trim the ends, slide them) and see where they overlap the host's. The
  host sees those spans over their own week, drags the meeting inside them
  and accepts, or declines with a note. Hosts paint their weekly hours the
  same way and drag a span onto another day, where it trades places with
  what's in its way; a day dragged over another swaps hours with it live, as
  you go. A switch pauses a day and keeps its hours. Every strip zooms:
  pinch, ctrl-scroll, or − and + with a button to fit the day.
- A profile page: photo, role, company, place with local time, a note,
  website and profile links with their icons, and each event type with its
  next open time. The host edits it under Profile, a tab of its own in the
  sidebar and tab bar, which saves as they type. Never a coloured stripe
  down the side of a rounded card.
- Insights for the host without cookies: views, visitors, profile clicks,
  bookings, time on page, sources, devices, places from time zones, and a
  visit-to-booking funnel. Tracked links: /@handle?ref=tag (also #ref= and
  utm_campaign) with a QR code adding &via=qr; the tag follows the guest to
  their booking, and Insights shows each link's visitors, scans and bookings. Expose the host's management (profile, hours,
  event types, meetings, requests, open times, insights) as auth "user"
  named operations, so Claude can run it all over Holm's MCP endpoint.
- The server has no Intl, so have the host's browser send its zone's UTC
  offsets for the next year and turn hours into real times on the server.
- Email both sides with env.holm.email: beautifully designed HTML (tables,
  inline styles, dark mode) plus plain text. Each booking email carries a
  calendar invite through email.send's calendar option, and no Add to
  Calendar buttons: a REQUEST to the guest with the host as organizer, and a
  REQUEST to the host named for the guest, organized by the sender address
  email.send reports and already accepted; a CANCEL to both when it's off,
  one UID per booking even when it moves. The booking page offers Google,
  Outlook.com and a hosted calendar file whose link doesn't end in .ics
  (Apple Mail offers to subscribe to those). Emailed links let the guest move
  or cancel; the host can cancel from their list. Give the host a private
  calendar feed.
- An Apple-quality UI on phone and desktop, with a fixed shell where only
  panels scroll: a round avatar button top right
  (signed out too) whose menu holds light/dark/auto, sounds, 24-hour time
  and Holm's analytics link for admins, and closes when it's tapped again;
  sheets that don't shrink as a search narrows; fine motion, quiet Web Audio
  sounds, and Inter weights that mean something. The signed-out home shows
  a booking card that plays itself: a pointer books a time, then asks for
  another. The card is an ordinary flat component set in a real CSS 3D
  scene, with its edge and shadow behind it and the pointer and result
  hovering in front, standing up as it scrolls into view and turning toward
  the mouse.
  It must open and move like a native app, with no flicker: a versioned
  service worker that serves the whole shell offline, pages drawn at once
  from the last answers kept in the browser and refreshed quietly, motion
  only for changes. Public pages end in a frosted footer: A Holm app, Source,
  Send feedback (the repo's feedback app, embed.js vendored).
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 kalendar. With my approval, deploy with
holm @<peer> app deploy kalendar --spec-v1 --host kalendar.<my-domain>, then
ask before enabling email for the app. Test booking, double-booking,
rescheduling, cancelling, time zones across daylight saving, phone and
desktop, light and dark, touch and mouse, requests and their answers,
the MCP tools, and sign in and out as a real person would.
```

## The original requests

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

**Kalendar 0.1.1: calendar links that add the event in Apple Mail**

> Kalendar app's invite came in, but i wasn't able to add it to my iOS calendar app as usual with invites from other apps

> - i use Apple's default Mail app
> - a susbscription url was seen in a different modal in Calendar app: […]

**Kalendar 0.2.0: a timeline for picking times, requests, a profile, insights and Claude**

> Can you review whether Kalendar has remote mcp?
> - if else can you implement?
> - also, even though the app is very good in UI, i think it has the lame AI slop signal: "left border on rounded rects"
> - mark this as a TERRIBLE pattern & NEVER repeat it
> - also, do a fine, attention to detail audit to fix & sharpen the smallest of details to make it look amazing
> - Also, if there is way to radically rethink the UX of picking the time slot, lets do it
> - so that we can find an elegant way to mark available slots?
> - also, i would be happy to manage the whole thing with mcp
> - and i would prefer to have a stats system for users so that they can see: profile_clicks, time on page, location, device; super minimal set of analytics that are relevant; but amazing to see;
> - also would be cool, to do a small profile page so that things like socials, website, role, company, etc can be showcased

Shown three ways to pick a time and a way for hosts to paint their hours, the
reply was:

> I like the paint concept the best; is it possible to make the slots designed like video editor strips rather? so that i can trim start/end by dragging or move the slot over all? and i wonder whether we can do it horizontally than vertically? Also, I wish someone else can paint over if they want over the available time slots for their preferred time & request whether its possible? even when i am not available?

> So that something like overlap app's capability can be brought in

**Kalendar 0.3.0: opens like an app, a week you can rearrange, and tracked links**

> Lets refine Kalendar:
> - all the pages have slight flicker
> - like the components flicker to appear
> - looks like no caching is there
> - refine it such that the whole app feels like a genuine native app
> - shall we do a footer like in the catalog app? blured / holm / feedback links
> - shouldnt the days slots be draggable to an empty day or swapped with an exiting day?
> - shouldnt the day track be zoomable, so that the whole day scales in & out?
> - the time zone selection modal's search bar has weird size
> - shouldnt there be a quick enable/disable switch for each day, so that a quick enable/disable is possible without having to delete the slot
> - may be we can make urls like this also to work? /@username/#ref=sundown-2026
> - so that, when we send this in urls in email or use this in QR codes, we know where each came from?
> - not sure thats the perfect scheme to do?
> - find a way so that we can track it well
> - perhaps it show up in stats too

**Kalendar 0.4.0: a Profile tab, days that swap as you drag, and a home page that shows itself working**

> lets refine Kalendar a bit more:
> - i think 'Your page' / profile; should be in the left sidebar
> - should the modals be of so min vertical height? so that searching it down wont shrink it down to much smaller?
> - the analytics link i think in holm is using a different url now?
> - the feedback system uses a genric icon than the Kalendar icon
> - I havent checked in mobile, hope it works well
> - isnt swapping between the tracks on drag a better mechanic?
> - dont do holm-app branding in avatar popup menu; clicking the icon again should dismiss it
> - can you create the hero animated?

**Kalendar 0.4.1: the home page's card in real 3D**

> The current hero is fake 3d; can we implement it as normal straight component
> - and use 3d transforms to acheive true 3d effect?

**Kalendar 0.5.0: booking emails carry a real calendar invite**

> Kalendar app's email no more has the provision to add to mobile calendars?
> - i was hoping Mail app will automatically be able to detect & create events in calendar

**Kalendar 0.5.1: the host's email is an invitation too, without browser buttons**

After a test where the guest's invite landed on its own and the host's copy
didn't (an address is replaced here):

> And those buttons google/apple/outlook takes me out of the Mail app to default browser (Brave)
> - looks those links will only work in Safari?
> - plus such links arent there in other invites from say Google/Calendly
> - i think ics is enough?
> - but i wonder why it didn't show up or get recognised like how it did with [my other] email
