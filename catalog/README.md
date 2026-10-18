# catalog

An app store for this repository, live at <https://unofficial.zyt.app>. Every
app gets its own page with ratings and reviews, a Get button opens a sheet
that installs it on your own Holm node, and the node's owner and admins
manage the store from `/admin`.

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md).

## What it does

- **Front page:** a featured app on its own colour, then every app as a row
  with its icon, subtitle, category and a Get button.
- **App pages** at `/apps/<app>`:
  - the icon, title, subtitle, Get and a link to the live copy;
  - a strip of facts: version, size, category, license;
  - screenshots you can swipe through;
  - the description and what's new in this version;
  - **Built from a prompt:** the request a coding agent built the app from;
  - information: repository, release tag, size and file count, README.
- **The install sheet:** type your peer and domain once and every command is
  written for your node, with your parts highlighted. Three ways, as tabs; the
  one you pick is remembered:
  - **Terminal:** clone the release tag and `holm app deploy` the folder.
    Works today.
  - **Ask an agent:** a prompt for any coding agent to do the same and follow
    the README.
  - **`holm app install`:** trust the repository once, then install by name
    and version. Not in Holm yet, so it's marked as coming.
- **Accounts:** an avatar circle at the top right signs people in through
  Holm's hosted sign-in page, shown in an overlay so nobody loses their
  place. Its menu has Admin for those allowed in, and Sign out.
- **Ratings and reviews:** anyone signed in can rate an app and write a
  review, one per app, and edit or delete it. A new or edited review is shown
  only to its author, marked as waiting, until an admin approves it. Approved
  reviews give each app its average rating, shown on its row and page.
- **Admin** at `/admin`, for the node's owner and admins and the app's own
  admins:
  - show or hide each app; a hidden app, its reviews and its screenshots are
    gone for everyone else;
  - light numbers per app for this week and the last 30 days: page views, Get
    taps and copied commands;
  - approve, reject, unpublish or delete reviews;
  - the store's tint: six presets or any colour, previewed live before saving,
    with a warning if it would be hard to read.
- **Look:** slate ink on cool paper, light and dark following the system.
  Each app brings its colour through its icon, and everything else takes the
  tint. Fonts are vendored, so nothing loads from a CDN. A footer links to
  Holm and the source, as in pastebin.

## How it is built

A Holm app is a folder: static files are served as-is, and `api/main.js`
handles `/api/*`. There is no build step.

```text
index.html          page shell and the install <dialog>
src/app.js          router, front page and app pages
src/install.js      the install sheet and its commands
src/account.js      avatar, menu, sign-in overlay
src/reviews.js      ratings, reviews and the review form
src/admin.js        /admin
src/lib.js          DOM and API helpers, the app icon, counting
src/styles.css      the whole design, light and dark
assets/             icon, favicon and fonts (SIL OFL 1.1)
api/main.js         routes (below)
api/index.js        reads index.json and screenshots from GitHub, cached
api/store.js        settings, counters and reviews
api/lib.js          responses, request checks, who is asking
holm.symbol.svg     this app's own icon
listing/            this app's store listing (not deployed)
```

Everything the store shows comes from the repository's
[`index.json`](../index.json), which `scripts/index.mjs` builds from each
app's manifest, its `holm.symbol.svg` and its `listing/` folder; see the root
README. The Holm primitives it uses, all described in
<https://holmhq.com/llm.txt>:

- **`holm.net.fetch`:** reads `index.json` and screenshots from
  `raw.githubusercontent.com` at a ref, the same files a node would read from
  a repository it trusts. Egress is deny-by-default, so the operator allows
  that one host.
- **Shared KV, `holm.app.kv`:** the last good index for each ref (refreshed
  after five minutes) and the freshness marks for cached screenshots.
- **`holm.auth`:** who is signed in, and whether they are the node's owner or
  an admin (`isNodeOwner`, `isNodeAdmin`) or one of the app's own
  (`isAppOwner`, `isAppAdmin`). Every admin route checks on the server.
- **Document store, `holm.app.ds`:** reviews, one per person per app, with
  their status.
- **Shared KV, again:** the settings (tint, hidden apps) and the counters, one
  key per app, day and kind, each expiring after 40 days. Counting keeps
  nothing about who, and skips admins.
- **Blob store, `holm.app.s3`:** cached screenshots. `/api/file` serves only
  the screenshots the index lists, so the store can't be used to fetch
  anything else from GitHub. If GitHub doesn't answer, the last good copy is
  served.

App icons are drawn, not downloaded: the index carries each app's
`holm.symbol.svg` path, painted in white on the app's theme colour.

## Deploy your own

For a fork, point `SOURCE` in `api/index.js` and `REPO` in `src/lib.js` at
your repository, then:

```sh
holm app deploy catalog --host apps.example.com --spa --no-build
holm net allow raw.githubusercontent.com --app <app-id>
```

Holm's sign-in page takes the app's name, icon and colour from node settings,
so give it the store's own (the tint chosen in `/admin` stays inside the
store; it can't change node settings):

```sh
holm settings set settings.apps.<app-id>.brand.name 'Unofficial Holm apps'
holm settings set settings.apps.<app-id>.brand.icon_url /assets/icon.svg
holm settings set settings.apps.<app-id>.theme.accent '#0e7c66'
```

`?ref=<branch>` on any page shows the store at another branch or tag, which is
handy for checking a pull request before it merges.

The API:

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/me` | anyone | who is signed in, and whether they're an admin |
| `GET /api/index` | anyone | the apps they may see, with ratings and the tint |
| `GET /api/file` | anyone | a screenshot the index lists |
| `POST /api/events` | anyone | count a view, Get or copy |
| `GET /api/reviews/<app>` | anyone | approved reviews, and your own |
| `PUT`, `DELETE /api/reviews/<app>` | signed in | write or remove your review |
| `GET /api/admin` | admins | apps, numbers, every review, settings |
| `PUT /api/admin/settings` | admins | the tint and hidden apps |
| `POST`, `DELETE /api/admin/reviews/<id>` | admins | set a review's status, or delete it |

## Known limits

- Reviews need a way to sign in on the node: magic-link email or an OAuth
  provider (see section 13 of llm.txt). Anyone who can sign up can review.
- The counters accept anonymous requests and aren't rate-limited, so a
  determined visitor could inflate them. They're a rough guide, not a
  measurement.
- `holm app install` isn't in Holm yet; the sheet shows the command it is
  expected to take.
- Pages are drawn in the browser, so link previews show the store's generic
  title and description rather than the app's.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `assets/fonts/`.
