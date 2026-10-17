# Unofficial Holm apps

Small, real apps built on [Holm](https://holmhq.com) and published so you can
see exactly how they're made. Each folder is a complete Holm app with its
source, its README, and a `PROMPT.md`: the short request a coding agent can
build the app from, using only the public reference at
<https://holmhq.com/llm.txt>.

The prompts are the point. They show how little you need to say to get a
finished, deployed app.

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
