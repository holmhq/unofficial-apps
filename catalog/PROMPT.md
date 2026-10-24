# Prompt

Give the build request below to a coding agent with the `holm` CLI and a
node you control. Its only Holm reference is <https://holmhq.com/llms-full.txt>,
which now teaches v1. The request defines the repository's store conventions
itself; no private plan or existing catalog is needed.

## Build from scratch

```text
Build a catalog as a Holm App Spec v1 app using only
https://holmhq.com/llms-full.txt for Holm; read sections 9–12 first. Use catalog/
with holm.json, public web/ files, api/main.js exporting
default { async fetch(request, env) }, standard Request/Response, env.holm
storage/auth and env.holm.web.fetch(request) fallback. No build step or
third-party runtime CDN; vendor fonts and any libraries with licenses.

- Define these repository conventions, not a claimed Holm store protocol:
  each top-level app has holm.json version, holm.symbol.svg (one black path,
  no strokes, 0 0 24 24) and listing/listing.json with subtitle, category,
  description, whatsNew and sample screenshots. Write a dependency-free
  Node scripts/index.mjs emitting root index.json: name/path/version,
  <app>/v<version> tag, h1 SHA-256 file fingerprint, size/count, identity,
  symbol path, listing and PROMPT text. Hash sorted app-relative paths and
  file SHA-256 values, then hash those “<hex>  <path>\n” lines and prefix
  the base64 digest with h1:. Exclude listing/ and hidden files; count README
  and PROMPT too. --check detects stale indexes or changed release tags;
  --tag creates missing tags. CI checks then tags versions on main.
- An App Store-like front page with a featured app and rows, each app's own
  /apps/<app> page: icon/colour, version, size, category, license, swipeable
  screenshots, description, whatsNew, original prompt and source information.
  Read the public repository index with synchronous env.holm.net.fetch,
  not global fetch; cache it in KV and keep the last good index on failure.
- Make it fast: the handler serves every page with the index and the viewer
  embedded, so the first paint waits on no API call (Holm serves a matching
  static file first, so don't name the shell index.html), and preload every
  module. Give each
  /apps/<app> page that app's title, description and listing/cover.png as
  its link preview (a 1200x630 card the repo draws with a script).
- Get opens a sheet remembering my peer/domain, with working clone-a-tag
  instructions and holm @<peer> app deploy <app-dir> --spec-v1 --host <host>,
  plus an agent prompt following the app README. The guide does not define
  this repo's install-index schema, and app install is unavailable in its
  operator baseline: any future-install tab must be clearly non-working.
- Sign in through Holm. Signed-in people may rate/review once per app;
  edits wait for approval too. /admin hides apps, moderates reviews, shows
  rough daily views/Get/copy counts in KV and lets me change the tint.
  Authorize each route with documented isAppOwner()/isAppAdmin() checks.
  The guide does not document isNodeOwner()/isNodeAdmin(): do not assume
  those methods or promise node-role access for a fresh build.
- The guide does not document binary net.fetch responses: do not invent
  responseType: 'file'. Keep screenshots as public static files in web/
  until a documented, tested proxy/cache path is available; disclose that
  gap. Make light/dark mobile/desktop layouts, no sideways scrolling, and
  an avatar menu and small Holm/source footer.

Run holm app validate --spec-v1 catalog. With my approval, deploy with
holm @<peer> app deploy catalog --spec-v1 --host unofficial.<my-domain>.
Check the peer/unused host and explicitly allow the repository's egress host;
ask before replacing a host or moving an older-format app. Inspect target
settings/command help before sign-in branding. Validation is not execution:
test index fetch/failure, screenshots, ownership/admin denials, moderation,
copied deploy commands, mobile/desktop and light/dark. Report all gaps.
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

Asked about the list source, the reply referred to an unpublished plan.
That private reference is omitted; the build request above defines the
public repository conventions explicitly.

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


**Iteration 5** moved the build request to the renamed public guide; the
owner's message (`llms-full.txt` is the full guide's name):

> I think we should move to llms.txt & llm-full.txt; and update all apps which points to old links

**Iteration 6**, two messages sent while the agent worked on the first:

> I really like the Overlay app's cover image!
> - i wonder whether all apps have such cover images?
> - if so, why not we set it as social preview for each app's page?
> - i trust its possible?

> Also, is the content caching done well, it feels like the pages take a bit to load, and not very snappy

The "cover image" is the store's featured card. No app had one as an image,
so the agent drew each app's card as `listing/cover.png` with a new script,
then made pages arrive with their data and images cacheable by content.

The build request spells out the repository conventions without claiming
they are a shipped Holm store protocol. It uses the public v1 guide for
runtime and deploy behavior and states the node-role and binary-fetch gaps.
The quoted history explains the requested experience; the detailed design,
install sheet and screenshots were the agent's work.
