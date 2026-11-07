# Cookbook

The bar every app in this repository meets, written down so it's met the
first time. Each rule came out of a real review of an app here; the same
mistakes kept coming back, so they live in one place now.

Read it before you design or change an app. Before you call any work done,
run [the checklist](#the-checklist) on every app you touched and say which
items you checked and how. Holm's own rules come first: this cookbook builds
on the v1 sections of <https://holmhq.com/llms-full.txt> and never replaces
them.

## How to use it

- **Feedback on one app is feedback on all of them.** When a review catches
  something, fix it, add the rule here in the same session, and note which
  other apps break it.
- **"Don't stop until it's deployed" never lowers the bar.** It means finish
  without pausing to ask questions; it doesn't mean skip the preview or polish.
- **Show before you build.** For a new app or a redesign, show 2–3 clickable
  directions first, then build the one that's chosen.

## The shell

Apps here feel like native apps, with Relay, Ralk and Kalendar as the
references.

- **The window never scrolls.** Bars are fixed and frosted, only panels
  scroll, and no scroll bar shows. Nothing may scroll sideways on an iPhone.
- **Phones get a tab bar, desks a sidebar.** A sidebar holds places (Search,
  Saved, lists, pages), not filters or settings. It can be hidden, and in
  an app whose main screen is a search it starts hidden. Settings
  people rarely touch go in a menu or a sheet.
- **The layout holds still.** Moving between pages doesn't shift the frame,
  and loading data doesn't push things around. When a choice is switched off,
  cross it out in place rather than removing it.
- **Footer:** small, frosted, stuck to the bottom, with a tiny Holm mark
  ("A Holm app"), Source and Feedback. This is the only place Holm branding
  goes. Every page has it: when it lives in a sidebar, it moves to the end
  of the panel whenever the sidebar is hidden or there's a tab bar instead
  (Kalendar's tabs on a phone and Domains' pages with the sidebar hidden
  had none). Feedback opens the app's own project on feedback.zyt.app in a
  panel: a copy of its `embed.js` in `web/vendor/feedback/`, loaded on the
  first click with `data-button="none"`, and the link's address is the
  form's own page for a modified click or when the script can't load.
- **Search-first apps put the search in the navbar.** The first search can
  start from a big field in a hero, which then moves up into the navbar while
  the rest of the hero fades away. A moving element must land exactly on
  its final size and place, so measure the destination before animating.
- **Start empty.** Never type into a field by itself to demo the app, and
  keep real people's names out of example searches.
- **Scroll the panel yourself.** `scrollIntoView()` and `#anchor` links also
  scroll the fixed shell and push the header away. Scroll the nearest panel
  by hand, and use buttons in place of in-page anchors.

## The account button

- **It's always a round avatar at the top right**, signed out too: a neutral
  avatar that opens a sign-in menu, not a "Sign in" text button.
- **A second click closes it.** So do Escape and a click outside. This goes
  for every button that opens a menu or popover, such as a workspace switcher.
  A click-away handler that ignores the button reopens the menu; check whether
  it's open first, and close it.
- **What goes in it:** who you are, the app's own places (Saved, Analytics
  for admins only), **Connect via MCP…**, the theme switch, and Sign in or
  Sign out.
- **It takes a 44 px tap** even when the face is smaller: wrap a 32–36 px
  circle in a 44 px button, with negative margins so the bar doesn't move.
  Other bar buttons that look 40 px reach 44 px with an invisible
  `::after` on coarse pointers.
- **Labels are one to three words**, such as "Import…", not "Bring in links,
  highlights, feeds…". One long label widens the whole menu.
- **What stays out:** Holm branding, Source links and anything else that
  belongs in the footer.
- **The theme switch is three icons:** sun, moon and auto, each with an
  `aria-label` and a `title`, and no words. Labels make the menu wider.
- **⌘K opens a command menu**, in every app with an account: the app's
  places and main actions, Connect via MCP…, the theme and Sign in or out.
  Anything else typed there runs the app's own search. Focusing a search
  box isn't ⌘K; give that `/`. A second ⌘K, Escape or a click outside
  closes it, and focus goes back where it was.

## Connect via MCP

Every app here is one Claude can use too, and says so where people look.
Shelf is the reference: `mcpSheet` in `shelf/web/src/shell.js`.

- **Every app ships MCP tools.** Its main actions are named operations in
  `api/contract.json` with `auth: "user"`, each checking the caller, and
  Holm serves them at `/_holm/mcp`. Named operations can't call out of the
  app (see the runtime notes), so tools work on the app's own data. Keep
  the contract in `api/contract.json`, not inline in `main.js`: the store
  reads only that file. An operation whose `auth` is an object without
  `discover`, like Feedback's `accounts.create`, is HTTP-only and the store
  doesn't list it. Moving tools from `member` to `user` opens them to
  everyone signed in, so check each handler first. Keep anything that
  changes the whole node, such as Margin's `themes.save`, on `member`, and
  Holm's own gate stays as a second check.
- **Cover what people do in the app**, not just its first screen: Relay's
  tools catch up on unread messages, read and send, list friends, and send
  and answer invites. Wrap the app's own handlers so the access checks stay
  in one place, and keep its privacy rules in the tools' answers. Where the
  routes are written inline in `fetch`, a tool can build a `Request` and pass
  it through the app's own `fetch`, as Overlap's do. An operation can't reach
  `web/`: `env.holm.web` is undefined there and imports from `web/` are
  refused. A tool that needs browser code or files, like Domains' name maker
  or Margin's theme stylesheets, uses a copy in `api/` that a check script
  keeps the same. `env.holm.env`, the app's settings, is undefined there too,
  so a route records in KV whatever a tool needs from them (Roll's quota).
  A link a tool returns needs an address in the page that opens that one
  item, like Roll's `?photo=<id>`.
- **A tool that can't be undone asks first.** Without its flag it answers
  with what would happen, and the description tells the agent to ask the
  person before calling again:
  - Pastebin's `pastes.open` answers a one-time paste as sealed, and burns
    it only with `burn: true`. The owner's own reads never burn it.
  - Roll's `photos.delete` lists what would go, and deletes only with
    `confirm: true`, and only photos already in the Trash.
  - **Something that reaches other people, like a text, is a draft.** Zend's
    `drafts.create` stores it and returns a link. The draft shows live in
    the app, and the person taps Send there, through the app's own route
    and its limits. No tool sends.
- **Don't declare idempotency on a tool whose result must not be kept.**
  Holm keeps a keyed answer for 24 hours to replay it, which would keep a
  one-time paste's text after it's gone.
- **A page that saves whole documents takes the account's copy back.** When
  it regains focus or comes back into view with nothing of its own unsent,
  it reads the account's copy and redraws. Otherwise its next save erases
  what Claude added. Count edits, so one made while a save is out still
  counts as unsent (Domains' `saved.js` and `lists.js`). Better still, send
  one change the server merges, as Until's page does when it rates one day,
  so a tool's change to another day survives.
- **Days follow the person's time zone, which the server doesn't know.**
  Tools that work with days, like Until's and Roll's, take a `today` input
  and fall back to the UTC date.
- **The account menu has Connect via MCP…** when you're signed in, with the
  MCP mark as its icon. ⌘K has it too. It opens one sheet, never a page,
  and other sheets that mention Claude link to it rather than repeat it. An
  app whose Connect page is its way in, like Ralk, keeps the page for what's
  its own (Ralk's prompts to try) and opens the sheet for the steps. A
  Claude tab in a tab bar becomes a button that opens the sheet, and an old
  connect page's address redirects to the app with the sheet open, as
  Deck's `/w/<id>/claude` does, so old links still work.
  An app whose account lives in a Settings tab, like Relay, puts it there
  instead: a Connect section with one Connect via MCP row.
- **The sheet shows the bare minimum.** It shows the app's icon joined to the
  MCP mark by five dots, and the connector address to click and copy. Under
  that is a segmented control: **Claude · ChatGPT · Claude Code · Tools**.
  - **Claude:** three numbered steps (open Settings, then Connectors; add a
    custom connector named after the app with the address; connect and sign
    in).
  - **ChatGPT:** three steps (turn on Developer mode in Settings, under Apps,
    then Advanced, on the web and on paid plans; create a connector with the
    address and OAuth; connect, then pick the app from + in a chat).
  - **Claude Code:** the command, `claude mcp add --transport http <app>
    <address>`, then `/mcp`.
  - **Tools:** three or four rows saying what the tools do, in plain words.

  There's no intro paragraph. The panes share one grid cell, so the sheet is
  as tall as the tallest and never changes height between tabs. It fits a
  390 × 844 phone without scrolling. Each Tools row's line fits on one line
  there. Closing the sheet puts focus back on whatever opened it, or on the
  avatar button when that was a menu item or ⌘K, which are gone by then.
  Skip a remembered element that sits inside the closing sheet, or focus
  lands on the page body. On desktop it's wide enough for the
  zyt command on one line, with some to spare: about 640 px for a narrow
  mono, 720 px for Fragment Mono. A modal `<dialog>` is capped by the
  browser at the viewport minus about 38 px, so set `max-width: none`
  before sizing it. Focus the dialog itself (`tabindex="-1"`), or
  `showModal()` puts a focus ring on the copy field.
- **The dots keep moving while the sheet is open.** A wave runs from the app
  to the mark every 2.4 s and rests between waves. With reduced motion they
  stand still; turn the animation off by name, because a global
  `animation-duration: .01ms` on an infinite animation flickers.
- **Don't show a connection status you can't know.** Holm doesn't yet tell an
  app whether someone has connected. Its read tools can't write, so an app
  can't even record when it was last used. Until Holm offers that, show no
  status rather than a guess.
- **Take the address from the server**, as `url.origin + '/_holm/mcp'` in the
  app's own "who's here" answer, so every host shows its own.
- **Anything to copy is a click-to-copy field**, never a read-only input
  beside a Copy button. That covers addresses, commands and share links; a
  13 px input makes iOS zoom, and the button pushes the value onto two lines.
  The whole field is one button (`role="button"`, Enter and Space copy too)
  holding the value on one line in 12.5 px mono, with a copy icon at its
  end. Pointing at it tints the field and fades in Copy over the end of the
  value. The field's background is opaque, or the value shows through the
  fade under Copy. A click turns the icon into a green tick and the word
  into Copied for 1.6 s, with no toast. A value too long for the line scrolls sideways
  under a fade. If the clipboard refuses, select the value and say so. In a
  grid, give the column `minmax(0, 1fr)`, in the phone layout too, and the
  field `min-width: 0`, or the line widens the sheet (Feedback's share link
  pushed a phone page to 558 px). Copy
  Shelf's `copyField` (`shelf/web/src/ui.js`). When the icons sit in
  wrapper spans, as Relay's do, give the copy icon and the tick their own
  classes: `:first-of-type` would pick the word's span, and the copy icon
  would stay under the tick. A person's own link in a narrow column, such as
  Kalendar's sidebar, would fade out the handle that matters. There the
  field uses the app's own type, with a muted host and a bold `@handle`
  (Kalendar's `is-link`). A list of things to copy, like Ralk's prompts, makes
  each whole row the click-to-copy button.
- **Summaries are read by people too.** Each operation's `summary` appears
  in the Tools tab, here and on the app's page in the store, so write it as
  a plain line on what the tool does. Instructions for the agent, such as
  "call this first", go in its `description`.
- **The store shows it too.** An app's page there has an MCP pill beside
  Get that opens the same sheet, built from `api/contract.json`, with two
  index tabs on the address: **Demo**, the copy this repository runs, which
  anyone can try at once when signed-in people may use the tools, and
  **Your node** (`catalog/web/src/mcp.js`).
- **The mark is `shelf/tools/mcp.svg`:** the MCP logo's two strokes at their
  true proportions, filled with `currentColor` and centred 21 units tall on
  the 24 grid, so it sits beside Lucide icons. Copy it into the app's icons;
  don't redraw, stretch or stroke it.

## The look

- **Refined like Apple Messages, Telegram or Relay.** That means vendored
  Inter, font weights that mean something, one accent colour, and colour only
  where it means something. No regional or cultural theming.
- **Banned: a coloured left border or stripe on a rounded rectangle**, whether
  done with `border-left`, an inset shadow, a `::before` bar or a thin div.
  It's the clearest AI-made tell. To tag an item with a colour, use a dot, a
  tinted icon tile, a tinted surface or coloured text.
- **Quiet controls.** Walls of equal-weight controls look dirty. So do grey
  fills on every chip and big switches stacked in rows. Prefer check-mark
  menus, a few clear choices and plain text that turns bold when chosen.
- **A row of chips is one line.** Suggestions, tags and filters scroll
  sideways with a soft fade at the edge; they never wrap onto a second line.
  Choices in a form, like an event's length, are a chip row too, and open
  with the chosen one in view.
- **Names get the room before tools.** In a narrow row on a phone, hide a
  control a gesture already covers, such as zoom buttons where pinch works,
  before clipping a name (Kalendar's booking page showed "Sing…").
- **No lines that repeat what the screen already shows**, such as a count
  of results above the results, or a sentence explaining the chips under it.
  Put a count inside a chip ("All 16") and longer explanations in a tooltip.
- **Filters are one compact panel** opened from one button, with each row a
  single control: presets above toggleable tokens, a segmented ruler for a
  number, and toggle tokens for options. Changes apply as they're made, and
  a dot on the button shows when filters differ from the defaults.
- **Use words that can't be misread.** A domain you can register is
  "Available", never "free", which reads as "costs nothing". Format amounts
  so nothing dangles: zero is "$0", not "$0.". Count forward for dates
  ahead: a helper that counts back says "just now" for any future date, so
  an invite says "expires in 6 days" with its own wording (Deck's said
  "expires just now").
- **Design every dropdown.** Don't leave a bare native `<select>` in a styled
  app. To design ones already in use, draw a menu button beside each and keep
  the select in the page, hidden, so code that reads its `value` and listens
  for `change` still works (Margin's `designSelect`).
- **Hover is subtle.** Icons don't grow, links in the chrome don't underline,
  and cards lift a little at most.
- **Grids line up.** Separators touch each other, cards in a row share their
  edges, and a grid is squarer than a list.
- **No clipped text.** Try every field with long, short and empty values,
  including titles, names beside avatars and long domains. A name on a card
  stays on one line: give its row the space it needs and shrink the type
  for longer names (check a 12- and a 16-character domain), with an
  ellipsis and a `title` only as a last resort. Never break a word.
- **Dark mode isn't an inversion.** Check every colour in both themes,
  especially red and muted grey text, which went unreadable in dark before.
  An app with colour themes must check every theme in both light and dark.
- **Carousels play by themselves**, pause under the mouse and can be dragged.
  Don't add control buttons.
- **Drawn covers and diagrams** use one isometric projection, three line
  weights, flat colour (never gradients behind hairlines) and opaque faces,
  and nothing childish. No leader line crosses the drawing.

## Motion

- **Motion has to mean something:** a card rises when it arrives, a free
  result flashes, a sheet comes up, a live dot pulses. Respect
  `prefers-reduced-motion`. A global `.01ms` rule under it also needs
  `animation-iteration-count: 1`, and infinite animations (spinners,
  skeleton pulses, playing bars) stop by name, or they flicker.
- **Results arrive as a calm, even stream.** Lookups come back in bursts, so
  queue the results and reveal one card at a time, about every 15–30 ms
  (quicker when many are waiting), appended in order. Each card fades and
  rises a few pixels over about 0.4 s, its details a beat later. It should
  feel snappy as well as orderly: 35–65 ms between cards felt slow. Don't reshuffle cards that
  are already showing, and don't flash them. A single soft placeholder at
  the end shows more is coming.
- **Nothing replays on refresh.** Animate changes of state, or play a one-time
  entrance after a skeleton. Never replay a page's entrance on every load.
- **Don't let motion jerk.** Animate from where the element is, with the
  right transform origin. Drive drawn shapes from state each frame; CSS
  transitions on SVG coordinates jitter.
- **Quick repeats don't stack.** When one card slides out as the next slides
  in, a second press must send away every card on stage, including the one
  still arriving. Shelf's review looked up "the card" with `querySelector`,
  found the one already leaving, and left the arriving card on screen under
  the next.

## Speed: no flicker

- **Precache everything.** Use a versioned service worker that precaches
  every file, all or nothing, and serves them cache-first. Tie its version to
  `holm.json`, and check that in a tool script.
- **Leave file addresses alone.** Only page addresses get the cached shell:
  typing `/icon-512.png` must open the image. Pass every `^/_` path (Holm's
  own surfaces) straight through.
- **Never precache a `.html` address.** Holm answers `/x.html` with a 308 to
  `/x`, and a page can't be answered with a redirected response, so the
  navigation fails. Keep such pages at `/x` (Feedback's `/widget`), and
  let `.html` addresses go to the network.
- **A server-rendered site opens from its worker too.** Keep the rendered
  front page, open every page address from it, refresh it in the
  background, and redraw only when the API's answer differs (Catalog).
  Where each page is its own server document, as Margin's posts are, pass
  navigations to the network and keep only the static files. An app with
  both answers only its own shell's addresses and files from the worker and
  leaves every page the server writes untouched (Margin's Studio).
- **A cached shell has no admin links.** Holm writes the admin surfaces
  (`__HOLM_SURFACES__`) into the page it serves, and the copy the worker
  kept may be from before sign-in. When someone is signed in, read them
  from a `no-store` fetch of the shell's address (Kalendar's, Ralk's and the
  games'). Check it whenever a worker starts keeping the shell: Deck and
  Margin lost Analytics that way.
- **Register the worker straight away.** In a module with top-level
  `await`, the `load` event has passed by the time the code runs, so a
  `load` listener never registers it.
- **Don't take a version you haven't got the data for.** A page that bumps
  its stored version after a bulk change (an import) is then told "same" and
  never redraws. Ask for the whole list after such a change, and only move
  the version on with the data it describes.
- **Draw from cache first.** Pages draw at once from a local cache and redraw
  only if the server's answer changed. `index.html` can prefetch the first
  page's JSON while modules load. With nothing kept yet, show the loading
  line until the node answers, so someone signed in elsewhere never sees
  "Nothing here" flash before their data. Signing out clears the cache.
- **Switching tabs doesn't refetch** or redraw the whole page. Keep tabs alive
  with their scroll, and redraw only the part that changed. A page taken out
  of the document forgets its scroll, so save the panel's `scrollTop` when
  its tab leaves and set it again after it's back (Shelf went 600 → 0).
- **Keep the server fast.** Holm loads `api/main.js` on every request, so
  keep its static imports tiny, answer cheap requests first and `import()` the
  rest. Keep memos in `env.holm.app.kv`, not in module variables.
- **Keep sizes still.** A sheet or modal never shrinks while someone types in
  its search field, and every search field fits its box.

## Pickers, menus and sheets

- **Popovers on a desk, sheets on a phone.** Every sheet has a clear Done.
- **Tab accepts an autocomplete suggestion**, just as Enter does.
- **Keep previews live.** Changing a setting such as a colour updates its
  preview as you change it.

## Identity and sharing

Holm decides what shows on the sign-in page, in link previews and in the tab,
from the app's files and the node's settings. Check them on the real node
after the first deploy.

- **App files:** `holm.symbol.svg` in canonical form (make it with
  `holm app identity symbol`), with icons at `/icon-512.png` and
  `/icon-192.png`, plus `social_preview.png`.
- **Node settings for the app:** `brand.name`, `brand.icon_url`,
  `brand.favicon_url`, `theme.accent` and `brand.social_preview_url`.
  Without a favicon setting, the sign-in page can show the node's icon
  (Domains did). An app moved from an older
  folder keeps its old settings; look at them and reset any stale ones.
- **The sign-in page** shows the app's name, icon and accent, not the
  node's.
- **A shared link** unfurls with the app's own short title, description and
  image, and its `og:image` answers 200 at a full address. Don't write the
  picture's tags into `index.html`: a relative `/og.png` there stops some
  sites showing it. Set `brand.social_preview_url` and Holm adds them, with
  the host (Feedback and Pastebin had relative ones).
- **Logos match.** The feedback widget's icon and the tab icon match the
  app's logo.

## CSS foundations

- **Use `box-sizing: border-box` on everything.** A full-width button with
  padding otherwise spills out of its box.
- **Keep class names from colliding.** A state class on one component must
  not match another component's class. A field's hidden state named `.pre`
  picked up the filter preset's `height: 28px`, and a star's `.pop` bounce
  picked up the popover's `position: absolute`. Name states `is-…` or make
  them specific, and search the stylesheet before reusing a short name.
- **Nothing invisible takes a tap.** A control that fades out must stop
  taking pointer events too. Roll's date rail, hidden on a phone until you
  scroll, sat over the right edge of the grid and swallowed taps on photos.
- **A detached element is never `isConnected`.** Shelf cleaned up articles
  in a `div` that wasn't in the page yet, and a loop that skipped
  `!el.isConnected` skipped everything. Check `root.contains(el)` instead.
- **Colour tags by first use, not by a hash.** Five tags hashed into ten
  colours gave three of them the same teal. Hand colours out in the order
  tags were first used, and fall back to a hash only past the palette.
- **`replaceChildren(null)` writes "null".** DOM methods turn `null` into
  text, so a page head showed the word "null" where an optional part was
  missing. Build children through a helper that skips empty values (the
  `fill` and `h` helpers in each app's `ui.js`).
- **A centred fixed element needs `width: max-content`.** With `left: 50%`
  and `translate(-50%)`, the browser lays it out in the half of the screen
  to the right of its left edge, so Shelf's toasts wrapped at 190 px on a
  phone. Give it `width: max-content` and a `max-width`.
- **A media query doesn't outrank a later rule.** An override inside
  `@media` must come after the rule it changes. Shelf's desk toast set
  `top: auto; bottom: 28px` in a media block above the base `.toast` rule,
  whose `top` won, so every toast on a desk stretched the window's height.
- **The footer line never breaks inside a label.** Give each credit item
  `white-space: nowrap; flex: none`, and measure the credit where it is
  narrowest. In Roll's 236 px sidebar, "A Holm app" broke over two lines;
  the sidebar is now 256 px, like Google Photos'.

## Holm runtime notes

These are things the v1 runtime does that have caught apps here. Check the
current guide too, since some of them will change.

- **Framing the feedback form takes two places.** A static page gets its
  CSP from the node, so set `security.csp.frame_src` to
  `https://feedback.zyt.app` on the app (Margin's Studio had none). A page
  your `fetch` writes with its own Content-Security-Policy ignores that
  setting, so list the origin in its `frame-src` too (Domains' form was a
  spinner).

- **Each request has a budget** of about 5 seconds and 50 MiB of counted
  allocations. Bench loops over user-sized input with a long input. Run
  multi-step setup, seeding or cleanup as resumable steps of about 2 seconds
  each, with progress kept in KV.
- **The AI's wait counts toward that budget.** On zyt (0.284, gpt-4o at
  about 120 tokens a second), a request whose `ai.chat` returns after 5
  seconds is cut off at its next bit of JavaScript. Keep each AI request
  under about 400 output tokens, do any heavy work in a separate request,
  and split long answers into parts the page asks for (one interview
  question per request, a CV draft section by section). zyt also runs only
  about two `ai.chat` calls per app at once and refuses the rest at once
  with `ai.concurrency_exceeded`: answer that with a retryable 429, retry
  from the page with a growing wait, and count daily caps only after a
  call succeeds.
- **There's no `Intl` on the server.** Time zones come from the browser.
  `toLocaleString` with options can throw.
- **An operation's input is validated before its sign-in check.** A
  signed-out call with bad input gets 400, not 401, so test the 401 with
  valid input.
- **An app with a contract turns the generated web surface off.** Set
  `surfaces.web.renderer` to `"off"` in `holm.json`, or the deploy stops
  with `V1_FEATURE_LATER: generated-web`; validate only lists it as a
  diagnostic.
- **Page cursors are long.** A `ds.find` cursor runs to about 500
  characters, so a tool's `before` or `cursor` input needs a `maxLength` of
  a few thousand. Pass it back untouched.
- **Calls out of the app go in raw routes.** Named operations (the ones MCP
  exposes) can't call `net.fetch` or `ai.chat`, so do outbound work in a
  `fetch` route. On 0.278 that holds for read, write and destructive
  operations alike (`READ_EFFECT_DENIED`). `env.holm.private.read` works in
  them, and by 0.283 so does `env.holm.secrets`: having the key is not leave
  to call out. Decide by the caller (tool or web route), never by what `env`
  carries. Ralk 0.3.0 tested for secrets, and every line Claude sent failed
  once operations gained them.
- **A read operation can't write**, so it can't do the app's lazy clean-up,
  such as purging an expired paste. It reports the state as it should be,
  and the next write cleans up. Nor can it reuse an app function that
  writes as it reads: Zend's thread view marks a conversation read, so its
  tools read through their own path.
- **A tool that filters rows in code can't pass on the data store's
  cursor**, because stopping partway through a page skips rows. Make its own
  cursor from the sort value plus the ids already given at that value, as
  Roll's `photos.list` does.
- **A tool's input is capped at about 50 KB**, whatever its `maxLength` says.
  Past that Holm answers 413 `SCHEMA_RESOURCE_LIMIT`, so cap text inputs below
  it; Pastebin's take 48,000 characters.
- **A paged `ds.find` returns at most 100 rows a page**, whatever `limit`
  asks for; follow the cursor. A find without `page` returns up to its
  `limit`. Shelf's highlights asked for 1,000 a page and showed 100.
- **`ds.search` finds what has every word**, and treats `OR` as a word. To
  find what has any of several words, search each on its own and merge;
  Shelf's Ask ranks what matches the most.
- **`net.fetch` takes a `timeout` in milliseconds.** Without one, a slow
  site uses up the request, and the storage write after it fails with
  `storage deadline`. Give outbound calls a timeout well inside the budget.
- **A server `URL` can't be changed.** Its setters (`url.protocol = …`,
  `url.search = …`) throw in the v1 runtime; build the address as a string.
- **`email.send` takes one `to` per call.** It can carry a calendar invite
  but no attachments. Serve calendar files at addresses that don't end in
  `.ics`, because Apple Mail treats those as subscriptions.
- **`env.holm.web.fetch('/x.html')` answers 308 to `/x`.** The SPA fallback
  skips paths that look like files (`/@bo.test`). A shell served from `fetch`
  keeps its own Content-Security-Policy.
- **The data store reorders object keys.** Compare stored objects with a
  sorted-key stringify.
- **A member's `picture` is a same-origin avatar.** A generated one is SVG;
  a real photo is raster.
- **`image.resize` ignores EXIF orientation**, and regular expressions
  support only `\p{L}`-style categories and `Script=`.
- **Shrink images in the browser** before upload, to a size that suits the
  web.

## The checklist

Run this on every app you touched, in a real browser, before saying it's
done. Say in your summary which items you checked, how, and which you
couldn't check.

**Shell**

- [ ] The window never scrolls; only panels do, with no scroll bars. Nothing
      scrolls sideways at 375 px or 390 px wide.
- [ ] The frame doesn't jump between pages or while data loads.
- [ ] Any sidebar holds places, not controls, and it hides.
- [ ] The footer is on every page, with the sidebar hidden and on a phone,
      stuck to the bottom, and Holm branding appears only there. Its
      Feedback opens the form on the live host, not a spinner.

**Account button and menus**

- [ ] The round avatar sits at the top right, signed out too.
- [ ] Clicking it a second time closes the menu, and so do Escape and a click
      outside. The same holds for every other menu button in the app, and
      for ⌘K, which opens a command menu of places and actions.
- [ ] The menu has no Holm line or Source link. The theme switch is icons
      only, and admin links show only for admins, still there after a
      reload from the worker.
- [ ] Menu labels are one to three words. Signed in, the menu and ⌘K have
      Connect via MCP… with the MCP mark. Its sheet shows the server's
      address on one line at 390 px, has Claude, ChatGPT, Claude Code and
      Tools tabs, and keeps one height across them without scrolling on a
      phone.
- [ ] Every address, command or link to copy is a click-to-copy field: one
      line, a copy icon, Copy on hover, Copied with a tick after, no separate
      button. The zyt Claude Code command fits on one line in a wide sheet.

**Look**

- [ ] No coloured left borders or stripes on rounded rectangles. Grep for
      `border-left`, inset shadows and `::before` bars.
- [ ] Every screen checked in light and dark, with error, muted and accent
      text readable in both.
- [ ] No clipped or overflowing text with long, short or empty values;
      names on cards stay on one line at 12 and 16 characters.
- [ ] Hover is subtle (nothing grows or underlines), separators meet, and
      every dropdown is designed.
- [ ] Controls are quiet: no wall of equal-weight switches or grey chips.
- [ ] Fields start empty, with no auto-typed demo, and anything that moves
      lands on its final size and place.
- [ ] Chip rows stay on one line and scroll sideways. No line restates
      what's on screen. Status words can't be misread ("Available").

**Motion and speed**

- [ ] Reloading each page shows no flicker and no replayed entrance; data
      draws from cache at once.
- [ ] Switching tabs or sections doesn't refetch or redraw the whole page,
      and each tab comes back at its own scroll.
- [ ] Reduced motion is respected: nothing jerks, jitters, or flickers in an
      endless loop.
- [ ] Results that arrive in bursts still appear as a steady, ordered
      stream, with nothing reshuffling.
- [ ] The service worker version follows `holm.json`, `/icon-512.png` opens
      the file, and `/_…` paths pass through.

**Phone**

- [ ] Checked at 390×844: tab bar, sheets, and touch targets of at least
      44 px. Inputs are 16 px or larger, so iOS doesn't zoom.

**Identity and sharing**

- [ ] The tab icon, home-screen icon and feedback widget icon match the
      app's logo.
- [ ] The sign-in page shows the app's name, icon and accent.
- [ ] A shared link unfurls with the app's own title, description and image,
      and `og:image` is a full address that answers 200.

**Holm and release**

- [ ] `holm app validate --spec-v1 <app>` passes. Handlers stay inside the
      budget with large input.
- [ ] After deploying, pull the app back and compare it with your files.
      Check the app's node settings.
- [ ] `PROMPT.md` quotes the request word for word (names of people
      replaced), `README.md` is current, and the version and `whatsNew` are
      updated. `node scripts/index.mjs` runs last, after the final edit to
      any file in the app, or CI finds `index.json` stale.
