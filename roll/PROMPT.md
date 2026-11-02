# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Roll", a photo library for your own server in the spirit of Immich or
Google Photos, using only https://holmhq.com/llms-full.txt for Holm. Read its
v1 sections 9–12, "Keep uploads under the node's limits", "Shrink photos
before upload", "Make an app feel finished" and "Make it feel native" first.
Make holm.json (web.spa true), public web/ files and api/main.js exporting
default { fetch(request, env) }. No build step or third-party runtime CDN;
vendor Inter and ThumbHash with their licences.

- Sign in with the node's accounts. Each member's photos and albums are
  theirs alone, in shared storage with an owner on every record. A quota per
  member (QUOTA_MB in the app's environment); app admins have none.
- Uploads: pick files, drop them anywhere or paste them. In the browser,
  read EXIF (date with its time zone, camera, lens, exposure, GPS), a
  SHA-256 fingerprint to skip photos already there, a 2048 px preview and a
  thumbnail made on a canvas (no metadata), and a ThumbHash placeholder.
  Name the place offline from GeoNames towns of 15,000 people or more
  (bigger towns win within 25 km, else the region). Send the copies first so
  the tile appears at once with a progress ring, then the original in its
  own request; keep the copy if the original is too large. A tray shows
  progress, what was skipped and why.
- The library: photos by the date they were taken (the camera's own wall
  clock), a heading per month and per day with the day's place, days flowing
  into each other in rows justified to the width, rendered virtually so huge
  libraries scroll smoothly, a date rail to jump through the years, ThumbHash
  colours before thumbnails load, and zoom with ctrl+wheel or a pinch.
- "On this day" cards for earlier years that play as a story with a slow
  drift, bars, tap to move, hold to pause.
- A viewer that grows out of the tile and back, swipes, zooms (wheel, pinch,
  double tap; the original loads when you look closer), closes on a pull
  down, and shows details (date, file, camera and exposure, place with a map
  link, albums) beside the photo on a desk and in a sheet on a phone.
- Select with a tick, shift-click ranges, select a whole day, long-press on a
  phone: favourite, add to an album, download (several as one ZIP made in the
  browser), move to the Trash with Undo. The Trash keeps photos 30 days.
- Albums with covers; add from the library with a picker; share by link: a
  public page with the album's title, who shared it and the photos (no
  places, cameras or file names, never originals), its own link preview.
- Places as cards, and search over places, cameras, months, years, albums
  and words like portrait, night or favorite, with suggestion chips.
- A native-feeling Apple-quality UI on phone and desktop, light and dark: a
  fixed shell where only panels scroll; a sidebar of places on a desk, a tab
  bar on a phone; a round avatar button with a three-icon theme switch and
  storage use; Holm's credit only in the footer, on one line even in the
  sidebar. A versioned service worker
  precaches the app and keeps thumbnails.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/ with screenshots of sample photos only.
```

## The original requests

The app was built overnight from this request, which left the choice of
project to the agent:

> i am going to sleep, build me a superb clone of any of the top 20 self
> hostable projects on the planet in holm.
> - you can pick which one based on ease of building & suitability of being
>   in holm
> - make sure the app is esquisite and amazing in UI/UX
> - deploy and surprise me by morning
> - good night

Version 0.1.3 fixed the second point of a later message. The first, keeping
large files in Backblaze, is a setting of the Holm node rather than of the
app, and isn't done yet:

> We need to connect our black blaze acocunt to this app, so that the large files wont bloat our DB
> - also, holm app line in sidebar is multiline
