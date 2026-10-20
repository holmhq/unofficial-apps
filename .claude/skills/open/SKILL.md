---
name: open
description: Start here. Welcome someone who just cloned this repository of unofficial, open-source Holm apps, check whether Holm is installed (and help install it if not), then offer to run one of the apps on their machine. Use when the user types /open, "open", "start", or asks where to begin.
---

# /open: start here

The person in front of you has just cloned `holmhq/unofficial-apps`. They may
be new to Holm, and Holm may not be installed. Be friendly and brief. Go one
step at a time, and wait for their answer before anything that installs
software, accepts a licence, or starts a server.

Your only source on Holm is the public reference at
<https://holmhq.com/llms-full.txt>. Fetch the section you need rather than guessing
commands or flags:

- §4: Ten-minute local start (install, local node, first deploy).
- §9: App model.
- §12.14: Email.
- §13: Authentication.

## 1. Welcome (no commands yet)

In four or five short lines, tell them:

- **What this repo is:** small, real apps built on Holm. Each folder is a
  complete app with a `PROMPT.md` (the short request a coding agent built it
  from) and a `README.md`.
- **Which apps there are:** the table in the root `README.md`.
- **What Holm is:** one binary plus one SQLite database that hosts static
  sites, runs server-side JavaScript, and handles sign-in, storage and more.

## 2. Check the machine (read-only)

Run `git status --short`. If there are uncommitted changes, this is a
returning contributor: summarise them and mention that `/close` wraps them up.

Run `holm --version`.

- **Installed:** report the version, then run `holm peer list` to see whether
  a local node is already registered.
- **Not installed:** explain the install from §4.1 and ask before running
  anything. It is `curl -fsSL https://holmhq.com/install.sh | bash`; choose
  "CLI Tool Only", then make sure `~/.local/bin` is on `PATH`. Offer to
  download the script and show it to them first, instead of piping it into a
  shell.

## 3. Offer a path

Offer three choices, and recommend the first:

1. **Run an app locally:** see step 4.
2. **See how an app is built:** read its `README.md` and `PROMPT.md`,
   summarise which Holm features it uses, and point to the interesting files.
3. **Build a new app from a prompt:** help them write a short `PROMPT.md` in
   the same style, then build it with `llms-full.txt` as the only Holm reference.

## 4. Run an app locally (pastebin as the example)

Follow §4.2 for the exact commands.

1. **Licence.** A node needs explicit acceptance of the Holm Usage License.
   Run `holm license show`, let them read it, and pass `--accept-license` only
   after they say they accept. Never accept it on their behalf.
2. **Initialise a development node** on `holm.localhost`, as in §4.2. This
   creates `~/.holm/data.db` and refuses to overwrite an existing one; if a
   node already exists, use it instead.
3. **Create the operator member** and keep its one-time token out of git.
   Start the node in a second terminal (`holm start --runtime-mode manual`),
   then register it as the `local` peer, all as in §4.2.
4. **Deploy:**
   `holm @local app deploy pastebin --host pastebin.holm.localhost --spa --no-build`.
   Add `--force` when redeploying.
5. **Open** <http://pastebin.holm.localhost:4698/>. Chrome and Firefox resolve
   `*.localhost` to this machine.
6. **Signing in.** A fresh node has no sign-in method (§13.1). Offer two
   options:
   - **Quick look:** make a test user and a session bound to the exact host
     the browser uses, port included. Run
     `holm test create-user --name You --email you@test.local`, then
     `holm test create-session --address you@test.local --host pastebin.holm.localhost:4698`.
     In the browser's developer tools, add the printed token as a cookie
     named `holm_session` for that host and reload. These test commands write
     to the local database, so never point them at a real node.
   - **Real use:** set up magic-link email through their own SMTP server
     (§12.14), or an OAuth provider (§13.1).
7. **Links in API replies.** For links from the API and the `pb` CLI to point
   at the local copy, set `DEFAULT_ORIGIN` in `pastebin/api/lib.js` to
   `http://pastebin.holm.localhost:4698` and redeploy.

Stop the node with Ctrl-C in its terminal. `holm @local app list` shows what
is deployed.

## Rules

- Ask before installing anything, accepting the licence, or starting a server.
- Use only public sources: holmhq.com and this repository.
- Tokens printed during setup are secrets; never write them into tracked files.
- Keep each reply short and end it with the next choice for them to make.
