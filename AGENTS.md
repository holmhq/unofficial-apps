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

- The folder uses Holm App Spec v1: `holm.json` for identity and web
  settings, `web/` for public files, and optional `api/main.js` exporting
  `default { fetch(request, env) }`. There is no build step unless its
  README says to build locally first; the node never runs a build.
- `PROMPT.md` is a short, plain-language request that builds the app from
  scratch. It may cite only public sources: <https://holmhq.com>,
  <https://holmhq.com/llm.txt>, and Holm's own libraries in
  <https://github.com/holmhq/cdn>. Read the v1 app-building sections of
  `llm.txt` before writing code. Keep it short; its job is to show how simple
  a prompt can be. Quote the original request if there was one; historical
  quotes must not send the builder to private sources.
- `README.md` covers what the app does, how it's built (naming the Holm
  primitives it uses), how to deploy your own copy, its known limits, and the
  licenses of anything vendored.
- This is a public source repository, including `api/`, `holm.json`,
  `PROMPT.md` and `README.md`: none may contain private content. In these
  v1 apps only `web/` is served as files; `api/` and `holm.json` are not
  public URLs. README, PROMPT, scripts and listing files stay out of deploy.
- Add each new app to the table in the root `README.md`, and mention it in the
  `open` skill if it makes a better first demo than pastebin.
- `holm.json` carries the repository's app `version`. Changing any file
  fingerprinted for release (the app folder outside `listing/` and hidden
  files, including README and PROMPT) means a version bump, even when it is
  project-only at deploy time. Update `whatsNew` in `listing/listing.json`,
  then run `node scripts/index.mjs` to refresh `index.json` at the root.
  CI checks it and tags `<app>/v<version>` on `main`. A released tag's files
  never change.
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
- Write new server routes in `fetch(request, env)`: parse `request.url`,
  read JSON or `request.formData()`, return a standard `Response`, and use
  `env.holm.web.fetch(request)` for unhandled web paths. Storage is
  synchronous under `env.holm.app`; sign-in is `env.holm.auth`. The existing
  `_holm.js` and `_legacy_main.js` files are migration scaffolding, not a
  layout or global API for new apps.
- Set SPA fallback in `holm.json` with `web.spa: true`, not CLI routing
  flags. Validate locally with `holm app validate --spec-v1 <dir>`; that
  checks ingestion only, not API imports or execution.
- Deploy: `holm @<peer> app deploy <dir> --spec-v1 --host <host>`.
  `--spec-v1` is required every time. Check the chosen peer and unused host
  first; repeat with `--force` only for your own approved update. Add
  `--move` only when the human explicitly approves a one-way move of an
  older-format app; it preserves id, domains, members and data.
- Follow the public guide's current app baseline. Its operator chapters
  retain an older baseline: inspect the installed command help and target
  settings/policy schema before changing configuration. Do not present an
  undocumented API or future store install command as working.
- Holm's hosted sign-in has separate node presentation settings. After the
  first deploy, inspect the settings schema and set the app's
  `settings.apps.<app-id>.brand.name`, `brand.icon_url` and `theme.accent`
  on the explicit peer, as each README shows.
