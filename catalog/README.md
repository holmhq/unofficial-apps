# catalog

An app store for this repository, live at <https://unofficial.zyt.app>. Every
app gets its own page, and a Get button opens a sheet that installs it on
your own Holm node.

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
- **Look:** slate ink on cool paper, light and dark following the system.
  Each app brings its colour through its icon. Fonts are vendored, so nothing
  loads from a CDN.

## How it is built

A Holm app is a folder: static files are served as-is, and `api/main.js`
handles `/api/*`. There is no build step.

```text
index.html          page shell and the install <dialog>
src/app.js          router, front page and app pages
src/install.js      the install sheet and its commands
src/lib.js          DOM helpers and the app icon
src/styles.css      the whole design, light and dark
assets/             favicon and fonts (SIL OFL 1.1)
api/main.js         GET /api/index and GET /api/file
api/index.js        reads index.json and screenshots from GitHub, cached
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

`?ref=<branch>` on any page shows the store at another branch or tag, which is
handy for checking a pull request before it merges.

## Known limits

- `holm app install` isn't in Holm yet; the sheet shows the command it is
  expected to take.
- Pages are drawn in the browser, so link previews show the store's generic
  title and description rather than the app's.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `assets/fonts/`.
