# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Shelf", a read-later app for your own server in the spirit of Pocket
or Instapaper, using only https://holmhq.com/llms-full.txt for Holm. Read its
v1 sections 9–12, "Use your app from ChatGPT or Claude", "Make an app feel
finished" and "Make it feel native" first. Make holm.json (web.spa true),
public web/ files and api/main.js exporting default { fetch(request, env) }.
No build step or third-party runtime CDN; vendor Inter, Newsreader, Mozilla
Readability and DOMPurify with their licences.

- Sign in with the node's accounts. Each member's links, articles and
  highlights are theirs alone, in collections named for them.
- Save a link by pasting it anywhere, dropping it, a Save sheet, a bookmarklet
  that opens a small /add window, a phone's share sheet (the manifest's
  share_target) or an MCP tool. Tracking parameters come off; a link saved
  twice comes back to the top.
- Making it readable: the server fetches the page with env.holm.net.fetch (a
  timeout, any public https host granted to the app), the browser runs
  Readability and DOMPurify on it, keeps the title, site, author, excerpt and
  lead picture, and sends back the cleaned article and its plain text.
  Pictures are renamed by the hash of their address; the server keeps a copy
  of each the first time it's shown, and a square thumbnail for the list.
  Links saved elsewhere arrive "pending" and whichever page is open fetches
  them, newest first; imported links wait until opened.
- The list: a reading list with chips for quick reads, long reads, started,
  saved by Claude and tags; favourites, archive, tags, highlights; rows with
  title, excerpt, site, minutes left and a thin progress line; swipe to
  archive or favourite on a phone, J/K/E/S keys on a desk.
- The reader, beside the list on a desk and sliding over it on a phone: set
  in Newsreader (or Inter, or Atkinson Hyperlegible), eight sizes, three
  widths, three line spacings, justify, a paper tone; the
  reading position kept on every device; highlights and notes anchored by
  their place and quote; a three-point summary from env.holm.ai.chat; Listen
  with the browser's voices, sentence by sentence, the sentence tinted with
  the CSS Custom Highlight API.
- Share a highlight by link: a public /q/<slug> page with the words, the
  article's title and link and the sharer's first name (never notes), served
  from fetch with its own og tags and a preview card drawn on a canvas in the
  browser; turning it off ends the link.
- Full-text search over articles and highlights with ds.search.
- Import from Pocket, Instapaper and Readwise Reader CSV, bookmark HTML or
  any list of links, and ZIP exports read with DecompressionStream.
- A daily review of highlights, Readwise-style: a few a day, one at a time,
  spaced out (keep, sooner, much later, never), favourites and per-source
  frequency, notes and tags on highlights, a streak; review one book or tag
  on demand. Holm has no schedules, so it waits in the app.
- Kindle My Clippings.txt, Bookcision and Readwise CSV highlights become
  books with Open Library covers and their highlights in book order; paper
  books take typed-in highlights. Re-importing adds only what's new.
- A Feed of what followed sites, newsletters with a feed and YouTube channels
  post: paste a site and find its feed (link rel=alternate, then the usual
  places), OPML in and out, Unseen and All, save a post to the reading list
  with a swipe, videos in the reader from youtube-nocookie. The server
  fetches feeds conditionally when an open page asks for the due ones; the
  browser parses RSS, Atom and JSON Feed.
- Books, PDFs and Markdown by upload or drop: EPUB read in the browser with
  DecompressionStream into one article with a section per chapter (a
  Contents list; highlights carry the chapter), pictures kept by the hash of
  their bytes; PDFs kept in s3 and shown with vendored pdf.js (loaded on
  first use) page by page with a text layer for page-anchored highlights,
  their words read in the browser for search; a saved link to a PDF becomes
  one too.
- Ask: on a selection, Look up (Wikipedia REST and Wiktionary, no AI),
  Explain and Translate, each able to become a highlight's note; beside an
  article, a panel with the summary, takeaways, questions, saved prompts and
  free questions answered with quoted passages to jump to; in search, a
  question answered from the whole shelf with numbered sources; suggested
  tags. ai.chat with JSON answers and daily caps.
- A query language in search (tag:, in:, kind:, has:, minutes:, saved:,
  from:, minus to negate) and saved views in the sidebar; sort menus; select
  many for bulk archive, favourite, tag or delete; ⌘K; edit title and author;
  Atkinson Hyperlegible, line spacing and justify in the reader.
- Flashcards from highlights (hide words, or a question), spaced on their
  own and joining the daily review; a public, always-current page of an
  article's highlights (notes optional); MCP tools to save and change
  highlights and to read today's review.
- Export one ZIP made in the browser: Markdown per source with front matter
  (Obsidian, Logseq, Notion), highlights.csv in Readwise's import layout,
  library.csv, feeds.opml and a JSON copy.
- MCP tools (auth "user", each checking the caller): list, read, search,
  save (optionally with the article's text, readable at once), update,
  highlights, save a highlight, change a highlight, today's review.
- Connect via MCP… in the account menu and ⌘K, with the MCP mark: a sheet
  with the app's icon joined to the mark by flowing dots and the connector
  address (https://<host>/_holm/mcp). Below them are tabs for Claude,
  ChatGPT, Claude Code and Tools (what the tools do), and the sheet keeps one
  height. Menu labels stay short (Import…, Export…).
- Anything to copy (addresses, commands, share links) is one line that
  copies when clicked, with a copy icon, Copy on hover and Copied after.
- Realtime: every change reaches the person's other open pages at once.
- A native-feeling Apple-quality UI on phone and desktop, light and dark: a
  fixed shell where only panels scroll; a sidebar of places on a desk, a tab
  bar on a phone; ink-black controls, yellow only for your reading; a round
  avatar button with a three-icon theme switch; Holm's credit only in the
  footer. A versioned service worker precaches the app and keeps articles
  and pictures for reading offline.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/ with screenshots of public-domain reading only.
```

## The original request

The app was built overnight from this request, which left the choice of app
to the agent:

> Pick something cool to build tonight, (like Roll)
> - so that you can present a really good app tomorrow morning;
> - find that will be strategically useful for people, so that folks will install holm
> - and make it esquistely well designed with exceptional attention to detai0l
> - showcasing the capabilities of holm

Shelf 0.3 onwards came from a follow-up, after comparing Shelf with Readwise:

> Yes, I would like to do a proper gap analysis with ReadWise and close all
> possible gaps as elegantly as possible

Shelf 0.8.1 came from two more, after the connector address turned out to be
hard to find:

> Thats not sensible, this is a major feature, add it as an option connect via mcp in menu
> - bring links, highlighst, feeds feels too long; its making the menu wider than it should be
> - provide a nicer smaller name

> we need to make the connect via MCP a standard feature for every app we build from now
> - use the [MCP logo] file
> - extract the logo sensibly and use it in a nice way so that, this becomes reference to everything we build
> - if you need to update it anywhere do it

Shelf 0.8.2 came from one more, when the Claude Code command wrapped onto two
lines beside its Copy button:

> This is showiong up in two lines
> - may be make all copyable field, click-to-copy?
> - so that we don't need to show an additional copy button, that may remove the multi line issue
> - and show: 'copy' cue on hover?

Shelf 0.8.3 came from one more, about the size of that sheet:

> Should we make the mpc modal smaller?
> - say, instructions / Claude / ChatGPT / Operations
> - so that modal size stays the same show the bare minmum on screen: the url & instructions
> - that dot animation on top should cycle?
> - so that it shows always?
> - also, is there any way to show status of connect?

Shelf 0.8.4 came from a sweep of every app against the repository's
cookbook: lists keep their scroll across tabs, larger touch areas in the
top bar, an avatar alone at the top of the landing page, and loading
animations that stand still with reduced motion. The owner asked:

> Sure do cookbook sweep
