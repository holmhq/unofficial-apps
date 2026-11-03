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
  in Newsreader (or Inter), eight sizes, three widths, a paper tone; the
  reading position kept on every device; highlights and notes anchored by
  their place and quote; a three-point summary from env.holm.ai.chat; Listen
  with the browser's voices, sentence by sentence, the sentence tinted with
  the CSS Custom Highlight API.
- Full-text search over articles and highlights with ds.search.
- Import from Pocket and Instapaper CSV, bookmark HTML or any list of links.
- MCP tools (auth "user", each checking the caller): list, read, search,
  save, update, and highlights.
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
