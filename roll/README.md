# Roll

Your photo library, on your own server. Roll keeps every photo on a timeline
of the days you took them, brings back photos from this day in earlier
years, sorts them by place, and lets you share an album with anyone by link.
It's a small take on self-hosted photo libraries such as Immich, and it runs
on [Holm](https://holmhq.com).

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of it. Try it at [roll.zyt.app](https://roll.zyt.app).

## Holm App Spec v1

Roll follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12. The pieces:

- **`holm.json`:** identity and web settings, with `web.spa` on.
- **`web/`:** the public files.
- **`api/main.js`:** exports `default { fetch(request, env) }`, and the
  named operations behind the MCP tools.
- **`api/contract.json`:** describes those operations.

Every deploy needs `--spec-v1`, and the node runs no build. Only `web/` is
served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Every day on a timeline.** Photos sorted by when they were taken, by the
  camera's own clock, so a photo from 16:40 in California says 16:40
  wherever you look at it. Each month and day has a heading, the day's with
  its place. Days flow into each other along rows that fill the width
  exactly, the way Google Photos lays them out. A date rail on the right
  jumps through the years; pinch or ctrl+scroll changes the size.
- **On this day.** Cards for each earlier year with photos from today's date.
  They play as a story: each photo for a few seconds with a slow drift, bars
  across the top, tap either side to move, hold to pause, pull down to close.
- **Adding photos.** Choose them, drop them anywhere on the page or paste
  them. Each photo's date, time zone, camera, lens, exposure and location are
  read from its EXIF in the browser, from JPEG or HEIC. Photos already in the library are
  skipped, matched by fingerprint. The tile shows at once with a progress
  ring, and a tray says how many were added, which were skipped and why.
  Dropping photos on an album adds them to that album.
- **The viewer** grows out of the tile and shrinks back into it. Swipe or use
  the arrow keys to move, pinch, scroll or double-tap to zoom (the original
  loads when you look closer), and pull down to close. The details sit beside
  the photo on a desk and in a sheet on a phone: date and time zone, file and
  size, camera and exposure, the place with a map link, and its albums.
- **Selecting.** Tick photos, shift-click a range, tick a day's heading for
  the whole day, or long-press on a phone. Then favourite them, add them to
  an album, download them (several come as one ZIP) or move them to the
  Trash, with Undo. The Trash keeps photos for 30 days.
- **Albums** with covers. Add photos from the library with a picker, or drop
  new ones in. **Share** an album by link: whoever opens it sees the title,
  who shared it and the photos, with no account. Places, cameras and file
  names stay private, and only the full-size copies can be downloaded, never
  the originals. The link's preview shows the album's title and cover.
  Turn the link off and it stops working.
- **Places** as cards, named on your device (see below), and **search** over
  places, cameras, months, years, albums and words like *portrait*,
  *panorama*, *night* or *favorite*, with suggestions to tap.
- **Claude can use it too.** Connect Roll to Claude, ChatGPT or Claude Code
  over MCP and ask about your library: what's there year by year, photos by
  date, place, album or words, and this day in past years. It can make and
  share albums, favourite photos, move them to the Trash and back, and,
  once you've said yes, delete what's in the Trash. Claude sees each photo's
  details, not the picture. **Connect via MCP…** in the account menu shows
  the address and how to add it.

### How it feels

A native-app shell: the window never scrolls, bars stay put, and only the
panel moves. A sidebar of places on a desk, which hides with one click, a tab bar on a phone, a frosted
selection bar, and sheets that rise. Tiles show the photo's colours from
its ThumbHash before the thumbnail arrives, and fade in without jumping.
Light and dark, with photos on black in the dark, and less motion when the
device asks for it. The round avatar button holds who you are, your storage,
Connect via MCP…, a three-icon theme switch and Sign out; the Holm credit
sits in the footer. On a desk, ⌘K (Ctrl+K) goes to a place, an album or a
city, or uploads, selects or connects via MCP, from a few letters. Cards
lift a little under the pointer; nothing grows.

## How it's built

- **Storage.** Photos and albums are documents in `env.holm.app.ds`
  (`photos`, `albums`), each with its owner, and every route checks it. The
  files are in `env.holm.app.s3`: `t/<id>` the thumbnail (480 px high),
  `p/<id>` the preview (2048 px) and `o/<id>` the original. Album membership
  lives on the photo (`albums: [...]`), found with `$contains`.
- **The browser does the image work.** It decodes each photo with
  `createImageBitmap` (which applies its orientation), draws the preview and
  thumbnail on a canvas as JPEG, hashes the file with Web Crypto, and makes a
  [ThumbHash](https://github.com/evanw/thumbhash). The server never decodes an
  image. The canvas copies carry no metadata, so a shared album gives away no
  location.
- **Uploads in two steps.** `POST /api/photos` takes the details (JSON), the
  thumbnail and the preview as multipart form data, so the photo shows at
  once. `PUT /api/photos/<id>/original` then sends the original as the raw
  body, up to 30 MB. If the node's body limit refuses it (413), the photo
  keeps its 2048 px copy and the tray says so.
- **Files are served from `fetch`** in `api/main.js`, the only module loaded
  on every request: `/t/<id>`, `/p/<id>` and `/o/<id>` check the owner, or
  for `/t` and `/p` a shared album's slug (`?s=`). Owners' files are cached
  as immutable; everything else under `/api/` loads `api/http.js`.
- **The library in one answer.** `GET /api/library` returns every photo and
  album at once. A version number in KV (`v:<member>`), bumped by every
  change, lets the page ask `?v=` and get a one-line answer when nothing
  changed. The page keeps its copy in IndexedDB and draws from it at once.
  Changes show straight away and are sent in batches of 500. The server stops
  each batch before the request's time budget runs out and the page sends
  the rest.
- **The grid** (`web/src/grid.js`) lays out every photo but puts only those
  on screen, plus a screen either way, in the page. It reuses tiles as you
  scroll, so tens of thousands of photos scroll smoothly.
- **Place names come from your device.** `web/data/places.txt` lists every
  town of 15,000 people or more from GeoNames, about 1 MB, loaded only while
  adding photos that have a location. Within 25 km the photo takes the town's
  name, bigger towns winning; further out, the region's. Nothing is sent to a
  geocoding service.
- **Shared albums.** `POST /api/albums/<id>/share` gives the album a random
  slug. `GET /api/s/<slug>` returns what the public page needs.
  `GET /s/<slug>` serves the app's page from `fetch` with the album's own
  title, description and `og:image` (`/s/<slug>/cover.jpg`).
- **Feedback** opens from the footer: `web/vendor/feedback/embed.js` is a copy
  of the widget from [feedback.zyt.app](https://feedback.zyt.app), with its
  floating button hidden. Its form is framed from that origin, so the app's
  CSP allows it (`security.csp.frame_src`). Point `FEEDBACK_PROJECT` in
  `web/src/shell.js` at your own project, or set it to `''` to drop the link.
- **The Trash** empties itself: photos left there more than 30 days are
  deleted a few at a time whenever the library loads.
- **MCP tools.** `api/contract.json` declares ten named operations with
  `auth: "user"`, which Holm serves at `/_holm/mcp`:
  - **Read:** `library.get`, `photos.list`, `photos.get`, `memories.get`
    and `albums.list`.
  - **Write:** `photos.update`, `albums.create` and `albums.update`.
  - **Destructive:** `albums.delete` and `photos.delete`.

  Their code is in `api/ops.js`, loaded with `import()` from one-line
  wrappers in `main.js`. They change the library through the same functions
  as the routes (exported from `http.js`), so the owner checks and the
  library version stay in one place. `photos.list` searches the way the
  page does, and pages through photos by the time they were taken.
  `photos.delete` works only on the Trash, and without `confirm: true` it
  only says what would go. Operations can't read the app's settings
  (`env.holm.env`), so `/api/library` records each member's quota in KV for
  `library.get`. Tools have no request to take the address from, so their
  links use the one `/api/me` last saw.
- **Changes from elsewhere.** When the page comes back into view with nothing
  of its own on the way, it asks for the library again, so changes made by
  Claude or on another device appear. `?photo=<id>` on any page opens that
  photo in the viewer; the tools' links use it.
- **Offline-ready.** A versioned service worker (`web/sw.js`) precaches every
  file, all or nothing, and keeps thumbnails in a cache of their own, which
  signing out clears. `node roll/tools/check.mjs` checks its file list and
  version.

## Deploy your own copy

```bash
node roll/tools/check.mjs
holm app validate --spec-v1 roll
holm @<peer> app deploy roll --spec-v1 --host roll.<your-domain>
```

Add `--force` when redeploying.

**Upload size.** Originals need the node's request body limit above their
size. The default is 1 MiB, so without a change Roll keeps the 2048 px copy
of most phone photos. To allow originals up to 30 MB:

```bash
holm @<peer> settings set settings.node.policy.runtime.request_body_max_bytes 33554432
```

**Quota.** Each member who isn't an app admin may store 1 GB. Change it with
the app's `QUOTA_MB` environment value (`env.holm.env`); `0` means no limit.

**Branding.** Then set the sign-in page's presentation and the link-preview
card for the new app id, after checking the settings schema on your node:

```bash
holm @<peer> settings set settings.apps.<app-id>.brand.name Roll
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#f0592a'
```

**Refreshing the place names.** Download `cities15000.txt`,
`admin1CodesASCII.txt` and `countryInfo.txt` from
<https://download.geonames.org/export/dump/> into one folder and run
`node roll/tools/places.mjs <folder>`.

## Known limits

- **Photos only.** Videos and other files are turned away with a note.
- **HEIC** works where the browser can open it (Safari). Elsewhere, export
  as JPEG first. The file picker asks for `image/*`, so an iPhone sends its
  photos as JPEG with their EXIF.
- **No faces, maps or AI search.** Search matches words: places, cameras,
  dates, albums and a few kinds of photo.
- **One owner per photo.** Albums can't be shared for others to add to, and
  there's no partner sharing between members yet.
- **A shared link is a capability.** Anyone who has it can see the album.
  Turning sharing off ends the link; turning it on again makes a new one.
- **Place names are approximate**: the nearest town of 15,000 or more, or its
  region. A place whose name has a full stop may not open from a typed
  address.
- **The library loads in one answer.** That suits libraries of thousands of
  photos; tens of thousands may run into the node's per-request memory
  budget.
- **The MCP tools can't add photos.** The browser makes each photo's
  thumbnail and preview, and a tool's input is capped at about 50 KB.
  Claude sees each photo's details, not the picture itself.
- iPhone Safari and the signed-in flows on the live node are not checked yet.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/fonts/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
- [ThumbHash](https://github.com/evanw/thumbhash): MIT, in
  `web/vendor/thumbhash/LICENSE.md`.
- Place names in `web/data/places.txt` are from
  [GeoNames](https://www.geonames.org), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The sample photos on the start page (`web/samples/`) and in the store
  screenshots are from [Unsplash](https://unsplash.com) through
  [Lorem Picsum](https://picsum.photos), under the
  [Unsplash licence](https://unsplash.com/license). Roll's mark is its own.
