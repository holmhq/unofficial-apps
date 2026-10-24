# Unofficial Holm apps

Small, real apps built on [Holm](https://holmhq.com) and published so you can
see exactly how they're made. Each folder is a complete Holm app with its
source, its README, and a `PROMPT.md`: a from-scratch request a coding agent
can build the app from. The public reference at
<https://holmhq.com/llms-full.txt> now teaches **Holm App Spec v1**; prompts use it
for Holm behavior and spell out this repository's own store conventions.

The prompts are the point. They show how little you need to say to get a
finished, deployed app.

New to Holm? The store's guide at
[unofficial.zyt.app/start](https://unofficial.zyt.app/start) sets up a node
in about ten minutes, then installs any app here with one command.

## Quick start

1. Clone the repo:

   ```sh
   git clone https://github.com/holmhq/unofficial-apps && cd unofficial-apps
   ```

2. Open a coding agent in the folder: Claude Code, pi, Codex or similar.
3. Type `/open`.

The `open` skill gets you to a good starting point:

- It explains what's here and checks whether Holm is installed. If it isn't,
  it walks you through Holm's own quick start.
- It offers to run one of these apps on your machine, or to build a new one
  from a prompt.
- It asks before installing anything or accepting a licence.

When you're done, type `/close`. It records your request in the app's
`PROMPT.md`, checks nothing private is about to be published, and commits.
It then pushes or offers to open a pull request.

If your agent has no slash commands, ask it to follow
`.claude/skills/open/SKILL.md` (or `close/SKILL.md`). To do it by hand instead, follow Holm's
ten-minute local start in section 4 of <https://holmhq.com/llms-full.txt>.

## Apps

| App | Live | What it shows |
| --- | --- | --- |
| [`catalog`](catalog/) | [unofficial.zyt.app](https://unofficial.zyt.app) | An app store: a page per app, reviews, Get to install, a setup guide, and an admin |
| [`pastebin`](pastebin/) | [pastebin.zyt.app](https://pastebin.zyt.app) | Expiring, one-time and revocable links; media; API keys and a CLI |
| [`feedback`](feedback/) | [feedback.zyt.app](https://feedback.zyt.app) | Feedback for websites, shops and events: a button, a QR code page, one inbox, stats |
| [`overlap`](overlap/) | not deployed yet | Find a time for a group: paint free times, a live heatmap, sign-in, realtime, sound and motion |
| [`relay`](relay/) | [relay.zyt.app](https://relay.zyt.app) | A private messenger: usernames that reveal nothing, groups, files, link previews, realtime |

## Layout of an app

Every app here uses the Holm App Spec v1 layout documented in sections 9–12
of <https://holmhq.com/llms-full.txt>:

```text
<app>/
  PROMPT.md         from-scratch request using only allowed public sources
  README.md         what it does, how it's built, how to deploy your own
  holm.json         identity/web settings and this repo's release metadata
  holm.symbol.svg   its icon
  web/              public files, served as-is (index.html …)
  api/main.js       server code (optional): export default { fetch(request, env) }
  listing/          store listing and screenshots
```

The CLI deploys `holm.json`, `holm.symbol.svg`, `web/` and `api/` for these
apps. Only `web/` is served as files; `api/` and `holm.json` are not public
URLs. `PROMPT.md`, `README.md`, scripts and `listing/` stay out of deploy.
Everything is nevertheless public source here, including server modules;
never commit private data to any part of an app.

For a new server, write `api/main.js` with the standard Fetch API:

```js
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/hello') {
      return Response.json({ hello: 'world' });
    }
    return env.holm.web.fetch(request);
  },
};
```

Use `env.holm.app.ds`, `.kv` and `.s3` for synchronous storage and
`env.holm.auth` for sign-in. Read JSON or multipart through the standard
Request methods. The existing apps delegate to `_legacy_main.js` through
`_holm.js`; those private modules are migration scaffolding, not a global
API to copy into a fresh app. See each README for its adapter limits.

These are no-build browser apps. Set SPA routing in `holm.json` with
`web.spa: true`. Use the current signed CLI and node; the public app guide
targets 0.243.2 and multipart forms need node 0.242.0 or newer. From the
repository root, check a folder locally, then deploy only to your chosen
peer and an unused host:

```sh
holm app validate --spec-v1 <app>
holm @<peer> app deploy <app> --spec-v1 --host <app>.example.com
```

Validation checks confined ingestion, not API execution or deployment.
`--spec-v1` is required on every deploy. Check the peer and host first;
repeat with `--force` only for an approved update of your own copy. Add
`--move` only when the human explicitly approves moving an older-format
app: it is one-way and preserves its id, domains, members and stored data.
After deploying, test API routes and the browser on mobile/desktop in
light/dark. Follow the app README for origin, egress, CSP and sign-in
settings; inspect the target help/schema because the public guide's operator
chapters retain an older baseline.

## Installing from this repository

From Holm 0.250, one command installs an app from this repository:

```sh
holm @<peer> app install github.com/holmhq/unofficial-apps/<app> --host <app>.example.com
```

With no `@<ref>`, Holm takes the release tag that [`index.json`](index.json)
names for the app; `@v<version>` picks one release. It checks the files
against the index's `h1` fingerprint, pins them, and deploys; installing a
newer version on the same host updates the same app and keeps its data.
These checksums pin a release; they are not signatures, so installing from a
repository still means trusting whoever can change it. On an older node,
clone a reviewed release tag, validate, and deploy the app folder with
`--spec-v1` as above. The store at
[unofficial.zyt.app](https://unofficial.zyt.app) writes all of these for your
node from each app's Get button.

- **Release tags:** each app versions independently with `<app>/v<version>`.
- **Fingerprint:** `h1` is SHA-256 over app-relative file hashes, like Go's
  `dirhash.Hash1`. The generator excludes `listing/` and hidden files, but
  includes README, PROMPT and other project-only files. It is a release
  fingerprint, not the exact v1 ingestion payload and not a signature.
- **Index:** [`index.json`](index.json) records versions, tags, fingerprints,
  size/file counts, symbols, listings and prompts. `node scripts/index.mjs`
  regenerates it; `--check` catches stale data and changed released files.
  `holm app install` reads each app's `tag` and `h1` from it.
- **Store listing:** `holm.symbol.svg` is one black path in a 24×24 box,
  painted on the app's `themeColor`. `listing/` holds `listing.json` and
  sample screenshots, excluded with `publish.exclude: ["/listing/"]` in
  `holm.json`. These are repository conventions not documented by the v1
  guide. Listing-only changes do not need a version bump.
- **Cover:** `listing/cover.png` is a 1200×630 card, the store's featured
  card in landscape (the app's colour, icon, title, subtitle and first
  screenshot). The store uses it as the app page's link preview.
  `node scripts/covers.mjs [app]` draws it with a headless Chrome or Chromium
  (set `CHROME` if none is found); run it again after changing the symbol,
  colour, title, subtitle or first screenshot. The index gives every listing
  image a short content hash, so a store can cache it under a URL that changes
  with the image.

To release a change to an app:

1. Bump `version` in its `holm.json`. Any fingerprinted file change in the
   app folder (outside `listing/` and hidden files) needs one, including
   README and PROMPT even though they do not deploy.
   Say what changed in `whatsNew` in its `listing/listing.json`.
2. Run `node scripts/index.mjs` and commit `index.json` with the change.
3. Merge to `main`. CI runs `node scripts/index.mjs --check`, which fails if
   the index is stale or a released version's files changed, then tags the
   new version.

These apps are unofficial. They are examples, not supported products.

## License

MIT (see `LICENSE`). Vendored third-party files keep their own licenses, noted
in each app's README.
