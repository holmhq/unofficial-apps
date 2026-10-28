# Ralk

Your agents, out loud. Ralk is a tab you keep open on the machine in front of
you while Claude Code works somewhere with no speaker: a VM, a container, a
server. Claude connects to it over MCP and, when a build finishes, a deploy
needs your approval or a test run fails, Ralk plays a short sound, shows a
browser notification, and, if Claude adds a line, reads it out in Olivia's
voice. It runs on [Holm](https://holmhq.com).

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also has
a reusable version of it. Try it at [ralk.zyt.app](https://ralk.zyt.app).

## Holm App Spec v1

Ralk follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings (`web.spa` is on), `web/`
holds public files, and `api/main.js` exports `default { fetch(request, env) }`
and the handlers of the named operations in `api/contract.json`. Every deploy
needs `--spec-v1`; the node runs no build. Only `web/` is served as files:
`api/` and `holm.json` are not public URLs.

## What it does

- **Claude over MCP.** Connect Claude, Claude Code or ChatGPT to
  `https://<your-host>/_holm/mcp`. Its tools: a guide on when to notify and
  how to write for the ear, `notify_send` (a kind, a title, a body, an
  optional spoken line, a project tag), `say_send` (a spoken line on its
  own), `sounds_play`, `sounds_list`, `me_get` (how many devices are
  listening, the voice, this month's usage) and `history_list`. Every send
  answers with how many devices played it; zero means it shows as missed.
- **Six kinds, each with a sound.** Done, needs you, question, problem, note
  and started. Each has a default sound you can change; Claude can also name
  any sound in the library, or none.
- **52 sounds made from code.** The sound effects are
  [earshot](https://github.com/Leonxlnx/earshot)'s forge bank, rendered in the
  browser by [earshotjs](web/vendor/earshot/) in a worker the first time each
  is needed: chimes, pops, ticks, keys, swishes, hits, swells and risers. No
  audio files are downloaded.
- **A voice from fal.ai.** Spoken lines use Inworld TTS on fal.ai
  (`fal-ai/inworld-tts`, Olivia by default, any of its 110 built-in voices),
  about $0.01 per thousand characters from the node owner's key. A line is
  made once: the same words in the same voice play again from storage and
  cost nothing. Each person has a monthly allowance.
- **Live on every device.** Each person has a secret realtime channel; every
  open tab plays the sound at once, shows a browser notification when the tab
  is in the background, and, as the voice is ready a few seconds later, plays
  that too. Tabs in one browser elect one to play, so nothing plays twice.
  The card says which devices heard it.
- **The app.** Live: whether this device is listening, a test to send
  yourself, and the feed. Sounds: the volume, the sound for each kind, the
  library with a play button on every row. Voice: pick a voice with a sample,
  say something yourself, this month's usage. Connect: the address and prompts
  to try. Signed out, the landing page plays the sounds without an account.

### How it feels

Like a native app, the window never scrolls: a frosted bar on top, one panel
that scrolls under it with no scroll bars, a tab bar at the bottom on a phone
and a sidebar on a desk. Apple-like greys, one violet accent, Inter at sizes
that mean something, light and dark. A round avatar button at the top right,
signed out too, with the theme, a sounds switch and notifications. Cards rise
in and flash their kind's colour when they land; a live dot pulses while the
link is up; four bars dance on the card that is playing; the theme changes in
a circle from where you tapped.

## How it's built

```text
api/main.js        tiny entry: loads http.js and ops.js with import()
api/contract.json  Claude's 7 tools (auth "user"; each sees only the caller's own notes)
api/http.js        the web app's JSON API and the voice file routes
api/ops.js         the named operations
api/notes.js       notifications, the voice pipeline, the storage cache
api/people.js      a person's channel, preferences and usage
api/fal.js         fal.ai's queue: submit, status, result, copy
api/catalog.js     the kinds, the sounds and the voices
api/guide.md       what Claude reads first (guide_get)
web/src/           the app: inbox.js (receiving and playing), audio.js (Web Audio and the
                   sound worker), views/ (live, sounds, voice, connect, landing)
web/vendor/earshot earshotjs, the sound bank as one ES module
```

Holm primitives it uses:

- **`env.holm.app.ds`** for people and notes; **`env.holm.app.kv`** for the
  voice cache (sha256 of voice and text → file), daily counters, poll locks
  and the app's origin; **`env.holm.app.s3`** for the voice files.
- **`env.holm.auth`** for sign-in and sign-out; accounts are the node's.
- **Named operations** in `api/contract.json`, projected by Holm as MCP tools
  at `/_holm/mcp`, with `auth: "user"` and `limits.rate` on the sends.
- **`env.holm.realtime.broadcast`** on an unguessable per-person channel, and
  **`realtime.count`** to tell Claude how many devices are listening.
- **`env.holm.net.fetch`** to fal.ai's queue and, with `responseType: "file"`,
  to copy the finished audio into storage without it passing through
  JavaScript; **`env.holm.secrets`** for the fal.ai key.
- **`env.holm.web.fetch`** for the pages; `holm app identity generate` for the
  icons, manifest and social card from `holm.symbol.svg`.

The voice pipeline is shaped by two facts of the v1 runtime. Named operations
run without `env.holm.secrets`, so a line that Claude queues is submitted to
fal.ai by the first device that polls it, through the web route that has the
key. And a request has about five seconds, so no request does more than one
outbound call: the browser polls once a second, plays the finished file
straight from fal.ai, and then asks the server to keep a copy, keyed by the
text and voice, for replays and repeats.

## Deploy your own copy

```bash
holm app validate --spec-v1 ralk
holm @<peer> app deploy ralk --spec-v1 --host ralk.<your-domain>
```

Add `--force` when redeploying. Then give the app its fal.ai key and let it
reach fal.ai (the key is used only by the app's server code and never sent
to the browser):

```bash
holm @<peer> secret runtime set FAL_KEY <your fal.ai key> --app <app-id>
holm @<peer> net allow queue.fal.run --app <app-id>
holm @<peer> net allow fal.media --app <app-id> --timeout 3500
holm @<peer> net allow '*.fal.media' --app <app-id> --timeout 3500
```

Without the key, sounds and notifications work and spoken lines say why they
did not. Then set the sign-in page's presentation and the link-preview card
for the new app id, after checking the settings schema on your node:

```bash
holm @<peer> settings set settings.apps.<app-id>.brand.name Ralk
holm @<peer> settings set settings.apps.<app-id>.brand.icon_url /icon-192.png
holm @<peer> settings set settings.apps.<app-id>.brand.social_preview_url /social_preview.png
holm @<peer> settings set settings.apps.<app-id>.theme.accent '#6d4cf2'
```

**Feedback:** Send feedback opens Ralk's form on the owner's
[feedback](../feedback/) app through a local copy of its `embed.js`
(`web/vendor/feedback/`). Set `FEEDBACK_PROJECT` in `web/src/shell.js` to your
own project, or leave it empty to hide the link. The site must be allowed to
frame the form:

```bash
holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>
```

Sign in, open Connect, and add the address to Claude: Settings → Connectors →
Add custom connector; or in Claude Code,
`claude mcp add --transport http ralk https://ralk.<your-domain>/_holm/mcp`.

## Known limits

- **Browsers play sound only after a tap.** One tap on the page arms it for
  the visit; until then cards and notifications show and the status card says
  so. Installed as an app (Add to Home Screen), Chrome and Safari need no tap.
- **A tab must be open.** Nothing is pushed to a closed browser; a
  notification sent with no device listening is kept and shows as missed.
- **iPhone Safari** shows no browser notifications unless Ralk is installed to
  the Home Screen, and plays nothing while the phone is locked.
- **The voice takes a few seconds** (two to five, after the sound) and needs
  fal.ai to be reachable from the node. A line that fails says why on its
  card. Lines are at most 600 characters; 300 a day and 200,000 characters a
  month per person (ten times that for the app's admins).
- **History** keeps the newest 500 notifications per person. Voice files stay
  in storage for later replays and are not removed with the history.
- No pushes to closed browsers, no per-project channels, no screen or
  microphone sharing yet.

## Licences

- [Inter](https://rsms.me/inter/): SIL Open Font License 1.1, in
  `web/fonts/OFL-inter.txt`.
- Icons from [Lucide](https://lucide.dev): ISC, in `web/vendor/lucide/LICENSE`.
- `web/vendor/earshot/earshot.js` is earshotjs, a port of
  [earshot](https://github.com/Leonxlnx/earshot)'s forge sounds: MIT, in
  `web/vendor/earshot/LICENSE`, with its notices for numpy, scipy and PCG.
- `web/vendor/feedback/embed.js` is a copy of the feedback button from this
  repository's [feedback](../feedback/) app, under this repository's licence.
  Ralk's mark is its own.
