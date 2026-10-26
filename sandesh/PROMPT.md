# Prompt

The public reference at <https://holmhq.com/llms-full.txt> teaches Holm App Spec
v1. Give the build request below to a coding agent with the `holm` CLI and a
node you control. The quoted messages later are history, not additional
instructions or sources.

## Build from scratch

```text
Build "Sandesh", an app for sending SMS from your own Android phone, using
only https://holmhq.com/llms-full.txt for Holm. Read its v1 sections 9–12
and "Make an app feel finished" and "Make it feel native" first. Make
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
  scheduled texts that can be cancelled, and states from sent to delivered
  shown as a postmark on each text. Register the phone's webhooks and verify
  each one's HMAC signature, timestamp and envelope id.
- Align it with India's SMS rules (TRAI's TCCCPR 2018 and its 2025 and 2026
  amendments): personal person-to-person texts only, with a declaration when
  a phone is connected; texts that read like OTPs or offers need confirming
  on the page and are refused by the API; stop at TRAI's "bulk" counts of
  same or similar texts (20 a day, 100 a week, 300 a month); cap texts and
  different people per day; honour STOP replies with an opt-out list.
  Templates use DLT's {#var#} blanks and are checked against its rules.
- API keys for the member's own scripts: shown once, stored as a hash,
  optionally held to a few numbers, with the same limits and an
  Idempotency-Key for safe retries.
- An absolutely awesome, phone-first UI with an Indian postal feel: inland
  letter blue, letterbox red, violet postmark ink, a font that covers
  Devanagari, light/dark/system themes, installable with a network-first
  service worker.
- For this repository's store, use holm.json version, holm.symbol.svg (one
  black path, no strokes, 0 0 24 24) and listing/listing.json with subtitle,
  category, description, whatsNew and sample screenshots. These are repo
  conventions, not a catalog format promised by the Holm guide.

Run holm app validate --spec-v1 sandesh. With my approval, deploy with
holm @<peer> app deploy sandesh --spec-v1 --host sandesh.<my-domain>, then
ask before allowing api.sms-gate.app for the app and setting VAULT_KEY.
Never replace an occupied host without asking. Validation does not run the
app: test the demo phone, every refusal, two members, API keys, and signed,
unsigned, stale and repeated webhooks, on mobile and desktop in light and
dark. Check that code shared by the page and the server gives the same
answers in both. Report gaps honestly. Inspect the target settings schema
before setting sign-in branding.
```

## The original requests

Sandesh was built from these messages, passed on to a coding agent:

**Iteration 1**

> may be we will build a nice SMS sending app in unofficial? so that someone can sign-in there & configure their Android phone & send messages from that app? may be even have some API key or so? that they can use elsewhere? we need it to be done with absolutely awesome UI. and lets align it to Indian SMS rules/regulations, say the templates and all, so that its superb to use … get it out to be ready when the new docs/updates land

**Iteration 2**, choosing the name and how to publish it:

> name: Sandesh ; no need  to keep it private, just do it public in this repo and deploy to sandesh.zyt.app

**Version 0.1.1** needed no new request. Once Holm 0.262 added AES and
HKDF to its Web Crypto and matched Node on `\p{…}` classes, the vault moved
to AES-256-GCM and the text rules to Unicode letter classes, as the first
build had planned.
