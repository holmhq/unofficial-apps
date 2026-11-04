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
  goes.
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
  for admins only), the theme switch, and Sign in or Sign out.
- **What stays out:** Holm branding, Source links and anything else that
  belongs in the footer.
- **The theme switch is three icons:** sun, moon and auto, each with an
  `aria-label` and a `title`, and no words. Labels make the menu wider.

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
- **No lines that repeat what the screen already shows**, such as a count
  of results above the results, or a sentence explaining the chips under it.
  Put a count inside a chip ("All 16") and longer explanations in a tooltip.
- **Filters are one compact panel** opened from one button, with each row a
  single control: presets above toggleable tokens, a segmented ruler for a
  number, and toggle tokens for options. Changes apply as they're made, and
  a dot on the button shows when filters differ from the defaults.
- **Use words that can't be misread.** A domain you can register is
  "Available", never "free", which reads as "costs nothing".
- **Design every dropdown.** Don't leave a bare native `<select>` in a styled
  app.
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
  `prefers-reduced-motion`.
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
- **Don't take a version you haven't got the data for.** A page that bumps
  its stored version after a bulk change (an import) is then told "same" and
  never redraws. Ask for the whole list after such a change, and only move
  the version on with the data it describes.
- **Draw from cache first.** Pages draw at once from a local cache and redraw
  only if the server's answer changed. `index.html` can prefetch the first
  page's JSON while modules load.
- **Switching tabs doesn't refetch** or redraw the whole page. Keep tabs alive
  with their scroll, and redraw only the part that changed.
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
  `theme.accent` and `brand.social_preview_url`. An app moved from an older
  folder keeps its old settings; look at them and reset any stale ones.
- **The sign-in page** shows the app's name, icon and accent, not the
  node's.
- **A shared link** unfurls with the app's own short title, description and
  image, and its `og:image` answers 200.
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

- **Each request has a budget** of about 5 seconds and 50 MiB of counted
  allocations. Bench loops over user-sized input with a long input. Run
  multi-step setup, seeding or cleanup as resumable steps of about 2 seconds
  each, with progress kept in KV.
- **There's no `Intl` on the server.** Time zones come from the browser.
  `toLocaleString` with options can throw.
- **Calls out of the app go in raw routes.** Named operations (the ones MCP
  exposes) can't call `net.fetch` or `ai.chat` and have no secrets, so do
  outbound work in a `fetch` route.
- **A paged `ds.find` returns at most 100 rows a page**, whatever `limit`
  asks for; follow the cursor. A find without `page` returns up to its
  `limit`. Shelf's highlights asked for 1,000 a page and showed 100.
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
- [ ] The footer is there and stuck to the bottom, and Holm branding appears
      only there.

**Account button and menus**

- [ ] The round avatar sits at the top right, signed out too.
- [ ] Clicking it a second time closes the menu, and so do Escape and a click
      outside. The same holds for every other menu button in the app.
- [ ] The menu has no Holm line or Source link. The theme switch is icons
      only, and admin links show only for admins.

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
- [ ] Switching tabs or sections doesn't refetch or redraw the whole page.
- [ ] Reduced motion is respected, and nothing jerks or jitters.
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
      and `og:image` answers 200.

**Holm and release**

- [ ] `holm app validate --spec-v1 <app>` passes. Handlers stay inside the
      budget with large input.
- [ ] After deploying, pull the app back and compare it with your files.
      Check the app's node settings.
- [ ] `PROMPT.md` quotes the request word for word (names of people
      replaced), `README.md` is current, and the version and `whatsNew` are
      updated. `node scripts/index.mjs` runs last, after the final edit to
      any file in the app, or CI finds `index.json` stale.
