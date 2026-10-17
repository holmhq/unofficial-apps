# Agent instructions

This repository is **public**. It holds unofficial, open-source Holm apps that
show how such apps are built.

## Every app folder

- The folder is a deployable Holm app at its root, with no build step unless
  its README says otherwise.
- `PROMPT.md` is a short, plain-language request that builds the app from
  scratch. It may cite only public sources: <https://holmhq.com> and
  <https://holmhq.com/llm.txt>. Keep it short; its job is to show how simple
  a prompt can be. Quote the original request if there was one.
- `README.md` covers what the app does, how it's built (naming the Holm
  primitives it uses), how to deploy your own copy, its known limits, and the
  licenses of anything vendored.
- Everything in an app folder deploys publicly, including `PROMPT.md` and
  `README.md`.
- Add each new app to the table in the root `README.md`.

## Never commit

- Holm repository source, private Holm docs, plans or issue references.
- Credentials, API keys, `.env` files, or machine-specific paths.
- Personal names or emails. Credit "The Holm Authors"; commits here are made
  as `The Holm Authors <authors@holmhq.com>` (repo-local git config).
- Private planning notes. Keep those in your private tracker.

## Work

- No third-party runtime CDN. Vendor libraries into the app and keep their
  licenses next to them.
- Verify in a real browser on mobile and desktop, in light and dark, before
  deploying.
- Deploy: `holm @<peer> app deploy <app> --host <host> --spa --no-build`.
