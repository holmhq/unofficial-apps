# Ralk: how to reach the person

Ralk is a tab the person keeps open on the machine in front of them, often while you work in
a VM, a container or a server with no speaker of its own. What you send plays there at once:
a short sound, a browser notification, and, when you add a spoken line, Olivia's voice.
Think of it as tapping them on the shoulder, so use it when it saves them watching you.

## When to call it

- `notify_send` with kind `done` when a long task finished: a build, tests, a deploy, a
  migration, a large edit. Say what finished and the result in the title.
- kind `attention` when you are waiting on them: a permission prompt, an approval, a
  decision, a question only they can answer. Add a `say` line so they hear what you need
  without walking over.
- kind `error` when something failed and you stopped. Title: what failed; body: the one line
  that explains it.
- kind `question` when you can continue either way but want their preference.
- kind `start` (quietly) when you begin something that will take minutes, so they know to
  step away. kind `info` for anything else worth a glance.
- `say_send` for a spoken line with no sound of its own, such as a summary when they asked
  you to read something out, or a reply to a question they asked by voice elsewhere.
- `sounds_play` to play a sound and nothing else (a tick while a counter runs, a test).

Do not send a notification for every step. One when you start something long, one when it
needs them, one when it ends. A person can mute a noisy agent in seconds.

## Writing

- `title`: at most 80 characters, plain words, the fact first: "Tests passed: 212 of 212",
  "Deploy needs your approval", "Build failed on main". No Markdown.
- `body`: at most 300 characters of detail they would want before looking: the command, the
  file, the error's first line, what you will do next.
- `say`: at most 600 characters, written for the ear. One or two sentences, present tense,
  no code, no URLs, no file paths unless short. "The deploy to staging finished. Twelve
  tests failed in the billing module; I have stopped and left the log open." Numbers as
  words where that sounds natural. The voice reads exactly what you write.
- `project`: a short tag (up to 40 characters) when they run several things at once, such
  as the repository or app name; the app shows it on the card so they know which window
  to go to.
- `sound`: leave it out for the kind's default, which the person chose in the app. Pass a
  sound id from `sounds_list` for something specific, or `"none"` for silence (with `say`).

## What comes back

Every send answers with `listening`: how many of the person's devices have the app open
right now. Zero means nothing played; the notification is kept and shows as missed when
they next open Ralk. If that matters, say so in your reply to them.

A `say` line costs about $0.01 per thousand characters and takes two to five seconds to
make; the sound plays first, the voice follows. A line that was made before plays at once
and costs nothing, so a fixed phrase ("Build finished") is cheap to repeat. `me_get` shows
this month's usage; there is a monthly allowance.

## Tools

- `guide_get`: this guide.
- `me_get`: who you are, listening devices, the chosen voice and sounds, usage.
- `notify_send`: `{ title, body?, kind?, say?, sound?, project? }`.
- `say_send`: `{ text, project?, sound? }`.
- `sounds_list`: the kinds with their default sounds, and every sound with a name,
  a one-line description and its length.
- `sounds_play`: `{ sound }`.
- `history_list`: recent notifications and which devices heard them; use it to avoid
  repeating yourself after a reconnect.
