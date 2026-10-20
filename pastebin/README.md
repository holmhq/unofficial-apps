# pastebin

Private-first pastes on [Holm](https://holmhq.com). Text, code and files go
behind a link that can expire, open only once, or be revoked. The author's
name stays hidden unless they choose to show it.

Live at <https://pastebin.zyt.app>. It was built from the three short requests
quoted in [`PROMPT.md`](PROMPT.md), which also has reusable versions of them.

## Holm App Spec v1

pastebin follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. The handler
returns standard `Response` objects and uses `env.holm` for storage and
sign-in. Set `web.spa: true` in `holm.json`; the node runs no build.

Use a current signed Holm release; the public app guide targets 0.243.2,
and multipart `request.formData()` needs node 0.242.0 or newer. Every deploy
needs `--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are
not public URLs, and README, PROMPT and listing files stay out of this app's
deploy. They are still public source in this repository.

## What it does

- **Write:** a composer with live syntax highlighting and language
  auto-detection. Attach up to 10 files of up to 25 MB each with the paperclip,
  by dropping them anywhere, or by pasting a screenshot. The link options live
  in the create button, which reads as a sentence: *Create one-time link with
  my name for 1h*. Clicking an italic word crosses it out, which turns it off
  without moving anything. The arrow picks the expiry. ⌘/Ctrl+Enter creates
  the link, and the draft and options are remembered. The composer is an app
  screen: however much you paste, the page stays still and only the editor
  scrolls.
- **Share:**
  - Expiry from 10 minutes to 30 days, or never. A fuse line on the paste
    burns down to the deadline.
  - Burn after reading: the first opener sees the paste, then it is deleted.
    Link unfurlers can't burn it, because opening needs a click; the owner's
    own preview never burns it.
  - Revoke or delete at any time.
- **Read:**
  - Markdown renders as GitHub-flavoured Markdown (tables, task lists,
    strikethrough, autolinks, highlighted code, heading anchors). It's styled
    after Tailwind's Typography "prose" defaults, with a Preview / Source
    switch. Images from other sites stay hidden until the reader asks, so
    those sites can't see who's reading.
  - Line-numbered code with copy, raw, download and wrap.
  - An image gallery with a lightbox.
  - Video and audio players.
  - Attached text files are highlighted.
- **Automate:** API keys, an HTTP API and the `pb` CLI.
- **Look:** a minimal "cyanotype" design. Light is Prussian ink on white
  paper; dark is the print itself, pale ink on Prussian blue. Ember marks
  anything that burns. The header holds only the brand and an avatar menu
  (your pastes, API keys, the light / system / dark switch, sign-out). A small
  footer says it's a Holm app, links here, and has Send feedback, which opens
  a feedback form over the page. Fonts and the highlighter are vendored, so
  nothing loads from a CDN.

## How it is built

A Holm app is a folder. `web/` is served as-is. This app's
`api/main.js` routes `/api/*` and `/raw/*`, reads JSON with `request.text()`
and multipart bodies with `request.formData()`, and converts its answers to
standard `Response` objects. Other paths go to `env.holm.web.fetch(request)`
for static files and SPA fallback. There is no build step or dependency to
install.

```text
holm.json               name, version, colour, SPA routing, store metadata
web/                    public files, served as-is:
  index.html            shell; applies the saved theme before first paint
  src/                  browser app: router, composer, viewer, lists, Markdown (ES modules)
  vendor/highlight/     highlight.js 11.11.1 (BSD-3-Clause)
  vendor/marked/        marked 18.0.14, GFM parser (MIT), loaded only for Markdown
  vendor/dompurify/     DOMPurify 3.4.16, HTML sanitizer (Apache-2.0 or MPL-2.0)
  vendor/feedback/      embed.js from this repository's feedback app (MIT)
  assets/               icons, social card, fonts (SIL OFL 1.1)
  cli/pb                POSIX sh CLI (curl + jq)
api/main.js             v1 entry: hands /api and /raw requests to the router
api/_holm.js            gives the router its `holm` and `respond` for each request
api/_legacy_main.js     router, written in Holm's original app format
api/pastes.js           create, list, owner actions, public read, burn claim, files
api/keys.js             API keys and /api/me
api/lib.js              validation, expiry state, purge, safe file responses
scripts/smoke.sh        runtime smoke through `holm test run` (not deployed)
holm.symbol.svg         app icon: one black path that stores paint on the theme colour
listing/                store listing and screenshots (not deployed)
```

The existing entry delegates to `api/_legacy_main.js`; `api/_holm.js` binds
`env.holm` for those imported modules on each request. These private modules
are this app's migration scaffolding, not the v1 authoring contract. For a
fresh build, write routes directly in `fetch(request, env)` as the public
guide shows; do not start with global `holm`, `request` or `respond`.

The v1 primitives described in <https://holmhq.com/llms-full.txt> are:

- **Document store, `env.holm.app.ds`:** pastes, API keys and profiles.
  Storage calls are synchronous; use a documented DS transaction when a
  group of changes must commit together.
- **Blob store, `env.holm.app.s3`:** uploads and previews. The guide shows
  `s3.put(path, arrayBuffer, mime)` and explicit deletion; files are served
  by the handler, never directly from storage.
- **`env.holm.image.thumbnail`:** gallery previews.
- **`env.holm.auth`:** the signed-in owner. API keys are app-owned bearer
  tokens, stored as SHA-256 hashes made with `crypto.subtle`.

The inherited handlers also use DS `{ ifRevision }` updates and blob
`ttlMs` options. The public v1 guide does not document those options; local
validation cannot prove their concurrency or idle-cleanup behavior. The
from-scratch prompt instead asks for documented transactions and request-time
expiry checks, without promising background deletion.

## Deploy your own

Run these from the repository root, with the peer and an unused host you
have chosen:

```sh
holm app validate --spec-v1 pastebin
holm @<peer> app deploy pastebin --spec-v1 --host pastebin.example.com
```

Validation is local: it checks the folder, not execution or deployment.
Check the peer's health and host availability first. For an update to your
own deployed copy, repeat the deploy with `--force`. Use `--move` only when
you explicitly approve moving an existing older-format app; it is one-way
and preserves its id, domains, members and stored data.

Set `DEFAULT_ORIGIN` in `pastebin/api/lib.js` to your public origin first.
This adapter's link helper falls back to it when no `Host` header is
available. That is an app implementation detail, not a v1 limitation:
`request.url` is available to a fresh fetch handler. The browser UI builds
links from its own origin.

Holm's sign-in presentation has separate node settings. Inspect the target's
`settings schema --json` (the guide's operator chapters retain an older
baseline), then use the app id printed by deploy:

```sh
holm @<peer> settings set settings.apps.<app-id>.brand.name pastebin
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /assets/icon-192-v1.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#173a72'
```

The footer's Send feedback uses a local copy at
`pastebin/web/vendor/feedback/embed.js` and frames the
[feedback](../feedback/) app. Set `data-project` and `data-origin` in
`pastebin/web/index.html` to your own project, or remove that script and
button. The site operator must allow the feedback origin:

```sh
holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>
```

Sign-up depends on the node's authentication methods and policy. To keep
the app to yourself, close public signup once your account exists:

```sh
holm @<peer> policy set auth.public_signup false --app <app-id>
```

## API and CLI

Create a key in the app under API keys, then send it as a bearer token, with
a JSON or multipart body (`file`, `file1` … `file9`):

```sh
curl https://pastebin.example.com/api/pastes -H "Authorization: Bearer $PB_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"content":"hello","expires_in":"1d","burn_after_read":true}'

curl https://pastebin.example.com/api/pastes -H "Authorization: Bearer $PB_KEY" \
  -F file=@photo.jpg -F expires_in=7d
```

`expires_in` takes `10m`, `1h`, `1d`, `7d`, `30d`, `1y`, `never`, or seconds.
`show_author` puts your name and avatar on the paste.

The routes:

| Route | Purpose |
| --- | --- |
| `POST /api/pastes` | Create |
| `GET /api/pastes` | List your pastes |
| `GET` / `PATCH /api/pastes/<slug>` | Read one; change title, expiry or author display |
| `POST /api/pastes/<slug>/revoke` | Revoke |
| `DELETE /api/pastes/<slug>` | Revoke and remove |
| `GET /api/p/<slug>` | Public read; a one-time paste reads as sealed |
| `POST /api/p/<slug>/open` | Open a one-time paste, which uses it up |
| `GET /raw/<slug>` | Plain text |

`pb`, served from `web/cli/pb`, wraps the same API. It reads the key from
`PB_KEY` or the key saved by `pb login`, and the host from `PB_URL`:

```sh
pb login pb_...                   # save a key
pb new notes.md -e 1d             # paste a file's text, expiring in a day
echo secret | pb new --burn       # one-time link from stdin
pb new --file photo.jpg --show-me # attach a file and show your name
pb ls                             # list your pastes
pb revoke <slug>                  # kill the link now
```

## Security notes

- Links are 12 random characters from `crypto.getRandomValues`, about 71 bits.
- Uploaded files are served with a sandbox Content-Security-Policy and
  `nosniff`. Only images, video, audio, PDFs and plain text open inline;
  HTML, SVG and everything else download. That way a paste can't run script
  on the app's own origin.
- Rendered Markdown goes through DOMPurify. Scripts, event handlers,
  `javascript:` links, styles, forms, frames and media are removed, and ids
  are prefixed so a paste can't collide with the app's own elements.
- The page sends no referrer and asks search engines not to index it.

## Known limits

- The file-serving code returns whole files, not HTTP Range responses;
  playback can vary by browser. Every file has a Download link.
- This app's adapter decodes JSON and multipart, not raw `text/plain`.
  V1 itself supports `request.text()`; a fresh handler can read plain text.
- The inherited revision and blob-expiry options above need runtime checks,
  especially two simultaneous opens and cleanup after a link expires.

## Testing

Run `holm app validate --spec-v1 pastebin` from the repository root. It
checks confined ingestion only: it does not execute the API or its imports.
`scripts/smoke.sh` still calls the older `holm test run` interface and is not
v1 runtime proof. On a disposable node, exercise creation, uploads, owner
access, two simultaneous burn claims, expiry and revocation, then check the
UI on mobile and desktop in light and dark before deploying publicly.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Vendored parts keep
their own licenses:

- highlight.js: BSD-3-Clause, `web/vendor/highlight/LICENSE`.
- marked: MIT, `web/vendor/marked/LICENSE`.
- DOMPurify: Apache-2.0 or MPL-2.0, `web/vendor/dompurify/LICENSE`.
- feedback's `embed.js`: MIT, part of this repository.
- Bricolage Grotesque and Fragment Mono: SIL OFL 1.1, `web/assets/fonts/`.
