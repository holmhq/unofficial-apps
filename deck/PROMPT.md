# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Deck", a deck-making app that people drive with Claude, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12,
"Use your app from ChatGPT or Claude", "Realtime", "Make an app feel
finished" and "Make it feel native" first. Make holm.json (web.spa true),
public web/ files and api/main.js exporting default { fetch(request, env) },
plus named operations that Holm projects as MCP tools. No build step or
third-party runtime CDN; vendor Inter with its licence.

- A deck is one JSON object with seven layouts: a cover (with a fan of the
  next three slides), a statement with a highlighted phrase, 2–4 cards, a
  flow of steps, a screenshot with boxes and numbered pins in percent of the
  picture, 1–4 numbers that count up with sources, and the ask (steps with
  owner and date, two buttons). Slides are 16:9 and sized in container units,
  so one renderer serves presenting, editing and thumbnails. No free canvas.
- Workspaces: anyone signed in makes one, invites teammates by single-use
  link (owner, admin, editor), and shares one picture library. Decks are
  private to their workspace.
- Claude's tools (auth "user", each checking the caller's membership): a
  format guide, list/create decks, read a deck with an outline and a check,
  save the whole deck or apply small slide edits, revisions and restore,
  pictures (SVG, small base64, or an upload link), a workspace's name and
  logo from its library, copy and delete decks (delete says what would go
  until called again with confirm), the team and invite links, share, the
  deck's stats, and point the person's open deck at a slide with a message.
  Every save names the version it was made from; a stale one gets 409.
- Connect via MCP… in the account menu opens one sheet: the app's icon joined
  to the MCP mark by five dots, the connector address to click and copy, and
  tabs for Claude, ChatGPT, Claude Code and what the tools do. Anything to
  copy is one click-to-copy field.
- Live loop: each save pings the deck's secret realtime channel; the open
  studio reloads in place on the same slide and says what changed, or asks
  which version to keep if the person was typing.
- A studio: words editable in place on the slide, an inspector for every
  field and list, drag to reorder slides, change layout, notes, history,
  six deck accents. A viewer with keys, swipes, notes and a clock, stacked
  slides on portrait phones, print to one slide per page.
- Sharing: a link that follows every save or pins a revision, an iframe
  embed, server-written link previews, and turning it off retires the link.
- Stats for shared links and embeds: opens, readers, reads, read to the end,
  opens per day, slide-by-slide reach and time, latest opens. Count only
  visible, active time; skip the workspace's own people; store no IP, browser
  string or name, just a random id from the reader's browser.
- Apple-quality UI on phone and desktop, light and dark, with a round avatar
  button top right (signed out too: a menu with the theme and Sign in).
  Native-like: the window never scrolls, bars stay fixed, panels scroll with
  no scroll bars, and the Holm credit with Feedback (the owner's
  feedback.zyt.app form) and Source sits at the foot. Fields are 16 px on
  phones; every dropdown is the app's own menu.
- No flicker: a service worker tied to the version precaches the app's
  files and serves them first, leaving shared, presenting and upload pages
  and Holm's own paths to the network; pages draw at once from the last
  answer kept in the browser and redraw only what changed; a workspace's
  tabs stay alive with their scroll. ⌘K finds places, decks and actions,
  Connect via MCP… among them.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/listing.json with sample screenshots. These are repo conventions,
  not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 deck. With my approval, deploy with
holm @<peer> app deploy deck --spec-v1 --host deck.<my-domain>. Test two
people in one workspace and a stranger, every tool over HTTP, a Claude save
arriving in an open studio, conflicts, sharing and revoking, phone and
desktop, light and dark.
```

## The original requests

Deck was built from these messages, passed to a coding agent (folder paths, a
company and the name of a private app are replaced here):

> We built deck app. I think we should hand it over to [this repository] to
> build it as a proper Claude-controlled (via MCP), workspace-based deck
> creation tool, so that it can be built as a dedicated, stand-alone app. I
> really like the UI/UX/motion & features of it. Let's build that as a proper
> one so that anyone can create their own workspaces, invite teammates, connect
> their Claude & get their work done effectively. Maybe take directional
> inspiration from [another of our apps] on embedding, sharing, asset manager
> etc.

and, later:

> I hope you have seen a new app's suggestion from a different repo: deck
> - please review & try to build it end to end
> - and deploy to deck-staging.zyt.app (we will finally deploy to deck.zyt once its all stable)

and, once Claude had used the tools:

> Also, can you place the [company's] logo [from a folder path] in the workspace

and:

> Make the Holm footer in deck stuck to bottom?
> - make the app native like
> - no scroll bars only panels scroll
> - add feedback.zyt.app to the app
> - add some stats page so that stats on the deck can be read: opens, reads etc

**Iteration 2** gave Deck the repository's Connect via MCP sheet in place of
its Connect Claude page, four more tools and click-to-copy fields. The owner,
asked whether Kalendar, Deck, Margin and Ralk should get the sheet, answered:

> yes, do both batches

**Iteration 3** came from a sweep of every app in the repository against its
cookbook: a service worker and cache-first pages, tabs that keep their
place, ⌘K, a signed-out account menu, Source in the footer, 16 px fields on
phones and a designed dropdown in the studio. The owner's word was:

> Sure do cookbook sweep
