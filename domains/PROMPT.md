# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Domains", an app for finding a short domain name that is actually free,
using only https://holmhq.com/llms-full.txt for Holm. Read its v1 sections
9–12, "Make an app feel finished" and "Make it feel native" first. Make
holm.json, public web/ files and api/main.js exporting
default { fetch(request, env) }. No build step or third-party runtime CDN;
vendor Inter with its licence.

- From what someone types, make shorter labels in the browser: clipped forms,
  sound-alikes (zach, zack, zak), initials, a dropped vowel (flickr), with
  switches for prefixes/suffixes and domain hacks (inter.net), and a length
  limit. Add AI ideas from env.holm.ai.chat (nicknames, other spellings,
  blends, new words), cached in KV.
- Pair every label with the extensions picked (presets for short, 2-letter,
  3-letter, classic, tech and cheap ones, or your own from a price list) and
  check the shortest whole names first.
- Lookups go through provider adapters so a service can be swapped. The first
  is Namecheap: its search page's WebSocket, from the browser, with the page's
  CSP allowing that socket. Fall back to an RDAP adapter (IANA bootstrap,
  env.holm.net.fetch) when it can't be reached.
- Show answers as they arrive: a card per label whose extension pills wait,
  then settle to free (with the price) or taken; the shortest free names in a
  row of tiles at the top. Switches to show only free names or hide premium
  ones, and a price limit. A sheet per name with prices, who holds a taken
  one, and a link to register it. Star names to save them (in the browser, or
  on the account when signed in).
- Subtle motion that makes the wait pleasant. Apple-quality UI on phone and
  desktop, light and dark, a round avatar button top right; native-like: the
  window never scrolls, a tab bar on phones and a sidebar with the filters
  on desks.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/listing.json with sample screenshots. These are repo conventions,
  not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 domains. With my approval, deploy with
holm @<peer> app deploy domains --spec-v1 --host domains.<my-domain>. Test a
search end to end, the fallback, phone and desktop, light and dark.
```

## The original request

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
