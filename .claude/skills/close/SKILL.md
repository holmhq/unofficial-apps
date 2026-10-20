---
name: close
description: Wrap up a session in this repository. Make sure every app that was touched still works, its PROMPT.md records the request that changed it, the READMEs are current, nothing private is about to be published, and the work is committed and pushed (or offered as a pull request). Use when the user types /close, "close", or says they're done.
---

# /close: wrap up

This repository is public. Its point is to show how little you need to say to
build a real Holm app, so every change to an app should leave behind the
prompt that caused it. Go step by step, and ask before committing, pushing or
opening a pull request.

## 1. See what changed

Run `git status --short` and `git diff --stat`. List the app folders that
changed and any new ones. If nothing changed, say so and stop.

## 2. For each app that changed

1. **`PROMPT.md`:** record this session as the next iteration.
   - Add a numbered heading with a short, reusable version of the request in
     a `text` code block.
   - Under "The original requests", quote the person's own messages word for
     word. If you don't have a message verbatim, ask for it; never invent or
     polish one.
   - Prompts may rely only on <https://holmhq.com/llms-full.txt>, never on private
     knowledge.
2. **The app's `README.md`:** update what it does, the file layout, known
   limits, and the licence of anything newly vendored.
3. **A new app** needs `manifest.json` (with a `version`), `PROMPT.md` and
   `README.md` in its folder, plus a row in the root `README.md` table. If it
   makes a better first demo, mention it in `.claude/skills/open/SKILL.md`.
4. **Version and index:** bump `version` in the app's `manifest.json` (patch
   for fixes and docs, minor for features) and update `whatsNew` in its
   `listing/listing.json`. If the app looks different, retake its
   screenshots with sample data. Then run `node scripts/index.mjs`
   and `node scripts/index.mjs --check`. The check fails if a released
   version's files changed. CI tags the new version once it reaches `main`.
5. **Checks:** run whatever the app ships with, such as `scripts/smoke.sh`.
   Its README says what it needs; Holm test databases ask for explicit licence
   acceptance, so let the person decide. If a local node is running, offer to
   redeploy (`holm @local app deploy <app> --host <app>.holm.localhost --spa --no-build --force`)
   and open it.

## 3. Check nothing private is published

Scan the diff for anything that should not be public:

```sh
git diff --cached --no-color; git diff --no-color
git status --short --untracked-files=all
```

Look for:

- API keys, tokens, passwords, `.env` files;
- machine paths such as `/home/…` or `/Users/…`;
- personal emails and private hostnames;
- third-party code without its licence next to it, or a runtime CDN link.

Show every hit and fix it before committing.

## 4. Commit

Make one commit per app, with a message like `<app>: <what changed>`. Ask
first.

- **Maintainers** commit as `The Holm Authors <authors@holmhq.com>`. Set it
  once with `git config user.name` and `git config user.email` in this clone.
- **Contributors** commit under their own name.

## 5. Share

- **They can push** (`git push --dry-run` succeeds): ask, then push.
- **They can't push:** offer to open a pull request. Fork with
  `gh repo fork --remote`, push a branch, then run `gh pr create` with a short
  summary that points to the new `PROMPT.md` iteration. Ask before each step.

## 6. Summarise

In a few lines, say:

- what changed in each app;
- where the new prompt iteration is;
- what was checked, and what wasn't;
- whether it was pushed, opened as a pull request, or left local;
- one idea for what to try next.
