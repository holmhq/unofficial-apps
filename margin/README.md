# Margin

A blog for a team, on [Holm](https://holmhq.com). The people you invite write,
each at their own address (`/@maya/designing-the-empty-week`). Anyone can sign
in to read, clap and comment, on a passage or on the whole post. Pages are
rendered on the server through a theme you can swap, and Claude can write,
answer comments and redesign the site through the tools Margin gives it.

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of them. Try it at [blog.zyt.app](https://blog.zyt.app),
which runs the sample content: a made-up team called Lumen.

## Holm App Spec v1

Margin follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }` and the handlers of
the named operations in `api/contract.json`. Every deploy needs `--spec-v1`;
the node runs no build. Only `web/` is served as files: `api/` and `holm.json`
are not public URLs.

## What it does

- **Writers and readers.** Anyone who signs in can read, clap and comment.
  Only people an admin invites can write: an invite is a single-use link that
  lasts 14 days and can be tied to an email address, which Margin emails when
  the node can send mail. Accepting it, they pick a handle, and their blog
  lives at `/@handle`.
- **Personas.** Admins create shared identities such as `@team` and choose
  who may post and comment as each one.
- **The home page.** Either the theme's landing page (featured post, latest
  posts, writers, topics) or any one blog. When a blog is home, its posts
  live at `/<slug>`, everyone's posts are at `/latest`, and the old
  `/@handle/<slug>` addresses redirect. So does a post's earlier address when
  its slug changes.
- **Reading.** Every page is plain HTML from the server, readable without
  JavaScript, with a canonical address, social card, JSON-LD, RSS feeds (the
  site and each blog) and a sitemap. Links to other posts show a preview card
  on hover.
- **Comments.** Select any passage and comment on it: it stays highlighted
  for everyone, and the conversation opens beside it as chat bubbles (a sheet
  on phones). Or respond to the whole post at the end. Replies go one level
  deep. Each blog chooses to show every comment at once, to hold comments from
  people outside the team, or to hold all of them; the writer approves or
  rejects them in Studio or in place. New comments appear live.
- **Claps.** Up to 50 per person per post; press and hold to keep clapping.
- **The editor.** Title, subtitle, cover and a block editor: press `/` for
  headings, lists, to-dos, quotes, callouts, code, tables, dividers, photos,
  video and embeds. Select text for bold, italic, links and the rest. Blocks
  have a handle to move, duplicate, delete or turn them into another kind.
  Drop or paste photos (shrunk in the browser first) and short videos; paste
  a YouTube, Vimeo, Loom, CodePen, Figma or Spotify link to embed it, or
  another post's address to show it as a card; paste Markdown and it arrives
  formatted. Drafts save themselves; published posts change only when you
  press Update.
- **Studio** at `/studio`: posts (drafts and published, yours or everyone's),
  the comment inbox (waiting, unanswered, recent), blogs and personas, the
  team and its invites, site settings, themes, and how to connect Claude.
- **Sample content.** One button adds Lumen, a fictional team of personas
  with seven posts, abstract covers and a few comments; another removes it
  all.

### Writing with Claude

Connect Claude (Settings → Connectors → Add custom connector) or Claude Code
(`claude mcp add --transport http margin https://<your host>/_holm/mcp`) and
sign in. Claude gets these tools, each limited to what the person could do in
Studio:

| Tools | What for |
| --- | --- |
| `me_get`, `blogs_list`, `media_list` | Who you are, where you can post, your uploads |
| `posts_list`, `posts_get`, `posts_create`, `posts_update`, `posts_delete` | Write in Markdown, draft or publish, edit, take down |
| `comments_inbox`, `comments_list`, `comments_reply`, `comments_moderate` | Answer ordinary comments; their descriptions tell Claude to leave anything sensitive, critical, legal, personal or about money to the writer |
| `comments_create` | Comment, also as a persona; `sample: true` keeps example discussion visible to the team only, for screenshots |
| `personas_create`, `personas_update`, `site_update`, `invites_create` | Run the team and the site (admins) |
| `themes_list`, `themes_reference`, `themes_get`, `themes_validate`, `themes_save`, `themes_activate` | Study, change, check and switch themes (admins) |

Replies Claude posts are marked "Claude" in the inbox.

### Themes

A theme is `theme.json`, six Mustache templates (`layout`, `home`, `blog`,
`list`, `post`, `error`), partials and assets. Margin prepares the data;
templates only print it. Two ship with Margin:

- **Quiet**: Inter, frosted bars, a floating clap bar, and comment threads as
  chat bubbles in a side panel.
- **Editorial**: Newsreader for reading, a newspaper-style landing page, and
  the first note of each highlighted passage set in the margin beside it.

Admins download a theme as a .zip, change it, and upload it; preview any theme
at `/?theme=<id>` before switching. The validator refuses scripts, event
handlers, outside URLs and raw HTML other than Margin's hooks, and warns about
missing dark styles. [`api/reference.md`](api/reference.md) documents every
file, field and hook; Claude reads it through `themes_reference`, and
`node tools/theme-check.mjs <folder>` runs the same checks locally.

## How it's built

- **Pages.** `api/http.js` routes each request; `api/pages.js` collects the
  page's data and renders it with [mustache.js](https://github.com/janl/mustache.js)
  through `api/themes.js`. Holm adds icons, analytics and sign-in sync only
  to static files, so Margin fetches `web/shell.html` with
  `env.holm.web.fetch` and copies those tags into each page, with a fresh CSP
  nonce for its scripts.
- **Markdown.** `api/markdown.js` renders posts with
  [marked](https://github.com/markedjs/marked) when they're saved, shows raw
  HTML as text, checks every link, and adds Margin's blocks. The HTML is kept
  beside the Markdown, so reading a post renders nothing.
- **Storage.** Shared `env.holm.app.ds` collections: `people`, `blogs`,
  `posts` (small, for lists), `bodies` (Markdown and HTML), `slugs` (every
  address a post has had), `comments`, `claps`, `invites`, `media` and
  `themes`. Photos, videos and saved themes are in `env.holm.app.s3`; site
  settings in `env.holm.app.kv`. Unique handles and slugs are claimed by
  insert-and-reread; counters use `$inc`; edits use compare-and-set.
- **Sign-in.** `env.holm.auth` for who is signing in; Margin keeps its own
  roles (admin, writer, reader), since Holm's `auth` cannot grant roles. The
  app's Holm admins are Margin admins.
- **Tools for Claude.** `api/contract.json` declares member operations, which
  Holm serves as MCP tools at `/_holm/mcp` behind its own sign-in and consent.
  `api/main.js` loads `http.js` and `ops.js` with `import()` and exports thin
  wrappers, because Holm's contract scan stops at a budget on regex-heavy
  modules (`CONTRACT_RESOURCE_LIMIT`).
- **Realtime.** A new comment broadcasts on `post:<id>`; readers refresh.
- **Reader script.** `web/margin/reader.js` adds the account menu, claps,
  highlights (re-anchored from the quote and the words around it), the
  selection bar, the comment panel or sheet, responses and link previews.
  `web/margin/ui.css` styles them from `--m-*` variables each theme sets.
- **Studio and the editor.** Plain modules in `web/studio/`. The editor uses
  [Tiptap](https://tiptap.dev) 3 with its Markdown extension, built into one
  file, `web/vendor/editor/tiptap.js`, from `tools/editor/` (`npm install &&
  npm run build`), plus Margin's own figure, embed and callout blocks that
  read and write the same Markdown the server renders.

```text
holm.json                 identity, web settings, publish excludes
holm.symbol.svg           the app icon: lines of text with a note beside them
api/main.js               entry: fetch and the operation handlers
api/contract.json         the operations (MCP tools)
api/http.js, ops.js       the JSON API, and the operations' bodies
api/pages.js              reading pages, feeds, sitemap, link previews
api/themes.js             theme loading, rendering, validation and storage
api/themes/quiet, editorial   built-in templates (their CSS and fonts: web/themes/)
api/markdown.js           Markdown to safe HTML
api/posts.js, comments.js, claps.js, blogs.js, people.js, invites.js, media.js, settings.js
api/samples.js, samples/  the sample team and its posts
api/reference.md          the theme reference
api/vendor/               marked and mustache.js, with their licences
web/shell.html            where Holm's head tags come from
web/studio.html, studio/  Studio and the editor
web/margin/               the reader script and its styles
web/themes/               the built-in themes' CSS and fonts
web/samples/              sample covers and avatars (abstract, generated)
web/vendor/editor/        the Tiptap bundle and its licences
tools/editor/             how the bundle is built (not deployed)
tools/theme-check.mjs     checks a theme folder locally (not deployed)
tools/sample-images.py    draws the sample images (not deployed)
listing/                  store listing and screenshots (not deployed)
```

## Deploy your own

```sh
holm app validate margin --spec-v1
holm @<peer> app deploy margin --spec-v1 --host blog.example.com
```

Open `https://blog.example.com/studio` as one of the node's admins, pick
your handle, and either write or load the sample content (Studio → Site).
To set up a site without signing in, give the app a setup key, use it, and
remove it:

```sh
holm @<peer> secret runtime set SETUP_KEY "$(openssl rand -hex 24)" --app <app-id>
curl -X POST https://blog.example.com/api/setup -H "Authorization: Bearer <key>" \
  -H 'Content-Type: application/json' --data '{"samples":true,"site":{"home":"landing"}}'
holm @<peer> secret runtime remove SETUP_KEY --app <app-id>
```

Then:

- **Sign-in page branding.** Holm's hosted sign-in has its own presentation
  settings. Inspect the schema, then set the app's name, icon and accent on
  your peer:

  ```sh
  holm @<peer> settings list settings.apps.<app-id>
  holm @<peer> settings set settings.apps.<app-id>.brand.name Margin
  holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
  holm @<peer> settings set settings.apps.<app-id>.theme.accent '#1a7f64'
  ```
- **Invite emails** need the node's email sending (section 12 of the guide).
  Without it, Margin shows the link to send yourself.
- **Uploads** follow the node's request body limit (1 MiB by default):
  raise `settings.node.policy.runtime.request_body_max_bytes` for photos and
  video. Margin takes photos up to 12 MB and video up to 20 MB.

## Known limits

- **Claude for writers who aren't node admins.** Holm offers member tools
  only to people with read access to the app's Space, which today means the
  node's admins. Invited writers can use Studio but can't connect Claude yet.
- **A redeploy ends Claude's sign-in**; connect again afterwards.
- No scheduled publishing (Holm v1 has no schedules), no email notifications
  for new comments, no revision history, no search page, one theme for the
  whole site.
- Highlights find their passage again by its words; if the writer later
  rewrites that passage, the comment stays among the responses without a
  highlight.
- Sample comments and claps on the Lumen posts are made up, as the site says.

## Licences

- [marked](https://github.com/markedjs/marked) 18.1.2 and
  [mustache.js](https://github.com/janl/mustache.js) 4.2.0: MIT, in
  `api/vendor/*/LICENSE`. marked's source-map comment is removed.
- [Tiptap](https://tiptap.dev) 3.32 and the
  [ProseMirror](https://prosemirror.net), marked, linkifyjs and Floating UI
  packages it bundles: MIT, all listed in `web/vendor/editor/LICENSE`.
- [Inter](https://rsms.me/inter/) and
  [Newsreader](https://github.com/productiontype/Newsreader): SIL Open Font
  License 1.1, beside the fonts in `web/themes/`.
- Icons are drawn for Margin, or adapted from [Lucide](https://lucide.dev)
  (ISC, `web/vendor/lucide/LICENSE`) and [Phosphor](https://phosphoricons.com)'s
  clapping hands (MIT, `web/vendor/phosphor/LICENSE`).
