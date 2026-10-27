# Margin

A writing platform for teams, on [Holm](https://holmhq.com). Anyone can sign
in, pick a name and start a workspace for their team at its own address
(`/lumen`), then invite the people who write. Each writer has a page there
(`/lumen/@maya`) and can keep personas: other names to write and comment
under, which readers can't link back to them. Readers comment on a passage or
on the whole post, and clap. Pages are rendered on the server through each
workspace's theme, any post can have a drawn cover that moves under the pointer,
and Claude can write and answer comments through the tools Margin gives it.

It was built from the requests quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of them. Try it at [margin.zyt.app](https://margin.zyt.app),
which shows two made-up teams as examples: Lumen and Copperline.

## Holm App Spec v1

Margin follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }` and the handlers of
the named operations in `api/contract.json`. Every deploy needs `--spec-v1`;
the node runs no build. Only `web/` is served as files: `api/` and `holm.json`
are not public URLs.

## What it does

- **Margin's front page.** A short landing page with a few workspaces as
  examples, each with its latest drawn cover, and the way in. Margin's admins
  can make the front page one workspace's home, or one writer's page, instead.
- **Starting out.** Sign in, pick your name and handle, name your workspace,
  copy an invite link for your team, and see how to connect Claude: four
  short steps at `/new`.
- **Workspaces.** Each has its own address, logo, theme, home page and rules.
  Its home is the latest posts, a curated one (posts its owners pin, in their
  order, then the rest), or one writer's page. Owners and admins invite people
  (a single-use link, optionally tied to an email, which Margin sends when the
  node can send mail) and give them roles: owner, admin or writer. One person
  can be in many workspaces.
- **Names and personas.** Everyone has a main name and can add personas. They
  write and comment as any of them; readers see only the name chosen. The
  owners of a workspace see which names each of its members uses there, so
  they can run their team. A workspace can also post as itself, at
  `/lumen/<post>`.
- **Addresses.** `/<workspace>` home, `/<workspace>/@<handle>/<post>` posts,
  `/<workspace>/latest`, `/<workspace>/tag/<topic>`, `/@<handle>` a writer
  across Margin, and `/@<handle>/<post>` as a short link that redirects. A
  post's earlier address keeps redirecting when its slug changes.
- **Drawn covers.** A post can have a photo, an isometric line drawing in its
  workspace's style, or no cover at all; the editor adds none until the writer
  picks one. Drawings come on paper, in a flat colour (six tones), or in bold
  blocks. Writers pick the subject: a week, energy, people, sync, layers, an
  inbox, numbers or quiet. Each drawing reacts to the pointer (the day you
  point at lifts out of the calendar; the sun crosses the sky and the battery
  charges). Studio saves a PNG of it when a post is published, for link
  previews and feeds.
- **Reading.** Every page is plain HTML from the server, readable without
  JavaScript, with a canonical address, social card, JSON-LD, RSS (each
  workspace and writer) and a sitemap. Links to other posts show a preview
  card on hover. `/llms.txt` explains Margin to agents.
- **Comments.** Select any passage and comment on it: it stays highlighted for
  everyone, and the conversation opens beside it as chat bubbles (a sheet on
  phones). Or respond to the whole post at the end. Anyone signed in comments
  on any workspace's posts, under the name they pick. Each workspace shows
  every comment at once, holds comments from names outside its team, or holds
  them all; the writer or an owner approves them in Studio or in place.
  Replies go one level deep. New comments appear live.
- **Claps.** Up to 50 per person per post; press and hold to keep clapping.
- **The editor.** Title, subtitle, cover and a block editor: press `/` for
  headings, lists, to-dos, quotes, callouts, code, tables, dividers, photos,
  video and embeds. Drop or paste photos (shrunk in the browser first) and
  short videos; paste a YouTube, Vimeo, Loom, CodePen, Figma or Spotify link
  to embed it, or another post's address to show it as a card. Drafts save
  themselves; published posts change only when you press Update.
- **Photos, drawings and video from anywhere.** Claude can add an SVG drawing
  or a small photo itself, or hand out an upload link: open it on a phone
  or computer to add up to ten photos, drawings or videos in the next hour,
  or send files to it with curl. Margin keeps photos at 2048 px at most and
  makes smaller copies when a page first asks for one (640 to 1600 px, and
  a 1200 × 630 crop for link previews), so every page picks the size it
  shows at.
- **Studio** at `/studio`, with a workspace switcher: posts, the comment
  inbox, the team and invites, the workspace's settings (home page, comments,
  cover style, theme, menu), your names and personas, and how to connect
  Claude.
- **Margin's own settings** (the node's admins, in Studio → Margin): who can
  join (anyone; anyone to read and comment, with new workspaces by invitation;
  or invited people only), the front page, which workspaces it shows, the one
  address everything should use, suspending a workspace, the theme library,
  and the sample content.

### Writing with Claude

Connect Claude (Settings → Connectors → Add custom connector) or Claude Code
(`claude mcp add --transport http margin https://<your host>/_holm/mcp`) and
sign in. Claude gets these tools, each limited to what the person could do in
Studio, in the workspace it names:

| Tools | What for |
| --- | --- |
| `me_get`, `identities_list` | Who you are, your names, your workspaces |
| `workspaces_create`, `workspace_get`, `workspace_update`, `workspace_leave` | Start a workspace, see and change its settings, leave it |
| `team_list`, `team_update`, `invites_create`, `invites_revoke` | The team and its open invites; change roles or remove someone; invite and cancel invites |
| `posts_list`, `posts_get`, `posts_create`, `posts_update`, `posts_delete` | Write in Markdown, pick the drawn cover or a photo, draft or publish, edit, take down |
| `media_upload`, `media_link`, `media_list` | Add an SVG drawing or a small photo; get a one-hour link that takes photos and videos from a browser or curl; list your files with their Markdown and smaller sizes |
| `comments_inbox`, `comments_list`, `comments_reply`, `comments_moderate` | Answer ordinary comments; the descriptions tell Claude to leave anything sensitive, critical, legal, personal or about money to the writer |
| `comments_create` | Comment under any of your names; `sample: true` keeps example discussion visible to the team only, for screenshots |
| `personas_create`, `personas_update`, `personas_delete` | Your other names (`identities_list` lists them) |
| `themes_list`, `themes_reference`, `themes_get`, `themes_validate`, `themes_save`, `themes_activate` | Study, change and check themes; Margin's admins add them, a workspace switches |

Replies Claude posts are marked "Claude" in the inbox. The tool descriptions
tell Claude never to say which names belong to the same person.

### Themes

A theme is `theme.json`, six Mustache templates (`layout`, `home`, `blog`,
`list`, `post`, `error`), partials and assets. Margin prepares the data;
templates only print it. Two ship with Margin:

- **Quiet**: Inter, frosted bars, a floating clap bar, and comment threads as
  chat bubbles in a side panel.
- **Editorial**: Newsreader for reading, a newspaper-style home page, and the
  first note of each highlighted passage set in the margin beside it.

Margin's admins download a theme as a .zip, change it, and upload it to the
library; each workspace's owners pick one and its settings, and preview any
at `/<workspace>?theme=<id>`. The validator refuses scripts, event handlers,
outside URLs and raw HTML other than Margin's hooks, and warns about missing
dark styles. [`api/reference.md`](api/reference.md) documents every file,
field and hook; Claude reads it through `themes_reference`, and
`node tools/theme-check.mjs <folder>` runs the same checks locally.

## How it's built

- **Pages.** `api/http.js` routes each request; `api/pages.js` collects the
  page's data and renders it with [mustache.js](https://github.com/janl/mustache.js)
  through `api/themes.js`, in the workspace's theme. `api/landing.js` draws
  Margin's own front page. Holm adds icons, analytics and sign-in sync only
  to static files, so Margin fetches `web/shell.html` with
  `env.holm.web.fetch` and copies those tags into each page; the page's CSP
  allows its inline scripts by hash.
- **Speed.** Holm loads an app's modules afresh for every request, which
  costs more than most pages take to render, so `api/main.js` asks
  `api/lib/cache.js` first and loads the rest only when it must. Each page
  gets an ETag made of the asset fingerprint, a site revision that every
  visible change bumps, and the address: browsers revalidate and get a 304,
  and one rendering (kept in `env.holm.app.kv` for six hours) serves every
  reader until something changes. Pages carry nothing about who is reading,
  except Margin's front page, which is never cached. Margin's CSS, scripts
  and the built-in themes' files load under `/v/<fingerprint>/` and stay in
  the browser for a year; the fingerprint follows the version and those
  files' ETags, and is worked out at most every two minutes. A
  `Speculation-Rules` header lets Chrome and Edge fetch a page while the
  pointer rests on its link. A clap count on a cached page can trail
  until the next visible change; signed-in readers see the live count.
- **Footer.** Each theme's footer prints `{{{margin.credit}}}`: Written on
  Margin, a Holm mark and Send feedback. The form comes from the owner's
  [feedback](../feedback/) app through a local copy of its `embed.js`,
  loaded only when someone points at or taps the button.
- **Markdown.** `api/markdown.js` renders posts with
  [marked](https://github.com/markedjs/marked) when they're saved, shows raw
  HTML as text, checks every link, and adds Margin's blocks. The HTML is kept
  beside the Markdown, so reading a post renders nothing.
- **Drawn covers.** `api/covers.js` is one plain module that draws every
  cover as SVG from a motif, a look, a tone and a seed, the same in Holm's
  runtime and in browsers. The server serves it at `/c/<motif>-<look>-<tone>-<seed>.svg`
  and as `/v/<fingerprint>/margin/covers.js`; `web/margin/live-covers.js` patches the SVG in
  place on each animation frame as the pointer moves, and does nothing for
  readers who prefer less motion.
- **Media.** `api/media.js` reads each file's type from its first bytes and
  its pixel size from its header (and a video's from its MP4 or MOV track
  header), shrinks photos over 2048 px with `env.holm.image.resize`, and
  stores them in `env.holm.app.s3`. `/media/<id>-w640.jpg`, `-w1600` and
  the others, and `-og` (1200 × 630), are made on first request and kept;
  pages add `srcset` from them, in posts saved before them too. Holm's
  resize ignores EXIF rotation, so a turned JPEG is kept as it came and
  gets no smaller copies. SVG drawings are refused if they hold scripts,
  event handlers, embedded images or links to other files, and every file
  under `/media` is served with a sandboxing CSP. Upload links are hashed
  into `env.holm.app.kv` for an hour; `web/upload.html` and
  `web/margin/upload.js` are their page.
- **Storage.** Shared `env.holm.app.ds` collections: `people` (accounts),
  `blogs` (every name: people's, personas and workspaces' own, in one
  namespace with workspace addresses), `workspaces`, `members` (account,
  role and names per workspace), `posts` (small, for lists), `bodies`
  (Markdown and HTML), `slugs` (every address a post has had), `comments`,
  `claps`, `invites`, `media` and `themes`. Photos, videos and saved themes
  are in `env.holm.app.s3`; Margin's settings in `env.holm.app.kv`. Unique
  handles and slugs are claimed by insert-and-reread; counters use `$inc`;
  edits use compare-and-set.
- **Sign-in.** `env.holm.auth` for who is signing in. The app's Holm admins
  are Margin's admins; everything else (workspace roles, which names are
  whose) is Margin's own, and an account's link to its personas never leaves
  the server except to the account and the owners of a workspace it writes
  in.
- **Tools for Claude.** `api/contract.json` declares member operations, which
  Holm serves as MCP tools at `/_holm/mcp` behind its own sign-in and consent.
  `api/main.js` loads `ops.js` with `import()` only when a tool is called and
  exports thin wrappers, because Holm's contract scan stops at a budget on
  regex-heavy modules (`CONTRACT_RESOURCE_LIMIT`).
- **Realtime.** A new comment broadcasts on `post:<id>`; readers refresh.
- **Reader script.** `web/margin/reader.js` adds the account menu, claps,
  highlights (re-anchored from the quote and the words around it), the
  selection bar, the comment panel or sheet, the name you comment as,
  responses, link previews and live covers. `web/margin/ui.css` styles them
  from `--m-*` variables each theme sets.
- **Studio and the editor.** Plain modules in `web/studio/`. Each view paints
  its last answer at once and again only if the server has news (`remembered`
  in `lib.js`); any change clears that memory, and a settings form stops
  repainting once you touch it. The editor uses
  [Tiptap](https://tiptap.dev) 3 with its Markdown extension, built into one
  file, `web/vendor/editor/tiptap.js`, from `tools/editor/` (`npm install &&
  npm run build`), plus Margin's own figure, embed and callout blocks that
  read and write the same Markdown the server renders.

```text
holm.json                 identity, web settings, publish excludes
holm.symbol.svg           the app icon: lines of text with a note beside them
api/main.js               entry: fetch and the operation handlers
api/lib/cache.js          the fast path: cached pages, 304s, versioned files
api/contract.json         the operations (MCP tools)
api/http.js, ops.js       the JSON API, and the operations' bodies
api/pages.js, landing.js  reading pages, feeds, sitemap, link previews; Margin's front page
api/covers.js             the drawn covers (also served to browsers)
api/themes.js             theme loading, rendering, validation and storage
api/themes/quiet, editorial   built-in templates (their CSS and fonts: web/themes/)
api/markdown.js           Markdown to safe HTML
api/workspaces.js, blogs.js, people.js   workspaces and members, names and personas, accounts
api/posts.js, comments.js, claps.js, invites.js, media.js, settings.js
api/samples.js, samples/  the two sample teams and their posts
api/reference.md          the theme reference
api/vendor/               marked and mustache.js, with their licences
web/shell.html            where Holm's head tags come from
web/llms.txt              Margin explained to agents
web/studio.html, studio/  Studio, starting out, invites and the editor
web/upload.html           the upload link's page (web/margin/upload.js, upload.css)
web/margin/               the reader script, live covers, the front page's styles
web/themes/               the built-in themes' CSS and fonts
web/samples/              sample avatars, logos and cover images (made up)
web/vendor/editor/        the Tiptap bundle and its licences
web/vendor/feedback/      the feedback form's embed script
tools/editor/             how the bundle is built (not deployed)
tools/theme-check.mjs     checks a theme folder locally (not deployed)
tools/sample-images.py    draws the sample avatars (not deployed)
tools/cover-pngs.mjs      lists the sample covers to screenshot as PNGs (not deployed)
tools/logo-*.symbol.svg   the sample teams' logos, for holm app identity (not deployed)
tools/covers-preview.html every drawing in every look, to review (not deployed)
listing/                  store listing and screenshots (not deployed)
```

## Deploy your own

```sh
holm app validate margin --spec-v1
holm @<peer> app deploy margin --spec-v1 --host margin.example.com
```

Open `https://margin.example.com/studio/margin` as one of the node's admins
to choose who can join and load the sample content, or `/new` to start your
own workspace. To set up a node without signing in, give the app a setup key,
use it, and remove it:

```sh
holm @<peer> secret runtime set SETUP_KEY "$(openssl rand -hex 24)" --app <app-id>
curl -X POST https://margin.example.com/api/setup -H "Authorization: Bearer <key>" \
  -H 'Content-Type: application/json' --data '{"samples":true,"margin":{"primary_host":"margin.example.com"}}'
holm @<peer> secret runtime remove SETUP_KEY --app <app-id>
```

Then:

- **Sign-in page branding.** Holm's hosted sign-in has its own presentation
  settings. Inspect the schema, then set the app's name, icon, accent and
  social image on your peer:

  ```sh
  holm @<peer> settings list settings.apps.<app-id>
  holm @<peer> settings set settings.apps.<app-id>.brand.name Margin
  holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
  holm @<peer> settings set settings.apps.<app-id>.theme.accent '#1a7f64'
  holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
  ```
- **More than one address.** Add hosts with `holm @<peer> host add`, and set
  the primary address in Studio → Margin; the others redirect to it.
- **Feedback.** Send feedback goes to the owner's feedback app. Set
  `project` and `origin` in `loadFeedback()` in `web/margin/reader.js` to
  your own project, and `FEEDBACK_ORIGIN` in `api/pages.js` (the pages' CSP
  lets it frame the form), or remove `{{{margin.credit}}}`'s button.
- **Invite emails** need the node's email sending (section 12 of the guide).
  Without it, Margin shows the link to send yourself.
- **Uploads** follow the node's request body limit (1 MiB by default):
  raise `settings.node.policy.runtime.request_body_max_bytes` for photos and
  video. Margin takes photos up to 12 MB and video up to 20 MB.

## Known limits

- **Claude for people who aren't node admins.** Holm offers member tools only
  to people with read access to the app's Space, which today means the node's
  admins. Everyone else writes in Studio and can't connect Claude yet; Margin
  says so where it shows the connector.
- **A redeploy ends Claude's sign-in**; connect again afterwards.
- Video is stored as it is sent: Holm has no video processing, so send
  H.264 MP4 (or MOV) for every browser, 20 MB at most. Claude's
  `media_upload` takes photos up to about 1.5 MB as base64; larger files
  and video go through an upload link.
- A drawn cover's PNG (for link previews and feeds) is made in the browser
  when a post is published. Posts written only through Claude get one the next
  time someone opens them in Studio; until then their social card is Margin's.
- No custom domains per workspace, no scheduled publishing (Holm v1 has no
  schedules), no email notifications for new comments, no revision history,
  no search page, no way to delete a workspace (Margin's admins suspend one).
- Highlights find their passage again by its words; if the writer later
  rewrites that passage, the comment stays among the responses without a
  highlight.
- The sample teams, their posts, comments and claps are made up, as the
  workspaces say.

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
- The feedback embed is this repository's own [feedback](../feedback/) app
  (MIT).
- Icons and cover drawings are drawn for Margin, or adapted from
  [Lucide](https://lucide.dev) (ISC, `web/vendor/lucide/LICENSE`) and
  [Phosphor](https://phosphoricons.com)'s clapping hands (MIT,
  `web/vendor/phosphor/LICENSE`).
