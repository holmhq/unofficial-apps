# relay

A private messenger for the people on your [Holm](https://holmhq.com) node.
Pick a username, add friends by theirs, and chat one to one or in groups, with
photos, files and link previews. Messages, typing and unread counts arrive
live.

[`PROMPT.md`](PROMPT.md) has a request that builds it from scratch.

## Holm App Spec v1

relay follows [Holm App Spec v1](https://holmhq.com/llms-full.txt), sections
9–12: `holm.json` holds identity and web settings, `web/` holds public files,
and `api/main.js` exports `default { fetch(request, env) }`. `web.spa` is on;
the node runs no build. Every deploy needs `--spec-v1`. Only `web/` is served
as files: `api/` and `holm.json` are not public URLs.

The server code predates v1. `api/main.js` turns each `/api/` request into
the older request object and hands it to `api/_legacy_main.js` through
`api/_holm.js`; every other path goes to `env.holm.web.fetch(request)`. Those
two private modules are migration scaffolding. A new app should write its
routes in `fetch(request, env)` directly, as the prompt asks.

## What it does

- **Usernames:** after signing in, you claim a username (3–24 of a–z, 0–9 and
  `_`). It suggests one from your name, with accents dropped.
- **Invites that reveal nothing:** add someone by username and the reply is
  the same whether or not the name exists. They see the invite under Friends
  and accept, decline or block; you learn only when they accept. An invite to
  a name nobody has yet waits until someone claims it.
- **Email invites:** a one-time join link, valid for 14 days, for a friend who
  isn't on Relay yet. Twenty a day per person.
- **Chats:** one-to-one rooms and groups. A group's creator invites people by
  username and can give it a handle, so it lives at `/chat/group/<handle>`.
  Anyone can leave.
- **Messages:** text up to 8,000 characters. Reply from the menu or by swiping
  a message right; the quote jumps to the original. Copy, forward to another
  chat, or delete for everyone, which also clears quotes of it.
- **Files:** photos shrink in the browser to 2,048 px before they upload (iPhone
  HEIC becomes JPEG), and the server keeps a 1,280 px copy and a preview.
  Videos, audio and any other file go as they are, up to 16 MB.
- **Link previews:** the server fetches the page's title, description and image
  and serves the image itself, so the linked site never sees the reader.
- **Live:** new messages, deletions, typing and unread counts arrive over
  realtime, in every open tab and device. Unread counts are exact: each
  member keeps a read watermark that only moves forward.
- **Contacts:** your own nickname and photo for anyone, seen only by you.
- **Notifications:** an alert for a new message while Relay is open in the
  background, and the unread count on the installed app's icon.
- **Make it yours:** profile name and photo, light, dark or auto theme, six
  accent colours, and quiet send and receive sounds.
- **Installable:** a web manifest, and a service worker that keeps the app
  shell for offline starts. It never caches `/api/` answers.
- Settings has Send feedback, an Analytics link for the app's admins, and an
  "A Holm app" footer.

## How it is built

```text
holm.json               identity, web.spa, store listing exclusion
holm.symbol.svg         app icon: two speech bubbles, one typing
holm.generated.json     record of the icons generated from the symbol
api/main.js             v1 entry: /api/ to the older handler, the rest to web/
api/_holm.js            binds env.holm per request for the older code
api/_legacy_main.js     the API router
api/lib.js              storage keys, auth gates, the per-member channel
api/profiles.js         /api/me, usernames, profile name and photo
api/invites.js          username and email invites, accept, decline, block
api/rooms.js            chat list, groups, handles, read watermarks
api/messages.js         history, send, reply, forward, delete, typing
api/attachments.js      file uploads and downloads
api/contacts.js         nicknames and photos for contacts
api/previews.js         link previews and their images
web/index.html          the page shell and the feedback embed tag
web/sw.js               service worker: app shell, notification taps
web/src/main.js         start-up, shell, router, realtime and notifications
web/src/pages/          chats, chat, add, friends, settings, onboarding
web/src/realtime.js     the /_ws client: reconnects and resubscribes
web/src/styles.css      the whole look: tokens, light/dark, accents, layout
web/src/icons.js        Lucide icons, baked in
web/assets/             Inter, vendored, with its licence
web/vendor/             the feedback embed and the Lucide licence
listing/                store listing and screenshots (not deployed)
```

The Holm primitives it uses, all described in
<https://holmhq.com/llms-full.txt>:

- **Key-value store, `env.holm.app.kv`:** profiles and usernames, invites,
  rooms, each member's chat list, read watermarks, blocks, nicknames and the
  per-member channel names. `kv.increment` keeps unread counts atomic.
- **Document store, `env.holm.app.ds`:** the `messages` collection, read a page
  at a time by room.
- **Object storage, `env.holm.app.s3`:** attachments, profile and contact
  photos, and cached preview images.
- **Images, `env.holm.image`:** `resize` and `thumbnail` for photos.
- **Sign-in, `env.holm.auth`:** every route checks the member;
  `getLoginURL` comes back with a 401.
- **Realtime, `env.holm.realtime`:** see below.
- **Outbound HTTP, `env.holm.net.fetch`:** link previews, with literal
  private and metadata addresses refused.
- **Email, `env.holm.email.send`:** email invites.
- **Identity:** `holm app identity generate relay` draws every icon, the web
  manifest and the social card from `holm.symbol.svg` on the `themeColor`.

### Realtime

The server sends each member's events on that member's own channel, never on
a channel per room, so knowing a room's id is not enough to listen in. In v1,
a `private:` channel admits only the app's operators, and the guide lists
`realtime.grant` as not available yet. Relay therefore uses a plain channel
whose name holds 128 random bits, `relay-<secret>`, made once per member and
handed out only by `/api/me` to that member. The name works like a bearer
token. Anyone who learned it could read that member's live events until it
changes, and the node's own logs may record it. Once v1 offers grants, move to
`private:` channels.

## Deploy your own

```bash
holm app validate relay --spec-v1
holm @<peer> app deploy relay --spec-v1 --host relay.<your-domain>
```

Check the peer and that the host is unused first. To ship a change, run the
same deploy with `--force`. Members need a sign-in method on the node (email
links or an OAuth provider). With the app id printed by the deploy:

- **Email invites** need the node's email provider and the app's permission
  to send: `holm @<peer> policy set email.app_send true --app <app-id>`.
- **Link previews** fetch any public site, so the app needs
  `holm @<peer> net allow-any --app <app-id>`. Without it, links show as plain
  addresses.
- **Feedback:** Settings → Send feedback opens a form from the owner's
  [feedback](../feedback/) app through a local copy of its `embed.js`. Set
  `data-project` and `data-origin` in `web/index.html` to your own project, or
  remove that tag. The site must be allowed to frame it:
  `holm @<peer> policy set security.csp.frame_src "https://feedback.example.com" --app <app-id>`.
- **Sign-in branding:** inspect the settings schema, then set
  `settings.apps.<app-id>.brand.name` to `Relay`, `brand.icon_url` to
  `/icon-192.png` and `theme.accent` to `#6a3fe0` on the peer.

## Known limits

- Notifications need the page to be open. Holm has no Web Push yet, so a
  closed Relay can't alert anyone.
- Live events travel on a secret-named plain channel until v1 has realtime
  grants (see Realtime).
- Messages are stored as plain text in the app's storage, so the node's
  operator can read them. There is no end-to-end encryption.
- No message editing, reactions, read receipts or voice recording.
- A file is at most 16 MB, the most a node parses as one form file.
- Desktop shows the phone layout in a centred column.

## Testing

On a scratch node, `holm test create-user` and `holm test create-session
--host <exact host:port>` give two or more members a session each. Open two
browser contexts, claim usernames, send an invite and accept it. Then check
that a message, a typing indicator and an unread count arrive in the other
context without a reload. Check a group, a reply, a delete and an upload too,
on a phone and a desktop in light and dark.

## Licenses

- App code: MIT, like the rest of this repository.
- Inter: SIL Open Font License 1.1, in
  [`web/assets/OFL-inter.txt`](web/assets/OFL-inter.txt).
- Lucide icons: ISC, with those from Feather under MIT, in
  [`web/vendor/lucide/LICENSE`](web/vendor/lucide/LICENSE).
- The feedback embed is this repository's own [feedback](../feedback/) app
  (MIT).
- The icon was drawn for Relay and has no third-party parts.
