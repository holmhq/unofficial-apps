# catalog

An app store for this repository, live at <https://unofficial.zyt.app>. Every
app gets its own page with ratings and reviews, a Get button opens an install
sheet, a guide at `/start` gets newcomers a Holm node of their own, and
authorized admins manage the store from `/admin`.

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md).

## Holm App Spec v1

catalog follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. Use `env.holm`,
and return standard `Response` objects. `web.spa` is off: the handler serves
every page itself (see How it is built). There is no build step on the node
or in this app.

Use a current signed Holm release; the public app guide targets 0.243.2.
Every deploy needs `--spec-v1`. Only `web/` is served as files: `api/` and
`holm.json` are not public URLs, and README, PROMPT and listing files stay
out of this app's deploy. They are still public source in this repository.

## What it does

- **Front page:** a "New to Holm?" card linking to the guide, a featured app
  on its own colour, then every app as a row with its icon, subtitle,
  category and a Get button.
- **Get started** at `/start`, linked from the header on every page, the
  front page and the install sheet. It assumes the reader never types a
  command: a coding agent does the work, and the reader answers what is
  theirs to decide. One long page:
  - what Holm is, beside the conversation the setup prompt starts, and a
    Copy the prompt button;
  - why a node puts every app here one request away, and any app you can
    describe too;
  - **Hand it to your agent:** pick an app, then where it runs (**This
    computer**, **A server** for the domain you type, or **I have Holm**).
    Each gives the prompt to paste, what the agent will do, what it will ask
    you (the licence, a password to keep, SSH, DNS records), and, folded
    away, the commands it runs;
  - building your own from a prompt, with an example;
  - twelve things Holm gives every app, each with the API that provides it;
  - links back to holmhq.com, the public reference, the licence and
    `/llms.txt`.
- **`/llms.txt`:** the agent's side of the guide. The prompts send the agent
  here: ground rules (never accept the licence for the person, keep secrets
  out of files, check the peer and host first), the app list in `index.json`,
  and the steps for a local node, a server, installing, sign-in and building
  a new app, each naming its section of <https://holmhq.com/llms-full.txt>.
  The store's pages need JavaScript, so their `<noscript>` points agents here.
- **App pages** at `/apps/<app>`:
  - the icon, title, subtitle, Get and a link to the live copy;
  - a strip of facts: version, size, category, license;
  - screenshots you can swipe through;
  - the description and what's new in this version;
  - **Built from a prompt:** the request a coding agent built the app from;
  - information: repository, release tag, size and file count, README.
- **The install sheet:** type your peer and domain once and every command is
  written for your node, with your parts highlighted; the guide shares them.
  Three ways, as tabs; the one you pick is remembered:
  - **Ask an agent** (first): a prompt with the install command, the app's
    README and `/llms.txt`.
  - **One command:** `holm app install github.com/holmhq/unofficial-apps/<app>@v<version> --host <host>`
    (Holm 0.250 or newer). Holm fetches that release tag, checks it against
    the repository's `index.json` fingerprint and deploys it; installing a
    newer version on the same host updates the same app and keeps its data.
  - **From source:** clone the release tag and deploy the app folder with
    `--spec-v1`.
  - A link for anyone without a node yet goes to the guide.
- **Accounts:** an avatar circle at the top right signs people in through
  Holm's hosted sign-in page, shown in an overlay so nobody loses their
  place. Its menu has Admin for those allowed in, Analytics (Holm's own
  analytics page for this app) for the people Holm shows it to, and Sign out.
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
  Holm and the source and has Send feedback, as in pastebin. It stays at the
  bottom of the window, and the page scrolls on under its frosted glass.
- **Link previews:** an app page shared in a chat or a post shows that app's
  name, description and cover, the 1200×630 card in its `listing/cover.png`
  (see the root README), instead of the store's own card.
- **Fast first paint:** every page arrives with the index, the tint and who
  is looking already in it, so the store draws without waiting on an API
  call. The page preloads every module, and screenshots and covers come from
  URLs that carry their content hash, which Cloudflare and browsers keep.

## How it is built

A Holm app is a folder. `web/` is served as-is. This app's
`api/main.js` routes `/api/*`, decodes JSON and converts its answers to
standard `Response` objects. Every page (a path without a file extension)
is `web/shell.html`, read with `env.holm.web.fetch`, with a
`<script id="boot">` holding the index, tint and viewer added to its head, its
canonical and `og:url` set to the page's own address, on an app page that
app's title, description and `og:`/`twitter:` image tags, and on `/start` the
guide's own title and description. The shell is not
named `index.html` because Holm serves a file that matches the path before the
handler runs, and `/` would skip all of this; for the same reason `web.spa` is
off and the handler serves every page. Other paths go to
`env.holm.web.fetch(request)` for static files.

```text
holm.json           name, version, colour, font caching, store metadata
web/                public files, served as-is:
  shell.html        page shell, module preloads, install <dialog>, feedback tag
  llms.txt          instructions for coding agents
  src/app.js        router, front page and app pages
  src/install.js    the install sheet and its commands
  src/start.js      the Get started guide at /start
  src/account.js    avatar, menu, sign-in overlay
  src/reviews.js    ratings, reviews and the review form
  src/admin.js      /admin
  src/lib.js        DOM and API helpers, the app icon, counting, commands, tabs
  src/styles.css    the whole design, light and dark
  assets/           icon, favicon and fonts (SIL OFL 1.1)
  vendor/feedback/  embed.js from this repository's feedback app (MIT)
api/main.js         v1 entry: /api to the routes; pages with data and previews
api/_holm.js        gives the routes `holm` and `respond` for each request
api/_legacy_main.js routes (below), written in Holm's original app format
api/index.js        reads index.json and screenshots from GitHub, cached
api/store.js        settings, counters and reviews
api/lib.js          responses, request checks, who is asking
holm.symbol.svg     this app's own icon
listing/            this app's store listing (not deployed)
```

The repository's [`index.json`](../index.json) is generated from each
app's `holm.json`, `holm.symbol.svg`, `PROMPT.md` and `listing/` metadata;
see the root README. That index, its version/fingerprint rules and symbol
format are repository conventions, not a shipped Holm install protocol.

The existing entry delegates to `api/_legacy_main.js`; `api/_holm.js` binds
`env.holm` for those imported modules on each request. These are migration
scaffolding, not the v1 authoring contract. For a fresh build, put routes in
`fetch(request, env)`, using the following documented v1 primitives from
<https://holmhq.com/llms-full.txt>:

- **`env.holm.net.fetch`:** synchronous, policy-controlled reads of the
  repository's public index. Global `fetch()` does not make outbound calls.
- **`env.holm.app.kv`:** cached indexes, screenshot freshness, store tint,
  hidden apps and daily counters. Storage calls are synchronous. The index
  refreshes after five minutes; counters expire after 40 days and contain
  no visitor identity.
- **`env.holm.auth`:** sign-in and app-owner/app-admin checks. Every admin
  route must authorize on the server, not just hide its button.
- **`env.holm.app.ds`:** reviews, one per member per app, pending until
  approved.
- **`env.holm.app.s3`:** screenshot and cover cache served by `/api/media`
  and `/api/file`, restricted to paths the index lists; an existing cached
  copy can survive a remote fetch failure. A copy whose bytes match the
  index's hash is kept for good, since the hash names that exact image.
- **`crypto.subtle`:** checks a cached image's SHA-256 against its hash before
  `/api/media` lets it be cached for a year.

The node caps how many outbound requests an app has open at once. A page of
uncached screenshots can exceed that cap, so `/api/media` answers such a
request `503` with `Retry-After`, and the page tries an image again a few
times.

The inherited authorization also calls `isNodeOwner()` and `isNodeAdmin()`;
its screenshot fetch uses `responseType: 'file'`. Those details are not
documented in the public v1 guide. Do not infer them from namespace names or
claim local validation proves them. The from-scratch prompt uses documented
app-role checks and leaves binary-fetch gaps explicit.

App icons are drawn from SVG path data in the index, painted white on each
app's `themeColor`.

The Analytics item uses `globalThis.__HOLM_SURFACES__`, which Holm adds to
the page for the people allowed to see the app's analytics (section 22 of the
reference). Signing in from the overlay doesn't reload the page, so for an
admin the menu reads the address from a fresh copy of the page.

## Deploy your own

For a fork, point `SOURCE` in `catalog/api/index.js` and `REPO` in
`catalog/web/src/lib.js` at your repository. Run from the repository root,
with a peer and unused host you have chosen:

```sh
holm app validate --spec-v1 catalog
holm @<peer> app deploy catalog --spec-v1 --host apps.example.com
holm @<peer> net allow raw.githubusercontent.com --app <app-id>
```

Use the app id printed by deploy for the egress allowlist. Check the peer's
health, host availability and target command help first. Validation is local
and does not execute the app or make remote fetches. Repeat the deploy with
`--force` only for your own approved update. Use `--move` only when you
explicitly approve a one-way move of an older-format app; it preserves the
id, domains, members and stored data.

Inspect the target's `settings schema --json` before changing sign-in
branding: the guide's operator chapters retain an older baseline. The tint
chosen in `/admin` is app data and cannot change node settings:

```sh
holm @<peer> settings set settings.apps.<app-id>.brand.name 'Unofficial Holm apps'
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /assets/icon.svg
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#0e7c66'
```

`?ref=<branch>` on any page shows the store at another branch or tag, which is
handy for checking a pull request before it merges.

Send feedback in the footer uses a local copy of the [feedback](../feedback/)
app's `embed.js`. Set `data-project` and `data-origin` in
`catalog/web/shell.html` to your own project, or remove that tag and the
button. The form loads when a pointer or focus reaches the button. The site
must be allowed to frame it:

```sh
holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>
```

Fonts are served with a one-year `Cache-Control` from `web.headers` in
`holm.json`; give a changed font a new file name. Shell files keep Holm's
`no-cache`, so a deploy shows at once.

The API:

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/me` | anyone | who is signed in, and whether they're an admin |
| `GET /api/index` | anyone | the apps they may see, with ratings and the tint |
| `GET /api/media/<app>/<file>?v=<hash>` | anyone | a screenshot or cover at main, cacheable |
| `GET /api/file` | anyone | a screenshot or cover the index lists, at any ref |
| `POST /api/events` | anyone | count a view, Get or copy |
| `GET /api/reviews/<app>` | anyone | approved reviews, and your own |
| `PUT`, `DELETE /api/reviews/<app>` | signed in | write or remove your review |
| `GET /api/admin` | admins | apps, numbers, every review, settings |
| `PUT /api/admin/settings` | admins | the tint and hidden apps |
| `POST`, `DELETE /api/admin/reviews/<id>` | admins | set a review's status, or delete it |

## Known limits

- Reviews need a node sign-in method (see section 13 of
  <https://holmhq.com/llms-full.txt>); signup is controlled by node policy.
- The counters accept anonymous requests and aren't rate-limited, so a
  determined visitor could inflate them. They're a rough guide, not a
  measurement.
- `holm app install` needs Holm 0.250 or newer; older nodes use the sheet's
  From source tab. Its checksums pin a release; they are not signatures.
- The guide copies the Holm Usage License's id and digest from the public
  reference. If Holm ships changed terms, run `holm server init` without
  `--accept-license`: it changes nothing and prints the value to pass.
- Node-role checks and binary screenshot fetching in the inherited handlers
  are outside the documented v1 examples. Verify them on your target before
  treating an admin session or cached image as working.
- An app without `listing/cover.png` keeps the store's own social card in
  its link preview, with its own title and description.
- The index refreshes every five minutes, and the first page view after that
  waits on GitHub for it. A failed read keeps the last good copy.

## Testing

`holm app validate --spec-v1 catalog` checks confined ingestion only, not
runtime imports, egress, authentication or copied install commands. On a
disposable node, test index loading and cached failure, screenshots, hidden
apps, review moderation and denied admin access. Check mobile/desktop in
light/dark and the install instructions before deploying publicly.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `web/assets/fonts/`.
