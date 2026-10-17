# catalog

The front page of this repository, live at <https://unofficial.zyt.app>. It
lists every app here and shows each way to install it on your own Holm node,
side by side, so the install experience itself can be tried and compared.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md).

## What it does

- **Your node, once:** type your peer name and domain at the top. Every command
  on the page fills them in, highlighted, so you can see what changed.
- **Trust the repository:** the one owner command,
  `holm app repo add unofficial https://github.com/holmhq/unofficial-apps`.
- **Each app:** its title, description, version, release tag, file count and
  fingerprint (`h1`), with links to the live copy, the source at that tag, and
  the README.
- **Three ways to install**, as tabs. The one you pick applies to every app and
  is remembered:
  - **Clone and deploy:** clone the release tag, check the fingerprint with
    `scripts/index.mjs --check`, then `holm app deploy`. Works today.
  - **`holm app install`:** the one-line install from a trusted repository,
    pinned to a version. Not in Holm yet, so it's marked as coming.
  - **Ask an agent:** a prompt for any coding agent that clones the tag,
    checks the fingerprint, deploys, and follows the README.
- **The seal:** each app's mark is a ring of 32 ticks, one per byte of its
  fingerprint, in the app's own colour. If the files change, the seal changes.
- **Look:** slate ink on cool paper, with light and dark following the
  system. Fonts are vendored, so nothing loads from a CDN.

## How it is built

A Holm app is a folder: static files are served as-is, and `api/main.js`
handles `/api/*`. There is no build step.

```text
index.html          page shell and the app-entry template
src/app.js          reads /api/index, renders apps, commands, tabs and seals
src/styles.css      the whole design, light and dark
assets/             favicon and fonts (SIL OFL 1.1)
api/main.js         GET /api/index[?ref=<branch|tag|commit>]
api/index.js        fetches index.json from GitHub, cleans it, caches it
```

The Holm primitives it uses, all described in <https://holmhq.com/llm.txt>:

- **`holm.net.fetch`:** reads `index.json` from `raw.githubusercontent.com`
  at a ref, the same file a node or the CLI would read from a trusted
  repository. Egress is deny-by-default, so the operator allows that one host.
- **Shared KV, `holm.app.kv`:** the last good copy of each ref's index. It is
  refreshed after five minutes; if GitHub doesn't answer, the page shows the
  last good copy and says so.

The index itself comes from [`scripts/index.mjs`](../scripts/index.mjs) at
the repository root; see the root README.

## Deploy your own

For a fork, point `SOURCE` in `api/index.js` and `REPO` in `src/app.js` at
your repository, then:

```sh
holm app deploy catalog --host apps.example.com --spa --no-build
holm net allow raw.githubusercontent.com --app <app-id>
```

`?ref=<branch>` on the page shows the index on another branch or tag, which
is handy for checking a pull request before it merges.

## Known limits

- `holm app install` isn't in Holm yet; the page shows the command it is
  expected to take.
- The page reads only the index; it doesn't fetch or verify app files. The
  fingerprint check happens on the machine that installs.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `assets/fonts/`.
