# Unofficial Holm apps

Small, real apps built on [Holm](https://holmhq.com) and published so you can
see exactly how they're made. Each folder is a complete Holm app with its
source, its README, and a `PROMPT.md`: the short request a coding agent can
build the app from, using only the public reference at
<https://holmhq.com/llm.txt>.

The prompts are the point. They show how little you need to say to get a
finished, deployed app.

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
ten-minute local start in section 4 of <https://holmhq.com/llm.txt>.

## Apps

| App | Live | What it shows |
| --- | --- | --- |
| [`catalog`](catalog/) | [unofficial.zyt.app](https://unofficial.zyt.app) | An app store: a page per app, reviews, Get to install, and an admin |
| [`pastebin`](pastebin/) | [pastebin.zyt.app](https://pastebin.zyt.app) | Expiring, one-time and revocable links; media; API keys and a CLI |

## Layout of an app

```text
<app>/
  PROMPT.md       the request that builds it (uses only holmhq.com)
  README.md       what it does, how it's built, how to deploy your own
  manifest.json   Holm app manifest, with the app's version
  index.html …    static files, served as-is
  api/            server code (optional)
```

Deploy any app with the `holm` CLI:

```sh
holm app deploy <app> --host <app>.example.com --spa --no-build
```

## Installing from this repository

A node owner can trust this whole repository with one command:

```sh
holm app repo add unofficial https://github.com/holmhq/unofficial-apps
```

Trusting the repository is the security decision: anyone who can change its
files can change anything else in it too. Every app is then released the same
way, so it can be installed one by one, and
[unofficial.zyt.app](https://unofficial.zyt.app) is its store.

- **Release tags:** each version is tagged after its app, like
  `pastebin/v0.1.0`, so apps in one repository version independently.
- **Fingerprint:** `h1` is a SHA-256 over every file the app deploys,
  computed like Go's `dirhash.Hash1` (the `h1:` lines in `go.sum`). It isn't
  a signature. A node records it at install, so a tag that is later moved to
  different files is noticed, and CI uses it to keep released versions fixed.
  The store doesn't show it.
- **Index:** [`index.json`](index.json) lists every app folder with its
  version, tag, fingerprint and store listing. `holm app install
  unofficial/<app>@v<version>` will read it; until then, clone the tag and
  deploy the folder.
- **Store listing:** an app's icon is `holm.symbol.svg`, one black path in a
  24×24 box that the store paints on the app's `themeColor`. Its `listing/`
  folder holds `listing.json` (subtitle, category, description, what's new,
  screenshots) and the screenshots, and stays out of the deploy with
  `"publish": {"exclude": ["/listing/"]}` in `manifest.json`. Listing changes
  don't need a version bump.

To release a change to an app:

1. Bump `version` in its `manifest.json`. Any change to a deployed file
   needs one, including its README and PROMPT. Say what changed in
   `whatsNew` in its `listing/listing.json`.
2. Run `node scripts/index.mjs` and commit `index.json` with the change.
3. Merge to `main`. CI runs `node scripts/index.mjs --check`, which fails if
   the index is stale or a released version's files changed, then tags the
   new version.

These apps are unofficial. They are examples, not supported products.

## License

MIT (see `LICENSE`). Vendored third-party files keep their own licenses, noted
in each app's README.
