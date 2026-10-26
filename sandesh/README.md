# Sandesh

Send texts from your own Android phone, from any browser or from your own
scripts, on [Holm](https://holmhq.com). Sandesh (संदेश, "message") talks to
[SMS Gateway for Android](https://sms-gate.app) on your phone, so every text
goes out on your own SIM and plan, people see your own number, and their
replies come back to you. India's SMS rules are built in: Sandesh keeps a
personal SIM to personal texts.

It was built from the request quoted in [`PROMPT.md`](PROMPT.md), which also
has a reusable version of it.

## Holm App Spec v1

Sandesh follows [Holm App Spec v1](https://holmhq.com/llms-full.txt),
sections 9–12: `holm.json` holds identity and web settings, `web/` holds
public files, and `api/main.js` exports `default { fetch(request, env) }`. The
handler returns standard `Response` objects and uses `env.holm` for storage,
sign-in, outbound HTTP, secrets and realtime. `web.spa` is on; the node runs
no build. Every deploy needs `--spec-v1`. Only `web/` is served as files:
`api/` and `holm.json` are not public URLs.

## What it does

- **Connect a phone:** install SMS Gateway for Android, turn on its Cloud
  server, and paste the username and password it shows. Sandesh checks them
  with SMSGate, then keeps them encrypted. No phone handy? The demo phone
  pretends to send, so anyone can try everything first.
- **Conversations:** a list of everyone you've texted, with names you give
  numbers, unread replies and search. Each text you send gets a postmark
  when your phone reports it: sent, delivered (double ring), or returned
  when it failed. Live receipts come from your phone the moment they happen;
  without them Sandesh asks for news while it's open.
- **Writing:** a count of how many SMS a text takes (160 characters, or 70
  once Hindi or an emoji makes it Unicode), send to up to 10 numbers, pick
  a SIM on a dual-SIM phone, or schedule a text (your phone holds it).
  After 10 pm India time it offers to send at 8 am instead.
- **Templates:** texts you send often, with blanks such as `{#var#}` and
  `{#numeric#}` filled in each time. They're checked against the rules
  India's DLT system sets for business templates (at most 3 blanks of 30
  characters, at least 30% fixed text, links whitelisted), so one is ready
  to register if its use ever becomes a business one.
- **API keys:** for your own scripts, such as a server that texts you when
  it goes down. A key is shown once, can be held to a few numbers, and
  follows every limit the page does. An `Idempotency-Key` header makes
  retries safe.
- **India's rules:** see below. Every refusal says what rule it follows and
  what would be allowed instead.
- **Your data:** disconnect the phone (conversations stay), delete a
  conversation, or delete everything Sandesh keeps for you.

## India's rules, and what Sandesh does about them

A personal SIM is for person-to-person texts. Under TRAI's Telecom
Commercial Communications Customer Preference Regulations (TCCCPR 2018,
amended 12 Feb 2025 and 18 Sep 2026), commercial communication must come
from a DLT-registered sender: marketing, and also a business's OTPs, alerts
and reminders. From an ordinary number it is unsolicited commercial
communication. After 5 complaints in 10 days (or 3 plus an operator's AI
flag), every SIM in the sender's name is barred at every operator for 15
days; a repeat means disconnection and a one-year blacklist. Operators also
flag numbers that text many different people and hear back from few.

| Rule | What Sandesh does |
| --- | --- |
| Business texts need DLT | Asks you to confirm a text that reads like an offer or an OTP is personal; the API refuses it (`needs_dlt`) |
| "Bulk": >20 similar in 24 h, >100 in 7 days, >300 in 30 | Stops at those counts, comparing texts by their words |
| Many recipients, few replies get flagged | At most 10 numbers a text, 50 different people and 100 texts a day |
| Opt-outs must be honoured | A reply of STOP puts the number on your opt-out list; START takes it off |
| DLT templates: `{#var#}` blanks, ≤3, 30 chars, ≥30% fixed | Templates use the same blanks and checks |

Promotional texts may in practice only reach people from 10:00 to 21:00;
Sandesh doesn't send those at all. These are product guardrails, not legal
advice. Sources:
[TCCCPR 2018](https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf),
[Second Amendment 2025](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf),
[Third Amendment 2026](https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf),
[DPDP Rules 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

## How it is built

```text
holm.json               identity, web.spa, what stays out of deploy
holm.symbol.svg         app icon: a speech bubble with an envelope flap
holm.generated.json     record of the icons Holm generated from the symbol
api/main.js             every route: page, API (/api/v1) and webhooks (/hooks)
api/phone.js            connecting a phone, live receipts, the member's channel
api/gateway.js          SMSGate's cloud API, and the demo phone
api/messages.js         sending, conversations, receipts, replies, opt-outs by reply
api/guard.js            the daily and TRAI "bulk" limits
api/hooks.js            signed webhooks from the phone
api/keys.js             API keys (only a SHA-256 hash is kept)
api/lists.js            templates and the opt-out list
api/vault.js            encrypts each phone's sign-in under VAULT_KEY
api/sms.js              exact copy of web/src/sms.js
api/lib.js              small shared helpers
web/index.html          the page shell, with the saved theme applied before first paint
web/sw.js               network-first offline cache of the page's files
web/src/sms.js          numbers, SMS parts, similarity, business signals, templates
web/src/app.js          start-up, header, tabs, account menu, routing
web/src/views/          chats, templates, API, phone, and the signed-out page
web/src/composer.js     writing, templates, scheduling, SIM choice
web/src/postmark.js     the postmark drawn on each sent text
web/src/store.js        what the page knows, and catching up on receipts
web/src/live.js         live updates over /_ws
web/assets/fonts/       Anek (Latin and Devanagari), with its licence
web/vendor/lucide/      the Lucide licence; the icons are in web/src/icons.js
tools/check.mjs         release check for the text rules and the vault (not deployed)
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Outbound HTTP, `env.holm.net.fetch`:** every call to SMSGate's cloud
  (`https://api.sms-gate.app/3rdparty/v1`): devices, send, message state,
  and registering the phone's webhooks. The node's operator allows that one
  host for this app.
- **Runtime secrets, `env.holm.secrets`:** `VAULT_KEY`, from which the vault
  derives its keys. Without it, only the demo phone works.
- **Shared document store, `env.holm.app.ds`:** `phones`, `messages`,
  `threads`, `templates`, `optouts` and `apikeys`, every row tagged with its
  owner. Webhooks and API keys arrive without a session, so this is shared
  storage, and every query names the owner.
- **Key-value store, `env.holm.app.kv`:** each member's channel name, the
  per-minute counter, webhook envelopes already seen, and idempotent API
  answers (24 hours).
- **Realtime, `env.holm.realtime`:** a receipt or reply announces itself on
  the member's own channel, a name with a random secret that only they are
  given, and the page reloads that conversation.
- **Sign-in, `env.holm.auth`:** `/api/me` returns the member with
  `getLoginURL()` and `getLogoutURL()`. Sign-in happens on the node's own
  page; sign-out is a POST.
- **Web Crypto, `crypto.subtle`:** SHA-256 for API keys, HMAC-SHA256 for
  webhook signatures, and HKDF with AES-256-GCM for the vault.
- **`env.holm.web.fetch`:** serves everything else.
- **App identity:** `holm app identity generate` made the icons, manifest,
  social card and 404 page from `holm.symbol.svg`.

### Why not `env.holm.sms`

Holm has built-in SMS (`env.holm.sms.send`), through one provider
binding per node or per app that the operator sets up. That suits one phone
for the whole node, an operator's alerts for instance; section 6.7 of the
guide shows how. Sandesh's members each bring their own phone, so the app
holds each member's SMSGate sign-in itself and calls SMSGate directly.

### The vault

Each value is sealed with AES-256-GCM under a key that HKDF-SHA256 derives
from `VAULT_KEY`, with a fresh random 12-byte IV, and the member and field
it belongs to as additional data. A value moved to another member or
field, or altered, fails to open. This needs Holm 0.262 or later, the
first with AES and HKDF in its Web Crypto. Sandesh 0.1.0 had to build its
vault from HMAC alone; the values it sealed don't open in 0.1.1, so a
member who connected a phone with 0.1.0 connects it again.

### Code shared by the page and the server

The server can import only files under `api/`, and a deploy refuses
symlinks, so `api/sms.js` is a copy of `web/src/sms.js`. A letter is any
Unicode letter or combining mark (`[\p{L}\p{M}]`), so the vowel signs of
Indian scripts stay inside their words; Holm's JavaScript engine matches
these classes like Node's from 0.262. `node tools/check.mjs` fails if the
copies differ and checks 52 cases (numbers, SMS parts, similarity in five
scripts, business signals, opt-out words, templates, India time) and the
vault. `CASES` and `run()` are exported, so the same cases can run inside a
scratch app on a node to compare its answers with Node's.

## Deploy your own

```bash
node sandesh/tools/check.mjs
holm app validate --spec-v1 ./sandesh
holm @<peer> app deploy ./sandesh --spec-v1 --host sandesh.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Then, with the app id the deploy printed:

```bash
holm @<peer> net allow api.sms-gate.app --app <app-id>
holm @<peer> secret runtime set --app <app-id> VAULT_KEY "$(openssl rand -hex 32)"
```

Keep `VAULT_KEY` safe and don't change it: a new key can't open phone
sign-ins sealed with the old one, and members would have to connect their
phones again. Signing in needs a sign-in method enabled on the node (email
links or an OAuth provider). Live receipts need the app on HTTPS with a
real certificate, because the phone itself calls `/hooks/<token>`; on a
plain-HTTP test node, Sandesh asks SMSGate for news instead. After the first
deploy, inspect the settings schema and set the hosted sign-in page's
`settings.apps.<app-id>.brand.name` to `Sandesh`, `brand.icon_url` to
`/icon-192.png` and `theme.accent` to `#c3262e` on the peer.

To change the daily limits for your copy, edit `DAILY_TEXTS` and
`DAILY_PEOPLE` in `api/guard.js`. The TRAI "bulk" limits are the
regulation's own numbers.

## Known limits

- Texts and numbers pass through SMSGate's cloud service, a free,
  open-source relay that this app doesn't control. SMSGate also offers a
  private server and end-to-end encryption; Sandesh uses neither yet.
- Each member connects one phone. A phone that runs SMSGate under more than
  one account appears only under the one connected here.
- The business-message check reads words, so it can miss a promotion or
  question an innocent text. The person sending is still responsible for
  what they send; the API cannot be told a text is personal.
- Similar texts are compared by their words with numbers and links taken
  out; texts shorter than 20 letters (“ok”, “on my way”) aren't counted.
- Without live receipts, states update only while a page is open or an API
  call asks; with them, a receipt that never arrives is caught up when the
  conversation is opened.
- STOP and START are read in English only. Replies are kept as sent;
  pictures (MMS) aren't shown.
- Conversations are kept until you delete them; nothing expires on its own.

## Testing

`node tools/check.mjs` covers the text rules and the vault. On a scratch
node, `holm test create-session` makes a signed-in session for a member on
the app's exact host. Connect the demo phone and send to a few numbers: ones
ending in 0000 fail, ones ending in 9999 reply STOP. Try a text that reads
like an offer (the page asks; the API refuses), 21 similar texts (refused
with `bulk_limit`), an opt-out, a scheduled text and its cancelling, a
template with a bad blank, two members who can't see each other's data, and
an API key held to one number. Webhooks can be tested by signing a body
with `openssl dgst -sha256 -hmac <key>` over the body followed by the
timestamp: a wrong key, a stale timestamp and a repeat must all be refused
or skipped. Look at a phone and a desktop in light and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Anek, by the Anek Project Authors: SIL Open Font License 1.1, in
  [`web/assets/fonts/OFL-anek.txt`](web/assets/fonts/OFL-anek.txt).
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
- SMS Gateway for Android is a separate app with its own licence; Sandesh
  only calls its public API.
