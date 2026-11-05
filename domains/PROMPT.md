# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Domains", an app for finding a short domain name that is still
available, using only https://holmhq.com/llms-full.txt for Holm. Read its v1
sections 9–12, "Make an app feel finished" and "Make it feel native" first.
Make holm.json, public web/ files and api/main.js exporting
default { fetch(request, env) }. No build step or third-party runtime CDN;
vendor Inter with its licence.

- From what someone types, make shorter labels in the browser: clipped forms,
  sound-alikes (zach, zack, zak), initials, a dropped last vowel (flickr),
  with switches for prefixes/suffixes and domain hacks (inter.net), and a
  length limit. Leave out labels nobody could say (zchr). Add AI ideas from
  env.holm.ai.chat, cached in KV: nicknames, other spellings, short forms,
  real words from the same world (harbour: quay, berth, moor), blends and a
  few new words, plus one short caption of how it read the input. A second
  round, "More like these", asks for names in the style of the ones that came
  back available and the ones starred.
- Pair every label with the extensions picked and check the shortest whole
  names first. Lookups go through provider adapters so a service can be
  swapped. The first is Namecheap: its search page's WebSocket, from the
  browser, with the page's CSP allowing that socket. Fall back to an RDAP
  adapter (IANA bootstrap, env.holm.net.fetch) when it can't be reached.
- Show only available names, as cards: the name on one line (smaller type
  for longer names), its first-year price, why it was suggested, a star to
  save it and a button to add it to a list. Lookups answer in bursts, so
  reveal the cards one at a time at an even, quick pace, appended in order,
  premium names last; nothing reshuffles. Above them, one row of the ideas
  tried with a count each, never more than one line (it scrolls sideways):
  tap one to see only its names; ideas with nothing available fold away at
  the end. No line that repeats what the screen shows. Say "Available",
  never "free".
- Start on a hero with one big search field and a few example searches. The
  first search moves that field up into the navbar while the rest of the
  hero fades; clearing it goes back the same way, landing exactly.
- Filters open from a button in the search field as one compact panel:
  extension presets above the extensions themselves, a length ruler, which
  ideas to make, a first-year price ruler and "hide premium names". Changes
  apply as they're made.
- A name up close: first-year and renewal prices, why it was suggested, a
  link to register it, save and add to a list. Saved names and lists live in
  the browser, or on the account when signed in. A list has a name and a
  note; sharing it makes a link that opens for anyone without signing in: all
  its names on one page, checked again live, each with a link to register,
  and a link preview with the list's name.
- A native-feeling Apple-quality UI on phone and desktop, light and dark: a
  fixed shell where only panels scroll; a sidebar of places (Search, Saved,
  lists) that starts hidden on desktop, a tab bar on phones; a round avatar
  button top right whose menu toggles closed when tapped again, holds a
  light/dark/auto switch as three icons and sign-in, and never Holm branding
  (that goes in the sidebar's foot and the About page).
- MCP tools as named operations with auth "user", each checking the caller:
  suggest names the way the search makes them (they can't be checked from a
  tool, so say "unchecked" and link to the search, which checks them live),
  list, save and unsave names, and list, read, make, change, share and delete
  lists. Connect via MCP… in the account menu with the MCP mark opens a sheet
  with the connector address to click and copy, and tabs for Claude, ChatGPT,
  Claude Code and what the tools do. A page that comes back into view takes
  changes made elsewhere.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/listing.json with sample screenshots. These are repo conventions,
  not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 domains. With my approval, deploy with
holm @<peer> app deploy domains --spec-v1 --host domains.<my-domain>. Test a
search end to end, More like these, the fallback, saving, a shared list
opened signed out, phone and desktop, light and dark.
```

## The original requests

Domains was built from this message, passed to a coding agent (a private
notes path replaced):

> Can you build domains app?
> - this will be generic domain search / availablity lookup app
> - we will use namecheap API
> - see [notes on Namecheap's website search endpoints]
>
> Priorities:
> - make it generic, so that other services can be used
> - the UI should be exceptionally good looking
> - attention to detail: superb
> - need to make it work elegantly in mobile & desktop
> - the filtering systems in namecheap seems to be too bad
> - align this to make finding short domains easy
> - say two & three letter tlds
> - use ai cleverly if possible
> - may be to generate possible alterations that are still small but potentially available
> - for instance, a user trying to get one for his name with differnet possibilitie of his name: "Zacaharia" amy try things like zach ; but something like zack may work?
> - we need a way to show subtle, & nice animations to counter the wait times
> - we know it takes a ton of time to do availablity checks
> - try to make it elegant
> - also, have an option to avoid showing unavailable domains

And, while it was being built:

> dont stop until you deploy to domains.zyt.app
> - mention we are using namecheap adapter
> - and potentially we will use another

Version 0.2.0 redesigned it from these messages, each answered with a
clickable preview before the build (a friend's name and a test name are
replaced):

> Why is the UI so dirty?
> - the side bar looks pukish
> - i cant even look at it

> Lets refine domains
> - i just hate that ugly side bar
> - its stuffed with a ton of options in dirty way
> - it should be super elegantly redesigned
> - must be hideable
> - but i love the cards come in
> - but why redundantly show the list below that
> - we are only interested in available ones
> - query expansion with clever llm hints are good
> - if possible try making it better, i feel some suggestions can be improved
> - i really need a very minimal, less cluttered ui
> - i need a way to save nice domains
> - also, want a way to collect a bunch of domains for a friend to look at, say keep it collected in a folder like: "[a friend's name]", so that i can share it so that he gets the share link and in a single view gets to see all domains in a single view

> Avoid the labels for light/dark/auto; its stupidly makes the memu wider

> how is it sensible to show Holm app in the avatar popup menu
> - clicking it again doesnt dismiss it

> Feedback on redo:
> - the card appearance feels too quick for that UI
> - may be a much more graceful motion design on new result population might be better
> - so that even though we are actually introducing delays, it feels much more elegant
> - than like the populating feels too chaotic
> - i am not asking you to slow down much, it needs to feel snappy but the ui populates elegantly to avoid a messy filling
> - plus make this like a native app
> - nothing scrolls
> - only panels do
> - what if search bar can be integrated with teh navbar?
> - what if the search bar animates to the navbar on the first hero to search screen transition
> - in a very elegant magic transition hiding other elements
> - the filter system doesnt feel intentionally designed; it feels lazy: it feels it could be more space efficient, and minimal
> - these three lines are too much: [the counts, the AI's sentence and the row of ideas]
>
> funtionally the suggestions need to be there, but it shouldnt eevr be multiline, it should scroll horizontally
> - I dont think the first two lines are needed; its redundant, its self explanatory

> ALso, avoid 'freee to register', its confusing, say: "Available"

> Now, the populating feels slow :)
> - the side bar shouldnt be default open
> - when the search bar goes back to place in hero, its sizes changes, thats bad
> - remove zacharia from suggestion
> - also, dont show it getting prefilled

> when i did [a name]; [a name].dev was shown. but it caused multi line
> - may be we need a bit more length to support?
> - register at namecheap button is going out of container
> - starring cause it to clip

> sidebar ; and do deploy this

Version 0.3.0 added the MCP tools and the Connect via MCP sheet from this
message, about this app and two others:

> Can we now add it for overlap, domains, pastebin
