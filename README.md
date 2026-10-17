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
| [`pastebin`](pastebin/) | [pastebin.zyt.app](https://pastebin.zyt.app) | Expiring, one-time and revocable links; media; API keys and a CLI |

## Layout of an app

```text
<app>/
  PROMPT.md       the request that builds it (uses only holmhq.com)
  README.md       what it does, how it's built, how to deploy your own
  manifest.json   Holm app manifest
  index.html …    static files, served as-is
  api/            server code (optional)
```

Deploy any app with the `holm` CLI:

```sh
holm app deploy <app> --host <app>.example.com --spa --no-build
```

These apps are unofficial. They are examples, not supported products.

## License

MIT (see `LICENSE`). Vendored third-party files keep their own licenses, noted
in each app's README.
