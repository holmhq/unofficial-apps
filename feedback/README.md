# feedback

A feedback button for any website, as a [Holm](https://holmhq.com) app. One
script tag adds the button; visitors send a bug, an idea or a question from
the page they're on, and it lands in your inbox. Turn on a public board when
you want to show what's planned.

Live at <https://feedback.zyt.app>. It was built from the request quoted in
[`PROMPT.md`](PROMPT.md).

## What it does

- **The button,** on your site: a pill in the corner (left or right) in your
  colour, with your label. It opens a small form: Bug, Idea or Question, a
  message, and an email if the sender wants a reply. On a phone the form is a
  bottom sheet. Escape or the close button dismisses it.
- **Projects:** sign in and make one per site or product. Each gets its
  snippet, its inbox and its board. Set up shows the snippet with your
  choices filled in and a live preview of the form.
- **Inbox:** every item as a ticket, numbered per project and tinted by its
  status like a carbon-copy form: white for new, canary for planned, pink for
  in progress, mint for done, grey for closed. Filter by status. Each item
  shows the message, the page and its title, the browser, the window size and
  the reply address; change its status or kind, keep private notes, delete
  it.
- **Public board** at `/b/<project>`, off by default: only the items you mark
  public, grouped as in progress, planned, under review and done, sorted by
  votes. Anyone can vote, once per browser. It never shows emails, pages or
  browsers. The board has the project's own feedback button.
- **API keys,** in the avatar menu: a key lets a script or a coding agent do
  anything the owner can, so setting up feedback on a new site is one
  request. Keys are shown once and stored as SHA-256 hashes; a key can't make
  more keys.
- **Look:** aubergine ink, a burnt-orange signal, light and dark following
  the system. The form on your site is always light and uses the system font,
  so it sits quietly on any design. Fonts are vendored.

## Add it to a site

```html
<script src="https://feedback.zyt.app/embed.js" data-project="abcd2345" async></script>
```

Optional attributes: `data-label`, `data-color`, `data-position="left"`, and
`data-button="none"` to hide the button and call `HolmFeedback.open()` from
your own link instead.

The button and panel live in a closed shadow root, so your CSS and the
widget's never touch. The form is an iframe on the feedback app's own origin,
so sending is a same-origin request and needs no CORS. The page address is
sent without its query or fragment, which can carry tokens.

**On a site that is itself a Holm app,** pages run only their own scripts, so
copy `embed.js` into that app, point at it, and say where feedback lives:

```html
<script src="/embed.js" data-project="abcd2345" data-origin="https://feedback.zyt.app" async></script>
```

The site's operator then lets its pages frame the feedback app:

```sh
holm policy set security.csp.frame_src "https://feedback.zyt.app" --app <site-app-id>
```

## How it is built

A Holm app is a folder: static files are served as-is, and `api/main.js`
handles `/api/*`. There is no build step.

```text
index.html          the app: landing, projects, inbox, items, set up, boards
embed.js            the script sites add: button and panel in a shadow root
widget.html         the form inside the panel
src/app.js          router, landing and projects
src/project.js      inbox, item page and set up
src/board.js        the public board
src/account.js      avatar, menu and Holm's sign-in page in an overlay
src/keys.js         the API keys page
src/widget.js       the form's logic
src/lib.js          DOM, API and formatting helpers, icons
src/styles.css      the app's design;  src/widget.css  the form's
assets/             icon, favicon and fonts (SIL OFL 1.1)
api/main.js         routes (below)
api/projects.js     projects and their settings
api/items.js        sending, triage, notes, the board and votes
api/keys.js         API keys and who an owner request is from
api/lib.js          responses, request checks, ids, who is asking
holm.symbol.svg     the app's icon
listing/            its store listing (not deployed)
```

The Holm primitives it uses, all described in <https://holmhq.com/llm.txt>:

- **`holm.auth`:** who is signed in. Owner routes also accept an app API key
  as a bearer token, and check that the project belongs to its owner,
  answering "not found" otherwise. Hashes use `crypto.subtle`.
- **Document store, `holm.app.ds`:** projects, items and notes. Votes are an
  `$inc` on the item.
- **Shared KV, `holm.app.kv`:** each project's item counter (for `#12`
  numbers), an hourly cap on incoming items per project, and which browser
  tokens have voted.
- **Framing:** Holm serves app pages with `frame-ancestors *`, so any site can
  show the form.

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/me` | anyone | who is signed in |
| `GET /api/embed/<project>` | anyone | the form's name, label and colour |
| `POST /api/embed/<project>/items` | anyone | send feedback |
| `GET /api/boards/<project>` | anyone | a public board |
| `POST /api/boards/<project>/items/<id>/vote` | anyone | vote, once per browser |
| `GET`, `POST /api/projects` | owner | your projects; make one |
| `GET`, `PATCH`, `DELETE /api/projects/<id>` | owner | one project |
| `GET /api/projects/<id>/items[?status=]` | owner | its inbox: `open`, `new`, `planned`, `progress`, `done`, `closed` |
| `PATCH`, `DELETE /api/items/<id>` | owner | status, kind, public; delete |
| `GET`, `POST /api/items/<id>/notes` | owner | private notes |
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
(`right` or `left`), `origins` (allowed sites; empty means any) and `public`
(the board). `PATCH` takes the same fields.

To read and sort what arrived:

```sh
curl "https://feedback.example.com/api/projects/<id>/items?status=new" -H "Authorization: Bearer $FEEDBACK_KEY"
curl -X PATCH https://feedback.example.com/api/items/<item-id> -H "Authorization: Bearer $FEEDBACK_KEY" \
  -H 'Content-Type: application/json' -d '{"status":"planned","public":true}'
```

Snippets and board links in replies use `ORIGIN` in `api/projects.js`, because
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
  misuse, not a determined sender. Spam is held back by a hidden trap field
  and a cap of 120 items per project per hour.
- No screenshots or attachments in reports.

## Licenses

The app is MIT-licensed (see the repository `LICENSE`). Bricolage Grotesque
and Fragment Mono are under the SIL OFL 1.1, in `assets/fonts/`.
