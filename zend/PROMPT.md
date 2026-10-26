# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Zend", an app for texting from your own Android phone, using only
https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12 and
"Make an app feel finished" and "Make it feel native" first. Make
holm.json, public web/ files and api/main.js exporting default
{ async fetch(request, env) }. Set web.spa true, use env.holm for storage,
sign-in, outbound HTTP, secrets and realtime, return standard Responses and
fall back to env.holm.web.fetch(request). No build step or third-party
runtime CDN; vendor the font and icons with their licences.

- After sign-in, each member connects their own phone running SMS Gateway
  for Android (https://sms-gate.app, cloud mode): they paste its username,
  password and, for live receipts, its webhook signing key. Check them
  against SMSGate's public API through env.holm.net, never show them again,
  and keep them encrypted under a VAULT_KEY runtime secret. Offer a demo
  phone that pretends to send, deliver and reply, so anyone can try it.
- Conversations per number, with names, unread replies, search, an SMS-part
  counter (GSM-7 and Unicode), up to 10 numbers per text, SIM choice,
  templates with blanks, and scheduled texts that can be cancelled. Show
  each text's state as ticks: sent, then delivered. Register the phone's
  webhooks and verify each one's HMAC signature, timestamp and envelope id.
- Keep a personal SIM personal, as India's SMS rules (TRAI's TCCCPR 2018 and
  its 2025 and 2026 amendments) require: a declaration when a phone is
  connected; texts that read like OTPs or offers need confirming on the
  page and are refused by the API; stop at TRAI's "bulk" counts of same or
  similar texts; cap texts and different people per day; honour STOP
  replies with an opt-out list. Templates use DLT's {#var#} blanks.
- API keys for the member's own scripts: shown once, stored as a hash,
  optionally held to a few numbers, with the same limits and an
  Idempotency-Key for safe retries.
- An exquisite UI that feels like Apple's Messages or Telegram, on a phone
  and on a desktop: a tab bar on phones, a rail with the conversation list
  beside the open conversation on wide screens, frosted bars, large titles,
  bubbles with tails and the time inside, sheets that slide up, a round
  avatar account button even when signed out, light/dark/auto, motion and
  quiet sounds. Installable, with a network-first service worker.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 zend. With my approval, deploy with
holm @<peer> app deploy zend --spec-v1 --host zend.<my-domain>, then ask
before allowing api.sms-gate.app for the app and setting VAULT_KEY. Never
replace an occupied host without asking. Validation does not run the app:
test the demo phone, every refusal, two members, API keys, and signed,
unsigned, stale and repeated webhooks, on mobile and desktop in light and
dark, and sign in and out as a real person would. Check that code shared by
the page and the server gives the same answers in both. Report gaps
honestly. Inspect the target settings schema before setting sign-in
branding.
```

## The original requests

Zend began as Sandesh, built from these messages, passed on to a coding
agent:

**Iteration 1**

> may be we will build a nice SMS sending app in unofficial? so that someone can sign-in there & configure their Android phone & send messages from that app? may be even have some API key or so? that they can use elsewhere? we need it to be done with absolutely awesome UI. and lets align it to Indian SMS rules/regulations, say the templates and all, so that its superb to use … get it out to be ready when the new docs/updates land

**Iteration 2**, choosing the name and how to publish it:

> name: Sandesh ; no need  to keep it private, just do it public in this repo and deploy to sandesh.zyt.app

**Version 0.1.1** needed no new request. Once Holm 0.262 added AES and
HKDF to its Web Crypto and matched Node on `\p{…}` classes, the vault moved
to AES-256-GCM and the text rules to Unicode letter classes, as the first
build had planned.

**Iteration 3**, a new design and a new name (0.2.0):

> How come the design is so pathetic? […] i wonder why the sign in is not always a round avatar button at the top

> tell it to tear down previous ui — we need an exquisite UI & UX that works super well in mobile and desktop

> show me some preview before full build

> Yes, the direction in UI (layout / functionality) is correct, but the refinement of UI is terrible. We need exceptional attention to detail. So make it so. And rename to Zend; and avoid the Indian-ising on design; make it more like apple-esque or Telegram like or Relay like […]
