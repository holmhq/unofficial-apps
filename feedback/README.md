# feedback

Hear what people think, online or in person, as a [Holm](https://holmhq.com)
app. One script tag puts a feedback button on a website. A QR code on a
restaurant's tables, a shop's counter or an event's badges opens a page of
its own, where people send praise, problems and ideas with a photo in a tap.
Everything lands in one inbox, and Stats count every scan. What changed in
each version is at [`/changelog`](https://feedback.zyt.app/changelog).

Live at <https://feedback.zyt.app>. It was built from the request quoted in
[`PROMPT.md`](PROMPT.md).

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
  Tabs: Inbox, Stats, Design, Form, Share and Set up; switching tabs changes
  only what's below them.
- **Design:** the project's name, colour, logo and cover, the title and
  words at the top of the panel and the page, the button's style, text and
  corner, and the panel's theme. Beside them, a preview runs the real button
  on a stand-in page, at a computer's width or a phone's; it follows every
  change as you make it, and the button opens and closes it as on a site.
  Saved changes reach sites on their next page load, with the same snippet.
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
  itself. **Allowed sites** limits who can send through the button; a site
  that's live but not allowed has an Allow button. Deleting the project is
  here too.
- **Inbox:** every item as a ticket, numbered per project and tinted by its
  status like a carbon-copy form: white for new, canary for planned, pink for
  in progress, mint for done, grey for closed. Filter by status, kind, the
  answer to any choice question, its rating, whether it has photos, or
  search its words. Each item shows the message, its rating and answers, the
  page and its title, the
  browser, the window size, the email and phone, and its files (pictures as
  thumbnails). Its **thread**, for your team only, lists when it came in,
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
`auto`). `HolmFeedback.close()` and `HolmFeedback.toggle()` work too.

The button and panel live in a closed shadow root, so your CSS and the
widget's never touch. The form is an iframe on the feedback app's own origin,
so sending is a same-origin request and needs no CORS; only the look is read
across origins. The page address is sent without its query or fragment,
which can carry tokens.

**On a site that is itself a Holm app,** pages run only their own scripts and
may not read other origins, so copy `embed.js` into that app, point at it,
say where feedback lives, and write the look into the tag (Set up's "A Holm
app" does this for you):

```html
<script src="/embed.js" data-project="abcd2345" data-origin="https://feedback.zyt.app" data-color="#1d4ed8" async></script>
```

The site's operator then lets its pages frame the feedback app:

```sh
holm policy set security.csp.frame_src "https://feedback.zyt.app" --app <site-app-id>
```

## How it is built

A Holm app is a folder: static files are served as-is, and `api/main.js`
handles `/api/*`. There is no build step.

```text
index.html          the app: landing, projects, inbox, stats, feedback pages
embed.js            the script sites add: button and panel in a shadow root
widget.html         the form inside the panel
preview.html        a stand-in site running embed.js, for the previews
changelog.json      what changed in each version, for /changelog
src/app.js          router, landing and projects
src/project.js      inbox, item page, design, form, share and set up
src/board.js        a project's feedback page
src/compose.js      the form, shared by the panel and the feedback page
src/compose.css     the form's and the dropdown's look, for both
src/stats.js        the stats views and their chart
src/changelog.js    the changelog page
src/preview.js      starts embed.js on the stand-in site
src/qr.js           QR codes and the poster
src/account.js      avatar, menu, theme and Holm's sign-in page in an overlay
src/keys.js         the API keys page
src/widget.js       the panel's logic
src/lib.js          DOM, API and formatting helpers, icons, dropdown,
                    segmented choice and code box
src/styles.css      the app's design;  src/widget.css  the panel's
assets/             icon, favicon, link preview and fonts (SIL OFL 1.1)
vendor/qrcode/      qrcode-generator 2.0.4 (MIT)
api/main.js         routes (below)
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

The Holm primitives it uses, all described in <https://holmhq.com/llm.txt>:

- **`holm.auth`:** who is signed in. Owner routes also accept an app API key
  as a bearer token, and check that the project belongs to its owner,
  answering "not found" otherwise. Hashes use `crypto.subtle`.
- **Document store, `holm.app.ds`:** projects, items, notes and comments.
  Votes are an `$inc` on the item; a comment and its item's counts change in
  one `transaction`. Stats tally pages and kinds from `find`.
- **Shared KV, `holm.app.kv`:** each project's item counter (for `#12`
  numbers), hourly caps on items and comments per project, a daily cap on
  file bytes, which browser tokens have voted, the stats (one `increment`ed
  counter per project, day and event), and where each button is live (one
  key per site, with a 90-day TTL, listed by prefix).
- **Blob storage, `holm.app.s3`:** attachments, put straight from the
  multipart upload handles in `request.files`, served back only to the owner
  with a sandboxing CSP. **`holm.image.thumbnail`** makes the previews, and
  **`holm.image.resize`** fits a page's logo and cover as they're uploaded.
- **Framing:** Holm serves app pages with `frame-ancestors *`, so any site can
  show the form.
- **Content-Security-Policy:** Holm's baseline lets pages load scripts from
  jsDelivr, where Holm's own `holmhq/cdn` repository is served; the rating
  loads from there, pinned to one commit and checked by its SHA-384 hash.
- **Head metadata:** Holm fills in link-preview tags a page leaves out, with
  its own text and picture. `index.html` writes every one except `og:url`,
  so a shared link shows feedback's title, description and `assets/og.png`.

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
| `GET`, `POST /api/projects` | owner | your projects; make one |
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

Make a key under API keys in the avatar menu. Then, to set up a new site:

```sh
curl https://feedback.example.com/api/projects \
  -H "Authorization: Bearer $FEEDBACK_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"My blog","origins":["https://blog.example.com"],"color":"#1d4ed8"}'
```

The reply's `project.snippet` is the script tag to paste before `</body>`.
A project takes `name`, `label` (the button's text), `color`, `position`
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

Snippets and page links in replies use `ORIGIN` in `api/projects.js`, because
the runtime doesn't pass the request host to apps yet. Set it to your host.

## Deploy your own

```sh
holm app deploy feedback --host feedback.example.com --spa --no-build
```

Set `ORIGIN` in `api/projects.js` to your host first (see API). Holm's
sign-in page takes the app's name, icon and colour from node settings, so give
it feedback's own:

```sh
holm settings set settings.apps.<app-id>.brand.name feedback
holm settings set settings.apps.<app-id>.brand.icon_url /assets/icon.svg
holm settings set settings.apps.<app-id>.theme.accent '#c2410c'
```

Anyone who can sign in can make projects. To keep it to yourself, close
signup once your account exists:

```sh
holm policy set auth.public_signup false --app <app-id>
```

## Known limits

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
  site that stops loading it drops off after 90 days.
- The rating needs jsDelivr to be reachable; without it, plain stars stand
  in.
- A shared feedback page previews as the app, not as its project: link
  previews read the static `index.html`, and the page is drawn in the
  browser.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `assets/fonts/`.
feed-stars 0.0.3, the star rating, is MIT-licensed and loaded from Holm's
own [`holmhq/cdn`](https://github.com/holmhq/cdn) through jsDelivr; its
animation is adapted from Aaron Iker's "Stars rating animation" on CodePen.
qrcode-generator 2.0.4 by Kazuhiko Arase is MIT-licensed, in
`vendor/qrcode/` with its `LICENSE`. "QR Code" is a registered trademark of
DENSO WAVE INCORPORATED.

The icon, a smiling speech bubble, is by Side Project from
[Noun Project](https://thenounproject.com) and is used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). It was rescaled
into Holm's 24 × 24 symbol frame for `holm.symbol.svg`, and appears in
`assets/icon.svg`, `assets/favicon.svg` and the page header.
