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
- An App Store-like front page: a slideshow of the featured apps' cards
  (no controls; it holds under the mouse, and a mouse drags it),
  then all apps with search (as you type, kept in ?q=) and a list/grid
  switch below it; the grid is ruled like the facts strip (no boxes, lines
  meeting), each near-square cell the icon with its name centred under it,
  no Get and no hover zoom. Each app's own
  /apps/<app> page: icon/colour, version, size, category, license, swipeable
  screenshots, description, whatsNew with a folded version history (the
  index's history: each earlier tag's whatsNew and date), the original
  prompt folded until opened, and source information.
  Read the public repository index with synchronous env.holm.net.fetch,
  not global fetch; cache it in KV and keep the last good index on failure.
- Make it fast: the handler serves every page with the index and the viewer
  embedded, so the first paint waits on no API call (Holm serves a matching
  static file first, so don't name the shell index.html), and preload every
  module. Give each
  /apps/<app> page that app's title, description and listing/cover.png as
  its link preview (a 1200x630 card the repo draws with a script).
- Get opens a sheet remembering my peer/domain, with tabs for
  holm @<peer> app install github.com/<org>/<repo>/<app>@v<version> --host
  <host>, a clone-a-tag holm app deploy <app> --spec-v1, and an agent prompt
  following the app README.
- A /start guide, linked from a header button that stands out and the sheet, for
  someone with no node who will hand the work to a coding agent, never a
  terminal: what Holm is, why a node puts every app here one request away,
  then pick an app and where it runs (this computer, a server, an existing
  node) for a prompt to paste, what the agent asks (the licence is always
  the person's to accept), and the commands folded away. Then building from
  a prompt, what Holm gives an app, links to holmhq.com. Keep it airy.
  Beside its headline, vendor an MIT isometric line-figure kernel and draw
  an interactive figure on it: the apps ride a belt as crates from a store,
  through a gate (the fingerprint check), into a node drum; pointing slows
  the belt and names the crate's app.
- web/llms.txt for that agent: ground rules, the index, and setup, install,
  sign-in and server steps citing sections 4, 5, 8, 9 and 13 of the guide.
  The sheet's agent prompt comes first.
- Sign in through Holm. Signed-in people may rate/review once per app;
  edits wait for approval too. /admin hides apps, moderates reviews, shows
  rough daily views/Get/copy counts in KV and lets me change the tint.
  Authorize each route with documented isAppOwner()/isAppAdmin() checks.
  The guide does not document isNodeOwner()/isNodeAdmin(): do not assume
  those methods or promise node-role access for a fresh build.
- The guide does not document binary net.fetch responses: do not invent
  responseType: 'file'. Keep screenshots as public static files in web/
  until a documented, tested proxy/cache path is available; disclose that
  gap. Make light/dark mobile/desktop layouts, no sideways scrolling, an
  avatar menu with Analytics from __HOLM_SURFACES__, and a small Holm/source
  footer that stays at the bottom over the scrolling page, frosted.

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

**Iteration 6**, the first message and two sent while the agent worked on it:

> I really like the Overlay app's cover image!
> - i wonder whether all apps have such cover images?
> - if so, why not we set it as social preview for each app's page?
> - i trust its possible?

> Lets add feedback app to unofficial app store?

> Also, is the content caching done well, it feels like the pages take a bit to load, and not very snappy

The "cover image" is the store's featured card. No app had one as an image,
so the agent drew each app's card as `listing/cover.png` with a new script,
then made pages arrive with their data and images cacheable by content. The
feedback app was already listed, so the store's footer gained Send feedback
instead.

**Iteration 7**, the first message and one sent while the agent worked on it:

> Can we have a nice looking guide for how to install / setup holm?
> - and link it back to the site?
> - explain why having a node will enable them to install any of these apps, plus build any on the fly
> - with all bells & whistles that holm provides
> - if else someone landing to this page will be confused on what to do

> Also, can the page be built such that the bottom footer is sticky? and has a blurry / translucent background below which the content will scroll?
> - also, can you add analytics link to avatar popup?

`holm app install` had shipped by then, so the sheet's coming-soon tab
became its first, working way.

**Iteration 8**:

> I think we should design the guide such that, we assume no human will run it but an agent will only do it

**Iteration 9**, about a "New to Holm?" card the front page had then:

> That header is a bit weird in home page; about get started
> - i think we can simply have the top navbar get started button, perhaps in a bit of fancy design so people may notice?

**Iteration 10**, then two short messages sent while the agent was working:

> I love the new button!
> - and i love how the layout doesnt shift around pages!
> - can we make the getting started page less dense
> - now it feels a bit too dense
> - perhaps use https://hairline.lucasmarkes.com/ skill to build a nice interactive illustration
> - i like your agent chat example but the last agent's reply has all the app icons stuffed in

> can you show the options once again?

> Is the hariline skill something to install? or is it just docs/

The agent offered three figures (cartridges in a node, a hub, a belt); the
owner picked the belt.

**Iteration 11**, sent while the guide was being finished:

> May be we need a search, grid / list view for the apps; i know its early but as more comes in, this may help?

**Iteration 12**, then a message sent while the agent was working on it:

> Search and grid/list should below the cover!
> - and the grid icons look terrible; may be we cannot have the descriptions in grid
> - it should be:
> icon
> <category> <install-icon>
>
> making it closer to a square aspect ratio

> Can we have a carousel for a few picked apps in cover?
> - so that the covers of the selected n apps are shown?
> - say: pastebin/feedback & overlap

feedback was featured alongside pastebin and overlap; the carousel shows
them in the index's order.

**Iteration 13**:

> No, the grid is terrible.
> - perhaps it should be just:
> - icon
> - <name> <install-icon>
> - the rounded border is pathetic, what about just square grid similar in style to meta info display table in detail page

**Iteration 14**, sent while the agent was working on the grid:

> The carousel's control is hideous, avoid it
> - it should automatically slide and show a slide show unless you place a mouse over it
> - a mouse can drag the slides
> - i also noticed a small visual issue
> - the mobile screen shots in covers have a translucent background with sharp edges

The screenshots rounded their own corners and cast a shadow inside a frame
that clipped square, so the shadow filled the corners; the frame now rounds,
clips and shadows them.

**Iteration 15**:

> No the icons are getting enlarged on hover, thats so lame!
> - shall we avoid install/get from listing screen?
> - so that the names can be shown centerd down the icons?
> - why is the vertical separators not touching the horizontal separators?

Get stayed on the list view's rows and on the cover.

**Iteration 16**:

> I think that same touching of separators should be there in detail page too?

**Iteration 17**:

> Shouldnt the changelog be shown as show more or similar after Whats new?
> - should the prompt be hidden like an according, can be clicked to expand?

The history comes from the repository: scripts/index.mjs reads each earlier
release tag's listing and adds its notes to index.json.

The build request spells out the repository conventions without claiming
they are a shipped Holm store protocol. It uses the public v1 guide for
runtime and deploy behavior and states the node-role and binary-fetch gaps.
The quoted history explains the requested experience; the detailed design,
install sheet and screenshots were the agent's work.
