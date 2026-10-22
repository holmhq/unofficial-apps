# feedback

Hear what people think, online or in person, as a [Holm](https://holmhq.com)
app. One script tag puts a feedback button on a website. A QR code on a
restaurant's tables, a shop's counter or an event's badges opens a page of
its own, where people send praise, problems and ideas with a photo in a tap.
Everything lands in one inbox, and Stats count every scan. What changed in
each version is at [`/changelog`](https://feedback.zyt.app/changelog).

Live at <https://feedback.zyt.app>. It was built from the request quoted in
[`PROMPT.md`](PROMPT.md).

## Holm App Spec v1

feedback follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. Use `env.holm`
for storage and sign-in, return standard `Response` objects, and set
`web.spa: true` in `holm.json`. The node runs no build.

Use a current signed Holm release; the public app guide targets 0.243.2,
and multipart `request.formData()` needs node 0.242.0 or newer. Every deploy
needs `--spec-v1`. Only `web/` is served as files: `api/` and `holm.json` are
not public URLs, and README, PROMPT and listing files stay out of this app's
deploy. They are still public source in this repository.

## What it does

- **The button,** on your site: a pill with your text, or a round icon, in
  your colour, in either bottom corner, with the app's smiling-bubble mark.
  It eases in once the page has loaded, lifts under the pointer, and turns
  into a close cross while the panel is open. Or have no button and open the
  form from your own link.
- **The panel** springs up from the button and is as tall as what's in it.
  At its top are the project's cover (or a pattern in its colour), logo,
  title and words; it's light, dark, or follows each visitor's setting. The
  form: three kinds on a sliding switch, an optional star rating, a message
  that grows as it's written, up to four files from the message box's
  toolbar (pictures, videos, PDFs or text, 8 MB in all; big photos shrink in
  the browser first; paste or drop them too), the project's own questions,
  and an email or phone number if it asks. On a phone it's a sheet from the
  bottom over a dimmed page, with a **Photo** button that opens the camera;
  a photo or a rating alone is enough to send. The form starts loading as
  the pointer nears the button. Escape, the close button or the dimmed page
  dismisses it.
- **The rating** is [feed-stars](https://github.com/holmhq/cdn/tree/main/libs/ui/feed-stars),
  Holm's own star component: five stars whose faces go from glum to
  delighted. Ask for it, optionally or always, with your own words above it.
  If it can't load, plain stars stand in.
- **Projects:** sign in and make one per site, shop, restaurant or event.
  They sit in a panel that scrolls on its own, so the page never does and the
  footer stays at the bottom. Each row shows the project's icon or logo, the
  site it's on (its allowed sites, or where its button is live), its
  feedback page and what's waiting. Tabs: Inbox, Stats, Design, Form, Share
  and Set up; switching tabs changes only what's below them.
- **Design:** the project's name, colour, icon, logo and cover, the title and
  words at the top of the panel and the page, the button's style, text and
  corner, and the panel's theme. Beside them, a preview runs the real button
  on a stand-in page, at a computer's width or a phone's; it follows every
  change as you make it, and the button opens and closes it as on a site.
  Saved changes reach sites on their next page load, with the same snippet.
  The icon is one of 48 from [Lucide](https://lucide.dev), or the first
  letter; a new project gets one at random, and a logo shows instead
  wherever there is one.
- **Form:** what it's made for, which picks the kinds (a website or app
  gets Issue, Idea and Question; a place or event gets Praise, Problem and
  Idea), the rating, whether to ask for an email and a phone number (off,
  optional or required), files on or off, and up to eight questions of your
  own: a short answer, a dropdown, one choice, or checkboxes (no choices
  makes one box to tick). The same preview follows every change. Answers are
  kept with each question's wording at the time.
- **Set up:** the one-line snippet with its copy button, or, for a site
  that is itself a Holm app, the three steps it needs. **Where it's live**
  lists the sites whose pages loaded the button lately, and updates by
  itself; pages on localhost or a private network, like a developer's copy,
  get a line of their own, with no Allow, and never count as the project's
  site. **Allowed sites** limits who can send through the button; a site
  that's live but not allowed has an Allow button. Deleting the project is
  here too.
- **Inbox:** every item as a ticket, numbered per project and tinted by its
  status like a carbon-copy form: white for new, canary for planned, pink for
  in progress, mint for done, grey for closed. It's built for hundreds: sort
  by newest, oldest, votes, rating or last change; filter by status (each
  with its count), when it came (today, 7, 30 or 90 days), kind, rating,
  which site or the feedback page it came from, the answer to any choice
  question, photos, whether you can reply, whether it's on your page, and
  comments to approve; search every word of it, or `#12` (press `/` to
  search). It shows how many match and fifty at a time; Clear resets the
  filters. On a phone the filters fold behind one button. Each item shows
  the message, its rating and answers, the page and its title, the
  browser, the window size, the email and phone, and its files (pictures as
  thumbnails, videos in a player that says so when the browser can't play
  them). Its **thread**, for your team only, lists when it came in,
  every note and every change of status, kind or visibility, by whom. Only
  the owner can open the files.
- **The feedback page,** off by default, at `/<custom-address>` (or
  `/b/<project>`, which always works): made for someone who arrives from a
  link or a QR code, so it stands alone in the project's name and colour,
  under its cover and logo (a pattern in its colour and its initial until you
  upload them), with your title and description. The form comes first; below
  it are the items you mark public, by status and votes. Anyone can vote, once per browser, and open an item to comment.
  Visitors' comments wait until you approve them; your replies show at once
  under the project's name. It never shows emails, pages, browsers or files.
- **Share:** turn the page on and pick its address; copy the link or email
  it; and download its QR code as an SVG or a poster with your logo to
  print. Its look comes from Design. The QR code's link and the emailed one
  carry `?via=qr` and `?via=email`, so Stats can count them.
- **Stats,** per project and for your account (the avatar menu): page visits
  (and how many were QR scans or came from email), form opens, items sent,
  votes and comments per day over 7, 30 or 90 days,
  with what share of people who saw a form sent something, where feedback
  came from, what kind it was, and the average rating with how many gave
  each star. They count events, not people: no cookies, no visitor ids.
- **API keys,** in the avatar menu: a key lets a script or a coding agent do
  anything the owner can, so setting up feedback on a new site is one
  request. Keys are shown once and stored as SHA-256 hashes; a key can't make
  more keys.
- **Its own feedback:** the footer's Feedback link opens this app's own form,
  through the same `embed.js` every site uses, sent to its maintainers'
  project on feedback.zyt.app. It isn't on projects' feedback pages.
- **Look:** aubergine ink, a burnt-orange signal, light and dark following
  the system, or picked in the avatar menu. Dropdowns, switches and
  segmented choices are drawn to match, with keyboard support. The panel on
  your site uses the system font, so it sits quietly on any design. Fonts
  are vendored.

## Add it to a site

```html
<script src="https://feedback.zyt.app/embed.js" data-project="abcd2345" async></script>
```

The button reads the project's look from the app as the page loads, so
changes in Design need no new snippet. Attributes on the tag win over them:
`data-label`, `data-color`, `data-position` (`left` or `right`),
`data-button` (`pill`, `icon`, or `none` to open the form from your own
link with `HolmFeedback.open()`), and `data-theme` (`light`, `dark` or
`auto`). `HolmFeedback.close()` and `HolmFeedback.toggle()` work too. Once
the form is there, `HolmFeedback.ready` is true and a `holmfeedback:ready`
event fires on `window`, so a link of your own can wait to show. The form
then loads in the background while the page is idle, so it opens at once;
`data-preload="hover"` waits until the pointer reaches the button (or your
link calls `HolmFeedback.preload()`), and a reader with Save-Data on gets
that too. Loading isn't counted as an open.

The button and panel live in a closed shadow root, so your CSS and the
widget's never touch. The form is an iframe on the feedback app's own origin,
so sending is a same-origin request and needs no CORS; only the look is read
across origins. The page address is sent without its query or fragment,
which can carry tokens.

**On a site that is itself a Holm app,** use a local copy of `embed.js` so
loading the script does not depend on an external-script CSP allowance.
Point the tag at it, say where feedback lives, and include the look in the
tag when cross-origin settings fetches are blocked (Set up's "A Holm app"
provides that snippet):

```html
<script src="/embed.js" data-project="abcd2345" data-origin="https://feedback.zyt.app" data-color="#1d4ed8" async></script>
```

The site's operator then lets its pages frame the feedback app:

```sh
holm @<peer> policy set security.csp.frame_src "https://feedback.zyt.app" --app <site-app-id>
```

## How it is built

A Holm app is a folder. `web/` is served as-is. This app's
`api/main.js` routes `/api/*`, reads JSON with `request.text()` and uploads
with `request.formData()`, and converts its answers to standard `Response`
objects. Other paths go to `env.holm.web.fetch(request)` for static files
and SPA fallback. There is no build step.

Named typed operations are also exported in `contract.operations`, with
native `(input, env, ctx)` handlers and shared request-local storage factories.
Call them with JSON at `POST /api/<operation key>`: `projects.get` reads only
public widget configuration; `feedback.submit` sends JSON without attachments;
`items.list`, `items.done` and `stats.get` require a signed-in project
owner. Inbox items and stats are sensitive and never public. Existing routes,
bearer API keys, the dashboard, widget, QR codes and multipart uploads remain
available; app-owned bearer keys do not authorize member operations.

`feedback.submit` requires an `Idempotency-Key` header; `items.done`
accepts one optionally. Matching completed calls replay for 24 hours under
current authority. A missing required key returns 428; changed input or an
in-progress/unknown outcome returns 409. Keys do not provide an exactly-once
transaction, and can execute again after expiry. Read operations have no
storage effects: typed stats skip the old-counter cleanup that raw routes
still perform. See the public guide's “Named JSON operations and keyed
retries” section and use a node supporting that runtime. The web renderer is
off; this does not change static web serving.

AI assistants can use the public operations as tools: connect ChatGPT or
Claude to `https://<your feedback domain>/_holm/mcp` (Holm serves it; the app
writes no MCP route). `projects.get` and `feedback.submit` appear as
`projects_get` and `feedback_submit`; owner-only operations stay private until
Holm supports signed-in tools. Set `"connectedAgents": false` in `holm.json`
to turn this off.

```text
holm.json           name, version, colour, SPA routing, store metadata
web/                public files, served as-is:
  index.html        the app: landing, projects, inbox, stats, feedback pages
  embed.js          the script sites add: button and panel in a shadow root
  widget.html       the form inside the panel
  preview.html      a stand-in site running embed.js, for the previews
  changelog.json    what changed in each version, for /changelog
  src/app.js        router, landing and projects
  src/project.js    inbox, item page, design, form, share and set up
  src/board.js      a project's feedback page
  src/compose.js    the form, shared by the panel and the feedback page
  src/compose.css   the form's and the dropdown's look, for both
  src/stats.js      the stats views and their chart
  src/changelog.js  the changelog page
  src/preview.js    starts embed.js on the stand-in site
  src/qr.js         QR codes and the poster
  src/icons.js      a project's mark: its logo, icon or initial
  src/account.js    avatar, menu, theme and Holm's sign-in page in an overlay
  src/keys.js       the API keys page
  src/widget.js     the panel's logic
  src/lib.js        DOM, API and formatting helpers, icons, dropdown,
                    segmented choice and code box
  src/styles.css    the app's design;  src/widget.css  the panel's
  assets/           icon, favicon, link preview and fonts (SIL OFL 1.1)
  vendor/qrcode/    qrcode-generator 2.0.4 (MIT)
  vendor/lucide/    48 Lucide icons (ISC; MIT for those from Feather)
api/main.js         v1 entry: hands /api requests to the routes
api/_holm.js        gives the routes `holm` and `respond` for each request
api/_legacy_main.js routes (below), written in Holm's original app format
api/projects.js     projects, their settings and custom addresses
api/items.js        sending, triage, notes, the page and votes
api/files.js        attachments: checks, storage, previews, serving
api/page.js         a page's logo and cover: resizing and serving
api/form.js         contact rules, rating, questions, checking answers
api/installs.js     where a project's button is live
api/comments.js     public comments and their approval
api/stats.js        daily counters and the stats replies
api/keys.js         API keys and who an owner request is from
api/lib.js          responses, request checks, ids, who is asking
holm.symbol.svg     the app's icon
listing/            its store listing (not deployed)
```

The existing entry delegates to `api/_legacy_main.js`; `api/_holm.js` binds
`env.holm` for those imported modules on each request. These are this app's
migration scaffolding, not the v1 authoring contract. A fresh build should
write routes directly in `fetch(request, env)`, not use global `holm`,
`request` or `respond`.

The v1 primitives described in <https://holmhq.com/llms-full.txt> are:

- **`env.holm.auth`:** who is signed in. Owner routes also accept an
  app-owned bearer API key, check the project's owner, and answer "not
  found" otherwise. Hashes use `crypto.subtle`.
- **Document store, `env.holm.app.ds`:** projects, items, notes and comments.
  Votes use `$inc`; comment and item counts change in a transaction. These
  storage calls are synchronous; never await inside a DS transaction.
- **Shared KV, `env.holm.app.kv`:** ticket numbers, spam caps, vote tokens,
  daily stats and sites where the button loaded. KV supports a TTL and
  prefix listing; these counters are application data, not node analytics.
- **Blob storage, `env.holm.app.s3`:** attachments served through
  owner-checked API routes with sandboxing headers. The entry turns
  `request.formData()` files into byte buffers for the inherited modules;
  their `request.files` is adapter data, not a standard v1 Request field.
  A fresh handler uses `File.arrayBuffer()` and `s3.put(path, bytes, mime)`.
  **`env.holm.image.thumbnail`** makes previews and **`image.resize`** fits
  project logos and covers.
- **Static headers and metadata:** the guide documents CSP and deliberate
  `web.headers` rules. `web/index.html` authors the app's title, description
  and social image; Holm fills only missing static head tags, not HTML
  returned by the handler. It does not create per-project previews here.

Embedding requires the feedback form's response to permit the site's frame
ancestor, and the site's CSP to permit the feedback origin in `frame-src`.
Do not assume every Holm page is frameable: inspect both headers and test the
iframe. The public guide does not guarantee a `frame-ancestors *` default.

The rating uses Holm's own feed-stars 0.0.3 from jsDelivr, pinned to commit
`9a7a089cadc57f338f393ec56e1460cbd725b0ce`, in its `v-0.0.3/` folder, with a
SHA-384 integrity hash in `web/src/compose.js`. Check the target's CSP; plain
stars are the fallback if it cannot load.

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/me` | anyone | who is signed in |
| `GET /api/embed/<project>[?from=]` | anyone | the button's and form's settings; `from` (the site's origin) notes where it's live |
| `POST /api/embed/<project>/open` | anyone | count an open |
| `POST /api/embed/<project>/items` | anyone | send feedback, JSON or multipart with `file0`… |
| `GET /api/boards/<page>[?visit=1&via=]` | anyone | a feedback page, by address or id; `via` is `qr` or `email` |
| `GET /api/pictures/<project>/logo`, `…/cover` | anyone | a page's logo and cover |
| `POST /api/boards/<page>/items` | anyone | send feedback from the page |
| `POST /api/boards/<page>/items/<id>/vote` | anyone | vote, once per browser |
| `GET`, `POST /api/boards/<page>/items/<id>/comments` | anyone | approved comments; add one |
| `GET`, `POST /api/projects` | owner | your projects, with the sites each is on; make one |
| `GET`, `PATCH`, `DELETE /api/projects/<id>` | owner | one project |
| `GET /api/projects/<id>/items[?status=]` | owner | its inbox: `open`, `new`, `planned`, `progress`, `done`, `closed` |
| `GET /api/projects/<id>/stats?days=` | owner | its stats over 7, 30 or 90 days |
| `GET /api/projects/<id>/installs` | owner | sites where its button loaded lately |
| `POST`, `DELETE /api/projects/<id>/logo`, `…/cover` | owner | upload one (multipart), or go back to the default |
| `GET /api/stats?days=` | owner | stats for all your projects |
| `PATCH`, `DELETE /api/items/<id>` | owner | status, kind, public; delete |
| `GET /api/items/<id>/files/<n>` | owner | a file; `?preview=1`, `?download=1` |
| `GET`, `POST /api/items/<id>/notes` | owner | private notes |
| `GET`, `POST /api/items/<id>/comments` | owner | all comments; reply publicly |
| `PATCH`, `DELETE /api/comments/<id>` | owner | approve (`{"approved":true}`); delete |
| `GET`, `POST /api/keys`, `DELETE /api/keys/<id>` | signed in | API keys |

"Owner" means signed in, or an API key sent as `Authorization: Bearer fb_…`.

## API

Agents can read the whole setup and owner API at `/llms.txt`
(<https://feedback.zyt.app/llms.txt>). Make a key under API keys in the avatar menu. Then, to set up a new site:

```sh
curl https://feedback.example.com/api/projects \
  -H "Authorization: Bearer $FEEDBACK_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"My blog","origins":["https://blog.example.com"],"color":"#1d4ed8"}'
```

The reply's `project.snippet` is the script tag to paste before `</body>`.
A project takes `name`, `icon` (one of the 48 in `api/projects.js`, or
`letter`), `label` (the button's text), `color`, `position`
(`right` or `left`), `button` (`pill`, `icon` or `none`), `theme` (the
panel's: `light`, `dark` or `auto`), `origins` (allowed sites; empty means
any), `attachments` (whether visitors can add files), `for` (`site` or
`place`, which picks the kinds: `issue`, `idea` and `question`, or
`praise`, `problem` and `idea`), `contact` (`{"email": "optional", "phone":
"off"}`, each `off`, `optional` or `required`), `rating` (`{"ask": "off",
"label": ""}`, where `ask` is `off`, `optional` or `required`), `fields`
(up to eight questions, each
`{"type": "text" | "select" | "radio" | "checkbox", "label", "required",
"options"}`), `public` (the feedback page), `slug` (its custom address, 3 to
40 lowercase letters, digits and hyphens), and the page's `title` and
`intro`. `PATCH` takes the same fields. A sender's answers go in `answers`,
keyed by question id (with files, as a JSON string field), and a rating in
`rating`, 1 to 5. Before 0.6 the kind `issue` was `bug`; old items read as
`issue`, and `bug` is still accepted.

To read and sort what arrived:

```sh
curl "https://feedback.example.com/api/projects/<id>/items?status=new" -H "Authorization: Bearer $FEEDBACK_KEY"
curl -X PATCH https://feedback.example.com/api/items/<item-id> -H "Authorization: Bearer $FEEDBACK_KEY" \
  -H 'Content-Type: application/json' -d '{"status":"planned","public":true}'
```

Snippets and page links in replies use the app's `ORIGIN` constant in
`api/projects.js`. Set it to your public origin; this is an app choice, not
a v1 host limitation. A fresh handler can use the standard `request.url`.

## Deploy your own

Run from the repository root, with a peer and an unused host you have chosen:

```sh
holm app validate --spec-v1 feedback
holm @<peer> app deploy feedback --spec-v1 --host feedback.example.com
```

Validation is local and does not run or upload the app. Check the peer's
health and host availability first. Repeat the deploy with `--force` only
for your own approved update. Add `--move` only when you explicitly approve
a one-way move of an older-format app; it preserves its id, domains, members
and data.

Set `ORIGIN` in `feedback/api/projects.js` first. The footer's Feedback link
points to the maintainers' project; on your copy it stays hidden, or use a
project of your own in `feedback/web/index.html`.

Inspect the target's `settings schema --json` before setting sign-in branding:
the guide's operator chapters retain an older baseline. Use the app id
printed by deploy and your explicit peer:

```sh
holm @<peer> settings set settings.apps.<app-id>.brand.name feedback
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-512.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#c2410c'
```

Anyone who can sign in can make projects. To keep it to yourself, close
public signup once your account exists:

```sh
holm @<peer> policy set auth.public_signup false --app <app-id>
```

Before deploying publicly, test on a disposable node: JSON and multipart
submissions, owner-only files, notes and comment approval, votes and stats,
plus the widget in a real cross-site iframe. Check mobile and desktop, light
and dark, and browser CSP errors. Local validation is not runtime proof.

## Known limits

- The inbox reads a project's newest 1,000 items and filters them in the
  browser; older ones are still kept, and still counted in Stats.
- No notifications yet: check the inbox. Email needs a configured sender.
- One owner per project; there are no teammates yet.
- Votes are counted once per browser, not per person; clearing storage votes
  again.
- "Allowed sites" checks the page address the form sends, so it stops casual
  misuse, not a determined sender. Spam is held back by a hidden trap field,
  caps of 120 items and 60 comments per project per hour, and 200 MB of files
  per project per day.
- Stats count events: two opens by one person count twice, and the owner's
  own visits count too. Counters are kept for about a year.
- Custom addresses are first come, first served across the whole app, and a
  few words the app uses itself (like `stats` and `projects`) are reserved.
- Files are owner-only and can't be shown on the public page.
- A project's id is public by design: it's in every snippet, the form's
  address and `/b/<id>`. It only lets people send feedback and read what the
  form shows (name, colours, logo, cover, questions); every owner route
  checks the owner, and ids are random enough not to guess. It can't be
  changed, so a project whose snippet attracts spam relies on the caps and
  Allowed sites.
- "Where it's live" trusts the origin the button's script reports, and a
  site that stops loading it drops off after 90 days (a local page, after a
  week; it keeps up to five of those).
- The rating needs jsDelivr to be reachable; without it, plain stars stand
  in.
- A shared feedback page previews as the app, not as its project: link
  previews read the static `index.html`, and the page is drawn in the
  browser.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `web/assets/fonts/`.
feed-stars 0.0.3, the star rating, is MIT-licensed and loaded from Holm's
own [`holmhq/cdn`](https://github.com/holmhq/cdn) through jsDelivr, pinned
and integrity-checked as described above. Its animation derives from the
upstream "Stars rating animation" on CodePen.
The project icons are from Lucide (lucide-static 1.52.0), ISC-licensed, with
those derived from Feather under the MIT licence; both are in
`web/vendor/lucide/LICENSE`. qrcode-generator 2.0.4 is MIT-licensed, in
`web/vendor/qrcode/` with its `LICENSE`. "QR Code" is a registered trademark
of DENSO WAVE INCORPORATED.

The icon, a smiling speech bubble, is by Side Project from
[Noun Project](https://thenounproject.com) and is used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). It was rescaled
into Holm's 24 × 24 symbol frame for `holm.symbol.svg`. The page header draws
it, and `holm app identity generate feedback` draws every icon from it: the
favicons, touch and install icons, `manifest.webmanifest` and a social card,
recorded in `holm.generated.json` (needs Holm 0.245.0 or newer). Run it again
after changing the symbol, `themeColor` or `title`. Holm links the generated
files in each page; the hand-made social preview, `web/assets/og.png`, stays
because `web/index.html` names it in its own `og:image` and `twitter:image`
tags, and tags a page writes itself always win.
