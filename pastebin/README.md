# pastebin

Private-first pastes on [Holm](https://holmhq.com). Text, code and files go
behind a link that can expire, open only once, or be revoked. The author's
name stays hidden unless they choose to show it.

Live at <https://pastebin.zyt.app>. It was built from the three short requests
quoted in [`PROMPT.md`](PROMPT.md), which also has reusable versions of them.

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

A Holm app is a folder. Static files are served as-is, and `api/main.js`
handles `/api/*` (plus `/raw/*`, declared in `manifest.json`). There is no
build step and no dependency to install.

```text
index.html              shell; applies the saved theme before first paint
src/                    browser app: router, composer, viewer, lists, Markdown (ES modules)
vendor/highlight/       highlight.js 11.11.1 (BSD-3-Clause)
vendor/marked/          marked 18.0.14, GFM parser (MIT), loaded only for Markdown
vendor/dompurify/       DOMPurify 3.4.16, HTML sanitizer (Apache-2.0 or MPL-2.0)
vendor/feedback/        embed.js from this repository's feedback app (MIT)
assets/                 icons, social card, fonts (SIL OFL 1.1)
api/main.js             router
api/pastes.js           create, list, owner actions, public read, burn claim, files
api/keys.js             API keys and /api/me
api/lib.js              validation, expiry state, purge, safe file responses
cli/pb                  POSIX sh CLI (curl + jq)
scripts/smoke.sh        runtime smoke through `holm test run`
holm.symbol.svg         app icon: one black path that stores paint on the theme colour
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in <https://holmhq.com/llm.txt>:

- **Document store, `holm.app.ds`:** pastes, API keys and profiles. Burn after
  reading is a single compare-and-set update (`{ ifRevision }`), so two people
  racing for one link can't both win.
- **Blob store, `holm.app.s3`:** uploads, written with `ttlMs` so expired files
  disappear even if nobody visits again.
- **`holm.image.thumbnail`:** gallery previews.
- **`holm.auth`:** the signed-in owner. API keys are app-owned bearer tokens,
  stored as SHA-256 hashes made with `crypto.subtle`.

## Deploy your own

```sh
holm app deploy . --host pastebin.example.com --spa --no-build
```

Set `DEFAULT_ORIGIN` in `api/lib.js` to your host first. Links in API replies
use it, because the runtime doesn't pass the request host to apps yet. The
web UI builds its links from the page's own origin and needs no setting.

Holm's sign-in page takes the app's name, icon and colour from node settings,
so give it pastebin's own:

```sh
holm settings set settings.apps.<app-id>.brand.name pastebin
holm settings set settings.apps.<app-id>.brand.icon_url /assets/icon-192-v1.png
holm settings set settings.apps.<app-id>.theme.accent '#173a72'
```

The footer's Send feedback opens the form of the owner's
[feedback](../feedback/) project. Holm pages run only their own scripts, so
`vendor/feedback/embed.js` is a copy of that app's script, and the page must be
allowed to frame the feedback app. In your copy, change `data-project` and
`data-origin` in `index.html` to your own project (or delete that script tag
and the footer button), then:

```sh
holm policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>
```

Anyone can sign up by default. To keep the app to yourself, close signup once
your account exists:

```sh
holm policy set auth.public_signup false --app <app-id>
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

`pb` wraps the same API. It reads the key from `PB_KEY`, then from
`~/.config/pastebin/key`, and the host from `PB_URL`:

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

- iOS Safari won't play served video, because the runtime doesn't answer
  HTTP Range requests yet. Desktop and Android play it, and every file has a
  Download link.
- The API takes JSON or multipart bodies; a raw `text/plain` body isn't
  readable by apps yet.

## Testing

`scripts/smoke.sh` runs 26 JSON assertions against `api/main.js` with
`holm test run` and a temporary database. Uploads were checked by hand on a
running node. A fresh test database needs your explicit acceptance of the
Holm Usage License, so review it with `holm license show`, then run:

```sh
HOLM_ACCEPT_LICENSE=<id>@<digest> scripts/smoke.sh
```

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Vendored parts keep
their own licenses:

- highlight.js: BSD-3-Clause, `vendor/highlight/LICENSE`.
- marked: MIT, `vendor/marked/LICENSE`.
- DOMPurify: Apache-2.0 or MPL-2.0, `vendor/dompurify/LICENSE`.
- feedback's `embed.js`: MIT, part of this repository.
- Bricolage Grotesque and Fragment Mono: SIL OFL 1.1, `assets/fonts/`.
