# Prompt

Give these to a coding agent in a clone of a repository of Holm apps, on a
machine that has the `holm` CLI and a node to deploy to. Its only source of
Holm knowledge is the public reference at <https://holmhq.com/llm.txt>. Send
them in order, one message each.

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

## 2. Make it an app store

```text
Make the catalog look and work like Apple's App Store.

- A front page with a featured app and a list of every app: icon, name,
  subtitle and a Get button.
- A page for each app at /apps/<app>: icon, subtitle, version, size,
  category, swipeable screenshots, description, what's new, the prompt that
  built it, and an information section.
- Get opens a sheet with the install commands written for my node.
- Each app keeps its store listing in a listing/ folder (listing.json and
  screenshots) that isn't deployed. Its icon is holm.symbol.svg: one black
  path, no strokes, in a 0 0 24 24 viewBox, fitted tight and centred; the
  store paints it white on the app's theme colour. Fold both into
  index.json.
- Don't show the h1 fingerprint to people; nodes use it, readers don't need
  it.
- Take real screenshots of each app with sample data.
```

## 3. Accounts, reviews and an admin

```text
Add accounts, reviews and an admin to the store.

- An avatar circle at the top right signs in with Holm's sign-in page. Its
  menu shows Admin to the node's owner and admins (and the app's admins).
- Signed-in people can rate and review an app. Reviews go public only once
  an admin approves them.
- /admin: show or hide apps; count page views, Get taps and copied commands
  per app, lightly and without tracking who; approve reviews; and pick the
  store's tint colour.
- A footer like pastebin's, and make sure it fits iPhones without sideways
  scrolling.
```

## 4. Brand Holm's sign-in page

```text
Holm's sign-in page shows Holm's logo and blue instead of the store's. Give
the store an icon file, and set the node's per-app brand name, icon and
accent for it (see llm.txt §6.3 settings).
```

## The original requests

The app in this folder came from these messages, typed as-is to a coding
agent.

**Iteration 1**

> Shall we create a unofficial.zyt.app?
> - so that we can test out strategies by which these apps can be installed, the UX
> - the experience and the like
> - we will define a way by which a holm's operator can add a repo as a trusted repository so that all its apps can be installed effortlessly
> - and also a JSON at the root with all details of the apps?
> - so that holm cli can easily list the apps

Asked where the page should get its list, they answered:

> Take a look at how holm has planned the app store; let this one match it so that when the official ones lands, we would have tested these norms

**Iteration 2**

> I like the design; its nice
> - but this isnt what i am looking for
> - i want something that resembles Apple AppStore
> - so that each app gets its own page
> - provide the hash in the page feels needless?
> - shouldnt the app being installed from this repo be enough verification
> - if someone can change files in this repo, they can also change the hash

**Iteration 3**, then a message sent while the agent was working on it:

> some small nit picks, can we have a "/admin" to manage things like: say: enable / disable apps?
> - see some light analytics (we can possibly pull from the native analytics)
> - we need click/taps for each apps
> - if that analytics is pointless / needless overwork lets avoid it
> - we also would like to change the tint color of the site from green to something else? as an option in /admin
> - admin is only accessible for the node/app admin
> - we need a login system
> - do a avatar circle at the top right
> - the admin link will be in the popup for qualified ones
> - for others logging in, they can leave reviews; which will require approval to be public

> May be have a footer like in paste bin for the app store too
> - i just got feedback that the app store doesnt gracefully fit in iPhones, and causes horizontal scroll bars

**Iteration 4**, from a message whose last point went to the feedback app:

> Question:
> - the signin dialog is not showing the logo of the site but the logo of the node / holm
> - i believe there was a tinting too, that also seems to be not being applied

The tint asked for here is the sign-in page's accent, a node setting; the
store's own `/admin` tint can't change node settings.

Holm's native analytics only see requests that reach the server, and the
store changes pages in the browser, so the agent counted views, Gets and
copies itself instead.

The prompts above spell out the norms (per-app release tags, the `h1`
fingerprint, a root `index.json`, the `holm.symbol.svg` icon form), so they
need nothing beyond the public reference. The visual design, the install
sheet and the screenshots came from the agent.
