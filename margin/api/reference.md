# Margin themes

A theme decides how a workspace's reading pages look: its home page, each writer's page,
each post, the latest feed and topic pages, and errors. Each workspace picks one theme from
Margin's library; Margin's admins add themes to it. Studio and the editor are not themed. A theme is a
handful of plain files, so it can be downloaded, read, changed and uploaded again, by hand
or by an assistant.

## Files

```
theme.json              id, name, version, settings and queries
templates/layout.html   the page around everything (head, header, footer)
templates/home.html     the workspace's home at /<workspace>
templates/blog.html     one writer: /<workspace>/@handle (and /@handle across Margin)
templates/list.html     the latest feed (/<workspace>/latest) and topics (/<workspace>/tag/<topic>)
templates/post.html     one post
templates/error.html    not found and other errors
partials/<name>.html    pieces you reuse with {{> name}}
assets/…                CSS, fonts (woff2, woff, ttf, otf) and images (png, jpg, webp, gif, avif, svg)
```

All six templates are required. Limits: 80 files, 200 KB per text file, 1.5 MB per asset,
6 MB in all.

## theme.json

```json
{
  "id": "quiet-warm",
  "name": "Quiet Warm",
  "version": "1.0.0",
  "description": "One line people see when they pick a theme.",
  "comments": "panel",
  "settings": [
    { "key": "accent", "type": "color", "label": "Accent colour", "default": "#c2410c" },
    { "key": "hero_title", "type": "text", "label": "Landing headline", "default": "" },
    { "key": "show_writers", "type": "boolean", "label": "Show writers", "default": true }
  ],
  "queries": {
    "home": { "lead": { "featured": true, "limit": 1 }, "design": { "tag": "design", "limit": 4 } }
  }
}
```

- `id`: 2–32 lowercase letters, digits and hyphens. `quiet` and `editorial` are built in;
  save your version under a new id.
- `comments`: how comment threads open. `panel` slides a chat-style panel in from the side
  (a sheet on phones). `margin` puts the first comment of each highlighted passage beside
  it on wide screens and uses the sheet elsewhere.
- `settings`: options admins change in Studio → Themes. Types: `text`, `textarea`, `color`,
  `boolean`, `select` (with `options`: values or `{ "value", "label" }`), `url`. Templates
  read them as `{{theme.settings.<key>}}`. Every `color` setting is also a CSS variable on
  `:root`: `accent` becomes `--accent`, `link_color` becomes `--link-color`.
- `queries`: extra lists of posts for a template, read as `{{#q.<name>}}…{{/q.<name>}}`.
  Filters: `blog` (a handle), `tag`, `featured` (true), `limit` (1–24), `offset`,
  `exclude_current` (on post pages, leave out the post being read).

## Templates

Templates are [Mustache](https://mustache.github.io/mustache.5.html): `{{name}}` prints
text (escaped), `{{#list}}…{{/list}}` repeats or shows when present, `{{^list}}…{{/list}}`
shows when empty or false, `{{> partial}}` includes `partials/partial.html`. There is no
other logic: Margin prepares the data.

Each page renders its template first; then `layout.html` renders around it with
`{{{body}}}` holding the result. The layout sees all the page's data too.

### Hooks you must print

Triple braces print HTML. Only these may use them:

| Hook | Where | What |
| --- | --- | --- |
| `{{{margin.head}}}` | layout, inside `<head>` (first) | charset, viewport, title, description, canonical, social cards, feeds, icons, Margin's CSS |
| `{{{margin.foot}}}` | layout, before `</body>` | Margin's scripts |
| `{{{body}}}` | layout | the page template's output |
| `{{{margin.account}}}` | layout, in the header | the round avatar button and account menu |
| `{{{post.body}}}` | post.html | the post |
| `{{{margin.actions}}}` | post.html | clap, comment count, share (print it once or twice) |
| `{{{margin.comments}}}` | post.html | responses and the comment box |

Load your stylesheet after `{{{margin.head}}}`:
`<link rel="stylesheet" href="{{theme.assets}}/theme.css">`.

### Data on every page

- `site`: the workspace: `name`, `initial`, `tagline`, `description`, `url`, `home_url`,
  `latest_url`, `feed_url`, `locale`, `logo` (or empty), `home_is_blog`, `slug`, `nav`
  (list of `label`, `url`), `has_nav`
- `platform`: Margin itself: `name`, `url` (its front page), `start_url` (start a workspace)
- `theme`: `id`, `name`, `assets` (the URL your files are under), `settings`
- `page`: `type` (`home`, `blog`, `list`, `post`, `error`), `title`, `description`,
  `url`, `canonical`
- `year`
- `latest`: the 12 newest posts in the workspace
- `featured`: up to 6 posts pinned on its home, in their order
- `writers`: everyone with published posts here: blog fields plus `posts` and `posts_label`
- `tags`: up to 30 topics: `name`, `url`, `posts`
- `q`: your queries for this template

Lists are computed only when a template reads them.

### Page data

- **home.html**: `posts` (one page of every published post, newest first; on a curated
  home, pinned posts first), `pagination`
- **blog.html**: `blog` (with `posts`, its count), `posts`, `pagination`
- **list.html**: `list` (`title`, `description`, `kind` = `latest` or `tag`, `tag`,
  `count`), `posts`, `pagination`
- **post.html**: `post`, `blog`, `newer` and `older` (in the same blog, or empty),
  `related` (up to 3 by shared topics), `more` (up to 3 more from the same blog),
  `comments` (`count`, `list`)
- **error.html**: `error` (`status`, `title`, `message`)

### A post (in every list, and `post` on post pages)

`id`, `url`, `slug`, `title`, `subtitle`, `description` (for cards and search),
`excerpt` (the first real paragraph), `cover` (`url`, `alt`, `width`, `height`, `drawn`:
every post has one, a photo or a drawing in the workspace's style), `has_cover`, `date` ("October 16, 2026"), `date_short` ("Oct 16"), `date_iso`,
`year`, `updated`, `updated_iso`, `reading_time` ("6 min read"), `minutes`, `words`,
`tags` (each `name`, `url`, `first`), `has_tags`, `blog`, `claps`, `comments`,
`claps_label` ("214 claps"), `comments_label` ("1 response"), `featured`, `workspace`
(`slug`, `name`, `url`, `logo`). On post pages also `body` (print with `{{{post.body}}}`) and `is_updated`.

### A blog

`handle`, `name`, `bio`, `is_workspace` (the workspace writing as itself), `url` (their page
in this workspace), `profile_url` (their page across Margin), `feed_url`, `avatar` (always an
image URL), `initials`, `color`. Personas and people look the same here on purpose.

### pagination

`page`, `pages`, `many` (more than one page), `has_prev`, `has_next`, `prev_url`,
`next_url`. Pages go newest first; "prev" is newer.

## Styling Margin's parts

Margin draws the post body's special blocks, the clap bar, comments and menus. It reads
these CSS variables, which your theme sets on `:root` (and again for dark mode):

`--m-accent`, `--m-accent-text`, `--m-bg`, `--m-surface`, `--m-grouped`, `--m-ink`,
`--m-muted`, `--m-line`, `--m-soft`, `--m-glass`, `--m-font`, `--m-radius`,
`--m-highlight`.

You can also restyle any `.m-` class: `.m-figure`, `.m-wide`, `.m-full`, `.m-embed`,
`.m-callout` (and `.m-callout-note`, `-tip`, `-important`, `-warning`, `-caution`),
`.m-bookmark`, `.m-postcard`, `.m-table`, `.m-code`, `.m-actions`, `.m-action`,
`.m-clap`, `.m-responses`, `.m-response`, `mark.m-hl` (highlighted passages),
`.m-panel`, `.m-msg`, `.m-bubble`, `.m-note-card`, `.m-menu`, `.m-pop` (link previews).

Readers pick Light, Dark or System in the account menu. Margin sets
`data-theme="light"` or `"dark"` on `<html>`; System leaves it off. Write dark styles for
both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and
`:root[data-theme="dark"] { … }`.

Post bodies contain plain HTML: `p`, `h2`–`h4` (with ids), `ul`, `ol`, `li`,
`blockquote`, `pre > code`, `code`, `a`, `strong`, `em`, `del`, `hr`, `img`, task list
checkboxes, and the `.m-` blocks above. Wide and full-width figures break out of the
text column with negative margins; give the column room or clip the page horizontally.

## Rules the checker enforces

- No `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<form>`, `http-equiv`,
  `on…=` attributes, `javascript:` or `srcdoc`. Margin adds every script itself.
- `src` and `href` point inside the site or the theme, except `<a href>` links.
- CSS loads nothing from other sites: no `@import` or `url()` to `http(s)://` or `//`.
  Put fonts and images in `assets/`.
- Triple braces only for the hooks above.
- Missing hooks are errors (`margin.head`, `margin.foot`, `body`, `post.body`) or
  warnings (`margin.account`, `margin.actions`, `margin.comments`). Names a template
  can't see, and CSS without dark styles, are warnings.

## Making a theme with Claude

1. `themes.get` with `"id": "quiet"` (or `editorial`) returns every text file.
2. Change the files. Give theme.json a new `id` and `name`.
3. `themes.validate` with the files. Fix every error.
4. `themes.save` with the files (Margin's admins only). Preview at `<host>/<workspace>?theme=<id>`
   (the workspace's owners and admins).
5. `themes.activate` with the workspace, the id, and optional `settings`.

A built-in theme's CSS comes back pointing at its own fonts (`/themes/quiet/inter-latin.woff2`),
so a copy keeps them without uploading anything. To use other fonts or images, add them to
`assets/` as `{ "base64": "…" }` and refer to them by file name.

By hand: Studio → Themes → download a .zip, edit, upload it. Studio runs the same checks
and shows what to fix. `node tools/theme-check.mjs <folder>` in Margin's source runs them
on your machine.
