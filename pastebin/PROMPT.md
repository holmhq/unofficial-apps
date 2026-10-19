# Prompt

The public reference at <https://holmhq.com/llm.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build a private-first pastebin using only https://holmhq.com/llm.txt for
Holm. Read its v1 sections 9–12 first. Make holm.json, public web/ files and
api/main.js exporting default { async fetch(request, env) }. Set web.spa
true, use env.holm for storage/auth, return standard Responses and fall
back to env.holm.web.fetch(request). No build step or third-party runtime CDN;
vendor the Markdown parser, sanitizer, highlighter and fonts with licenses.

- Make a minimal cyanotype design, light/dark/system themes, excellent on
  phones and desktop. The page stays still; only the editor scrolls.
- Paste text/code with syntax highlighting and safe GitHub-flavoured
  Markdown (Preview/Source), plus images, video, audio or any file. Put the
  attachment icon at the editor's top right; support drop and paste.
- Signed-in owners create expiring, one-time or revocable links. Hide their
  name/avatar by default. A sealed link needs a click to open, so unfurlers
  cannot burn it; the owner's preview must not burn it. Use a documented DS
  transaction to claim once; check expiry on access and delete expired blobs
  then. The guide does not document ifRevision or blob TTL options: do not
  promise automatic idle cleanup or claim race safety without testing it.
- Centre a split create button reading “Create [one-time] link [with] my
  name for [1h] ▾”; crossing out those words toggles them without layout shift.
- Put pastes, theme and API keys in the avatar menu. Show keys once, store
  SHA-256 hashes, check ownership on every owner route. Add JSON/multipart
  HTTP creation and a small POSIX sh CLI using curl/jq. Read form files via
  request.formData() and arrayBuffer(); do not expose private files directly.
- Add safe file downloads, no-referrer/noindex, a Holm/source footer, and an
  optional footer feedback link only if I supply a feedback project.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 pastebin. With my approval, deploy with
holm @<peer> app deploy pastebin --spec-v1 --host pastebin.<my-domain>.
Never replace an occupied host or move an older-format app without asking.
Validation does not run the app: test uploads, expiry, revocation and two
simultaneous one-time opens, plus mobile/desktop in light/dark. Report gaps
honestly. Inspect the target settings schema before setting sign-in branding.
```

## The original requests

The app in this folder came from these messages, typed as-is to a coding
agent.

**Iteration 1**

> Build me a pastebin
> - it needs to be really aesthetic
> - light/dark/system themes
> - super good in UX
> - should be possible to paste content via api
> - should work in mobile/desktop
> - should have syntax highlighting
> - should enable one-time-keys, expiry, should be possible to share media
> - we will store an API key here after i make an account, so that when i say:
>   file something private, you can store there & give me a url: that i can
>   revoke, or onetime key? or an expiry, so that after a set time it becomes
>   unavailable
> - when sharing links, optionally, i can hide my credentials; by default is
>   hiding, i can make it with it so that my avatar / name can be seen
> - host in pastebin.zyt.app

**Iteration 2**, plus a message sent while the agent was working on it:

> Can we make the UI minimal?
> - get API keys & theme selector in Avatar popup?
> - Create Link button could be a segment button with the right segment a
>   button that opens a dropdown to select expiry something like:
>
>   `[Create _one_time_ Link _with_ my name for _1h_ \/ ]`
>
>   so that one time / with can be clicked to cross it off
> - why cross off: so that layout shift wont happen
> - attachment button should be just an icon at the top right part of the
>   input panel
> - if it makes sense, make the create link centered?
> - also update prompt with this one as the second iteration of the prompt

> Provide GH icon at the footer explaining that this is a holm-app & the source
> is in the repo
> - may holm icon & GH icon can be used nicely for a small nice footer

**Iteration 3**, again two messages, the second sent mid-work:

> Hey, pastebin is not doing markdown rendering properly?
> - thats the most common one; and i would like GFM

> There is a nice rendeirng style that Tailwind uses; i think its related to
> prose system or so, any chance we have such esqusite rendering?
> - also, i noticed that when I paste massive files the page scrolls
> - i wish the page to never scroll but the panel to only scroll

**Iteration 4** came from a request about the repository's store, not this
app; the listing was the agent's part of it:

> i want something that resembles Apple AppStore
> - so that each app gets its own page

Between iterations 4 and 5, this message changed only the README, which now
shows the node settings that give Holm's sign-in page pastebin's name, icon
and accent:

> Question:
> - the signin dialog is not showing the logo of the site but the logo of the node / holm
> - i believe there was a tinting too, that also seems to be not being applied

**Iteration 5**, after the feedback app had an API and an agent skill:

> I just set the env variable; can you add a feedback widget to pastebin?

The agent chose a footer link over the floating button, which would have
covered the create button on phones.

The build request uses the current public v1 reference and spells out the
repository's listing conventions. It does not require private docs or a
pre-existing app. The quoted messages explain the requested design; the
implementation details and original live testing were the agent's work.
