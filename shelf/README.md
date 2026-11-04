# Shelf

Save anything to read later, on your own server. Shelf keeps the articles you
mean to read in a calm reader, without the site's ads and pop-ups, set in a
typeface made for reading. Highlight what matters, pick up where you stopped
on any device, listen, and let Claude read your shelf with you. It's a small
take on read-later apps such as Pocket, Instapaper and Omnivore (two of which
have shut down), and it runs on [Holm](https://holmhq.com).

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of it. Try it at [shelf.zyt.app](https://shelf.zyt.app).

## Holm App Spec v1

Shelf follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12. The pieces:

- **`holm.json`:** identity and web settings, with `web.spa` on.
- **`web/`:** the public files.
- **`api/main.js`:** exports `default { fetch(request, env) }`, plus the
  named operations in `api/contract.json` that Holm turns into MCP tools.

Every deploy needs `--spec-v1`, and the node runs no build. Only `web/` is
served as files: `api/` and `holm.json` are not public URLs.

## What it does

- **Save from anywhere.** Paste a link anywhere on the page, drop one on it,
  or use the Save sheet. The **Save to Shelf** bookmark saves the page you're
  on from any browser. Installed on Android, Shelf shows up in the share
  sheet. Claude can save links too. Tracking parameters (`utm_…`, `fbclid`
  and the like) come off, and a link you save twice comes back to the top.
- **A clean copy.** Shelf fetches the page on your server and keeps the
  article: its words, its pictures, its title, site, author and date. The
  pictures are kept on the server too, so the article is still whole when the
  site changes or goes away.
- **The reading list** shows each article's title, a line or two, the site
  and the minutes it takes, or the minutes left when you've started. Chips
  narrow it to quick reads, long reads, ones you've started, ones Claude
  saved, or a tag. Favourites, the Archive (what you've finished), tags and
  Highlights are a tap away.
- **The reader** opens beside the list on a desk and slides over it on a
  phone. It's set in Newsreader, or Inter if you'd rather, in eight sizes and
  three widths, on white or a paper tone, in light or dark. Shelf keeps your
  place as you read and takes you back to it on any device.
- **Highlights and notes.** Select words and choose Highlight or Note. They
  find their place again even if the article is fetched afresh, and gather on
  the Highlights page, newest article first.
- **A daily review.** A few highlights a day come back on the Highlights
  page, one at a time on paper: keep one in mind and it waits a while,
  favourite it and it comes back more often, send it away for months or for
  good, add a note or a tag. Every source gets its turn, you choose how often
  a book or article comes up, and finishing a review keeps a streak. Review
  a single book or tag whenever you like.
- **Kindle and Readwise highlights.** Bring in a Kindle's `My Clippings.txt`
  (or a Bookcision file) and a Readwise CSV export. Each book becomes a
  notebook on your shelf with its cover from Open Library and its highlights
  in book order, with locations and notes. Importing the same file again adds
  only what's new.
- **Paper books.** Add a book you're reading on paper and type in the
  passages you mark, with their page. They join the review like any other.
- **Tags on highlights.** Tap a highlight to tag it, and filter the
  Highlights page by tag, favourites, books, articles or notes.
- **Export everything.** One ZIP: a Markdown file per book or article with
  your highlights and notes (with front matter, for Obsidian, Logseq or
  Notion), `highlights.csv` in the layout Readwise's CSV import takes,
  `library.csv` with everything you saved, and a full JSON copy. The articles
  can come too, as Markdown.
- **Share a highlight.** Tap a highlight and choose Share: Shelf makes a link
  to a page with the words, the article's title and link, and your first name
  (never your notes), and draws its link-preview card in the reader's
  typefaces. Stop sharing and the link no longer works.
- **A summary** in three points from the node's AI, kept with the article.
- **Listen.** Your device reads the article aloud, a sentence at a time, from
  where you are; the sentence being read is tinted and the page follows it.
- **Search** finds words in titles, in the articles themselves and in your
  highlights and notes.
- **Bring your links** from a Pocket, Instapaper or Readwise Reader export
  (CSV, or the ZIP it came in), a bookmarks file (HTML), or anything with
  links in it. The newest are made readable
  straight away and the rest when you open them.
- **Claude reads it with you.** Connect Shelf to Claude as a custom connector
  at `https://<your-host>/_holm/mcp` and sign in. Claude can list what's on
  your reading list (say, everything under ten minutes), read an article,
  search, read your highlights and notes, save links, and archive, favourite
  or tag them. When Claude has already read an article, it can save its text
  with the link, and the article is readable at once.
- **Offline.** Your newest unread articles are kept on the device as the list
  loads, and pictures once you've seen them, so they read on a plane.

### How it feels

A native-app shell: the window never scrolls, bars stay put, and only the
panels move. A sidebar of places on a desk, which hides with one click, and a
tab bar on a phone, where rows swipe left to archive and right to favourite,
and a swipe from the left edge closes the article. Ink-black controls, with
yellow used for one thing: your reading (highlights, progress, the article
you have open). Every change reaches your other open devices at once. On a
desk, J and K move through the list, Enter opens, E archives, S favourites,
H highlights, L listens, R opens today's review, A saves and / searches. The round avatar button holds
who you are, saving and importing, a three-icon theme switch and Sign out;
the Holm credit sits in the footer.

## How it's built

- **Storage.** Each person's things live in shared storage under collections
  named for them, so every list, search and delete only ever sees their own:
  `items.<member>` (one document per saved link), `text.<member>` (each
  article's plain text, for search and for Claude) and `marks.<member>`
  (highlights). The cleaned article is a file in `env.holm.app.s3` at
  `c/<member>/<id>`. A KV entry per canonical address finds a link saved
  twice.
- **Fetching on the server, reading in the browser.** `GET /api/fetch` asks
  for the page with `env.holm.net.fetch` (an 8-second timeout). The browser
  then runs [Readability](https://github.com/mozilla/readability) and
  [DOMPurify](https://github.com/cure53/DOMPurify) on it (`web/src/extract.js`),
  keeps only plain article markup, tidies Wikipedia and Project Gutenberg
  pages, renames each picture to `/i/<hash>` and `PUT`s the article, its
  plain text and its details back. The article is only ever served as
  `text/plain` with a sandbox CSP, and DOMPurify cleans it again each time
  the reader draws it.
- **Pictures** (`api/images.js`). `/i/<hash>` fetches a picture once, with a
  3.5-second timeout, and keeps it; `/i/<hash>/t` is a 320 px square made with
  `env.holm.image.resize`. Only addresses that came in with a saved article
  have a hash, so it isn't an open proxy. A picture the server couldn't fetch
  loads from its site instead.
- **Links saved elsewhere** (Claude, another device, the bookmark) arrive as
  `pending`. Named operations can't fetch from the web, so whichever page is
  open fetches them, two at a time, newest first. When Claude passes the
  article's text, `items_save` sets it from a small, escaped subset of
  Markdown and stores it straight away.
- **Shared highlights** are documents in a shared `quotes` collection holding
  a copy of the words and the article's title, link and site, so the public
  page never reads anyone's shelf. `GET /q/<slug>` serves the app's page from
  `fetch` with the quote as its title and `og:image` at `/q/<slug>/card.png`,
  a PNG the sharer's browser draws on a canvas and uploads.
- **Claude's tools** are named operations with `auth: "user"`, each scoped to
  the caller: `items_list`, `items_read`, `items_search`, `items_save`,
  `items_update` and `highlights_list`. `api/main.js` exports one-line
  wrappers that import `api/ops.js`, so Holm's contract scan stays small.
  `node shelf/tools/contract.mjs` writes `api/contract.json`.
- **One answer for the list.** `GET /api/library` returns every link. A
  version in KV (`v:<member>`), moved on by every change, lets the page ask
  `?v=` and get a one-line answer when nothing changed. The page keeps its
  copy in localStorage and draws from it at once, makes changes there first
  and sends them after, putting them back if the server refuses.
- **Realtime.** Each person has a channel with an unguessable name, which the
  page learns from `/api/me`. Every change is broadcast there, naming the page
  that made it so it isn't echoed back, and other pages patch their copy.
- **Highlights** are anchored by their place in the article's text and by the
  words themselves with a little text either side, so they find their place
  again if the article changes. Imported and typed-in ones have a place in
  the book (`Location 412`, `Page 23`) instead.
- **The review** (`api/review.js`). Each highlight carries `due` and `ivl`:
  keeping one roughly doubles its wait (14 days the first time), "much
  later" quadruples it, "sooner" brings it back in four days. Today's set is
  drawn once per person per day (the browser sends its own date, since the
  server has no time zones) with a seeded weighted draw: favourites count
  double, a source's frequency setting scales it, long-waiting ones lean in,
  and no source repeats until every source has had a turn. It's kept in KV
  for every device, topped up if it came up short, and a finished set moves
  the streak on. Holm v1 has no scheduled jobs, so the review waits in the
  app rather than arriving by email.
- **Books kept for their highlights** are items of kind `notes` with no web
  address. `POST /api/import/highlights` takes a batch of sources, finds each
  again by title and author (a KV entry) or by link, and adds only highlights
  it hasn't got, a couple of seconds at a time. Covers come from Open
  Library's search the first time a book is shown.
- **Export** is made in the browser: `web/src/zip.js` writes an uncompressed
  ZIP (and reads ZIP exports with `DecompressionStream`), with no library.
  Highlights come from `GET /api/highlights` a page at a time, since a paged
  `ds.find` returns at most 100 rows a page.
- **Summaries** come from `env.holm.ai.chat`, at most 60 a day per person and
  2,000 a day across the node, and are kept with the item.
- **Feedback** opens from the footer: `web/vendor/feedback/embed.js` is a copy
  of the widget from [feedback.zyt.app](https://feedback.zyt.app), with its
  floating button hidden. Its form is framed from that origin, so the app's
  CSP allows it (`security.csp.frame_src`). Point `FEEDBACK_PROJECT` in
  `web/src/shell.js` at your own project, or set it to `''` to drop the link.
- **Offline-ready.** A versioned service worker (`web/sw.js`) precaches every
  file, all or nothing, and keeps articles (`/api/items/<id>/content?v=`,
  which never change at a given version) and pictures in caches of their own,
  which signing out clears. `node shelf/tools/check.mjs` checks its file list,
  its version and the tools' audience.

## Deploy your own copy

```bash
node shelf/tools/check.mjs
holm app validate --spec-v1 shelf
holm @<peer> app deploy shelf --spec-v1 --host shelf.<your-domain>
```

Add `--force` when redeploying.

**Fetching pages.** Shelf fetches whatever site you save, so the app needs
permission to reach any public HTTPS host:

```bash
holm @<peer> net allow-any --app <app-id>
```

**Summaries** need an AI provider on the node (section 6.7 of the guide).
Without one, the Summarise button says summaries aren't available.

**Branding.** Then set the sign-in page's presentation and the link-preview
card for the new app id, after checking the settings schema on your node:

```bash
holm @<peer> settings set settings.apps.<app-id>.brand.name Shelf
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#1d1d1f'
```

## Known limits

- **Pages behind a sign-in or a paywall** come back as the site shows them to
  a stranger. Sites that turn away servers (some news sites behind bot
  protection) can't be fetched; Shelf keeps the link with Open the original.
- **https only.** Plain `http://` addresses are tried as `https://`.
- **PDFs, pictures and videos** are kept as links, not read in Shelf.
- **The review is in the app.** No email or notification reminds you, as Holm
  v1 apps can't run on a schedule or send push notifications.
- **Kindle highlights come from a file.** Shelf can't sign in to Amazon to
  sync them; copy `My Clippings.txt` from the Kindle, or export with
  Bookcision. Apple Books, Kobo and Google Play Books keep theirs closed;
  bring them through a Readwise export.
- **Claude's saves wait for a device** unless Claude passes the text. A link
  saved without it is fetched the next time Shelf is open on one of your
  devices, and Claude can read it only after that.
- **A shared highlight is a capability.** Anyone with its link can see it;
  turning sharing off ends the link.
- **Listening** uses the voices your device has; some browsers have only a
  few, and they don't play with the screen locked.
- **5,000 links per person**, and the list loads in one answer.
- **Search matches whole words** in articles, not parts of words.
- iPhone Safari and summaries were not checked before release.

## Licences

- [Inter](https://rsms.me/inter/) and
  [Newsreader](https://github.com/productiontype/Newsreader): SIL Open Font
  License 1.1, in `web/fonts/OFL-inter.txt` and `web/fonts/OFL-newsreader.txt`.
- [Readability](https://github.com/mozilla/readability): Apache 2.0, in
  `web/vendor/readability/LICENSE.md`. One line is added at the end to export
  it as a module.
- [DOMPurify](https://github.com/cure53/DOMPurify): Apache 2.0 or MPL 2.0, in
  `web/vendor/dompurify/LICENSE`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
- The sample pictures on the start page (`web/samples/`) and the articles in
  the store screenshots are in the public domain, from Wikimedia Commons,
  Project Gutenberg and Wikipedia (whose article text is CC BY-SA 4.0). Shelf's
  mark is its own.
