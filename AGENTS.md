# Agent instructions

This repository is **public**. It holds unofficial, open-source Holm apps that
show how such apps are built.

## Starting a session

When someone types `/open` or `open`, or asks where to begin, follow
`.claude/skills/open/SKILL.md`; it is linked into `.pi/skills/` too. It
welcomes newcomers, helps them install Holm from its public quick start, and
offers to run one of the apps locally.

When someone types `/close` or `close`, or says they're done, follow
`.claude/skills/close/SKILL.md`. It records the session's request in each
touched app's `PROMPT.md`, checks for private content, commits, and then pushes
or opens a pull request.

## Every app folder

- The folder is a deployable Holm app at its root, with no build step unless
  its README says otherwise.
- `PROMPT.md` is a short, plain-language request that builds the app from
  scratch. It may cite only public sources: <https://holmhq.com>,
  <https://holmhq.com/llm.txt>, and Holm's own libraries in
  <https://github.com/holmhq/cdn>. Keep it short; its job is to show how simple
  a prompt can be. Quote the original request if there was one.
- `README.md` covers what the app does, how it's built (naming the Holm
  primitives it uses), how to deploy your own copy, its known limits, and the
  licenses of anything vendored.
- Everything in an app folder deploys publicly, including `PROMPT.md` and
  `README.md`.
- Add each new app to the table in the root `README.md`, and mention it in the
  `open` skill if it makes a better first demo than pastebin.
- `manifest.json` carries the app's `version`. Changing any file the app
  deploys means a version bump, then `node scripts/index.mjs` to refresh
  `index.json` at the root. CI checks it and tags `<app>/v<version>` on
  `main`. A released tag's files never change.
- An app's store listing is `holm.symbol.svg` (its icon) and a `listing/`
  folder with `listing.json` and screenshots, excluded from the deploy. Take
  screenshots with sample data, never real users' content.

## Never commit

- Holm repository source, private Holm docs, plans or issue references.
- Credentials, API keys, `.env` files, or machine-specific paths.
- Personal names or emails in files. Maintainers commit as
  `The Holm Authors <authors@holmhq.com>` (repo-local git config, which a fresh
  clone does not carry); contributors commit under their own name.
- Private planning notes. Keep those in your private tracker.

## Work

- No third-party runtime CDN. Vendor libraries into the app and keep their
  licenses next to them. Holm's own libraries in `holmhq/cdn` are the
  exception: load them from jsDelivr, pinned to a commit and a `v-X.Y.Z/`
  folder, with an integrity hash, and say so in the README.
- Verify in a real browser on mobile and desktop, in light and dark, before
  deploying.
- Deploy: `holm @<peer> app deploy <app> --host <host> --spa --no-build`.
- Holm's hosted sign-in page shows the app's name, icon and colour only if the
  node has them: set `settings.apps.<app-id>.brand.name`, `brand.icon_url` and
  `theme.accent` after the first deploy, as each app's README shows.
