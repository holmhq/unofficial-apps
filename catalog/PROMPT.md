# Prompt

Give this to a coding agent in a clone of a repository of Holm apps, on a
machine that has the `holm` CLI and a node to deploy to. Its only source of
Holm knowledge is the public reference at <https://holmhq.com/llm.txt>.

## 1. Build it

```text
Make this repository installable app by app, and build a catalog for it as a
Holm app. Use https://holmhq.com/llm.txt as your only Holm reference.

- Each top-level folder with a manifest.json is an app. Give each a version.
- Write scripts/index.mjs (Node, no dependencies). It writes index.json at
  the root: one entry per app with its name, path, version, a release tag
  named <app>/v<version>, and h1, a fingerprint of the files Holm would
  deploy, computed like Go's dirhash.Hash1 (as in go.sum). With --check it
  fails if index.json is out of date or an app changed after its version was
  tagged; with --tag it tags new versions.
- Run the check in CI, and tag new versions on main.
- In catalog/, build a page that reads index.json from GitHub on the server
  and shows each app with every way to install it on my node: clone and
  deploy, `holm app install` (not in Holm yet), and a prompt for a coding
  agent. Trusting the repository is one command, `holm app repo add`. Let me
  enter my peer and domain once, so every command fits my node.
- Deploy it to unofficial.<my-domain>.
```

## The original request

The app in this folder came from this message, typed as-is to a coding agent:

> Shall we create a unofficial.zyt.app?
> - so that we can test out strategies by which these apps can be installed, the UX
> - the experience and the like
> - we will define a way by which a holm's operator can add a repo as a trusted repository so that all its apps can be installed effortlessly
> - and also a JSON at the root with all details of the apps?
> - so that holm cli can easily list the apps

Asked where the page should get its list, they answered:

> Take a look at how holm has planned the app store; let this one match it so that when the official ones lands, we would have tested these norms

The prompt above spells out those norms (per-app release tags, the `h1`
fingerprint and a root `index.json`), so it needs nothing beyond the public
reference. The visual design, the seal drawn from each fingerprint, and the
three install tabs came from the agent.
