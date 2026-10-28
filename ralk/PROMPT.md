# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not additional
instructions or sources.

## Build from scratch

```text
Build "Ralk" (Remote Talk), an app that lets Claude reach the person out loud,
using only https://holmhq.com/llms-full.txt for Holm. Read its v1 sections
9–12, "Use your app from ChatGPT or Claude", "Realtime", "Make an app feel
finished" and "Make it feel native" first. Make holm.json (web.spa true),
public web/ files and api/main.js exporting default { fetch(request, env) },
plus named operations that Holm projects as MCP tools. No build step or
third-party runtime CDN; vendor Inter with its licence.

Why: Claude Code runs in a VM or a container with no speaker. The person keeps
a Ralk tab open on the machine in front of them; what Claude sends plays
there.

- Sign in with the node's accounts. Each person gets a secret realtime channel
  that every tab they have open subscribes to, with reconnects.
- Claude's tools (auth "user", each acting only on the caller's own data):
  a guide on when to notify and how to write for the ear; notify_send with a
  kind (done, attention, question, error, info, start), a title, a body, an
  optional spoken line and a project tag; say_send for a spoken line alone;
  sounds_play; sounds_list; me_get (listening devices, voice, usage);
  history_list. Every send answers with how many devices are listening.
- Sounds are made from code in the browser, not downloaded: vendor earshotjs
  (MIT) and render in a worker. Six kinds with default sounds the person can
  change; a library with a play button on every row; a volume for the device.
- Voice: fal.ai's Inworld TTS through env.holm.net.fetch with an app-scoped
  runtime secret, Olivia by default, any built-in voice with a sample. Queue
  the line, let the browser poll once a second, play the finished file as
  soon as fal.ai has it, then copy it into storage keyed by text and voice so
  a repeated line is instant and free. A monthly allowance per person.
- When a note arrives: the kind's sound plays at once, a browser notification
  shows if the tab is not in front, the voice follows, and the card records
  which device heard it. Tabs in one browser elect one to play.
- Apple-quality UI on phone and desktop, light and dark, with a round avatar
  button top right (signed out too). Native-like: the window never scrolls,
  bars stay fixed, panels scroll with no scroll bars, a tab bar on phones and
  a sidebar on desks, meaningful motion. Signed out, a landing page that plays
  the sounds without an account.
- For this repository's store, use holm.json version, holm.symbol.svg and
  listing/listing.json with sample screenshots. These are repo conventions,
  not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 ralk. With my approval, deploy with
holm @<peer> app deploy ralk --spec-v1 --host ralk.<my-domain>, set the FAL_KEY
secret and allow queue.fal.run and fal.media for the app. Test every tool
over HTTP, a note landing in an open tab with its sound and voice, two people
seeing only their own, phone and desktop, light and dark.
```

## The original request

Ralk was built from this message, passed to a coding agent (folder paths
replaced):

> Lets build a new app:
> - Ralk: Remote Talk
> - this app will have a FAL API key
> - then we will pick a decent TTS engine thats very cheap
> - folks can sign-up in it & connect their account via remote mcp to claude/chatgpt
> - the app can then generate the auido and play it
> - this app can also get a bunch of common sfx
>
> Rationale:
> - folks working in a VM via claude code with numerous parallel projects need some audio notifications
> - depending up on need we can then issue notifications to this app, so that it will play it
> - its hard to make audio work in hostmachine from vm
> - this is an elegant simple to do app that can generate browser notifications, audio sfx, and event tts notifications as per what claude things
> - later we can extend it to have screenshare option so that, claude can request that so that it can look at something in the hostmachine?
> - take sampled screenshots and look or so?
> - accept micro phone audio
> - but for now lets focus on notifications
>
> Design:
> - make it super aesthetic
> - with nice ui / ux / functional flow
> - make it like a native app
> - no page scrolls
> - only panels scrolls
> - works in mobile (skip if impossible)
> - uses nice motion that makes sense
> - spend significant time polishing the ui with exceptional attention to detail
>
> I think this design style can be used in many apps, make this default for this repo unless specified
> - hope you can pick some nice sfx from [an earshot port in another folder]
> - and I will provide you a FAL key in .env
> - I think we picked Olivia sound in [another app] i feel its cheap enough
>
> Dont stop until you launch it in ralk.zyt.app
