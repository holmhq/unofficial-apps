# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted message later is history, not an additional
instruction or source.

## Build from scratch

```text
Port the MIT-licensed 3dsvg editor (https://github.com/renatoworks/3dsvg),
which turns SVGs, text and pixel art into interactive 3D, to a Holm app
named "3dsvg", using only https://holmhq.com/llms-full.txt for Holm. Read
its v1 sections 9–12 and "Make an app feel finished" and "Make it feel
native" first. Make holm.json, public web/ files and api/main.js exporting
default { async fetch(request, env) }. Set web.spa true, use env.holm for
storage and sign-in, return standard Responses and fall back to
env.holm.web.fetch(request). No build step or third-party runtime CDN:
rewrite the React Three Fiber scene in plain three.js, load it through an
import map, and vendor three.js, opentype.js, ffmpeg.wasm and the fonts
with their licences, keeping 3dsvg's licence and credit.

- Keep the editor as it is: the four inputs, every setting, the PNG, video
  (with trimming and MP4 or WebM through ffmpeg.wasm) and 3D model exports,
  the embed code, and the same look. Fix what you find on the way.
- Signed out, keep the design in localStorage. Add sign-in: a round avatar
  at the top right whose menu holds Light, Dark or System, Send feedback
  and Sign out.
- Signed in, Save keeps a shape in member storage with a thumbnail. My
  shapes lists them to open, rename and delete. Mark unsaved changes.
- Any saved shape can get a revocable read-only share link, copied into
  shared storage under a random token and refreshed on each save. Its page
  shows the shape alone with "Edit a copy", and its own link-preview tags.
- Phones first, light and dark, installable with a network-first service
  worker that never caches member data or the video converter.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 3dsvg. With my approval, deploy with
holm @<peer> app deploy 3dsvg --spec-v1 --host 3dsvg.<my-domain>. Never
replace an occupied host without asking. Validation does not run the app:
test every input and export, a video conversion, two members' saves kept
apart, a share link signed out and after it is turned off, and mobile and
desktop in light and dark. Report gaps honestly. Inspect the target
settings schema before setting sign-in branding.
```

## The original request

3dsvg was ported from its public repository, from this message, typed as-is
to a coding agent:

> Can we adapt this in: https://github.com/renatoworks/3dsvg
> - may be add a sign-in system to save shapes?
> - round avatar icon at the top right?

The agent then asked three questions, and these options were picked: for the
name, "Keep 3dsvg"; for saving, "Private + share link (Recommended)"; for
video, "Full parity".
